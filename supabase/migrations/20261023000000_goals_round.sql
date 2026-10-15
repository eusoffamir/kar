-- Workflow review against Kar's goals (easy for renters, low risk for owners, Kar earns, middleman only,
-- cheap to scale):
--   1. Kar keeps its booking fee when the customer cancels or doesn't show up.
--   2. The RM30 claim handling fee is taken from the owner's payout when Kar approves their claim.
--   3. Owners see the renter's verified selfie during the booking (who should turn up).
--   4. Operator documents: rental permit and insurance, reviewed by Kar. New cars need them, and cars are hidden
--      when the insurance expires ("Insured by operator" on listings).
--   5. A verified name can't be changed, by any route.
--   6. Push notifications for the moments that matter (requests, confirmations, cancellations, ID result,
--      claims, lost signal, overdue), sent from the database through Expo's push service.

-- ---------------------------------------------------------------------------
-- 1. Kar keeps its booking fee when the customer cancels or doesn't show up
-- ---------------------------------------------------------------------------
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
    -- The trip price comes back (minus any late-cancellation fee for the owner); Kar's booking fee doesn't.
    refund := b.trip_amount - fee;
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
declare b bookings; ps platform_settings; fee numeric;
begin
  select * into ps from platform_settings;
  select * into b from bookings where id = b_id and owner_id = auth.uid() and status = 'confirmed';
  if b is null then raise exception 'Booking cannot be marked as no-show'; end if;
  if now() < b.starts_at + ps.no_show_after then raise exception 'Wait 60 minutes after the start time'; end if;
  fee := round(b.trip_amount * ps.late_cancel_rate, 2);
  update bookings set status = 'no_show', cancelled_by = 'no_show', cancellation_fee = fee,
    refund_amount = b.trip_amount - fee
  where id = b_id;
  insert into payments (booking_id, user_id, type, amount, status)
  values (b_id, b.customer_id, 'refund', b.trip_amount - fee, 'pending');
end $$;

-- ---------------------------------------------------------------------------
-- 2. Claim handling fee comes out of the owner's payout
-- ---------------------------------------------------------------------------
-- What Kar owes the owner for one booking: the trip (after commission) minus the handling fee of any claim
-- Kar approved for them, or the cancellation / no-show fee.
create or replace function public.owner_amount_due(b bookings) returns numeric
language sql stable security definer set search_path = public as $$
  select case when b.status in ('returned', 'closed')
    then b.owner_payout - coalesce((select sum(handling_fee) from claims c where c.booking_id = b.id and c.status = 'approved'), 0)
    else b.cancellation_fee end;
$$;
revoke execute on function public.owner_amount_due(bookings) from public, anon, authenticated;

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
    where ((b.status in ('returned', 'closed') and b.returned_at < now() - ps.claim_window)
        or (b.status in ('cancelled', 'no_show') and b.cancellation_fee > 0))
      and not exists (select 1 from payments p where p.booking_id = b.id and p.type = 'payout')
      -- A claim still being decided can change the amount: wait for Kar's decision.
      and not exists (select 1 from claims c where c.booking_id = b.id and c.status in ('open', 'reviewing'))
  )
  select d.owner_id, pr.full_name, array_agg(d.id order by d.id), sum(d.owed)
  from due d join profiles pr on pr.id = d.owner_id
  where d.owed > 0
  group by d.owner_id, pr.full_name
  order by sum(d.owed) desc;
end $$;

create or replace function public.admin_record_payout(b_ids uuid[], bank_ref text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  insert into payments (booking_id, user_id, type, amount, gateway, status, raw)
  select b.id, b.owner_id, 'payout', public.owner_amount_due(b),
    'bank', 'paid', jsonb_build_object('bank_ref', bank_ref, 'paid_at', now(), 'paid_by', auth.uid())
  from bookings b
  where b.id = any(b_ids) and b.status in ('returned', 'closed', 'cancelled', 'no_show')
  on conflict (booking_id) where type = 'payout' do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The owner sees the renter's verified selfie during the booking
-- ---------------------------------------------------------------------------
-- Storage path of the renter's approved selfie, for the car's owner while the booking is confirmed or active.
create or replace function public.customer_selfie_path(b_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select v.selfie_path from bookings b
  join verifications v on v.user_id = b.customer_id and v.status = 'verified'
  where b.id = b_id and b.owner_id = auth.uid() and b.status in ('confirmed', 'active')
  order by v.reviewed_at desc nulls last
  limit 1;
$$;

create or replace function public.can_view_selfie(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from verifications v join bookings b on b.customer_id = v.user_id
    where v.selfie_path = path and v.status = 'verified'
      and b.owner_id = auth.uid() and b.status in ('confirmed', 'active'));
$$;

-- Only the selfie: IC and licence photos stay with the customer and Kar.
create policy "renter selfie for owner" on storage.objects for select to authenticated
  using (bucket_id = 'verifications' and public.can_view_selfie(name));

-- ---------------------------------------------------------------------------
-- 4. Operator documents: rental permit + insurance, reviewed by Kar
-- ---------------------------------------------------------------------------
create type operator_doc_status as enum ('pending', 'approved', 'rejected');

-- Shown on listings as "Insured by operator" while in the future; set only when Kar approves the documents.
alter table profiles add column operator_insured_until date;

create table operator_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles on delete cascade,
  business_name text not null,
  ssm_no text not null,
  permit_no text not null,
  insurer text not null,
  policy_no text not null,
  insurance_expiry date not null,
  permit_path text not null,
  insurance_path text not null,
  status operator_doc_status not null default 'pending',
  reviewer_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table operator_documents enable row level security;
create policy "operator docs own" on operator_documents for select
  using (owner_id = (select auth.uid()) or public.is_admin());
-- Written only by submit_operator_documents() and admin_review_operator().

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('operator-docs', 'operator-docs', false, 10 * 1024 * 1024,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;
create policy "operator docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'operator-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "operator docs read" on storage.objects for select to authenticated
  using (bucket_id = 'operator-docs' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

create or replace function public.submit_operator_documents(
  p_business_name text, p_ssm_no text, p_permit_no text, p_insurer text, p_policy_no text,
  p_insurance_expiry date, p_permit_path text, p_insurance_path text
) returns void
language plpgsql security definer set search_path = public as $$
declare name text := btrim(regexp_replace(coalesce(p_business_name, ''), '\s+', ' ', 'g'));
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_owner) then
    raise exception 'Only owners set up by Kar can send operator documents';
  end if;
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
  insert into operator_documents (owner_id, business_name, ssm_no, permit_no, insurer, policy_no, insurance_expiry, permit_path, insurance_path)
  values (auth.uid(), name, btrim(p_ssm_no), btrim(p_permit_no), btrim(p_insurer), btrim(p_policy_no), p_insurance_expiry, p_permit_path, p_insurance_path);
  -- Owners show under their business name (a verified customer's own name stays locked).
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
    update profiles set operator_insured_until = d.insurance_expiry where id = d.owner_id;
  end if;
end $$;

-- Approving a car now needs the owner's documents approved and the insurance current.
create or replace function public.admin_approve_car(c_id uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare insured date;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if approve then
    select p.operator_insured_until into insured from cars c join profiles p on p.id = c.owner_id where c.id = c_id;
    if insured is null or insured < (now() at time zone 'Asia/Kuala_Lumpur')::date then
      raise exception 'Approve the owner''s permit and insurance first';
    end if;
  end if;
  update cars set is_approved = approve, is_listed = approve,
    rejected_at = case when approve then null else now() end
  where id = c_id;
  if not found then raise exception 'Car not found'; end if;
end $$;

-- Expired insurance hides the owner's cars (daily), until they send new documents and Kar approves them.
create or replace function public.hide_uninsured_cars() returns int
language sql security definer set search_path = public as $$
  with x as (
    update cars c set is_listed = false
    from profiles p
    where p.id = c.owner_id and c.is_listed
      and p.operator_insured_until < (now() at time zone 'Asia/Kuala_Lumpur')::date
    returning 1
  ) select count(*)::int from x;
$$;
revoke execute on function public.hide_uninsured_cars() from public, anon, authenticated;
select cron.schedule('hide-uninsured-cars', '5 16 * * *', 'select public.hide_uninsured_cars()');  -- 00:05 MYT

-- ---------------------------------------------------------------------------
-- 5. Profiles: verified names are locked; insurance date and strikes are Kar's
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.is_admin := old.is_admin;
    new.is_owner := old.is_owner;
    new.verification := case
      when new.verification = 'pending' and old.verification in ('unverified', 'rejected') then 'pending'
      else old.verification end;
    new.is_blacklisted := old.is_blacklisted;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
    new.trips_count := old.trips_count;
    new.owner_strikes := old.owner_strikes;
    new.operator_insured_until := old.operator_insured_until;
    -- Owners see the name Kar checked against the IC: it can't be edited afterwards.
    if old.verification = 'verified' then new.full_name := old.full_name; end if;
  end if;
  return new;
end $$;

-- Owners relist after Kar resets their strikes (Admin → Owners → Reset strikes).
create or replace function public.admin_reset_strikes(p_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update profiles set owner_strikes = 0 where id = p_owner;
end $$;

drop function if exists public.admin_owners();
create or replace function public.admin_owners()
returns table (id uuid, full_name text, email text, cars int, strikes int, insured_until date)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
  select p.id, p.full_name, u.email::text, (select count(*)::int from cars c where c.owner_id = p.id), p.owner_strikes,
    p.operator_insured_until
  from profiles p join auth.users u on u.id = p.id
  where p.is_owner
  order by p.full_name;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Push notifications (Expo push service, sent from the database with pg_net)
-- ---------------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;

alter table bookings
  add column signal_alerted_at timestamptz,
  add column overdue_alerted_at timestamptz;

-- Sends one notification to every phone the user is signed in on. `url` is the app screen to open on tap.
create or replace function public.notify(p_user uuid, p_title text, p_body text, p_url text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object('to', token, 'title', p_title, 'body', p_body, 'sound', 'default',
                                      'data', jsonb_build_object('url', p_url)))
  into msgs from push_tokens where user_id = p_user;
  if msgs is null then return; end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := msgs,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
exception when others then
  -- A notification must never block the booking change that triggered it.
  raise warning 'push failed: %', sqlerrm;
end $$;
revoke execute on function public.notify(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.notify_booking_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare car text; owner_url text := '/host/booking/' || new.id; cust_url text := '/trip/' || new.id;
begin
  if new.status is not distinct from old.status then return new; end if;
  select make || ' ' || model into car from cars where id = new.car_id;
  case new.status
    when 'requested' then
      perform public.notify(new.owner_id, 'New booking request', car || ': reply within 2 hours or it is declined automatically.', owner_url);
    when 'confirmed' then
      if old.status = 'requested' then
        perform public.notify(new.customer_id, 'Booking confirmed', 'The owner accepted your ' || car || ' booking.', cust_url);
      else
        perform public.notify(new.owner_id, 'New booking', car || ' was just booked and paid.', owner_url);
      end if;
    when 'declined' then
      perform public.notify(new.customer_id, 'Booking declined', car || ': you get a full refund.', cust_url);
    when 'cancelled' then
      if old.status = 'pending_payment' then return new; end if;  -- unpaid, nobody needs telling
      if new.cancelled_by = 'customer' then
        perform public.notify(new.owner_id, 'Booking cancelled', 'The customer cancelled their ' || car || ' booking.', owner_url);
      else
        perform public.notify(new.customer_id, 'Booking cancelled', car || ' was cancelled. You get a full refund.', cust_url);
        if new.cancelled_by = 'system' then
          perform public.notify(new.owner_id, 'Booking cancelled', car || ' was cancelled by Kar.', owner_url);
        end if;
      end if;
    when 'active' then
      perform public.notify(new.owner_id, 'Trip started', car || ' was picked up. Watch it live on My cars.', '/host/track/' || new.id);
    when 'returned' then
      perform public.notify(new.owner_id, 'Car returned', car || ' is back. Check the photos and report any damage within 48 hours.', owner_url);
    else null;
  end case;
  return new;
end $$;
create trigger bookings_notify after update of status on bookings
  for each row execute function public.notify_booking_change();

create or replace function public.notify_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('verified', 'rejected') then
    perform public.notify(new.user_id,
      case when new.status = 'verified' then 'ID approved' else 'ID not approved' end,
      case when new.status = 'verified' then 'You can now pick up cars on Kar.'
           else 'Your ID could not be approved. Open Kar to try again.' end,
      '/verify');
  end if;
  return new;
end $$;
create trigger verifications_notify after update of status on verifications
  for each row execute function public.notify_verification();

create or replace function public.notify_claim() returns trigger
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = new.booking_id;
  if tg_op = 'INSERT' then
    perform public.notify(b.customer_id, 'Damage reported', 'The owner reported damage (RM' || new.amount || '). Accept or dispute it in Kar.', '/trip/' || b.id);
  elsif new.status is distinct from old.status then
    if new.status = 'reviewing' then
      perform public.notify(b.owner_id, 'Claim disputed', 'The customer disputed your claim. Kar will decide.', '/host/booking/' || b.id);
    elsif new.status in ('approved', 'rejected') then
      perform public.notify(b.owner_id, 'Claim ' || new.status::text, 'Your damage claim was ' || new.status::text || '.', '/host/booking/' || b.id);
      perform public.notify(b.customer_id, 'Claim ' || new.status::text, 'The damage claim was ' || new.status::text || '.', '/trip/' || b.id);
    end if;
  end if;
  return new;
end $$;
create trigger claims_notify after insert or update of status on claims
  for each row execute function public.notify_claim();

-- Every 5 minutes: warn the owner when a car on a trip stops reporting (10 min), and both sides when it's
-- 30 minutes overdue. Each warning is sent once per trip.
create or replace function public.trip_alerts() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
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
  for r in
    select b.id, b.owner_id, b.customer_id, c.make || ' ' || c.model as car
    from bookings b join cars c on c.id = b.car_id
    where b.status = 'active' and b.overdue_alerted_at is null and b.ends_at < now() - interval '30 minutes'
  loop
    perform public.notify(r.owner_id, 'Car overdue', r.car || ' is 30 minutes late. Call the customer.', '/host/track/' || r.id);
    perform public.notify(r.customer_id, 'Your trip is overdue', 'Return ' || r.car || ' now. Late fees apply per hour.', '/trip/' || r.id);
    update bookings set overdue_alerted_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.trip_alerts() from public, anon, authenticated;
select cron.schedule('trip-alerts', '*/5 * * * *', 'select public.trip_alerts()');

-- A fresh location after a lost-signal warning clears it, so the next loss is reported again.
create or replace function public.report_trip_location(b_id uuid, fixes jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare b bookings; n int;
begin
  select * into b from bookings where id = b_id and customer_id = auth.uid();
  if b is null then raise exception 'Booking not found'; end if;
  if b.status <> 'active' or jsonb_typeof(fixes) <> 'array' then return 0; end if;

  insert into trip_locations (booking_id, car_id, lat, lng, accuracy, speed, recorded_at)
  select b.id, b.car_id, (f->>'lat')::double precision, (f->>'lng')::double precision,
    (f->>'accuracy')::real, greatest((f->>'speed')::real, 0),
    least(greatest(coalesce((f->>'t')::timestamptz, now()), b.picked_up_at), now())
  from (select f from jsonb_array_elements(fixes) f limit 120) x
  where f ? 'lat' and f ? 'lng'
    and (f->>'lat')::double precision between -90 and 90
    and (f->>'lng')::double precision between -180 and 180;
  get diagnostics n = row_count;
  if n > 0 and b.signal_alerted_at is not null then
    update bookings set signal_alerted_at = null where id = b.id;
  end if;
  return n;
end $$;
