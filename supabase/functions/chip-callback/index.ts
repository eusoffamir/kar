// CHIP success_callback: confirms the booking once payment is verified.
// Deploy with: npx supabase functions deploy chip-callback --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';

import { getPurchase, refundPurchase, toSen, verifySignature } from '../_shared/chip.ts';

// Any non-2xx response makes CHIP retry the callback later.
const retry = (msg: string, err: unknown) => {
  console.error(msg, err);
  return new Response(msg, { status: 500 });
};

Deno.serve(async (req) => {
  // The signature covers the raw bytes, so read them before parsing.
  const raw = new Uint8Array(await req.arrayBuffer());
  if (!(await verifySignature(raw, req.headers.get('X-Signature')))) return new Response('bad signature', { status: 401 });
  const event = JSON.parse(new TextDecoder().decode(raw)) as { id?: string };
  if (!event.id) return new Response('ok');

  // Don't trust the callback body for money: ask CHIP for the purchase itself.
  let purchase;
  try {
    purchase = await getPurchase(event.id);
  } catch (e) {
    return retry('purchase lookup failed', e);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: payment, error } = await admin
    .from('payments')
    .select('id, status, booking_id, user_id, amount')
    .eq('gateway', 'chip')
    .eq('gateway_ref', purchase.id)
    .maybeSingle();
  if (error) return retry('payment lookup failed', error);
  if (!payment) return new Response('unknown purchase', { status: 404 });
  if (payment.status === 'failed') return new Response('ok');
  // 'paid' = a retry after a partial failure: skip straight to confirming the booking (idempotent).
  if (payment.status === 'paid') return settleBooking(admin, payment, purchase.id);

  if (purchase.status !== 'paid') return new Response('ok'); // not paid (yet): nothing to do

  const wrongPurchase =
    purchase.brand_id !== Deno.env.get('CHIP_BRAND_ID') ||
    purchase.purchase.currency !== 'MYR' ||
    purchase.purchase.total !== toSen(Number(payment.amount));
  if (wrongPurchase) {
    console.error('paid purchase does not match payment', payment.id, purchase);
    const { error: e } = await admin.from('payments').update({ status: 'failed', raw: purchase }).eq('id', payment.id);
    return e ? retry('mark failed', e) : new Response('ok');
  }

  // Only one concurrent callback wins the pending → paid update; the others stop here.
  const { data: won, error: paidErr } = await admin
    .from('payments')
    .update({ status: 'paid', raw: purchase })
    .eq('id', payment.id)
    .eq('status', 'pending')
    .select('id');
  if (paidErr) return retry('mark paid', paidErr);
  if (!won?.length) return new Response('ok');
  return settleBooking(admin, payment, purchase.id);
});

type Payment = { id: string; booking_id: string; user_id: string | null; amount: number | string };

async function settleBooking(admin: ReturnType<typeof createClient>, payment: Payment, purchaseId: string) {
  const { data: b, error: bErr } = await admin
    .from('bookings')
    .select('id, status, cancel_reason, car:cars(instant_book)')
    .eq('id', payment.booking_id)
    .single();
  if (bErr) return retry('booking lookup', bErr);

  if (b.status === 'pending_payment') {
    const next = (b.car as unknown as { instant_book: boolean }).instant_book ? 'confirmed' : 'requested';
    const { data: moved, error: e } = await admin
      .from('bookings')
      .update({ status: next })
      .eq('id', b.id)
      .eq('status', 'pending_payment')
      .select('id');
    if (e) return retry('confirm booking', e);
    // Expired between the read and the update: retry, and the next callback refunds it.
    if (!moved?.length) return retry('booking changed while confirming', b.id);
    // Next step: push-notify the owner using push_tokens (Expo push API).
  } else if (b.cancel_reason === 'payment_timeout') {
    // Paid after the unpaid slot expired (rare: the purchase expires with the booking). Refund it right away.
    // The gateway_ref makes a duplicate refund for the same purchase impossible (unique index).
    const ref = `refund:${purchaseId}`;
    const { data: row, error: e } = await admin
      .from('payments')
      .insert({
        booking_id: payment.booking_id,
        user_id: payment.user_id,
        type: 'refund',
        amount: payment.amount,
        gateway: 'chip',
        gateway_ref: ref,
        status: 'processing', // claimed here, so process-refunds won't send it as well
        raw: { reason: 'paid_after_expiry', purchase: purchaseId },
      })
      .select('id')
      .single();
    if (e?.code === '23505') return new Response('ok'); // already queued by an earlier callback
    if (e) return retry('queue refund', e);
    try {
      await refundPurchase(purchaseId, Number(payment.amount));
      await admin.from('payments').update({ status: 'paid' }).eq('id', row.id);
    } catch (err) {
      // Back to pending: process-refunds or the admin screen will retry it.
      console.error('automatic refund failed', err);
      await admin.from('payments').update({ status: 'pending' }).eq('id', row.id);
    }
  }
  // Any other status means an earlier callback already settled this purchase.
  return new Response('ok');
}
