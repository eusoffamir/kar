-- Pickup and return need 5 photos instead of 7: the four sides and the fuel gauge (evidence for damage and
-- the same-fuel-level rule). Interior and odometer are optional, so one failed photo no longer blocks a trip.

create or replace function public.required_photos_taken(b_id uuid, p photo_phase) returns boolean
language sql stable security definer set search_path = public as $$
  select count(distinct slot) = 5 from trip_photos
  where booking_id = b_id and phase = p and slot in ('front', 'back', 'left', 'right', 'fuel');
$$;

create or replace function public.start_trip(b_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select verification from profiles where id = auth.uid()) <> 'verified' then
    raise exception 'Kar is still checking your ID. You can pick up once it is approved.';
  end if;
  if not public.required_photos_taken(b_id, 'before') then
    raise exception 'Take the front, back, both sides and fuel gauge photos first';
  end if;
  update bookings set status = 'active', picked_up_at = now()
  where id = b_id and customer_id = auth.uid() and status = 'confirmed'
    and now() >= starts_at - interval '30 minutes';
  if not found then raise exception 'Trip cannot be started yet'; end if;
end $$;

create or replace function public.complete_return(b_id uuid, lat double precision, lng double precision, note text)
returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; ps platform_settings; late_rate numeric; late_hours int;
begin
  select * into ps from platform_settings;
  if not public.required_photos_taken(b_id, 'after') then
    raise exception 'Take the front, back, both sides and fuel gauge photos first';
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
