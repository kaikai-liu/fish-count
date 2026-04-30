---
status: partial
phase: 03-forecast-layer
source: [03-VERIFICATION.md]
started: 2026-04-26
updated: 2026-04-28
---

## Current Test

[testing paused — 1 item blocked on production deploy (test 4)]

## Tests

### 1. Forecast tooltip rendering inside ECharts canvas
expected: Visiting `/picker?species=bluefin&trip_type=Overnight&target_date={today+5}` and hovering a future heatmap cell shows a tooltip containing `forecast: N fish/angler [L–H 80% PI] · n=N trips` (FORECAST_LABEL prefix, integer-only values, 80% PI bounds). Required because tooltip is rendered inside ECharts canvas; jsdom cannot execute its renderer.
result: pass
notes: |
  Verified at /picker?species=yellowtail&trip_type=Full+Day&target_date=2026-04-25 after running forecasts-rebuild against the UAT DB. Two side-observations surfaced and are tracked in the Gaps section as non-blocking quality concerns (dev seed missing forecast recompute; rankings.length===0 short-circuits before heatmap renders).

### 2. /about#forecasts page renders the FCT-04 benchmark inline summary
expected: Visiting `/about#forecasts` shows: (1) seasonal-naïve baseline labeled as such, (2) MAE + median absolute error + 80% PI coverage numbers visible inline, (3) link/reference to `03-VALIDATION-BENCHMARK.md` present. Markdown-driven copy may shift between paragraph splits; visual inspection catches layout regressions.
result: pass

### 3. Horizon overflow message replaces heatmap, rankings still render
expected: Visiting `/picker?species=yellowtail&trip_type=Full+Day&target_date={today+45}` shows: (1) heatmap area renders `horizon too far — historical data only` in place of the calendar grid, (2) historical rankings table below renders normally (it's based on historical actuals, not forecasts).
result: skipped
reason: |
  Same rankings short-circuit as test 1 (Gap 2 in this file): rankings.length===0 for any target_date > today+30 because the dev seed catch_reports range ends 2026-04-25, so the page renders "No matching trips" and never reaches the horizon-vs-heatmap branch. The horizon logic itself is exercised by `tests/forecast/horizon.test.ts` (4 it.todo placeholders converted to real assertions in commit `d537c3c`); confirming the actual copy `horizon too far — historical data only` requires either fixing Gap 2 first or extending dev seed coverage past today+45 days.

### 4. FCT-04 benchmark artifact accuracy against production data
expected: Running `pnpm tsx scripts/forecast-benchmark.ts` against the production DB and opening `.planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md`: (1) seasonal-naïve baseline labeled as such, (2) MAE + median absolute error + PI coverage numbers match the seed data and methodology described, (3) Status note flagging dev-fixture origin removed/updated when production DB is used.
result: blocked
blocked_by: prior-phase
reason: |
  Production DB does not exist yet — Phase 0 ops guardrails are complete but first production scrape is gated on TOS/robots review (STATE.md "Blockers/Concerns") and Fly.io deploy. Remote routine `trig_01GgGQeHSsAZaPTqv7tR6eLK` is scheduled for 2026-05-12T17:00:00Z to open a GitHub issue with the manual checklist once production data is reachable.

## Summary

total: 4
passed: 2
issues: 0
pending: 0
skipped: 1
blocked: 1

## Gaps

- truth: "Running seed-dev-db.ts produces a fully renderable /picker for any species/trip_type"
  status: failed
  reason: "scripts/seed-dev-db.ts populates catch_reports + boats + landings but never calls recomputeForecasts, leaving the forecasts table empty. Picker future cells gap-fill to value=null/n=0 and the FCT-05 forecast tooltip can't be observed without a manual `tsx scripts/forecasts-rebuild.ts` step."
  severity: minor
  test: 1
  surfaced_during: "UAT — forecast tooltip rendering"
  proposed_fix: "After upsert loop in scripts/seed-dev-db.ts, add a final recomputeForecasts(db) call (gated on argv-supplied date range covering today)."

- truth: "Heatmap renders independently when forecast cells exist, regardless of whether historical rankings happen to be non-empty"
  status: failed
  reason: "src/routes/picker/+page.svelte:180 short-circuits to a 'No matching trips' panel when rankings.length===0 and never reaches the heatmap branch at line 185. With Phase 3, forecast cells are precomputed without needing historical rankings — a future-only target on a low-data combination loses the calendar entirely."
  severity: minor
  test: 1
  surfaced_during: "UAT — forecast tooltip rendering"
  proposed_fix: "Refactor +page.svelte conditional so heatmap renders when (heatmap && filters && heatmapOption) regardless of rankings.length; show 'No matching trips' as an inline note above an empty rankings table rather than as a page-level short-circuit."
