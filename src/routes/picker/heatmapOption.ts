// src/routes/picker/heatmapOption.ts — Pure ECharts option builder for the
// 30-day calendar heatmap on /picker.
//
// Phase 2: original implementation for historical actuals (HeatmapCell).
// Phase 3 (D-22): tooltip formatter extended to branch on `'pi_low' in cell`
//   for forecast cells (ForecastHeatmapCell). Cell color rendering is unchanged
//   — viridis scale + n<5 gray override applies uniformly.
//
// Sources:
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-13, D-14, D-15
//   .planning/phases/03-forecast-layer/03-CONTEXT.md §D-22, D-23, D-24
//   .planning/phases/03-forecast-layer/03-PATTERNS.md §heatmapOption.ts

import type { EChartsOption } from 'echarts';
import type { HeatmapCell } from '$lib/db/queries/tripPicker';
import type { ForecastHeatmapCell } from '$lib/db/queries/forecastHeatmap';
import {
  FISH_PER_ANGLER_TOOLTIP_UNIT,
  FORECAST_LABEL,
  NOT_ENOUGH_HISTORY,
  PI_LABEL,
  HEATMAP_LEGEND_HIGH
} from '$lib/copy/metrics';

/** Insufficient-data cell color (UI-SPEC §Color tokens; matches --color-lowdata-bg). */
export const HEATMAP_LOWDATA_GRAY = '#e5e7eb';

/**
 * Viridis 5-stop palette (colorblind-safe, CLAUDE.md non-negotiable #3 + PITFALLS §UX).
 * Matches app.css @theme --heatmap-0 through --heatmap-4.
 */
export const VIRIDIS_STOPS = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];

/** Phase 3: heatmap cells may be Phase 2 actuals OR Phase 3 forecasts. */
export type AnyHeatmapCell = HeatmapCell | ForecastHeatmapCell;

/** Discriminant: a forecast cell has the `pi_low` field (even if its value is null). */
function isForecastCell(cell: AnyHeatmapCell): cell is ForecastHeatmapCell {
  return 'pi_low' in cell;
}

/**
 * Build an EChartsOption for the 30-day calendar heatmap.
 *
 * T-02-23 mitigation: per-cell itemStyle.color override renders n<5 cells gray,
 * bypassing the visualMap color scale entirely — prevents low-data cells from
 * falsely appearing in the viridis color ramp.
 *
 * D-14: max value for visualMap is derived only from n>=5 cells so outlier
 * low-data cells do not distort the color scale.
 *
 * Phase 3 (D-22): tooltip formatter branches on isForecastCell:
 *  - Forecast n>=5: "forecast: V fish/angler [L–H 80% PI] · n=N trips" + optional gap note
 *  - Forecast n<5:  "not enough history — n=N trips"
 *  - Actuals n>=5:  "V.V fish/angler · n=N trips" (unchanged)
 *  - Actuals n<5:   "low data — n=N trips" (unchanged)
 *
 * Cell color rendering (visualMap + n<5 gray override) is unchanged.
 */
export function buildHeatmapOption(
  cells: AnyHeatmapCell[],
  range: { from: string; to: string }
): EChartsOption {
  // T-02-23: gray override for cells where n < 5 (D-14 — unchanged for both actuals and forecasts).
  // n<5 cells emit { value: [date, value ?? 0], itemStyle: { color: '#e5e7eb' } }.
  // n>=5 cells emit bare tuple [date, value] — consumed by the visualMap color scale.
  const seriesData = cells.map((c) =>
    c.n < 5
      ? { value: [c.date, c.value ?? 0], itemStyle: { color: HEATMAP_LOWDATA_GRAY } }
      : [c.date, c.value]
  );

  // D-14: derive max from n>=5 cells only — low-data outliers must not distort scale.
  const validValues = cells
    .filter((c) => c.n >= 5 && c.value !== null)
    .map((c) => c.value as number);
  const maxVal = validValues.length > 0 ? Math.max(1, ...validValues) : 1;

  return {
    tooltip: {
      position: 'top',
      formatter: (params: any) => {
        // params.value = [date, aggregateValue] per ECharts calendar series
        const date: string = params.value[0];
        const cell = cells.find((c) => c.date === date);
        if (!cell) return '';
        const tripWord = cell.n === 1 ? 'trip' : 'trips';

        if (isForecastCell(cell)) {
          // Phase 3 forecast branch.
          if (cell.n < 5) {
            // D-08 verbatim refusal copy.
            return `${cell.date}<br/>${NOT_ENOUGH_HISTORY} — n=${cell.n} ${tripWord}`;
          }
          // n>=5 forecast cell with point estimate.
          // D-23: integer-only display via Math.round on value AND PI bounds.
          const v = Math.round(cell.value ?? 0);
          const lo = cell.pi_low != null ? Math.round(cell.pi_low) : null;
          const hi = cell.pi_high != null ? Math.round(cell.pi_high) : null;
          const piStr = lo != null && hi != null ? ` [${lo}–${hi} ${PI_LABEL}]` : '';
          // D-24 gap annotation (verbatim "based on N of M days") — only when present<expected.
          const gapStr =
            cell.gap_present != null &&
            cell.gap_expected != null &&
            cell.gap_present < cell.gap_expected
              ? `<br/>based on ${cell.gap_present} of ${cell.gap_expected} days`
              : '';
          return `${cell.date}<br/>${FORECAST_LABEL}: ${v} ${FISH_PER_ANGLER_TOOLTIP_UNIT}${piStr}<br/>n=${cell.n} ${tripWord}${gapStr}`;
        }

        // Phase 2 actuals branch — unchanged.
        if (cell.n < 5) {
          return `${cell.date}<br/>low data — n=${cell.n} ${tripWord}`;
        }
        return `${cell.date}<br/>${(cell.value ?? 0).toFixed(1)} ${FISH_PER_ANGLER_TOOLTIP_UNIT}<br/>n=${cell.n} ${tripWord}`;
      }
    },
    calendar: {
      range: [range.from, range.to],
      cellSize: ['auto', 20],
      yearLabel: { show: false }
    },
    visualMap: {
      min: 0,
      max: maxVal,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: VIRIDIS_STOPS },
      text: [HEATMAP_LEGEND_HIGH, 'low']
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: seriesData
      }
    ]
  };
}
