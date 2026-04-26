// tests/forecast/heatmap-composer.test.ts
// Wave 0 scaffold for D-21 hybrid past/future heatmap composer (FCT-05).
// Wave 1 Plan 03-03 fills in the assertions.
import { describe, it } from 'vitest';

describe('picker hybrid heatmap composer (D-21, D-34)', () => {
  it.todo('past cells (date < today PT) come from heatmapForQuery (catch_reports)');
  it.todo('today + future cells (date >= today PT) come from forecastHeatmapForQuery (forecasts)');
  it.todo('today() called once per load — same value used for both horizon check and split');
  it.todo(
    '30-cell array is gap-filled with {date, value: null, n: 0} when neither source has the date'
  );
});
