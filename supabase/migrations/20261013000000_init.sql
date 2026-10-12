-- Kar initial schema: marketplace for P2P car rental (UTP pilot).
-- Run with `npx supabase db push` or paste into the Supabase SQL editor.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type verification_status as enum ('unverified', 'pending', 'verified', 'rejected');
create type handover_type as enum ('manual', 'keybox');
create type booking_status as enum (
  'pending_payment', 'requested', 'confirmed', 'active', 'returned', 'closed', 'cancelled', 'declined'
);
create type photo_phase as enum ('before', 'after');
create type photo_slot as enum ('front', 'back', 'left', 'right', 'interior', 'fuel', 'odometer');
create type payment_type as enum ('charge', 'deposit_hold', 'deposit_release', 'refund', 'payout');
create type payment_status as enum ('pending', 'paid', 'failed', 'refunded');
create type claim_status as enum ('open', 'reviewing', 'approved', 'rejected', 'settled');

-- ---------------------------------------------------------------------------
-- Zones: one row per campus/city. This table is how Kar scales.
-- ---------------------------------------------------------------------------
create table zones (
  id text primary key,                 -- e.g. 'utp'
  name text not null,
  center_lat double precision not null,
  center_lng double precision not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Platform fee settings (single row). Change rates here, not in app code.
create table platform_settings (
  id boolean primary key default true check (id),
  customer_fee_rate numeric(5,4) not null default 0.05,   -- booking fee charged to customer
  owner_commission_rate numeric(5,4) not null default 0,  -- waived during pilot; plan: 0.10
  claim_handling_fee numeric(10,2) not null default 30,
  unpaid_booking_ttl interval not null default interval '15 minutes'
);
insert into platform_settings default values;

-- Trip price: full days at the day rate, leftover hours at the hour rate capped at one day.
-- Mirrors src/lib/pricing.ts; the database value is the one that is charged.
create or replace function public.trip_price(hour_rate numeric, day_rate numeric, starts timestamptz, ends timestamptz)
returns numeric language sql immutable as $$
  with h as (select ceil(extract(epoch from (ends - starts)) / 3600)::int as hours)
  select (h.hours / 24) * day_rate + least((h.hours % 24) * hour_rate, day_rate) from h;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  avatar_url text,
  zone_id text references zones,
  is_owner boolean not null default false,
  is_admin boolean not null default false,
  verification verification_status not null default 'unverified',
  rating_avg numeric(3,2),
  rating_count int not null default 0,
  trips_count int not null default 0,
  is_blacklisted boolean not null default false,   -- platform-wide, set by admins only
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

-- Private contact details: visible only to the user, their booking counterparties and admins (PDPA).
create table profile_private (
  user_id uuid primary key references profiles on delete cascade,
  phone text,
  email text
);

-- Create a profile automatically on sign-up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  insert into profile_private (user_id, phone, email) values (new.id, new.phone, new.email);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Users may edit their own profile, but never privileged columns.
-- Security invoker on purpose: updates made inside our own security-definer functions
-- (ratings, trip counts) run as the table owner and are allowed through.
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
  end if;
  return new;
end $$;

create trigger profiles_protect before update on profiles
  for each row execute function public.protect_profile_columns();

-- ID documents (IC/licence/selfie) stored in the private 'verifications' bucket.
create table verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  ic_path text not null,
  licence_path text not null,
  selfie_path text not null,
  status verification_status not null default 'pending',
  reviewer_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Cars
-- ---------------------------------------------------------------------------
create table cars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles on delete cascade,
  zone_id text not null references zones,
  make text not null,
  model text not null,
  year int not null,
  plate text not null,
  transmission text not null default 'auto' check (transmission in ('auto', 'manual')),
  seats int not null default 5,
  fuel text not null default 'petrol',
  photos text[] not null default '{}',
  description text not null default '',
  price_per_hour numeric(10,2) not null check (price_per_hour > 0),
  price_per_day numeric(10,2) not null check (price_per_day > 0),
  deposit numeric(10,2) not null default 0 check (deposit >= 0),
  late_fee_per_hour numeric(10,2) not null default 0,
  min_hours int not null default 2,
  instant_book boolean not null default true,
  handover handover_type not null default 'manual',
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  pickup_note text not null default '',
  is_listed boolean not null default false,  -- admin approves before listing
  is_approved boolean not null default false,
  created_at timestamptz not null default now()
);
-- Only admins can approve/list a car for the first time.
create or replace function public.protect_car_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.is_approved := old.is_approved;
    new.owner_id := old.owner_id;
    if not old.is_approved then new.is_listed := old.is_listed; end if;
  end if;
  return new;
end $$;
create trigger cars_protect before update on cars
  for each row execute function public.protect_car_columns();

create index cars_zone_idx on cars (zone_id) where is_listed and is_approved;

-- Secrets live in their own owner-only table so listing queries can never leak them.
create table car_secrets (
  car_id uuid primary key references cars on delete cascade,
  keybox_code text
);

-- Where the car was last parked: updated by the customer at every return.
create table car_last_location (
  car_id uuid primary key references cars on delete cascade,
  lat double precision not null,
  lng double precision not null,
  note text not null default '',
  booking_id uuid,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Bookings + availability
-- ---------------------------------------------------------------------------
create table bookings (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references cars on delete restrict,
  customer_id uuid not null references profiles on delete restrict,
  owner_id uuid not null references profiles on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status booking_status not null default 'pending_payment',
  -- Price fields are computed by the bookings_validate trigger from platform_settings.
  trip_amount numeric(10,2) not null default 0,
  customer_fee numeric(10,2) not null default 0,     -- Kar booking fee paid by customer
  owner_commission numeric(10,2) not null default 0, -- Kar commission deducted from owner payout
  deposit numeric(10,2) not null default 0,
  total_charged numeric(10,2) not null default 0,    -- trip + customer_fee + deposit
  owner_payout numeric(10,2) not null default 0,     -- trip - owner_commission
  picked_up_at timestamptz,
  returned_at timestamptz,
  deposit_release_at timestamptz,
  cancel_reason text,
  expires_at timestamptz,                  -- unpaid bookings release the slot after this
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index bookings_customer_idx on bookings (customer_id, starts_at desc);
create index bookings_owner_idx on bookings (owner_id, starts_at desc);

-- Owner-blocked periods (maintenance, personal use).
create table availability_blocks (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references cars on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '',
  check (ends_at > starts_at)
);

-- No double-booking: overlapping live bookings for one car are rejected by Postgres itself.
alter table bookings add constraint bookings_no_overlap exclude using gist (
  car_id with =,
  tstzrange(starts_at, ends_at, '[)') with &&
) where (status in ('pending_payment', 'requested', 'confirmed', 'active'));

-- Fill owner_id from the car and refuse bookings during owner blocks or by blocked customers.
create or replace function public.bookings_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare c cars; ps platform_settings; hrs numeric;
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
  if exists (select 1 from profiles where id = new.customer_id and is_blacklisted) then
    raise exception 'Account is not allowed to book';
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

  -- Never trust prices from the client.
  new.status := 'pending_payment';
  new.expires_at := now() + ps.unpaid_booking_ttl;
  new.trip_amount := public.trip_price(c.price_per_hour, c.price_per_day, new.starts_at, new.ends_at);
  new.customer_fee := round(new.trip_amount * ps.customer_fee_rate, 2);
  new.owner_commission := round(new.trip_amount * ps.owner_commission_rate, 2);
  new.deposit := c.deposit;
  new.total_charged := new.trip_amount + new.customer_fee + new.deposit;
  new.owner_payout := new.trip_amount - new.owner_commission;
  return new;
end $$;

-- Owners can block individual customers (customer management).
create table owner_blocks (
  owner_id uuid not null references profiles on delete cascade,
  customer_id uuid not null references profiles on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (owner_id, customer_id)
);

create trigger bookings_validate before insert on bookings
  for each row execute function public.bookings_before_insert();

-- ---------------------------------------------------------------------------
-- Trip evidence, payments, claims, reviews, chat
-- ---------------------------------------------------------------------------
create table trip_photos (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings on delete cascade,
  phase photo_phase not null,
  slot photo_slot not null,
  storage_path text not null,
  lat double precision,
  lng double precision,
  taken_at timestamptz not null default now(),
  uploaded_by uuid not null references profiles,
  unique (booking_id, phase, slot)
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings on delete restrict,
  user_id uuid references profiles,
  type payment_type not null,
  amount numeric(10,2) not null,
  gateway text not null default 'billplz',
  gateway_ref text,
  status payment_status not null default 'pending',
  raw jsonb,
  created_at timestamptz not null default now()
);
create unique index payments_gateway_ref_idx on payments (gateway, gateway_ref) where gateway_ref is not null;

create table claims (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings on delete restrict,
  raised_by uuid not null references profiles,
  description text not null,
  evidence_paths text[] not null default '{}',
  amount numeric(10,2) not null default 0,
  handling_fee numeric(10,2) not null default 0,
  status claim_status not null default 'open',
  resolution_note text,
  created_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings on delete cascade,
  from_id uuid not null references profiles,
  to_id uuid not null references profiles,
  rating int not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique (booking_id, from_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings on delete cascade,
  sender_id uuid not null references profiles,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table push_tokens (
  user_id uuid not null references profiles on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, token)
);

-- Keep rating aggregates current.
create or replace function public.reviews_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles p set
    rating_count = s.cnt,
    rating_avg = s.avg
  from (select count(*) cnt, round(avg(rating)::numeric, 2) avg from reviews where to_id = new.to_id) s
  where p.id = new.to_id;
  return new;
end $$;
create trigger reviews_aggregate after insert on reviews
  for each row execute function public.reviews_after_insert();

-- Helper: is the current user a party (customer or owner) of the booking?
create or replace function public.is_booking_party(b_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bookings where id = b_id and auth.uid() in (customer_id, owner_id)
  );
$$;

-- Keybox code is revealed to the customer only during their confirmed/active window (±30 min).
create or replace function public.car_keybox_code(b_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select s.keybox_code
  from bookings b join car_secrets s on s.car_id = b.car_id
  where b.id = b_id
    and b.customer_id = auth.uid()
    and b.status in ('confirmed', 'active')
    and now() between b.starts_at - interval '30 minutes' and b.ends_at;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table platform_settings enable row level security;
alter table zones enable row level security;
alter table profiles enable row level security;
alter table profile_private enable row level security;
alter table verifications enable row level security;
alter table cars enable row level security;
alter table car_secrets enable row level security;
alter table car_last_location enable row level security;
alter table bookings enable row level security;
alter table availability_blocks enable row level security;
alter table owner_blocks enable row level security;
alter table trip_photos enable row level security;
alter table payments enable row level security;
alter table claims enable row level security;
alter table reviews enable row level security;
alter table messages enable row level security;
alter table push_tokens enable row level security;

create policy "settings readable" on platform_settings for select using (true);
create policy "settings admin" on platform_settings for update using (public.is_admin());
create policy "zones readable" on zones for select using (true);
create policy "zones admin" on zones for all using (public.is_admin()) with check (public.is_admin());

create policy "profiles readable" on profiles for select using (true);
create policy "profiles self update" on profiles for update using (id = auth.uid() or public.is_admin());

create policy "private self" on profile_private for select using (
  user_id = auth.uid() or public.is_admin()
  or exists (select 1 from bookings b
             where b.status in ('confirmed', 'active', 'returned')
               and ((b.customer_id = auth.uid() and b.owner_id = user_id)
                 or (b.owner_id = auth.uid() and b.customer_id = user_id))));
create policy "private self update" on profile_private for update using (user_id = auth.uid());

create policy "verifications own" on verifications for select using (user_id = auth.uid() or public.is_admin());
create policy "verifications insert own" on verifications for insert with check (user_id = auth.uid());
create policy "verifications admin" on verifications for update using (public.is_admin());

-- Listed cars are public; owners see and manage their own; admins see everything.
create policy "cars readable" on cars for select
  using ((is_listed and is_approved) or owner_id = auth.uid() or public.is_admin());
create policy "cars owner insert" on cars for insert with check (owner_id = auth.uid() and not is_approved);
create policy "cars owner update" on cars for update using (owner_id = auth.uid() or public.is_admin());
create policy "cars owner delete" on cars for delete using (owner_id = auth.uid());

create policy "car secrets owner" on car_secrets for all
  using (exists (select 1 from cars where cars.id = car_id and cars.owner_id = auth.uid()))
  with check (exists (select 1 from cars where cars.id = car_id and cars.owner_id = auth.uid()));

create policy "last location readable" on car_last_location for select using (true);
-- Written only by the complete_return() function below.

create policy "bookings parties" on bookings for select
  using (auth.uid() in (customer_id, owner_id) or public.is_admin());
create policy "bookings customer insert" on bookings for insert
  with check (customer_id = auth.uid() and status = 'pending_payment');
-- Status transitions go through security-definer functions / edge functions, not direct updates.
create policy "bookings admin update" on bookings for update using (public.is_admin());

create policy "blocks readable" on availability_blocks for select using (true);
create policy "blocks owner" on availability_blocks for all
  using (exists (select 1 from cars where cars.id = car_id and cars.owner_id = auth.uid()))
  with check (exists (select 1 from cars where cars.id = car_id and cars.owner_id = auth.uid()));

create policy "owner blocks own" on owner_blocks for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "photos parties read" on trip_photos for select
  using (public.is_booking_party(booking_id) or public.is_admin());
create policy "photos customer insert" on trip_photos for insert
  with check (uploaded_by = auth.uid() and public.is_booking_party(booking_id));

create policy "payments own" on payments for select using (user_id = auth.uid() or public.is_admin());
-- Inserted/updated only by edge functions using the service role.

create policy "claims parties" on claims for select
  using (public.is_booking_party(booking_id) or public.is_admin());
create policy "claims insert" on claims for insert
  with check (raised_by = auth.uid() and public.is_booking_party(booking_id));
create policy "claims admin" on claims for update using (public.is_admin());

create policy "reviews readable" on reviews for select using (true);
create policy "reviews insert" on reviews for insert
  with check (from_id = auth.uid() and public.is_booking_party(booking_id)
    and exists (select 1 from bookings b where b.id = booking_id and b.status in ('returned', 'closed')
                and to_id in (b.customer_id, b.owner_id) and to_id <> auth.uid()));

create policy "messages parties" on messages for select using (public.is_booking_party(booking_id));
create policy "messages insert" on messages for insert
  with check (sender_id = auth.uid() and public.is_booking_party(booking_id));

create policy "push tokens own" on push_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Trip lifecycle functions (called from the app via supabase.rpc)
-- ---------------------------------------------------------------------------

-- Busy time ranges for a car's calendar. Exposes times only, never who booked.
create or replace function public.car_busy_ranges(c_id uuid)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.starts_at, b.ends_at from bookings b
  where b.car_id = c_id and b.ends_at > now()
    and b.status in ('pending_payment', 'requested', 'confirmed', 'active')
  union all
  select a.starts_at, a.ends_at from availability_blocks a
  where a.car_id = c_id and a.ends_at > now()
  order by 1;
$$;

-- Owner accepts/declines a request-mode booking.
create or replace function public.respond_to_booking(b_id uuid, accept boolean) returns booking_status
language plpgsql security definer set search_path = public as $$
declare s booking_status;
begin
  update bookings set status = case when accept then 'confirmed'::booking_status else 'declined'::booking_status end
  where id = b_id and owner_id = auth.uid() and status = 'requested'
  returning status into s;
  if s is null then raise exception 'Booking cannot be updated'; end if;
  return s;
end $$;

-- Customer starts the trip: requires all 7 "before" photos.
create or replace function public.start_trip(b_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from trip_photos where booking_id = b_id and phase = 'before') < 7 then
    raise exception 'Take all 7 before photos first';
  end if;
  update bookings set status = 'active', picked_up_at = now()
  where id = b_id and customer_id = auth.uid() and status = 'confirmed'
    and now() >= starts_at - interval '30 minutes';
  if not found then raise exception 'Trip cannot be started yet'; end if;
end $$;

-- Customer ends the trip: requires all 7 "after" photos + the parking pin.
-- This is what keeps the owner from having to share location/photos again.
create or replace function public.complete_return(b_id uuid, lat double precision, lng double precision, note text)
returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  if (select count(*) from trip_photos where booking_id = b_id and phase = 'after') < 7 then
    raise exception 'Take all 7 after photos first';
  end if;
  update bookings set status = 'returned', returned_at = now(), deposit_release_at = now() + interval '24 hours'
  where id = b_id and customer_id = auth.uid() and status = 'active'
  returning * into b;
  if b is null then raise exception 'Trip is not active'; end if;

  insert into car_last_location (car_id, lat, lng, note, booking_id, updated_at)
  values (b.car_id, lat, lng, coalesce(note, ''), b.id, now())
  on conflict (car_id) do update
    set lat = excluded.lat, lng = excluded.lng, note = excluded.note,
        booking_id = excluded.booking_id, updated_at = now();

  update profiles set trips_count = trips_count + 1 where id = b.customer_id;
end $$;

-- Release slots held by unpaid bookings. Schedule every 5 minutes with pg_cron:
--   select cron.schedule('expire-unpaid', '*/5 * * * *', 'select public.expire_unpaid_bookings()');
create or replace function public.expire_unpaid_bookings() returns int
language sql security definer set search_path = public as $$
  with x as (
    update bookings set status = 'cancelled', cancel_reason = 'payment_timeout'
    where status = 'pending_payment' and expires_at < now()
    returning 1
  ) select count(*)::int from x;
$$;
revoke execute on function public.expire_unpaid_bookings() from public, anon, authenticated;

-- Customer cancels before pickup (refund handled by the payment edge function).
create or replace function public.cancel_booking(b_id uuid, reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update bookings set status = 'cancelled', cancel_reason = coalesce(reason, 'customer_cancelled')
  where id = b_id and customer_id = auth.uid()
    and status in ('pending_payment', 'requested', 'confirmed');
  if not found then raise exception 'Booking cannot be cancelled'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Storage buckets (private). Paths: <booking_id>/<phase>/<slot>.jpg, <user_id>/<doc>.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('car-photos', 'car-photos', true),
  ('trip-photos', 'trip-photos', false),
  ('verifications', 'verifications', false)
on conflict (id) do nothing;

create policy "car photos owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "trip photos parties" on storage.objects for select to authenticated
  using (bucket_id = 'trip-photos' and (public.is_booking_party(((storage.foldername(name))[1])::uuid) or public.is_admin()));
create policy "trip photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-photos' and public.is_booking_party(((storage.foldername(name))[1])::uuid));

create policy "verification docs own" on storage.objects for select to authenticated
  using (bucket_id = 'verifications' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "verification docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'verifications' and (storage.foldername(name))[1] = auth.uid()::text);

-- Realtime for chat and booking status updates.
alter publication supabase_realtime add table messages, bookings;
