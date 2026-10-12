import AsyncStorage from '@react-native-async-storage/async-storage';

import { Backend, LIVE_STATUSES, overlaps } from './backend';
import { cancellationPreview, canMarkNoShow, claimWindowOpen, lateFee, POLICY } from './policy';
import { quote } from './pricing';
import {
  PHOTO_SLOTS,
  type Booking,
  type BookingDetail,
  type Car,
  type CarWithOwner,
  type Claim,
  type Incident,
  type LastLocation,
  type Profile,
  type TripPhoto,
  type Zone,
} from './types';

// Demo backend: same rules as the database (pricing, no overlaps, 7 photos, last-parked update)
// stored on-device so the app can be shown to owners and students with no server.

const KEY = 'kar-demo-v4';
const OWNER = 'owner-aiman';
const OWNER2 = 'owner-siti';
const CUSTOMER = 'cust-hakim';
const NEW_STUDENT = 'cust-new';
const ADMIN = 'kar-admin';

type VerificationRow = {
  id: string;
  user_id: string;
  ic: string;
  licence: string;
  selfie: string;
  licence_class: string;
  licence_expiry: string;
  status: 'pending' | 'verified' | 'rejected';
  created_at: string;
};

type Store = {
  userId: string | null;
  profiles: Profile[];
  cars: Car[];
  secrets: Record<string, string>;
  lastLocations: LastLocation[];
  bookings: Booking[];
  photos: TripPhoto[];
  ownerBlocks: { owner_id: string; customer_id: string }[];
  reviews: { booking_id: string; from_id: string; to_id: string; rating: number; comment: string }[];
  verifications: VerificationRow[];
  claims: (Claim & { raised_by: string })[];
  incidents: Incident[];
};

/** Fields added by the P0 safety migration, with their defaults. */
const P0_BOOKING_DEFAULTS = {
  deposit_status: 'with_owner' as const,
  late_fee_due: 0,
  cancellation_fee: 0,
  refund_amount: null,
  cancelled_by: null,
  rules_accepted_at: null,
};

const profile = (id: string, full_name: string, extra: Partial<Profile> = {}): Profile => ({
  id,
  full_name,
  is_owner: false,
  is_admin: false,
  verification: 'verified',
  rating_avg: null,
  rating_count: 0,
  trips_count: 0,
  ...extra,
});

// Demo photos: Wikimedia Commons (CC BY / CC BY-SA / CC0). Real owners upload their own.
const PHOTOS: Record<string, string[]> = {
  'car-axia': [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/2020_Perodua_Axia_Style_front.jpg/960px-2020_Perodua_Axia_Style_front.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/2020_Perodua_Axia_IX_rear.jpg/960px-2020_Perodua_Axia_IX_rear.jpg',
  ],
  'car-myvi': [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Perodua_Myvi_1.3_G_2022.jpg/960px-Perodua_Myvi_1.3_G_2022.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/2022_Perodua_MyVi_X_front.jpg/960px-2022_Perodua_MyVi_X_front.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/2022_Perodua_MyVi_X_rear.jpg/960px-2022_Perodua_MyVi_X_rear.jpg',
  ],
  'car-saga': [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Proton_Saga_2019_White.jpg/960px-Proton_Saga_2019_White.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Proton_Saga_2019.jpg/960px-Proton_Saga_2019.jpg',
  ],
  'car-city': [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/2019_Honda_City_RS.jpg/960px-2019_Honda_City_RS.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/2019_Honda_City_SV.jpg/960px-2019_Honda_City_SV.jpg',
  ],
};

const car = (c: Partial<Car> & Pick<Car, 'id' | 'owner_id' | 'make' | 'model'>): Car => ({
  zone_id: 'utp',
  year: 2021,
  plate: 'AKB 0000',
  transmission: 'auto',
  seats: 5,
  fuel: 'petrol',
  description: '',
  price_per_hour: 8,
  price_per_day: 70,
  deposit: 50,
  late_fee_per_hour: 10,
  min_hours: 2,
  instant_book: true,
  handover: 'manual',
  pickup_lat: 4.3845,
  pickup_lng: 100.967,
  pickup_note: '',
  is_listed: true,
  is_approved: true,
  ...c,
  photos: c.photos ?? PHOTOS[c.id] ?? [],
});

function seed(): Store {
  const now = Date.now();
  const h = 3_600_000;
  const pastStart = new Date(now - 50 * h);
  const pastEnd = new Date(now - 26 * h);
  const reqStart = new Date(now + 20 * h);
  const reqEnd = new Date(now + 26 * h);
  const myvi = car({
    id: 'car-myvi', owner_id: OWNER, make: 'Perodua', model: 'Myvi', year: 2022, plate: 'AKC 5678',
    description: 'Myvi with Android Auto. Great for groups of 4 going to Ipoh.',
    price_per_hour: 10, price_per_day: 90, deposit: 100, late_fee_per_hour: 15, handover: 'keybox',
    pickup_lat: 4.387979, pickup_lng: 100.966957, pickup_note: 'Nadi@UTP car park',
  });
  const saga = car({
    id: 'car-saga', owner_id: OWNER2, make: 'Proton', model: 'Saga', year: 2020, plate: 'AJX 9012',
    transmission: 'manual', description: 'Manual Saga, cheapest option on campus.',
    price_per_hour: 6, price_per_day: 55, min_hours: 3, instant_book: false,
    pickup_lat: 4.388276, pickup_lng: 100.964503, pickup_note: 'V6 parking',
  });
  const past = (c: Car, start: Date, end: Date, status: Booking['status'], id: string): Booking => {
    const q = quote(c, start, end);
    return {
      id, car_id: c.id, customer_id: CUSTOMER, owner_id: c.owner_id,
      starts_at: start.toISOString(), ends_at: end.toISOString(), status,
      trip_amount: q.trip, customer_fee: q.fee, owner_commission: q.ownerCommission, deposit: q.deposit,
      total_charged: q.total, owner_payout: q.ownerPayout,
      picked_up_at: status === 'returned' ? start.toISOString() : null,
      returned_at: status === 'returned' ? end.toISOString() : null,
      created_at: new Date(start.getTime() - 2 * h).toISOString(),
      ...P0_BOOKING_DEFAULTS,
      rules_accepted_at: new Date(start.getTime() - 2 * h).toISOString(),
    };
  };
  return {
    userId: CUSTOMER,
    profiles: [
      profile(OWNER, 'Aiman (Owner)', { is_owner: true, rating_avg: 4.9, rating_count: 37 }),
      profile(OWNER2, 'Siti Rentals', { is_owner: true, rating_avg: 4.7, rating_count: 12 }),
      profile(CUSTOMER, 'Hakim (Student)', { rating_avg: 5, rating_count: 3, trips_count: 3 }),
      ...extraDemoProfiles(),
    ],
    cars: [
      car({
        id: 'car-axia', owner_id: OWNER, make: 'Perodua', model: 'Axia', plate: 'AKB 1234',
        description: 'Jimat minyak, sesuai pergi Seri Iskandar atau Ipoh.',
        pickup_lat: 4.383593, pickup_lng: 100.968997, pickup_note: 'Block 22 car park',
      }),
      myvi,
      saga,
      car({
        id: 'car-city', owner_id: OWNER2, make: 'Honda', model: 'City', year: 2019, plate: 'AKA 3456',
        description: 'Comfortable sedan for long trips back home.',
        price_per_hour: 15, price_per_day: 130, deposit: 150, late_fee_per_hour: 20, min_hours: 4,
        pickup_lat: 4.380584, pickup_lng: 100.968903, pickup_note: 'Block 1 car park',
      }),
    ],
    secrets: { 'car-myvi': '4821' },
    lastLocations: [
      { car_id: 'car-axia', lat: 4.383305, lng: 100.96899, note: 'Block 22, back row', updated_at: pastEnd.toISOString() },
    ],
    bookings: [
      past(myvi, pastStart, pastEnd, 'returned', 'bk-past'),
      past(saga, reqStart, reqEnd, 'requested', 'bk-request'),
    ],
    photos: [],
    ownerBlocks: [],
    reviews: [],
    verifications: [],
    claims: [],
    incidents: [],
  };
}

// Demo accounts for the safety flows: a new student who still has to verify, and a Kar admin.
function extraDemoProfiles(): Profile[] {
  return [
    profile(NEW_STUDENT, 'Nadia (New student)', { verification: 'unverified' }),
    profile(ADMIN, 'Kar Admin', { is_admin: true }),
  ];
}

/** Bring demo data saved by older builds up to date without wiping the user's own cars. */
function upgrade(s: Store) {
  s.verifications ??= [];
  s.claims ??= [];
  s.incidents ??= [];
  for (const p of extraDemoProfiles()) if (!s.profiles.some((x) => x.id === p.id)) s.profiles.push(p);
  for (const b of s.bookings) {
    for (const [k, v] of Object.entries(P0_BOOKING_DEFAULTS)) {
      if ((b as Record<string, unknown>)[k] === undefined) (b as Record<string, unknown>)[k] = v;
    }
  }
}

let cache: Store | null = null;

// Earlier demo builds used long parking notes; shorten them in place (keeps the user's own cars).
const OLD_NOTES: Record<string, string> = {
  'Open car park north-east of Block 22, middle row': 'Block 22 car park',
  'Small car park south of Nadi@UTP': 'Nadi@UTP car park',
  'Parking lane between the hostel blocks, south of Village 6': 'V6 parking',
  'Open car park south-east of Blocks 1–2, angled bays': 'Block 1 car park',
  'Same car park, south row by the trees': 'Block 22, back row',
};
function shortenOldNotes(s: Store) {
  for (const c of s.cars) c.pickup_note = OLD_NOTES[c.pickup_note] ?? c.pickup_note;
  for (const l of s.lastLocations) l.note = OLD_NOTES[l.note] ?? l.note;
}

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Store) : seed();
    shortenOldNotes(cache);
    upgrade(cache);
  } catch {
    cache = seed();
  }
  return cache;
}

async function save() {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Storage unavailable (private browsing): keep in memory only.
  }
}

const delay = () => new Promise((r) => setTimeout(r, 150));

function requireUser(s: Store) {
  const p = s.profiles.find((x) => x.id === s.userId);
  if (!p) throw new Error('Please sign in first');
  return p;
}

function withOwner(s: Store, c: Car): CarWithOwner {
  return {
    ...c,
    owner: s.profiles.find((p) => p.id === c.owner_id)!,
    last_location: s.lastLocations.find((l) => l.car_id === c.id) ?? null,
  };
}

function detail(s: Store, b: Booking): BookingDetail {
  return {
    ...b,
    car: s.cars.find((c) => c.id === b.car_id)!,
    customer: s.profiles.find((p) => p.id === b.customer_id)!,
    owner: s.profiles.find((p) => p.id === b.owner_id)!,
    photos: s.photos.filter((p) => p.booking_id === b.id),
  };
}

function findBooking(s: Store, id: string) {
  const b = s.bookings.find((x) => x.id === id);
  if (!b) throw new Error('Booking not found');
  return b;
}

const byStartDesc = (a: Booking, b: Booking) => b.starts_at.localeCompare(a.starts_at);

export const mockBackend: Backend = {
  mode: 'demo',

  async me() {
    const s = await load();
    return s.profiles.find((p) => p.id === s.userId) ?? null;
  },
  async signInWithEmail() {
    const s = await load();
    s.userId = CUSTOMER;
    await save();
    return { needsCode: false };
  },
  async verifyEmailCode() {},
  async signOut() {
    const s = await load();
    s.userId = null;
    await save();
  },
  async demoAccounts() {
    return (await load()).profiles;
  },
  async demoSignInAs(userId) {
    const s = await load();
    s.userId = userId;
    await save();
  },
  async becomeOwner() {
    const s = await load();
    requireUser(s).is_owner = true;
    await save();
  },

  async zones(): Promise<Zone[]> {
    return [{ id: 'utp', name: 'UTP, Seri Iskandar', center_lat: 4.3845, center_lng: 100.967 }];
  },
  async listCars(zoneId) {
    await delay();
    const s = await load();
    return s.cars.filter((c) => c.zone_id === zoneId && c.is_listed && c.is_approved).map((c) => withOwner(s, c));
  },
  async getCar(id) {
    const s = await load();
    const c = s.cars.find((x) => x.id === id);
    if (!c) throw new Error('Car not found');
    const busy = s.bookings
      .filter((b) => b.car_id === id && (LIVE_STATUSES as readonly string[]).includes(b.status))
      .map(({ starts_at, ends_at }) => ({ starts_at, ends_at }));
    return { ...withOwner(s, c), busy };
  },
  async createBooking(carId, start, end, rulesAccepted) {
    await delay();
    const s = await load();
    const me = requireUser(s);
    if (me.verification !== 'verified') throw new Error('Verify your ID to book');
    if (!rulesAccepted) throw new Error('Accept the house rules to book');
    const c = s.cars.find((x) => x.id === carId);
    if (!c || !c.is_listed) throw new Error('Car is not available');
    if (c.owner_id === me.id) throw new Error('You cannot book your own car');
    if (s.ownerBlocks.some((b) => b.owner_id === c.owner_id && b.customer_id === me.id)) {
      throw new Error('This owner is not accepting bookings from you');
    }
    if ((end.getTime() - start.getTime()) / 3_600_000 < c.min_hours) {
      throw new Error(`Minimum booking is ${c.min_hours} hours`);
    }
    const clash = s.bookings.some(
      (b) =>
        b.car_id === carId && (LIVE_STATUSES as readonly string[]).includes(b.status) && overlaps(b, start, end),
    );
    if (clash) throw new Error('Someone just booked this time. Pick another slot.');
    const q = quote(c, start, end);
    const b: Booking = {
      id: `bk-${Date.now()}`,
      car_id: c.id,
      customer_id: me.id,
      owner_id: c.owner_id,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: 'pending_payment',
      trip_amount: q.trip,
      customer_fee: q.fee,
      owner_commission: q.ownerCommission,
      deposit: q.deposit,
      total_charged: q.total,
      owner_payout: q.ownerPayout,
      picked_up_at: null,
      returned_at: null,
      created_at: new Date().toISOString(),
      ...P0_BOOKING_DEFAULTS,
      rules_accepted_at: new Date().toISOString(),
    };
    s.bookings.push(b);
    await save();
    return b;
  },
  async startPayment(bookingId) {
    await delay();
    const s = await load();
    const b = findBooking(s, bookingId);
    const c = s.cars.find((x) => x.id === b.car_id)!;
    if (b.status === 'pending_payment') b.status = c.instant_book ? 'confirmed' : 'requested';
    await save();
    return { url: null };
  },
  async myTrips() {
    const s = await load();
    const me = requireUser(s);
    return s.bookings.filter((b) => b.customer_id === me.id).sort(byStartDesc).map((b) => detail(s, b));
  },
  async getBooking(id) {
    const s = await load();
    const me = requireUser(s);
    const b = findBooking(s, id);
    if (![b.customer_id, b.owner_id].includes(me.id)) throw new Error('Booking not found');
    return detail(s, b);
  },
  async cancelBooking(id) {
    const s = await load();
    const me = requireUser(s);
    const b = findBooking(s, id);
    if (b.customer_id !== me.id || !['pending_payment', 'requested', 'confirmed'].includes(b.status)) {
      throw new Error('Booking cannot be cancelled');
    }
    const { fee, refund } = cancellationPreview(b);
    Object.assign(b, { status: 'cancelled', cancelled_by: 'customer', cancellation_fee: fee, refund_amount: refund });
    await save();
    return refund;
  },
  async uploadTripPhoto(bookingId, phase, slot, uri, coords) {
    const s = await load();
    s.photos = s.photos.filter((p) => !(p.booking_id === bookingId && p.phase === phase && p.slot === slot));
    s.photos.push({
      booking_id: bookingId, phase, slot, uri,
      lat: coords?.lat ?? null, lng: coords?.lng ?? null, taken_at: new Date().toISOString(),
    });
    await save();
  },
  async startTrip(id) {
    const s = await load();
    const b = findBooking(s, id);
    const n = s.photos.filter((p) => p.booking_id === id && p.phase === 'before').length;
    if (n < PHOTO_SLOTS.length) throw new Error(`Take all ${PHOTO_SLOTS.length} before photos first`);
    if (b.status !== 'confirmed') throw new Error('Trip cannot be started yet');
    b.status = 'active';
    b.picked_up_at = new Date().toISOString();
    await save();
  },
  async completeReturn(id, lat, lng, note) {
    const s = await load();
    const b = findBooking(s, id);
    const n = s.photos.filter((p) => p.booking_id === id && p.phase === 'after').length;
    if (n < PHOTO_SLOTS.length) throw new Error(`Take all ${PHOTO_SLOTS.length} after photos first`);
    if (b.status !== 'active') throw new Error('Trip is not active');
    b.status = 'returned';
    b.returned_at = new Date().toISOString();
    const car = s.cars.find((x) => x.id === b.car_id);
    b.late_fee_due = lateFee(b.ends_at, Date.now(), car?.late_fee_per_hour ?? 0);
    s.lastLocations = s.lastLocations.filter((l) => l.car_id !== b.car_id);
    s.lastLocations.push({ car_id: b.car_id, lat, lng, note, updated_at: b.returned_at });
    const cust = s.profiles.find((p) => p.id === b.customer_id);
    if (cust) cust.trips_count += 1;
    await save();
  },
  async keyboxCode(id) {
    const s = await load();
    const b = findBooking(s, id);
    if (!['confirmed', 'active'].includes(b.status)) return null;
    return s.secrets[b.car_id] ?? null;
  },
  async contactPhone(id) {
    const s = await load();
    const b = findBooking(s, id);
    return ['confirmed', 'active', 'returned'].includes(b.status) ? '60123456789' : null;
  },
  async review(bookingId, toId, rating, comment) {
    const s = await load();
    const me = requireUser(s);
    if (s.reviews.some((r) => r.booking_id === bookingId && r.from_id === me.id)) throw new Error('Already reviewed');
    s.reviews.push({ booking_id: bookingId, from_id: me.id, to_id: toId, rating, comment });
    const to = s.profiles.find((p) => p.id === toId);
    if (to) {
      const total = (to.rating_avg ?? 0) * to.rating_count + rating;
      to.rating_count += 1;
      to.rating_avg = Math.round((total / to.rating_count) * 100) / 100;
    }
    await save();
  },

  async ownerCars() {
    const s = await load();
    const me = requireUser(s);
    return s.cars.filter((c) => c.owner_id === me.id).map((c) => withOwner(s, c));
  },
  async ownerBookings() {
    const s = await load();
    const me = requireUser(s);
    return s.bookings.filter((b) => b.owner_id === me.id).sort(byStartDesc).map((b) => detail(s, b));
  },
  async respondToBooking(id, accept) {
    const s = await load();
    const b = findBooking(s, id);
    if (b.status !== 'requested') throw new Error('Booking cannot be updated');
    b.status = accept ? 'confirmed' : 'declined';
    await save();
  },
  async createCar(input, keyboxCode) {
    const s = await load();
    const me = requireUser(s);
    // Demo mode auto-approves; production waits for Kar admin approval.
    const c: Car = { ...input, id: `car-${Date.now()}`, owner_id: me.id, is_listed: true, is_approved: true };
    s.cars.push(c);
    if (keyboxCode) s.secrets[c.id] = keyboxCode;
    me.is_owner = true;
    await save();
    return c;
  },
  async updateCar(id, patch, keyboxCode) {
    const s = await load();
    const me = requireUser(s);
    const c = s.cars.find((x) => x.id === id);
    if (!c || c.owner_id !== me.id) throw new Error('Car not found');
    Object.assign(c, patch);
    if (keyboxCode === null) delete s.secrets[id];
    else if (keyboxCode !== undefined) s.secrets[id] = keyboxCode;
    await save();
  },
  async ownerCarSecret(carId) {
    const s = await load();
    const me = requireUser(s);
    const c = s.cars.find((x) => x.id === carId);
    return c?.owner_id === me.id ? (s.secrets[carId] ?? null) : null;
  },
  async uploadCarPhoto(uri) {
    // Demo: keep the photo on-device (web passes a data: URI so it survives reloads).
    return uri;
  },
  async blockCustomer(customerId) {
    const s = await load();
    const me = requireUser(s);
    if (!s.ownerBlocks.some((b) => b.owner_id === me.id && b.customer_id === customerId)) {
      s.ownerBlocks.push({ owner_id: me.id, customer_id: customerId });
    }
    await save();
  },
  async ownerCancelBooking(id) {
    const s = await load();
    const me = requireUser(s);
    const b = findBooking(s, id);
    if (b.owner_id !== me.id || !['requested', 'confirmed'].includes(b.status)) throw new Error('Booking cannot be cancelled');
    Object.assign(b, { status: 'cancelled', cancelled_by: 'owner', cancellation_fee: 0, refund_amount: b.total_charged });
    me.owner_strikes = (me.owner_strikes ?? 0) + 1;
    if (me.owner_strikes >= POLICY.ownerStrikeLimit) {
      for (const c of s.cars) if (c.owner_id === me.id) c.is_listed = false;
    }
    await save();
  },
  async markNoShow(id) {
    const s = await load();
    const me = requireUser(s);
    const b = findBooking(s, id);
    if (b.owner_id !== me.id || b.status !== 'confirmed') throw new Error('Booking cannot be marked as no-show');
    if (!canMarkNoShow(b)) throw new Error('Wait 60 minutes after the start time');
    const fee = Math.round(b.trip_amount * POLICY.lateCancelRate * 100) / 100;
    Object.assign(b, { status: 'no_show', cancelled_by: 'no_show', cancellation_fee: fee, refund_amount: b.total_charged - fee });
    await save();
  },
  async setDepositReturned(bookingId) {
    const s = await load();
    const me = requireUser(s);
    const b = findBooking(s, bookingId);
    if (s.claims.some((c) => c.booking_id === bookingId && ['open', 'reviewing'].includes(c.status))) {
      throw new Error('Resolve the open claim first');
    }
    if (b.owner_id !== me.id || b.deposit_status !== 'with_owner') throw new Error('Deposit cannot be updated');
    b.deposit_status = 'returned';
    await save();
  },

  async submitVerification({ icUri, licenceUri, selfieUri, licenceClass, licenceExpiry }) {
    const s = await load();
    const me = requireUser(s);
    if (licenceExpiry && new Date(licenceExpiry) < new Date()) throw new Error('Your licence has expired');
    s.verifications.push({
      id: `ver-${Date.now()}`, user_id: me.id, ic: icUri, licence: licenceUri, selfie: selfieUri,
      licence_class: licenceClass, licence_expiry: licenceExpiry, status: 'pending', created_at: new Date().toISOString(),
    });
    if (me.verification !== 'verified') me.verification = 'pending';
    await save();
  },
  async uploadEvidence(_bookingId, uri) {
    return uri; // demo: the local/data URI doubles as the stored path
  },
  async createClaim(bookingId, description, amount, evidencePaths) {
    const s = await load();
    const me = requireUser(s);
    const b = findBooking(s, bookingId);
    if (b.owner_id !== me.id) throw new Error('Booking not found');
    if (!['returned', 'closed'].includes(b.status)) throw new Error('Claims open after the car is returned');
    if (!claimWindowOpen(b.returned_at)) throw new Error('The 48-hour claim window has closed');
    if (b.deposit_status !== 'with_owner') throw new Error('The deposit has already been settled');
    if (amount <= 0 || amount > b.deposit) throw new Error(`Claim must be between RM1 and the deposit (RM${b.deposit})`);
    if (description.trim().length < 5) throw new Error('Describe the damage');
    if (s.claims.some((c) => c.booking_id === bookingId && ['open', 'reviewing'].includes(c.status))) {
      throw new Error('A claim is already open for this trip');
    }
    s.claims.push({
      id: `clm-${Date.now()}`, booking_id: bookingId, raised_by: me.id, description: description.trim(), amount,
      handling_fee: POLICY.claimHandlingFee, status: 'open', customer_response: null, resolution_note: null,
      evidence: evidencePaths, created_at: new Date().toISOString(),
    });
    await save();
  },
  async claimsFor(bookingId) {
    const s = await load();
    return s.claims.filter((c) => c.booking_id === bookingId);
  },
  async respondToClaim(claimId, accept) {
    const s = await load();
    const me = requireUser(s);
    const c = s.claims.find((x) => x.id === claimId);
    const b = c && findBooking(s, c.booking_id);
    if (!c || !b || b.customer_id !== me.id) throw new Error('Claim not found');
    if (c.status !== 'open') throw new Error('This claim is no longer open');
    if (accept) {
      Object.assign(c, { status: 'approved', customer_response: 'accepted' });
      b.deposit_status = 'deducted';
    } else {
      Object.assign(c, { status: 'reviewing', customer_response: 'disputed' });
    }
    await save();
  },
  async reportIncident(bookingId, kind, note, coords, photoPaths) {
    const s = await load();
    const me = requireUser(s);
    const b = findBooking(s, bookingId);
    if (![b.customer_id, b.owner_id].includes(me.id)) throw new Error('Booking not found');
    s.incidents.push({
      id: `inc-${Date.now()}`, booking_id: bookingId, reported_by: me.id, kind, note,
      lat: coords?.lat ?? null, lng: coords?.lng ?? null, photos: photoPaths, created_at: new Date().toISOString(),
    });
    await save();
  },
  async incidentsFor(bookingId) {
    const s = await load();
    return s.incidents.filter((i) => i.booking_id === bookingId);
  },

  async adminPendingVerifications() {
    const s = await load();
    if (!requireUser(s).is_admin) throw new Error('Admins only');
    return s.verifications
      .filter((v) => v.status === 'pending')
      .map((v) => ({
        id: v.id, user: s.profiles.find((p) => p.id === v.user_id)!, ic: v.ic, licence: v.licence, selfie: v.selfie,
        licence_class: v.licence_class, licence_expiry: v.licence_expiry, created_at: v.created_at,
      }));
  },
  async adminReviewVerification(id, approve) {
    const s = await load();
    if (!requireUser(s).is_admin) throw new Error('Admins only');
    const v = s.verifications.find((x) => x.id === id && x.status === 'pending');
    if (!v) throw new Error('Nothing to review');
    v.status = approve ? 'verified' : 'rejected';
    const p = s.profiles.find((x) => x.id === v.user_id);
    if (p) p.verification = v.status;
    await save();
  },
  async adminDisputedClaims() {
    const s = await load();
    if (!requireUser(s).is_admin) throw new Error('Admins only');
    return s.claims
      .filter((c) => c.status === 'reviewing')
      .map((c) => ({ ...c, booking: detail(s, findBooking(s, c.booking_id)) }));
  },
  async adminResolveClaim(id, approve, note) {
    const s = await load();
    if (!requireUser(s).is_admin) throw new Error('Admins only');
    const c = s.claims.find((x) => x.id === id && x.status === 'reviewing');
    if (!c) throw new Error('Nothing to resolve');
    Object.assign(c, { status: approve ? 'approved' : 'rejected', resolution_note: note });
    findBooking(s, c.booking_id).deposit_status = approve ? 'deducted' : 'returned';
    await save();
  },
};
