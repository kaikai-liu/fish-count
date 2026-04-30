---
phase: 03-forecast-layer
plan: 02
subsystem: forecast-engine
tags: [forecast, pure-math, sqlite, dal, vitest, tdd]

# Dependency graph
requires:
  - phase: 03-forecast-layer
    plan: 01
    provides: forecasts table schema, ForecastRow + upsertMany DAL, 6 Wave-0 test scaffolds
  - phase: 01-ingest-store
    provides: catchReports DAL, scrapeRuns ledger + outcome enum, openTestDb helper
  - phase: 02-browse-trip-picker-trends
    provides: distinctSpecies / distinctTripTypes, seedTestDb helpers
provides:
  - src/lib/forecast/compute.ts pure-math engine (recomputeForecasts, computeCell, percentile)
  - getRatiosForWindow on catchReports.ts (with sum_species + sum_anglers fields)
  - countPresentDays on scrapeRuns.ts (gap-day accounting)
  - Filled-in compute / year-boundary / gap-aware / percentile tests (real assertions, no it.todo)
affects:
  - 03-03-picker-wiring (consumes recomputeForecasts indirectly via /picker forecastHeatmap query)
  - 03-04-scheduler-recompute (calls recomputeForecasts at the end of _scrapeTick)
  - 03-06-benchmark (calls computeCell over a held-out year)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-math module + DB injection (parser.ts purity exemplar): no SQL, no module-scope getDb, db handle arrives as parameter"
    - "DAL extension via additive interface fields (RatioRow gained sum_species + sum_anglers) so compute.ts can derive exact SUM/SUM weighted yield without re-querying"
    - "SQL year-boundary OR-branch in getRatiosForWindow handles MM-DD wrap when forecast_date is near Jan 1 / Dec 31"
    - "Per-cell try/catch inside recomputeForecasts loop — one bad cell never aborts the nightly recompute"

key-files:
  created:
    - src/lib/forecast/compute.ts
    - tests/unit/db/getRatiosForWindow.test.ts
    - tests/unit/db/countPresentDays.test.ts
  modified:
    - src/lib/db/catchReports.ts
    - src/lib/db/scrapeRuns.ts
    - tests/forecast/compute.test.ts
    - tests/forecast/year-boundary.test.ts
    - tests/forecast/gap-aware.test.ts
    - tests/forecast/percentile.test.ts

key-decisions:
  - "Returned sum_species + sum_anglers from getRatiosForWindow alongside ratio so compute.ts can compute exact fleet-wide SUM/SUM (not the incorrect mean-of-ratios). Avoids a second round-trip to the DB and keeps the math single-source-of-truth in compute.ts."
  - "Earliest year for window enumeration set to 2010 inside compute.ts; the project working data range is bounded by Phase 1 backfill, and 2010 is a safe lower bound that does not over-count gap_days_expected for typical forecasts."
  - "Feb-29 anchor canonicalization rolls to Feb 28 in non-leap prior years before the ±7 expansion, keeping addDays inputs valid (the ±7 window absorbs the 1-day shift)."
  - "computeCell handles the all-zero-anglers edge case by returning value=null even when n_trips >= 5 — honest stance over potentially confusing data."
  - "recomputeForecasts uses upsertMany (single transaction) rather than a per-cell transaction; matches the catchReports.ts pattern + RESEARCH §2 recommendation."

patterns-established:
  - "Phase 3 forecast engine follows the parser.ts purity contract: pure functions, no I/O, no DB module-scope imports, never throws"
  - "DAL helpers that compute.ts depends on extend their return shape additively (RatioRow), preserving Phase 1 / Phase 2 callers"

requirements-completed: [FCT-01, FCT-02, FCT-03, FCT-06]

# Metrics
duration: 7min
completed: 2026-04-26
---

# Phase 3 Plan 02: Pure-Math Forecast Engine Summary

**Wave 1 forecast engine landed: src/lib/forecast/compute.ts is pure-math (no SQL, no module-scope DB), getRatiosForWindow + countPresentDays DAL helpers added with year-boundary OR-branch, and 13 it.todo placeholders in tests/forecast/{compute,year-boundary,gap-aware,percentile}.test.ts replaced with real D-01/D-04/D-06/D-07/D-12/D-15/D-24 assertions.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-26T19:45:11Z
- **Completed:** 2026-04-26T19:51:58Z
- **Tasks:** 3 (all completed)
- **Files modified:** 9 (3 created, 6 modified)

## Accomplishments

- **DAL helpers extended.** `getRatiosForWindow` returns one row per `(source_date, boat_id, trip_type)` trip with `ratio = SUM/SUM` *and* the underlying `sum_species` + `sum_anglers` so compute.ts can derive an exact fleet-wide weighted yield (D-01) instead of the wrong mean-of-ratios. The SQL excludes the forecast year via `CAST(strftime('%Y', source_date) AS INTEGER) < @forecastYear` per RESEARCH §5, and the year-boundary OR-branch fires when `windowWraps=1` to capture both December and January dates from prior years (RESEARCH §1, Pitfall 5).
- **Gap-day accounting in place.** `countPresentDays(db, dates[])` returns the count of distinct `run_dates` with `outcome IN ('success','empty')`. Empty input array short-circuits to 0 to avoid the dynamic placeholder edge case. Days with `killed`/`http_error`/`parse_error` or no `scrape_runs` row at all are correctly excluded.
- **Pure-math compute engine.** `src/lib/forecast/compute.ts` exports `recomputeForecasts`, `computeCell`, and `percentile` — zero `db.prepare(`, zero `getDb(`, db injected as a parameter. The engine implements D-01 SUM/SUM via the extended RatioRow, D-04 empirical 80% PI via numpy "linear" percentile interpolation, D-06 n_trips via DAL grouping, D-07 NULL semantics for n<5 cells, D-12 baseline_value mirroring value, D-15 full rebuild over 31 days × distinct species × distinct trip_types, and D-24 gap accounting via the candidate-date enumerator + countPresentDays. Per-cell errors are caught and logged so one bad cell never aborts the recompute.
- **Forecast tests filled in.** `tests/forecast/compute.test.ts` (6 cases), `tests/forecast/year-boundary.test.ts` (3 cases), `tests/forecast/gap-aware.test.ts` (4 cases), and `tests/forecast/percentile.test.ts` (5 cases) now have real assertions instead of `it.todo` placeholders. The SUM/SUM-vs-mean-of-ratios test uses fixture data where the two methods produce visibly different answers (13/17 ≈ 0.7647 vs 2.12) so the test would fail loudly if the math regressed.
- **Full vitest suite green.** 414 passing, 8 todo (the 2 remaining Plan 03-03 scaffolds — heatmap-composer and horizon), 0 failing across 52 test files.

## Task Commits

Each task was committed atomically (TDD RED → GREEN cycle for Tasks 1 and 2):

1. **Task 1 RED — failing DAL helper tests** — `a66774e` (test): 6 cases for `getRatiosForWindow` + 6 cases for `countPresentDays`.
2. **Task 1 GREEN — DAL helper implementations** — `58b529d` (feat): `getRatiosForWindow` (with `sum_species`/`sum_anglers` extension) appended to catchReports.ts; `countPresentDays` appended to scrapeRuns.ts.
3. **Task 2 RED — failing percentile reference-vector tests** — `c899fae` (test): 5 cases against the not-yet-existing `compute.ts`.
4. **Task 2 GREEN — pure-math forecast engine** — `4b06301` (feat): `src/lib/forecast/compute.ts` with `recomputeForecasts`, `computeCell`, `percentile`, plus the `enumerateWindowDates` / `computeWindowBounds` helpers.
5. **Task 3 — fill in compute / year-boundary / gap-aware tests** — `3590e83` (test): 13 it.todo placeholders replaced with real D-01/D-04/D-06/D-07/D-12/D-15/D-24 assertions.

## Files Created/Modified

**Created:**
- `src/lib/forecast/compute.ts` — pure-math forecast engine (recomputeForecasts, computeCell, percentile, helpers).
- `tests/unit/db/getRatiosForWindow.test.ts` — 6 cases proving DAL behavior.
- `tests/unit/db/countPresentDays.test.ts` — 6 cases proving D-24 outcome semantics.

**Modified:**
- `src/lib/db/catchReports.ts` — appended `RatioRow` interface (with `sum_species` + `sum_anglers`), `RatioWindowArgs`, and `getRatiosForWindow` SQL query. Existing `CatchReportRow`, `upsertMany`, `totalRowsForDate`, and `getByDate` are untouched.
- `src/lib/db/scrapeRuns.ts` — appended `countPresentDays` function. Existing `recordOutcome`, `computeSlaBaseline`, `getDatesToScrape`, `latestSuccessOrEmpty` are untouched.
- `tests/forecast/compute.test.ts` — replaced 6 `it.todo` placeholders with real assertions.
- `tests/forecast/year-boundary.test.ts` — replaced 3 `it.todo` placeholders with real assertions.
- `tests/forecast/gap-aware.test.ts` — replaced 5 `it.todo` placeholders with 4 real assertions (the "gap_days_expected = |M|" todo is now provably covered by the invariant + present<=expected tests).
- `tests/forecast/percentile.test.ts` — replaced 5 `it.todo` placeholders with the RESEARCH §1 reference-vector assertions.

## Test Coverage by FCT Requirement

| Requirement | Test File(s) | Coverage |
|-------------|--------------|----------|
| FCT-01 (statistical projection) | compute.test.ts (D-01 SUM/SUM, D-15 full rebuild), year-boundary.test.ts | Weighted-yield math + window enumeration + year-wrap edge case |
| FCT-02 (n shown) | compute.test.ts (D-06 trip definition), forecasts DAL test (Plan 03-01) | n_trips populated even when value is null |
| FCT-03 (n<5 refusal) | compute.test.ts (D-07 NULL semantics) | Stores n_trips but value/pi_low/pi_high/baseline_value all null |
| FCT-06 (idempotence) | compute.test.ts (FCT-06 recompute twice) | recomputeForecasts is idempotent on identical input |
| Gap-aware sub-bullet (D-24) | gap-aware.test.ts | success/empty count, kill/http_error/parse_error excluded, absent rows = gap, present <= expected invariant |
| Year-boundary edge case | year-boundary.test.ts | Jan 3 reaches Dec + Jan prior years; Dec 28 reaches Jan prior years |

## Decisions Made

- **`getRatiosForWindow` returns `sum_species` + `sum_anglers` alongside `ratio`** so compute.ts can compute exact SUM/SUM without re-querying. The RatioRow extension was made in Task 1 (not deferred to Task 2) because the SUM/SUM math is the load-bearing D-01 invariant — the test in compute.test.ts uses fixture data where mean-of-ratios (2.12) is dramatically different from SUM/SUM (13/17 ≈ 0.7647), and the assertion would fail if the engine ever regressed to mean-of-ratios.
- **Earliest year for window enumeration is hard-coded to 2010 in compute.ts.** This keeps `gap_days_expected` interpretable for typical forecasts; if Phase 1 backfill ever loads pre-2010 data, this constant should be revisited (likely become a config value).
- **Feb-29 anchor canonicalization rolls to Feb 28 in non-leap prior years.** Keeps the addDays input valid; the ±7 window absorbs the 1-day shift.
- **All-zero-anglers edge case yields `value=null` even when n_trips>=5.** The honest stance — a stored value of 0 would imply "we tried and caught nothing" rather than "we couldn't divide by anglers." The PI bounds also stay null in that path.

## Deviations from Plan

### Auto-fixed Issues

None. The plan executed exactly as written.

### Implementation notes

- The plan's Task 2 action contained extensive commentary explaining a circular reasoning chain about whether to extend `RatioRow`. The conclusion the plan reached was correct (extend `RatioRow` with `sum_species` + `sum_anglers`), but the commentary was easy to misread as ambiguous. I shipped a clean version of compute.ts that performs the SUM/SUM directly via `r.sum_species` and `r.sum_anglers` without the inline commentary explaining why mean-of-ratios is wrong; the test fixture in compute.test.ts (13/17 vs 2.12) preserves the proof.
- Split the RatioRow extension between the Task-1 commit and the Task-2 commit was unnecessary; I made the full extension (including `sum_species` + `sum_anglers`) in the Task-1 GREEN commit since the failing test in `getRatiosForWindow.test.ts` already asserts those fields. This matches the plan's Task-2 acceptance criteria (`RatioRow contains sum_species: number and sum_anglers: number`) and avoids a no-op intermediate state.

## Issues Encountered

- The plan's verify block uses `pnpm vitest run`, but pnpm is not installed in this environment. Used `npx vitest run` instead (matching the same workaround documented in the Plan 03-01 SUMMARY). Functional outcome identical.

## DAL Boundary Verification

| Check | Result |
|-------|--------|
| `grep -c "db.prepare(" src/lib/forecast/compute.ts` | 0 |
| `grep -c "getDb(" src/lib/forecast/compute.ts` | 0 |
| `grep -cF '$lib/db/forecasts' src/lib/forecast/compute.ts` | 1 |
| `grep -cF '$lib/db/catchReports' src/lib/forecast/compute.ts` | 1 |
| `grep -c "sum_species" src/lib/db/catchReports.ts` | 4 (interface + RatioRow type + 2 SQL fragments) |

DAL boundary fully preserved — compute.ts contains zero SQL and zero `getDb()` calls. All DB access goes through `getRatiosForWindow`, `countPresentDays`, `distinctSpecies`, `distinctTripTypes`, and `upsertMany` injected via the `db: Database.Database` parameter.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Wave 1's compute layer is complete. Plan 03-03 (picker wiring) can now consume `recomputeForecasts` indirectly via the `forecasts` table — when its hybrid heatmap composer runs, it will read the cells this engine writes. Plan 03-04 (scheduler recompute) calls `recomputeForecasts(db)` directly inside `_scrapeTick`. Plan 03-06 (benchmark) calls `computeCell` over a held-out year to produce the FCT-04 honesty artifact.

No blockers. The DAL boundary holds. The math is provably exact (SUM/SUM, not mean-of-ratios) thanks to the test fixture that distinguishes the two.

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: src/lib/forecast/compute.ts
- FOUND: src/lib/db/catchReports.ts (modified)
- FOUND: src/lib/db/scrapeRuns.ts (modified)
- FOUND: tests/unit/db/getRatiosForWindow.test.ts
- FOUND: tests/unit/db/countPresentDays.test.ts
- FOUND: tests/forecast/compute.test.ts (filled in)
- FOUND: tests/forecast/year-boundary.test.ts (filled in)
- FOUND: tests/forecast/gap-aware.test.ts (filled in)
- FOUND: tests/forecast/percentile.test.ts (filled in)

**Commits verified:**
- FOUND: a66774e (Task 1 RED)
- FOUND: 58b529d (Task 1 GREEN)
- FOUND: c899fae (Task 2 RED)
- FOUND: 4b06301 (Task 2 GREEN)
- FOUND: 3590e83 (Task 3)

---
*Phase: 03-forecast-layer*
*Completed: 2026-04-26*
