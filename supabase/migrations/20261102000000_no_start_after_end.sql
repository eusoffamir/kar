-- A trip can't be started once its end time has passed (a missed pickup stays "confirmed" until
-- the owner marks a no-show). Same as 20261027000000_licence_expiry.sql plus the end-time check.
create or replace function public.start_trip(b_id uuid) returns void
language plpgsql security definer set search_path = public as $$
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
  if not public.required_photos_taken(b_id, 'before') then
    raise exception 'Take the front, back, both sides and fuel gauge photos first';
  end if;
  update bookings set status = 'active', picked_up_at = now()
  where id = b_id and customer_id = auth.uid() and status = 'confirmed'
    and now() >= starts_at - interval '30 minutes' and now() < ends_at;
  if not found then raise exception 'Trip cannot be started yet'; end if;
end $$;
