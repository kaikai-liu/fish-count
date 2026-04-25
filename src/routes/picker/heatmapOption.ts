// src/routes/picker/heatmapOption.ts — Pure ECharts option builder for the
// 30-day calendar heatmap on /picker.
//
// Factored out of +page.svelte so the n<5 → gray override (D-14, T-02-23) is
// unit-testable without DOM/JSDOM. Zero DOM dependencies — testable from Node.
//
// Input:  gap-filled HeatmapCell[] (length 30) from the loader
//         + range { from, to } covering the 30-cell window
// Output: EChartsOption suitable for Chart.svelte (which dynamic-imports echarts)
//
// Sources:
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-13, D-14, D-15
//   .planning/phases/02-browse-trip-picker-trends/02-RESEARCH.md §Pattern 4 (heatmap)
//   .planning/phases/02-browse-trip-picker-trends/02-UI-SPEC.md §Color §Heatmap

import type { EChartsOption } from 'echarts';
import type { HeatmapCell } from '$lib/db/queries/tripPicker';
import {
  FISH_PER_ANGLER_TOOLTIP_UNIT,
  HEATMAP_LEGEND_HIGH
} from '$lib/copy/metrics';

/** Insufficient-data cell color (UI-SPEC §Color tokens; matches --color-lowdata-bg). */
export const HEATMAP_LOWDATA_GRAY = '#e5e7eb';

/**
 * Viridis 5-stop palette (colorblind-safe, CLAUDE.md non-negotiable #3 + PITFALLS §UX).
 * Matches app.css @theme --heatmap-0 through --heatmap-4.
 */
export const VIRIDIS_STOPS = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];

/**
 * Build an EChartsOption for the 30-day calendar heatmap.
 *
 * T-02-23 mitigation: per-cell itemStyle.color override renders n<5 cells gray,
 * bypassing the visualMap color scale entirely — prevents low-data cells from
 * falsely appearing in the viridis color ramp.
 *
 * D-14: max value for visualMap is derived only from n>=5 cells so outlier
 * low-data cells do not distort the color scale.
 */
export function buildHeatmapOption(
  cells: HeatmapCell[],
  range: { from: string; to: string }
): EChartsOption {
  // T-02-23: gray override for cells where n < 5 (D-14).
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
        if (cell.n < 5) {
          return `${cell.date}<br/>low data — n=${cell.n} ${cell.n === 1 ? 'trip' : 'trips'}`;
        }
        return `${cell.date}<br/>${(cell.value ?? 0).toFixed(1)} ${FISH_PER_ANGLER_TOOLTIP_UNIT}<br/>n=${cell.n} ${cell.n === 1 ? 'trip' : 'trips'}`;
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
