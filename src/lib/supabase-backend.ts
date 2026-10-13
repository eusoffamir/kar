import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { Backend } from './backend';
import type { Booking, BookingDetail, Car, CarWithOwner, Claim, Incident, PayoutDue, PendingRefund, Profile, TripPhoto } from './types';

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

async function uid() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Please sign in first');
  return id;
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
function normBooking(b: any): Booking {
  const money = ['trip_amount', 'customer_fee', 'owner_commission', 'deposit', 'total_charged', 'owner_payout', 'late_fee_due', 'cancellation_fee', 'refund_amount'];
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
  return { ...normBooking(b), car: normCar(b.car), customer: b.customer, owner: b.owner, photos: await signPhotos(b.photos) };
}

async function uploadFile(bucket: string, path: string, uri: string) {
  const body = await (await fetch(uri)).arrayBuffer();
  must(await supabase.storage.from(bucket).upload(path, body, { contentType: 'image/jpeg', upsert: true }));
}

export const supabaseBackend: Backend = {
  mode: 'supabase',

  async me() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    return must(await supabase.from('profiles').select('*').eq('id', data.session.user.id).single()) as Profile;
  },
  async signInWithEmail(email) {
    must(await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
    return { needsCode: true };
  },
  async verifyEmailCode(email, token) {
    must(await supabase.auth.verifyOtp({ email, token, type: 'email' }));
  },
  async signOut() {
    await supabase.auth.signOut();
  },
  async becomeOwner() {
    // Owners are invite-only during the pilot: Kar sets is_owner after vetting the operator.
    throw new Error('Apply through Kar support to list cars');
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
    const { data, error } = await supabase.functions.invoke('create-payment', { body: { booking_id: bookingId } });
    if (error) throw new Error(error.message);
    return { url: data.url as string };
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
    return Number(must(await supabase.rpc('cancel_booking', { b_id: id, reason: 'customer_cancelled' })) ?? 0);
  },
  async uploadTripPhoto(bookingId, phase, slot, uri, coords) {
    const path = `${bookingId}/${phase}/${slot}.jpg`;
    await uploadFile('trip-photos', path, uri);
    must(
      await supabase.from('trip_photos').upsert(
        { booking_id: bookingId, phase, slot, storage_path: path, lat: coords?.lat, lng: coords?.lng, uploaded_by: await uid() },
        { onConflict: 'booking_id,phase,slot' },
      ),
    );
  },
  async startTrip(id) {
    must(await supabase.rpc('start_trip', { b_id: id }));
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
  },
  async markNoShow(id) {
    must(await supabase.rpc('mark_no_show', { b_id: id }));
  },
  async setDepositReturned(bookingId) {
    must(await supabase.rpc('set_deposit_returned', { b_id: bookingId }));
  },

  async submitVerification({ icUri, licenceUri, selfieUri, licenceClass, licenceExpiry, phone }) {
    const me = await uid();
    const stamp = Date.now();
    const paths = [`${me}/${stamp}-ic.jpg`, `${me}/${stamp}-licence.jpg`, `${me}/${stamp}-selfie.jpg`];
    await Promise.all([icUri, licenceUri, selfieUri].map((u, i) => uploadFile('verifications', paths[i], u)));
    must(
      await supabase.rpc('submit_verification', {
        ic: paths[0], licence: paths[1], selfie: paths[2], l_class: licenceClass, l_expiry: licenceExpiry || null,
        p_phone: phone,
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

  async adminPendingVerifications() {
    const rows = must(
      await supabase.from('verifications').select('*, user:profiles(*)').eq('status', 'pending').order('created_at'),
    );
    return Promise.all(
      (rows as any[]).map(async (v) => {
        const [ic, licence, selfie] = await signPaths('verifications', [v.ic_path, v.licence_path, v.selfie_path]);
        return { id: v.id, user: v.user, ic, licence, selfie, licence_class: v.licence_class, licence_expiry: v.licence_expiry, created_at: v.created_at };
      }),
    );
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
  async adminPendingRefunds() {
    const rows = must(
      await supabase
        .from('payments')
        .select(`id, amount, created_at, booking:bookings(${BOOKING_SELECT})`)
        .eq('type', 'refund')
        .eq('status', 'pending')
        .order('created_at'),
    );
    return Promise.all(
      (rows as any[]).map(async (r) => ({ ...r, amount: Number(r.amount), booking: await normDetail(r.booking) }) as PendingRefund),
    );
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
};
