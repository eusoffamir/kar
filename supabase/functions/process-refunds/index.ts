// Sends every pending refund back through CHIP. Safe to call any time and from anywhere: it only acts on
// refund rows the database created (decline, cancellation, no-show, expiry, rejected ID), and each row is
// claimed (pending → processing) before CHIP is called, so a refund is never sent twice.
// The app calls it after cancelling/declining; the admin screen has a "Send refunds now" button.
// Deploy with: npx supabase functions deploy process-refunds
import { createClient } from 'npm:@supabase/supabase-js@2';

import { refundPurchase } from '../_shared/chip.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth.user) return json({ error: 'Not signed in' }, 401);

  const { data: due, error } = await admin
    .from('payments')
    .select('id, booking_id, amount, raw')
    .eq('type', 'refund')
    .eq('status', 'pending')
    .eq('gateway', 'chip')
    .order('created_at')
    .limit(20);
  if (error) return json({ error: error.message }, 500);

  let refunded = 0;
  let failed = 0;
  for (const r of due ?? []) {
    // Claim it; if another run got here first, skip.
    const { data: claimed } = await admin
      .from('payments')
      .update({ status: 'processing' })
      .eq('id', r.id)
      .eq('status', 'pending')
      .select('id');
    if (!claimed?.length) continue;

    const { data: charge } = await admin
      .from('payments')
      .select('gateway_ref')
      .eq('booking_id', r.booking_id)
      .eq('type', 'charge')
      .eq('status', 'paid')
      .eq('gateway', 'chip')
      .limit(1)
      .maybeSingle();

    try {
      if (!charge?.gateway_ref) throw new Error('No paid CHIP charge for this booking: refund it manually');
      const result = await refundPurchase(charge.gateway_ref, Number(r.amount));
      // A slow refund comes back as pending_refund; CHIP completes it on its own.
      await admin
        .from('payments')
        .update({ status: 'paid', raw: { ...(r.raw ?? {}), chip_refund: result, refunded_at: new Date().toISOString() } })
        .eq('id', r.id);
      refunded++;
    } catch (e) {
      console.error('refund failed', r.id, e);
      await admin
        .from('payments')
        .update({ status: 'pending', raw: { ...(r.raw ?? {}), last_error: String(e).slice(0, 500) } })
        .eq('id', r.id);
      failed++;
    }
  }
  return json({ refunded, failed });
});
