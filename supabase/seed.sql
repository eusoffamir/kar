-- Demo data for the UTP pilot. Runs automatically on `npx supabase db reset` (local dev only).

insert into zones (id, name, center_lat, center_lng) values
  ('utp', 'Universiti Teknologi PETRONAS', 4.3845, 100.9670)
on conflict (id) do nothing;

-- Demo users (password: kar1234). Local dev only — never run against production.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'owner@kar.test', crypt('kar1234', gen_salt('bf')), now(), '{"full_name":"Aiman (Owner)"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'owner2@kar.test', crypt('kar1234', gen_salt('bf')), now(), '{"full_name":"Siti Rentals"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'customer@kar.test', crypt('kar1234', gen_salt('bf')), now(), '{"full_name":"Hakim (Student)"}', '{}', now(), now())
on conflict (id) do nothing;

update profiles set is_owner = true, verification = 'verified', zone_id = 'utp'
  where id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2');
update profiles set verification = 'verified', zone_id = 'utp'
  where id = '00000000-0000-0000-0000-0000000000c1';

insert into cars (id, owner_id, zone_id, make, model, year, plate, transmission, seats, description,
                  price_per_hour, price_per_day, deposit, late_fee_per_hour, min_hours, instant_book,
                  handover, pickup_lat, pickup_lng, pickup_note, is_listed, is_approved)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'utp',
   'Perodua', 'Axia', 2021, 'AKB 1234', 'auto', 5, 'Jimat minyak, sesuai pergi Ipoh atau Seri Iskandar.',
   8, 70, 50, 10, 2, true, 'manual', 4.383593, 100.968997, 'Block 22 car park', true, true),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'utp',
   'Perodua', 'Myvi', 2022, 'AKC 5678', 'auto', 5, 'Myvi with Android Auto. Great for groups of 4.',
   10, 90, 100, 15, 2, true, 'keybox', 4.387979, 100.966957, 'Nadi@UTP car park', true, true),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a2', 'utp',
   'Proton', 'Saga', 2020, 'AJX 9012', 'manual', 5, 'Manual Saga, cheapest option on campus.',
   6, 55, 50, 8, 3, false, 'manual', 4.388276, 100.964503, 'V6 parking', true, true),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a2', 'utp',
   'Honda', 'City', 2019, 'AKA 3456', 'auto', 5, 'Comfortable sedan for long trips back home.',
   15, 130, 150, 20, 4, true, 'manual', 4.380584, 100.968903, 'Block 1 car park', true, true)
on conflict (id) do nothing;

insert into car_secrets (car_id, keybox_code) values ('10000000-0000-0000-0000-000000000002', '4821')
on conflict (car_id) do nothing;

insert into car_last_location (car_id, lat, lng, note) values
  ('10000000-0000-0000-0000-000000000001', 4.383305, 100.96899, 'Block 22, back row')
on conflict (car_id) do nothing;

-- Demo photos from Wikimedia Commons (CC BY / CC BY-SA / CC0).
update cars set photos = array['https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/2020_Perodua_Axia_Style_front.jpg/960px-2020_Perodua_Axia_Style_front.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/2020_Perodua_Axia_IX_rear.jpg/960px-2020_Perodua_Axia_IX_rear.jpg'] where id = '10000000-0000-0000-0000-000000000001';
update cars set photos = array['https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Perodua_Myvi_1.3_G_2022.jpg/960px-Perodua_Myvi_1.3_G_2022.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/2022_Perodua_MyVi_X_front.jpg/960px-2022_Perodua_MyVi_X_front.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/2022_Perodua_MyVi_X_rear.jpg/960px-2022_Perodua_MyVi_X_rear.jpg'] where id = '10000000-0000-0000-0000-000000000002';
update cars set photos = array['https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Proton_Saga_2019_White.jpg/960px-Proton_Saga_2019_White.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Proton_Saga_2019.jpg/960px-Proton_Saga_2019.jpg'] where id = '10000000-0000-0000-0000-000000000003';
update cars set photos = array['https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/2019_Honda_City_RS.jpg/960px-2019_Honda_City_RS.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/2019_Honda_City_SV.jpg/960px-2019_Honda_City_SV.jpg'] where id = '10000000-0000-0000-0000-000000000004';
