// tests/unit/shared/range.test.ts
// Unit tests for src/lib/shared/range.ts
// Covers all range presets and includesToday. (Polish pass: 'custom' range
// and chooseGranularity removed — chart dataZoom replaces the custom-range UI.)
// Uses fake timers to make today() deterministic.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { rangeToDates, RANGE_PRESETS } from '../../../src/lib/shared/range';

// Fix "today" to 2026-04-30 for all tests.
// today() in America/Los_Angeles at 2026-04-30T15:00:00Z is 2026-04-30 (PT noon).
const FAKE_NOW = new Date('2026-04-30T15:00:00Z');

describe('RANGE_PRESETS', () => {
  it('contains all expected presets in the right order', () => {
    expect(RANGE_PRESETS).toEqual(['1m', '3m', '6m', '1y', '2y', '5y', 'all']);
  });
});

// Polish pass: chooseGranularity removed alongside the 'custom' range —
// the per-preset granularity table now covers every supported case.

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
    // 730 days back from 2026-04-30 (UTC arithmetic via addDays): 2024-04-30
    expect(result.fromDate).toBe('2024-04-30');
    expect(result.granularity).toBe('monthly');
    expect(result.includesToday).toBe(true);
  });

  it('5y: fromDate = today-1825d, toDate = today, granularity = monthly, includesToday = true', () => {
    const result = rangeToDates('5y');
    expect(result.toDate).toBe('2026-04-30');
    // 1825 days back from 2026-04-30: 2021-05-01 (includes leap year 2024)
    expect(result.fromDate).toBe('2021-05-01');
    expect(result.granularity).toBe('monthly');
    expect(result.includesToday).toBe(true);
  });

  it('all: fromDate = today-(365*15)d, toDate = today, granularity = monthly, includesToday = true (T-02-31 bounded sentinel)', () => {
    const result = rangeToDates('all');
    expect(result.toDate).toBe('2026-04-30');
    // 5475 days back from 2026-04-30: 2011-05-04 (includes 4 leap years: 2012,2016,2020,2024)
    expect(result.fromDate).toBe('2011-05-04');
    expect(result.granularity).toBe('monthly');
    expect(result.includesToday).toBe(true);
  });
});

// Polish pass: 'custom' range describe block removed (~10 cases) — chart
// dataZoom replaces the user-facing custom-range UI.

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
