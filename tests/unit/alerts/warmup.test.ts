// tests/unit/alerts/warmup.test.ts
// Phase 4 Plan 02 Wave-0 anchor: warm-up daily cap (ALT-12).
import { describe, it, expect } from 'vitest';
import { dailyCap, withinCap } from '../../../src/lib/alerts/warmup';

describe('warmup', () => {
  it('WARMUP_START_DATE unset → dailyCap returns Number.POSITIVE_INFINITY (null and undefined)', () => {
    // B2 fix: when env unset, dispatcher treats system as past warm-up.
    expect(dailyCap('2026-04-27', null)).toBe(Number.POSITIVE_INFINITY);
    expect(dailyCap('2026-04-27', undefined)).toBe(Number.POSITIVE_INFINITY);
  });
  it('returns 0 before warm-up start', () => {
    expect(dailyCap('2026-04-26', '2026-04-27')).toBe(0); // -1 days
  });
  it('returns 50 during week 1', () => {
    expect(dailyCap('2026-04-27', '2026-04-27')).toBe(50); // day 0
    expect(dailyCap('2026-05-03', '2026-04-27')).toBe(50); // day 6
  });
  it('returns 200 during week 2', () => {
    expect(dailyCap('2026-05-04', '2026-04-27')).toBe(200); // day 7
    expect(dailyCap('2026-05-10', '2026-04-27')).toBe(200); // day 13
  });
  it('returns Infinity from week 3 onward', () => {
    expect(dailyCap('2026-05-11', '2026-04-27')).toBe(Number.POSITIVE_INFINITY);
    expect(dailyCap('2027-01-01', '2026-04-27')).toBe(Number.POSITIVE_INFINITY);
  });
  describe('withinCap', () => {
    it('treats cap as exclusive — sentCount < cap is fine, equal is over', () => {
      expect(withinCap(49, 50)).toBe(true);
      expect(withinCap(50, 50)).toBe(false);
      expect(withinCap(51, 50)).toBe(false);
    });
    it('Infinity cap always passes', () => {
      expect(withinCap(99999, Number.POSITIVE_INFINITY)).toBe(true);
    });
  });
});
