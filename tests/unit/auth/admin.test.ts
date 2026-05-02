// tests/unit/auth/admin.test.ts
// Phase 8 D-04 — admin password gate + signed cookie unit tests.
// Sources:
//   .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-04
//   .planning/phases/08-home-retire-polish/08-RESEARCH.md §Pattern 5 (Admin Auth)
//   .planning/phases/08-home-retire-polish/08-PATTERNS.md §"src/lib/auth/admin.ts"
//
// Behaviors covered:
//   A1: checkPassword('correct') === true; checkPassword('wrong') === false.
//   A2: checkPassword('correctXX') === false (length-mismatch fast-fail; guards against length leak).
//   A3: signAdminCookie() returns "<base64url>.<base64url>"; verifyAdminCookie of it returns true.
//   A4: verifyAdminCookie rejects undefined / malformed / signature-tampered cookies.
//   A5: verifyAdminCookie rejects payloads whose iat is older than 24h.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// IMPORTANT: env vars must be set before the module is imported, since the
// module reads process.env at import time. We use vi.resetModules + dynamic
// import so each test block has a fresh module under controlled env.

async function loadAdminModule() {
  vi.resetModules();
  return await import('../../../src/lib/auth/admin');
}

describe('admin auth — A1: checkPassword timing-safe equality', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = 'correct';
    process.env.ADMIN_COOKIE_SECRET = '0'.repeat(64);
  });

  it('returns true for the correct password', async () => {
    const { checkPassword } = await loadAdminModule();
    expect(checkPassword('correct')).toBe(true);
  });

  it('returns false for a wrong same-length password', async () => {
    const { checkPassword } = await loadAdminModule();
    expect(checkPassword('wronGGG')).toBe(false);
  });
});

describe('admin auth — A2: length-mismatch fast-fail', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = 'correct';
    process.env.ADMIN_COOKIE_SECRET = '0'.repeat(64);
  });

  it('returns false for a different-length password (no length leak via timingSafeEqual)', async () => {
    const { checkPassword } = await loadAdminModule();
    expect(checkPassword('correctXX')).toBe(false);
    expect(checkPassword('cor')).toBe(false);
    expect(checkPassword('')).toBe(false);
  });
});

describe('admin auth — A3: sign/verify cookie roundtrip', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = 'correct';
    process.env.ADMIN_COOKIE_SECRET = '0'.repeat(64);
  });

  it('signAdminCookie returns "<base64url>.<base64url>" parseable to a payload+sig pair', async () => {
    const { signAdminCookie } = await loadAdminModule();
    const cookie = signAdminCookie();
    expect(typeof cookie).toBe('string');
    const parts = cookie.split('.');
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
    // base64url charset: A-Z a-z 0-9 _ -
    expect(parts[0]).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parts[1]).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('verifyAdminCookie returns true for a freshly-signed cookie', async () => {
    const { signAdminCookie, verifyAdminCookie } = await loadAdminModule();
    const cookie = signAdminCookie();
    expect(verifyAdminCookie(cookie)).toBe(true);
  });
});

describe('admin auth — A4: rejects malformed / tampered / missing cookies', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = 'correct';
    process.env.ADMIN_COOKIE_SECRET = '0'.repeat(64);
  });

  it('returns false for undefined', async () => {
    const { verifyAdminCookie } = await loadAdminModule();
    expect(verifyAdminCookie(undefined)).toBe(false);
  });

  it('returns false for a malformed (no dot) cookie', async () => {
    const { verifyAdminCookie } = await loadAdminModule();
    expect(verifyAdminCookie('not-a-cookie')).toBe(false);
  });

  it('returns false when the signature is tampered with', async () => {
    const { signAdminCookie, verifyAdminCookie } = await loadAdminModule();
    const cookie = signAdminCookie();
    const [payload, sig] = cookie.split('.');
    // Flip the last char of the signature deterministically.
    const lastCh = sig[sig.length - 1];
    const flipped = lastCh === 'A' ? 'B' : 'A';
    const tampered = `${payload}.${sig.slice(0, -1)}${flipped}`;
    expect(verifyAdminCookie(tampered)).toBe(false);
  });

  it('returns false when the payload is tampered with (signature no longer matches)', async () => {
    const { signAdminCookie, verifyAdminCookie } = await loadAdminModule();
    const cookie = signAdminCookie();
    const [, sig] = cookie.split('.');
    // Replace payload with a different valid base64url string of the same shape.
    const fakePayload = Buffer.from(JSON.stringify({ admin: true, iat: Date.now() + 1 })).toString('base64url');
    const tampered = `${fakePayload}.${sig}`;
    expect(verifyAdminCookie(tampered)).toBe(false);
  });
});

describe('admin auth — A5: 24h TTL enforced on iat', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = 'correct';
    process.env.ADMIN_COOKIE_SECRET = '0'.repeat(64);
  });

  it('rejects a cookie whose iat is more than 24 hours old', async () => {
    const { verifyAdminCookie } = await loadAdminModule();
    // Hand-craft an old payload + matching signature using the same secret.
    const { createHmac } = await import('node:crypto');
    const oldIat = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    const payload = JSON.stringify({ admin: true, iat: oldIat });
    const payloadB64 = Buffer.from(payload).toString('base64url');
    const sig = createHmac('sha256', '0'.repeat(64)).update(payload).digest('base64url');
    const expired = `${payloadB64}.${sig}`;
    expect(verifyAdminCookie(expired)).toBe(false);
  });

  it('accepts a cookie whose iat is within the last 24 hours', async () => {
    const { verifyAdminCookie } = await loadAdminModule();
    const { createHmac } = await import('node:crypto');
    const recentIat = Date.now() - 1000; // 1 second ago
    const payload = JSON.stringify({ admin: true, iat: recentIat });
    const payloadB64 = Buffer.from(payload).toString('base64url');
    const sig = createHmac('sha256', '0'.repeat(64)).update(payload).digest('base64url');
    const fresh = `${payloadB64}.${sig}`;
    expect(verifyAdminCookie(fresh)).toBe(true);
  });
});
