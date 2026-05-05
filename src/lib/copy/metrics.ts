// src/lib/copy/metrics.ts — Canonical per-angler copy constants
//
// Single source of truth for every UI surface that emits the literal
// "fish/angler" or "fish per angler" string. Centralizing prevents silent drift
// across chart axes, aria-labels, tooltip units, and headings.
//
// Phase 8 Plan 03 (RTR-05, D-20): the per-angler-discipline lint that previously
// enforced an allowlist (only metrics.ts, PerAnglerMetric.svelte, /about/+page.svelte
// could inline the literal) is retired with v1. Rule no longer enforced via test;
// CLAUDE.md "use the verbatim domain language" still applies.
//
// Phase 8 Plan 03 (D-19 ripple): the forecast/heatmap-only constants (FORECAST_LABEL,
// NOT_ENOUGH_HISTORY, PI_LABEL, HEATMAP_LEGEND_HIGH) were removed along with the
// forecast pipeline + calendar heatmap surface. Every consumer was retired.
//
// Sources: CLAUDE.md "Domain language — use verbatim"; UI-SPEC.md §Copywriting Contract.

/** ECharts yAxis.name on every per-angler chart. */
export const FISH_PER_ANGLER_AXIS = 'fish/angler';

/** ARIA-label fragment used in chart aria-labels. Spelled out for screen readers. */
export const FISH_PER_ANGLER_ARIA = 'fish per angler';

/** Tooltip unit suffix, e.g. "1.7 fish/angler" inside an ECharts tooltip formatter. */
export const FISH_PER_ANGLER_TOOLTIP_UNIT = 'fish/angler';

/** Heading on /compare's multi-series weekly chart section. */
export const WEEKLY_FISH_PER_ANGLER_HEADING = 'Weekly fish/angler comparison';

/** Unit suffix for the "Best day in window" line inside BoatCard's why-panel. */
export const BEST_DAY_UNIT = 'fish/angler';
