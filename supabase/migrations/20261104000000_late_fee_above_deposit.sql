-- Late fees above the deposit. Kar only ever takes the deposit (settle_deposit); anything above it is owed
-- by the renter to the owner directly. Kar doesn't collect it, but the renter can't book again until the
-- owner (or a Kar admin) confirms it was paid. Owner, renter and Kar admins are alerted when a car on an
-- active trip runs up a late fee as big as the deposit.

alter table bookings
  add column late_extra_paid_at timestamptz,
  add column late_deposit_alerted_at timestamptz;

-- 1. No new bookings while a late fee above the deposit is unpaid.
create or replace function public.bookings_check_unpaid_late_fee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from bookings b where b.customer_id = new.customer_id and b.status in ('returned', 'closed')
             and b.late_fee_due > b.deposit and b.late_extra_paid_at is null) then
    raise exception 'You still owe an owner the part of a late fee above your deposit. Pay them, and you can book again once they confirm it in Kar.';
  end if;
  return new;
end $$;
create trigger bookings_unpaid_late_fee_check before insert on bookings
  for each row execute function public.bookings_check_unpaid_late_fee();

-- 2. The owner (or a Kar admin) confirms the renter paid the rest.
create or replace function public.mark_late_extra_paid(b_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update bookings set late_extra_paid_at = now()
  where id = b_id and late_fee_due > deposit and late_extra_paid_at is null
    and (owner_id = auth.uid() or exists (select 1 from profiles where id = auth.uid() and is_admin));
  if not found then raise exception 'Nothing to mark as paid on this booking'; end if;
end $$;

-- 3. Alert once when an active trip's late fee reaches the deposit (same fee rule as the return).
create or replace function public.late_fee_alerts() returns int
language plpgsql security definer set search_path = public as $$
declare ps platform_settings; r record; n int := 0;
begin
  select * into ps from platform_settings;
  for r in
    select b.id, b.owner_id, b.customer_id, b.deposit, c.make || ' ' || c.model as car
    from bookings b join cars c on c.id = b.car_id
    where b.status = 'active' and b.late_deposit_alerted_at is null
      and greatest(0, ceil(extract(epoch from (now() - b.ends_at - ps.late_grace)) / 3600))::int * c.late_fee_per_hour >= greatest(b.deposit, 0.01)
  loop
    perform public.notify(r.customer_id, 'Late fee is now above your deposit',
      'Return ' || r.car || ' now. The late fee above your deposit is owed to the owner, and you can''t book again until it is paid.', '/trip/' || r.id);
    perform public.notify(r.owner_id, 'Late fee reached the deposit',
      r.car || ' is still not back. Anything above the deposit is owed to you directly by the renter.', '/host/booking/' || r.id);
    perform public.notify_admins('Late fee reached the deposit', r.car || ' is still out and its late fee is past the deposit.');
    update bookings set late_deposit_alerted_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.late_fee_alerts() from public, anon, authenticated;
-- cron.schedule with an existing job name updates that job, so re-running is safe.
select cron.schedule('late-fee-alerts', '*/5 * * * *', 'select public.late_fee_alerts()');
