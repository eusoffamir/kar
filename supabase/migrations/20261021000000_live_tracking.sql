-- Live tracking: during a trip the customer's phone reports where the car is, and the owner watches it live
-- on My cars. Plus fixes from the October app audit (trip photo tampering, relisting by removed owners,
-- renaming after ID approval).

-- ---------------------------------------------------------------------------
-- Live trip locations
-- ---------------------------------------------------------------------------
create table trip_locations (
  id bigint generated always as identity primary key,
  booking_id uuid not null references bookings on delete cascade,
  car_id uuid not null references cars on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy real,           -- metres
  speed real,              -- metres per second
  recorded_at timestamptz not null,  -- when the phone took the fix
  created_at timestamptz not null default now()
);
create index trip_locations_booking_idx on trip_locations (booking_id, recorded_at desc);

alter table trip_locations enable row level security;
-- The owner and the customer of the trip (and Kar) can see it; rows are written only by report_trip_location().
create policy "trip locations parties" on trip_locations for select
  using (public.is_booking_party(booking_id) or public.is_admin());

-- The customer's phone sends fixes in batches (a background task can deliver several at once):
-- [{ "lat": 4.38, "lng": 100.96, "accuracy": 12, "speed": 8.3, "t": "2026-10-21T08:00:00Z" }, ...]
-- Fixes for a trip that isn't active are ignored rather than rejected, so a phone that keeps reporting after
-- the return doesn't loop on errors. Returns how many fixes were stored.
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
    -- Phone clocks drift: keep the time inside the trip and never in the future.
    least(greatest(coalesce((f->>'t')::timestamptz, now()), b.picked_up_at), now())
  from (select f from jsonb_array_elements(fixes) f limit 120) x
  where f ? 'lat' and f ? 'lng'
    and (f->>'lat')::double precision between -90 and 90
    and (f->>'lng')::double precision between -180 and 180;
  get diagnostics n = row_count;
  return n;
end $$;

-- Latest fix for each of these bookings (My cars shows one pin per car). Security invoker: RLS applies.
create or replace function public.latest_trip_locations(b_ids uuid[])
returns setof trip_locations
language sql stable set search_path = public as $$
  select distinct on (booking_id) * from trip_locations
  where booking_id = any(b_ids)
  order by booking_id, recorded_at desc;
$$;

-- PDPA: trip routes are kept for 30 days (long enough for claims, summons and police reports), then deleted.
create or replace function public.purge_old_trip_locations() returns int
language sql security definer set search_path = public as $$
  with x as (delete from trip_locations where created_at < now() - interval '30 days' returning 1)
  select count(*)::int from x;
$$;
revoke execute on function public.purge_old_trip_locations() from public, anon, authenticated;
select cron.schedule('purge-trip-locations', '17 3 * * *', 'select public.purge_old_trip_locations()');

-- ---------------------------------------------------------------------------
-- Audit fix: trip photo files can only be replaced by whoever took them, and only during the trip.
-- Before, either party could overwrite any photo file at any time, even after the return
-- (the trip_photos rows were locked, but the image files behind them weren't).
-- ---------------------------------------------------------------------------
drop policy if exists "trip photos retake" on storage.objects;
create policy "trip photos retake" on storage.objects for update to authenticated
  using (
    bucket_id = 'trip-photos'
    and owner_id = (select auth.uid())::text
    and exists (select 1 from bookings b
                where b.id = ((storage.foldername(name))[1])::uuid and b.status in ('confirmed', 'active'))
  )
  with check (bucket_id = 'trip-photos' and owner_id = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Audit fix: an owner removed by Kar can't switch their cars back on.
-- ---------------------------------------------------------------------------
create or replace function public.protect_car_columns() returns trigger
language plpgsql set search_path = public as $$
declare strikes int; strike_limit int; still_owner boolean;
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.is_approved := old.is_approved;
    new.owner_id := old.owner_id;
    new.rejected_at := old.rejected_at;
    if not old.is_approved then new.is_listed := old.is_listed; end if;

    select p.owner_strikes, s.owner_strike_limit, p.is_owner into strikes, strike_limit, still_owner
    from profiles p, platform_settings s where p.id = old.owner_id;
    if new.is_listed and not old.is_listed then
      -- Removed from the pilot by Kar (admin_set_owner): only Kar can bring the cars back.
      if not still_owner then
        raise exception 'Your owner account is paused. Contact Kar to relist.';
      end if;
      -- An owner hidden for cancellation strikes cannot relist until Kar resets the strikes.
      if strikes >= strike_limit then
        raise exception 'Your cars are hidden after % cancellations. Contact Kar to relist.', strike_limit;
      end if;
    end if;

    -- A different car (make, model, year or plate) goes back to Kar for review.
    if old.is_approved and (new.make, new.model, new.year, new.plate)
                           is distinct from (old.make, old.model, old.year, old.plate) then
      new.is_approved := false;
      new.is_listed := false;
    end if;
    -- A rejected owner who fixes the car details goes back into the review queue.
    if old.rejected_at is not null and (new.make, new.model, new.year, new.plate, new.photos)
                                       is distinct from (old.make, old.model, old.year, old.plate, old.photos) then
      new.rejected_at := null;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Audit fix: once Kar has approved an ID, the name owners see can't be changed by re-submitting the form.
-- ---------------------------------------------------------------------------
create or replace function public.submit_verification(
  ic text, licence text, selfie text, l_class text, l_expiry date, p_phone text, p_full_name text
) returns void
language plpgsql security definer set search_path = public as $$
declare phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
        name text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if (select verification from profiles where id = auth.uid()) = 'verified' then
    raise exception 'Your ID is already verified. Contact Kar to change your details.';
  end if;
  if length(name) < 3 then raise exception 'Enter your full name as on your IC'; end if;
  if phone like '0%' then phone := '6' || phone; end if;
  if phone !~ '^601\d{8,9}$' then raise exception 'Enter a Malaysian mobile number, e.g. 012-345 6789'; end if;
  if l_expiry is not null and l_expiry < (now() at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Your licence has expired';
  end if;
  insert into verifications (user_id, ic_path, licence_path, selfie_path, licence_class, licence_expiry)
  values (auth.uid(), ic, licence, selfie, l_class, l_expiry);
  insert into profile_private (user_id, phone) values (auth.uid(), phone)
  on conflict (user_id) do update set phone = excluded.phone;
  update profiles set full_name = left(name, 80), verification = 'pending' where id = auth.uid();
end $$;
