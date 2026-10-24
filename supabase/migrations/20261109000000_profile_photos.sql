-- Profile photos, required for owners and renters so they recognise each other at the key handover.
-- Separate from the ID selfie (that stays private, for ID checks only).
-- 1. A public "avatars" bucket like car-photos: each user uploads only into their own folder, images up to 5 MB.
--    Profiles' visibility (who can read the row with the link) stays as it is.
-- 2. profiles.avatar_url, which must point at the user's own folder in that bucket.
-- 3. Renters can't book without a photo; owners can't add or relist a car without one.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars own upload" on storage.objects;
create policy "avatars own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- The column has been there unused since 20261013000000_init.sql.
alter table profiles add column if not exists avatar_url text;

create or replace function public.check_avatar_url() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.avatar_url is distinct from old.avatar_url and new.avatar_url is not null
     and new.avatar_url not like '%/storage/v1/object/public/avatars/' || new.id::text || '/%' then
    raise exception 'Upload your profile photo in Kar';
  end if;
  return new;
end $$;
drop trigger if exists profiles_avatar_check on profiles;
create trigger profiles_avatar_check before update on profiles
  for each row execute function public.check_avatar_url();

create or replace function public.bookings_check_photo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select avatar_url from profiles where id = new.customer_id) is null then
    raise exception 'Add a profile photo first (Profile → tap your picture), so the owner can recognise you at pickup.';
  end if;
  return new;
end $$;
drop trigger if exists bookings_photo_check on bookings;
create trigger bookings_photo_check before insert on bookings
  for each row execute function public.bookings_check_photo();

-- Owners editing their own cars only (Kar's approvals and checks run as the database, not as the owner).
create or replace function public.cars_check_owner_photo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = new.owner_id and not public.is_admin()
     and (tg_op = 'INSERT' or (new.is_listed and not old.is_listed))
     and (select avatar_url from profiles where id = new.owner_id) is null then
    raise exception 'Add a profile photo first (Profile → tap your picture), so renters can recognise you at the handover.';
  end if;
  return new;
end $$;
drop trigger if exists cars_owner_photo_check on cars;
create trigger cars_owner_photo_check before insert or update on cars
  for each row execute function public.cars_check_owner_photo();
