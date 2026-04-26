// tests/forecast/horizon.test.ts
// Wave 0 scaffold for D-10 >30-day horizon branch (FCT-07).
// Wave 1 Plan 03-03 fills in the assertions.
import { describe, it } from 'vitest';

describe('picker horizon cap (FCT-07, D-10)', () => {
  it.todo('target_date > today + 30 → loader returns horizonTooFar: true and heatmap: null');
  it.todo('target_date == today + 30 → normal heatmap path renders');
  it.todo('horizonTooFar response still includes rankings (historical data is unaffected)');
  it.todo('heatmap area copy is "horizon too far — historical data only" (verbatim)');
});
