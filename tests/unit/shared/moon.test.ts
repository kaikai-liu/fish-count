// tests/unit/shared/moon.test.ts
// Unit tests for src/lib/shared/moon.ts — Phase 7 (MOON-03).
// Anchor dates verified against NASA/USNO published lunar phase tables for 2026.
import { describe, it, expect } from 'vitest';
import { moonIllumination, moonIlluminationSeries } from '../../../src/lib/shared/moon';

describe('moonIllumination', () => {
  it('returns ~1.0 at known full moon (2026-01-03)', () => {
    expect(moonIllumination('2026-01-03')).toBeGreaterThan(0.95);
  });
  it('returns ~1.0 at known full moon (2026-04-01)', () => {
    expect(moonIllumination('2026-04-01')).toBeGreaterThan(0.95);
  });
  it('returns ~0.0 at known new moon (2026-01-18)', () => {
    expect(moonIllumination('2026-01-18')).toBeLessThan(0.05);
  });
  it('returns ~0.0 at known new moon (2026-04-16)', () => {
    expect(moonIllumination('2026-04-16')).toBeLessThan(0.05);
  });
  it('stays in [0, 1] for arbitrary dates', () => {
    for (const d of ['2024-06-15', '2025-12-25', '2026-04-30', '2030-07-04']) {
      const v = moonIllumination(d);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it('is deterministic across repeated calls', () => {
    expect(moonIllumination('2026-01-03')).toBe(moonIllumination('2026-01-03'));
    expect(moonIllumination('2026-04-16')).toBe(moonIllumination('2026-04-16'));
  });
});

describe('moonIlluminationSeries', () => {
  it('returns one value per inclusive day', () => {
    const series = moonIlluminationSeries('2026-01-01', '2026-01-07');
    expect(series).toHaveLength(7);
  });
  it('handles single-day range (from === to)', () => {
    const series = moonIlluminationSeries('2026-01-03', '2026-01-03');
    expect(series).toHaveLength(1);
    expect(series[0]).toBeGreaterThan(0.95);
  });
  it('crosses year boundary correctly', () => {
    const series = moonIlluminationSeries('2025-12-30', '2026-01-02');
    expect(series).toHaveLength(4);
  });
  it('all values in [0, 1]', () => {
    const series = moonIlluminationSeries('2026-01-01', '2026-03-01');
    for (const v of series) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
