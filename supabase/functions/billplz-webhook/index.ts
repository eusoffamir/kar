// Billplz server-to-server callback. Confirms the booking once payment is verified.
// Deploy with: npx supabase functions deploy billplz-webhook --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';

import { verifySignature } from '../_shared/billplz.ts';

Deno.serve(async (req) => {
  const form = await req.formData();
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  if (!(await verifySignature(params))) return new Response('bad signature', { status: 401 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: payment } = await admin
    .from('payments')
    .select('id, status, booking_id')
    .eq('gateway', 'billplz')
    .eq('gateway_ref', params.id)
    .single();
  if (!payment) return new Response('unknown bill', { status: 404 });
  if (payment.status === 'paid') return new Response('ok'); // idempotent: Billplz retries callbacks

  if (params.paid !== 'true') {
    await admin.from('payments').update({ status: 'failed', raw: params }).eq('id', payment.id);
    return new Response('ok');
  }

  await admin.from('payments').update({ status: 'paid', raw: params }).eq('id', payment.id);

  const { data: b } = await admin
    .from('bookings')
    .select('id, status, car:cars(instant_book)')
    .eq('id', payment.booking_id)
    .single();

  if (b?.status === 'pending_payment') {
    const next = (b.car as unknown as { instant_book: boolean }).instant_book ? 'confirmed' : 'requested';
    await admin.from('bookings').update({ status: next }).eq('id', b.id).eq('status', 'pending_payment');
    // Next step: push-notify the owner using push_tokens (Expo push API).
  } else {
    // Paid after the slot expired or was cancelled: queue a refund for Kar admin to process.
    await admin.from('payments').insert({
      booking_id: payment.booking_id,
      type: 'refund',
      amount: Number(params.paid_amount) / 100,
      gateway: 'billplz',
      status: 'pending',
      raw: { reason: 'paid_after_expiry', bill: params.id },
    });
  }
  return new Response('ok');
});
