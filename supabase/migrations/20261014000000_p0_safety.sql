-- P0 safety features before the first paid trip:
-- minimum booking fee, deposit held by owner, ID verification gate, house rules, damage claims,
-- late fee, no-show, owner cancellation strikes, cancellation refunds, incident reports (Get help / SOS).
-- See docs/03-risk-playbook.md for the policies these rules implement.

alter type booking_status add value if not exists 'no_show';
create type deposit_status as enum ('with_owner', 'returned', 'deducted');
create type incident_kind as enum ('accident', 'breakdown', 'cant_find', 'other');

alter table platform_settings
  add column min_customer_fee numeric(10,2) not null default 3,
  add column claim_window interval not null default interval '48 hours',
  add column late_grace interval not null default interval '15 minutes',
  add column no_show_after interval not null default interval '60 minutes',
  add column late_cancel_window interval not null default interval '24 hours',
  add column late_cancel_rate numeric(5,4) not null default 0.5,
  add column owner_strike_limit int not null default 3,
  add column support_whatsapp text not null default '';

alter table profiles add column owner_strikes int not null default 0;

alter table verifications
  add column licence_class text,
  add column licence_expiry date;

alter table bookings
  add column deposit_status deposit_status not null default 'with_owner',
  add column late_fee_due numeric(10,2) not null default 0,
  add column cancellation_fee numeric(10,2) not null default 0,
  add column refund_amount numeric(10,2),
  add column cancelled_by text check (cancelled_by in ('customer', 'owner', 'no_show', 'system')),
  add column rules_accepted_at timestamptz;

alter table claims add column customer_response text check (customer_response in ('accepted', 'disputed'));

-- Owner strikes are platform-controlled, like ratings.
create or replace function public.protect_profile_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.is_admin := old.is_admin;
    new.verification := case
      when new.verification = 'pending' and old.verification in ('unverified', 'rejected') then 'pending'
      else old.verification end;
    new.is_blacklisted := old.is_blacklisted;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
    new.trips_count := old.trips_count;
    new.owner_strikes := old.owner_strikes;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Booking rules (replaces the init version)
-- ---------------------------------------------------------------------------
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
  if cust.verification <> 'verified' then
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

  -- Never trust prices from the client. Deposit is recorded but paid to the owner at pickup.
  new.status := 'pending_payment';
  new.expires_at := now() + ps.unpaid_booking_ttl;
  new.trip_amount := public.trip_price(c.price_per_hour, c.price_per_day, new.starts_at, new.ends_at);
  new.customer_fee := greatest(round(new.trip_amount * ps.customer_fee_rate, 2), ps.min_customer_fee);
  new.owner_commission := round(new.trip_amount * ps.owner_commission_rate, 2);
  new.deposit := c.deposit;
  new.deposit_status := 'with_owner';
  new.total_charged := new.trip_amount + new.customer_fee;
  new.owner_payout := new.trip_amount - new.owner_commission;
  new.late_fee_due := 0;
  new.cancellation_fee := 0;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- ID verification
-- ---------------------------------------------------------------------------
create or replace function public.submit_verification(
  ic text, licence text, selfie text, l_class text, l_expiry date
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if l_expiry is not null and l_expiry < current_date then raise exception 'Your licence has expired'; end if;
  insert into verifications (user_id, ic_path, licence_path, selfie_path, licence_class, licence_expiry)
  values (auth.uid(), ic, licence, selfie, l_class, l_expiry);
  update profiles set verification = 'pending' where id = auth.uid() and verification <> 'verified';
end $$;

create or replace function public.admin_review_verification(v_id uuid, approve boolean, note text) returns void
language plpgsql security definer set search_path = public as $$
declare v verifications;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update verifications set status = case when approve then 'verified'::verification_status else 'rejected'::verification_status end,
    reviewer_note = note, reviewed_at = now()
  where id = v_id and status = 'pending'
  returning * into v;
  if v is null then raise exception 'Nothing to review'; end if;
  update profiles set verification = v.status where id = v.user_id;
end $$;

-- ---------------------------------------------------------------------------
-- Damage claims (deposit is held by the owner; Kar decides disputes)
-- ---------------------------------------------------------------------------
drop policy if exists "claims insert" on claims;
drop policy if exists "claims admin" on claims;

create or replace function public.create_claim(b_id uuid, description text, amount numeric, evidence text[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare b bookings; ps platform_settings; new_id uuid;
begin
  select * into ps from platform_settings;
  select * into b from bookings where id = b_id;
  if b is null or b.owner_id <> auth.uid() then raise exception 'Booking not found'; end if;
  if b.status not in ('returned', 'closed') then raise exception 'Claims open after the car is returned'; end if;
  if now() > b.returned_at + ps.claim_window then raise exception 'The 48-hour claim window has closed'; end if;
  if b.deposit_status <> 'with_owner' then raise exception 'The deposit has already been settled'; end if;
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

-- Customer accepts (deposit deducted) or disputes once (Kar reviews).
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
    update bookings set deposit_status = 'deducted' where id = b.id;
  else
    update claims set status = 'reviewing', customer_response = 'disputed' where id = c_id;
  end if;
end $$;

create or replace function public.admin_resolve_claim(c_id uuid, approve boolean, note text) returns void
language plpgsql security definer set search_path = public as $$
declare cl claims;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update claims set status = case when approve then 'approved'::claim_status else 'rejected'::claim_status end,
    resolution_note = note
  where id = c_id and status = 'reviewing'
  returning * into cl;
  if cl is null then raise exception 'Nothing to resolve'; end if;
  update bookings set deposit_status = case when approve then 'deducted'::deposit_status else 'returned'::deposit_status end
  where id = cl.booking_id;
end $$;

create or replace function public.set_deposit_returned(b_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from claims where booking_id = b_id and status in ('open', 'reviewing')) then
    raise exception 'Resolve the open claim first';
  end if;
  update bookings set deposit_status = 'returned'
  where id = b_id and owner_id = auth.uid() and status in ('returned', 'closed') and deposit_status = 'with_owner';
  if not found then raise exception 'Deposit cannot be updated'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Late return fee (replaces complete_return from init)
-- ---------------------------------------------------------------------------
create or replace function public.complete_return(b_id uuid, lat double precision, lng double precision, note text)
returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; ps platform_settings; late_rate numeric; late_hours int;
begin
  select * into ps from platform_settings;
  if (select count(*) from trip_photos where booking_id = b_id and phase = 'after') < 7 then
    raise exception 'Take all 7 after photos first';
  end if;
  select * into b from bookings where id = b_id and customer_id = auth.uid() and status = 'active';
  if b is null then raise exception 'Trip is not active'; end if;
  select late_fee_per_hour into late_rate from cars where id = b.car_id;
  late_hours := greatest(0, ceil(extract(epoch from (now() - b.ends_at - ps.late_grace)) / 3600))::int;

  update bookings set status = 'returned', returned_at = now(), deposit_release_at = now() + ps.claim_window,
    late_fee_due = late_hours * late_rate
  where id = b_id;

  insert into car_last_location (car_id, lat, lng, note, booking_id, updated_at)
  values (b.car_id, lat, lng, coalesce(note, ''), b.id, now())
  on conflict (car_id) do update
    set lat = excluded.lat, lng = excluded.lng, note = excluded.note,
        booking_id = excluded.booking_id, updated_at = now();

  update profiles set trips_count = trips_count + 1 where id = b.customer_id;
end $$;

-- ---------------------------------------------------------------------------
-- Cancellation rules
-- ---------------------------------------------------------------------------
-- Customer: free up to 24h before pickup; inside 24h the owner keeps 50% of the trip price.
drop function if exists public.cancel_booking(uuid, text);
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
    refund := b.total_charged - fee;
  end if;
  update bookings set status = 'cancelled', cancel_reason = coalesce(reason, 'customer_cancelled'),
    cancelled_by = 'customer', cancellation_fee = fee, refund_amount = refund
  where id = b_id;
  if refund > 0 then
    insert into payments (booking_id, user_id, type, amount, status) values (b_id, b.customer_id, 'refund', refund, 'pending');
  end if;
  return refund;
end $$;

-- Owner: full refund to the customer and a strike; at the limit the owner's cars are hidden.
create or replace function public.owner_cancel_booking(b_id uuid, reason text) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; ps platform_settings; strikes int;
begin
  select * into ps from platform_settings;
  select * into b from bookings where id = b_id and owner_id = auth.uid() and status in ('requested', 'confirmed');
  if b is null then raise exception 'Booking cannot be cancelled'; end if;
  update bookings set status = 'cancelled', cancel_reason = coalesce(reason, 'owner_cancelled'),
    cancelled_by = 'owner', cancellation_fee = 0, refund_amount = b.total_charged
  where id = b_id;
  insert into payments (booking_id, user_id, type, amount, status) values (b_id, b.customer_id, 'refund', b.total_charged, 'pending');
  update profiles set owner_strikes = owner_strikes + 1 where id = b.owner_id returning owner_strikes into strikes;
  if strikes >= ps.owner_strike_limit then
    update cars set is_listed = false where owner_id = b.owner_id;
  end if;
end $$;

-- Customer didn't show up within the grace period: treated as a late cancellation.
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
    refund_amount = b.total_charged - fee
  where id = b_id;
  insert into payments (booking_id, user_id, type, amount, status)
  values (b_id, b.customer_id, 'refund', b.total_charged - fee, 'pending');
end $$;

-- ---------------------------------------------------------------------------
-- Incidents (Get help / SOS)
-- ---------------------------------------------------------------------------
create table incidents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings on delete cascade,
  reported_by uuid not null references profiles,
  kind incident_kind not null,
  note text not null default '',
  lat double precision,
  lng double precision,
  photo_paths text[] not null default '{}',
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table incidents enable row level security;
create policy "incidents parties" on incidents for select using (public.is_booking_party(booking_id) or public.is_admin());
create policy "incidents insert" on incidents for insert
  with check (reported_by = auth.uid() and public.is_booking_party(booking_id));
create policy "incidents admin" on incidents for update using (public.is_admin());

alter publication supabase_realtime add table incidents, claims;
