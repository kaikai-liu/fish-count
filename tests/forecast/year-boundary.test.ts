// tests/forecast/year-boundary.test.ts
// Wave 0 scaffold for January forecast date with ±7-day window crossing year boundary.
// Wave 1 Plan 03-02 fills in the assertions.
import { describe, it } from 'vitest';

describe('forecast year-boundary wrap (RESEARCH §1, Pitfall 5)', () => {
  it.todo('forecast_date 2026-01-03 → window 12-27..01-10 includes prior-year December dates');
  it.todo('forecast_date 2026-01-03 → window 12-27..01-10 includes prior-year January dates');
  it.todo(
    'forecast_date 2026-12-28 → window 12-21..01-04 includes following-year January dates of prior years'
  );
});
