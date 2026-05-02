// src/lib/copy/metrics.ts — Canonical per-angler copy constants
//
// Single source of truth for every UI surface that emits the literal
// "fish/angler" or "fish per angler" string. The per-angler-discipline lint
// (tests/unit/lint/per-angler-discipline.test.ts in Plan 02-07) allowlists
// this file plus PerAnglerMetric.svelte and /about/+page.svelte; everywhere
// else, the literal is forbidden.
//
// Why a constants module instead of inline strings: chart axis names,
// aria-labels, tooltip units, and headings would otherwise drift across
// 4+ routes/components. Centralizing prevents silent drift if someone adds
// a new chart and prevents the lint allowlist from ballooning.
//
// Sources: CLAUDE.md non-negotiable #4; UI-SPEC.md §Copywriting Contract.

/** ECharts yAxis.name on every per-angler chart (line + heatmap legend unit). */
export const FISH_PER_ANGLER_AXIS = 'fish/angler';

/** ARIA-label fragment used in chart aria-labels. Spelled out for screen readers. */
export const FISH_PER_ANGLER_ARIA = 'fish per angler';

/** Tooltip unit suffix, e.g. "1.7 fish/angler" inside an ECharts tooltip formatter. */
export const FISH_PER_ANGLER_TOOLTIP_UNIT = 'fish/angler';

/** Heading on /compare's multi-series weekly chart section. */
export const WEEKLY_FISH_PER_ANGLER_HEADING = 'Weekly fish/angler comparison';

/** Unit suffix for the "Window average" line inside BoatCard's why-panel. */
export const BEST_DAY_UNIT = 'fish/angler';

/** Heatmap visualMap legend "high" label (paired with "low"). */
export const HEATMAP_LEGEND_HIGH = 'high (fish/angler)';

/** Phase 3 D-25: inline kind label for forecast cells in PerAnglerMetric and heatmap tooltip.
 *  CONTEXT.md §Specific Ideas: verbatim 'forecast' — never 'prediction' or 'projection' or 'estimate'. */
export const FORECAST_LABEL = 'forecast';

/** Phase 3 D-08: verbatim n<5 refusal copy. Used in PerAnglerMetric (kind='forecast' value=null)
 *  AND in the heatmap tooltip's n<5 branch (replaces Phase 2 'low data — ' copy for forecast cells). */
export const NOT_ENOUGH_HISTORY = 'not enough history';

/** Phase 3 D-04: prediction interval label. The PI is empirical 10/90 = 80% coverage. */
export const PI_LABEL = '80% PI';
