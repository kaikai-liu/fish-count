// tests/unit/lib/bar-normalize.test.ts
// Phase 8 D-10 — per-section bar normalization helper.
// Sources:
//   .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-10
//   .planning/phases/08-home-retire-polish/08-PATTERNS.md §"BoatBarRow.svelte"
//
// barWidthPct(rowFpa, sectionMax) returns a percentage value for the inline
// width style on a section's bar. Behaviors:
//   B1: standard ratios — fpa=[1.0, 0.5, 0.25] vs sectionMax=1.0 → [100, 50, 25].
//   B2: degenerate sectionMax=0 → returns 0 for every row (no NaN/Infinity).
//   B3: clamps to 100 when rowFpa > sectionMax (impossible in production).
import { describe, it, expect } from 'vitest';
import { barWidthPct } from '../../../src/lib/shared/normalize';

describe('barWidthPct — B1: standard within-section ratios', () => {
  it('1.0 / 1.0 → 100, 0.5 / 1.0 → 50, 0.25 / 1.0 → 25', () => {
    expect(barWidthPct(1.0, 1.0)).toBe(100);
    expect(barWidthPct(0.5, 1.0)).toBe(50);
    expect(barWidthPct(0.25, 1.0)).toBe(25);
  });

  it('handles 30× scale variance (Overnight ~1 vs 3.5 Day ~35) per D-10', () => {
    // Overnight section with sectionMax=1.0 — its biggest bar should fill the row.
    expect(barWidthPct(1.0, 1.0)).toBe(100);
    // 3.5 Day section with sectionMax=35 — its biggest bar should also fill the row.
    expect(barWidthPct(35, 35)).toBe(100);
    // A small 3.5 Day boat (10 fpa) shows ~28% of the section bar.
    expect(barWidthPct(10, 35)).toBeCloseTo(28.57, 1);
  });
});

describe('barWidthPct — B2: degenerate sectionMax=0', () => {
  it('returns 0 (not NaN/Infinity) when sectionMax is 0', () => {
    expect(barWidthPct(0, 0)).toBe(0);
    expect(barWidthPct(1, 0)).toBe(0);
    expect(Number.isFinite(barWidthPct(1, 0))).toBe(true);
  });
});

describe('barWidthPct — B3: clamps to 100 when rowFpa > sectionMax', () => {
  it('returns 100 (not >100) when rowFpa exceeds sectionMax', () => {
    expect(barWidthPct(2.0, 1.0)).toBe(100);
    expect(barWidthPct(99, 1)).toBe(100);
  });
});
