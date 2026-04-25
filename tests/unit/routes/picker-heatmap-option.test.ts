// tests/unit/routes/picker-heatmap-option.test.ts
// Pure-function tests for buildHeatmapOption (src/routes/picker/heatmapOption.ts).
// No DOM required — the helper has zero DOM dependencies.
//
// Covers:
//   T-02-23: n<5 cells → itemStyle.color = '#e5e7eb' (HEATMAP_LOWDATA_GRAY)
//   T-02-23: n<5 cells with null value → coerced to 0 in itemStyle tuple
//   D-14: visualMap.max derived only from n>=5 cells (n<5 outliers excluded)
//   D-14: fallback max=1 when no n>=5 cells present
//   Viridis palette stops are exact
//   Calendar range matches supplied range input
import { describe, it, expect } from 'vitest';
import {
  buildHeatmapOption,
  HEATMAP_LOWDATA_GRAY,
  VIRIDIS_STOPS
} from '../../../src/routes/picker/heatmapOption';

const range = { from: '2026-05-01', to: '2026-05-30' };

describe('buildHeatmapOption (pure heatmap option builder)', () => {
  // -----------------------------------------------------------------------
  // T-02-23: gray override on n<5 cells
  // -----------------------------------------------------------------------
  it('overrides itemStyle.color to gray (#e5e7eb) for n<5 cells', () => {
    const cells = [
      { date: '2026-05-01', value: 2.5, n: 2 }, // n<5 → gray
      { date: '2026-05-02', value: 3.0, n: 8 }  // n>=5 → bare tuple
    ];
    const opt = buildHeatmapOption(cells as any, range);
    const data = (opt.series as any)[0].data as any[];

    // n<5 cell must have itemStyle override
    expect(data[0]).toEqual({
      value: ['2026-05-01', 2.5],
      itemStyle: { color: HEATMAP_LOWDATA_GRAY }
    });
    expect(data[0].itemStyle.color).toBe('#e5e7eb');

    // n>=5 cell stays as a bare tuple
    expect(Array.isArray(data[1])).toBe(true);
    expect(data[1]).toEqual(['2026-05-02', 3.0]);
  });

  // -----------------------------------------------------------------------
  // T-02-23: null value coerced to 0 when n<5
  // -----------------------------------------------------------------------
  it('coerces null value to 0 for n<5 cells with no data', () => {
    const cells = [{ date: '2026-05-01', value: null, n: 1 }];
    const opt = buildHeatmapOption(cells as any, range);
    const data = (opt.series as any)[0].data as any[];

    expect(data[0]).toEqual({
      value: ['2026-05-01', 0],
      itemStyle: { color: HEATMAP_LOWDATA_GRAY }
    });
  });

  // -----------------------------------------------------------------------
  // D-14: visualMap.max excludes n<5 outliers
  // -----------------------------------------------------------------------
  it('derives visualMap.max from n>=5 cells only — n<5 outliers do not distort scale', () => {
    const cells = [
      { date: '2026-05-01', value: 99,  n: 1 }, // outlier but n<5 → ignored
      { date: '2026-05-02', value: 2.5, n: 8 },
      { date: '2026-05-03', value: 3.0, n: 6 }
    ];
    const opt = buildHeatmapOption(cells as any, range);

    // Max must be 3.0 (from n>=5 cells), NOT 99.
    expect((opt.visualMap as any).max).toBe(3.0);
  });

  // -----------------------------------------------------------------------
  // D-14: fallback max=1 when no n>=5 cells
  // -----------------------------------------------------------------------
  it('falls back to max=1 when there are no n>=5 cells', () => {
    const cells = [{ date: '2026-05-01', value: 2.5, n: 1 }];
    const opt = buildHeatmapOption(cells as any, range);

    expect((opt.visualMap as any).max).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Viridis palette stops
  // -----------------------------------------------------------------------
  it('uses viridis palette stops verbatim', () => {
    const opt = buildHeatmapOption([], range);

    expect((opt.visualMap as any).inRange.color).toEqual(VIRIDIS_STOPS);
    expect(VIRIDIS_STOPS[0]).toBe('#440154');
    expect(VIRIDIS_STOPS[4]).toBe('#fde725');
  });

  // -----------------------------------------------------------------------
  // Calendar range
  // -----------------------------------------------------------------------
  it('configures calendar with the supplied range', () => {
    const opt = buildHeatmapOption([], range);

    expect((opt.calendar as any).range).toEqual([range.from, range.to]);
  });

  // -----------------------------------------------------------------------
  // Series type + coordinateSystem
  // -----------------------------------------------------------------------
  it('emits a heatmap series using calendar coordinateSystem', () => {
    const opt = buildHeatmapOption([], range);
    const series = (opt.series as any)[0];

    expect(series.type).toBe('heatmap');
    expect(series.coordinateSystem).toBe('calendar');
  });

  // -----------------------------------------------------------------------
  // Empty cells array (no data at all)
  // -----------------------------------------------------------------------
  it('handles empty cells array without throwing', () => {
    expect(() => buildHeatmapOption([], range)).not.toThrow();
    const opt = buildHeatmapOption([], range);
    expect((opt.series as any)[0].data).toEqual([]);
    expect((opt.visualMap as any).max).toBe(1);
  });
});
