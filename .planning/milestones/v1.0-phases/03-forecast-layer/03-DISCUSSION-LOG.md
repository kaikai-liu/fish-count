# Phase 3: Forecast Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 03-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 03-forecast-layer
**Mode:** auto (recommended defaults selected without interactive questions)
**Areas discussed:** Forecast model, Aggregation grain, Prediction interval, n<5 policy, Horizon cap, Forecasts table schema, Recompute trigger, Recompute scope, Backfill integration, Heatmap recolor wiring, Integer rounding, Gap annotation, Past-row retention, FCT-04 benchmark, PerAnglerMetric variant, >30-day horizon UX, Module placement, About page update

---

## Forecast model (FCT-01, FCT-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Seasonal-naïve weighted-yield baseline (±7 days × all prior years) | Same-DOY ±7 day window, all prior years, weighted SUM/SUM yield. Distribution-free, transparent, ships labeled as the baseline per ROADMAP criterion #2. | ✓ |
| Bayesian shrinkage per (boat, species, trip_type) | Shrinks per-boat means toward fleet-mean to stabilize thin data. Adds a hyperparameter; per-boat forecasts deferred anyway. | |
| Time-decay weighted mean (recent years weighted more) | Recency-weighted seasonal mean. Adds a decay parameter without empirical justification at v1 scale. | |
| Quantile regression / GAM | A "real model" beyond the baseline. Higher complexity; PROJECT.md anti-features bar ML. | |

**User's choice:** Seasonal-naïve weighted-yield baseline (auto-selected).
**Notes:** ROADMAP success criterion #2 explicitly permits "the baseline ships and is labeled as such." CLAUDE.md anti-features bar ML; transparent statistical projection is the design goal. The ±7 day window matches Phase 2 D-11 picker semantics and provides typical n≥5 coverage for in-season slots.

---

## Forecast aggregation grain (FCT-01, FCT-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Fleet-wide: (forecast_date, species, trip_type) | Single forecast per slot, no per-boat dimension. Heatmap-only consumer. | ✓ |
| Per-boat: (forecast_date, boat_id, species, trip_type) | Adds per-boat ranking via forecast. ~50× cardinality. | |
| Both | Maximum cardinality. | |

**User's choice:** Fleet-wide (auto-selected).
**Notes:** The only Phase 3 consumer is the heatmap (FCT-05); picker per-boat ranking continues using the Phase 2 D-08 historical metric. Per-boat forecasts deferred to a future phase if a consumer arises.

---

## Prediction interval method (PITFALLS §3)

| Option | Description | Selected |
|--------|-------------|----------|
| Empirical 10/90 percentiles of per-trip ratios | Distribution-free; honest under heavy-tailed catch data. | ✓ |
| Normal approximation (mean ± 1.28σ for 80% PI) | Cheap; assumes normality which catch counts violate. | |
| Bootstrap percentiles | Same answer at our scale; more compute. | |
| Point estimate only (no PI) | Rejected — contradicts CLAUDE.md non-negotiable #3. | |

**User's choice:** Empirical 10/90 percentiles (auto-selected).
**Notes:** 80% PI is the "honest middle" — wide enough to communicate uncertainty visibly, narrow enough to stay useful.

---

## n<5 storage policy (FCT-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Store all cells; n<5 sets value/PI to NULL | DAL never filters; UI decides render. Mirrors Phase 2 D-14 heatmap rule. | ✓ |
| Skip writing n<5 cells | Loader has to gap-fill; less symmetric with Phase 2 D-14. | |

**User's choice:** Store all cells with NULL value when n<5 (auto-selected).
**Notes:** Renders identically to Phase 2's "low data" gray cells; the heatmap option builder needs no new gray-cell branch.

---

## Horizon cap (FCT-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Precompute today..today+30; reject >30 in form | Hostile UX; breaks shareable URLs. | |
| Precompute today..today+30; render "horizon too far" message in heatmap area when target_date > today+30; rankings still compute on historical data | Less hostile; rankings still useful; URLs work. | ✓ |

**User's choice:** Accept >30-day target dates with explanatory message (auto-selected).
**Notes:** Picker rankings are historical-metric-based (D-08), so they remain meaningful regardless of forecast horizon. Only the heatmap is forecast-driven.

---

## Forecasts table schema (FCT-01)

**Auto-selected:** 11-column schema with `value` + `pi_low` + `pi_high` + `n_trips` + `baseline_value` + `gap_days_present` + `gap_days_expected` + `computed_at`, UNIQUE on `(forecast_date, species, trip_type)`. Idempotent UPSERT key matches Phase 1 D-06 discipline.

**Notes:** `baseline_value` column reserved (= `value` for v1 since shipped model IS baseline) so a future model swap doesn't require migration. Gap counts denormalized for cheap heatmap reads.

---

## Recompute trigger (FCT-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in `_scrapeTick` after scrapeDate, non-fatal try/catch | Single process, same correlation id as scrape. | ✓ |
| Separate cron tick at 23:30 PT | Decoupled but adds gating complexity (must check the day's scrape ran first). | |
| Inside `pipeline.ts::scrapeDate` | Couples scrape to recompute; harder to skip recompute selectively. | |

**User's choice:** Inline in `_scrapeTick` (auto-selected).
**Notes:** Mirrors the Phase 1 SLA pattern (D-23..D-25): non-fatal try/catch so a recompute failure never blocks `pingHealthcheck('success')`. OPS-04 owns "is ingestion alive."

---

## Recompute scope (FCT-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Full rebuild of today..today+30 × all species × all trip_types | ~3,720 cells, idempotent, simple. | ✓ |
| Affected-window (only cells whose input includes the new date) | Premature optimization at this scale. | |

**User's choice:** Full nightly rebuild (auto-selected).
**Notes:** Each cell is a single bounded SQL aggregate. Wall-clock cost is trivial; affected-window adds complexity without benefit.

---

## Backfill integration (FCT-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Backfill CLI recomputes at end + standalone forecasts-rebuild script | Operator gets immediate forecasts after backfill; ad-hoc rebuild for repair. | ✓ |
| Backfill leaves recompute to next nightly tick | Operator waits up to 24h to validate forecasts. | |

**User's choice:** Backfill recomputes + ad-hoc script (auto-selected).
**Notes:** Both share `src/lib/forecast/compute.ts` — math is single-source.

---

## Heatmap recolor wiring (FCT-05; preserves Phase 2 D-15 contract)

| Option | Description | Selected |
|--------|-------------|----------|
| Past cells (date < today) keep heatmapForQuery actuals; today/future cells use forecastHeatmapForQuery | Clean past=actuals/future=forecast split. Loader composes hybrid 30-cell array. | ✓ |
| All 30 cells from forecasts table (including past) | Forecasts displace facts for past dates. Loses honest "this is what happened" semantics for past cells. | |

**User's choice:** Hybrid past-actuals / future-forecasts (auto-selected).
**Notes:** Preserves Phase 2 D-15 shape contract. `buildHeatmapOption` tooltip formatter branches based on cell origin.

---

## Integer rounding (CLAUDE.md non-negotiable #3)

| Option | Description | Selected |
|--------|-------------|----------|
| Store REAL, round at display time | DB precision retained; UI policy in UI layer. | ✓ |
| Store INTEGER (round at write time) | Loses precision for any future re-aggregation. | |

**User's choice:** Store REAL, round at display (auto-selected).
**Notes:** Applies to point estimate AND PI bounds. Past-cell actuals continue to use Phase 2 D-16 one-decimal-max rule; only forecast cells flip to integer-only.

---

## Gap annotation (PITFALLS §8; ROADMAP criterion #5)

| Option | Description | Selected |
|--------|-------------|----------|
| Precompute gap_days_present + gap_days_expected per cell | Cheap denormalization; surfaces in tooltip + Why-this-boat panel. | ✓ |
| Compute gap fraction at request time | Adds query-time work; same answer. | |

**User's choice:** Precomputed gap counts (auto-selected).
**Notes:** Gap definition uses Phase 1 `scrape_runs` outcome enum: `success` and `empty` count as "had data"; missing rows or `killed`/`http_error`/`parse_error` count as gaps.

---

## Past forecast row retention

| Option | Description | Selected |
|--------|-------------|----------|
| Keep historical forecast rows indefinitely | Audit trail for FCT-04 + future "did we predict this?" introspection. | ✓ |
| Delete past forecast rows after rollover | Saves storage (negligible) but loses retrospective material. | |

**User's choice:** Retain indefinitely (auto-selected).
**Notes:** Past rows are never recomputed (D-16) so they stay frozen at the forecast made at the time.

---

## FCT-04 baseline benchmark

| Option | Description | Selected |
|--------|-------------|----------|
| One-time scripts/forecast-benchmark.ts → VALIDATION-BENCHMARK.md | Honesty artifact since shipped model = baseline. Compares seasonal-naïve vs naïve fleet-mean as a sanity check. | ✓ |
| Continuous backtest cron | Overkill at v1 scale. | |
| Skip benchmarking | Violates ROADMAP criterion #2's "or the baseline ships and is labeled as such" — labeling presupposes someone checked. | |

**User's choice:** One-time benchmark script (auto-selected).
**Notes:** Comparison is seasonal-naïve baseline vs naïve fleet-mean (no seasonality), since the shipped model IS the baseline. If seasonality is decisively worse than fleet-mean, planner reconsiders D-01.

---

## PerAnglerMetric forecast variant

| Option | Description | Selected |
|--------|-------------|----------|
| Extend PerAnglerMetric with kind: 'historical' \| 'forecast' prop | Single component, single per-angler-discipline lint allowlist. | ✓ |
| New ForecastMetric component | Duplicates framing logic; expands lint allowlist. | |

**User's choice:** Extend existing component (auto-selected).
**Notes:** Forecast branch rounds to integer, emits "forecast" inline label, optionally renders PI range.

---

## >30-day horizon UX (FCT-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Form-level rejection of target_date > today+30 | Hostile; breaks shareable URLs. | |
| Accept the date; render "horizon too far — historical data only" in heatmap area; rankings still compute | Less hostile; rankings stay meaningful. | ✓ |

**User's choice:** Accept-with-explanation (auto-selected).

---

## Module placement

**Auto-selected:** `src/lib/forecast/compute.ts` (pure math, no SQL) + `src/lib/db/forecasts.ts` (DAL repository) + `src/lib/db/queries/forecastHeatmap.ts` (cross-table read query). Mirrors `src/lib/scraper/` separation. Preserves CLAUDE.md DAL-boundary rule.

---

## /about page update (BRW-09 extension)

**Auto-selected:** Append a Forecasts section explaining baseline math, prediction intervals, n<5 refusal, 30-day horizon, gap-aware aggregation. Link to VALIDATION-BENCHMARK.md. PerAnglerMetric kind='forecast' anchors to `/about#forecasts`.

---

## Claude's Discretion (deferred to planner)

- Exact SQL form of percentile computation (SQLite has no native `percentile_cont`; planner picks SQL trick vs JS computation).
- Whether `recomputeForecasts(db)` runs as one transaction or per-cell (WAL mode makes either safe).
- Whether `distinctSpecies()`/`distinctTripTypes()` need a recency filter to avoid forecasting extinct labels.
- Whether `forecasts-rebuild.ts` accepts `--from`/`--to` or always rebuilds the full window.
- Exact tooltip copy for forecast cells (within constraints D-22/D-23/D-24).
- Whether `gap_days_expected` includes the year-of-forecast itself (default: exclude — past years only).

---

## Deferred Ideas

See 03-CONTEXT.md `<deferred>` section for full list. Highlights:

- Per-boat forecasts (no current consumer; would 50× cardinality)
- Continuous backtest cron (overkill at v1 scale)
- Bayesian shrinkage / time-decay weighting / quantile regression / GAMs (no shipped-model justification)
- Bootstrap PIs (empirical-percentile equivalent at our scale)
- Same-week-last-year trend overlay (V1X-01 from Phase 2)
- Median/trimmed-mean variant (V1X-03 from Phase 2)
- Forecast freshness indicator (computed_at exists; UI not required)
- Smoothing across adjacent calendar days (±7 window already smooths)
- Per-cell forecast diagnostics page
- Background recompute via worker thread (recompute is bounded)
