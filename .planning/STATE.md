---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: ready_to_plan
stopped_at: Phase 03-forecast-layer complete (all 6 plans done; FCT-01..07 + FCT-04 honesty artifact landed)
last_updated: "2026-04-26T20:39:07.068Z"
last_activity: 2026-04-26
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 29
  completed_plans: 28
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-22)

**Core value:** Given a date (or range) and a target species, help an angler pick the charter boat with the best historical odds.
**Current focus:** Phase 03 — forecast-layer

## Current Position

Phase: 4
Plan: Not started
Status: Ready to plan
Last activity: 2026-04-26

Progress: [██████████] 97%

## Performance Metrics

**Velocity:**

- Total plans completed: 22
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| — | — | — | — |
| 01 | 9 | - | - |
| 02 | 7 | - | - |
| 03 | 6 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 03 P01 | 5min | 3 tasks | 10 files |
| Phase 03 P02 | 7min | 3 tasks | 9 files |
| Phase 03 P03 | 9min | 2 tasks | 5 files |
| Phase 03 P04 | 6min | 3 tasks | 6 files |
| Phase 03 P05 | 7min | 3 tasks | 6 files |
| Phase 03 P06 | 5min | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 0 precedes Phase 1 — no scraping into the cloud without billing alerts, kill switch, dead-man's switch, and Litestream backups in place.
- Backfill is a Phase 1 exit criterion (not a v2 follow-up) so the forecast layer has real history to chew on.
- Credibility guardrails ship with the surfaces they protect: per-angler framing with Phase 2, forecast honesty (PI + n + refusal) with Phase 3, email anti-abuse + deliverability with Phase 4.
- Followed catchReports.ts upsertMany pattern verbatim — single transaction, prepared statement with named bindings, ON CONFLICT DO UPDATE
- pruneBeforeHorizon shipped as v1 no-op stub returning 0 (D-16: past forecast rows retained indefinitely)
- Returned sum_species + sum_anglers from getRatiosForWindow alongside ratio so compute.ts derives exact fleet-wide SUM/SUM (not mean-of-ratios)
- Pure-math forecast engine follows parser.ts purity contract: no SQL, no module-scope getDb, db handle injected as parameter; per-cell try/catch in recomputeForecasts means one bad cell never aborts the nightly recompute
- Phase 3 hybrid heatmap composer: past cells from heatmapForQuery (catch_reports) + today/future cells from forecastHeatmapForQuery (forecasts), merged by date. Single today() call per request feeds both horizon check and split (RESEARCH §4).
- FCT-07 horizon gate: when target_date - today > 30, /picker returns horizonTooFar:true with heatmap:null and the verbatim message 'horizon too far — historical data only'; rankings continue to render (historical actuals are unaffected by the cap).
- forecastHeatmapForQuery preserves Phase 2 D-15 shape contract ({date, value, n}) so buildHeatmapOption needs only a tooltip-formatter branch (Plan 03-04), not a rendering rewrite. Additive fields (pi_low, pi_high, gap_present, gap_expected) discriminate forecast-vs-actual at tooltip time via 'pi_low' in cell.
- Phase 3 forecast UI surfaces locked: PerAnglerMetric kind='historical'|'forecast' with /about#forecasts anchor; heatmap tooltip formatter discriminates via 'pi_low' in cell; verbatim copy constants (FORECAST_LABEL, NOT_ENOUGH_HISTORY, PI_LABEL) live in src/lib/copy/metrics.ts as single source of truth
- /about page Forecasts section anchored at #forecasts documents the seasonal-naïve baseline, 80% PI, n<5 refusal, 30-day horizon cap, gap-aware aggregation, and benchmark validation — fulfills CLAUDE.md non-negotiable #3 'beat seasonal-naïve OR ship the baseline labeled' on the user-visible side
- PerAnglerMetric kind defaults to 'historical' so all 7+ Phase 2 callers (/, /date/[date], /picker, /boats/[id], /compare, /trends, BoatCard) keep working without changes; only future /picker forecast-cell wiring opts into kind='forecast' explicitly
- Phase 3 FCT-06 wired in three places: _scrapeTick inline (success/empty gate, non-fatal try/catch), scripts/backfill.ts final step, and scripts/forecasts-rebuild.ts ad-hoc operator CLI. Recompute failure never blocks pingHealthcheck('success') — OPS-04 owns ingestion liveness; forecast pipeline is a secondary tripwire.
- vi.doMock with $lib alias paths must use the alias specifier the consumer imports with, not the equivalent relative path. Relative-path mocks for $lib aliases silently fall through to the real module. Recorded as a pattern for future tests.
- scripts/forecasts-rebuild.ts deliberately omits --from / --to range flags per RESEARCH §9. Operator use case is 'fix it now', full window is bounded (~3,720 cells) and idempotent (UPSERT). Range mode would be a YAGNI flag.
- Plan 03-06 ships forecast-benchmark CLI as the FCT-04 honesty artifact: tsx-runnable script comparing seasonal-naïve baseline vs fleet-mean baseline on a held-out year, reporting MAE / median absolute error / 80% PI coverage, with all SQL routed through src/lib/db/queries/benchmark.ts to preserve DAL boundary.
- Did NOT inline dev-fixture benchmark numbers into /about — synthetic round-robin replay produces unrealistically smooth distributions; Status note in 03-VALIDATION-BENCHMARK.md flags the dev-fixture origin and points operators at production rerun.

### Pending Todos

None yet.

### Blockers/Concerns

- Source TOS + robots.txt still need written review — this is a Phase 1 prerequisite (blocking first production scrape).
- Hosting finalization (Fly.io vs Render vs VPS) — to be decided inside Phase 0.
- Forecast method (bootstrap PI vs log-t) — Phase 3 picks and documents.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-04-26T20:39:07.065Z
Stopped at: Phase 03-forecast-layer complete (all 6 plans done; FCT-01..07 + FCT-04 honesty artifact landed)
Resume file: None

**Planned Phase:** 03 (forecast-layer) — 6 plans — 2026-04-26T18:49:59.158Z
