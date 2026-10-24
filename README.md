# Kar: P2P car rental (UTP pilot)

Kar is a marketplace that connects people who own cars ("owners") with people who want to rent them ("customers"). Kar does not own any cars itself.

There is one codebase, built with Expo, React Native and TypeScript. It runs as an **iPhone app**, an **Android app** and a **web app**. Supabase provides the database, sign-in, file storage and server functions.

## Run it (demo mode, no setup)

```bash
npm install
npx expo start          # press w for web, or scan the QR code with Expo Go (iPhone or Android)
```

Without a `.env.local` file, the app runs in **demo mode**:
- It uses sample UTP cars, owners and trips stored on the device.
- **Profile → Demo mode** switches between accounts, so you can show every side of the marketplace:
  - **Hakim**: a verified student (customer)
  - **Nadia**: a new student who still has to verify her ID
  - **Aiman** and **Siti**: owners
  - **Kar Admin**: approves ID checks and decides disputed damage claims

## Business documents

[docs/](docs/) holds the business plan:
- [business model](docs/01-business-model.md)
- [financial model](docs/02-financial-model.md), plus the editable [spreadsheet](docs/Kar_Financial_Model.xlsx)
- [risk playbook](docs/03-risk-playbook.md)
- [roadmap](docs/04-roadmap.md)

## Connect a real backend (Supabase, free tier)

1. Create a project at supabase.com. Choose the Singapore region, which is the closest to Malaysia.
2. Apply the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_REF
   npx supabase db push
   ```
   This also adds the UTP zone and schedules the 5-minute cleanup job (pg_cron). The job releases unpaid bookings after 15 minutes and declines, with a refund, requests the owner hasn't answered within 2 hours.
   Alternatively, paste the migrations into the SQL editor, in this order:
   1. [init](supabase/migrations/20261013000000_init.sql)
   2. [P0 safety](supabase/migrations/20261014000000_p0_safety.sql)
   3. [Week 1 fixes](supabase/migrations/20261015000000_week1_fixes.sql)
   4. [UTP zone and cleanup job](supabase/migrations/20261016000000_utp_zone_and_cron.sql)
   5. [Week 2: book first](supabase/migrations/20261017000000_week2_book_first.sql)
   6. [CHIP payments](supabase/migrations/20261018000000_chip_payments.sql)
   7. [Fewer required photos](supabase/migrations/20261019000000_fewer_required_photos.sql)
   8. [Admin: owners](supabase/migrations/20261020000000_admin_owners.sql)
   9. [Live tracking](supabase/migrations/20261021000000_live_tracking.sql)
   10. [Backend hardening](supabase/migrations/20261022000000_backend_hardening.sql)
   11. [Goals round: fees, operator documents, selfie, notifications](supabase/migrations/20261023000000_goals_round.sql)
   12. [Deposits held by Kar, automatic refunds, misuse and admin alerts](supabase/migrations/20261024000000_deposits_alerts.sql)
   13. [Push debug](supabase/migrations/20261025000000_push_debug.sql)
   14. [Test cleanup](supabase/migrations/20261026000000_test_cleanup.sql)
   15. [Licence expiry](supabase/migrations/20261027000000_licence_expiry.sql)
   16. [Car auto-review](supabase/migrations/20261028000000_car_auto_review.sql): clean cars go live without waiting for Kar; odd ones are flagged. Turn it off with `update platform_settings set car_auto_approve = false;`
   17. [ID auto-review](supabase/migrations/20261029000000_id_auto_review.sql): clean IDs from a trusted campus email are approved at once, with trips capped at 24 hours until Kar has looked or the renter has finished a trip. Each area's trusted email domain is `zones.trusted_email_domain` (UTP: `utp.edu.my`). Turn it off with `update platform_settings set id_auto_approve = false;`
   18. [Student-owner waitlist](supabase/migrations/20261030000000_owner_waitlist.sql): students join from **Host → Student with a car?** (no money taken) until student cars can be insured. Kar sees the list under **Admin → Owners**.
   19. [Register your car](supabase/migrations/20261031000000_register_car_with_docs.sql): one **Host → Register your car** flow. Students and rental operators pick who they are and add their car; operators send their SSM, permit and insurance as the last step. Any signed-in user can save a car, but it always waits for Kar's approval before renters can book it.
   20. [Owner profile](supabase/migrations/20261101000000_owner_profile.sql): renters tap the owner on a car page to see their cars and reviews. Reviewers show by first name only, since students' profiles stay private.
   21. [No start after the end time](supabase/migrations/20261102000000_no_start_after_end.sql): a trip can't be started once its end time has passed. A missed pickup shows as "Not picked up" in the app.
   22. [Automatic no-show](supabase/migrations/20261103000000_auto_no_show.sql): a booking still confirmed 24 hours after its end time becomes a no-show by itself (hourly job), with the same money rule as the owner's no-show button. Both sides get a notification.
   23. [Late fee above the deposit](supabase/migrations/20261104000000_late_fee_above_deposit.sql): Kar only takes the deposit; the rest is owed to the owner directly. The renter can't book again until the owner (or a Kar admin) taps "They paid me". Owner, renter and admins get an alert when a late fee reaches the deposit.
3. Copy `.env.example` to `.env.local` and fill in the project URL, the anon key and `EXPO_PUBLIC_SUPPORT_WHATSAPP` (Kar's WhatsApp Business number). Then restart `npx expo start`. Set the same variables in EAS for builds. A release build without `EXPO_PUBLIC_SUPABASE_URL` refuses to start, unless `EXPO_PUBLIC_DEMO=1` is set for a demo build (no real payments).
4. Make yourself an admin:
   ```sql
   update profiles set is_admin = true where id = '<your user id>';
   ```
   Admins use the in-app **Admin** screen (Account → Kar admin) to approve ID checks and cars, decide disputed claims, and record refunds and owner payouts.
5. Owners are licensed, insured rental operators. They apply in the app (**Host → Apply as a rental operator**) with their SSM number, rental permit and insurance certificate, and approving the documents under **Admin → Operator documents** makes them an owner. You can still add one by email under **Admin → Owners → Make owner**, but their cars can't be approved until their documents are.
6. Kar's admins get push notifications (in the app store build) when an ID, operator documents, a car or a disputed claim is waiting.
7. Refunds go back through CHIP automatically. Owner payouts are sent by manual bank transfer. The Admin screen lists what is owed. After sending the money, enter the bank reference and tap **Mark paid**. Owners are paid for a trip once the 48-hour claim window has closed, plus any cancellation or no-show fees.

`supabase/seed.sql` only adds demo users and cars to a **local** database (`npx supabase db reset`). Never run it on production.

## Payments (CHIP: FPX, DuitNow QR, e-wallets)

[CHIP](https://www.chip-in.asia/pricing): RM1 per FPX payment, 1% DuitNow QR, next-day settlement, refunds by API.

1. Open a CHIP account under the SSM registration (Vendor Vision Solutions) with the business bank account. A personal account only gets FPX.
2. In the CHIP portal, open **Developers** and copy the **secret key** and **Brand ID**. Use the test-mode key first.
3. Set the secrets and deploy the functions:
   ```bash
   npx supabase secrets set CHIP_SECRET_KEY=... CHIP_BRAND_ID=... APP_URL=https://karsewa.expo.app/
   npx supabase functions deploy create-payment
   npx supabase functions deploy chip-callback --no-verify-jwt
   npx supabase functions deploy process-refunds --no-verify-jwt
   ```
4. Test a booking end to end with the test key. When everything works, swap in the live key with `npx supabase secrets set CHIP_SECRET_KEY=...`.

How the money moves:
- `create-payment` creates a CHIP purchase for the booking total that expires when the booking's 15-minute hold ends.
- CHIP calls `chip-callback` when it's paid. The function checks CHIP's signature, re-reads the purchase from CHIP and checks the amount before confirming the booking.
- Refunds (declines, cancellations, no-shows, unanswered requests, rejected IDs, deposits) are queued by the database and sent through CHIP by `process-refunds`. The app runs it right after the action, the database runs it every 10 minutes (`run_refunds`, with a secret only the database and the function can read), and the Admin screen has **Send refunds now** plus a manual bank-transfer fallback.
- The deposit is part of the payment. Kar holds it and refunds it 48 hours after the return (or when the owner confirms no damage), minus any late fee and approved damage, which are added to the owner's payout.

Never put API keys in the app code or in chat messages. They belong only in Supabase secrets.

## How the rules are enforced

All rules are enforced in the database ([init](supabase/migrations/20261013000000_init.sql), [P0 safety](supabase/migrations/20261014000000_p0_safety.sql) and [Week 1 fixes](supabase/migrations/20261015000000_week1_fixes.sql) migrations), so a modified app cannot get around them:

| Rule | Where |
|---|---|
| Prices and fees are calculated on the server; client values are ignored. The booking fee has a RM3 minimum. The deposit is paid with the booking and held by Kar | `bookings_before_insert` trigger, `platform_settings` |
| Deposit: refunded automatically 48h after the return, minus late fee and approved damage (paid to the owner). Refunded in full if the trip doesn't happen | `settle_deposit()`, `run_refunds()` (pg_cron, every 10 minutes), `owner_amount_due()` |
| Kar keeps its booking fee when the customer cancels or doesn't show up; owner cancellations, declines and Kar's own cancellations refund everything | `cancel_booking()`, `mark_no_show()` |
| An approved damage claim costs the owner a RM30 handling fee, taken from their payout | `owner_amount_due()`, `admin_payouts_due()` |
| Owners must have Kar-approved rental permit and insurance before any car is approved; cars are hidden when the insurance expires; listings show "Insured by operator" | `operator_documents`, `admin_review_operator()`, `admin_approve_car()`, `hide_uninsured_cars()` (daily) |
| The owner sees the renter's ID-checked selfie (never the IC) while the booking is confirmed or active | `customer_selfie_path()`, `renter selfie for owner` storage policy |
| A name checked against the IC can't be changed | `protect_profile_columns` |
| Push notifications for requests, confirmations, cancellations, ID results, claims, lost signal, overdue, leaving Peninsular Malaysia and speeding | `notify()` (pg_net → Expo push), `trip_alerts()` (every 5 minutes) |
| Customers who uploaded their ID (name, phone, IC, licence, selfie) and accepted the house rules can book straight away. Pickup and the key box code need Kar's approval; a rejected ID cancels unstarted bookings with a full refund | `bookings_before_insert`, `submit_verification()`, `start_trip()`, `car_keybox_code()`, `admin_review_verification()` |
| An expired driving licence no longer counts: a booking must end by the licence expiry date, pickup and the key box code are blocked after it, and each night the customer goes back to unverified and is asked to upload the renewed licence (bookings stay) | `bookings_check_licence()`, `start_trip()`, `car_keybox_code()`, `expire_licences()` (daily) |
| Damage claims: owner reports within 48h (up to the deposit), customer accepts or disputes once, Kar decides; the deposit is settled by the decision | `create_claim()`, `respond_to_claim()`, `admin_resolve_claim()` |
| Late return fee: per hour after a 15-minute grace period | `complete_return()` |
| Cancellation: trip price back until 24h before pickup, 50% of the trip after; owner no-show and owner cancellation rules | `cancel_booking()`, `mark_no_show()`, `owner_cancel_booking()` (3 strikes hides the owner's cars; Kar resets them under Admin → Owners) |
| A declined request, or one the owner doesn't answer within 2 hours, is refunded in full | `respond_to_booking()`, `expire_unpaid_bookings()` |
| Only owners set up by Kar can list cars. New cars, and cars whose make, model, year or plate change, wait for Kar approval | `cars owner insert` policy, `protect_car_columns`, `admin_approve_car()` |
| Refunds go back through CHIP once each (claimed before sending); payouts are recorded once each, with the bank reference | `admin_mark_refund_paid()`, `admin_payouts_due()`, `admin_record_payout()` |
| Get help / SOS reports are visible only to the two people in the booking and admins | `incidents` table and its security rules |
| No double-booking | `bookings_no_overlap` exclusion constraint |
| A trip can only start after 5 "before" photos (4 sides + fuel gauge; interior and odometer optional) | `start_trip()`, `required_photos_taken()` |
| A return needs the same 5 "after" photos and a parking pin, and that pin becomes the car's "last parked" location | `complete_return()` |
| Key box code is shown only to the booked customer, from 30 minutes before pickup | `car_secrets` and `car_keybox_code()` |
| Where a car is parked is visible only to its owner and the customer with a confirmed or active booking | `car_last_location` row-level security |
| During a trip the customer's phone reports the car's location about every 30 seconds; only the two people in the booking (and Kar) can see it, and it's deleted after 30 days | `trip_locations`, `report_trip_location()`, `purge_old_trip_locations()` (daily pg_cron job) |
| Trip photo files can only be replaced by whoever took them, and only while the trip is happening | `trip photos retake` storage policy |
| Phone numbers (collected at ID verification) are shared only between the two people in a booking, until 24h after the return (PDPA) | `profile_private` row-level security |
| Profiles (names, ratings) are visible only to the person, admins, the other person in a booking, and anyone viewing a listed car's owner. There is no public list of users | `profiles readable` policy |
| Uploads are photos only, at most 10 MB each | storage bucket limits |
| Owners can block customers; admins can blacklist them across the platform | `owner_blocks`, `profiles.is_blacklisted` |
| Unpaid bookings release their time slot after 15 minutes | `expire_unpaid_bookings()` |

Fee rates are set in the `platform_settings` table:
- `customer_fee_rate` is 5%.
- `min_customer_fee` is RM3.
- `owner_commission_rate` is 0% while the pilot runs. The plan is 5% for Pro operators on bookings Kar brings in, and 15% for casual owners once an insurer is on board.
- Policy windows (claim window, late grace, no-show and cancellation windows, strike limit, owner reply time `request_ttl`) are also in `platform_settings`. The support WhatsApp number comes from `EXPO_PUBLIC_SUPPORT_WHATSAPP`. [src/lib/policy.ts](src/lib/policy.ts) mirrors them for in-app previews.
- `src/lib/pricing.ts` must use the same numbers, because it shows the price preview in the app.

## Project layout

```
src/app/(tabs)/       Explore (list + map, satellite by default), Trips, Host (owner dashboard), Account (support, policies)
src/app/car/[id]      Car page: time picker, price breakdown, book & pay
src/app/trip/[id]     Customer trip: pay → pickup → before photos → drive → return
src/app/trip/help     Get help / SOS: accident checklist, breakdown, can't find car
src/app/verify        ID verification (IC/student ID, licence, selfie)
src/app/admin         Kar admin: approve IDs and cars, decide disputed claims, record refunds and payouts
src/app/host/         Owner: list a car (5 steps), edit car, booking detail with claims, deposit, no-show
src/components/       UI kit, map (native: react-native-maps, web: MapLibre + OpenFreeMap), photo checklist
src/lib/              Backend interface + demo and Supabase implementations, pricing, formatting
supabase/             SQL migrations, seed, edge functions (CHIP payments and refunds)
```

## Live tracking (owners see their cars in real time)

**My cars** has a live map. A car on a trip moves with the customer's phone, and an idle car shows where the last customer parked it. Tapping a car on a trip opens its route, speed and last update. If no location arrives for 5 minutes, the car is marked **Signal lost**, with buttons to call the customer and tell Kar.

- The customer's phone starts sharing when the trip starts and stops at the return. The house rules and the privacy policy tell customers about this before they book.
- In an app store or development build, sharing continues with the screen off (background location; `expo-task-manager`, configured in `app.json`). Expo Go and the web app can only share while Kar is open on screen, so ship the store build before relying on this for security.
- Demo mode has Farah out driving Aiman's Axia around UTP, so the live map moves without a second phone.

## App store builds and push notifications

`eas.json` has three profiles: `development` (dev client), `preview` (Android APK to install directly) and `production` (store builds). The public Supabase values are set there, so builds don't depend on `.env`.

```bash
npx eas-cli@latest build -p android --profile preview   # APK for testing on Android phones
npx eas-cli@latest build -p ios --profile production    # needs a paid Apple Developer account
```

JavaScript-only changes reach installed apps without a new build (EAS Update): `npx eas-cli@latest update --channel preview --environment preview --message "what changed"` (use `production` for store builds). It bundles with your local `.env`. A change to native code, `app.json` permissions or plugins needs a new build. Builds made before `react-native-svg` was added (Oct 2026: logo and tab bar) need a new build before they can take updates.

Background location (live tracking with the screen off) and push notifications only work in these builds, not in Expo Go or on the web. Push needs credentials once: FCM V1 for Android (`npx eas-cli credentials`, see https://docs.expo.dev/push-notifications/fcm-credentials/) and an APNs key for iOS (EAS offers to create it during the first iOS build).

## Login code email

Supabase sends the 6-digit login code. The branded email is in `supabase/templates/login-code.html` (kept light on purpose: a heavier designed version went to UTP Outlook's Junk folder, Oct 2026). Paste it into Supabase → Authentication → Email Templates, in **both** "Magic Link" (returning users) and "Confirm signup" (new users), with the subject `{{ .Token }} is your Kar login code` so the code shows in the inbox list.

## Update the live web app (https://karsewa.expo.app/)

Pushing to GitHub does **not** update the website. Deploy it by hand with EAS Hosting (it bundles with your local `.env`):

```bash
npx expo export --platform web      # builds the site into dist/ (run it every time before deploying)
npx eas-cli@latest deploy --prod    # uploads dist/ to karsewa.expo.app
```

Only the website changes; phone apps and the database are untouched. Hard-refresh the browser (Ctrl+Shift+R) to see the new version.

If karsewa.expo.app still shows the old version after a few minutes, the production address didn't move to the new deployment. Promote it by hand with the id from the Deployment URL (`karsewa--<id>.expo.app`): `npx eas-cli@latest deploy:alias --prod --id <id>`.

## Areas (scaling beyond UTP)

Every car belongs to an area (`zones`). Renters pick the area on Explore (remembered on their device), and owners pick it when listing a car. Add an area under **Admin → Areas** with a short id, a name and the map centre: no code change needed.

## Checks

```bash
npx tsc --noEmit && npx expo lint
```

## Next up

See [docs/04-roadmap.md](docs/04-roadmap.md). The next items (P1) are:
1. Pro plan billing, and adding WhatsApp/walk-in bookings to the calendar.
2. Push notifications. The `push_tokens` table and a hook point in `chip-callback` are ready.
3. Weekly owner payouts.
4. Summons matching, and km calculation from the odometer photos.
5. App store builds:
   ```bash
   npx eas-cli@latest build -p ios
   npx eas-cli@latest build -p android
   ```
