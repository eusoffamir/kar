# Kar: P2P car rental (UTP pilot)

Kar is a marketplace that connects people who own cars ("owners") with people who want to rent them ("customers"). Kar does not own any cars itself.

There is one codebase, built with Expo, React Native and TypeScript. It runs as an **Android app** and as a **web app**. Supabase provides the database, sign-in, file storage and server functions.

## Run it (demo mode, no setup)

```bash
npm install
npx expo start          # press w for web, or scan the QR code with Expo Go on Android
```

Without a `.env.local` file, the app runs in **demo mode**:
- It uses sample UTP cars, owners and trips stored on the device.
- **Account → Demo mode** switches between the customer (Hakim) and the owners (Aiman, Siti), so you can show both sides of the marketplace to owners and students.

## Connect a real backend (Supabase, free tier)

1. Create a project at supabase.com. Choose the Singapore region, which is the closest to Malaysia.
2. Apply the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_REF
   npx supabase db push
   ```
   Alternatively, paste [supabase/migrations/20261013000000_init.sql](supabase/migrations/20261013000000_init.sql) into the SQL editor.
3. Add the zone in the SQL editor:
   ```sql
   insert into zones (id, name, center_lat, center_lng) values ('utp', 'UTP, Seri Iskandar', 4.385, 100.979);
   ```
4. Schedule the cleanup of unpaid bookings:
   - In the Supabase dashboard, open Database → Extensions and enable **pg_cron**.
   - Run this in the SQL editor:
     ```sql
     select cron.schedule('expire-unpaid', '*/5 * * * *', 'select public.expire_unpaid_bookings()');
     ```
5. Copy `.env.example` to `.env.local` and fill in the project URL and anon key. Then restart `npx expo start`.
6. Make yourself an admin:
   ```sql
   update profiles set is_admin = true where id = '<your user id>';
   ```
   Admins approve cars (`is_approved`) and ID checks (`verification`) in Supabase Studio.

`supabase/seed.sql` only adds demo users and cars to a **local** database (`npx supabase db reset`). Never run it on production.

## Payments (Billplz: FPX, DuitNow, e-wallets)

1. Open a Billplz account under the SSM registration and the Maybank business account.
2. Create a collection, and copy the API key and X-Signature key.
3. Set the secrets and deploy the functions:
   ```bash
   npx supabase secrets set BILLPLZ_API_KEY=... BILLPLZ_COLLECTION_ID=... BILLPLZ_X_SIGNATURE=... BILLPLZ_SANDBOX=true APP_URL=https://your-domain/
   npx supabase functions deploy create-payment
   npx supabase functions deploy billplz-webhook --no-verify-jwt
   ```
4. Test with the sandbox first. When everything works, set `BILLPLZ_SANDBOX=false`.

Never put API keys in the app code or in chat messages. They belong only in Supabase secrets.

## How the rules are enforced

All rules are enforced in the database ([migration](supabase/migrations/20261013000000_init.sql)), so a modified app cannot get around them:

| Rule | Where |
|---|---|
| Prices, fees and deposit are calculated on the server; client values are ignored | `bookings_before_insert` trigger, `platform_settings` |
| No double-booking | `bookings_no_overlap` exclusion constraint |
| A trip can only start after 7 "before" photos | `start_trip()` |
| A return needs 7 "after" photos and a parking pin, and that pin becomes the car's "last parked" location | `complete_return()` |
| Key box code is shown only to the booked customer, from 30 minutes before pickup | `car_secrets` and `car_keybox_code()` |
| Phone numbers are shared only between the two people in a confirmed booking (PDPA) | `profile_private` row-level security |
| Owners can block customers; admins can blacklist them across the platform | `owner_blocks`, `profiles.is_blacklisted` |
| Unpaid bookings release their time slot after 15 minutes | `expire_unpaid_bookings()` |

Fee rates are set in the `platform_settings` table:
- `customer_fee_rate` is 5%.
- `owner_commission_rate` is 0% while the pilot runs; the plan is 10%.
- `src/lib/pricing.ts` must use the same numbers, because it shows the price preview in the app.

## Project layout

```
src/app/(tabs)/       Explore (map + list), Trips, Host (owner dashboard), Account
src/app/car/[id]      Car page: time picker, price breakdown, book & pay
src/app/trip/[id]     Customer trip: pay → pickup → before photos → drive → return
src/app/host/         Owner: list a car, booking detail with before/after photo comparison
src/components/       UI kit, map (native: react-native-maps, web: MapLibre + OpenFreeMap), photo checklist
src/lib/              Backend interface + demo and Supabase implementations, pricing, formatting
supabase/             SQL migration, seed, edge functions (Billplz)
```

## Checks

```bash
npx tsc --noEmit && npx expo lint
```

## Next up

1. Owner push notifications. The `push_tokens` table and a hook point in `billplz-webhook` are ready.
2. ID upload screen, using the `verifications` table and storage bucket.
3. Damage claims, using the `claims` table.
4. Automatic deposit refunds.
5. Weekly owner payouts.
6. Car photo upload when listing a car.
7. Android build for the Play Store:
   ```bash
   npx eas-cli@latest build -p android
   ```
