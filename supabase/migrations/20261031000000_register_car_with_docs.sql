-- One "Register your car" flow for everyone: students and rental operators add their car straight away
-- (operators send their business documents in the same flow). Any signed-in user may now save a car, but it
-- always starts hidden: the auto-review flags it (permit and insurance not approved, first car from this
-- owner), so it waits for Kar. Only cars Kar approves can be booked, so renters see nothing new until then.

drop policy if exists "cars owner insert" on cars;
create policy "cars owner insert" on cars for insert with check (
  owner_id = (select auth.uid()) and not is_approved
);
