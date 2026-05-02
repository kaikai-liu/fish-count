// src/lib/auth/admin.ts — Single-password admin gate (Phase 8 D-04, ALI-03).
// CLAUDE.md: keep small, predictable, plain-language behavior.
//
// Sources:
//   .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-04
//   .planning/phases/08-home-retire-polish/08-RESEARCH.md §Pattern 5 (Admin Auth)
//   .planning/phases/08-home-retire-polish/08-PATTERNS.md §"src/lib/auth/admin.ts"
//
// Trust model (single operator, low-traffic site):
//   - Operator sets ADMIN_PASSWORD + ADMIN_COOKIE_SECRET in .env (not committed).
//   - Login posts password → checkPassword() (constant-time compare) → 401 if wrong.
//   - On success, server sets fc_admin cookie = signAdminCookie() (HMAC-SHA256
//     over ADMIN_COOKIE_SECRET). Cookie payload: { admin: true, iat: Date.now() }.
//   - Every admin request runs verifyAdminCookie() before serving:
//     verifies signature (timing-safe) and 24-hour TTL on iat.
//   - SQL-injection mitigation lives downstream (parameterized DAL writes).
import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getSecret(): string | undefined {
  return process.env.ADMIN_COOKIE_SECRET;
}

function getPassword(): string | undefined {
  return process.env.ADMIN_PASSWORD;
}

/**
 * Returns true iff `input` exactly equals process.env.ADMIN_PASSWORD.
 * Length-mismatch fast-fail (timingSafeEqual requires equal-length buffers
 * and would throw otherwise — the check also avoids leaking length via the
 * crypto comparison call). Returns false when ADMIN_PASSWORD is unset so a
 * misconfigured server cannot accidentally authorize.
 */
export function checkPassword(input: string): boolean {
  const expected = getPassword();
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Produces a signed cookie of form `<base64url(payload)>.<base64url(hmacSha256(payload))>`.
 * Throws when ADMIN_COOKIE_SECRET is unset — the admin login route should
 * surface a 503-ish "service misconfigured" rather than silently issue an
 * unverifiable cookie.
 */
export function signAdminCookie(): string {
  const secret = getSecret();
  if (!secret) throw new Error('ADMIN_COOKIE_SECRET unset');
  const payload = JSON.stringify({ admin: true, iat: Date.now() });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payloadB64}.${sig}`;
}

/**
 * Returns true iff:
 *   - the cookie parses as `<base64url>.<base64url>`,
 *   - HMAC of the decoded payload matches the signature (timing-safe), and
 *   - the payload's iat is within the last 24 hours.
 * Returns false on any malformed input, missing secret, or expired payload.
 * Never throws on bad input.
 */
export function verifyAdminCookie(cookie: string | undefined): boolean {
  if (!cookie) return false;
  const secret = getSecret();
  if (!secret) return false;

  const parts = cookie.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return false;

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return false;
  }

  const expectedSig = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;

  let iat: unknown;
  try {
    iat = JSON.parse(payload).iat;
  } catch {
    return false;
  }
  if (typeof iat !== 'number' || !Number.isFinite(iat)) return false;
  return Date.now() - iat < TTL_MS;
}
