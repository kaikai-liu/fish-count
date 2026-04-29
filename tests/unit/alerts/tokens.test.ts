// tests/unit/alerts/tokens.test.ts
// Phase 4 Plan 02 Wave-0 anchor: HMAC-SHA256 token sign/verify across the three
// purposes. Threat coverage: T-04-A3 (replay/forgery via wrong-purpose + tampered
// signature) and T-04-A12 (PROJECT_SECRET fail-closed).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signToken, verifyToken } from '../../../src/lib/alerts/tokens';

const TEST_SECRET = 'test-secret-must-be-at-least-32-chars-long';

describe('tokens', () => {
  beforeEach(() => {
    process.env.PROJECT_SECRET = TEST_SECRET;
  });
  afterEach(() => {
    delete process.env.PROJECT_SECRET;
    vi.useRealTimers();
  });

  it('signs and verifies a confirm token', () => {
    const t = signToken('confirm', 42, 86400);
    const r = verifyToken('confirm', t);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.subjectId).toBe(42);
  });

  it('rejects wrong-purpose replay (T-04-A3)', () => {
    const t = signToken('confirm', 42, 86400);
    const r = verifyToken('manage', t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('wrong_purpose');
  });

  it('rejects tampered signature with bad_signature reason', () => {
    const t = signToken('confirm', 42, 86400);
    const tampered = t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A');
    const r = verifyToken('confirm', tampered);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_signature');
  });

  it('rejects expired tokens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const t = signToken('confirm', 42, 60); // 60s ttl
    vi.setSystemTime(new Date('2026-01-01T00:02:00Z')); // +2 min
    const r = verifyToken('confirm', t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('expired');
  });

  it('accepts never-expiring tokens (unsubscribe)', () => {
    const t = signToken('unsubscribe', 99, null);
    const r = verifyToken('unsubscribe', t);
    expect(r.ok).toBe(true);
  });

  it('rejects malformed tokens', () => {
    expect(verifyToken('confirm', '').ok).toBe(false);
    expect(verifyToken('confirm', 'no-dot').ok).toBe(false);
    expect(verifyToken('confirm', '.no-body').ok).toBe(false);
    expect(verifyToken('confirm', 'no-sig.').ok).toBe(false);
  });

  it('throws when PROJECT_SECRET is missing or too short', () => {
    delete process.env.PROJECT_SECRET;
    expect(() => signToken('confirm', 1, 60)).toThrow(/PROJECT_SECRET/);
    process.env.PROJECT_SECRET = 'too-short';
    expect(() => signToken('confirm', 1, 60)).toThrow(/PROJECT_SECRET/);
  });

  it('two consecutive signs of same input produce different tokens (nonce randomness)', () => {
    const t1 = signToken('confirm', 42, 86400);
    const t2 = signToken('confirm', 42, 86400);
    expect(t1).not.toBe(t2);
  });
});
