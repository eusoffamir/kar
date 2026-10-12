// Billplz (Malaysian FPX/DuitNow/e-wallet gateway) helpers for Supabase Edge Functions (Deno).
// Docs: https://www.billplz.com/api

const SANDBOX = Deno.env.get('BILLPLZ_SANDBOX') !== 'false';
const BASE = SANDBOX ? 'https://www.billplz-sandbox.com/api/v3' : 'https://www.billplz.com/api/v3';

export async function createBill(input: {
  email: string;
  name: string;
  amountRm: number;
  description: string;
  reference: string;
  callbackUrl: string;
  redirectUrl: string;
}) {
  const body = new URLSearchParams({
    collection_id: Deno.env.get('BILLPLZ_COLLECTION_ID')!,
    email: input.email,
    name: input.name.slice(0, 255) || 'Kar customer',
    amount: String(Math.round(input.amountRm * 100)), // in sen
    description: input.description.slice(0, 200),
    callback_url: input.callbackUrl,
    redirect_url: input.redirectUrl,
    reference_1_label: 'Booking',
    reference_1: input.reference,
  });
  const res = await fetch(`${BASE}/bills`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${Deno.env.get('BILLPLZ_API_KEY')}:`)}` },
    body,
  });
  if (!res.ok) throw new Error(`Billplz error ${res.status}: ${await res.text()}`);
  return (await res.json()) as { id: string; url: string };
}

/** Verify a Billplz callback's x_signature (HMAC-SHA256 over sorted "keyvalue" pairs joined by "|"). */
export async function verifySignature(params: Record<string, string>) {
  const { x_signature, ...rest } = params;
  if (!x_signature) return false;
  const source = Object.entries(rest)
    .map(([k, v]) => `${k}${v}`)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .join('|');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(Deno.env.get('BILLPLZ_X_SIGNATURE')!),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(source));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === x_signature;
}
