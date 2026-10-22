-- A driving licence that expires after Kar approved the ID no longer counts:
--   1. A booking must end on or before the licence expiry date.
--   2. Pickup and the key box code are blocked once the licence has expired.
--   3. Every night, customers with an expired licence go back to 'unverified' and are asked to upload the
--      renewed licence. Their bookings stay; they can pick up again once Kar approves the new licence.

-- Licence expiry from the customer's latest ID check that is approved or waiting for review.
create or replace function public.licence_expiry(p_user uuid) returns date
language sql stable security definer set search_path = public as $$
  select licence_expiry from verifications
  where user_id = p_user and status in ('verified', 'pending')
  order by created_at desc limit 1;
$$;
revoke execute on function public.licence_expiry(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Bookings
-- ---------------------------------------------------------------------------
create or replace function public.bookings_check_licence() returns trigger
language plpgsql security definer set search_path = public as $$
declare exp date := public.licence_expiry(new.customer_id);
begin
  if exp < (new.ends_at at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Your driving licence expires on %, before this trip ends. Renew it and upload the new licence first.',
      to_char(exp, 'DD Mon YYYY');
  end if;
  return new;
end $$;
create trigger bookings_licence_check before insert on bookings
  for each row execute function public.bookings_check_licence();

-- ---------------------------------------------------------------------------
-- 2. Pickup and key box code
-- ---------------------------------------------------------------------------
create or replace function public.start_trip(b_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.licence_expiry(auth.uid()) < (now() at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Your driving licence has expired. Upload your renewed licence in Kar to pick up.';
  end if;
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

create or replace function public.car_keybox_code(b_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select s.keybox_code
  from bookings b
  join car_secrets s on s.car_id = b.car_id
  join profiles p on p.id = b.customer_id
  where b.id = b_id
    and b.customer_id = auth.uid()
    and p.verification = 'verified'
    and coalesce(public.licence_expiry(p.id) >= (now() at time zone 'Asia/Kuala_Lumpur')::date, true)
    and b.status in ('confirmed', 'active')
    and now() between b.starts_at - interval '30 minutes' and b.ends_at;
$$;

-- ---------------------------------------------------------------------------
-- 3. Nightly: expired licence means the ID check has to be done again
-- ---------------------------------------------------------------------------
create or replace function public.expire_licences() returns int
language plpgsql security definer set search_path = public as $$
declare u uuid; n int := 0;
begin
  for u in
    select p.id from profiles p
    where p.verification = 'verified'
      and public.licence_expiry(p.id) < (now() at time zone 'Asia/Kuala_Lumpur')::date
  loop
    update profiles set verification = 'unverified' where id = u;
    perform public.notify(u, 'Driving licence expired',
      'Upload your renewed licence in Kar so you can keep picking up cars.', '/verify');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.expire_licences() from public, anon, authenticated;
select cron.schedule('expire-licences', '10 16 * * *', 'select public.expire_licences()');  -- 00:10 MYT
