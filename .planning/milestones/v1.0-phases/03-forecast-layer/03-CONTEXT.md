# Phase 3: Forecast Layer - Context

**Gathered:** 2026-04-25 (auto mode — recommended defaults)
**Status:** Ready for planning

<domain>
## Phase Boundary

A statistical projection (mean + prediction band + sample size `n`) per `(species, trip_type, forecast_date)` is precomputed nightly, stored in a `forecasts` table, refuses to render at `n<5`, is capped at a 30-day horizon, and powers the `/picker` calendar heatmap's coloring. The shipped projection is the seasonal-naïve baseline (FishCount honors ROADMAP success criterion #2 by labeling it as such); a benchmark script documents its empirical performance on a held-out window.

**In scope:**
- New `forecasts` table (DDL added to `src/lib/db/migrations.ts`) with idempotent UPSERT keyed on `(forecast_date, species, trip_type)`.
- Pure-math forecast compute module under `src/lib/forecast/compute.ts` (seasonal-naïve weighted-yield baseline + empirical 10/90 prediction interval + gap counting).
- DAL repository `src/lib/db/forecasts.ts` (upsertMany, getCell, getRange, deletePastHorizon).
- New cross-table read query `src/lib/db/queries/forecastHeatmap.ts` returning the same `{date, value, n}` shape contract Phase 2 D-15 locked, plus optional fields for tooltip enrichment.
- Recompute hooked into `_scrapeTick` after `scrapeDate` returns `success` or `empty`.
- Backfill CLI (`scripts/backfill.ts`) recomputes forecasts at end of run; new `scripts/forecasts-rebuild.ts` for ad-hoc operator rebuilds.
- `/picker` `+page.server.ts` updated to compose its 30-cell heatmap array from a hybrid of past actuals (existing `heatmapForQuery`) + today/future forecasts (new `forecastHeatmapForQuery`).
- `/picker` heatmap tooltip + `PerAnglerMetric` extended with `kind: 'historical' | 'forecast'` to render integer-rounded forecast values, prediction intervals, and `based on N of M days` gap annotations.
- `/about` page extended with a Forecasts section documenting baseline math + n<5 refusal + 30-day horizon + gap-aware aggregation.
- `/picker` >30-day target dates render `horizon too far — historical data only` in the heatmap area (rankings still computed from historical data).
- One-time `scripts/forecast-benchmark.ts` producing `.planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md` (FCT-04 honesty artifact).

**Out of scope — deferred to other phases:**
- Email signup, double opt-in, suppression, deliverability, hot-day/run-start alerts (Phase 4 — ALT-01..12).
- Loading/empty/error-state polish + rockfish-closed-season friendly message (Phase 5 — POL-01..03).
- ML-based forecasts (CLAUDE.md anti-feature; PROJECT.md Out of Scope).
- Continuous backtest cron / weekly model re-validation (PITFALLS §3 ideal but overkill at v1 scale; one-time benchmark suffices for FCT-04).
- Per-boat forecasts (ranking on `/picker` continues to use the historical D-08 metric; only fleet-wide forecasts are precomputed because the heatmap is the single FCT-05 consumer).
- Same-week-last-year overlay on trend charts (Phase 2 deferred V1X-01).
- Median / trimmed-mean toggle (Phase 2 deferred V1X-03).

**Out of scope — architectural guardrails that remain binding:**
- DAL is the only module that issues SQL (CLAUDE.md / STO-03) — no SQL in `src/lib/forecast/`, no SQL in `+page.server.ts` loaders, no SQL in components.
- All `YYYY-MM-DD` strings via `src/lib/shared/dates.ts` (STO-04) — including `today()` for the past/future split in the heatmap composer.
- Per-angler metrics can never be cross-trip-type compared in UI (CLAUDE.md non-negotiable #4) — forecast cells inherit this; mandatory `tripType` filter on the picker route is unchanged.
- Idempotent upsert pattern (Phase 1 D-06) — `forecasts` table follows the same `INSERT … ON CONFLICT DO UPDATE` pattern via the `UNIQUE(forecast_date, species, trip_type)` index.
- Heatmap shape contract `{date, value, n}` (Phase 2 D-15) — `forecastHeatmapForQuery` returns identical shape so `buildHeatmapOption` continues to work without changes.

</domain>

<decisions>
## Implementation Decisions

### Forecast model (FCT-01, FCT-04)
- **D-01:** Shipped projection = seasonal-naïve weighted-yield baseline. For each `(forecast_date, species, trip_type)` cell, the input is all `catch_reports` rows where `source_date` falls within ±7 calendar days of the same `(month, day-of-month)` as `forecast_date`, across **all prior years in the dataset**, matching the requested `species` and `trip_type`. Forecast value = `SUM(species_count) / SUM(angler_count)` over that input set (the same weighted-yield math as Phase 2 D-08). Per ROADMAP success criterion #2, the baseline ships and is labeled as such on the UI and in `/about`.
- **D-02:** Window choice (±7 days × all prior years) trades a tighter seasonal signal against the n≥5 floor. At ~10 species × ~12 trip-types × ~365 calendar days, ~14 candidate dates × N years × matched trips per (species, trip_type) per date typically clears n=5 for in-season slots. Off-season slots (closed rockfish window, no-bluefin months) stay below n=5 and render gray — which is the intended honest behavior, not a bug.

### Forecast aggregation grain (FCT-01, FCT-05)
- **D-03:** Forecast grain = `(forecast_date, species, trip_type)` — fleet-wide, no per-boat. Rationale: the only Phase 3 consumer is `/picker`'s heatmap (FCT-05); the picker's per-boat ranking continues to use the historical D-08 metric on `catch_reports` (boats with thin data still surface with the low-data badge per Phase 2 TRP-07). Per-boat forecasts are explicitly deferred — adding them would multiply forecasts table cardinality by ~50 boats with no current consumer.

### Prediction interval method (FCT-02 implicit; PITFALLS §3)
- **D-04:** Prediction interval = empirical 10th/90th percentiles of the per-trip per-angler ratio (`species_count / NULLIF(angler_count, 0)`) computed across the matched input set. Distribution-free (no normal-approx); honest on heavy-tailed catch counts where a single hot trip can otherwise dominate a parametric interval. Stored as `pi_low` and `pi_high` REAL columns. Heatmap tooltip renders `[low]–[high] fish/angler` integer-rounded.
- **D-05:** Compute the 10/90 percentiles in the SQL aggregate via `percentile_cont`-equivalent SQLite expressions OR (more portably) pull the matched ratios into JS and compute percentiles there. Planner picks; the math is identical and the input sets are small (≤ 1000 ratios per cell). Pure function in `src/lib/forecast/compute.ts` either way.

### Sample-size & n<5 storage policy (FCT-02, FCT-03)
- **D-06:** `n_trips` per cell = `COUNT(DISTINCT (source_date, boat_id, trip_type))` over the matched input set — same trip-counting rule as Phase 2 D-09. Two species rows on the same `(date, boat, trip_type)` count as one trip.
- **D-07:** ALL `(forecast_date, species, trip_type)` cells in the precompute window get a row in `forecasts`, regardless of n. When `n_trips < 5`, store `value=NULL`, `pi_low=NULL`, `pi_high=NULL`, `baseline_value` still populated (for audit), `n_trips` populated (for the UI to render `n=N trips`). The DAL never filters on `n_trips`; the loader/UI does the rendering decision based on `value IS NULL`.
- **D-08:** UI rendering rule (FCT-03): when a forecast cell has `value IS NULL`, the heatmap renders gray (same `HEATMAP_LOWDATA_GRAY` rule as Phase 2 D-14, reused unchanged) and the tooltip reads `not enough history — n=N trips`. The `PerAnglerMetric` component with `kind='forecast'` and `value=null` renders `not enough history` instead of a number.

### Horizon cap (FCT-07)
- **D-09:** Precompute window = `today PT … today PT + 30 days`. Cells outside this window are not stored. Past `forecast_date` rows persist (see D-15) but are never recomputed.
- **D-10:** `/picker` accepts target dates >30 days in the future at the URL/Zod level (no parse rejection). When `target_date > today + 30`, the heatmap area renders the message `horizon too far — historical data only` in place of the calendar grid; the historical rankings table below the heatmap still renders normally (it's based on historical actuals, not forecasts). Less hostile than form-level validation; preserves shareable URLs.

### `forecasts` table schema (FCT-01)
- **D-11:** Schema:
  ```sql
  CREATE TABLE IF NOT EXISTS forecasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    forecast_date TEXT NOT NULL,         -- YYYY-MM-DD PT (the date being forecast)
    species TEXT NOT NULL,
    trip_type TEXT NOT NULL,
    value REAL,                          -- weighted-yield mean; NULL when n_trips < 5
    pi_low REAL,                         -- 10th percentile; NULL when n_trips < 5
    pi_high REAL,                        -- 90th percentile; NULL when n_trips < 5
    n_trips INTEGER NOT NULL DEFAULT 0,  -- COUNT(DISTINCT trip) over matched input
    baseline_value REAL,                 -- always populated when computable; for FCT-04 audit
    gap_days_present INTEGER NOT NULL DEFAULT 0,    -- N (had data: success or empty)
    gap_days_expected INTEGER NOT NULL DEFAULT 0,   -- M (calendar days in input window across prior years)
    computed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_forecasts_unique
    ON forecasts(forecast_date, species, trip_type);
  CREATE INDEX IF NOT EXISTS idx_forecasts_range
    ON forecasts(forecast_date, species, trip_type);
  ```
- **D-12:** `baseline_value` column is reserved for the FCT-04 benchmark (see D-19). For v1 it equals `value` (because the shipped model IS the baseline); the column exists so a future "model-vs-baseline" change doesn't require a migration.

### Recompute scheduling (FCT-06)
- **D-13:** Forecast recompute is triggered inline at the end of `_scrapeTick` in `src/lib/server/scheduler.ts`, AFTER `scrapeDate(today)` returns. Wired with the same gate-ordering discipline as the SLA check (Phase 1 D-23..D-25): wrapped in a non-fatal try/catch so a recompute failure never blocks `pingHealthcheck('success')` — OPS-04 owns "is ingestion alive"; forecast recompute is a secondary tripwire.
- **D-14:** Recompute runs when `result.outcome ∈ {success, empty}` (data state may have changed). Skipped when `outcome ∈ {killed, http_error, parse_error}` (no new data; previous forecast remains valid). The CLI entry point (`scripts/backfill.ts`) calls the same recompute function once at the end of its run regardless of per-date outcomes.

### Recompute scope (FCT-06)
- **D-15:** Full rebuild of all `(forecast_date, species, trip_type)` cells in `today..today+30` × distinct `species` × distinct `trip_types` (where `species` and `trip_types` come from `distinctSpecies()` / `distinctTripTypes()` already used by `/picker`). Rough cardinality: ~10 species × ~12 trip-types × 31 days = ~3,720 cells per night. Each cell is one bounded SQL aggregate over a multi-year window — trivially cheap. UPSERT via the unique index makes the rebuild idempotent.
- **D-16:** Past-date forecast rows (`forecast_date < today`) are NEVER touched after their initial computation. Retained indefinitely so the FCT-04 benchmark and any future "did our forecast match reality?" introspection has historical material. New past rows are created only when the precompute window slides forward (i.e., yesterday's `today` row becomes today's `today-1` row, frozen).

### Backfill / ad-hoc rebuild (FCT-06)
- **D-17:** `scripts/backfill.ts` (Phase 1) gains a final step: after the date-loop completes, call `recomputeForecasts(today)` once. Operator running an initial backfill thus gets forecasts populated immediately rather than waiting for the next nightly tick.
- **D-18:** New `scripts/forecasts-rebuild.ts` (tsx-runnable, Node parseArgs, no flags) for ad-hoc operator rebuilds — same body as the recompute call, exists for repair/testing scenarios. Both backfill and rebuild import from `src/lib/forecast/compute.ts` so the math is single-source.

### FCT-04 baseline benchmark
- **D-19:** One-time `scripts/forecast-benchmark.ts` produces `.planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md`. Methodology: select a held-out year (e.g., 2025), recompute forecasts for that year using only `catch_reports` data BEFORE 2025-01-01, compare predicted weighted yield vs actual weighted yield per `(date, species, trip_type)` cell. Compare two variants:
  1. Shipped model = seasonal-naïve baseline ±7 days × all prior years (D-01).
  2. Naïve fleet-mean baseline = single mean of all matched-(species, trip_type) trips, no seasonality.
  Report MAE + median absolute error + interval coverage (% of actuals within `[pi_low, pi_high]` — should be ~80% if the empirical PI is honest). Since ROADMAP success criterion #2 says "the baseline ships and is labeled as such," the artifact's purpose is honesty documentation, not a model-shipping gate. If the seasonal baseline is decisively worse than fleet-mean, the planner reconsiders D-01 before phase-complete.

### Heatmap recolor wiring (FCT-05)
- **D-20:** New cross-table query `src/lib/db/queries/forecastHeatmap.ts` exporting `forecastHeatmapForQuery(db, { fromDate, toDate, species, tripType })` returning `Array<{ date, value, n, pi_low?, pi_high?, gap_present?, gap_expected? }>`. The first three fields preserve the Phase 2 D-15 contract; the optional fields are additive (Phase 2 ignored them; `buildHeatmapOption` consumes them in the tooltip formatter for forecast cells).
- **D-21:** `/picker/+page.server.ts` `load()` updated to compose the 30-cell heatmap array from two sources:
  - For each cell date `d` in `[heatmapStart, heatmapStart+29]`:
    - If `d < today()` PT → use the cell from `heatmapForQuery` (Phase 2 — actual `catch_reports` aggregate).
    - If `d >= today()` PT → use the cell from `forecastHeatmapForQuery` (Phase 3 — forecasts table).
  - Gap-fill logic for absent cells stays the same (null cell, n=0, gray render).
- **D-22:** `buildHeatmapOption` in `src/routes/picker/heatmapOption.ts` extended (not replaced): the tooltip formatter branches on whether the cell originates from a forecast (presence of `pi_low`/`pi_high`) and renders `forecast: V fish/angler [L–H 80% PI] · n=N trips · based on N of M days` (when N<M) vs. the existing actuals format. Cell color rendering is unchanged — viridis scale + gray override at `n<5` still applies, sourced from whatever `value`/`n` the cell carries.

### Integer rounding (CLAUDE.md non-negotiable #3, ROADMAP criterion #5)
- **D-23:** Forecast values stored as REAL; rounded to integer at display time. Locations:
  - Heatmap tooltip formatter (D-22): `Math.round(value)` for both the point estimate and the `[pi_low, pi_high]` bounds.
  - `PerAnglerMetric` component with `kind='forecast'` (D-25): integer rendering branch, no decimals ever.
  - Past-date / actuals cells continue to use the existing one-decimal-max rule (Phase 2 D-16) — only forecast cells flip to integer-only.

### Gap-aware aggregation (ROADMAP criterion #5; PITFALLS §8)
- **D-24:** For each forecast cell, the input window expansion (±7 days × all prior years) defines a set of expected calendar dates `M`. `gap_days_expected` = `|M|`. `gap_days_present` = count of dates in `M` where `scrape_runs.outcome ∈ {success, empty}` (we tried; either had data or honest zero). Days with `outcome ∈ {killed, http_error, parse_error}` OR no `scrape_runs` row at all count as gaps (we don't know what happened that day). When `gap_days_present < gap_days_expected`, the heatmap tooltip and the `/picker` "Why this boat?" panel append `based on N of M days` to the cell explanation. This matches PITFALLS §8 + Phase 1 D-23..D-25 outcome semantics.

### `PerAnglerMetric` forecast variant
- **D-25:** Extend `src/lib/components/PerAnglerMetric.svelte` with `kind?: 'historical' | 'forecast'` prop (default `'historical'` preserves Phase 2 behavior). When `kind='forecast'`:
  - Value formatting branches to integer-only (`Math.round(value)`).
  - Inline mini-label `forecast` appears between the value and the unit (e.g., `8 forecast fish/angler · n=12 trips`).
  - When `value === null`, renders `not enough history` (replaces the existing `—` em-dash).
  - Optional `pi?: { low: number; high: number }` prop renders `[L–H 80% PI]` after the value when present.
- **D-26:** Per-angler-discipline lint allowlist (Plan 02-07) is unchanged: `PerAnglerMetric.svelte` + `metrics.ts` + `/about` already on the allowlist. No new file emits the literal `fish/angler`.

### Module placement
- **D-27:** New module tree:
  - `src/lib/forecast/compute.ts` — pure math: `recomputeForecasts(db, opts?)`, `computeCell(input)`, percentile helper. NO SQL (calls DAL via `src/lib/db/forecasts.ts` + `src/lib/db/catchReports.ts`).
  - `src/lib/db/forecasts.ts` — DAL repository: `upsertMany(rows)`, `getCellsInRange({ fromDate, toDate, species, tripType })`, `pruneBeforeHorizon(cutoffDate)` (no-op for v1 since D-16 retains all past rows; reserved).
  - `src/lib/db/queries/forecastHeatmap.ts` — read query that joins `forecasts` (no joins to `catch_reports`; the heatmap composer in `+page.server.ts` calls past-vs-future queries separately per D-21).
  - `scripts/forecasts-rebuild.ts` — operator entry point.
- **D-28:** `src/lib/forecast/compute.ts` follows the same purity rule as `src/lib/scraper/parser.ts`: takes inputs, returns outputs, calls DAL only via typed repository functions. Easy to unit-test without mocking the database via `getDb()` injection.

### `/about` page update (BRW-09 extension; FCT-03 explanation)
- **D-29:** Append a `Forecasts` section to `src/routes/about/+page.svelte` documenting:
  - We ship a seasonal-naïve baseline (last N years, ±7 days around the same calendar slot, weighted by SUM(species_count) / SUM(angler_count)) — labeled as such per ROADMAP criterion #2.
  - Prediction intervals are empirical 10/90 percentiles of per-trip per-angler ratios; bands widen when history is sparse.
  - When `n_trips < 5`, we refuse to show a number — `not enough history` is shown instead.
  - Forecasts are capped at 30 days into the future; beyond that we show `horizon too far — historical data only`.
  - When the input window has scrape gaps, we show `based on N of M days` so the user knows the math used less than the full window.
  - Link to `.planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md` (or render inline summary) for the FCT-04 honesty artifact.
- **D-30:** `PerAnglerMetric` with `kind='forecast'` links to `/about#forecasts` (anchor) so the "what's a forecast?" question is one click away from any heatmap or per-angler forecast number.

### Caching strategy (extends Phase 2 D-29)
- **D-31:** `/picker` cache-control header stays `public, max-age=300` (Phase 2 D-29). The hybrid past/future heatmap composition adds no new cache concerns — past cells are immutable once final; future cells refresh after each nightly recompute (next request after 23:00 PT will see new forecasts at most one cache-window later).

### Testing seams
- **D-32:** `recomputeForecasts(db)` is pure and synchronous — unit tests use the existing `seedTestDb` helper (Plan 02-01) with a small synthetic catch_reports fixture, then assert specific forecast cells (value, pi_low, pi_high, n_trips, gap_days_present/expected). Static fixtures preferred over generative tests — failures are easier to diagnose.
- **D-33:** End-to-end test: seed dev DB → run `scripts/forecasts-rebuild.ts` → load `/picker` with a known (species, trip_type, future_date) → assert tooltip text contains the expected forecast number and `n=N trips` annotation. Mirrors the Phase 2 integration test structure (Plan 02-07).
- **D-34:** Heatmap composer test: with `today()` mocked to a known date, assert the loader returns `value` from `catch_reports` for past cells and from `forecasts` for today/future cells, verifying D-21 boundary.

### Claude's Discretion
- Exact SQL form of the percentile computation (SQLite has no native `percentile_cont`; planner picks between (a) pulling matched ratios into JS and computing percentiles there or (b) using `NTILE`/window-function tricks). Functional outcome identical.
- Whether `recomputeForecasts(db)` runs as a single `BEGIN…COMMIT` transaction or per-cell — planner picks based on locking trade-offs against ongoing `/picker` reads. WAL mode (Phase 1) makes either option safe.
- Whether `distinctSpecies()` / `distinctTripTypes()` get a "species/trip_type seen in last 365 days" predicate to avoid forecasting long-extinct labels — planner decides; either is acceptable.
- Whether the ad-hoc `forecasts-rebuild.ts` accepts a `--from`/`--to` range or always rebuilds the full window — planner picks (full rebuild is simpler, the operator use case is "fix it now," range mode is unnecessary at v1).
- Exact tooltip copy for forecast cells — planner picks within the constraints D-22/D-23/D-24 set.
- Whether `gap_days_expected` counts the year-of-`forecast_date` itself (e.g., for forecast_date=2026-05-15, do we include 2026-05-08..2026-05-22 in M, knowing future dates haven't happened?) — planner decides; default is to exclude the forecast year itself from M (only past years contribute), keeping the gap fraction interpretable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project rules + domain
- `CLAUDE.md` — Non-negotiable #3 (forecast honesty: prediction intervals always, sample size always, hard floor `n<5` → "not enough history", beat seasonal-naïve OR ship the baseline labeled, integers only, 30-day horizon cap), non-negotiable #4 (per-angler framing: forecast cells inherit "derived boat-aggregate average" wording, mandatory trip-type segmentation, inline disclaimer, `/about` link), Architecture Rules (DAL = only SQL surface, `src/lib/shared/dates.ts` = sole `YYYY-MM-DD` producer, idempotent upsert preserved, precompute-aggregates-read-cheap pattern), anti-features (no ML forecasts, no fake-precision decimals, no "ON FIRE" hype badges).
- `.planning/REQUIREMENTS.md` §Forecast (FCT-01..07) — authoritative REQ descriptions for all 7 requirements this phase owns.
- `.planning/ROADMAP.md` Phase 3 — goal statement + 5 success criteria.

### Research (consulted during phase design)
- `.planning/research/PITFALLS.md` §Pitfall 3 (forecast that looks confident but is statistical noise — prediction intervals, n shown, hard floor at n<5, beat seasonal naïve OR ship it labeled, no decimal inflation, calibrate visually with bands), §Pitfall 8 (data gaps that break forecasts silently — distinguish missing vs zero, gap-aware aggregation reports "based on N of M days"), §Performance Traps (precompute forecasts in nightly job; never live-compute), §Technical Debt Patterns (point estimates without intervals = "Never" — ship intervals from day one).
- `.planning/research/ARCHITECTURE.md` §Pattern 3 (Precompute Aggregates, Read Cheap — forecast computation lives in nightly job, UI does cheap key-lookup), §Forecast Engine (pure-math module, batch job rebuilds forecasts table after each successful scrape, no I/O except via DAL), §Critical Contracts (`Forecast` shape consumed by UI).
- `.planning/research/FEATURES.md` §Statistical projection with confidence bands (refusing to predict is a feature), §Anti-features (no ML/black-box, no fake precision like "73.4% chance"), §Same-week-last-year overlay (deferred to v1.x).
- `.planning/research/STACK.md` — better-sqlite3 12.9 (in-process synchronous reads make recompute trivial), no Drizzle for v1 (raw prepared statements throughout DAL), Vitest fixtures pattern.

### Phase 1 artifacts Phase 3 builds on
- `.planning/phases/01-ingest-store/01-CONTEXT.md` — Schema invariants Phase 3 inherits: `catch_reports` columns + UNIQUE upsert key (D-01..D-06), `scrape_runs` outcome enum (D-04) used for gap detection (D-24), idempotent-upsert discipline.
- `src/lib/db/migrations.ts` — Where the new `forecasts` table DDL is appended. Existing tables remain untouched; migrations are idempotent.
- `src/lib/db/catchReports.ts` — Source-of-truth single-table repo for the input data Phase 3 reads to compute forecasts.
- `src/lib/db/scrapeRuns.ts` — `latestSuccessOrEmpty` + outcome-by-date queries used by D-24's gap accounting.
- `src/lib/scraper/pipeline.ts` — `scrapeDate(today)` is the function whose return value gates the recompute call in `_scrapeTick`. No changes to pipeline.ts itself.
- `src/lib/server/scheduler.ts` — `_scrapeTick` is where the `recomputeForecasts(today)` call is appended (D-13). The non-fatal try/catch SLA pattern is the model to copy.
- `src/lib/server/logger.ts` — `tickLogger.child({ job: 'forecast-recompute' })` for correlation; same pino discipline as Phase 1.
- `src/lib/shared/dates.ts` — `today()` for the past-vs-future split (D-21), `addDays()` for the precompute window edge.
- `scripts/backfill.ts` — Phase 1 CLI gains a final-step recompute call (D-17). New `scripts/forecasts-rebuild.ts` (D-18) follows the same tsx + parseArgs pattern.

### Phase 2 artifacts Phase 3 extends
- `.planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md` — D-08 (weighted yield = SUM/SUM, the metric Phase 3 reuses for forecasts), D-09 (n_trips = COUNT DISTINCT trips, the sample-size definition), D-13/D-14 (heatmap behavior + n<5 gray rule that Phase 3 forecast cells inherit), D-15 (the data-shape interface Phase 3 must keep stable — `{date, value, n}`), D-16 (PerAnglerMetric contract Phase 3 extends with `kind`), D-29 (cache-control headers Phase 3 keeps unchanged), D-32 (Chart component contract Phase 3 reuses unchanged).
- `src/lib/db/queries/tripPicker.ts` — `heatmapForQuery` stays the past-cell source in the hybrid composition (D-21); `rankBoatsForQuery` is unchanged (rankings stay historical).
- `src/lib/db/queries/browse.ts` — `distinctSpecies`, `distinctTripTypes` provide the iteration set for the recompute (D-15).
- `src/routes/picker/+page.server.ts` — Loader file extended with the hybrid past/future heatmap composer (D-21) + the >30-day-horizon branch (D-10).
- `src/routes/picker/heatmapOption.ts` — `buildHeatmapOption` tooltip formatter extended (not replaced) per D-22.
- `src/lib/components/PerAnglerMetric.svelte` — Extended with `kind` prop per D-25; per-angler-discipline lint allowlist unchanged (D-26).
- `src/lib/components/Chart.svelte` — Reused unchanged; ECharts `use([…])` already includes `HeatmapChart`, `CalendarComponent`, `VisualMapComponent`.
- `src/lib/copy/metrics.ts` — Single source of truth for `fish/angler` strings; Phase 3 may add a `FORECAST_LABEL = 'forecast'` constant if the inline label appears in >1 place.
- `src/routes/about/+page.svelte` — Extended with the Forecasts section per D-29; existing per-angler section already references "in Phase 3 we add forecast projections" — Phase 3 fulfills that promise.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`_scrapeTick` in `src/lib/server/scheduler.ts`** — already correctly gate-ordered (kill switch → ping start → scrape → ping success/fail) with non-fatal try/catch SLA pattern (Phase 1 D-23..D-25). Phase 3 appends `recomputeForecasts(today)` inside the same try-catch discipline.
- **`getDb()` singleton in `src/lib/db/client.ts`** — Phase 3 forecast DAL + queries use this exactly like every other DAL module. WAL mode + synchronous=NORMAL pragmas inherited.
- **`runMigrations()` in `src/lib/db/migrations.ts`** — idempotent on every boot; Phase 3 appends `CREATE TABLE IF NOT EXISTS forecasts (…)` + indexes to `SCHEMA_SQL`. No version bump needed.
- **`heatmapForQuery` + `buildHeatmapOption`** — Phase 2's heatmap rendering surface is already clean: query → `{date, value, n}[]` → ECharts option. Phase 3 adds a sibling query (`forecastHeatmapForQuery`) returning the same shape; the tooltip formatter is the only buildHeatmapOption part that needs branching for forecast cells.
- **`PerAnglerMetric.svelte`** — already disciplined (auto-detects framing context, integer/one-decimal branching, low-data badge, single source of truth for the `fish/angler` literal). Adding `kind: 'forecast'` is a contained extension.
- **`scrape_runs` ledger + outcome enum** — D-24's gap-day accounting reads from this directly. Phase 1 already covers the "tried + empty" vs "tried + failed" vs "never tried" semantics needed.
- **`distinctSpecies` + `distinctTripTypes` in `src/lib/db/queries/browse.ts`** — Phase 3 iterates over their cross-product to enumerate the cells to recompute (D-15).
- **`scripts/backfill.ts` tsx pattern** — Phase 1 `parseArgs` + `getDb()` + scrape loop pattern is the template `scripts/forecasts-rebuild.ts` (D-18) follows.
- **Vitest fixture pattern + `seedTestDb` helper** — Plan 02-01 helper already supports building a synthetic `catch_reports` set; Phase 3 forecast tests reuse it directly.

### Established Patterns
- **DAL = only SQL surface** (CLAUDE.md / STO-03) — `src/lib/forecast/compute.ts` MUST NOT issue SQL; it calls into `src/lib/db/forecasts.ts` + `src/lib/db/catchReports.ts` only. Forecast tests verify this via the existing DAL-boundary lint pattern (if any), or by static review.
- **Idempotent upsert via UNIQUE index** (Phase 1 D-06) — `forecasts.UNIQUE(forecast_date, species, trip_type)` is the upsert key; nightly recompute is a single `INSERT ON CONFLICT DO UPDATE` per cell (or batched). Same pattern as `catch_reports`.
- **Single date producer** (Phase 1 D-14, STO-04) — every `YYYY-MM-DD` in Phase 3 (forecast_date column writes, today/future split in heatmap composer, precompute window edges) goes through `src/lib/shared/dates.ts`.
- **Pure-math modules + DAL injection** — `src/lib/scraper/parser.ts` is the model: pure function, no DAL imports, fully unit-testable. `src/lib/forecast/compute.ts` follows the same shape — DAL handles arrive via parameters, not module-scope imports.
- **Logger correlation** — Forecast recompute logs under `logger.child({ job: 'forecast-recompute', jobId: <run uuid> })` so the nightly tick has a coherent trace from scrape → SLA → forecast.
- **Cache-control via `setHeaders` in `+page.server.ts`** (Phase 2 D-29) — Phase 3 hybrid heatmap composition adds no new cache headers.

### Integration Points
- **DB migration** — `src/lib/db/migrations.ts` `SCHEMA_SQL` constant gets the `forecasts` table DDL appended; no separate migration file in v1 (matches Phase 1 + Phase 2 convention).
- **Scheduler tick** — `src/lib/server/scheduler.ts` `_scrapeTick` body gains one new try-catch block calling `recomputeForecasts(today())` after the SLA check, before `pingHealthcheck('success')`.
- **Picker route** — `src/routes/picker/+page.server.ts` `load()` updated to compose past/future heatmap cells (D-21); add the >30-day-horizon branch (D-10) before computing `heatmapEnd`.
- **Heatmap option builder** — `src/routes/picker/heatmapOption.ts` `buildHeatmapOption` tooltip formatter extended (not replaced) per D-22; the `HeatmapCell` type may grow optional fields, or a new `ForecastHeatmapCell` interface in `forecastHeatmap.ts` is what the loader actually emits — planner decides.
- **PerAnglerMetric** — `src/lib/components/PerAnglerMetric.svelte` extended with `kind` + optional `pi` props (D-25). Existing call sites (`/`, `/date/[date]`, `/picker`, `/boats/[id]`, `/compare`, `/trends`) all default to `kind='historical'` and need no changes; `/picker`'s heatmap forecast cells get `kind='forecast'` explicitly.
- **About page** — `src/routes/about/+page.svelte` Forecasts section appended (D-29). The existing Phase 2 placeholder paragraph ("In Phase 3 we add forecast projections, and we will refuse to render a point [...]") is replaced/extended with the real explanation.
- **Scripts directory** — `scripts/backfill.ts` extended (D-17); `scripts/forecasts-rebuild.ts` (D-18) + `scripts/forecast-benchmark.ts` (D-19) added.

</code_context>

<specifics>
## Specific Ideas

- **"forecast" inline label is verbatim** — never "prediction" or "projection" or "estimate" in PerAnglerMetric/heatmap UI; the source of truth is one constant (planner adds to `src/lib/copy/metrics.ts` if it appears more than once).
- **"based on N of M days" is verbatim** — gap annotation copy stays exactly that wording so PITFALLS §8 is unambiguously fulfilled.
- **"not enough history" is verbatim** — n<5 refusal copy matches PITFALLS §3 wording exactly. Same string used in the heatmap tooltip and PerAnglerMetric.
- **"horizon too far — historical data only"** — verbatim message for >30-day target dates in the picker heatmap area (FCT-07).
- **Prediction interval is the empirical 80% PI** — not 95%, not 50%. 80% is the "honest middle" — wide enough to be visible, narrow enough to be useful. Documented in `/about`.
- **Integer-only display for forecast cells** (CLAUDE.md non-negotiable #3) — no decimals ever in forecast values, even when the underlying REAL is e.g. 8.7. Applies to point estimate AND PI bounds.
- **Past = actuals, future = forecast** — visual separation in the heatmap is implicit (past cells use the same viridis scale on actual data; future cells use the same scale on forecast data; gray uniformly applies to n<5 in both). Tooltip copy distinguishes them ("8 fish/angler" vs "forecast: 8 fish/angler [4–12]").
- **Per-angler framing carries to forecasts** — every forecast number is still "derived boat-aggregate average" with all the Phase 2 D-16/D-17 framing. Forecasts don't get a free pass on the framing rule just because they're projections.

</specifics>

<deferred>
## Deferred Ideas

- **Per-boat forecasts** — Heatmap is the single Phase 3 consumer (FCT-05); per-boat forecasts would multiply forecasts table cardinality by ~50 with no current consumer. Reconsider if a future phase needs per-boat forecast ranking on the picker (would supersede or augment Phase 2 D-08 ranking).
- **Continuous backtest cron** — PITFALLS §3 ideal but overkill at v1 scale. One-time `scripts/forecast-benchmark.ts` (D-19) suffices for FCT-04. Reconsider if the project grows beyond "shareable with friends."
- **Bayesian shrinkage / per-boat-mean shrunk toward fleet-mean** — would smooth thin-data per-boat forecasts. Skipped because per-boat forecasts themselves are deferred.
- **Bootstrap percentile intervals** — empirical-percentile (D-04) is simpler and has the same honest-under-sparse-data property at our scale. Reconsider if a benchmark shows poor PI calibration.
- **Quantile regression / GAMs for trend-aware forecasts** — would be a "model" in the FCT-04 sense vs the seasonal-naïve baseline. Out of scope for v1; documenting "we ship the baseline" is the point.
- **Same-week-last-year overlay on trends** (V1X-01 from Phase 2) — still deferred. Phase 3 forecasts table makes this trivially derivable later but doesn't ship the UI.
- **Confidence intervals (mean uncertainty) vs prediction intervals (observation uncertainty)** — Phase 3 ships prediction intervals only (the user-facing "what range will the next trip catch?"). Adding CIs alongside would clutter the UI without adding decision value.
- **Median or trimmed-mean forecast variant** (V1X-03 from Phase 2) — still deferred. Weighted mean is the v1 baseline; PIs already capture distribution shape.
- **Forecast freshness indicator** ("computed 4 hours ago") — `computed_at` is stored on every row; a UI label is trivially derivable but not required by FCT-01..07. Add if user feedback asks for it.
- **Smoothing across adjacent calendar days** (LOESS / kernel smoother on day-of-year) — would reduce the day-to-day noisiness of forecasts. Skipped because the ±7 day window already smooths implicitly.
- **Per-cell forecast diagnostics page** ("show me the trips that went into this number") — debugging surface; not a v1 user feature.
- **Email alert payload uses forecast values** — Phase 4 will decide whether ALT thresholds reference forecast or trailing actuals. Phase 3 doesn't preempt that choice.
- **Background recompute via worker thread** — the in-process recompute is bounded enough (~3,720 cells × bounded SQL aggregates) that a worker is unnecessary at v1 scale.

</deferred>

---

*Phase: 03-forecast-layer*
*Context gathered: 2026-04-25 (auto mode)*
