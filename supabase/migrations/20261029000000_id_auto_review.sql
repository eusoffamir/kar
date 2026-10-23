-- Kar checks renters' IDs itself. An ID that passes every check is approved straight away; anything odd
-- waits for Kar with the reasons shown. Auto-approved IDs stay in an "Auto-approved" list on the admin
-- screen until Kar has looked at the photos, and until then (or until the renter's first finished trip)
-- trips are capped at a short length, so a fake ID can't do much harm before a person sees it.
--
-- Campus email domains are a setting per area (zones.trusted_email_domain), not built into the code:
-- each new campus adds its own, and areas without one simply send IDs to Kar.

alter table zones add column trusted_email_domain text;  -- e.g. 'utp.edu.my'; null = no trusted domain
update zones set trusted_email_domain = 'utp.edu.my' where id = 'utp';

alter table platform_settings
  add column id_auto_approve boolean not null default true,  -- false: every ID waits for Kar, as before
  add column id_licence_min_days int not null default 30,    -- licence must be valid at least this long
  add column id_auto_max_trip_hours int not null default 24; -- trip cap until Kar has looked or one trip is done

alter table verifications
  add column review_flags text[] not null default '{}',  -- why the checker sent the ID to Kar
  add column auto_approved_at timestamptz;              -- set by the checker, cleared once Kar has looked

-- Reasons an ID needs a human. Empty means it passes.
create or replace function public.id_review_flags(v verifications) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare ps platform_settings; p profiles; flags text[] := '{}';
        email text; domain text; my_phone text;
        today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  select * into ps from platform_settings;
  select * into p from profiles where id = v.user_id;
  select lower(u.email) into email from auth.users u where u.id = v.user_id;
  domain := split_part(coalesce(email, ''), '@', 2);
  select phone into my_phone from profile_private where user_id = v.user_id;

  if not exists (select 1 from zones z where z.is_active and z.trusted_email_domain is not null
                 and (domain = lower(z.trusted_email_domain) or domain like '%.' || lower(z.trusted_email_domain))) then
    flags := flags || 'Email is not from a campus Kar trusts'::text;
  end if;
  if v.licence_class is null or upper(v.licence_class) not in ('D', 'DA') then
    flags := flags || 'Licence class is not D or DA'::text;
  end if;
  if v.licence_expiry is null or v.licence_expiry < today + ps.id_licence_min_days then
    flags := flags || format('Licence expires within %s days', ps.id_licence_min_days);
  end if;
  if p.is_blacklisted then flags := flags || 'Renter is banned'::text; end if;
  if exists (select 1 from verifications x where x.user_id = v.user_id and x.id <> v.id and x.status = 'rejected') then
    flags := flags || 'An earlier ID check was rejected'::text;
  end if;
  if my_phone is not null and exists (select 1 from profile_private x where x.phone = my_phone and x.user_id <> v.user_id) then
    flags := flags || 'Phone number is used by another account'::text;
  end if;
  if exists (select 1 from bookings b where b.customer_id = v.user_id
             and b.status in ('pending_payment', 'requested', 'confirmed')
             and b.ends_at - b.starts_at > make_interval(hours => ps.id_auto_max_trip_hours)) then
    flags := flags || format('Has a booking longer than %s hours', ps.id_auto_max_trip_hours);
  end if;
  return flags;
end $$;
revoke execute on function public.id_review_flags(verifications) from public, anon, authenticated;

-- Approves a new ID check if it is clean, otherwise records the reasons and tells Kar.
create or replace function public.auto_review_verification(v_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v verifications; flags text[]; auto boolean;
begin
  select * into v from verifications where id = v_id and status = 'pending';
  if v is null then return; end if;
  flags := public.id_review_flags(v);
  select id_auto_approve into auto from platform_settings;

  if auto and cardinality(flags) = 0 then
    -- The status change sends the renter the usual "ID approved" notification (notify_verification).
    update verifications set status = 'verified', reviewer_note = 'Approved by Kar''s automatic check',
      reviewed_at = now(), review_flags = '{}', auto_approved_at = now()
    where id = v_id;
    update profiles set verification = 'verified' where id = v.user_id;
  else
    update verifications set review_flags = flags where id = v_id;
    perform public.notify_admins('ID to check',
      coalesce(nullif(array_to_string(flags, ', '), ''), 'Auto-approve is off'));
  end if;
end $$;
revoke execute on function public.auto_review_verification(uuid) from public, anon, authenticated;

-- auto_review_verification now sends the admin alert for IDs, with the reasons included.
drop trigger verifications_admin_queue on verifications;

-- Same as before, plus the automatic check at the end.
create or replace function public.submit_verification(
  ic text, licence text, selfie text, l_class text, l_expiry date, p_phone text, p_full_name text
) returns void
language plpgsql security definer set search_path = public as $$
declare phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
        name text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
        v_id uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if (select verification from profiles where id = auth.uid()) = 'verified' then
    raise exception 'Your ID is already verified. Contact Kar to change your details.';
  end if;
  if length(name) < 3 then raise exception 'Enter your full name as on your IC'; end if;
  if phone like '0%' then phone := '6' || phone; end if;
  if phone !~ '^601\d{8,9}$' then raise exception 'Enter a Malaysian mobile number, e.g. 012-345 6789'; end if;
  if l_expiry is not null and l_expiry < (now() at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Your licence has expired';
  end if;
  insert into verifications (user_id, ic_path, licence_path, selfie_path, licence_class, licence_expiry)
  values (auth.uid(), ic, licence, selfie, l_class, l_expiry)
  returning id into v_id;
  insert into profile_private (user_id, phone) values (auth.uid(), phone)
  on conflict (user_id) do update set phone = excluded.phone;
  update profiles set full_name = left(name, 80), verification = 'pending' where id = auth.uid();
  perform public.auto_review_verification(v_id);
end $$;

-- Kar can now also review an auto-approved ID: "Looks good" clears the mark (no new notification),
-- "Reject" works exactly as for a pending ID (unstarted bookings cancelled and refunded in full).
create or replace function public.admin_review_verification(v_id uuid, approve boolean, note text) returns void
language plpgsql security definer set search_path = public as $$
declare v verifications;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update verifications set status = case when approve then 'verified'::verification_status else 'rejected'::verification_status end,
    reviewer_note = note, reviewed_at = now(), auto_approved_at = null
  where id = v_id and (status = 'pending' or (status = 'verified' and auto_approved_at is not null))
  returning * into v;
  if v is null then raise exception 'Nothing to review'; end if;
  update profiles set verification = v.status where id = v.user_id;

  if not approve then
    with x as (
      update bookings set status = 'cancelled', cancelled_by = 'system', cancel_reason = 'id_rejected',
        refund_amount = case when status = 'pending_payment' then 0 else total_charged end
      where customer_id = v.user_id and status in ('pending_payment', 'requested', 'confirmed')
      returning id, customer_id, total_charged, refund_amount
    )
    insert into payments (booking_id, user_id, type, amount, status)
    select id, customer_id, 'refund', total_charged, 'pending' from x where refund_amount > 0;
  end if;
end $$;

-- Until Kar has looked at an auto-approved ID, or the renter has finished a trip, trips stay short.
create or replace function public.bookings_check_new_renter() returns trigger
language plpgsql security definer set search_path = public as $$
declare max_hours int;
begin
  select id_auto_max_trip_hours into max_hours from platform_settings;
  if new.ends_at - new.starts_at > make_interval(hours => max_hours)
     and exists (select 1 from verifications v where v.user_id = new.customer_id
                 and v.status = 'verified' and v.auto_approved_at is not null)
     and not exists (select 1 from bookings b where b.customer_id = new.customer_id and b.status in ('returned', 'closed')) then
    raise exception 'Until Kar has checked your ID or you have finished your first trip, trips can be up to % hours.', max_hours;
  end if;
  return new;
end $$;
create trigger bookings_new_renter_check before insert on bookings
  for each row execute function public.bookings_check_new_renter();
