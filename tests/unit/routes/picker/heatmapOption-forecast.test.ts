// tests/unit/routes/picker/heatmapOption-forecast.test.ts
// D-22 / D-23 / D-24: tooltip formatter branches for forecast cells.
//
// Discriminator: 'pi_low' in cell — forecast cells (ForecastHeatmapCell) carry
// pi_low/pi_high/gap_present/gap_expected; Phase 2 actuals cells (HeatmapCell)
// do not.
//
// Cell color rendering (viridis + n<5 gray override) is unchanged for both
// branches; only the tooltip text differs.
import { describe, it, expect } from 'vitest';
import { buildHeatmapOption, type AnyHeatmapCell } from '../../../../src/routes/picker/heatmapOption';
import type { ForecastHeatmapCell } from '../../../../src/lib/db/queries/forecastHeatmap';
import type { HeatmapCell } from '../../../../src/lib/db/queries/tripPicker';

function callFormatter(cells: AnyHeatmapCell[], date: string): string {
  const opt = buildHeatmapOption(cells, { from: date, to: date });
  const formatter = (opt.tooltip as any).formatter as (p: any) => string;
  return formatter({ value: [date, 0] });
}

describe('heatmapOption tooltip formatter — forecast branch (D-22, D-23, D-24)', () => {
  it('Phase 2 actuals cell n>=5 renders unchanged (toFixed(1) + fish/angler)', () => {
    const cells: HeatmapCell[] = [{ date: '2026-05-10', value: 7.85, n: 12 }];
    const out = callFormatter(cells as AnyHeatmapCell[], '2026-05-10');
    expect(out).toContain('7.9 fish/angler');
    expect(out).toContain('n=12 trips');
    expect(out).not.toContain('forecast');
  });

  it('Phase 2 actuals cell n<5 renders existing "low data" copy unchanged', () => {
    const cells: HeatmapCell[] = [{ date: '2026-05-10', value: 7.85, n: 3 }];
    const out = callFormatter(cells as AnyHeatmapCell[], '2026-05-10');
    expect(out).toContain('low data');
    expect(out).toContain('n=3 trips');
    expect(out).not.toContain('not enough history'); // Phase 2 wording preserved
  });

  it('Forecast cell n>=5: integer value + 80% PI bounds + verbatim "forecast" label (D-22, D-23)', () => {
    const cells: ForecastHeatmapCell[] = [{
      date: '2026-05-20', value: 8.7, n: 12,
      pi_low: 4.2, pi_high: 12.6,
      gap_present: 56, gap_expected: 56
    }];
    const out = callFormatter(cells as AnyHeatmapCell[], '2026-05-20');
    expect(out).toContain('forecast: 9 fish/angler'); // Math.round(8.7) = 9
    expect(out).toContain('[4–13 80% PI]');           // Math.round(4.2)=4, Math.round(12.6)=13
    expect(out).toContain('n=12 trips');
    expect(out).not.toContain('8.7'); // no decimals (D-23)
  });

  it('Forecast cell n<5 renders verbatim "not enough history — n=N trips" (D-08)', () => {
    const cells: ForecastHeatmapCell[] = [{
      date: '2026-05-20', value: null, n: 3,
      pi_low: null, pi_high: null,
      gap_present: 0, gap_expected: 56
    }];
    const out = callFormatter(cells as AnyHeatmapCell[], '2026-05-20');
    expect(out).toContain('not enough history');
    expect(out).toContain('n=3 trips');
    expect(out).not.toContain('forecast:');
    expect(out).not.toContain('80% PI');
  });

  it('Forecast cell with gap_present < gap_expected appends "based on N of M days" (D-24)', () => {
    const cells: ForecastHeatmapCell[] = [{
      date: '2026-05-20', value: 8.0, n: 10,
      pi_low: 3.0, pi_high: 12.0,
      gap_present: 42, gap_expected: 56
    }];
    const out = callFormatter(cells as AnyHeatmapCell[], '2026-05-20');
    expect(out).toContain('based on 42 of 56 days');
  });

  it('Forecast cell with gap_present == gap_expected does NOT append gap annotation', () => {
    const cells: ForecastHeatmapCell[] = [{
      date: '2026-05-20', value: 8.0, n: 10,
      pi_low: 3.0, pi_high: 12.0,
      gap_present: 56, gap_expected: 56
    }];
    const out = callFormatter(cells as AnyHeatmapCell[], '2026-05-20');
    expect(out).not.toContain('based on');
  });

  it('Mixed array (past actuals + future forecasts) routes each cell to correct branch', () => {
    const cells: AnyHeatmapCell[] = [
      { date: '2026-05-10', value: 5.5, n: 8 },                                   // actuals
      { date: '2026-05-20', value: 7.0, n: 10, pi_low: 3.0, pi_high: 11.0,
        gap_present: 56, gap_expected: 56 } as ForecastHeatmapCell                // forecast
    ];
    expect(callFormatter(cells, '2026-05-10')).toContain('5.5 fish/angler');
    expect(callFormatter(cells, '2026-05-20')).toContain('forecast: 7 fish/angler');
  });
});
