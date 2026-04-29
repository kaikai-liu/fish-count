// src/routes/alerts/pending/+page.server.ts
// Phase 4 ALT-02: generic-success page after signup. Receives the masked
// email via ?m= querystring (already masked server-side).
//
// Anti-enumeration (T-04-A1): the masked email shape is identical regardless
// of which silent-success branch the route action took (honeypot / suppression
// / already-pending / happy path). Bots cannot distinguish.
//
// T-04-A4: Referrer-Policy: same-origin keeps any inbound token (rare here,
// but possible if /alerts/pending is reached via an unsubscribe-success
// redirect that carried a manage token in the prior URL) from leaking
// downstream. Cache-Control: no-store keeps the masked email out of any
// shared HTTP cache.
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
  setHeaders({
    'cache-control': 'no-store',
    'referrer-policy': 'same-origin'
  });
  const m = url.searchParams.get('m') ?? '';
  // m is already masked (k***@g***.com); guard against malformed input so a
  // crafted ?m= cannot smuggle markup or a real email into the page.
  const looksMasked = /^[^@]+\*\*\*@[^@]+\*\*\*\.[a-zA-Z]{2,}$/.test(m);
  return { maskedEmail: looksMasked ? m : '' };
};
