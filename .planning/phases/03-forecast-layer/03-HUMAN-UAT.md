---
status: partial
phase: 03-forecast-layer
source: [03-VERIFICATION.md]
started: 2026-04-26
updated: 2026-04-26
---

## Current Test

[awaiting human testing]

## Tests

### 1. Forecast tooltip rendering inside ECharts canvas
expected: Visiting `/picker?species=bluefin&trip_type=Overnight&target_date={today+5}` and hovering a future heatmap cell shows a tooltip containing `forecast: N fish/angler [L–H 80% PI] · n=N trips` (FORECAST_LABEL prefix, integer-only values, 80% PI bounds). Required because tooltip is rendered inside ECharts canvas; jsdom cannot execute its renderer.
result: [pending]

### 2. /about#forecasts page renders the FCT-04 benchmark inline summary
expected: Visiting `/about#forecasts` shows: (1) seasonal-naïve baseline labeled as such, (2) MAE + median absolute error + 80% PI coverage numbers visible inline, (3) link/reference to `03-VALIDATION-BENCHMARK.md` present. Markdown-driven copy may shift between paragraph splits; visual inspection catches layout regressions.
result: [pending]

### 3. Horizon overflow message replaces heatmap, rankings still render
expected: Visiting `/picker?species=yellowtail&trip_type=Full+Day&target_date={today+45}` shows: (1) heatmap area renders `horizon too far — historical data only` in place of the calendar grid, (2) historical rankings table below renders normally (it's based on historical actuals, not forecasts).
result: [pending]

### 4. FCT-04 benchmark artifact accuracy against production data
expected: Running `pnpm tsx scripts/forecast-benchmark.ts` against the production DB and opening `.planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md`: (1) seasonal-naïve baseline labeled as such, (2) MAE + median absolute error + PI coverage numbers match the seed data and methodology described, (3) Status note flagging dev-fixture origin removed/updated when production DB is used.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
