import AsyncStorage from '@react-native-async-storage/async-storage';

import { Backend, LIVE_STATUSES, overlaps } from './backend';
import { cancellationPreview, canBook, canMarkNoShow, claimWindowOpen, lateFee, normalizeMyPhone, POLICY } from './policy';
import { quote } from './pricing';
import {
  isInsured,
  requiredPhotosTaken,
  type Booking,
  type BookingDetail,
  type Car,
  type CarWithOwner,
  type Claim,
  type Incident,
  type LastLocation,
  type OperatorDocs,
  type Profile,
  type TripLocation,
  type TripPhoto,
  type Zone,
} from './types';

// Demo backend: same rules as the database (pricing, no overlaps, 5 required photos, last-parked update)
// stored on-device so the app can be shown to owners and students with no server.

const KEY = 'kar-demo-v4';
const OWNER = 'owner-aiman';
const OWNER2 = 'owner-siti';
const CUSTOMER = 'cust-hakim';
const NEW_STUDENT = 'cust-new';
const ADMIN = 'kar-admin';
/** Demo customer who is out driving Aiman's Axia right now (shows the owner's live map). */
const DRIVER = 'cust-farah';
const LIVE_TRIP = 'bk-live';

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
  /** Booking ids whose refund Kar has sent (demo stand-in for refund payment rows). */
  refundsPaid?: string[];
  /** Booking ids already paid out to the owner. */
  payoutsPaid?: string[];
  phones?: Record<string, string>;
  /** Fixes sent by the demo customer's own phone (the seeded live trip is simulated instead). */
  tripLocations?: TripLocation[];
  operatorDocs?: (OperatorDocs & { owner_id: string; permit: string; insurance: string })[];
  zones?: Zone[];
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
      profile(OWNER, 'Aiman (Owner)', { is_owner: true, rating_avg: 4.9, rating_count: 37, operator_insured_until: '2027-12-31' }),
      profile(OWNER2, 'Siti Rentals', { is_owner: true, rating_avg: 4.7, rating_count: 12, operator_insured_until: '2027-06-30' }),
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
    profile(DRIVER, 'Farah (Student)', { rating_avg: 4.8, rating_count: 5, trips_count: 5 }),
  ];
}

// ---------------------------------------------------------------------------
// Live tracking demo: Farah has had the Axia for 40 minutes and is driving a loop around UTP and Seri Iskandar.
// Her route is simulated from the clock, so the owner's live map moves without a second phone. The loop follows
// real roads (OpenStreetMap route via OSRM, ~19 km), so it looks right on the satellite map.
// ---------------------------------------------------------------------------
const DEMO_LOOP: [number, number][] = [
  [4.383617, 100.968997], [4.384149, 100.968705], [4.385905, 100.968718], [4.386689, 100.969768], [4.386688, 100.971266],
  [4.387213, 100.971576], [4.387489, 100.971789], [4.387668, 100.971859], [4.387553, 100.972189], [4.386868, 100.973326],
  [4.386468, 100.974444], [4.385421, 100.975135], [4.385119, 100.975482], [4.384918, 100.975367], [4.384934, 100.975203],
  [4.38436, 100.974251], [4.382981, 100.972653], [4.382355, 100.971448], [4.382089, 100.970437], [4.382736, 100.970268],
  [4.383212, 100.970513], [4.383928, 100.970816], [4.384606, 100.971036], [4.385403, 100.971273], [4.387007, 100.971392],
  [4.387393, 100.971718], [4.387588, 100.97179], [4.387682, 100.971965], [4.387145, 100.972592], [4.386632, 100.9741],
  [4.386083, 100.9748], [4.385246, 100.975392], [4.38524, 100.976216], [4.385741, 100.978531], [4.385808, 100.979386],
  [4.385779, 100.980088], [4.38569, 100.980525], [4.385, 100.980605], [4.382513, 100.980608], [4.37677, 100.980269],
  [4.373256, 100.980126], [4.370986, 100.979986], [4.368037, 100.979772], [4.367424, 100.979572], [4.366298, 100.978836],
  [4.365997, 100.978376], [4.366647, 100.977757], [4.367614, 100.978743], [4.368455, 100.977726], [4.369673, 100.976104],
  [4.369897, 100.975451], [4.369871, 100.975355], [4.369688, 100.9753], [4.369609, 100.975163], [4.369688, 100.9753],
  [4.369871, 100.975355], [4.369794, 100.975717], [4.369456, 100.976382], [4.368267, 100.977986], [4.367253, 100.978379],
  [4.366451, 100.97795], [4.365937, 100.978492], [4.36495, 100.97954], [4.364929, 100.979683], [4.365521, 100.979844],
  [4.36547, 100.98003], [4.364929, 100.979683], [4.364781, 100.979724], [4.364689, 100.979584], [4.364778, 100.979466],
  [4.36558, 100.978718], [4.366301, 100.978661], [4.367471, 100.979461], [4.368569, 100.979763], [4.373668, 100.979966],
  [4.373766, 100.979189], [4.373616, 100.979758], [4.37257, 100.979626], [4.373159, 100.978912], [4.373229, 100.979153],
  [4.373917, 100.979736], [4.375924, 100.980143], [4.379256, 100.980304], [4.381492, 100.980421], [4.385393, 100.980454],
  [4.385609, 100.980202], [4.385569, 100.979379], [4.385619, 100.978684], [4.38546, 100.977167], [4.384987, 100.975454],
  [4.384909, 100.975283], [4.384826, 100.97495], [4.383413, 100.973206], [4.382624, 100.972035], [4.382035, 100.970449],
  [4.38255, 100.970282], [4.383157, 100.970465], [4.383677, 100.970824], [4.384202, 100.97088], [4.385303, 100.971258],
  [4.386851, 100.971309], [4.387322, 100.971657], [4.387539, 100.971781], [4.387832, 100.971554], [4.388289, 100.969744],
  [4.38817, 100.968232], [4.388443, 100.96697], [4.388164, 100.966658], [4.388177, 100.966815], [4.388029, 100.967041],
  [4.387954, 100.966942], [4.388393, 100.966597], [4.38855, 100.966527], [4.388658, 100.966627], [4.388631, 100.966762],
  [4.388256, 100.967841], [4.388065, 100.968814], [4.387219, 100.968831], [4.386689, 100.969768], [4.386688, 100.971266],
  [4.385125, 100.971211], [4.384099, 100.970837], [4.383483, 100.970726], [4.383127, 100.970439], [4.382295, 100.970372],
  [4.381693, 100.970404], [4.38087, 100.969732], [4.379868, 100.968863], [4.378515, 100.968421], [4.378082, 100.967592],
  [4.378572, 100.965969], [4.378471, 100.965161], [4.377843, 100.963723], [4.378118, 100.962708], [4.379456, 100.96184],
  [4.381269, 100.961525], [4.382285, 100.960902], [4.383317, 100.961072], [4.383979, 100.961937], [4.38496, 100.962435],
  [4.387235, 100.962619], [4.38831, 100.963303], [4.388696, 100.964064], [4.388493, 100.964567], [4.387819, 100.964503],
  [4.3886, 100.964431], [4.388775, 100.965084], [4.388666, 100.965847], [4.388605, 100.966445], [4.388664, 100.966663],
  [4.388595, 100.966793], [4.388238, 100.967922], [4.387779, 100.96882], [4.386855, 100.968838], [4.38669, 100.97024],
  [4.386405, 100.971277], [4.384741, 100.971088], [4.38404, 100.970824], [4.383332, 100.970623], [4.383225, 100.970373],
  [4.383205, 100.969306], [4.383341, 100.968808], [4.383617, 100.96887], [4.383617, 100.968997],
];
const DEMO_SPEED = 10; // m/s, about 36 km/h
const FIX_EVERY = 30_000;

function metres(a: [number, number], b: [number, number]) {
  const dy = (b[0] - a[0]) * 111_320;
  const dx = (b[1] - a[1]) * 111_320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Where the demo car is after driving `distance` metres around the loop. */
function pointOnLoop(distance: number): [number, number] {
  const legs = DEMO_LOOP.map((p, i) => [p, DEMO_LOOP[(i + 1) % DEMO_LOOP.length]] as const);
  const total = legs.reduce((sum, [a, b]) => sum + metres(a, b), 0);
  let d = distance % total;
  for (const [a, b] of legs) {
    const len = metres(a, b);
    if (d <= len) return [a[0] + ((b[0] - a[0]) * d) / len, a[1] + ((b[1] - a[1]) * d) / len];
    d -= len;
  }
  return DEMO_LOOP[0];
}

function simulatedRoute(b: Booking): TripLocation[] {
  if (!b.picked_up_at) return [];
  const start = new Date(b.picked_up_at).getTime();
  const end = b.returned_at ? new Date(b.returned_at).getTime() : Date.now();
  const out: TripLocation[] = [];
  for (let t = start; t <= end; t += FIX_EVERY) {
    const [lat, lng] = pointOnLoop(((t - start) / 1000) * DEMO_SPEED);
    out.push({ booking_id: b.id, lat, lng, accuracy: 8, speed: DEMO_SPEED, recorded_at: new Date(t).toISOString() });
  }
  return out;
}

function routeFor(s: Store, bookingId: string): TripLocation[] {
  const b = s.bookings.find((x) => x.id === bookingId);
  if (!b) return [];
  if (b.id === LIVE_TRIP && b.customer_id === DRIVER) return simulatedRoute(b);
  return (s.tripLocations ?? []).filter((l) => l.booking_id === bookingId).sort((x, y) => x.recorded_at.localeCompare(y.recorded_at));
}

/** The seeded live trip, kept current: an old demo install gets a fresh one instead of a trip overdue by days. */
function refreshLiveTrip(s: Store) {
  const axia = s.cars.find((c) => c.id === 'car-axia');
  if (!axia) return;
  const existing = s.bookings.find((b) => b.id === LIVE_TRIP);
  if (existing && (existing.status !== 'active' || new Date(existing.ends_at).getTime() > Date.now())) return;
  const now = Date.now();
  const start = new Date(now - 40 * 60_000);
  const end = new Date(now + 200 * 60_000);
  // Don't double-book the Axia if the demo user booked it for this time themselves.
  const clash = s.bookings.some(
    (b) => b.id !== LIVE_TRIP && b.car_id === axia.id && (LIVE_STATUSES as readonly string[]).includes(b.status) && overlaps(b, start, end),
  );
  if (clash) return;
  const q = quote(axia, start, end);
  const trip: Booking = {
    id: LIVE_TRIP, car_id: axia.id, customer_id: DRIVER, owner_id: axia.owner_id,
    starts_at: start.toISOString(), ends_at: end.toISOString(), status: 'active',
    trip_amount: q.trip, customer_fee: q.fee, owner_commission: q.ownerCommission, deposit: q.deposit,
    total_charged: q.total, owner_payout: q.ownerPayout,
    picked_up_at: start.toISOString(), returned_at: null,
    created_at: new Date(now - 26 * HOUR).toISOString(),
    ...P0_BOOKING_DEFAULTS,
    rules_accepted_at: new Date(now - 26 * HOUR).toISOString(),
  };
  s.bookings = s.bookings.filter((b) => b.id !== LIVE_TRIP);
  s.bookings.push(trip);
}

/** Bring demo data saved by older builds up to date without wiping the user's own cars. */
function upgrade(s: Store) {
  s.verifications ??= [];
  s.claims ??= [];
  s.incidents ??= [];
  s.tripLocations ??= [];
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
    refreshLiveTrip(cache);
    // Like the database's 10-minute job: deposits are settled once the claim window closes.
    for (const b of cache.bookings) {
      if (b.returned_at && Date.now() - new Date(b.returned_at).getTime() > POLICY.claimWindowHours * HOUR) settleDeposit(cache, b);
    }
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
  // Like the database policy: the parking spot is only for the owner and the customer picking it up.
  const me = s.profiles.find((p) => p.id === s.userId);
  const seesSpot =
    !!me &&
    (me.is_admin ||
      c.owner_id === me.id ||
      s.bookings.some((b) => b.car_id === c.id && b.customer_id === me.id && ['confirmed', 'active'].includes(b.status)));
  return {
    ...c,
    owner: s.profiles.find((p) => p.id === c.owner_id)!,
    last_location: seesSpot ? (s.lastLocations.find((l) => l.car_id === c.id) ?? null) : null,
  };
}

const HOUR = 3_600_000;
/** Mirrors settle_deposit(): owner gets late fee + approved damage (capped at the deposit), customer the rest. */
function settleDeposit(s: Store, b: Booking) {
  if (b.deposit_status !== 'held' || !['returned', 'closed'].includes(b.status)) return;
  const claims = s.claims.filter((c) => c.booking_id === b.id);
  if (claims.some((c) => c.status === 'open' || c.status === 'reviewing')) return;
  const damage = claims.filter((c) => c.status === 'approved').reduce((t, c) => t + c.amount, 0);
  const toOwner = Math.min(b.deposit, b.late_fee_due + damage);
  Object.assign(b, { deposit_status: toOwner > 0 ? 'deducted' : 'returned', deposit_to_owner: toOwner, deposit_refund: b.deposit - toOwner });
}

/** Mirrors admin_payouts_due(): what each booking owes its owner (minus Kar's fee on approved claims), or 0. */
function payoutOwed(s: Store, b: Booking) {
  const settled = ['returned', 'closed'].includes(b.status);
  if (settled) {
    const windowClosed = !!b.returned_at && Date.now() - new Date(b.returned_at).getTime() > POLICY.claimWindowHours * HOUR;
    const claims = s.claims.filter((c) => c.booking_id === b.id);
    if (!windowClosed || b.deposit_status === 'held' || claims.some((c) => c.status === 'open' || c.status === 'reviewing')) return 0;
    return b.owner_payout + (b.deposit_to_owner ?? 0) - claims.filter((c) => c.status === 'approved').reduce((t, c) => t + c.handling_fee, 0);
  }
  return ['cancelled', 'no_show'].includes(b.status) ? b.cancellation_fee : 0;
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

/** Date in Malaysia (UTC+8, no daylight saving) as YYYY-MM-DD. */
const myDate = (d: Date) => new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);

/** Licence expiry from the latest approved or pending ID check. Mirrors licence_expiry(). */
function licenceExpiry(s: Store, userId: string) {
  const v = s.verifications
    .filter((x) => x.user_id === userId && x.status !== 'rejected')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return v?.licence_expiry || null;
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
  async signInWithGoogle() {
    const s = await load();
    s.userId = CUSTOMER;
    await save();
    return true;
  },
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
  async updateMyName(name) {
    const s = await load();
    const me = requireUser(s);
    if (me.verification === 'verified') throw new Error('Your name was checked against your ID. Contact Kar to change it.');
    const clean = name.trim().replace(/\s+/g, ' ');
    if (clean.length < 3) throw new Error('Enter at least 3 letters');
    me.full_name = clean.slice(0, 80);
    await save();
  },
  async registerPushToken() {},

  async zones(): Promise<Zone[]> {
    const s = await load();
    return [{ id: 'utp', name: 'UTP, Seri Iskandar', center_lat: 4.3845, center_lng: 100.967 }, ...(s.zones ?? [])];
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
    if (!canBook(me.verification)) throw new Error('Verify your ID to book');
    if (!rulesAccepted) throw new Error('Accept the house rules to book');
    const exp = licenceExpiry(s, me.id);
    if (exp && exp < myDate(end)) {
      throw new Error(`Your driving licence expires on ${exp}, before this trip ends. Renew it and upload the new licence first.`);
    }
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
      deposit_status: 'held',
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
    const exp = licenceExpiry(s, requireUser(s).id);
    if (exp && exp < myDate(new Date())) {
      throw new Error('Your driving licence has expired. Upload your renewed licence in Kar to pick up.');
    }
    if (requireUser(s).verification !== 'verified') {
      throw new Error('Kar is still checking your ID. You can pick up once it is approved.');
    }
    if (!requiredPhotosTaken(s.photos.filter((p) => p.booking_id === id), 'before')) {
      throw new Error('Take the front, back, both sides and fuel gauge photos first');
    }
    if (b.status !== 'confirmed') throw new Error('Trip cannot be started yet');
    b.status = 'active';
    b.picked_up_at = new Date().toISOString();
    await save();
  },
  async completeReturn(id, lat, lng, note) {
    const s = await load();
    const b = findBooking(s, id);
    if (!requiredPhotosTaken(s.photos.filter((p) => p.booking_id === id), 'after')) {
      throw new Error('Take the front, back, both sides and fuel gauge photos first');
    }
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
    if (!['confirmed', 'active'].includes(b.status) || requireUser(s).verification !== 'verified') return null;
    return s.secrets[b.car_id] ?? null;
  },
  async contactPhone(id) {
    const s = await load();
    const b = findBooking(s, id);
    // Same window as the database: during the booking and 24 hours after the return.
    const recentlyReturned = b.status === 'returned' && !!b.returned_at && Date.now() - new Date(b.returned_at).getTime() < 24 * HOUR;
    if (!['confirmed', 'active'].includes(b.status) && !recentlyReturned) return null;
    const other = b.customer_id === s.userId ? b.owner_id : b.customer_id;
    return s.phones?.[other] ?? '60123456789'; // seeded demo accounts share a placeholder number
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
    if (b.owner_id !== s.userId || b.status !== 'requested') throw new Error('Booking cannot be updated');
    if (accept) b.status = 'confirmed';
    else Object.assign(b, { status: 'declined', cancelled_by: 'owner', refund_amount: b.total_charged });
    await save();
  },
  async createCar(input, keyboxCode) {
    const s = await load();
    const me = requireUser(s);
    // Waits for Kar approval like production: switch to the Kar Admin demo account to approve it.
    const c: Car = { ...input, id: `car-${Date.now()}`, owner_id: me.id, is_listed: false, is_approved: false, rejected_at: null };
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
    // Same rules as protect_car_columns in the database.
    if (patch.is_listed && !c.is_listed && (me.owner_strikes ?? 0) >= POLICY.ownerStrikeLimit) {
      throw new Error(`Your cars are hidden after ${POLICY.ownerStrikeLimit} cancellations. Contact Kar to relist.`);
    }
    if (patch.is_listed && !c.is_approved) delete patch.is_listed;
    const identity = (x: Partial<Car>) => [x.make, x.model, x.year, x.plate].join('|');
    const changed = identity({ ...c, ...patch }) !== identity(c);
    Object.assign(c, patch);
    if (changed && c.is_approved) Object.assign(c, { is_approved: false, is_listed: false });
    if (changed || patch.photos) c.rejected_at = null;
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
    // Kar keeps its booking fee, like a customer cancellation.
    const deposit = b.deposit_status === 'held' ? b.deposit : 0;
    Object.assign(b, { status: 'no_show', cancelled_by: 'no_show', cancellation_fee: fee, refund_amount: b.trip_amount - fee + deposit });
    await save();
  },
  async customerSelfie(bookingId) {
    const s = await load();
    const b = findBooking(s, bookingId);
    if (b.owner_id !== requireUser(s).id || !['confirmed', 'active'].includes(b.status)) return null;
    // Seeded demo customers have no ID photos; a demo user who verified in the app does.
    return s.verifications.filter((v) => v.user_id === b.customer_id && v.status === 'verified').at(-1)?.selfie ?? null;
  },
  async myOperatorDocs() {
    const s = await load();
    const me = requireUser(s);
    return (s.operatorDocs ?? []).filter((d) => d.owner_id === me.id).at(-1) ?? null;
  },
  async submitOperatorDocs({ permitUri, insuranceUri, ...d }) {
    const s = await load();
    const me = requireUser(s);
    if ((s.operatorDocs ?? []).some((x) => x.owner_id === me.id && x.status === 'pending')) {
      throw new Error('Kar is still checking your last documents');
    }
    if (d.insurance_expiry <= new Date().toISOString().slice(0, 10)) throw new Error('Your insurance has expired');
    s.operatorDocs = [...(s.operatorDocs ?? []), {
      ...d, id: `op-${Date.now()}`, owner_id: me.id, permit: permitUri, insurance: insuranceUri,
      status: 'pending', reviewer_note: null, created_at: new Date().toISOString(),
    }];
    if (me.verification !== 'verified') me.full_name = d.business_name;
    await save();
  },
  async setDepositReturned(bookingId) {
    const s = await load();
    const me = requireUser(s);
    const b = findBooking(s, bookingId);
    if (s.claims.some((c) => c.booking_id === bookingId && ['open', 'reviewing'].includes(c.status))) {
      throw new Error('Resolve the open claim first');
    }
    if (b.owner_id !== me.id || !['with_owner', 'held'].includes(b.deposit_status)) throw new Error('Deposit cannot be updated');
    if (b.deposit_status === 'held') settleDeposit(s, b);
    else b.deposit_status = 'returned';
    await save();
  },

  async submitVerification({ icUri, licenceUri, selfieUri, licenceClass, licenceExpiry, phone, fullName }) {
    const s = await load();
    const me = requireUser(s);
    const normalized = normalizeMyPhone(phone);
    if (!normalized) throw new Error('Enter a Malaysian mobile number, e.g. 012-345 6789');
    if (licenceExpiry && new Date(licenceExpiry) < new Date()) throw new Error('Your licence has expired');
    const name = fullName.trim().replace(/\s+/g, ' ');
    if (name.length < 3) throw new Error('Enter your full name as on your IC');
    me.full_name = name.slice(0, 80);
    s.phones = { ...s.phones, [me.id]: normalized };
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
    if (!['with_owner', 'held'].includes(b.deposit_status)) throw new Error('The deposit has already been settled');
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
      if (b.deposit_status === 'with_owner') b.deposit_status = 'deducted';
      else settleDeposit(s, b);
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

  async reportTripLocation(bookingId, fixes) {
    const s = await load();
    const b = findBooking(s, bookingId);
    if (b.customer_id !== requireUser(s).id) throw new Error('Booking not found');
    if (b.status !== 'active') return 0;
    const rows = fixes.slice(0, 120).map((f) => ({
      booking_id: b.id, lat: f.lat, lng: f.lng, accuracy: f.accuracy, speed: f.speed,
      recorded_at: new Date(Math.min(Date.parse(f.t) || Date.now(), Date.now())).toISOString(),
    }));
    // Demo storage is small: keep the last 2000 fixes overall.
    s.tripLocations = [...(s.tripLocations ?? []), ...rows].slice(-2000);
    await save();
    return rows.length;
  },
  async latestTripLocations(bookingIds) {
    const s = await load();
    const me = requireUser(s);
    return bookingIds.flatMap((id) => {
      const b = s.bookings.find((x) => x.id === id);
      if (!b || ![b.customer_id, b.owner_id].includes(me.id)) return [];
      return routeFor(s, id).slice(-1);
    });
  },
  async tripRoute(bookingId) {
    const s = await load();
    const me = requireUser(s);
    const b = findBooking(s, bookingId);
    if (![b.customer_id, b.owner_id].includes(me.id) && !me.is_admin) throw new Error('Booking not found');
    return routeFor(s, bookingId);
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
    // Like the database: a rejected ID cancels unstarted bookings, refunding paid ones in full.
    if (!approve) {
      for (const b of s.bookings) {
        if (b.customer_id !== v.user_id || !['pending_payment', 'requested', 'confirmed'].includes(b.status)) continue;
        const refund = b.status === 'pending_payment' ? 0 : b.total_charged;
        Object.assign(b, { status: 'cancelled', cancelled_by: 'system', cancel_reason: 'id_rejected', refund_amount: refund });
      }
    }
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
    const b = findBooking(s, c.booking_id);
    if (b.deposit_status === 'with_owner') b.deposit_status = approve ? 'deducted' : 'returned';
    else settleDeposit(s, b);
    await save();
  },
  async adminPendingCars() {
    const s = await load();
    if (!requireUser(s).is_admin) throw new Error('Admins only');
    return s.cars.filter((c) => !c.is_approved && !c.rejected_at).map((c) => withOwner(s, c));
  },
  async adminApproveCar(carId, approve) {
    const s = await load();
    if (!requireUser(s).is_admin) throw new Error('Admins only');
    const c = s.cars.find((x) => x.id === carId);
    if (!c) throw new Error('Car not found');
    if (approve && !isInsured(s.profiles.find((p) => p.id === c.owner_id))) {
      throw new Error("Approve the owner's permit and insurance first");
    }
    Object.assign(c, { is_approved: approve, is_listed: approve, rejected_at: approve ? null : new Date().toISOString() });
    await save();
  },
  async adminPendingRefunds() {
    const s = await load();
    if (!requireUser(s).is_admin) throw new Error('Admins only');
    const paid = new Set(s.refundsPaid ?? []);
    return s.bookings
      .filter((b) => (b.refund_amount ?? 0) > 0 && !paid.has(b.id))
      .map((b) => ({
        id: b.id, amount: b.refund_amount!, created_at: b.created_at, status: 'pending' as const, last_error: null,
        booking: detail(s, b),
      }));
  },
  async processRefunds() {
    // Demo: the gateway "refunds" everything at once.
    const s = await load();
    const due = (await this.adminPendingRefunds()).map((r) => r.id);
    s.refundsPaid = [...(s.refundsPaid ?? []), ...due];
    await save();
    return { refunded: due.length, failed: 0 };
  },
  async adminMarkRefundPaid(refundId) {
    const s = await load();
    if (!requireUser(s).is_admin) throw new Error('Admins only');
    s.refundsPaid = [...(s.refundsPaid ?? []), refundId];
    await save();
  },
  async adminPayoutsDue() {
    const s = await load();
    if (!requireUser(s).is_admin) throw new Error('Admins only');
    const paid = new Set(s.payoutsPaid ?? []);
    const byOwner = new Map<string, { booking_ids: string[]; amount: number }>();
    for (const b of s.bookings) {
      const owed = payoutOwed(s, b);
      if (owed <= 0 || paid.has(b.id)) continue;
      const row = byOwner.get(b.owner_id) ?? { booking_ids: [], amount: 0 };
      row.booking_ids.push(b.id);
      row.amount = Math.round((row.amount + owed) * 100) / 100;
      byOwner.set(b.owner_id, row);
    }
    return [...byOwner].map(([owner_id, r]) => ({
      owner_id,
      owner_name: s.profiles.find((p) => p.id === owner_id)?.full_name ?? '',
      ...r,
    }));
  },
  async adminOwners() {
    const s = await load();
    if (!requireUser(s).is_admin) throw new Error('Admins only');
    return s.profiles
      .filter((p) => p.is_owner)
      .map((p) => ({
        id: p.id, full_name: p.full_name, email: `${p.id}@demo.kar`,
        cars: s.cars.filter((c) => c.owner_id === p.id).length, strikes: p.owner_strikes ?? 0,
        insured_until: p.operator_insured_until ?? null,
      }));
  },
  async adminResetStrikes(ownerId) {
    const s = await load();
    if (!requireUser(s).is_admin) throw new Error('Admins only');
    const p = s.profiles.find((x) => x.id === ownerId);
    if (p) p.owner_strikes = 0;
    await save();
  },
  async adminPendingOperators() {
    const s = await load();
    if (!requireUser(s).is_admin) throw new Error('Admins only');
    return (s.operatorDocs ?? [])
      .filter((d) => d.status === 'pending')
      .map((d) => ({ ...d, owner: s.profiles.find((p) => p.id === d.owner_id)!, email: `${d.owner_id}@demo.kar` }));
  },
  async adminReviewOperator(id, approve, note) {
    const s = await load();
    if (!requireUser(s).is_admin) throw new Error('Admins only');
    const d = (s.operatorDocs ?? []).find((x) => x.id === id && x.status === 'pending');
    if (!d) throw new Error('Nothing to review');
    Object.assign(d, { status: approve ? 'approved' : 'rejected', reviewer_note: note });
    const p = s.profiles.find((x) => x.id === d.owner_id);
    if (approve && p) Object.assign(p, { operator_insured_until: d.insurance_expiry, is_owner: true });
    await save();
  },
  async adminAddZone(id, name, lat, lng) {
    const s = await load();
    if (!requireUser(s).is_admin) throw new Error('Admins only');
    if (id === 'utp' || (s.zones ?? []).some((z) => z.id === id)) throw new Error('That area already exists');
    s.zones = [...(s.zones ?? []), { id, name, center_lat: lat, center_lng: lng }];
    await save();
  },
  async adminSetOwner(email, make) {
    // Demo accounts have no real email: match "<account id>@demo.kar" or the account id itself.
    const s = await load();
    if (!requireUser(s).is_admin) throw new Error('Admins only');
    const key = email.trim().toLowerCase().replace(/@demo\.kar$/, '');
    const p = s.profiles.find((x) => x.id === key);
    if (!p) throw new Error('No Kar account with that email. Ask them to log in to Kar once first.');
    p.is_owner = make;
    if (!make) for (const c of s.cars) if (c.owner_id === p.id) c.is_listed = false;
    await save();
    return p.full_name || email;
  },
  async adminRecordPayout(bookingIds) {
    const s = await load();
    if (!requireUser(s).is_admin) throw new Error('Admins only');
    s.payoutsPaid = [...new Set([...(s.payoutsPaid ?? []), ...bookingIds])];
    await save();
  },
};
