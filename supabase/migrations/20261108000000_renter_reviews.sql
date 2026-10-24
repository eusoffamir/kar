-- Owners rate renters too. Reviews already allow both sides (the "reviews insert" policy: either party of a
-- returned booking reviews the other). What changes:
-- 1. Two ratings per person: rating_avg/rating_count is the OWNER rating (from renters' reviews only, shown on
--    car cards and owner pages) and renter_rating_avg/renter_rating_count is the RENTER rating (from owners'
--    reviews only). Before, every review someone received went into one number.
-- 2. customer_reviews(): a renter's reviews from owners, readable only by that renter, owners who have a
--    booking with them, and Kar admins (renters' profiles stay private).

alter table profiles
  add column renter_rating_avg numeric(3,2),
  add column renter_rating_count int not null default 0;

-- Same as 20261023000000_goals_round.sql plus the two renter rating columns: users can't edit their ratings.
create or replace function public.protect_profile_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.is_admin := old.is_admin;
    new.is_owner := old.is_owner;
    new.verification := case
      when new.verification = 'pending' and old.verification in ('unverified', 'rejected') then 'pending'
      else old.verification end;
    new.is_blacklisted := old.is_blacklisted;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
    new.renter_rating_avg := old.renter_rating_avg;
    new.renter_rating_count := old.renter_rating_count;
    new.trips_count := old.trips_count;
    new.owner_strikes := old.owner_strikes;
    new.operator_insured_until := old.operator_insured_until;
    -- Owners see the name Kar checked against the IC: it can't be edited afterwards.
    if old.verification = 'verified' then new.full_name := old.full_name; end if;
  end if;
  return new;
end $$;

-- Recomputes both ratings of one person from their reviews.
create or replace function public.refresh_ratings(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles p set
    rating_count = o.cnt, rating_avg = o.avg,
    renter_rating_count = c.cnt, renter_rating_avg = c.avg
  from
    (select count(*) cnt, round(avg(r.rating)::numeric, 2) avg
     from reviews r join bookings b on b.id = r.booking_id
     where r.to_id = p_id and r.from_id = b.customer_id and r.to_id = b.owner_id) o,
    (select count(*) cnt, round(avg(r.rating)::numeric, 2) avg
     from reviews r join bookings b on b.id = r.booking_id
     where r.to_id = p_id and r.from_id = b.owner_id and r.to_id = b.customer_id) c
  where p.id = p_id;
end $$;
revoke execute on function public.refresh_ratings(uuid) from public, anon, authenticated;

create or replace function public.reviews_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_ratings(new.to_id);
  return new;
end $$;

-- Everyone who has been reviewed gets both numbers recomputed once.
select public.refresh_ratings(to_id) from (select distinct to_id from reviews) r;

create or replace function public.customer_reviews(c_id uuid)
returns table (rating int, comment text, created_at timestamptz, reviewer text)
language sql stable security definer set search_path = public as $$
  select r.rating, r.comment, r.created_at, split_part(btrim(p.full_name), ' ', 1)
  from reviews r
  join bookings b on b.id = r.booking_id and b.owner_id = r.from_id and b.customer_id = r.to_id
  join profiles p on p.id = r.from_id
  where r.to_id = c_id
    and (c_id = auth.uid() or public.is_admin()
         or exists (select 1 from bookings x where x.customer_id = c_id and x.owner_id = auth.uid()))
  order by r.created_at desc
  limit 50;
$$;
revoke all on function public.customer_reviews(uuid) from public;
grant execute on function public.customer_reviews(uuid) to authenticated;
