# CLAUDE.md: Kar (P2P car rental, UTP pilot)

@AGENTS.md

The Expo rules above (from `AGENTS.md`) always apply. This file adds what is specific to Kar and to how Eusoff works.

## Owner and style

- **Muhammad Eusoff Amir bin Hazri** (Eusoff), UTP student. Kar is his own startup project, registered under Vendor Vision Solutions (SSM).
- Explain changes in plain, easy English. Work one step at a time and ask before large new features.
- Be honest about uncertainty. Never invent API names, prices or legal facts.
- Eusoff works alone, with no one to double-check. **Always check facts online** before giving them or putting them in Kar (Malaysian laws and guidelines, prices and fees, Expo/Supabase/CHIP behaviour, Malay wording), without being asked, and list the sources. Say clearly when sources disagree.
- Eusoff is a solo founder with no team. Give lean, test-first advice: launch small, learn, fix later. Flag only the risks that can't be undone, not every possible problem.

## What Kar is

- A marketplace that connects car owners (licensed, insured rental operators) with customers (UTP students). Kar does not own cars.
- One codebase: Expo + React Native + TypeScript, runs on iPhone, Android and web. Live web app: https://karsewa.expo.app/
- Backend: Supabase (database, sign-in, storage, edge functions). Payments: CHIP (FPX, DuitNow QR, e-wallets). Refunds go through CHIP, owner payouts are manual bank transfers.
- Business plan, money model, risks and roadmap: `docs/`. Full setup and rules: `README.md`.

## The 3 goals (check every business and app design decision against them)

1. **Renters** rent a car easily and safely.
2. **Owners** have the fewest idle days and earn money with low risk.
3. **Kar** makes a profit with no liability and minimal cost.

If a change helps one goal but hurts another, say so and explain the trade-off.

## Where things are

- Screens: `src/app/` (Expo Router). Components: `src/components/`. Logic: `src/lib/`.
- Backend switch: `src/lib/backend.ts` picks `supabase-backend.ts` or `mock-backend.ts` (demo mode).
- Prices and fees: `src/lib/pricing.ts` on the client, but the database is the real source of truth.
- Database: `supabase/migrations/` (apply in date order). Edge functions: `supabase/functions/` (`create-payment`, `chip-callback`, `process-refunds`).
- `supabase/seed.sql` is for a **local** database only. Never run it on production.

## Rules that must not break

- **All business rules are enforced in the database** (triggers and functions in the migrations), so a modified app can't get around them. When a rule changes, change it in a new migration, not only in the app.
- New database changes go in a **new** migration file named with the next date stamp. Never edit an old migration that is already applied.
- **Never put secrets in the app or in chat.** CHIP keys and other secrets only go in Supabase secrets. `EXPO_PUBLIC_*` values are public by design.
- Money code (payments, refunds, deposits, payouts) needs extra care: explain the change and ask before pushing.

## Run and check

- `npm install`, then `npx expo start` (press `w` for web, or scan the QR code with Expo Go).
- Without `.env.local` the app runs in **demo mode** with sample UTP cars and accounts (Profile → Demo mode switches between Hakim, Nadia, Aiman, Siti and Kar Admin). Use demo mode for testing in cloud sessions.
- Before saying a task is done: `npx expo lint` and `npx tsc --noEmit`.

## Working across devices (PC, laptop, phone)

- Eusoff works on Kar from his PC, his laptop and his phone (Claude Code cloud sessions). GitHub is the single source of truth.
- **Start of every session:** `git pull`. If it fails or conflicts, stop and explain.
- **After a finished, checked change:** commit with a clear message and `git push`, and say so. Never force push.
- **Then always deploy the website** (Eusoff's standing instruction): after every push to `main`, run `npx expo export --platform web` then `npx eas-cli@latest deploy --prod` from the Kar folder, and give the result. Only from a clean folder that matches `main` (`git status` empty), so half-done work never goes live. Cloud sessions that push to a `claude/...` branch don't deploy; the next PC or laptop session deploys after the merge.
- **`.env` is committed to git on purpose** so every device gets it with `git pull`. It holds only public `EXPO_PUBLIC_*` values (Supabase URL, anon key, WhatsApp number), which ship inside the app anyway. It was added once with `git add -f .env`, since `.gitignore` still ignores new `.env` files.
- **Never put a secret in `.env`** (CHIP keys, Supabase service or secret keys, anything not `EXPO_PUBLIC_*`). Secrets only go in Supabase secrets or EAS environment variables.
- `.env.local` stays private and overrides `.env` on one device only, for example for testing against another Supabase project.
- **Phone (cloud) sessions** may push to their own branch (like `claude/...`) instead of `main`. If so, say so clearly and remind Eusoff to open and merge the pull request on GitHub, because the PC and laptop only get the change after it is merged into `main`.
- Cloud sessions can't run Expo Go on the phone. Use them for small fixes, run lint and typecheck there, and test properly later on the PC or laptop.
- Only work on one device at a time, and always push before leaving a device.
- Project knowledge belongs in this file, `README.md` or `docs/`, not only in Claude's memory.
