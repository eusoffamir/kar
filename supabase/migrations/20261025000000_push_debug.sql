-- Admin diagnostics for push notifications: the latest replies to the database's outgoing web requests
-- (pg_net), e.g. Expo's push service answering notify(). Admins only.
create or replace function public.admin_recent_http_responses(n int default 10)
returns table (id bigint, status_code int, content text, error_msg text, created timestamptz)
language plpgsql stable security definer set search_path = public, net as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
  select r.id, r.status_code, left(r.content::text, 400), r.error_msg, r.created
  from net._http_response r
  order by r.created desc
  limit greatest(1, least(n, 50));
end $$;
