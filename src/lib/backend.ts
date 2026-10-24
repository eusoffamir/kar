import type {
  Booking,
  BookingDetail,
  Car,
  CarWithOwner,
  Claim,
  Incident,
  IncidentKind,
  LocationFix,
  OperatorDocs,
  OperatorDocsInput,
  OperatorReview,
  OwnerProfile,
  OwnerSummary,
  PayoutDue,
  PendingRefund,
  PhotoPhase,
  PhotoSlot,
  Profile,
  TripLocation,
  VerificationReview,
  WaitlistEntry,
  WaitlistInput,
  WaitlistReview,
  Zone,
} from './types';

export type BusyRange = { starts_at: string; ends_at: string };

// No deposit: Kar takes none, so cars keep the database default (0).
export type NewCar = Omit<Car, 'id' | 'owner_id' | 'is_listed' | 'is_approved' | 'deposit'>;

/**
 * Everything the app needs from a backend. Two implementations:
 * - mock-backend.ts: local demo data, runs with zero setup (UTP pitch/demo mode)
 * - supabase-backend.ts: production, used when EXPO_PUBLIC_SUPABASE_URL is set
 */
export interface Backend {
  readonly mode: 'demo' | 'supabase';

  // Auth
  me(): Promise<Profile | null>;
  signInWithEmail(email: string): Promise<{ needsCode: boolean }>;
  verifyEmailCode(email: string, code: string): Promise<void>;
  /** Resolves true once signed in. On web the page redirects to Google instead and comes back signed in. */
  signInWithGoogle(): Promise<boolean>;
  signOut(): Promise<void>;
  /** Demo mode only: switch between seeded owner/customer accounts. */
  demoAccounts?(): Promise<Profile[]>;
  demoSignInAs?(userId: string): Promise<void>;
  becomeOwner(): Promise<void>;
  /** Display name for accounts without a verified ID (owners). A verified name is locked by the database. */
  updateMyName(name: string): Promise<void>;
  /** Saves this phone's Expo push token so the database can send notifications. */
  registerPushToken(token: string): Promise<void>;

  // Customer
  zones(): Promise<Zone[]>;
  listCars(zoneId: string): Promise<CarWithOwner[]>;
  getCar(id: string): Promise<CarWithOwner & { busy: BusyRange[] }>;
  /** An owner's page: their listed cars and renters' reviews (reviewers' first names only). */
  ownerProfile(ownerId: string): Promise<OwnerProfile>;
  /** Needs a submitted ID (pending or verified); pickup needs it approved. `rulesAccepted` must be true. */
  createBooking(carId: string, start: Date, end: Date, rulesAccepted: boolean): Promise<Booking>;
  /** Returns a payment URL to open, or null when the payment completed in-app (demo). */
  startPayment(bookingId: string): Promise<{ url: string | null }>;
  myTrips(): Promise<BookingDetail[]>;
  getBooking(id: string): Promise<BookingDetail>;
  /** Customer cancels; returns the refund amount (policy in lib/policy.ts). */
  cancelBooking(id: string): Promise<number>;
  uploadTripPhoto(
    bookingId: string,
    phase: PhotoPhase,
    slot: PhotoSlot,
    uri: string,
    coords: { lat: number; lng: number } | null,
  ): Promise<void>;
  startTrip(id: string): Promise<void>;
  completeReturn(id: string, lat: number, lng: number, note: string): Promise<void>;
  keyboxCode(id: string): Promise<string | null>;
  /** Phone of the other party, available once the booking is confirmed. */
  contactPhone(bookingId: string): Promise<string | null>;
  review(bookingId: string, toId: string, rating: number, comment: string): Promise<void>;

  // Owner
  ownerCars(): Promise<CarWithOwner[]>;
  ownerBookings(): Promise<BookingDetail[]>;
  respondToBooking(id: string, accept: boolean): Promise<void>;
  createCar(car: NewCar, keyboxCode: string | null): Promise<Car>;
  /** `keyboxCode`: undefined = leave as is, null = remove, string = set. */
  updateCar(id: string, patch: Partial<NewCar> & { is_listed?: boolean }, keyboxCode?: string | null): Promise<void>;
  /** Current key box code for the owner's edit form. */
  ownerCarSecret(carId: string): Promise<string | null>;
  /** Uploads a listing photo and returns its public URL. */
  uploadCarPhoto(uri: string): Promise<string>;
  blockCustomer(customerId: string, reason: string): Promise<void>;
  /** Owner cancels: full refund to the customer and a strike on the owner. */
  ownerCancelBooking(id: string, reason: string): Promise<void>;
  markNoShow(id: string): Promise<void>;
  /** Owner (or Kar admin) confirms the renter paid the late fee above the deposit. */
  markLateExtraPaid(id: string): Promise<void>;
  setDepositReturned(bookingId: string): Promise<void>;
  /** The renter's verified selfie (a short-lived URL) while the booking is confirmed or active, else null. */
  customerSelfie(bookingId: string): Promise<string | null>;
  /** The owner's latest permit and insurance submission, if any. */
  myOperatorDocs(): Promise<OperatorDocs | null>;
  submitOperatorDocs(input: OperatorDocsInput): Promise<void>;
  /** Student-owner waitlist: my answers, if I joined. */
  myWaitlistEntry(): Promise<WaitlistEntry | null>;
  /** Join the waitlist, or update my answers. */
  joinOwnerWaitlist(input: WaitlistInput): Promise<void>;
  leaveOwnerWaitlist(): Promise<void>;

  // Safety: ID verification, damage claims, incidents
  submitVerification(input: {
    icUri: string;
    licenceUri: string;
    selfieUri: string;
    licenceClass: string;
    licenceExpiry: string; // YYYY-MM-DD
    phone: string; // normalised, e.g. 60123456789
    fullName: string; // as on the IC
  }): Promise<void>;
  /** Stores a private evidence photo for a booking and returns its storage path. */
  uploadEvidence(bookingId: string, uri: string): Promise<string>;
  createClaim(bookingId: string, description: string, amount: number, evidencePaths: string[]): Promise<void>;
  claimsFor(bookingId: string): Promise<Claim[]>;
  respondToClaim(claimId: string, accept: boolean): Promise<void>;
  reportIncident(bookingId: string, kind: IncidentKind, note: string, coords: { lat: number; lng: number } | null, photoPaths: string[]): Promise<void>;
  incidentsFor(bookingId: string): Promise<Incident[]>;

  // Live tracking: the customer's phone reports the car's location during a trip; the owner watches it.
  /** Returns how many fixes were stored: 0 once the trip is no longer active (the phone should stop). */
  reportTripLocation(bookingId: string, fixes: LocationFix[]): Promise<number>;
  /** Latest fix for each of these bookings (My cars: one pin per car on a trip). */
  latestTripLocations(bookingIds: string[]): Promise<TripLocation[]>;
  /** The trip's route so far, oldest first. */
  tripRoute(bookingId: string): Promise<TripLocation[]>;

  // Kar admin
  adminPendingVerifications(): Promise<VerificationReview[]>;
  /** Approve (or "Looks good" on an auto-approved ID), or reject: unstarted bookings are cancelled and refunded. */
  adminReviewVerification(id: string, approve: boolean, note: string): Promise<void>;
  /** IDs the automatic check approved that Kar hasn't looked at yet. */
  adminAutoApprovedVerifications(): Promise<VerificationReview[]>;
  adminDisputedClaims(): Promise<(Claim & { booking: BookingDetail })[]>;
  adminResolveClaim(id: string, approve: boolean, note: string): Promise<void>;
  /** New or edited listings waiting for Kar (rejected ones drop out until the owner edits them). */
  adminPendingCars(): Promise<CarWithOwner[]>;
  /** Approve (or "Looks good" on an auto-approved car), or reject / take down. */
  adminApproveCar(carId: string, approve: boolean): Promise<void>;
  /** Cars the automatic check put live that Kar hasn't looked at yet. */
  adminAutoApprovedCars(): Promise<CarWithOwner[]>;
  adminPendingRefunds(): Promise<PendingRefund[]>;
  /** Send all pending refunds through the payment gateway now. */
  processRefunds(): Promise<{ refunded: number; failed: number }>;
  /** Record that the refund was sent by bank transfer (fallback when the gateway can't refund). */
  adminMarkRefundPaid(refundId: string, bankRef: string): Promise<void>;
  adminPayoutsDue(): Promise<PayoutDue[]>;
  /** Record a bank transfer to an owner covering these bookings. */
  adminRecordPayout(bookingIds: string[], bankRef: string): Promise<void>;
  adminOwners(): Promise<OwnerSummary[]>;
  /** Clears an owner's cancellation strikes so they can relist their cars. */
  adminResetStrikes(ownerId: string): Promise<void>;
  adminPendingOperators(): Promise<OperatorReview[]>;
  adminReviewOperator(id: string, approve: boolean, note: string): Promise<void>;
  /** Students waiting to list their own car, oldest first. */
  adminOwnerWaitlist(): Promise<WaitlistReview[]>;
  /** Opens Kar in a new area (campus or city): the map centre comes from the pin. */
  adminAddZone(id: string, name: string, lat: number, lng: number): Promise<void>;
  /** Make a vetted operator an owner (or remove them) by their Kar login email. Returns their name. */
  adminSetOwner(email: string, make: boolean): Promise<string>;
}

/** States in which a booking still holds its time slot. */
export const LIVE_STATUSES = ['pending_payment', 'requested', 'confirmed', 'active'] as const;

export function overlaps(a: BusyRange, start: Date, end: Date) {
  return new Date(a.starts_at) < end && new Date(a.ends_at) > start;
}
