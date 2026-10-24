import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import type { Backend } from './backend';
import type {
  Booking,
  BookingDetail,
  Car,
  CarWithOwner,
  Claim,
  Incident,
  OperatorDocs,
  OperatorReview,
  OwnerProfile,
  OwnerReview,
  OwnerSummary,
  PayoutDue,
  PendingRefund,
  Profile,
  TripLocation,
  TripPhoto,
  VerificationReview,
  WaitlistEntry,
  WaitlistReview,
} from './types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

const CAR_SELECT = '*, owner:profiles!cars_owner_id_fkey(*), last_location:car_last_location(*)';
const BOOKING_SELECT = `*, car:cars(*),
  customer:profiles!bookings_customer_id_fkey(*), owner:profiles!bookings_owner_id_fkey(*),
  photos:trip_photos(*)`;

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Query and #fragment params of an OAuth redirect URL (Supabase puts the tokens in the fragment). */
function urlParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of url.split(/[?#]/).slice(1).join('&').split('&')) {
    const [k, v = ''] = part.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}

/** A verifications row (with its user) as the admin screen shows it, with signed photo links. */
async function normIdReview(v: any): Promise<VerificationReview> {
  const [ic, licence, selfie] = await signPaths('verifications', [v.ic_path, v.licence_path, v.selfie_path]);
  return {
    id: v.id, user: v.user, ic, licence, selfie, licence_class: v.licence_class, licence_expiry: v.licence_expiry,
    created_at: v.created_at, review_flags: v.review_flags ?? [], auto_approved_at: v.auto_approved_at ?? null,
  };
}

async function uid() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Please sign in first');
  return id;
}

// Refunds go back through CHIP (edge function). Fire-and-forget after an action that queued one:
// anything that fails stays pending for the next run or the admin screen.
function kickRefunds() {
  supabase.functions.invoke('process-refunds').catch(() => {});
}

/** Calls an edge function and surfaces its own `{ error }` message instead of "non-2xx status code". */
async function callFunction<T>(name: string, body?: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, body ? { body } : undefined);
  if (error) {
    const res = (error as { context?: Response }).context;
    const detail = await res?.json?.().then((j: { error?: string }) => j?.error).catch(() => undefined);
    throw new Error(detail ?? 'Something went wrong. Please try again.');
  }
  return data as T;
}

// Postgres numerics arrive as strings; normalise the money/coordinate fields we use.
const num = (v: unknown) => (v == null ? v : Number(v));
function normCar(c: any): CarWithOwner {
  return {
    ...c,
    price_per_hour: num(c.price_per_hour),
    price_per_day: num(c.price_per_day),
    deposit: num(c.deposit),
    late_fee_per_hour: num(c.late_fee_per_hour),
    owner: c.owner ? { ...c.owner, rating_avg: num(c.owner.rating_avg) } : c.owner,
    last_location: Array.isArray(c.last_location) ? (c.last_location[0] ?? null) : (c.last_location ?? null),
  };
}
// Ratings are numerics (strings from Postgres).
function normProfile(p: any): Profile {
  return p ? { ...p, rating_avg: num(p.rating_avg), renter_rating_avg: num(p.renter_rating_avg) } : p;
}
function normBooking(b: any): Booking {
  const money = ['trip_amount', 'customer_fee', 'owner_commission', 'deposit', 'total_charged', 'owner_payout', 'late_fee_due', 'cancellation_fee', 'refund_amount', 'deposit_refund', 'deposit_to_owner'];
  return { ...b, ...Object.fromEntries(money.map((k) => [k, num(b[k])])) };
}

// Trip photos are private: swap storage paths for short-lived signed URLs.
/** Signed URLs for private storage paths (trip evidence, ID documents). */
async function signPaths(bucket: string, paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60);
  return paths.map((_, i) => data?.[i]?.signedUrl ?? '');
}

async function normClaim(c: any): Promise<Claim> {
  return { ...c, amount: Number(c.amount), handling_fee: Number(c.handling_fee), evidence: await signPaths('trip-photos', c.evidence_paths ?? []) };
}

async function signPhotos(rows: any[]): Promise<TripPhoto[]> {
  if (!rows?.length) return [];
  const { data } = await supabase.storage.from('trip-photos').createSignedUrls(
    rows.map((r) => r.storage_path),
    60 * 60,
  );
  return rows.map((r, i) => ({ ...r, uri: data?.[i]?.signedUrl ?? '' }));
}

async function normDetail(b: any): Promise<BookingDetail> {
  return { ...normBooking(b), car: normCar(b.car), customer: normProfile(b.customer), owner: normProfile(b.owner), photos: await signPhotos(b.photos) };
}

/** Longest side of uploaded photos: plenty for damage evidence and IDs, and ~5-10x smaller than camera originals. */
const MAX_PHOTO_SIDE = 1600;

/** Resizes a photo before upload (storage is the main cost per trip). Falls back to the original on any error. */
async function shrink(uri: string) {
  try {
    const original = await ImageManipulator.manipulate(uri).renderAsync();
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(original.width, original.height));
    const ref = scale < 1
      ? await ImageManipulator.manipulate(uri).resize({ width: Math.round(original.width * scale), height: null }).renderAsync()
      : original;
    return (await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 })).uri;
  } catch {
    return uri;
  }
}

// Overwriting needs read + update permission on the bucket as well as insert, so only trip photos
// (fixed path per slot, retakes replace the file) use it; every other upload has a unique name.
async function uploadFile(bucket: string, path: string, uri: string, overwrite = false) {
  const body = await (await fetch(await shrink(uri))).arrayBuffer();
  must(await supabase.storage.from(bucket).upload(path, body, { contentType: 'image/jpeg', upsert: overwrite }));
}

export const supabaseBackend: Backend = {
  mode: 'supabase',

  async me() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    return normProfile(must(await supabase.from('profiles').select('*').eq('id', data.session.user.id).single()));
  },
  async signInWithEmail(email) {
    must(await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
    return { needsCode: true };
  },
  async verifyEmailCode(email, token) {
    must(await supabase.auth.verifyOtp({ email, token, type: 'email' }));
  },
  async signInWithGoogle() {
    if (Platform.OS === 'web') {
      // Full-page redirect; detectSessionInUrl picks up the session when Google sends the user back.
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
      if (error) throw new Error(error.message);
      return false;
    }
    // Phone: open Google in an auth browser that returns to kar:// (exp:// in Expo Go) with the tokens.
    const redirectTo = Linking.createURL('');
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
    if (error || !data.url) throw new Error(error?.message ?? 'Could not open Google sign-in');
    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (res.type !== 'success') return false;
    const params = urlParams(res.url);
    if (params.error) throw new Error(params.error_description || params.error);
    if (!params.access_token || !params.refresh_token) throw new Error('Google sign-in did not finish. Please try again.');
    must(await supabase.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token }));
    return true;
  },
  async signOut() {
    await supabase.auth.signOut();
  },
  async becomeOwner() {
    // Owners are invite-only during the pilot: Kar sets is_owner after vetting the operator.
    throw new Error('Apply through Kar support to list cars');
  },
  async updateMyName(name) {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (clean.length < 3) throw new Error('Enter at least 3 letters');
    must(await supabase.from('profiles').update({ full_name: clean.slice(0, 80) }).eq('id', await uid()));
  },
  async registerPushToken(token) {
    must(await supabase.from('push_tokens').upsert({ user_id: await uid(), token }, { onConflict: 'user_id,token' }));
  },

  async zones() {
    return must(await supabase.from('zones').select('*').eq('is_active', true));
  },
  async listCars(zoneId) {
    const rows = must(
      await supabase.from('cars').select(CAR_SELECT).eq('zone_id', zoneId).eq('is_listed', true).eq('is_approved', true),
    );
    return (rows as any[]).map(normCar);
  },
  async getCar(id) {
    const c = must(await supabase.from('cars').select(CAR_SELECT).eq('id', id).single());
    // RLS hides other customers' bookings, so busy times come from a times-only RPC.
    const busy = must(await supabase.rpc('car_busy_ranges', { c_id: id }));
    return { ...normCar(c), busy: busy as { starts_at: string; ends_at: string }[] };
  },
  async ownerProfile(ownerId): Promise<OwnerProfile> {
    // Only owners with a car on Explore have a public page (same rule as the profiles policy).
    const rows = must(await supabase.from('cars').select(CAR_SELECT).eq('owner_id', ownerId).eq('is_listed', true).eq('is_approved', true));
    const cars = (rows as any[]).map(normCar);
    if (!cars.length) throw new Error('This owner has no cars on Kar right now');
    const reviews = must(await supabase.rpc('owner_reviews', { o_id: ownerId })) as OwnerReview[];
    return { owner: cars[0].owner, cars, reviews };
  },
  async createBooking(carId, start, end, rulesAccepted) {
    if (!rulesAccepted) throw new Error('Accept the house rules to book');
    const row = must(
      await supabase
        .from('bookings')
        .insert({
          car_id: carId,
          customer_id: await uid(),
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          rules_accepted_at: new Date().toISOString(),
        })
        .select()
        .single(),
    );
    return normBooking(row);
  },
  async startPayment(bookingId) {
    const { url } = await callFunction<{ url: string }>('create-payment', { booking_id: bookingId });
    return { url };
  },
  async myTrips() {
    const rows = must(
      await supabase.from('bookings').select(BOOKING_SELECT).eq('customer_id', await uid()).order('starts_at', { ascending: false }),
    );
    return Promise.all((rows as any[]).map(normDetail));
  },
  async getBooking(id) {
    return normDetail(must(await supabase.from('bookings').select(BOOKING_SELECT).eq('id', id).single()));
  },
  async cancelBooking(id) {
    const refund = Number(must(await supabase.rpc('cancel_booking', { b_id: id, reason: 'customer_cancelled' })) ?? 0);
    if (refund > 0) kickRefunds();
    return refund;
  },
  async uploadTripPhoto(bookingId, phase, slot, uri, coords) {
    const path = `${bookingId}/${phase}/${slot}.jpg`;
    await uploadFile('trip-photos', path, uri, true);
    must(
      await supabase.from('trip_photos').upsert(
        { booking_id: bookingId, phase, slot, storage_path: path, lat: coords?.lat, lng: coords?.lng, uploaded_by: await uid() },
        { onConflict: 'booking_id,phase,slot' },
      ),
    );
  },
  async startTrip(id, coords) {
    must(await supabase.rpc('start_trip', { b_id: id, p_lat: coords.lat, p_lng: coords.lng }));
  },
  async completeReturn(id, lat, lng, note) {
    must(await supabase.rpc('complete_return', { b_id: id, lat, lng, note }));
  },
  async keyboxCode(id) {
    return must(await supabase.rpc('car_keybox_code', { b_id: id })) as string | null;
  },
  async contactPhone(id) {
    const me = await uid();
    const b = must(await supabase.from('bookings').select('customer_id, owner_id').eq('id', id).single()) as Booking;
    const other = b.customer_id === me ? b.owner_id : b.customer_id;
    // RLS on profile_private only returns a row once the booking is confirmed.
    const { data } = await supabase.from('profile_private').select('phone').eq('user_id', other).maybeSingle();
    return data?.phone ?? null;
  },
  async review(bookingId, toId, rating, comment) {
    must(await supabase.from('reviews').insert({ booking_id: bookingId, from_id: await uid(), to_id: toId, rating, comment }));
  },
  async myRating(bookingId) {
    const row = must(await supabase.from('reviews').select('rating').eq('booking_id', bookingId).eq('from_id', await uid()).maybeSingle()) as
      | { rating: number }
      | null;
    return row?.rating ?? null;
  },
  async customerReviews(customerId) {
    return must(await supabase.rpc('customer_reviews', { c_id: customerId })) as OwnerReview[];
  },

  async ownerCars() {
    const rows = must(await supabase.from('cars').select(CAR_SELECT).eq('owner_id', await uid()));
    return (rows as any[]).map(normCar);
  },
  async ownerBookings() {
    const rows = must(
      await supabase.from('bookings').select(BOOKING_SELECT).eq('owner_id', await uid()).order('starts_at', { ascending: false }),
    );
    return Promise.all((rows as any[]).map(normDetail));
  },
  async respondToBooking(id, accept) {
    must(await supabase.rpc('respond_to_booking', { b_id: id, accept }));
    if (!accept) kickRefunds();
  },
  async createCar(input, keyboxCode) {
    const owner = await uid();
    const row = must(await supabase.from('cars').insert({ ...input, owner_id: owner }).select().single()) as Car;
    if (keyboxCode) must(await supabase.from('car_secrets').insert({ car_id: row.id, keybox_code: keyboxCode }));
    return row;
  },
  async updateCar(id, patch, keyboxCode) {
    must(await supabase.from('cars').update(patch).eq('id', id));
    if (keyboxCode !== undefined) {
      must(await supabase.from('car_secrets').upsert({ car_id: id, keybox_code: keyboxCode }));
    }
  },
  async ownerCarSecret(carId) {
    // RLS on car_secrets only returns rows for the car's owner.
    const { data } = await supabase.from('car_secrets').select('keybox_code').eq('car_id', carId).maybeSingle();
    return data?.keybox_code ?? null;
  },
  async uploadCarPhoto(uri) {
    const path = `${await uid()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    await uploadFile('car-photos', path, uri);
    return supabase.storage.from('car-photos').getPublicUrl(path).data.publicUrl;
  },
  async blockCustomer(customerId, reason) {
    must(await supabase.from('owner_blocks').upsert({ owner_id: await uid(), customer_id: customerId, reason }));
  },
  async ownerCancelBooking(id, reason) {
    must(await supabase.rpc('owner_cancel_booking', { b_id: id, reason }));
    kickRefunds();
  },
  async markNoShow(id) {
    must(await supabase.rpc('mark_no_show', { b_id: id }));
    kickRefunds();
  },
  async markLateExtraPaid(id) {
    must(await supabase.rpc('mark_late_extra_paid', { b_id: id }));
  },
  async setDepositReturned(bookingId) {
    must(await supabase.rpc('set_deposit_returned', { b_id: bookingId }));
  },
  async customerSelfie(bookingId) {
    const path = must(await supabase.rpc('customer_selfie_path', { b_id: bookingId })) as string | null;
    if (!path) return null;
    return (await signPaths('verifications', [path]))[0] || null;
  },
  async myOperatorDocs() {
    const rows = must(
      await supabase.from('operator_documents').select('*').eq('owner_id', await uid()).order('created_at', { ascending: false }).limit(1),
    ) as OperatorDocs[];
    return rows[0] ?? null;
  },
  async submitOperatorDocs({ permitUri, insuranceUri, ...d }) {
    const me = await uid();
    const stamp = Date.now();
    const paths = [`${me}/${stamp}-permit.jpg`, `${me}/${stamp}-insurance.jpg`];
    await Promise.all([permitUri, insuranceUri].map((u, i) => uploadFile('operator-docs', paths[i], u)));
    must(
      await supabase.rpc('submit_operator_documents', {
        p_business_name: d.business_name, p_ssm_no: d.ssm_no, p_permit_no: d.permit_no, p_insurer: d.insurer,
        p_policy_no: d.policy_no, p_insurance_expiry: d.insurance_expiry, p_permit_path: paths[0], p_insurance_path: paths[1],
      }),
    );
  },

  async myWaitlistEntry() {
    const rows = must(await supabase.from('owner_waitlist').select('*').eq('user_id', await uid())) as WaitlistEntry[];
    return rows[0] ?? null;
  },
  async joinOwnerWaitlist(w) {
    must(
      await supabase.rpc('join_owner_waitlist', {
        p_zone: w.zone_id, p_car: w.car, p_year: w.car_year, p_registered_to: w.registered_to,
        p_on_loan: w.on_loan, p_free_days: w.free_days_per_week, p_wants_pro: w.wants_pro,
      }),
    );
  },
  async leaveOwnerWaitlist() {
    must(await supabase.rpc('leave_owner_waitlist'));
  },

  async submitVerification({ icUri, licenceUri, selfieUri, licenceClass, licenceExpiry, phone, fullName }) {
    const me = await uid();
    const stamp = Date.now();
    const paths = [`${me}/${stamp}-ic.jpg`, `${me}/${stamp}-licence.jpg`, `${me}/${stamp}-selfie.jpg`];
    await Promise.all([icUri, licenceUri, selfieUri].map((u, i) => uploadFile('verifications', paths[i], u)));
    must(
      await supabase.rpc('submit_verification', {
        ic: paths[0], licence: paths[1], selfie: paths[2], l_class: licenceClass, l_expiry: licenceExpiry || null,
        p_phone: phone,
        p_full_name: fullName,
      }),
    );
  },
  async uploadEvidence(bookingId, uri) {
    // Private bucket; storage policy allows either party of the booking (first folder = booking id).
    const path = `${bookingId}/evidence/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`;
    await uploadFile('trip-photos', path, uri);
    return path;
  },
  async createClaim(bookingId, description, amount, evidencePaths) {
    must(await supabase.rpc('create_claim', { b_id: bookingId, description, amount, evidence: evidencePaths }));
  },
  async claimsFor(bookingId) {
    const rows = must(await supabase.from('claims').select('*').eq('booking_id', bookingId).order('created_at'));
    return Promise.all((rows as any[]).map(normClaim));
  },
  async respondToClaim(claimId, accept) {
    must(await supabase.rpc('respond_to_claim', { c_id: claimId, accept }));
  },
  async reportIncident(bookingId, kind, note, coords, photoPaths) {
    must(
      await supabase.from('incidents').insert({
        booking_id: bookingId, reported_by: await uid(), kind, note, lat: coords?.lat, lng: coords?.lng, photo_paths: photoPaths,
      }),
    );
  },
  async incidentsFor(bookingId) {
    const rows = must(await supabase.from('incidents').select('*').eq('booking_id', bookingId).order('created_at'));
    return Promise.all(
      (rows as any[]).map(async (r) => ({ ...r, photos: await signPaths('trip-photos', r.photo_paths ?? []) }) as Incident),
    );
  },

  async reportTripLocation(bookingId, fixes) {
    if (!fixes.length) return 0;
    return Number(must(await supabase.rpc('report_trip_location', { b_id: bookingId, fixes })) ?? 0);
  },
  async latestTripLocations(bookingIds) {
    if (!bookingIds.length) return [];
    return must(await supabase.rpc('latest_trip_locations', { b_ids: bookingIds })) as TripLocation[];
  },
  async tripRoute(bookingId) {
    // A fix every ~30 s: 1500 covers about 12 hours of driving; longer trips show the most recent part.
    const rows = must(
      await supabase
        .from('trip_locations')
        .select('booking_id, lat, lng, accuracy, speed, recorded_at')
        .eq('booking_id', bookingId)
        .order('recorded_at', { ascending: false })
        .limit(1500),
    ) as TripLocation[];
    return rows.reverse();
  },

  async adminPendingVerifications() {
    const rows = must(
      await supabase.from('verifications').select('*, user:profiles(*)').eq('status', 'pending').order('created_at'),
    );
    return Promise.all((rows as any[]).map(normIdReview));
  },
  async adminAutoApprovedVerifications() {
    const rows = must(
      await supabase.from('verifications').select('*, user:profiles(*)').eq('status', 'verified')
        .not('auto_approved_at', 'is', null).order('auto_approved_at', { ascending: false }),
    );
    return Promise.all((rows as any[]).map(normIdReview));
  },
  async adminReviewVerification(id, approve, note) {
    must(await supabase.rpc('admin_review_verification', { v_id: id, approve, note }));
  },
  async adminDisputedClaims() {
    const rows = must(await supabase.from('claims').select(`*, booking:bookings(${BOOKING_SELECT})`).eq('status', 'reviewing'));
    return Promise.all((rows as any[]).map(async (c) => ({ ...(await normClaim(c)), booking: await normDetail(c.booking) })));
  },
  async adminResolveClaim(id, approve, note) {
    must(await supabase.rpc('admin_resolve_claim', { c_id: id, approve, note }));
  },
  async adminPendingCars() {
    const rows = must(
      await supabase.from('cars').select(CAR_SELECT).eq('is_approved', false).is('rejected_at', null).order('created_at'),
    );
    return (rows as any[]).map(normCar);
  },
  async adminApproveCar(carId, approve) {
    must(await supabase.rpc('admin_approve_car', { c_id: carId, approve }));
  },
  async adminAutoApprovedCars() {
    const rows = must(
      await supabase.from('cars').select(CAR_SELECT).eq('is_approved', true).not('auto_approved_at', 'is', null).order('auto_approved_at', { ascending: false }),
    );
    return (rows as any[]).map(normCar);
  },
  async adminPendingRefunds() {
    const rows = must(
      await supabase
        .from('payments')
        .select(`id, amount, created_at, status, raw, booking:bookings(${BOOKING_SELECT})`)
        .eq('type', 'refund')
        .in('status', ['pending', 'processing'])
        .order('created_at'),
    );
    return Promise.all(
      (rows as any[]).map(async ({ raw, ...r }) => ({
        ...r,
        amount: Number(r.amount),
        last_error: raw?.last_error ?? null,
        booking: await normDetail(r.booking),
      }) as PendingRefund),
    );
  },
  async processRefunds() {
    return callFunction<{ refunded: number; failed: number }>('process-refunds');
  },
  async adminMarkRefundPaid(refundId, bankRef) {
    must(await supabase.rpc('admin_mark_refund_paid', { p_id: refundId, bank_ref: bankRef }));
  },
  async adminPayoutsDue() {
    const rows = must(await supabase.rpc('admin_payouts_due'));
    return (rows as any[]).map((r) => ({ ...r, amount: Number(r.amount) }) as PayoutDue);
  },
  async adminRecordPayout(bookingIds, bankRef) {
    must(await supabase.rpc('admin_record_payout', { b_ids: bookingIds, bank_ref: bankRef }));
  },
  async adminOwners() {
    return must(await supabase.rpc('admin_owners')) as OwnerSummary[];
  },
  async adminResetStrikes(ownerId) {
    must(await supabase.rpc('admin_reset_strikes', { p_owner: ownerId }));
  },
  async adminPendingOperators() {
    const rows = must(
      await supabase.from('operator_documents').select('*, owner:profiles(*)').eq('status', 'pending').order('created_at'),
    ) as any[];
    const owners = (must(await supabase.rpc('admin_owners')) as OwnerSummary[]) ?? [];
    return Promise.all(
      rows.map(async ({ permit_path, insurance_path, ...d }) => {
        const [permit, insurance] = await signPaths('operator-docs', [permit_path, insurance_path]);
        return { ...d, email: owners.find((o) => o.id === d.owner_id)?.email ?? '', permit, insurance } as OperatorReview;
      }),
    );
  },
  async adminReviewOperator(id, approve, note) {
    must(await supabase.rpc('admin_review_operator', { d_id: id, approve, note }));
  },
  async adminOwnerWaitlist() {
    return must(await supabase.rpc('admin_owner_waitlist')) as WaitlistReview[];
  },
  async adminAddZone(id, name, lat, lng) {
    must(await supabase.from('zones').insert({ id, name, center_lat: lat, center_lng: lng }));
  },
  async adminSetOwner(email, make) {
    return must(await supabase.rpc('admin_set_owner', { p_email: email, make })) as string;
  },
};
