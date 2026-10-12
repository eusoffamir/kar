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
  supportWhatsApp: '60123456789', // replace with Kar's WhatsApp Business number
};

const HOUR = 3_600_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** What the customer gets back if they cancel now. */
export function cancellationPreview(b: Pick<Booking, 'status' | 'starts_at' | 'total_charged' | 'trip_amount'>, now = Date.now()) {
  if (b.status === 'pending_payment') return { fee: 0, refund: 0, free: true };
  const insideWindow = b.status === 'confirmed' && new Date(b.starts_at).getTime() - now < POLICY.lateCancelWindowHours * HOUR;
  const fee = insideWindow ? round2(b.trip_amount * POLICY.lateCancelRate) : 0;
  return { fee, refund: round2(b.total_charged - fee), free: fee === 0 };
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
  'Late returns are charged per hour after 15 minutes.',
  'Free cancellation until 24h before pickup, 50% after.',
  'Pay the deposit to the owner at pickup.',
];
