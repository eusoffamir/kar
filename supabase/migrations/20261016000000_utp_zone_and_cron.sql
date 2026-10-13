-- Production setup that used to be manual SQL-editor steps: the UTP zone and the 5-minute cleanup job
-- (releases unpaid bookings, declines unanswered requests with a refund).

insert into zones (id, name, center_lat, center_lng)
values ('utp', 'UTP, Seri Iskandar', 4.3845, 100.967)
on conflict (id) do nothing;

create extension if not exists pg_cron with schema pg_catalog;

-- cron.schedule with an existing job name updates that job, so re-running this is safe.
select cron.schedule('expire-unpaid', '*/5 * * * *', 'select public.expire_unpaid_bookings()');
