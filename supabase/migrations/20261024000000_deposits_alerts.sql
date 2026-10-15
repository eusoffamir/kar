-- Second goals round:
--   1. Kar holds the deposit. It's paid with the booking and refunded automatically when the claim window
--      closes, minus any late fee and approved damage, which go to the owner with their payout. Claims and
--      late fees become enforceable for both sides (before, the deposit was cash with the owner).
--   2. Refunds run on their own every 10 minutes (deposits due, plus any refund still waiting), so nothing
--      depends on someone opening the app or the admin screen.
--   3. Misuse alerts for owners: the car seems to have left Peninsular Malaysia, or is driven over 130 km/h.
--   4. Kar's team is notified when an ID, operator documents, a car or a disputed claim needs them.
--   5. Rental operators apply in the app (permit and insurance); Kar's approval makes them an owner.

-- ---------------------------------------------------------------------------
-- 1. Deposit held by Kar
-- ---------------------------------------------------------------------------
-- 'held' = paid to Kar with the booking (new bookings). 'with_owner' stays for older bookings paid in cash.
alter type deposit_status add value if not exists 'held';

alter table bookings
  add column deposit_refund numeric(10,2),       -- what went back to the customer
  add column deposit_to_owner numeric(10,2);     -- late fee + approved damage, paid to the owner

create or replace function public.bookings_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare c cars; ps platform_settings; hrs numeric; cust profiles;
begin
  select * into ps from platform_settings;
  select * into c from cars where id = new.car_id;
  if c is null or not (c.is_listed and c.is_approved) then
    raise exception 'Car is not available';
  end if;
  new.owner_id := c.owner_id;
  if new.customer_id = c.owner_id then
    raise exception 'You cannot book your own car';
  end if;
  select * into cust from profiles where id = new.customer_id;
  if cust.is_blacklisted then
    raise exception 'Account is not allowed to book';
  end if;
  if cust.verification not in ('verified', 'pending') then
    raise exception 'Verify your ID to book';
  end if;
  if new.rules_accepted_at is null then
    raise exception 'Accept the house rules to book';
  end if;
  if exists (select 1 from owner_blocks where owner_id = c.owner_id and customer_id = new.customer_id) then
    raise exception 'This owner is not accepting bookings from you';
  end if;
  if exists (
    select 1 from availability_blocks b
    where b.car_id = new.car_id
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'Car is unavailable for the selected time';
  end if;
  hrs := extract(epoch from (new.ends_at - new.starts_at)) / 3600;
  if hrs < c.min_hours then
    raise exception 'Minimum booking is % hours', c.min_hours;
  end if;
  if new.starts_at < now() - interval '5 minutes' then
    raise exception 'Start time is in the past';
  end if;

  -- Never trust prices from the client. The deposit is paid to Kar with the booking and refunded after the trip.
  new.status := 'pending_payment';
  new.expires_at := now() + ps.unpaid_booking_ttl;
  new.trip_amount := public.trip_price(c.price_per_hour, c.price_per_day, new.starts_at, new.ends_at);
  new.customer_fee := greatest(round(new.trip_amount * ps.customer_fee_rate, 2), ps.min_customer_fee);
  new.owner_commission := round(new.trip_amount * ps.owner_commission_rate, 2);
  new.deposit := c.deposit;
  new.deposit_status := 'held';
  new.total_charged := new.trip_amount + new.customer_fee + new.deposit;
  new.owner_payout := new.trip_amount - new.owner_commission;
  new.late_fee_due := 0;
  new.cancellation_fee := 0;
  return new;
end $$;

-- Customer cancels: trip price back (minus a late-cancellation fee), the whole deposit back, booking fee kept.
create or replace function public.cancel_booking(b_id uuid, reason text) returns numeric
language plpgsql security definer set search_path = public as $$
declare b bookings; ps platform_settings; fee numeric := 0; refund numeric := 0;
begin
  select * into ps from platform_settings;
  select * into b from bookings where id = b_id and customer_id = auth.uid()
    and status in ('pending_payment', 'requested', 'confirmed');
  if b is null then raise exception 'Booking cannot be cancelled'; end if;
  if b.status <> 'pending_payment' then
    if b.status = 'confirmed' and b.starts_at - now() < ps.late_cancel_window then
      fee := round(b.trip_amount * ps.late_cancel_rate, 2);
    end if;
    refund := b.trip_amount - fee + case when b.deposit_status::text = 'held' then b.deposit else 0 end;
  end if;
  update bookings set status = 'cancelled', cancel_reason = coalesce(reason, 'customer_cancelled'),
    cancelled_by = 'customer', cancellation_fee = fee, refund_amount = refund
  where id = b_id;
  if refund > 0 then
    insert into payments (booking_id, user_id, type, amount, status) values (b_id, b.customer_id, 'refund', refund, 'pending');
  end if;
  return refund;
end $$;

create or replace function public.mark_no_show(b_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; ps platform_settings; fee numeric; refund numeric;
begin
  select * into ps from platform_settings;
  select * into b from bookings where id = b_id and owner_id = auth.uid() and status = 'confirmed';
  if b is null then raise exception 'Booking cannot be marked as no-show'; end if;
  if now() < b.starts_at + ps.no_show_after then raise exception 'Wait 60 minutes after the start time'; end if;
  fee := round(b.trip_amount * ps.late_cancel_rate, 2);
  refund := b.trip_amount - fee + case when b.deposit_status::text = 'held' then b.deposit else 0 end;
  update bookings set status = 'no_show', cancelled_by = 'no_show', cancellation_fee = fee, refund_amount = refund
  where id = b_id;
  insert into payments (booking_id, user_id, type, amount, status) values (b_id, b.customer_id, 'refund', refund, 'pending');
end $$;

-- Settles a deposit Kar holds: the owner gets the late fee plus approved damage (never more than the deposit),
-- the customer gets the rest back through CHIP. Runs once per booking.
create or replace function public.settle_deposit(b_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; damage numeric; to_owner numeric; back numeric;
begin
  select * into b from bookings where id = b_id for update;
  if b is null or b.deposit_status::text <> 'held' or b.status not in ('returned', 'closed') then return; end if;
  if exists (select 1 from claims where booking_id = b_id and status in ('open', 'reviewing')) then return; end if;
  select coalesce(sum(amount), 0) into damage from claims where booking_id = b_id and status = 'approved';
  to_owner := least(b.deposit, b.late_fee_due + damage);
  back := b.deposit - to_owner;
  update bookings set
    deposit_status = (case when to_owner > 0 then 'deducted' else 'returned' end)::deposit_status,
    deposit_to_owner = to_owner, deposit_refund = back
  where id = b_id;
  if back > 0 then
    insert into payments (booking_id, user_id, type, amount, status, raw)
    values (b_id, b.customer_id, 'refund', back, 'pending', jsonb_build_object('reason', 'deposit'));
  end if;
end $$;
revoke execute on function public.settle_deposit(uuid) from public, anon, authenticated;

-- Owner confirms there's no damage: the deposit is settled now (any late fee still goes to them).
create or replace function public.set_deposit_returned(b_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  if exists (select 1 from claims where booking_id = b_id and status in ('open', 'reviewing')) then
    raise exception 'Resolve the open claim first';
  end if;
  select * into b from bookings where id = b_id and owner_id = auth.uid() and status in ('returned', 'closed');
  if b is null then raise exception 'Deposit cannot be updated'; end if;
  if b.deposit_status::text = 'held' then
    perform public.settle_deposit(b_id);
  elsif b.deposit_status = 'with_owner' then
    update bookings set deposit_status = 'returned' where id = b_id;
  else
    raise exception 'The deposit has already been settled';
  end if;
end $$;

create or replace function public.create_claim(b_id uuid, description text, amount numeric, evidence text[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare b bookings; ps platform_settings; new_id uuid;
begin
  select * into ps from platform_settings;
  select * into b from bookings where id = b_id;
  if b is null or b.owner_id <> auth.uid() then raise exception 'Booking not found'; end if;
  if b.status not in ('returned', 'closed') then raise exception 'Claims open after the car is returned'; end if;
  if now() > b.returned_at + ps.claim_window then raise exception 'The 48-hour claim window has closed'; end if;
  if b.deposit_status::text not in ('with_owner', 'held') then raise exception 'The deposit has already been settled'; end if;
  if amount <= 0 or amount > b.deposit then raise exception 'Claim must be between RM1 and the deposit (RM%)', b.deposit; end if;
  if coalesce(length(trim(description)), 0) < 5 then raise exception 'Describe the damage'; end if;
  if exists (select 1 from claims where booking_id = b_id and status in ('open', 'reviewing')) then
    raise exception 'A claim is already open for this trip';
  end if;
  insert into claims (booking_id, raised_by, description, evidence_paths, amount, handling_fee, status)
  values (b_id, auth.uid(), trim(description), coalesce(evidence, '{}'), amount, ps.claim_handling_fee, 'open')
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.respond_to_claim(c_id uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare cl claims; b bookings;
begin
  select * into cl from claims where id = c_id;
  select * into b from bookings where id = cl.booking_id;
  if cl is null or b.customer_id <> auth.uid() then raise exception 'Claim not found'; end if;
  if cl.status <> 'open' then raise exception 'This claim is no longer open'; end if;
  if accept then
    update claims set status = 'approved', customer_response = 'accepted' where id = c_id;
    if b.deposit_status = 'with_owner' then update bookings set deposit_status = 'deducted' where id = b.id; end if;
    perform public.settle_deposit(b.id);
  else
    update claims set status = 'reviewing', customer_response = 'disputed' where id = c_id;
  end if;
end $$;

create or replace function public.admin_resolve_claim(c_id uuid, approve boolean, note text) returns void
language plpgsql security definer set search_path = public as $$
declare cl claims; b bookings;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update claims set status = case when approve then 'approved'::claim_status else 'rejected'::claim_status end,
    resolution_note = note
  where id = c_id and status = 'reviewing'
  returning * into cl;
  if cl is null then raise exception 'Nothing to resolve'; end if;
  select * into b from bookings where id = cl.booking_id;
  if b.deposit_status = 'with_owner' then
    update bookings set deposit_status = case when approve then 'deducted'::deposit_status else 'returned'::deposit_status end
    where id = b.id;
  else
    perform public.settle_deposit(b.id);
  end if;
end $$;

-- Kar owes the owner the trip (minus commission and claim handling fees) plus what they get from the deposit.
create or replace function public.owner_amount_due(b bookings) returns numeric
language sql stable security definer set search_path = public as $$
  select case when b.status in ('returned', 'closed')
    then b.owner_payout + coalesce(b.deposit_to_owner, 0)
      - coalesce((select sum(handling_fee) from claims c where c.booking_id = b.id and c.status = 'approved'), 0)
    else b.cancellation_fee end;
$$;

-- Payouts wait until a held deposit is settled (it decides the owner's share).
create or replace function public.admin_payouts_due()
returns table (owner_id uuid, owner_name text, booking_ids uuid[], amount numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
  with ps as (select claim_window from platform_settings),
  due as (
    select b.id, b.owner_id, public.owner_amount_due(b) as owed
    from bookings b, ps
    where ((b.status in ('returned', 'closed') and b.returned_at < now() - ps.claim_window and b.deposit_status::text <> 'held')
        or (b.status in ('cancelled', 'no_show') and b.cancellation_fee > 0))
      and not exists (select 1 from payments p where p.booking_id = b.id and p.type = 'payout')
      and not exists (select 1 from claims c where c.booking_id = b.id and c.status in ('open', 'reviewing'))
  )
  select d.owner_id, pr.full_name, array_agg(d.id order by d.id), sum(d.owed)
  from due d join profiles pr on pr.id = d.owner_id
  where d.owed > 0
  group by d.owner_id, pr.full_name
  order by sum(d.owed) desc;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Refunds run on their own
-- ---------------------------------------------------------------------------
-- Values only the database and the edge functions (service role) can read: no policies, so no user can.
create table internal_settings (name text primary key, value text not null);
alter table internal_settings enable row level security;
insert into internal_settings (name, value) values
  ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex')),
  ('functions_url', 'https://eznulhcndfoqlyduokjr.supabase.co/functions/v1')
on conflict (name) do nothing;

-- Every 10 minutes: settle deposits whose claim window has closed, then ask process-refunds to send every
-- refund that's waiting (it claims each one before calling CHIP, so overlapping runs are safe).
create or replace function public.run_refunds() returns int
language plpgsql security definer set search_path = public, extensions as $$
declare r record; n int := 0;
begin
  for r in
    select b.id from bookings b, platform_settings ps
    where b.status in ('returned', 'closed') and b.deposit_status::text = 'held'
      and b.returned_at < now() - ps.claim_window
  loop
    perform public.settle_deposit(r.id);
    n := n + 1;
  end loop;
  if exists (select 1 from payments where type = 'refund' and status = 'pending' and gateway = 'chip') then
    perform net.http_post(
      url := (select value from internal_settings where name = 'functions_url') || '/process-refunds',
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-kar-cron', (select value from internal_settings where name = 'cron_secret'))
    );
  end if;
  return n;
end $$;
revoke execute on function public.run_refunds() from public, anon, authenticated;
select cron.schedule('run-refunds', '*/10 * * * *', 'select public.run_refunds()');

-- ---------------------------------------------------------------------------
-- 3. Misuse alerts (and 4. alerts for Kar's team)
-- ---------------------------------------------------------------------------
alter table bookings
  add column area_alerted_at timestamptz,
  add column speed_alerted_at timestamptz;

-- Rough Peninsular Malaysia box, minus Singapore. Good enough to flag "may have left"; the owner checks the map.
create or replace function public.in_peninsular_malaysia(lat double precision, lng double precision) returns boolean
language sql immutable set search_path = public as $$
  select lat between 1.25 and 6.75 and lng between 99.6 and 104.6
    and not (lat < 1.47 and lng between 103.6 and 104.1);
$$;

create or replace function public.notify_admins(p_title text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  for a in select id from profiles where is_admin loop
    perform public.notify(a.id, p_title, p_body, '/admin');
  end loop;
end $$;
revoke execute on function public.notify_admins(text, text) from public, anon, authenticated;

create or replace function public.trip_alerts() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  -- Lost signal: nothing for 10 minutes.
  for r in
    select b.id, b.owner_id, c.make || ' ' || c.model as car
    from bookings b join cars c on c.id = b.car_id
    where b.status = 'active' and b.signal_alerted_at is null and b.picked_up_at < now() - interval '10 minutes'
      and coalesce((select max(recorded_at) from trip_locations l where l.booking_id = b.id), b.picked_up_at) < now() - interval '10 minutes'
  loop
    perform public.notify(r.owner_id, 'Signal lost', r.car || ' has not reported its location for 10 minutes. Call the customer.', '/host/track/' || r.id);
    update bookings set signal_alerted_at = now() where id = r.id;
    n := n + 1;
  end loop;
  -- Overdue by 30 minutes.
  for r in
    select b.id, b.owner_id, b.customer_id, c.make || ' ' || c.model as car
    from bookings b join cars c on c.id = b.car_id
    where b.status = 'active' and b.overdue_alerted_at is null and b.ends_at < now() - interval '30 minutes'
  loop
    perform public.notify(r.owner_id, 'Car overdue', r.car || ' is 30 minutes late. Call the customer.', '/host/track/' || r.id);
    perform public.notify(r.customer_id, 'Your trip is overdue', 'Return ' || r.car || ' now. Late fees come out of your deposit.', '/trip/' || r.id);
    update bookings set overdue_alerted_at = now() where id = r.id;
    n := n + 1;
  end loop;
  -- Left Peninsular Malaysia (house rules), or driven over 130 km/h, judged on the latest location.
  for r in
    select b.id, b.owner_id, c.make || ' ' || c.model as car, l.lat, l.lng, l.speed, b.area_alerted_at, b.speed_alerted_at
    from bookings b join cars c on c.id = b.car_id
    join lateral (select * from trip_locations t where t.booking_id = b.id order by recorded_at desc limit 1) l on true
    where b.status = 'active' and l.recorded_at > now() - interval '15 minutes'
      and ((b.area_alerted_at is null and not public.in_peninsular_malaysia(l.lat, l.lng))
        or (b.speed_alerted_at is null and l.speed > 36.1))
  loop
    if r.area_alerted_at is null and not public.in_peninsular_malaysia(r.lat, r.lng) then
      perform public.notify(r.owner_id, 'Car may have left Peninsular Malaysia', r.car || ' is outside the area allowed by the house rules. Check the map and call the customer.', '/host/track/' || r.id);
      perform public.notify_admins('Car outside Peninsular Malaysia', r.car || ' on an active trip.');
      update bookings set area_alerted_at = now() where id = r.id;
    end if;
    if r.speed_alerted_at is null and r.speed > 36.1 then
      perform public.notify(r.owner_id, 'Speeding', r.car || ' was driven at ' || round(r.speed * 3.6) || ' km/h.', '/host/track/' || r.id);
      update bookings set speed_alerted_at = now() where id = r.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.notify_admin_queue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'verifications' then
    perform public.notify_admins('ID to check', 'A renter is waiting for their ID check before pickup.');
  elsif tg_table_name = 'operator_documents' then
    perform public.notify_admins('Operator documents to check', new.business_name || ' sent their permit and insurance.');
  elsif tg_table_name = 'cars' then
    if not new.is_approved and new.rejected_at is null
       and (tg_op = 'INSERT' or old.is_approved or old.rejected_at is not null) then
      perform public.notify_admins('Car to approve', new.make || ' ' || new.model || ' (' || new.plate || ') is waiting for approval.');
    end if;
  elsif tg_table_name = 'claims' then
    if new.status = 'reviewing' and old.status is distinct from 'reviewing' then
      perform public.notify_admins('Claim disputed', 'A customer disputed a damage claim. Kar decides.');
    end if;
  end if;
  return new;
end $$;
create trigger verifications_admin_queue after insert on verifications
  for each row execute function public.notify_admin_queue();
create trigger operator_documents_admin_queue after insert on operator_documents
  for each row execute function public.notify_admin_queue();
create trigger cars_admin_queue after insert or update of is_approved, rejected_at on cars
  for each row execute function public.notify_admin_queue();
create trigger claims_admin_queue after update of status on claims
  for each row execute function public.notify_admin_queue();

-- ---------------------------------------------------------------------------
-- 5. Rental operators apply in the app; Kar's approval makes them an owner
-- ---------------------------------------------------------------------------
create or replace function public.submit_operator_documents(
  p_business_name text, p_ssm_no text, p_permit_no text, p_insurer text, p_policy_no text,
  p_insurance_expiry date, p_permit_path text, p_insurance_path text
) returns void
language plpgsql security definer set search_path = public as $$
declare name text := btrim(regexp_replace(coalesce(p_business_name, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if length(name) < 3 then raise exception 'Enter your business name as registered with SSM'; end if;
  if coalesce(btrim(p_ssm_no), '') = '' or coalesce(btrim(p_permit_no), '') = '' then
    raise exception 'Enter your SSM number and rental permit number';
  end if;
  if coalesce(btrim(p_insurer), '') = '' or coalesce(btrim(p_policy_no), '') = '' then
    raise exception 'Enter your insurer and policy number';
  end if;
  if p_insurance_expiry is null or p_insurance_expiry <= (now() at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Your insurance has expired';
  end if;
  if exists (select 1 from operator_documents where owner_id = auth.uid() and status = 'pending') then
    raise exception 'Kar is still checking your last documents';
  end if;
  insert into operator_documents (owner_id, business_name, ssm_no, permit_no, insurer, policy_no, insurance_expiry, permit_path, insurance_path)
  values (auth.uid(), name, btrim(p_ssm_no), btrim(p_permit_no), btrim(p_insurer), btrim(p_policy_no), p_insurance_expiry, p_permit_path, p_insurance_path);
  update profiles set full_name = left(name, 80) where id = auth.uid() and verification <> 'verified';
end $$;

create or replace function public.admin_review_operator(d_id uuid, approve boolean, note text) returns void
language plpgsql security definer set search_path = public as $$
declare d operator_documents;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update operator_documents set status = case when approve then 'approved'::operator_doc_status else 'rejected'::operator_doc_status end,
    reviewer_note = note, reviewed_at = now()
  where id = d_id and status = 'pending'
  returning * into d;
  if d is null then raise exception 'Nothing to review'; end if;
  if approve then
    update profiles set operator_insured_until = d.insurance_expiry, is_owner = true where id = d.owner_id;
  end if;
  perform public.notify(d.owner_id,
    case when approve then 'You can list cars on Kar' else 'Documents not approved' end,
    case when approve then 'Your permit and insurance are approved. Add your cars in the Host tab.'
         else coalesce(note, 'Please send clearer documents.') end,
    '/host');
end $$;
