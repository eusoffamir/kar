-- Owner profile page: renters tap the owner on a car page to see their rating, cars and reviews.
--
-- Reviews are readable by anyone, but the reviewers' profiles are not (PDPA: students' names stay private,
-- see 20261022000000_backend_hardening.sql). So this function returns an owner's reviews with only the
-- reviewer's first name, and only for owners whose cars are on Explore (the same owners whose profile anyone
-- may already read). Only reviews written by the renter of that booking count, not reviews owners write
-- about renters.

create or replace function public.owner_reviews(o_id uuid)
returns table (rating int, comment text, created_at timestamptz, reviewer text)
language sql stable security definer set search_path = public as $$
  select r.rating, r.comment, r.created_at, split_part(btrim(p.full_name), ' ', 1)
  from reviews r
  join bookings b on b.id = r.booking_id and b.customer_id = r.from_id and b.owner_id = r.to_id
  join profiles p on p.id = r.from_id
  where r.to_id = o_id
    and exists (select 1 from cars c where c.owner_id = o_id and c.is_listed and c.is_approved)
  order by r.created_at desc
  limit 50;
$$;

revoke all on function public.owner_reviews(uuid) from public;
grant execute on function public.owner_reviews(uuid) to anon, authenticated;
