// tests/unit/lib/shared/dates-buckets.test.ts
// Phase 8 Plan 04 — AXS-01 / D-35. Bucket-start helpers for the time-axis
// migration. Pure date arithmetic — verified against external ISO-week
// references for boundary cases.
import { describe, it, expect } from 'vitest';
import { isoWeekStartFromKey, monthStartFromKey } from '../../../../src/lib/shared/dates';

describe('isoWeekStartFromKey', () => {
  it('mid-year ISO week → Monday of that week', () => {
    // ISO week 14 of 2025 starts Monday 2025-03-31.
    expect(isoWeekStartFromKey('2025-W14')).toBe('2025-03-31');
  });

  it('ISO week 1 may fall in the prior calendar year', () => {
    // ISO week 1 of 2025 contains Jan 4 2025; Monday is 2024-12-30.
    expect(isoWeekStartFromKey('2025-W01')).toBe('2024-12-30');
  });

  it('ISO week 1 of 2024 → 2024-01-01', () => {
    // Jan 1 2024 is a Monday, so ISO week 1 starts there.
    expect(isoWeekStartFromKey('2024-W01')).toBe('2024-01-01');
  });

  it('ISO week 53 (only some years have 53)', () => {
    // 2020 has ISO week 53. Monday of 2020-W53 is 2020-12-28.
    expect(isoWeekStartFromKey('2020-W53')).toBe('2020-12-28');
  });

  it('throws on invalid key', () => {
    expect(() => isoWeekStartFromKey('garbage')).toThrow();
    expect(() => isoWeekStartFromKey('2025-1')).toThrow();
    expect(() => isoWeekStartFromKey('25-W14')).toThrow();
  });
});

describe('monthStartFromKey', () => {
  it('YYYY-MM → YYYY-MM-01', () => {
    expect(monthStartFromKey('2025-04')).toBe('2025-04-01');
    expect(monthStartFromKey('2026-12')).toBe('2026-12-01');
    expect(monthStartFromKey('2024-01')).toBe('2024-01-01');
  });

  it('throws on invalid key', () => {
    expect(() => monthStartFromKey('2025')).toThrow();
    expect(() => monthStartFromKey('2025-W14')).toThrow();
    expect(() => monthStartFromKey('garbage')).toThrow();
  });
});
