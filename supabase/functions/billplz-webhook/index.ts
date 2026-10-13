// Billplz server-to-server callback. Confirms the booking once payment is verified.
// Deploy with: npx supabase functions deploy billplz-webhook --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';

import { verifySignature } from '../_shared/billplz.ts';

// Any non-2xx response makes Billplz retry the callback later.
const retry = (msg: string, err: unknown) => {
  console.error(msg, err);
  return new Response(msg, { status: 500 });
};

Deno.serve(async (req) => {
  const form = await req.formData();
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  if (!(await verifySignature(params))) return new Response('bad signature', { status: 401 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: payment, error } = await admin
    .from('payments')
    .select('id, status, booking_id, user_id, amount')
    .eq('gateway', 'billplz')
    .eq('gateway_ref', params.id)
    .maybeSingle();
  if (error) return retry('payment lookup failed', error);
  if (!payment) return new Response('unknown bill', { status: 404 });
  if (payment.status === 'failed') return new Response('ok');
  // 'paid' = a retry after a partial failure: skip straight to confirming the booking (idempotent).
  if (payment.status === 'paid') return settleBooking(admin, payment, params);

  const wrongBill =
    params.collection_id !== Deno.env.get('BILLPLZ_COLLECTION_ID') ||
    Number(params.paid_amount) !== Math.round(Number(payment.amount) * 100);
  if (params.paid !== 'true' || wrongBill) {
    if (params.paid === 'true') console.error('paid bill does not match payment', payment.id, params);
    const { error: e } = await admin.from('payments').update({ status: 'failed', raw: params }).eq('id', payment.id);
    return e ? retry('mark failed', e) : new Response('ok');
  }

  // Only one concurrent callback wins the pending → paid update; the others stop here.
  const { data: won, error: paidErr } = await admin
    .from('payments')
    .update({ status: 'paid', raw: params })
    .eq('id', payment.id)
    .eq('status', 'pending')
    .select('id');
  if (paidErr) return retry('mark paid', paidErr);
  if (!won?.length) return new Response('ok');
  return settleBooking(admin, payment, params);
});

type Payment = { id: string; booking_id: string; user_id: string | null };

async function settleBooking(admin: ReturnType<typeof createClient>, payment: Payment, params: Record<string, string>) {
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
    // Expired between the read and the update: retry, and the next callback queues the refund.
    if (!moved?.length) return retry('booking changed while confirming', b.id);
    // Next step: push-notify the owner using push_tokens (Expo push API).
  } else if (b.cancel_reason === 'payment_timeout') {
    // Paid after the unpaid slot expired: queue a refund for Kar admin to process.
    // Any other status means an earlier callback already settled this bill.
    // The gateway_ref makes a duplicate refund for the same bill impossible (unique index).
    const { error: e } = await admin.from('payments').insert({
      booking_id: payment.booking_id,
      user_id: payment.user_id,
      type: 'refund',
      amount: Number(params.paid_amount) / 100,
      gateway: 'billplz',
      gateway_ref: `refund:${params.id}`,
      status: 'pending',
      raw: { reason: 'paid_after_expiry', bill: params.id },
    });
    if (e && e.code !== '23505') return retry('queue refund', e); // 23505: refund already queued
  }
  return new Response('ok');
}
