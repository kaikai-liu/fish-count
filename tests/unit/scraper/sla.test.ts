// tests/unit/scraper/sla.test.ts
// Plan 01-07 TDD RED — failing test for the pure shouldAlert helper before
// src/lib/scraper/sla.ts exists. Task 2 expands this into the full truth
// table + checkSlaAndAlert side-effect coverage.
import { describe, it, expect } from 'vitest';

describe('shouldAlert (pure, D-23/D-25) — RED', () => {
  it('returns true when success + today < 50% of baseline ≥ 5', async () => {
    const { shouldAlert } = await import('../../../src/lib/scraper/sla');
    expect(shouldAlert('success', 100, 40)).toBe(true);
  });
});
