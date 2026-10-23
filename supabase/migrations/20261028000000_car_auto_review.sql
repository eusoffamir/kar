-- Kar checks cars itself. A new or edited car that passes every check goes live straight away;
-- anything odd waits for Kar with the reasons shown. Auto-approved cars stay in an "Auto-approved"
-- list on the admin screen until Kar has looked at them, and Kar can take any car down at any time.
-- Nothing here is campus-specific: the same checks run in every area.

alter table platform_settings
  add column car_auto_approve boolean not null default true,  -- false: every car waits for Kar, as before
  add column car_min_photos int not null default 3,
  add column car_min_price_per_hour numeric(10,2) not null default 3,
  add column car_max_price_per_hour numeric(10,2) not null default 30,
  add column car_min_price_per_day numeric(10,2) not null default 30,
  add column car_max_price_per_day numeric(10,2) not null default 300,
  add column car_max_deposit numeric(10,2) not null default 500;

alter table cars
  add column review_flags text[] not null default '{}',  -- why the checker sent the car to Kar
  add column auto_approved_at timestamptz;              -- set by the checker, cleared once Kar has looked

-- Reasons a car needs a human. Empty means it passes.
create or replace function public.car_review_flags(c cars) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare ps platform_settings; p profiles; flags text[] := '{}';
        norm_plate text := upper(regexp_replace(c.plate, '\s', '', 'g'));
        today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
        n_photos int := coalesce(array_length(c.photos, 1), 0);
begin
  select * into ps from platform_settings;
  select * into p from profiles where id = c.owner_id;

  if p.operator_insured_until is null or p.operator_insured_until < today then
    flags := flags || 'Owner''s permit and insurance are not approved or have expired'::text;
  end if;
  if not p.is_owner then flags := flags || 'Owner account is paused'::text; end if;
  if p.is_blacklisted then flags := flags || 'Owner is banned'::text; end if;
  if p.owner_strikes > 0 then
    flags := flags || format('Owner has %s cancellation strike(s)', p.owner_strikes);
  end if;
  -- Kar looks at each owner's first car by hand, so it knows what their listings look like.
  if not exists (select 1 from cars x where x.owner_id = c.owner_id and x.id <> c.id
                 and x.is_approved and x.auto_approved_at is null) then
    flags := flags || 'First car from this owner'::text;
  end if;

  if norm_plate !~ '^[A-Z]{1,3}[0-9]{1,4}[A-Z]?$' then
    flags := flags || 'Plate doesn''t look like a normal Malaysian plate'::text;
  end if;
  if exists (select 1 from cars x where x.id <> c.id and upper(regexp_replace(x.plate, '\s', '', 'g')) = norm_plate) then
    flags := flags || 'Another car on Kar has the same plate'::text;
  end if;
  if c.year < extract(year from now())::int - 20 or c.year > extract(year from now())::int + 1 then
    flags := flags || 'Car year looks wrong'::text;
  end if;
  if n_photos < ps.car_min_photos then
    flags := flags || format('Only %s photo(s), checker wants %s', n_photos, ps.car_min_photos);
  end if;
  if c.price_per_hour not between ps.car_min_price_per_hour and ps.car_max_price_per_hour
     or c.price_per_day not between ps.car_min_price_per_day and ps.car_max_price_per_day then
    flags := flags || format('Unusual price: RM%s/h, RM%s/day', c.price_per_hour, c.price_per_day);
  end if;
  if c.deposit > ps.car_max_deposit then
    flags := flags || format('High deposit: RM%s', c.deposit);
  end if;
  return flags;
end $$;
revoke execute on function public.car_review_flags(cars) from public, anon, authenticated;

-- Runs after an owner adds or edits a car that is waiting for Kar. Runs after the save (not before)
-- because the "cars owner insert" policy rejects rows that are already approved.
create or replace function public.auto_review_car() returns trigger
language plpgsql security definer set search_path = public as $$
declare flags text[]; auto boolean; entered_queue boolean;
begin
  -- Skip our own update below, Kar's decisions, and cars that aren't waiting.
  if pg_trigger_depth() > 1 or auth.uid() is distinct from new.owner_id or public.is_admin()
     or new.is_approved or new.rejected_at is not null then
    return null;
  end if;

  flags := public.car_review_flags(new);
  select car_auto_approve into auto from platform_settings;
  entered_queue := tg_op = 'INSERT' or old.is_approved or old.rejected_at is not null;

  if auto and cardinality(flags) = 0 then
    update cars set is_approved = true, is_listed = true, review_flags = '{}', auto_approved_at = now()
    where id = new.id;
    perform public.notify(new.owner_id, 'Your car is live',
      new.make || ' ' || new.model || ' (' || new.plate || ') passed Kar''s checks. Renters can book it now.',
      '/host/car/' || new.id);
  else
    update cars set review_flags = flags, auto_approved_at = null where id = new.id;
    if entered_queue then
      perform public.notify_admins('Car to approve', new.make || ' ' || new.model || ' (' || new.plate || '): '
        || coalesce(nullif(array_to_string(flags, ', '), ''), 'auto-approve is off'));
    end if;
  end if;
  return null;
end $$;

create trigger cars_auto_review after insert or update on cars
  for each row execute function public.auto_review_car();

-- This trigger now handles the admin alert for cars, with the reasons included.
drop trigger cars_admin_queue on cars;

-- Same as before, plus: owners can't edit the checker's results (or hide a car from Kar's spot-check list).
create or replace function public.protect_car_columns() returns trigger
language plpgsql set search_path = public as $$
declare strikes int; strike_limit int; still_owner boolean;
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.is_approved := old.is_approved;
    new.owner_id := old.owner_id;
    new.rejected_at := old.rejected_at;
    new.review_flags := old.review_flags;
    new.auto_approved_at := old.auto_approved_at;
    if not old.is_approved then new.is_listed := old.is_listed; end if;

    select p.owner_strikes, s.owner_strike_limit, p.is_owner into strikes, strike_limit, still_owner
    from profiles p, platform_settings s where p.id = old.owner_id;
    if new.is_listed and not old.is_listed then
      -- Removed from the pilot by Kar (admin_set_owner): only Kar can bring the cars back.
      if not still_owner then
        raise exception 'Your owner account is paused. Contact Kar to relist.';
      end if;
      -- An owner hidden for cancellation strikes cannot relist until Kar resets the strikes.
      if strikes >= strike_limit then
        raise exception 'Your cars are hidden after % cancellations. Contact Kar to relist.', strike_limit;
      end if;
    end if;

    -- A different car (make, model, year or plate) goes back to Kar for review.
    if old.is_approved and (new.make, new.model, new.year, new.plate)
                           is distinct from (old.make, old.model, old.year, old.plate) then
      new.is_approved := false;
      new.is_listed := false;
    end if;
    -- A rejected owner who fixes the car details goes back into the review queue.
    if old.rejected_at is not null and (new.make, new.model, new.year, new.plate, new.photos)
                                       is distinct from (old.make, old.model, old.year, old.plate, old.photos) then
      new.rejected_at := null;
    end if;
  end if;
  return new;
end $$;

-- Kar's decision (approve after a check, or take down) clears the auto-approved mark.
create or replace function public.admin_approve_car(c_id uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare insured date;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if approve then
    select p.operator_insured_until into insured from cars c join profiles p on p.id = c.owner_id where c.id = c_id;
    if insured is null or insured < (now() at time zone 'Asia/Kuala_Lumpur')::date then
      raise exception 'Approve the owner''s permit and insurance first';
    end if;
  end if;
  update cars set is_approved = approve, is_listed = approve, auto_approved_at = null,
    review_flags = case when approve then '{}' else review_flags end,
    rejected_at = case when approve then null else now() end
  where id = c_id;
  if not found then raise exception 'Car not found'; end if;
end $$;
