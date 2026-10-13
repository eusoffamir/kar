// CHIP Collect (Malaysian FPX / DuitNow QR / e-wallet gateway) helpers for Supabase Edge Functions (Deno).
// Docs: https://docs.chip-in.asia/chip-collect/overview
// Test and live mode use the same URL; the secret key decides which one you're in.

const BASE = 'https://gate.chip-in.asia/api/v1';

const headers = () => ({
  Authorization: `Bearer ${Deno.env.get('CHIP_SECRET_KEY')}`,
  'Content-Type': 'application/json',
});

export const toSen = (rm: number) => Math.round(rm * 100);

export type Purchase = {
  id: string;
  status: string; // created | paid | expired | refunded | pending_refund | ...
  brand_id: string;
  checkout_url: string;
  reference: string;
  purchase: { total: number; currency: string };
  refundable_amount?: number;
};

async function chip<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers(), ...init.headers } });
  if (!res.ok) throw new Error(`CHIP ${init.method ?? 'GET'} ${path} failed ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export function createPurchase(input: {
  email: string;
  fullName: string;
  amountRm: number;
  productName: string;
  reference: string;
  /** Unix seconds; the purchase expires after this, so a released booking slot can't be paid. */
  dueAt: number;
  returnUrl: string;
  callbackUrl: string;
}) {
  return chip<Purchase>('/purchases/', {
    method: 'POST',
    body: JSON.stringify({
      brand_id: Deno.env.get('CHIP_BRAND_ID'),
      client: { email: input.email, full_name: input.fullName.slice(0, 255) || 'Kar customer' },
      purchase: {
        currency: 'MYR',
        language: 'en',
        due_strict: true,
        products: [{ name: input.productName.slice(0, 256), price: toSen(input.amountRm), quantity: '1' }],
      },
      due: input.dueAt,
      reference: input.reference,
      send_receipt: true,
      success_redirect: input.returnUrl,
      failure_redirect: input.returnUrl,
      cancel_redirect: input.returnUrl,
      success_callback: input.callbackUrl,
    }),
  });
}

export const getPurchase = (id: string) => chip<Purchase>(`/purchases/${id}/`);

/** Refunds part (or, without amountRm, all) of a paid purchase. */
export const refundPurchase = (id: string, amountRm: number) =>
  chip<{ id: string; status?: string }>(`/purchases/${id}/refund/`, {
    method: 'POST',
    body: JSON.stringify({ amount: toSen(amountRm) }),
  });

// CHIP signs callbacks with RSA PKCS#1 v1.5 over SHA-256 of the raw body; X-Signature is base64.
// GET /public_key/ returns the PEM as a JSON string.
let cachedKey: CryptoKey | null = null;
async function publicKey() {
  if (cachedKey) return cachedKey;
  const pem = await chip<string>('/public_key/');
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  cachedKey = await crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return cachedKey;
}

export async function verifySignature(rawBody: Uint8Array, signatureB64: string | null) {
  if (!signatureB64) return false;
  try {
    const sig = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', await publicKey(), sig, rawBody);
  } catch (e) {
    console.error('signature check failed', e);
    return false;
  }
}
