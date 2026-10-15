// Kar policies as pure functions. Mirrors supabase/migrations/20261014000000_p0_safety.sql
// (the database is the source of truth; the app uses these for previews and the demo backend).
import type { Booking } from './types';

export const POLICY = {
  claimWindowHours: 48,
  lateGraceMinutes: 15,
  noShowAfterMinutes: 60,
  lateCancelWindowHours: 24,
  lateCancelRate: 0.5,
  ownerStrikeLimit: 3,
  claimHandlingFee: 30,
  /** Kar's WhatsApp Business number, e.g. 60123456789. Empty hides the WhatsApp buttons. */
  supportWhatsApp: process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? '',
};

/** A submitted ID is enough to book; Kar must approve it before pickup. */
export const canBook = (verification: string | undefined) => verification === 'verified' || verification === 'pending';

/** Malaysian mobile number as 60XXXXXXXXX, or null if it isn't one. Mirrors submit_verification. */
export function normalizeMyPhone(input: string) {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `6${digits}`;
  return /^601\d{8,9}$/.test(digits) ? digits : null;
}

const HOUR = 3_600_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What the customer gets back if they cancel now: the trip price, minus 50% inside 24h of pickup (kept by the
 * owner). Kar's booking fee is not refunded when the customer cancels (mirrors cancel_booking()).
 */
export function cancellationPreview(
  b: Pick<Booking, 'status' | 'starts_at' | 'total_charged' | 'trip_amount' | 'customer_fee' | 'deposit' | 'deposit_status'>,
  now = Date.now(),
) {
  if (b.status === 'pending_payment') return { fee: 0, refund: 0, free: true, bookingFee: 0 };
  const insideWindow = b.status === 'confirmed' && new Date(b.starts_at).getTime() - now < POLICY.lateCancelWindowHours * HOUR;
  const fee = insideWindow ? round2(b.trip_amount * POLICY.lateCancelRate) : 0;
  // A deposit Kar holds always comes back in full when the trip doesn't happen.
  const deposit = b.deposit_status === 'held' ? b.deposit : 0;
  return { fee, refund: round2(b.trip_amount - fee + deposit), free: fee === 0, bookingFee: b.customer_fee };
}

export function lateFee(endsAt: string, returnedAt: number, feePerHour: number) {
  const over = returnedAt - new Date(endsAt).getTime() - POLICY.lateGraceMinutes * 60_000;
  return over > 0 ? Math.ceil(over / HOUR) * feePerHour : 0;
}

export function claimWindowOpen(returnedAt: string | null, now = Date.now()) {
  return !!returnedAt && now <= new Date(returnedAt).getTime() + POLICY.claimWindowHours * HOUR;
}

export function canMarkNoShow(b: Pick<Booking, 'status' | 'starts_at'>, now = Date.now()) {
  return b.status === 'confirmed' && now >= new Date(b.starts_at).getTime() + POLICY.noShowAfterMinutes * 60_000;
}

export const HOUSE_RULES = [
  'Only you drive. Full licence, 21 or older.',
  'No smoking, no ride-hailing, no racing.',
  'Peninsular Malaysia only. No crossing into Thailand.',
  'Return with the same fuel level.',
  "Your phone shares the car's location with the owner during the trip. Keep location on until you return it.",
  'Late returns are charged per hour after 15 minutes.',
  'Cancel up to 24h before pickup for a full refund of the trip price (the booking fee is not refunded). Inside 24h the owner keeps 50%.',
  'The deposit is paid with the booking and refunded automatically 48 hours after you return the car, minus any late fee or approved damage.',
];
