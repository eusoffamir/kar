-- A trip can only start with the renter's location: the owner watches the car during the trip (house rules),
-- so "Start trip" first gets a GPS fix and sends it here. It must be inside Peninsular Malaysia, and it is saved
-- as the trip's first point on the owner's live map. Same as 20261102000000_no_start_after_end.sql plus the
-- location. The old start_trip(uuid) is dropped so no app can start a trip without a location.

drop function if exists public.start_trip(uuid);

create or replace function public.start_trip(b_id uuid, p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path = public as $$
declare c_id uuid;
begin
  if public.licence_expiry(auth.uid()) < (now() at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Your driving licence has expired. Upload your renewed licence in Kar to pick up.';
  end if;
  if (select verification from profiles where id = auth.uid()) <> 'verified' then
    raise exception 'Kar is still checking your ID. You can pick up once it is approved.';
  end if;
  if exists (select 1 from bookings where id = b_id and customer_id = auth.uid() and now() >= ends_at) then
    raise exception 'This trip has already ended, so it can no longer be started';
  end if;
  if p_lat is null or p_lng is null or not public.in_peninsular_malaysia(p_lat, p_lng) then
    raise exception 'Turn on location for Kar to start the trip. The owner sees the car''s location during your trip.';
  end if;
  if not public.required_photos_taken(b_id, 'before') then
    raise exception 'Take the front, back, both sides and fuel gauge photos first';
  end if;
  update bookings set status = 'active', picked_up_at = now()
  where id = b_id and customer_id = auth.uid() and status = 'confirmed'
    and now() >= starts_at - interval '30 minutes' and now() < ends_at
  returning car_id into c_id;
  if not found then raise exception 'Trip cannot be started yet'; end if;
  insert into trip_locations (booking_id, car_id, lat, lng, recorded_at) values (b_id, c_id, p_lat, p_lng, now());
end $$;

-- Kar has no key box: the owner and renter arrange the key handover themselves. Every car stays on 'manual',
-- and no key box code is handed out any more.
update cars set handover = 'manual' where handover <> 'manual';
create or replace function public.cars_manual_handover() returns trigger
language plpgsql set search_path = public as $$
begin
  new.handover := 'manual';
  return new;
end $$;
drop trigger if exists cars_manual_handover on cars;
create trigger cars_manual_handover before insert or update on cars
  for each row execute function public.cars_manual_handover();

create or replace function public.car_keybox_code(b_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select null::text;
$$;
