-- A booking still "confirmed" 24 hours after its end time was never picked up and nobody acted on it.
-- Kar marks it as a no-show by itself, with the same money rule as the owner's no-show button
-- (mark_no_show in 20261024000000_deposits_alerts.sql): the owner keeps late_cancel_rate (50%) of the
-- trip price, the customer gets the rest of the trip price plus any deposit Kar holds back through CHIP
-- (run_refunds picks up the pending refund), and the booking fee is not refunded.

create or replace function public.auto_no_show() returns int
language plpgsql security definer set search_path = public as $$
declare ps platform_settings; r record; fee numeric; refund numeric; n int := 0;
begin
  select * into ps from platform_settings;
  for r in
    select b.*, c.make || ' ' || c.model as car
    from bookings b join cars c on c.id = b.car_id
    where b.status = 'confirmed' and b.ends_at < now() - interval '24 hours'
    for update of b skip locked
  loop
    fee := round(r.trip_amount * ps.late_cancel_rate, 2);
    refund := r.trip_amount - fee + case when r.deposit_status::text = 'held' then r.deposit else 0 end;
    update bookings set status = 'no_show', cancelled_by = 'no_show', cancellation_fee = fee, refund_amount = refund
    where id = r.id and status = 'confirmed';
    if not found then continue; end if;
    insert into payments (booking_id, user_id, type, amount, status) values (r.id, r.customer_id, 'refund', refund, 'pending');
    perform public.notify(r.customer_id, 'Trip marked as no-show',
      r.car || ' was not picked up. RM' || to_char(refund, 'FM999990.00') || ' is on its way back to you.', '/trip/' || r.id);
    perform public.notify(r.owner_id, 'Trip marked as no-show',
      r.car || ' was not picked up. You keep RM' || to_char(fee, 'FM999990.00') || ' of the trip price.', '/trip/' || r.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.auto_no_show() from public, anon, authenticated;
-- Every hour at minute 25. cron.schedule with an existing job name updates that job, so re-running is safe.
select cron.schedule('auto-no-show', '25 * * * *', 'select public.auto_no_show()');
