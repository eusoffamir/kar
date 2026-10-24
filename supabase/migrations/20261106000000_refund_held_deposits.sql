-- One time: Kar stops holding deposits on older bookings too (see 20261105000000_no_deposits.sql).
-- 1. Trips not returned yet (waiting for the owner, confirmed, on the trip): the whole deposit goes back to
--    the renter now through CHIP. The deposit also comes off total_charged, because owner cancel, decline,
--    unanswered request and ID rejection refund total_charged: without this they'd refund the deposit twice.
--    deposit becomes 0, so a late fee on these trips is owed to the owner directly, like new bookings.
-- 2. Returned trips: settled now with the usual rule (owner gets the late fee and approved damage, the renter
--    the rest). A booking with an open damage claim is skipped and finishes the normal way.
-- Renters and owners get a notification. run_refunds() at the end sends the refunds to CHIP straight away.

do $$
declare r record;
begin
  for r in
    select b.id, b.customer_id, b.owner_id, b.deposit, c.make || ' ' || c.model as car
    from bookings b join cars c on c.id = b.car_id
    where b.deposit_status = 'held' and b.deposit > 0 and b.status in ('requested', 'confirmed', 'active')
    for update of b
  loop
    update bookings set deposit_status = 'returned', deposit_refund = r.deposit, deposit_to_owner = 0,
      total_charged = total_charged - r.deposit, deposit = 0
    where id = r.id;
    insert into payments (booking_id, user_id, type, amount, status, raw)
    values (r.id, r.customer_id, 'refund', r.deposit, 'pending', jsonb_build_object('reason', 'deposit'));
    perform public.notify(r.customer_id, 'Deposit refunded',
      'Kar no longer holds deposits. Your RM' || to_char(r.deposit, 'FM999990.00') || ' deposit for ' || r.car || ' is on its way back to you.',
      '/trip/' || r.id);
    perform public.notify(r.owner_id, 'Deposit refunded to the renter',
      'Kar no longer holds deposits, so the deposit for ' || r.car || ' went back to the renter. Ask them directly if you want one.',
      '/host/booking/' || r.id);
  end loop;

  for r in select id from bookings where deposit_status = 'held' and status in ('returned', 'closed') loop
    perform public.settle_deposit(r.id);
  end loop;
end $$;

select public.run_refunds();
