// tests/unit/shared/range.test.ts
// Unit tests for src/lib/shared/range.ts
// Covers all range presets, custom ranges, chooseGranularity, and includesToday.
// Uses fake timers to make today() deterministic.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  rangeToDates,
  chooseGranularity,
  RANGE_PRESETS
} from '../../../src/lib/shared/range';

// Fix "today" to 2026-04-30 for all tests.
// today() in America/Los_Angeles at 2026-04-30T15:00:00Z is 2026-04-30 (PT noon).
const FAKE_NOW = new Date('2026-04-30T15:00:00Z');

describe('RANGE_PRESETS', () => {
  it('contains all expected presets in the right order', () => {
    expect(RANGE_PRESETS).toEqual(['1m', '3m', '6m', '1y', '2y', '5y', 'all', 'custom']);
  });
});

describe('chooseGranularity', () => {
  it('returns daily for spans <= 45 days', () => {
    expect(chooseGranularity(0)).toBe('daily');
    expect(chooseGranularity(1)).toBe('daily');
    expect(chooseGranularity(44)).toBe('daily');
    expect(chooseGranularity(45)).toBe('daily');
  });

  it('returns weekly for spans > 45 and <= 730 days (2 years)', () => {
    expect(chooseGranularity(46)).toBe('weekly');
    expect(chooseGranularity(90)).toBe('weekly');
    expect(chooseGranularity(365)).toBe('weekly');
    expect(chooseGranularity(730)).toBe('weekly');
  });

  it('returns monthly for spans > 730 days', () => {
    expect(chooseGranularity(731)).toBe('monthly');
    expect(chooseGranularity(1825)).toBe('monthly');
    expect(chooseGranularity(365 * 15)).toBe('monthly');
  });
});

describe('rangeToDates — preset ranges', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1m: fromDate = today-30d, toDate = today, granularity = daily, includesToday = true', () => {
    const result = rangeToDates('1m');
    expect(result.toDate).toBe('2026-04-30');
    expect(result.fromDate).toBe('2026-03-31');
    expect(result.granularity).toBe('daily');
    expect(result.includesToday).toBe(true);
  });

  it('3m: fromDate = today-90d, toDate = today, granularity = weekly, includesToday = true', () => {
    const result = rangeToDates('3m');
    expect(result.toDate).toBe('2026-04-30');
    expect(result.fromDate).toBe('2026-01-30');
    expect(result.granularity).toBe('weekly');
    expect(result.includesToday).toBe(true);
  });

  it('6m: fromDate = today-180d, toDate = today, granularity = weekly, includesToday = true', () => {
    const result = rangeToDates('6m');
    expect(result.toDate).toBe('2026-04-30');
    expect(result.fromDate).toBe('2025-11-01');
    expect(result.granularity).toBe('weekly');
    expect(result.includesToday).toBe(true);
  });

  it('1y: fromDate = today-365d, toDate = today, granularity = weekly, includesToday = true', () => {
    const result = rangeToDates('1y');
    expect(result.toDate).toBe('2026-04-30');
    expect(result.fromDate).toBe('2025-04-30');
    expect(result.granularity).toBe('weekly');
    expect(result.includesToday).toBe(true);
  });

  it('2y: fromDate = today-730d, toDate = today, granularity = monthly, includesToday = true', () => {
    const result = rangeToDates('2y');
    expect(result.toDate).toBe('2026-04-30');
    expect(result.fromDate).toBe('2024-05-01');
    expect(result.granularity).toBe('monthly');
    expect(result.includesToday).toBe(true);
  });

  it('5y: fromDate = today-1825d, toDate = today, granularity = monthly, includesToday = true', () => {
    const result = rangeToDates('5y');
    expect(result.toDate).toBe('2026-04-30');
    expect(result.fromDate).toBe('2021-04-30');
    expect(result.granularity).toBe('monthly');
    expect(result.includesToday).toBe(true);
  });

  it('all: fromDate = today-(365*15)d, toDate = today, granularity = monthly, includesToday = true (T-02-31 bounded sentinel)', () => {
    const result = rangeToDates('all');
    expect(result.toDate).toBe('2026-04-30');
    // 365 * 15 = 5475 days back from 2026-04-30
    expect(result.fromDate).toBe('2011-04-24');
    expect(result.granularity).toBe('monthly');
    expect(result.includesToday).toBe(true);
  });
});

describe('rangeToDates — custom range', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('custom ≤45 days → granularity daily', () => {
    const result = rangeToDates('custom', { fromDate: '2025-01-01', toDate: '2025-02-15' });
    expect(result.fromDate).toBe('2025-01-01');
    expect(result.toDate).toBe('2025-02-15');
    expect(result.granularity).toBe('daily');
    expect(result.includesToday).toBe(false);
  });

  it('custom ≤2y span → granularity weekly', () => {
    const result = rangeToDates('custom', { fromDate: '2025-01-01', toDate: '2026-06-01' });
    expect(result.fromDate).toBe('2025-01-01');
    expect(result.toDate).toBe('2026-06-01');
    expect(result.granularity).toBe('weekly');
    expect(result.includesToday).toBe(false);
  });

  it('custom >2y span → granularity monthly', () => {
    const result = rangeToDates('custom', { fromDate: '2020-01-01', toDate: '2026-01-01' });
    expect(result.fromDate).toBe('2020-01-01');
    expect(result.toDate).toBe('2026-01-01');
    expect(result.granularity).toBe('monthly');
    expect(result.includesToday).toBe(false);
  });

  it('custom toDate = today → includesToday = true', () => {
    const result = rangeToDates('custom', { fromDate: '2025-01-01', toDate: '2026-04-30' });
    expect(result.includesToday).toBe(true);
  });

  it('custom toDate > today → includesToday = true', () => {
    const result = rangeToDates('custom', { fromDate: '2025-01-01', toDate: '2026-05-15' });
    expect(result.includesToday).toBe(true);
  });

  it('custom toDate < today → includesToday = false', () => {
    const result = rangeToDates('custom', { fromDate: '2024-01-01', toDate: '2024-12-31' });
    expect(result.includesToday).toBe(false);
  });

  it('custom with fromDate > toDate THROWS', () => {
    expect(() => rangeToDates('custom', { fromDate: '2025-01-01', toDate: '2024-01-01' })).toThrow();
  });

  it('custom without custom param THROWS', () => {
    expect(() => rangeToDates('custom')).toThrow();
  });

  it('custom with same fromDate and toDate → granularity daily (0 span)', () => {
    const result = rangeToDates('custom', { fromDate: '2025-06-15', toDate: '2025-06-15' });
    expect(result.granularity).toBe('daily');
    expect(result.fromDate).toBe('2025-06-15');
    expect(result.toDate).toBe('2025-06-15');
  });
});

describe('rangeToDates — all presets include today and have correct granularity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('all non-custom presets return includesToday = true', () => {
    const presets = ['1m', '3m', '6m', '1y', '2y', '5y', 'all'] as const;
    for (const p of presets) {
      const r = rangeToDates(p);
      expect(r.includesToday, `preset ${p} should have includesToday=true`).toBe(true);
    }
  });

  it('all non-custom presets return toDate = today', () => {
    const presets = ['1m', '3m', '6m', '1y', '2y', '5y', 'all'] as const;
    for (const p of presets) {
      const r = rangeToDates(p);
      expect(r.toDate, `preset ${p} toDate`).toBe('2026-04-30');
    }
  });
});
