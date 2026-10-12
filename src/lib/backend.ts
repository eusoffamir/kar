import type {
  Booking,
  BookingDetail,
  Car,
  CarWithOwner,
  PhotoPhase,
  PhotoSlot,
  Profile,
  Zone,
} from './types';

export type BusyRange = { starts_at: string; ends_at: string };

export type NewCar = Omit<Car, 'id' | 'owner_id' | 'is_listed' | 'is_approved'>;

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
  signOut(): Promise<void>;
  /** Demo mode only: switch between seeded owner/customer accounts. */
  demoAccounts?(): Promise<Profile[]>;
  demoSignInAs?(userId: string): Promise<void>;
  becomeOwner(): Promise<void>;

  // Customer
  zones(): Promise<Zone[]>;
  listCars(zoneId: string): Promise<CarWithOwner[]>;
  getCar(id: string): Promise<CarWithOwner & { busy: BusyRange[] }>;
  createBooking(carId: string, start: Date, end: Date): Promise<Booking>;
  /** Returns a payment URL to open, or null when the payment completed in-app (demo). */
  startPayment(bookingId: string): Promise<{ url: string | null }>;
  myTrips(): Promise<BookingDetail[]>;
  getBooking(id: string): Promise<BookingDetail>;
  cancelBooking(id: string): Promise<void>;
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
}

/** States in which a booking still holds its time slot. */
export const LIVE_STATUSES = ['pending_payment', 'requested', 'confirmed', 'active'] as const;

export function overlaps(a: BusyRange, start: Date, end: Date) {
  return new Date(a.starts_at) < end && new Date(a.ends_at) > start;
}
