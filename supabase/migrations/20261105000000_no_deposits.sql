-- Kar no longer handles deposits. Any deposit is agreed and paid between the owner and the renter, outside Kar.
-- New bookings carry no deposit (deposit 0) and the CHIP payment is trip price + booking fee only.
-- Bookings that already have a deposit held by Kar finish as before (settle_deposit / run_refunds keep running).
-- Late fees: Kar still works out the fee at the return, but the renter pays the owner directly. Until the owner
-- (or a Kar admin) confirms it's paid, the renter can't book again (20261104000000_late_fee_above_deposit.sql).
-- Apply 20261104000000_late_fee_above_deposit.sql first.

-- 1. New bookings: no deposit. Same as 20261024000000_deposits_alerts.sql except the three deposit lines.
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

  -- Never trust prices from the client. Kar takes no deposit: any deposit is between the owner and the renter.
  new.status := 'pending_payment';
  new.expires_at := now() + ps.unpaid_booking_ttl;
  new.trip_amount := public.trip_price(c.price_per_hour, c.price_per_day, new.starts_at, new.ends_at);
  new.customer_fee := greatest(round(new.trip_amount * ps.customer_fee_rate, 2), ps.min_customer_fee);
  new.owner_commission := round(new.trip_amount * ps.owner_commission_rate, 2);
  new.deposit := 0;
  new.deposit_status := 'with_owner';
  new.total_charged := new.trip_amount + new.customer_fee;
  new.owner_payout := new.trip_amount - new.owner_commission;
  new.late_fee_due := 0;
  new.cancellation_fee := 0;
  return new;
end $$;


-- 2. Cars no longer list a deposit.
update cars set deposit = 0 where deposit <> 0;

-- 3. Clearer wording now that there's no deposit on new bookings (same rule: fee above any Kar-held deposit).
create or replace function public.bookings_check_unpaid_late_fee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from bookings b where b.customer_id = new.customer_id and b.status in ('returned', 'closed')
             and b.late_fee_due > b.deposit and b.late_extra_paid_at is null) then
    raise exception 'You still owe an owner a late return fee. Pay them, and you can book again once they confirm it in Kar.';
  end if;
  return new;
end $$;

-- 4. The "late fee reached the deposit" alert no longer makes sense; the 30-minute overdue alert stays.
select cron.unschedule(jobid) from cron.job where jobname = 'late-fee-alerts';
drop function if exists public.late_fee_alerts();
