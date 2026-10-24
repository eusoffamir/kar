-- Phone numbers between owner and renter: during the booking and 24 hours after the return, as before, and
-- now also while a late fee is unpaid (the renter pays the owner directly, so they need to reach each other).
-- Same as 20261015000000_week1_fixes.sql plus the unpaid late fee case.
drop policy if exists "private self" on profile_private;
create policy "private self" on profile_private for select using (
  user_id = (select auth.uid()) or public.is_admin()
  or exists (select 1 from bookings b
             where (b.status in ('confirmed', 'active')
                    or (b.status = 'returned' and b.returned_at > now() - interval '24 hours')
                    or (b.status in ('returned', 'closed') and b.late_fee_due > b.deposit and b.late_extra_paid_at is null))
               and ((b.customer_id = (select auth.uid()) and b.owner_id = user_id)
                 or (b.owner_id = (select auth.uid()) and b.customer_id = user_id))));
