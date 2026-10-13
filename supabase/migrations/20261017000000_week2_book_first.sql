-- Week 2: book first, get approved before pickup.
-- Students still upload their ID before paying, but can book while Kar reviews it. Pickup and the key box
-- code need an approved ID, and a rejected ID cancels the student's unstarted bookings with a full refund.
-- ID verification also records the full name (email sign-in never asks for one).

drop function if exists public.submit_verification(text, text, text, text, date, text);
create or replace function public.submit_verification(
  ic text, licence text, selfie text, l_class text, l_expiry date, p_phone text, p_full_name text
) returns void
language plpgsql security definer set search_path = public as $$
declare phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
        name text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
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
  update profiles set full_name = left(name, 80),
    verification = case when verification = 'verified' then verification else 'pending' end
  where id = auth.uid();
end $$;

-- Booking rules (replaces the P0 version): a submitted ID ('pending') is enough to book.
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

-- Pickup needs an approved ID.
create or replace function public.start_trip(b_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select verification from profiles where id = auth.uid()) <> 'verified' then
    raise exception 'Kar is still checking your ID. You can pick up once it is approved.';
  end if;
  if (select count(*) from trip_photos where booking_id = b_id and phase = 'before') < 7 then
    raise exception 'Take all 7 before photos first';
  end if;
  update bookings set status = 'active', picked_up_at = now()
  where id = b_id and customer_id = auth.uid() and status = 'confirmed'
    and now() >= starts_at - interval '30 minutes';
  if not found then raise exception 'Trip cannot be started yet'; end if;
end $$;

-- The key box code is only for an approved customer.
create or replace function public.car_keybox_code(b_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select s.keybox_code
  from bookings b
  join car_secrets s on s.car_id = b.car_id
  join profiles p on p.id = b.customer_id
  where b.id = b_id
    and b.customer_id = auth.uid()
    and p.verification = 'verified'
    and b.status in ('confirmed', 'active')
    and now() between b.starts_at - interval '30 minutes' and b.ends_at;
$$;

-- A rejected ID cancels the customer's bookings that haven't started; paid ones are refunded in full.
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

  if not approve then
    with x as (
      update bookings set status = 'cancelled', cancelled_by = 'system', cancel_reason = 'id_rejected',
        refund_amount = case when status = 'pending_payment' then 0 else total_charged end
      where customer_id = v.user_id and status in ('pending_payment', 'requested', 'confirmed')
      returning id, customer_id, total_charged, refund_amount
    )
    insert into payments (booking_id, user_id, type, amount, status)
    select id, customer_id, 'refund', total_charged, 'pending' from x where refund_amount > 0;
  end if;
end $$;
