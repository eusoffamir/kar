// Domain types shared by the mock and Supabase backends. Mirrors supabase/migrations.

export type BookingStatus =
  | 'pending_payment'
  | 'requested'
  | 'confirmed'
  | 'active'
  | 'returned'
  | 'closed'
  | 'cancelled'
  | 'declined';

export type PhotoPhase = 'before' | 'after';
export const PHOTO_SLOTS = ['front', 'back', 'left', 'right', 'interior', 'fuel', 'odometer'] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

export type Profile = {
  id: string;
  full_name: string;
  is_owner: boolean;
  is_admin: boolean;
  verification: 'unverified' | 'pending' | 'verified' | 'rejected';
  rating_avg: number | null;
  rating_count: number;
  trips_count: number;
};

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
};

export type LastLocation = { car_id: string; lat: number; lng: number; note: string; updated_at: string };

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
