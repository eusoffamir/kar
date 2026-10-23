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

// Shown before payment (the renter must open them and tap "I agree"). Keep in line with the Terms in legal.ts.
// Order: what protects Kar first, then the owner and the car, then the customer.
export const HOUSE_RULES = [
  // 1. Protects Kar: Kar is only the platform; the renter carries the costs of the trip.
  'Kar is the booking platform only. The rental is between you and the owner, and as far as the law allows, Kar is not liable for accidents, breakdowns, loss or damage during your trip.',
  'You are responsible for any damage to or loss of the car during your trip, including from an accident, theft, misuse or lost keys. Small damage comes out of your deposit. Anything above the deposit is between you, the owner and the insurer.',
  'You pay any traffic summonses, tolls, parking, towing or clamping from your trip.',
  'If you break these rules, the owner’s insurance may not pay for an accident or loss, and you pay the full cost.',
  'Things you leave in the car are your responsibility, not the owner’s or Kar’s.',
  // 2. Protects the owner and the car: how the car may be used and what to do if something happens.
  'Only you drive, with a full licence. No other drivers.',
  'No driving after alcohol or drugs. No racing, reckless driving, towing or off-road driving.',
  'No illegal use: do not carry illegal goods or use the car for any crime.',
  'No more people than there are seats. No driving lessons or learner drivers.',
  'Keep the car locked and the keys with you. Never leave the keys in the car or give them to anyone else.',
  'If you have an accident or the car is stolen: stop safely, report it to the police within 24 hours (the law requires this), and tell the owner straight away through Get help.',
  'If a warning light comes on or the car breaks down, stop when safe and tell the owner through Get help. Do not repair or modify the car without the owner’s OK.',
  'No ride-hailing, deliveries or carrying passengers for money.',
  'Peninsular Malaysia only. Do not take the car into Thailand or Singapore.',
  'Return the car on time, at the agreed place, with the same fuel level. Late returns are charged per hour after 15 minutes.',
  'No smoking, vaping or pets in the car, and nothing that leaves a strong smell. Return it reasonably clean.',
  'If you have not picked up the car 60 minutes after the start time, the owner can mark a no-show: they keep 50% of the trip price, and you get the rest and your deposit back (the booking fee is not refunded).',
  "Your phone shares the car's location with the owner during the trip. Keep location on until you return it.",
  // 3. Protects the customer: their evidence, deposit and cancellation rights.
  'Take the photos in the app at pickup and return. They are the evidence if there is a dispute.',
  'The deposit is paid with the booking and refunded automatically 48 hours after you return the car, minus any late fee or approved damage.',
  'Cancel up to 24h before pickup for a full refund of the trip price (the booking fee is not refunded). Inside 24h the owner keeps 50%.',
];
