---
phase: 03-forecast-layer
plan: 03
subsystem: picker-route
tags: [forecast, picker, dal, heatmap, horizon, sveltekit, vitest, tdd]

# Dependency graph
requires:
  - phase: 03-forecast-layer
    plan: 01
    provides: forecasts table schema, ForecastRow + upsertMany DAL, Wave-0 scaffolds (heatmap-composer.test.ts, horizon.test.ts)
  - phase: 03-forecast-layer
    plan: 02
    provides: src/lib/forecast/compute.ts (recomputeForecasts populates the forecasts rows the new query reads)
  - phase: 02-browse-trip-picker-trends
    provides: heatmap shape contract {date, value, n} (D-15), heatmapForQuery (past actuals source), parsePickerFilters Zod gate, seedTestDb helpers
  - phase: 01-ingest-store
    provides: getDb singleton, openTestDb helper, src/lib/shared/dates.ts (today/addDays/daysBetween)
provides:
  - src/lib/db/queries/forecastHeatmap.ts — DAL read query (forecastHeatmapForQuery, ForecastHeatmapCell, ForecastHeatmapArgs)
  - /picker loader hybrid past/future heatmap composer (D-21 + D-34)
  - /picker loader >30-day horizon gate (D-10 / FCT-07)
  - Filled-in tests/forecast/heatmap-composer.test.ts (4 cases) and tests/forecast/horizon.test.ts (4 cases) — zero it.todo remaining
affects:
  - 03-04-tooltip-and-about (heatmapOption.ts tooltip formatter discriminates forecast cells via 'pi_low' in cell — depends on AnyHeatmapCell shape established here)
  - 03-05-scheduler-recompute (recomputeForecasts populates the rows this query consumes)
  - 03-06-benchmark (benchmark script reads from the forecasts table this query also reads)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DAL read query mirrors heatmapForQuery shape contract: first three fields (date, value, n) match Phase 2 D-15 verbatim; additive fields (pi_low, pi_high, gap_present, gap_expected) preserve forecast metadata for tooltip enrichment"
    - "Loader composer: single today() capture per request feeds BOTH horizon check and past/future split (RESEARCH §4 — DST-boundary safety)"
    - "AnyHeatmapCell union (HeatmapCell | ForecastHeatmapCell) — tooltip formatter discriminates by 'pi_low' in cell"
    - "Hybrid composer math: pastEnd = addDays(todayPt, -1); futureStart = todayPt; pastRangeEnd = min(pastEnd, heatmapEnd); futureRangeStart = max(heatmapStart, futureStart); guarded so empty ranges skip the DB call"
    - "Horizon gate uses daysBetween(todayPt, filters.date) > 30 — strict greater-than so today+30 is the boundary case (NOT horizonTooFar)"
    - "Vitest isolation pattern (mkdtempSync + DB_PATH + vi.resetModules + vi.doMock '$lib/shared/dates') mirrors phase2-routes.test.ts; mock today() BEFORE dynamic-importing the loader"

key-files:
  created:
    - src/lib/db/queries/forecastHeatmap.ts
    - tests/unit/db/queries/forecastHeatmap.test.ts
    - .planning/phases/03-forecast-layer/deferred-items.md
  modified:
    - src/routes/picker/+page.server.ts
    - tests/forecast/heatmap-composer.test.ts
    - tests/forecast/horizon.test.ts

key-decisions:
  - "Used the verbatim heatmapForQuery analog (Phase 2 D-15) for forecastHeatmapForQuery — first three fields (date/value/n) match exactly so /picker can merge actuals + forecasts into a single 30-cell array; tooltip formatter (Plan 03-04) is the only piece that needs branching"
  - "today() captured ONCE per request as todayPt — reused for both horizon check AND past/future split. Two reads inside one request can produce DST-boundary inconsistency (RESEARCH §4 + D-21)"
  - "Horizon gate uses strict daysBetween() > 30 — today+30 is the boundary (NOT horizonTooFar) per Plan acceptance criterion. This is asymmetric on purpose: forecasts table holds today..today+30, so target_date == today+30 still has a forecast row to render"
  - "Composer guards empty ranges (heatmapStart > pastEnd or futureRangeStart > heatmapEnd) so we never issue a query for an inverted date range — single short-circuit per branch keeps the DB cost the same as Phase 2's single-query loader"
  - "Test target_date in heatmap-composer test set to 2026-05-12 (3 days BEFORE mocked today=2026-05-15) so the 30-cell window 2026-05-12..2026-06-10 spans BOTH past actuals (2026-05-13) AND today/future forecasts (2026-05-15, 2026-05-20). Without this, the past trip falls outside the heatmap window and the test would assert against an absent cell."

patterns-established:
  - "Phase 3 reads-from-forecasts queries follow the heatmapForQuery template: select FROM forecasts (no JOIN to catch_reports — table is already aggregated); ORDER BY forecast_date ASC; named bindings only (T-03-12 SQL injection mitigation)"
  - "/picker loader hybrid pattern: one today() at the top, two parallel queries (heatmapForQuery for past, forecastHeatmapForQuery for future), merge by date in a Map<string, AnyHeatmapCell>, gap-fill the 30-cell array. Plan 03-04's tooltip formatter is the only consumer that needs to know cell origin."

requirements-completed: [FCT-05, FCT-07]

# Metrics
duration: 9min
completed: 2026-04-26
---

# Phase 3 Plan 03: Forecast Heatmap Read Query + /picker Hybrid Composer Summary

**FCT-05 and FCT-07 wired: src/lib/db/queries/forecastHeatmap.ts returns the same {date, value, n} shape as Phase 2's heatmapForQuery (with additive forecast metadata), and /picker's loader composes the 30-cell heatmap from past actuals + today/future forecasts on a single today() capture, with a >30-day horizon branch that returns the verbatim "horizon too far — historical data only" message while still rendering rankings.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-04-26T19:55:46Z
- **Completed:** 2026-04-26T20:04:23Z
- **Tasks:** 2 (all completed)
- **Files modified:** 5 (3 created, 2 modified — plus deferred-items.md tracker)
- **Commits:** 5 (RED → GREEN cycles for both tasks + 1 cosmetic literal-cleanup)

## Accomplishments

- **DAL read query landed.** `src/lib/db/queries/forecastHeatmap.ts` exports `forecastHeatmapForQuery(db, args)` returning `Array<{ date, value, n, pi_low, pi_high, gap_present, gap_expected }>` — first three fields match Phase 2 D-15 verbatim. Pure SELECT FROM forecasts (no JOIN — the table is already aggregated). Named bindings only (T-03-12 SQL injection mitigation). Filters BETWEEN inclusive on forecast_date, ASC by forecast_date.
- **/picker loader extended.** Single `const todayPt = today()` capture feeds BOTH the horizon check (`daysBetween(todayPt, filters.date) > 30`) AND the past/future split (RESEARCH §4 — avoids DST-boundary inconsistency within a request). Hybrid composer issues `heatmapForQuery` for the past slice (heatmapStart .. addDays(todayPt, -1)) and `forecastHeatmapForQuery` for the future slice (todayPt .. heatmapEnd), merges by date into a `Map<string, AnyHeatmapCell>`, and gap-fills the 30-cell array with `{ date, value: null, n: 0 }` for absent dates — same Phase 2 contract.
- **Horizon gate (FCT-07).** When `daysBetween(todayPt, filters.date) > 30`, the loader returns `horizonTooFar: true`, `heatmap: null`, and `heatmapHorizonMessage: 'horizon too far — historical data only'` (verbatim D-10 copy). Rankings continue to render (historical actuals are unaffected by the horizon cap). Boundary case `today + 30` is NOT horizonTooFar — the strict > comparison preserves the today..today+30 forecast window's edge.
- **Cache header unchanged (D-31).** `setHeaders({ 'cache-control': 'public, max-age=300' })` still fires for every response, regardless of horizon branch. The hybrid composition adds no new cache concerns — past cells are immutable once final; future cells refresh after each nightly recompute.
- **Tests filled in.** `tests/forecast/heatmap-composer.test.ts` (4 cases) and `tests/forecast/horizon.test.ts` (4 cases) — Wave-0 scaffolds with 8 `it.todo` placeholders are now real assertions. Plus `tests/unit/db/queries/forecastHeatmap.test.ts` (7 cases) for the new DAL.
- **Full vitest suite green.** 429 passing, 0 failing, 0 todo across 53 test files. No Phase 1 or Phase 2 regression.

## Task Commits

Each task used a TDD RED → GREEN cycle:

1. **Task 1 RED — failing forecastHeatmap shape-contract tests** — `72468d3` (test): 7 cases covering D-20 shape, D-15 contract preservation, D-07 NULL flow-through, BETWEEN inclusive filter, ASC ordering, species/trip_type filtering, and empty-array semantics.
2. **Task 1 GREEN — forecastHeatmapForQuery DAL** — `08c9b22` (feat): `src/lib/db/queries/forecastHeatmap.ts` exporting the function + types, with the verbatim PATTERNS §forecastHeatmap.ts SQL.
3. **Task 2 RED — fill in composer + horizon scaffolds (failing)** — `d537c3c` (test): 8 `it.todo` placeholders replaced with real assertions; tests fail until the loader is updated.
4. **Task 2 GREEN — /picker loader hybrid composer + horizon gate** — `e8f9335` (feat): updated imports, added AnyHeatmapCell union, replaced the heatmap composition block with the hybrid composer + horizon gate, extended return shape with horizonTooFar + heatmapHorizonMessage, and updated the early-exit guidance return for shape consistency.
5. **Cosmetic literal-cleanup** — `b5685c3` (chore): rewrote a comment that quoted the verbatim "horizon too far — historical data only" string so the plan's verification literal `grep -c == 1` is exact.

_REFACTOR commits not needed — both GREEN implementations matched the PATTERNS template verbatim._

## Files Created/Modified

**Created:**
- `src/lib/db/queries/forecastHeatmap.ts` — DAL read query for forecast cells; `ForecastHeatmapCell`, `ForecastHeatmapArgs`, `forecastHeatmapForQuery`. No JOIN to catch_reports.
- `tests/unit/db/queries/forecastHeatmap.test.ts` — 7 vitest cases proving shape contract preservation, NULL flow-through, range filtering, ordering, and empty semantics.
- `.planning/phases/03-forecast-layer/deferred-items.md` — tracks pre-existing svelte-check errors in route load() test files (137 errors across 14 files; same shape inherited by the new tests/forecast/*.test.ts; deferred to a Phase 5 polish refactor).

**Modified:**
- `src/routes/picker/+page.server.ts` — extended imports (forecastHeatmapForQuery, ForecastHeatmapCell, daysBetween), added AnyHeatmapCell union type, captured todayPt once, added horizon gate (D-10), replaced the 22-line gap-fill loop with the 47-line hybrid composer (D-21), extended the return shape with horizonTooFar + heatmapHorizonMessage, and updated the early-exit guidance return for shape consistency. The cache-control header, ranking logic, and Why-this-boat panel are unchanged.
- `tests/forecast/heatmap-composer.test.ts` — 4 `it.todo` placeholders replaced with real assertions covering D-21 past/future split (catch_reports vs forecasts), D-34 today() called once per request, and 30-cell gap-fill semantics.
- `tests/forecast/horizon.test.ts` — 4 `it.todo` placeholders replaced with real assertions covering D-10 verbatim message, today+30 boundary case (NOT horizonTooFar), and rankings-still-rendered when horizonTooFar.

## Test Coverage by Requirement

| Requirement | Test File(s) | Coverage |
|-------------|--------------|----------|
| FCT-05 (heatmap coloring driven by forecasts) | tests/unit/db/queries/forecastHeatmap.test.ts (7 cases), tests/forecast/heatmap-composer.test.ts (4 cases) | DAL shape contract + hybrid past/future composer |
| FCT-07 (30-day horizon cap) | tests/forecast/horizon.test.ts (4 cases) | >30 → verbatim message + heatmap null + rankings preserved; today+30 boundary still renders heatmap |
| D-15 contract preservation (Phase 2) | tests/unit/db/queries/forecastHeatmap.test.ts ('preserves Phase 2 D-15 shape' case) | First three fields date/value/n present in returned rows |
| D-20 (additive forecast metadata) | tests/unit/db/queries/forecastHeatmap.test.ts ('returns shape ... pi_low, pi_high, gap_present, gap_expected') | All seven fields present and correctly typed |
| D-07 (n<5 NULL flow-through) | tests/unit/db/queries/forecastHeatmap.test.ts ('n<5 cell ... null') | NULL value/pi_low/pi_high persist when n_trips<5 |
| D-21 (hybrid past/future composer) | tests/forecast/heatmap-composer.test.ts | Past cell from heatmapForQuery, future cell from forecastHeatmapForQuery, merged in 30-cell array |
| D-34 (today() called once per load) | tests/forecast/heatmap-composer.test.ts ('today() called once') | Counting mock asserts ≤2 calls inside the load body (defaultDate + todayPt) |
| D-10 (verbatim horizon message) | tests/forecast/horizon.test.ts ('heatmap area copy') | Exact string match |
| D-31 (cache header unchanged) | tests/integration/phase2-routes.test.ts (existing — still passes) | public, max-age=300 still fires |

## DAL Boundary Verification

| Check | Result |
|-------|--------|
| `grep -c "JOIN catch_reports" src/lib/db/queries/forecastHeatmap.ts` | 0 (no JOIN — forecasts table already aggregated) |
| `grep -c "FROM forecasts" src/lib/db/queries/forecastHeatmap.ts` | 1 |
| `grep -c "db.prepare(" src/routes/picker/+page.server.ts` | 0 (no SQL leak — DAL boundary preserved) |
| `grep -c "today()" src/routes/picker/+page.server.ts` | 2 (defaultDate + todayPt — exactly per plan acceptance) |
| `grep -c "horizon too far — historical data only" src/routes/picker/+page.server.ts` | 1 (verbatim, single occurrence — plan acceptance) |
| `grep -c "horizonTooFar" src/routes/picker/+page.server.ts` | 7 (>=3 — early-exit field, compute, guard, branch, return, comment x2) |

## Decisions Made

- **Forecast heatmap query has zero JOINs.** The forecasts table already holds (forecast_date, species, trip_type) → (value, n_trips, pi_low, pi_high, gap_*) aggregates from Plan 03-02's recompute. Joining to catch_reports would re-introduce the very recomputation D-03 precomputes; a flat SELECT FROM forecasts is the entire surface.
- **Single today() capture per request.** RESEARCH §4 calls this out explicitly: a long-running load() that re-reads today() during DST transitions can yield two different PT calendar dates in one request. The composer captures `todayPt` once at the top of the body and threads it through both the horizon check and the past/future split. The `today()` outside the load body (in `defaultDate: today()` filterOption) is unrelated — it's evaluated at module scope before the request body runs.
- **Strict `> 30` horizon comparison.** Boundary case `target_date == today + 30` is NOT horizonTooFar because the precompute window is `today..today+30` inclusive (D-09): there IS a forecast row for that day. `target_date > today + 30` is the first day with no forecast row, which is the honest place to flip to the message.
- **Composer math guards empty ranges.** When `heatmapStart > pastEnd` (target date is today/future), the past query is skipped entirely (`pastCells = []`). Similarly, when `futureRangeStart > heatmapEnd` (target date is far enough in the past that the entire 30-cell window is historical), the future query is skipped. This keeps DB cost equal to Phase 2's single-query loader for the common cases.
- **Test fixture target_date = today - 3 days.** The composer test mocks `today() == '2026-05-15'` and uses `target_date = '2026-05-12'` so the 30-cell window `2026-05-12..2026-06-10` spans both the past actual at `2026-05-13` AND the today/future forecast cells. With `target_date = '2026-05-15'` (the original plan example), the past actual at `2026-05-13` falls OUTSIDE the heatmap window and the test would assert against an absent cell — the fix preserves both the plan's mocked-today value and the past-actual seed semantics.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Composer test target_date placed past actual outside heatmap window**

- **Found during:** Task 2 GREEN verification (running `npx vitest run tests/forecast/heatmap-composer.test.ts`)
- **Issue:** The plan's example test snippet seeded a past trip at `2026-05-13` and used `target_date = '2026-05-15'`. The 30-cell heatmap window starts at the target date, so the window `2026-05-15..2026-06-13` does NOT include `2026-05-13`. The first composer test asserted `pastCell` was defined and failed with `expected undefined to be defined` — the seeded actual was outside the rendered window.
- **Fix:** Changed the composer test's target_date to `2026-05-12` so the 30-cell window `2026-05-12..2026-06-10` covers both the past actual at `2026-05-13` and today/future cells starting at the mocked `today=2026-05-15`. The intent of the test (past comes from heatmapForQuery, future comes from forecastHeatmapForQuery) is preserved.
- **Files modified:** `tests/forecast/heatmap-composer.test.ts`
- **Committed in:** `e8f9335` (Task 2 GREEN commit, alongside the loader changes)

### Cosmetic adjustments

- **Comment cleanup to satisfy verification grep literal.** The plan's `<verification>` block requires `grep -c "horizon too far — historical data only"` to return exactly 1. My initial GREEN commit had the literal twice — once at the assignment site and once in a comment quoting the value. The follow-up `b5685c3` commit rewrote the comment to "D-10 verbatim message" without changing semantics. This is purely a documentation hygiene tweak.

**Total deviations:** 1 auto-fixed (Rule 1 — test fixture date math bug). No architectural changes. No CLAUDE.md guardrail violations.

## Issues Encountered

- **Pre-existing svelte-check errors in route load() test files.** `npx svelte-check` reports 137 type errors across 14 files (including the existing `tests/integration/phase2-routes.test.ts` and the pre-existing `tests/unit/routes/{home,date,picker}.test.ts`). The errors all stem from `PageServerLoad`'s return type being `void | PageData`. My new tests inherit the same shape because they use the identical `mkdtemp + DB_PATH + dynamic-import` pattern. **This is pre-existing project state — not a regression.** Tracked in `.planning/phases/03-forecast-layer/deferred-items.md` for a future Phase 5 polish refactor (a shared `assertPageData<T>(result): T` helper would resolve all 137 errors at once).
- The plan's verify block uses `pnpm vitest run`; pnpm is not installed in this environment. Used `npx vitest run` instead (matching the same workaround documented in Plans 03-01 and 03-02 SUMMARYs). Functional outcome identical.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Plan 03-04 (PerAnglerMetric forecast variant + heatmapOption tooltip branch + /about Forecasts section) can now consume:

- `forecastHeatmapForQuery` returns the union-typed cells with `pi_low`/`pi_high`/`gap_present`/`gap_expected` so the tooltip formatter can discriminate via `'pi_low' in cell`.
- `/picker` loader emits `result.heatmap: AnyHeatmapCell[] | null` plus `result.horizonTooFar` and `result.heatmapHorizonMessage`. The Svelte page only needs to render the message in place of the calendar grid when `horizonTooFar`.
- Plan 03-05 (scheduler recompute) consumes `recomputeForecasts(db)` from Plan 03-02; the rows it writes are exactly the rows this query reads.

No blockers. The DAL boundary holds (no SQL leaked into the loader). The shape contract is preserved (Phase 2 buildHeatmapOption can already iterate over the 30-cell array; only the tooltip formatter needs to branch). The cache header is unchanged.

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: src/lib/db/queries/forecastHeatmap.ts
- FOUND: src/routes/picker/+page.server.ts (modified)
- FOUND: tests/unit/db/queries/forecastHeatmap.test.ts
- FOUND: tests/forecast/heatmap-composer.test.ts (filled in)
- FOUND: tests/forecast/horizon.test.ts (filled in)
- FOUND: .planning/phases/03-forecast-layer/deferred-items.md

**Commits verified:**
- FOUND: 72468d3 (Task 1 RED)
- FOUND: 08c9b22 (Task 1 GREEN)
- FOUND: d537c3c (Task 2 RED)
- FOUND: e8f9335 (Task 2 GREEN)
- FOUND: b5685c3 (cosmetic literal-cleanup)

---
*Phase: 03-forecast-layer*
*Completed: 2026-04-26*
