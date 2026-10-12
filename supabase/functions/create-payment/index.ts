// POST { booking_id } with the user's JWT → { url } of a Billplz bill for the booking total.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { createBill } from '../_shared/billplz.ts';

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

    // Reuse the open bill if the customer taps "Pay" twice.
    const { data: existing } = await admin
      .from('payments')
      .select('raw')
      .eq('booking_id', b.id)
      .eq('type', 'charge')
      .eq('status', 'pending')
      .maybeSingle();
    if (existing?.raw?.url) return json({ url: existing.raw.url });

    const fnBase = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;
    const bill = await createBill({
      email: auth.user.email ?? 'noreply@kar.my',
      name: b.customer?.full_name ?? '',
      amountRm: Number(b.total_charged),
      description: `Kar: ${b.car.make} ${b.car.model} (${b.car.plate}) incl. RM${b.deposit} refundable deposit`,
      reference: b.id,
      callbackUrl: `${fnBase}/billplz-webhook`,
      redirectUrl: `${Deno.env.get('APP_URL') ?? 'kar://'}trip/${b.id}`,
    });

    await admin.from('payments').insert({
      booking_id: b.id,
      user_id: auth.user.id,
      type: 'charge',
      amount: b.total_charged,
      gateway: 'billplz',
      gateway_ref: bill.id,
      raw: bill,
    });
    return json({ url: bill.url });
  } catch (e) {
    console.error(e);
    return json({ error: 'Could not start payment' }, 500);
  }
});
