-- Student-owner waitlist. Private (student) cars can't be rented out on Kar until Kar has a P2P insurer and
-- APAD's go-ahead, so students who want to earn from their car join a waitlist instead. No money is taken.
-- It tells Kar how many cars are ready, how idle they are, and who wants Pro (tracker, lower fee), and the
-- count is what Kar shows insurers. Admins get a notification for each new car.

create table owner_waitlist (
  user_id uuid primary key references profiles(id) on delete cascade,
  zone_id text not null references zones(id),
  car text not null check (length(btrim(car)) between 3 and 60),   -- e.g. 'Perodua Myvi'
  car_year int not null check (car_year between 1990 and 2100),
  registered_to text not null check (registered_to in ('me', 'family', 'other')),  -- whose name is on the grant
  on_loan boolean not null,                                         -- hire purchase: the bank must agree to rentals
  free_days_per_week int not null check (free_days_per_week between 1 and 7),
  wants_pro boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table owner_waitlist enable row level security;
create policy "waitlist own" on owner_waitlist for select using (user_id = auth.uid());
-- Written only by join_owner_waitlist() and leave_owner_waitlist().

-- Join, or update your answers.
create or replace function public.join_owner_waitlist(
  p_zone text, p_car text, p_year int, p_registered_to text, p_on_loan boolean, p_free_days int, p_wants_pro boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare car_name text := btrim(regexp_replace(coalesce(p_car, ''), '\s+', ' ', 'g'));
        is_new boolean;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if not exists (select 1 from zones where id = p_zone and is_active) then raise exception 'Pick an area Kar operates in'; end if;
  if length(car_name) < 3 then raise exception 'Enter your car, e.g. Perodua Myvi'; end if;
  if p_year is null or p_year < 1990 or p_year > extract(year from now())::int + 1 then
    raise exception 'Enter the year your car was made';
  end if;
  if p_registered_to is null or p_registered_to not in ('me', 'family', 'other') then raise exception 'Choose whose name the car is in'; end if;
  if p_on_loan is null then raise exception 'Say whether the car is still on a loan'; end if;
  if p_free_days is null or p_free_days not between 1 and 7 then raise exception 'Choose how many days a week the car is free'; end if;

  is_new := not exists (select 1 from owner_waitlist where user_id = auth.uid());
  insert into owner_waitlist (user_id, zone_id, car, car_year, registered_to, on_loan, free_days_per_week, wants_pro)
  values (auth.uid(), p_zone, left(car_name, 60), p_year, p_registered_to, p_on_loan, p_free_days, coalesce(p_wants_pro, false))
  on conflict (user_id) do update set zone_id = excluded.zone_id, car = excluded.car, car_year = excluded.car_year,
    registered_to = excluded.registered_to, on_loan = excluded.on_loan, free_days_per_week = excluded.free_days_per_week,
    wants_pro = excluded.wants_pro, updated_at = now();
  if is_new then
    perform public.notify_admins('New car on the waitlist', format('%s (%s), free %s days a week', left(car_name, 60), p_year, p_free_days));
  end if;
end $$;

create or replace function public.leave_owner_waitlist() returns void
language sql security definer set search_path = public as $$
  delete from owner_waitlist where user_id = auth.uid();
$$;

-- Kar admin: everyone on the waitlist, oldest first, with their login email to contact them.
create or replace function public.admin_owner_waitlist()
returns table (user_id uuid, full_name text, email text, zone_id text, car text, car_year int, registered_to text,
               on_loan boolean, free_days_per_week int, wants_pro boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
  select w.user_id, p.full_name, u.email::text, w.zone_id, w.car, w.car_year, w.registered_to,
    w.on_loan, w.free_days_per_week, w.wants_pro, w.created_at
  from owner_waitlist w join profiles p on p.id = w.user_id join auth.users u on u.id = w.user_id
  order by w.created_at;
end $$;
