-- Week 1 fixes before the first paid trip (from the app audit):
-- refunds on decline / unanswered requests, private parking spots and phone numbers, phone capture,
-- strikes and car edits that stick, invite-only owners, trip photo retakes, and admin tools for
-- car approval, refunds and owner payouts (paid by manual bank transfer, recorded here).

alter table platform_settings
  add column request_ttl interval not null default interval '2 hours';  -- owner must answer within this

-- Kar rejected the listing (set by admin_approve_car). Cleared when the owner changes the car details.
alter table cars add column rejected_at timestamptz;

-- One payout row per booking, so an owner can never be paid twice for the same trip.
create unique index payments_one_payout_idx on payments (booking_id) where type = 'payout';

-- ---------------------------------------------------------------------------
-- Declined or unanswered requests refund the customer in full
-- ---------------------------------------------------------------------------
create or replace function public.respond_to_booking(b_id uuid, accept boolean) returns booking_status
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  update bookings set
    status = case when accept then 'confirmed'::booking_status else 'declined'::booking_status end,
    cancelled_by = case when accept then null else 'owner' end,
    cancel_reason = case when accept then null else 'owner_declined' end,
    refund_amount = case when accept then null else total_charged end
  where id = b_id and owner_id = auth.uid() and status = 'requested'
  returning * into b;
  if b is null then raise exception 'Booking cannot be updated'; end if;
  if not accept then
    insert into payments (booking_id, user_id, type, amount, status)
    values (b.id, b.customer_id, 'refund', b.total_charged, 'pending');
  end if;
  return b.status;
end $$;

-- Runs every 5 minutes (pg_cron, see README): releases unpaid slots and declines requests the owner
-- didn't answer in time, with a refund.
create or replace function public.expire_unpaid_bookings() returns int
language plpgsql security definer set search_path = public as $$
declare ps platform_settings; unpaid int; unanswered int;
begin
  select * into ps from platform_settings;

  update bookings set status = 'cancelled', cancel_reason = 'payment_timeout', cancelled_by = 'system'
  where status = 'pending_payment' and expires_at < now();
  get diagnostics unpaid = row_count;

  with x as (
    update bookings set status = 'declined', cancel_reason = 'owner_no_response', cancelled_by = 'system',
      refund_amount = total_charged
    where status = 'requested' and (created_at < now() - ps.request_ttl or starts_at < now())
    returning id, customer_id, total_charged
  )
  insert into payments (booking_id, user_id, type, amount, status)
  select id, customer_id, 'refund', total_charged, 'pending' from x;
  get diagnostics unanswered = row_count;

  return unpaid + unanswered;
end $$;
revoke execute on function public.expire_unpaid_bookings() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privacy: parking spots and phone numbers
-- ---------------------------------------------------------------------------
-- Where a car is parked is visible to its owner and to the customer about to pick it up, never the public.
drop policy if exists "last location readable" on car_last_location;
create policy "last location parties" on car_last_location for select using (
  public.is_admin()
  or exists (select 1 from cars c where c.id = car_id and c.owner_id = (select auth.uid()))
  or exists (select 1 from bookings b
             where b.car_id = car_last_location.car_id and b.customer_id = (select auth.uid())
               and b.status in ('confirmed', 'active'))
);

-- Phone numbers: shown during a booking and for 24 hours after the return, then hidden again.
drop policy if exists "private self" on profile_private;
create policy "private self" on profile_private for select using (
  user_id = (select auth.uid()) or public.is_admin()
  or exists (select 1 from bookings b
             where (b.status in ('confirmed', 'active')
                    or (b.status = 'returned' and b.returned_at > now() - interval '24 hours'))
               and ((b.customer_id = (select auth.uid()) and b.owner_id = user_id)
                 or (b.owner_id = (select auth.uid()) and b.customer_id = user_id))));

-- ---------------------------------------------------------------------------
-- ID verification also captures the phone number (owners call/WhatsApp customers)
-- ---------------------------------------------------------------------------
drop function if exists public.submit_verification(text, text, text, text, date);
create or replace function public.submit_verification(
  ic text, licence text, selfie text, l_class text, l_expiry date, p_phone text
) returns void
language plpgsql security definer set search_path = public as $$
declare phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if phone like '0%' then phone := '6' || phone; end if;
  if phone !~ '^601\d{8,9}$' then raise exception 'Enter a Malaysian mobile number, e.g. 012-345 6789'; end if;
  if l_expiry is not null and l_expiry < (now() at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Your licence has expired';
  end if;
  insert into verifications (user_id, ic_path, licence_path, selfie_path, licence_class, licence_expiry)
  values (auth.uid(), ic, licence, selfie, l_class, l_expiry);
  insert into profile_private (user_id, phone) values (auth.uid(), phone)
  on conflict (user_id) do update set phone = excluded.phone;
  update profiles set verification = 'pending' where id = auth.uid() and verification <> 'verified';
end $$;

-- Verification rows are written only by submit_verification (no self-approved rows).
drop policy if exists "verifications insert own" on verifications;

-- ---------------------------------------------------------------------------
-- Owners: invite-only during the pilot; strikes and car edits stick
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.is_admin := old.is_admin;
    new.is_owner := old.is_owner;  -- Kar makes vetted rental operators owners
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

drop policy if exists "cars owner insert" on cars;
create policy "cars owner insert" on cars for insert with check (
  owner_id = (select auth.uid()) and not is_approved
  and exists (select 1 from profiles p where p.id = (select auth.uid()) and p.is_owner)
);

create or replace function public.protect_car_columns() returns trigger
language plpgsql set search_path = public as $$
declare strikes int; strike_limit int;
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.is_approved := old.is_approved;
    new.owner_id := old.owner_id;
    new.rejected_at := old.rejected_at;
    if not old.is_approved then new.is_listed := old.is_listed; end if;

    -- An owner hidden for cancellation strikes cannot relist until Kar resets the strikes.
    select p.owner_strikes, s.owner_strike_limit into strikes, strike_limit
    from profiles p, platform_settings s where p.id = old.owner_id;
    if new.is_listed and not old.is_listed and strikes >= strike_limit then
      raise exception 'Your cars are hidden after % cancellations. Contact Kar to relist.', strike_limit;
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
-- Trip photos: retakes allowed, and only while the trip is happening
-- ---------------------------------------------------------------------------
drop policy if exists "photos customer insert" on trip_photos;
create policy "photos party insert" on trip_photos for insert with check (
  uploaded_by = (select auth.uid()) and public.is_booking_party(booking_id)
  and exists (select 1 from bookings b where b.id = booking_id and b.status in ('confirmed', 'active'))
);
create policy "photos party retake" on trip_photos for update
  using (uploaded_by = (select auth.uid())
    and exists (select 1 from bookings b where b.id = booking_id and b.status in ('confirmed', 'active')))
  with check (uploaded_by = (select auth.uid()) and public.is_booking_party(booking_id));

create policy "trip photos retake" on storage.objects for update to authenticated
  using (bucket_id = 'trip-photos' and public.is_booking_party(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'trip-photos' and public.is_booking_party(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------------
-- Kar admin: car approval, refunds and owner payouts (manual bank transfers)
-- ---------------------------------------------------------------------------
create or replace function public.admin_approve_car(c_id uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update cars set is_approved = approve, is_listed = approve,
    rejected_at = case when approve then null else now() end
  where id = c_id;
  if not found then raise exception 'Car not found'; end if;
end $$;

-- After transferring the money, the admin records the bank reference here.
create or replace function public.admin_mark_refund_paid(p_id uuid, bank_ref text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update payments set status = 'paid',
    raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('bank_ref', bank_ref, 'paid_at', now(), 'paid_by', auth.uid())
  where id = p_id and type = 'refund' and status = 'pending';
  if not found then raise exception 'Refund is not pending'; end if;
end $$;

-- What each owner is owed: finished trips once the claim window has closed, plus cancellation and
-- no-show fees. Bookings already paid out are excluded.
create or replace function public.admin_payouts_due()
returns table (owner_id uuid, owner_name text, booking_ids uuid[], amount numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
  with ps as (select claim_window from platform_settings),
  due as (
    select b.id, b.owner_id,
      case when b.status in ('returned', 'closed') then b.owner_payout else b.cancellation_fee end as owed
    from bookings b, ps
    where ((b.status in ('returned', 'closed') and b.returned_at < now() - ps.claim_window)
        or (b.status in ('cancelled', 'no_show') and b.cancellation_fee > 0))
      and not exists (select 1 from payments p where p.booking_id = b.id and p.type = 'payout')
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
  select b.id, b.owner_id, 'payout',
    case when b.status in ('returned', 'closed') then b.owner_payout else b.cancellation_fee end,
    'bank', 'paid', jsonb_build_object('bank_ref', bank_ref, 'paid_at', now(), 'paid_by', auth.uid())
  from bookings b
  where b.id = any(b_ids) and b.status in ('returned', 'closed', 'cancelled', 'no_show')
  on conflict (booking_id) where type = 'payout' do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
