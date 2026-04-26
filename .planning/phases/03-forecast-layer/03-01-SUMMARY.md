---
phase: 03-forecast-layer
plan: 01
subsystem: database
tags: [sqlite, better-sqlite3, dal, forecasts, tdd, vitest]

# Dependency graph
requires:
  - phase: 01-ingest-store
    provides: SCHEMA_SQL constant, runMigrations idempotency, catchReports.upsertMany pattern, openTestDb helper
  - phase: 02-browse-trip-picker-trends
    provides: heatmap shape contract {date, value, n}, seedTestDb helpers
provides:
  - forecasts table in canonical schema (D-11) with UNIQUE upsert key
  - src/lib/db/forecasts.ts DAL repository (upsertMany, getCellsInRange, pruneBeforeHorizon, ForecastRow)
  - 6 Wave-0 test scaffolds in tests/forecast/ for downstream Wave-1 plans
affects:
  - 03-02-compute (consumes ForecastRow + upsertMany; populates forecasts table)
  - 03-03-picker-wiring (consumes getCellsInRange via forecastHeatmap query)
  - 03-04-scheduler-recompute (calls upsertMany via compute.recomputeForecasts)
  - 03-05-about-page (documents forecasts table semantics)
  - 03-06-benchmark (reads from forecasts for held-out validation)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DAL boundary: forecasts.ts injects db handle as parameter, no module-scope getDb()"
    - "Idempotent upsert via UNIQUE(forecast_date, species, trip_type) + ON CONFLICT DO UPDATE"
    - "Wave-0 scaffold pattern: empty describe + it.todo placeholders so downstream plans verify file existence"

key-files:
  created:
    - src/lib/db/forecasts.ts
    - tests/unit/db/forecasts.test.ts
    - tests/forecast/compute.test.ts
    - tests/forecast/heatmap-composer.test.ts
    - tests/forecast/horizon.test.ts
    - tests/forecast/gap-aware.test.ts
    - tests/forecast/year-boundary.test.ts
    - tests/forecast/percentile.test.ts
  modified:
    - src/lib/db/migrations.ts
    - tests/unit/db/migrations.test.ts

key-decisions:
  - "Followed catchReports.ts upsertMany pattern verbatim — single transaction, prepared statement with named bindings, ON CONFLICT DO UPDATE"
  - "pruneBeforeHorizon shipped as a v1 no-op stub returning 0 (D-16: past forecast rows retained indefinitely)"
  - "ForecastRow allows value/pi_low/pi_high to be null in TypeScript so D-07 n<5 cells round-trip cleanly through SQLite (REAL columns are nullable in SQL)"

patterns-established:
  - "Phase 3 DAL repos accept Database.Database as a parameter — same purity contract as scraper/parser.ts and matches CLAUDE.md DAL boundary rule"
  - "Wave-0 scaffolds use it.todo (not it.skip) so vitest reports them as 'todo' (pending) rather than 'skipped'; later waves remove the it.todo and write real assertions"

requirements-completed: [FCT-01]

# Metrics
duration: 5min
completed: 2026-04-26
---

# Phase 3 Plan 01: Wave-0 Schema + DAL + Test Scaffolds Summary

**forecasts table appended to canonical schema with idempotent UPSERT key, src/lib/db/forecasts.ts DAL repository (upsertMany/getCellsInRange/pruneBeforeHorizon stub), and 6 Wave-0 test scaffolds (27 it.todo placeholders) in tests/forecast/.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-26T19:36:01Z
- **Completed:** 2026-04-26T19:40:49Z
- **Tasks:** 3 (all completed)
- **Files modified:** 10 (8 created, 2 modified)

## Accomplishments

- forecasts table is now part of the canonical schema and survives a fresh `runMigrations()` boot, with `idx_forecasts_unique` enforcing the (forecast_date, species, trip_type) upsert key per D-11.
- DAL repository `src/lib/db/forecasts.ts` exposes `upsertMany` (idempotent batch via single transaction), `getCellsInRange` (range read ASC), and `pruneBeforeHorizon` (v1 no-op stub) — proven via 9 vitest cases including idempotency, NULL-value persistence (D-07), and date-range filtering.
- 6 Wave-0 scaffolds exist under `tests/forecast/` (compute, heatmap-composer, horizon, gap-aware, year-boundary, percentile) with 27 `it.todo` placeholders — downstream Wave-1 plans (03-02, 03-03) can now reference these files in their `<verify>` blocks without a "MISSING — Wave 0 must create {test_file}" annotation.
- Full vitest suite remains green: 384 passing + 27 todo + 0 failing across 50 files; no Phase 1 / Phase 2 regression.

## Task Commits

Each task was committed atomically:

1. **Task 1: Append forecasts table DDL to migrations.ts (D-11)** — `f968d08` (feat)
2. **Task 2 RED: Failing forecasts DAL tests** — `19262c7` (test)
3. **Task 2 GREEN: forecasts DAL repository** — `d13abb3` (feat)
4. **Task 3: Wave 0 forecast test scaffolds** — `01ea065` (test)

_Task 2 used the TDD RED → GREEN cycle; no REFACTOR commit was needed (the DAL matches catchReports.ts exemplar verbatim)._

## Files Created/Modified

**Created:**
- `src/lib/db/forecasts.ts` — DAL repository for the forecasts table; `ForecastRow` interface, `GetCellsArgs`, `upsertMany`, `getCellsInRange`, `pruneBeforeHorizon`.
- `tests/unit/db/forecasts.test.ts` — 9 vitest cases proving schema columns, idempotent upsert, NULL handling for n<5 cells, range filtering + ASC order, empty-result behavior, and `pruneBeforeHorizon` no-op.
- `tests/forecast/compute.test.ts` — Wave-0 scaffold owned by Plan 03-02 (FCT-01/02/03 compute math).
- `tests/forecast/heatmap-composer.test.ts` — Wave-0 scaffold owned by Plan 03-03 (D-21/D-34 hybrid past/future composer).
- `tests/forecast/horizon.test.ts` — Wave-0 scaffold owned by Plan 03-03 (FCT-07 >30-day branch).
- `tests/forecast/gap-aware.test.ts` — Wave-0 scaffold owned by Plan 03-02 (D-24 gap-day accounting).
- `tests/forecast/year-boundary.test.ts` — Wave-0 scaffold owned by Plan 03-02 (January year-wrap edge case).
- `tests/forecast/percentile.test.ts` — Wave-0 scaffold owned by Plan 03-02 (numpy "linear" percentile reference vectors).

**Modified:**
- `src/lib/db/migrations.ts` — appended forecasts DDL block (table + 2 indexes) to `SCHEMA_SQL` after `idx_parse_failures_run`. No version bump; idempotent IF NOT EXISTS guards.
- `tests/unit/db/migrations.test.ts` — extended idempotency assertion to include `forecasts` in the expected table list; added two new tests for forecasts table existence and the unique-index column ordering.

## Decisions Made

- **Idempotent upsert wired via UNIQUE(forecast_date, species, trip_type) index + ON CONFLICT DO UPDATE.** Chosen because the catchReports.ts pattern is the project's load-bearing convention and Phase 1 D-06 establishes idempotency as a non-negotiable invariant.
- **`pruneBeforeHorizon` shipped as a v1 stub returning 0.** Honors D-16 (past forecast rows retained indefinitely), preserves the function signature so a future retention policy doesn't require API changes.
- **Tests reference `getCellsInRange` even for assertions that could read SQL directly (e.g., the conflict-overwrite case).** This guarantees the upsert/read pair is exercised end-to-end, not just upsert-via-COUNT.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing migrations.test.ts idempotency assertion hardcoded the 5-table Phase 1 list**

- **Found during:** Task 1 verification (running `npx vitest run tests/unit/db/migrations.test.ts` after appending the forecasts DDL)
- **Issue:** `tests/unit/db/migrations.test.ts:109` asserted `expect(domain.sort()).toEqual(['boats', 'catch_reports', 'landings', 'parse_failures', 'scrape_runs'].sort())`. After Phase 3 added the `forecasts` table, the assertion failed because the actual table list contained 6 entries.
- **Fix:** Updated the expected array in the idempotency test to include `forecasts`, AND added two new positive tests covering Phase 3 invariants — `creates the Phase 3 forecasts table (D-11)` and `forecasts has UNIQUE index on (forecast_date, species, trip_type)`.
- **Files modified:** `tests/unit/db/migrations.test.ts`
- **Verification:** `npx vitest run tests/unit/db/migrations.test.ts` → 9 passed (up from 7 originally; the 7th was the failing assertion, now fixed; 2 additional Phase 3 cases were added).
- **Committed in:** `f968d08` (Task 1 commit, alongside the DDL append).

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in pre-existing test that became a regression once Phase 3 added the 6th table)
**Impact on plan:** Necessary — the test would have failed for any future contributor running the suite with the new schema. No scope creep; the fix preserved Phase 1's intent (idempotent migrations don't duplicate tables) while accommodating the documented Phase 3 schema growth.

## Issues Encountered

- The plan's `<verify>` block for Task 1 used a `node -e "require('./src/lib/db/migrations.ts')"` one-liner that won't work because the project is ESM TypeScript (better-sqlite3 import + relative `.ts` extension). Used the documented fallback path (`pnpm vitest run tests/unit/db/migrations.test.ts`) instead, substituting `npx vitest` because `pnpm` isn't installed in this environment. Functional outcome identical.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 1 (Plans 03-02 and 03-03) can now begin in parallel:

- **Plan 03-02 (compute layer)** — has the `ForecastRow` type to import, `upsertMany` to call, and 4 of the 6 Wave-0 scaffolds (compute, gap-aware, year-boundary, percentile) ready to fill in.
- **Plan 03-03 (picker wiring)** — has `getCellsInRange` for the new `forecastHeatmap` read query, and 2 Wave-0 scaffolds (heatmap-composer, horizon) ready to fill in.

No blockers. The DAL boundary is preserved (forecasts.ts contains all SQL; no SQL leaks into compute.ts or routes/loaders).

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: src/lib/db/forecasts.ts
- FOUND: src/lib/db/migrations.ts (modified)
- FOUND: tests/unit/db/forecasts.test.ts
- FOUND: tests/unit/db/migrations.test.ts (modified)
- FOUND: tests/forecast/compute.test.ts
- FOUND: tests/forecast/heatmap-composer.test.ts
- FOUND: tests/forecast/horizon.test.ts
- FOUND: tests/forecast/gap-aware.test.ts
- FOUND: tests/forecast/year-boundary.test.ts
- FOUND: tests/forecast/percentile.test.ts

**Commits verified:**
- FOUND: f968d08 (Task 1: DDL)
- FOUND: 19262c7 (Task 2 RED)
- FOUND: d13abb3 (Task 2 GREEN)
- FOUND: 01ea065 (Task 3: scaffolds)

---
*Phase: 03-forecast-layer*
*Completed: 2026-04-26*
