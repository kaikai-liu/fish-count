// src/lib/alerts/tokens.ts
// Phase 4 ALT-02 + ALT-05: HMAC-SHA256 signed tokens for confirm / manage / unsubscribe.
//
// Three purposes ('confirm' | 'manage' | 'unsubscribe') with different expiries
// share one signer/verifier — `purpose` is part of the signed payload so a
// confirm token cannot be replayed as an unsubscribe token (T-04-A3 mitigation).
//
// Server-only: PROJECT_SECRET must never reach the client. The $env/dynamic/private
// import enforces this at SvelteKit's bundler boundary.
//
// Format: base64url(JSON({p, s, e, n})).base64url(hmac)
//   p — purpose
//   s — subject id (subscriber id)
//   e — expires-at unix seconds, or null for never-expiring (unsubscribe)
//   n — random nonce so identical inputs produce distinct tokens
//
// Constant-time signature compare via node:crypto.timingSafeEqual (T-04-A3 timing-side-channel defense).
//
// Source: 04-RESEARCH.md §"Pattern 2"; 04-PATTERNS.md §B.1.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

export type Purpose = 'confirm' | 'manage' | 'unsubscribe';
interface Payload { p: Purpose; s: number; e: number | null; n: string; }

const MIN_SECRET_LEN = 32;

function getSecret(): string {
  const s = env.PROJECT_SECRET;
  if (!s || s.length < MIN_SECRET_LEN) {
    throw new Error(`PROJECT_SECRET missing or too short (>=${MIN_SECRET_LEN} chars required)`);
  }
  return s;
}

function b64uEnc(b: Buffer): string { return b.toString('base64url'); }
function b64uDec(s: string): Buffer { return Buffer.from(s, 'base64url'); }

export function signToken(purpose: Purpose, subjectId: number, ttlSec: number | null): string {
  const payload: Payload = {
    p: purpose,
    s: subjectId,
    e: ttlSec === null ? null : Math.floor(Date.now() / 1000) + ttlSec,
    n: randomBytes(8).toString('hex')
  };
  const body = b64uEnc(Buffer.from(JSON.stringify(payload)));
  const sig = b64uEnc(createHmac('sha256', getSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export type VerifyResult =
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'wrong_purpose' | 'expired' }
  | { ok: true; subjectId: number };

export function verifyToken(purpose: Purpose, token: string): VerifyResult {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: 'malformed' };
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expectedSig = b64uEnc(createHmac('sha256', getSecret()).update(body).digest());

  // Constant-time compare. Lengths must match before timingSafeEqual; comparing
  // mismatched-length buffers throws, which itself leaks length info, so guard
  // explicitly and treat mismatch as bad_signature.
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length) return { ok: false, reason: 'bad_signature' };
  if (!timingSafeEqual(sigBuf, expBuf)) return { ok: false, reason: 'bad_signature' };

  let payload: Payload;
  try {
    payload = JSON.parse(b64uDec(body).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.p !== purpose) return { ok: false, reason: 'wrong_purpose' };
  if (payload.e !== null && payload.e < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, subjectId: payload.s };
}
