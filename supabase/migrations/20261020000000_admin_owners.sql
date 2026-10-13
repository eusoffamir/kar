-- Admin screen: make a vetted rental operator an owner (or remove them) by email, instead of SQL.

create or replace function public.admin_set_owner(p_email text, make boolean) returns text
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid; name text;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'No Kar account with that email. Ask them to log in to Kar once first.'; end if;
  update profiles set is_owner = make where id = uid returning full_name into name;
  -- Removing an owner hides their cars; existing bookings are left for Kar to handle.
  if not make then update cars set is_listed = false where owner_id = uid; end if;
  return coalesce(nullif(name, ''), p_email);
end $$;

create or replace function public.admin_owners()
returns table (id uuid, full_name text, email text, cars int, strikes int)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
  select p.id, p.full_name, u.email::text, (select count(*)::int from cars c where c.owner_id = p.id), p.owner_strikes
  from profiles p join auth.users u on u.id = p.id
  where p.is_owner
  order by p.full_name;
end $$;
