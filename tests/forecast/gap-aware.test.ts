// tests/forecast/gap-aware.test.ts
// Wave 0 scaffold for D-24 gap-day accounting + "based on N of M days" copy.
// Wave 1 Plan 03-02 fills in the assertions.
import { describe, it } from 'vitest';

describe('forecast gap-aware aggregation (D-24, FCT-03 gap bullet)', () => {
  it.todo('gap_days_present counts scrape_runs.outcome IN (success, empty) over input window');
  it.todo('gap_days_expected = |M|, excluding the forecast year itself (RESEARCH §5)');
  it.todo('killed/http_error/parse_error outcomes count as gaps');
  it.todo('absent scrape_runs row counts as gap');
  it.todo('gap_days_present <= gap_days_expected always holds');
});
