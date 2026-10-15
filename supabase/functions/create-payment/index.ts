// POST { booking_id } with the user's JWT → { url } of a CHIP checkout page for the booking total.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { createPurchase } from '../_shared/chip.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: auth } = await admin.auth.getUser(jwt);
    if (!auth.user) return json({ error: 'Not signed in' }, 401);

    const { booking_id } = await req.json();
    const { data: b } = await admin
      .from('bookings')
      .select('*, car:cars(make, model, plate), customer:profiles!bookings_customer_id_fkey(full_name)')
      .eq('id', booking_id)
      .single();
    if (!b || b.customer_id !== auth.user.id) return json({ error: 'Booking not found' }, 404);
    if (b.status !== 'pending_payment' || new Date(b.expires_at) < new Date()) {
      return json({ error: 'This booking can no longer be paid. Please book again.' }, 409);
    }

    // Reuse the open checkout if the customer taps "Pay" twice.
    const { data: existing } = await admin
      .from('payments')
      .select('raw')
      .eq('booking_id', b.id)
      .eq('type', 'charge')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);
    if (existing?.[0]?.raw?.url) return json({ url: existing[0].raw.url });

    // CHIP sends the customer back to this http(s) page after paying.
    const appUrl = Deno.env.get('APP_URL');
    if (!appUrl?.startsWith('http')) throw new Error('APP_URL secret is missing or not an https URL');

    const fnBase = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;
    const purchase = await createPurchase({
      email: auth.user.email ?? 'karsewa.my@gmail.com',
      fullName: b.customer?.full_name ?? '',
      amountRm: Number(b.total_charged),
      productName: `Kar: ${b.car.make} ${b.car.model} (${b.car.plate})${Number(b.deposit) > 0 ? `, incl. RM${Number(b.deposit).toFixed(2)} refundable deposit` : ''}`,
      reference: b.id,
      dueAt: Math.floor(new Date(b.expires_at).getTime() / 1000),
      returnUrl: `${appUrl.replace(/\/?$/, '/')}trip/${b.id}`,
      callbackUrl: `${fnBase}/chip-callback`,
    });

    // Without this row the callback can't match the purchase, so a failed insert must stop the payment.
    const { error: insertErr } = await admin.from('payments').insert({
      booking_id: b.id,
      user_id: auth.user.id,
      type: 'charge',
      amount: b.total_charged,
      gateway: 'chip',
      gateway_ref: purchase.id,
      raw: { url: purchase.checkout_url, status: purchase.status },
    });
    if (insertErr) throw insertErr;
    return json({ url: purchase.checkout_url });
  } catch (e) {
    console.error(e);
    return json({ error: 'Could not start payment' }, 500);
  }
});
