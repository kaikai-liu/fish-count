// tests/forecast/compute.test.ts
// Wave 0 scaffold for FCT-01 (statistical projection), FCT-02 (n shown), FCT-03 (n<5 refusal).
// Wave 1 Plan 03-02 fills in the assertions; this file's existence is a verify dependency.
import { describe, it } from 'vitest';

describe('forecast compute (FCT-01/02/03)', () => {
  it.todo(
    'D-01 seasonal-naïve weighted yield: SUM(species_count) / SUM(angler_count) over ±7-day × all-prior-years window'
  );
  it.todo('D-04 prediction interval: empirical 10th/90th percentiles of per-trip ratios');
  it.todo('D-06 n_trips: COUNT(DISTINCT source_date, boat_id, trip_type)');
  it.todo('D-07 n<5: stores value=NULL, pi_low=NULL, pi_high=NULL; n_trips populated');
  it.todo('D-12 baseline_value equals value for v1');
  it.todo('idempotence: recomputeForecasts twice → identical state');
});
