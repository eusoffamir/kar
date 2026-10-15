-- Backend check before the frontend push: profiles were readable by anyone on the internet (every user's full
-- name, plus who is an admin or blacklisted), storage accepted files of any size and type, and trip_price had
-- no fixed search_path (Supabase security advisor warning).

-- ---------------------------------------------------------------------------
-- Profiles: visible only where the app needs them (PDPA: no public list of users).
-- ---------------------------------------------------------------------------
drop policy if exists "profiles readable" on profiles;
create policy "profiles readable" on profiles for select using (
  id = (select auth.uid())
  or public.is_admin()
  -- Owners of cars on Explore (anyone browsing sees who they'd rent from).
  or exists (select 1 from cars c where c.owner_id = profiles.id and c.is_listed and c.is_approved)
  -- The other person in any of your bookings (owners see customers, customers see owners).
  or exists (select 1 from bookings b
             where (b.customer_id = (select auth.uid()) and b.owner_id = profiles.id)
                or (b.owner_id = (select auth.uid()) and b.customer_id = profiles.id))
);

-- ---------------------------------------------------------------------------
-- Storage: photos only, at most 10 MB each (the app uploads JPEGs well under 2 MB).
-- ---------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
where id in ('car-photos', 'trip-photos', 'verifications');

-- ---------------------------------------------------------------------------
-- Fixed search_path on the one function without it.
-- ---------------------------------------------------------------------------
alter function public.trip_price(numeric, numeric, timestamptz, timestamptz) set search_path = public;
