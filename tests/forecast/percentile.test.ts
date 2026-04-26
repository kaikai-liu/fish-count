// tests/forecast/percentile.test.ts
// Wave 1 (Plan 03-02): percentile() pure function — numpy "linear" interpolation method.
// RESEARCH §1 reference vectors locked here.
import { describe, it, expect } from 'vitest';
import { percentile } from '../../src/lib/forecast/compute';

describe('percentile helper (RESEARCH §1)', () => {
  it('empty array → returns 0', () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it('single element → returns that element', () => {
    expect(percentile([7], 0.5)).toBe(7);
  });

  it('[1..10] @ p=0.10 → 1.9 (linear interpolation reference vector)', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.1)).toBeCloseTo(1.9, 10);
  });

  it('[1..10] @ p=0.90 → 9.1 (linear interpolation reference vector)', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBeCloseTo(9.1, 10);
  });

  it('[1..10] @ p=0.50 → 5.5 (median check)', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBeCloseTo(5.5, 10);
  });
});
