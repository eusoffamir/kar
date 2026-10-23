// Domain types shared by the mock and Supabase backends. Mirrors supabase/migrations.

export type BookingStatus =
  | 'pending_payment'
  | 'requested'
  | 'confirmed'
  | 'active'
  | 'returned'
  | 'closed'
  | 'cancelled'
  | 'declined'
  | 'no_show';

export type PhotoPhase = 'before' | 'after';
export const PHOTO_SLOTS = ['front', 'back', 'left', 'right', 'fuel', 'interior', 'odometer'] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];
/** Needed to start and to finish a trip (mirrors required_photos_taken in the database); the rest are optional. */
export const REQUIRED_PHOTO_SLOTS: readonly PhotoSlot[] = ['front', 'back', 'left', 'right', 'fuel'];
export const requiredPhotosTaken = (photos: { phase: PhotoPhase; slot: PhotoSlot }[], phase: PhotoPhase) =>
  REQUIRED_PHOTO_SLOTS.every((s) => photos.some((p) => p.phase === phase && p.slot === s));

export type Profile = {
  id: string;
  full_name: string;
  is_owner: boolean;
  is_admin: boolean;
  verification: 'unverified' | 'pending' | 'verified' | 'rejected';
  rating_avg: number | null;
  rating_count: number;
  trips_count: number;
  owner_strikes?: number;
  /** Set when Kar approves the operator's permit and insurance: listings say "Insured by operator" until then. */
  operator_insured_until?: string | null;
};

/** "Insured by operator" badge: Kar approved the owner's insurance and it hasn't expired. */
export const isInsured = (p: Pick<Profile, 'operator_insured_until'> | null | undefined, now = new Date()) =>
  !!p?.operator_insured_until && p.operator_insured_until >= now.toISOString().slice(0, 10);

export type Car = {
  id: string;
  owner_id: string;
  zone_id: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  transmission: 'auto' | 'manual';
  seats: number;
  fuel: string;
  photos: string[];
  description: string;
  price_per_hour: number;
  price_per_day: number;
  deposit: number;
  late_fee_per_hour: number;
  min_hours: number;
  instant_book: boolean;
  handover: 'manual' | 'keybox';
  pickup_lat: number;
  pickup_lng: number;
  pickup_note: string;
  is_listed: boolean;
  is_approved: boolean;
  /** Set when Kar rejected the listing; cleared when the owner changes the car details. */
  rejected_at?: string | null;
  /** Why Kar's automatic check sent this car to a person (car_review_flags in the database). */
  review_flags?: string[];
  /** Set when the check approved the car by itself; cleared once Kar has looked at it. */
  auto_approved_at?: string | null;
};

export type LastLocation = { car_id: string; lat: number; lng: number; note: string; updated_at: string };

/** One GPS fix from the customer's phone during an active trip (mirrors trip_locations). */
export type TripLocation = {
  booking_id: string;
  lat: number;
  lng: number;
  /** metres */
  accuracy: number | null;
  /** metres per second */
  speed: number | null;
  recorded_at: string;
};

/** What the phone sends to report_trip_location(); `t` is when the fix was taken (ISO). */
export type LocationFix = { lat: number; lng: number; accuracy: number | null; speed: number | null; t: string };

export type CarWithOwner = Car & { owner: Profile; last_location: LastLocation | null };

export type Booking = {
  id: string;
  car_id: string;
  customer_id: string;
  owner_id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  trip_amount: number;
  customer_fee: number;
  owner_commission: number;
  deposit: number;
  total_charged: number;
  owner_payout: number;
  picked_up_at: string | null;
  returned_at: string | null;
  created_at: string;
  /** held = Kar holds it until 48h after the return; with_owner = older bookings, paid in cash at pickup. */
  deposit_status: 'held' | 'with_owner' | 'returned' | 'deducted';
  /** Set when a held deposit is settled: what went back to the customer, and the owner's share (late fee + damage). */
  deposit_refund?: number | null;
  deposit_to_owner?: number | null;
  late_fee_due: number;
  cancellation_fee: number;
  refund_amount: number | null;
  cancelled_by: 'customer' | 'owner' | 'no_show' | 'system' | null;
  /** e.g. 'payment_timeout', 'owner_no_response', 'id_rejected' */
  cancel_reason?: string | null;
  rules_accepted_at: string | null;
};

export type Claim = {
  id: string;
  booking_id: string;
  description: string;
  amount: number;
  handling_fee: number;
  /** open = waiting for customer; reviewing = disputed, Kar decides */
  status: 'open' | 'reviewing' | 'approved' | 'rejected' | 'settled';
  customer_response: 'accepted' | 'disputed' | null;
  resolution_note: string | null;
  evidence: string[]; // displayable URLs
  created_at: string;
};

export type IncidentKind = 'accident' | 'breakdown' | 'cant_find' | 'other';
export type Incident = {
  id: string;
  booking_id: string;
  reported_by: string;
  kind: IncidentKind;
  note: string;
  lat: number | null;
  lng: number | null;
  photos: string[];
  created_at: string;
};

/** A refund Kar owes a customer. Sent through CHIP automatically; the admin screen can retry or record a manual transfer. */
export type PendingRefund = {
  id: string;
  amount: number;
  created_at: string;
  /** processing = being sent to CHIP right now, or stuck there (check the CHIP dashboard) */
  status: 'pending' | 'processing';
  /** Why CHIP's last automatic attempt failed, if it did. */
  last_error: string | null;
  booking: BookingDetail;
};

export type OwnerSummary = { id: string; full_name: string; email: string; cars: number; strikes: number; insured_until: string | null };

/** A rental operator's permit and insurance, reviewed by Kar before their cars can be approved. */
export type OperatorDocs = {
  id: string;
  business_name: string;
  ssm_no: string;
  permit_no: string;
  insurer: string;
  policy_no: string;
  insurance_expiry: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_note: string | null;
  created_at: string;
};
export type OperatorDocsInput = Pick<OperatorDocs, 'business_name' | 'ssm_no' | 'permit_no' | 'insurer' | 'policy_no' | 'insurance_expiry'> & {
  permitUri: string;
  insuranceUri: string;
};
export type OperatorReview = OperatorDocs & { owner: Profile; email: string; permit: string; insurance: string };

/**
 * A student who wants to list their own car once Kar has a P2P insurer. No money is taken; Kar uses the list
 * to plan supply and to show insurers the demand.
 */
export type WaitlistEntry = {
  zone_id: string;
  car: string;
  car_year: number;
  /** Whose name is on the car's grant. */
  registered_to: 'me' | 'family' | 'other';
  /** Still on hire purchase: the bank must agree before the car can be rented out. */
  on_loan: boolean;
  free_days_per_week: number;
  /** Interested in Pro: GPS tracker kit and a lower fee. */
  wants_pro: boolean;
  created_at: string;
};
export type WaitlistInput = Omit<WaitlistEntry, 'created_at'>;
export type WaitlistReview = WaitlistEntry & { user_id: string; full_name: string; email: string };

/** What Kar owes one owner: finished trips past the claim window plus cancellation fees. */
export type PayoutDue = { owner_id: string; owner_name: string; booking_ids: string[]; amount: number };

export type VerificationReview = {
  id: string;
  user: Profile;
  ic: string;
  licence: string;
  selfie: string;
  licence_class: string | null;
  licence_expiry: string | null;
  created_at: string;
  /** Why Kar's automatic check sent this ID to a person (id_review_flags in the database). */
  review_flags: string[];
  /** Set when the check approved the ID by itself; cleared once Kar has looked at it. */
  auto_approved_at: string | null;
};

export type BookingDetail = Booking & {
  car: Car;
  customer: Profile;
  owner: Profile;
  photos: TripPhoto[];
};

export type TripPhoto = {
  booking_id: string;
  phase: PhotoPhase;
  slot: PhotoSlot;
  uri: string;
  lat: number | null;
  lng: number | null;
  taken_at: string;
};

export type Zone = { id: string; name: string; center_lat: number; center_lng: number };
