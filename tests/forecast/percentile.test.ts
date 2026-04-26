// tests/forecast/percentile.test.ts
// Wave 0 scaffold for percentile() pure function — numpy "linear" interpolation method.
// Wave 1 Plan 03-02 fills in the assertions.
import { describe, it } from 'vitest';

describe('percentile helper (RESEARCH §1)', () => {
  it.todo('empty array → returns 0');
  it.todo('single element → returns that element');
  it.todo('[1..10] @ p=0.10 → 1.9 (linear interpolation reference vector)');
  it.todo('[1..10] @ p=0.90 → 9.1 (linear interpolation reference vector)');
  it.todo('[1..10] @ p=0.50 → 5.5 (median check)');
});
