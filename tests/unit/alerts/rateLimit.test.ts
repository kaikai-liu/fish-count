// tests/unit/alerts/rateLimit.test.ts
// Phase 4 Plan 02 Wave-0 anchor: per-IP signup rate limit (ALT-03).
//
// Coverage split (mirrors src/lib/alerts/rateLimit.ts):
//   - PURE `exceeded(count)` tests run unconditionally.
//   - DAL `check`/`record` integration tests are described here and CURRENTLY
//     covered by a vi.mock signupAttempts double, because Plan 04-01
//     (signupAttempts.ts + signup_attempts table) is the wave-1 sibling that
//     ships the real DAL repo. Once Plan 01 lands the integration tests can
//     be migrated to use the real `runMigrations` + better-sqlite3 in-memory
//     driver per the original plan code (see PostMerge note below).
//
// PostMerge note: when Plan 04-01 merges, replace the vi.mock-based DAL block
// with the better-sqlite3 + runMigrations variant from the plan source. The
// MAX_ATTEMPTS=3 + WINDOW_SECONDS=3600 contract stays identical.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock signupAttempts BEFORE importing rateLimit so the static import resolves.
// Use vi.hoisted so the mock factory's vi.fn() instances exist when vi.mock runs
// (vi.mock is hoisted to the top of the file by vitest's transformer).
const { countMock, recordMock } = vi.hoisted(() => ({
  countMock: vi.fn(),
  recordMock: vi.fn()
}));

vi.mock('$lib/db/signupAttempts', () => ({
  countWithinWindow: countMock,
  recordAttempt: recordMock
}));

// eslint-disable-next-line import/first
import * as rateLimit from '../../../src/lib/alerts/rateLimit';

describe('rateLimit', () => {
  beforeEach(() => {
    countMock.mockReset();
    recordMock.mockReset();
  });

  describe('exceeded (pure)', () => {
    it('returns false below MAX_ATTEMPTS', () => {
      expect(rateLimit.exceeded(0)).toBe(false);
      expect(rateLimit.exceeded(2)).toBe(false);
    });
    it('returns true at or above MAX_ATTEMPTS', () => {
      expect(rateLimit.exceeded(3)).toBe(true);
      expect(rateLimit.exceeded(10)).toBe(true);
    });
  });

  describe('check + record (DAL contract via mock — real-DAL path activates post-Plan-01-merge)', () => {
    it('records 3 attempts then blocks the 4th, resets after the window', () => {
      const fakeDb = {} as never;
      const ip = '5.6.7.8';
      const t0 = '2026-04-27T10:00:00.000Z';

      // Simulate 3 attempts at t0.
      for (let i = 0; i < 3; i++) rateLimit.record(fakeDb, ip, t0);
      expect(recordMock).toHaveBeenCalledTimes(3);
      expect(recordMock).toHaveBeenCalledWith(fakeDb, ip, t0);

      // At t0+30min: count=3, exceeded=true.
      countMock.mockReturnValueOnce(3);
      const r1 = rateLimit.check(fakeDb, ip, '2026-04-27T10:30:00.000Z');
      expect(r1.count).toBe(3);
      expect(r1.exceeded).toBe(true);

      // At t0+61min: window has passed, count=0.
      countMock.mockReturnValueOnce(0);
      const r2 = rateLimit.check(fakeDb, ip, '2026-04-27T11:01:00.000Z');
      expect(r2.count).toBe(0);
      expect(r2.exceeded).toBe(false);
    });
    it('does not bleed between IPs (DAL is responsible for the IP filter)', () => {
      const fakeDb = {} as never;
      // The DAL countWithinWindow call signature filters by ip; mock returns 0
      // for any ip not "primed" — assertions verify the rateLimit forwards the
      // ip parameter to the DAL unchanged.
      countMock.mockReturnValueOnce(0);
      const r = rateLimit.check(fakeDb, '2.2.2.2', '2026-04-27T10:30:00.000Z');
      expect(r.count).toBe(0);
      expect(countMock).toHaveBeenCalledWith(fakeDb, '2.2.2.2', rateLimit.WINDOW_SECONDS, '2026-04-27T10:30:00.000Z');
    });
  });
});
