---
phase: 02-browse-trip-picker-trends
plan: "01"
subsystem: dal-queries
tags: [dal, queries, urlstate, dates, tdd]
dependency_graph:
  requires: [01-01, 01-02, 01-03, 01-04, 01-05, 01-06, 01-07, 01-08, 01-09]
  provides: [browse-queries, tripPicker-queries, boatDetail-queries, trends-queries, compare-queries, urlState, dates-helpers, seedTestDb]
  affects: [02-02, 02-03, 02-04, 02-05, 02-06, 02-07]
tech_stack:
  added: [echarts ^6.0.0, date-fns ^4.1.0]
  patterns: [DAL-cross-table-query, Zod-urlstate-parse-serialize, ISO-week-bucket, weighted-yield-SUM-over-SUM, optional-species-boatTrend]
key_files:
  created:
    - src/lib/db/queries/browse.ts
    - src/lib/db/queries/tripPicker.ts
    - src/lib/db/queries/boatDetail.ts
    - src/lib/db/queries/trends.ts
    - src/lib/db/queries/compare.ts
    - src/lib/shared/urlState.ts
    - tests/helpers/seedTestDb.ts
    - tests/unit/shared/dates.test.ts
    - tests/unit/db/queries/browse.test.ts
    - tests/unit/db/queries/tripPicker.test.ts
    - tests/unit/db/queries/boatDetail.test.ts
    - tests/unit/db/queries/trends.test.ts
    - tests/unit/db/queries/compare.test.ts
    - tests/unit/shared/urlState.test.ts
  modified:
    - src/lib/shared/dates.ts (8 new exports)
    - src/lib/db/scrapeRuns.ts (latestSuccessOrEmpty added)
    - src/lib/db/boats.ts (getByIdWithLanding added)
    - tests/unit/db/dal-boundary.test.ts (SCOPE_DIRS extended)
    - tests/unit/shared/dates-boundary.test.ts (SCOPE_DIRS extended)
    - package.json (echarts + date-fns added)
decisions:
  - "boatTrend accepts species?: string | undefined — two prepared statements (per-species vs all-species) rather than string concatenation to maintain SQL injection discipline"
  - "compareBoats uses positional ? placeholders for IN list (boatIds are integers validated by Zod, not user strings) — safe parameterization"
  - "Gap-filling missing trend/heatmap buckets is the route loader's responsibility, not the DAL module's — keeps the DAL pure"
  - "seedTestDb.ts uses upsertBoatsAndLandings (the Phase 1 batch upsert) to confirm idempotency in the helper itself"
  - "Boundary tests (dal + dates) SCOPE_DIRS extended to include src/routes + src/lib/components even though those dirs don't exist yet — protects Wave 2 plans from day 1"
metrics:
  duration_minutes: 11
  completed_date: "2026-04-25"
  tasks_completed: 3
  files_created: 14
  files_modified: 6
  tests_added: 107
  tests_total_after: 142
---

# Phase 2 Plan 01: DAL Query Foundation + URL State + Dates Helpers Summary

**One-liner:** Five cross-table SQLite query modules (browse, tripPicker, boatDetail, trends, compare) plus Zod-validated URL state parsing and 8 new date helpers, all with 107 new Vitest tests — the complete data foundation for all Phase 2 routes.

## Functions Exported Per Module

### src/lib/shared/dates.ts (extended)
- `addDays(s, n)` — UTC-safe calendar-day addition/subtraction on YYYY-MM-DD strings
- `daysBetween(a, b)` — signed integer day count between two date strings
- `clampDate(s, min, max)` — string-comparable clamp into [min, max]
- `isToday(s)` — provisional-badge rule (D-20): equality with today() in PT
- `isPast(s)` — cache-header rule (D-30): strictly before today()
- `isoWeekKey(s)` — ISO-week bucket key "YYYY-Www" matching strftime('%G-W%V')
- `monthKey(s)` — calendar-month bucket key "YYYY-MM" via string slice
- `toPtTimeLabel(iso)` — format ISO-8601 timestamp as "HH:MM PT" for "Last scraped at"

### src/lib/db/queries/browse.ts
- `getRowsForDate(db, date)` — BRW-01: catch_reports × boats × landings JOIN, sorted by landing/boat/trip/species; returns [] on empty date
- `distinctTripTypes(db)` — BRW-06: sorted verbatim trip_type strings from catch_reports
- `distinctLandings(db)` — BRW-06: distinct landing {id, display_name, source_url} present in catch_reports
- `distinctSpecies(db)` — BRW-06: sorted verbatim species strings
- `mostCommonTripType(db)` — D-10: trip_type with max COUNT(*), null on empty DB
- `getDateBounds(db)` — BRW-05: {min, max} of source_date; both null on empty DB

### src/lib/db/queries/tripPicker.ts
- `rankBoatsForQuery(db, {fromDate, toDate, species, tripType})` — TRP-02/03: D-08 weighted yield (SUM/SUM not mean-of-ratios), D-09 n_trips = COUNT(DISTINCT date|trip_type), TRP-07 no HAVING filter, sorted DESC avg_per_angler NULLS LAST then n_trips
- `heatmapForQuery(db, {fromDate, toDate, species, tripType})` — TRP-08/09: {date, value, n} tuples for dates with rows; D-15 Phase 3 swap contract preserved; only present dates returned (loader gap-fills)

### src/lib/db/queries/boatDetail.ts
- `getBoatProfile(db, boatId, cutoffDate?)` — BOAT-01/02: null if boat missing; composes 5 sub-queries: boat+landing, recentTrips (since cutoffDate, default=today-90), seasonTotals (all-time), topSpecies (top 5), tripTypes (distinct sorted); D-23 source_url included

### src/lib/db/queries/trends.ts
- `speciesTrend(db, {species, tripType, fromDate, toDate, granularity})` — TRN-01/02: per-species bucket aggregate; strftime('%G-W%V') for weekly, '%Y-%m' for monthly
- `boatTrend(db, {boatId, species?, tripType, fromDate, toDate, granularity})` — TRN-01/02/03: species optional; two prepared statements (not string concat) for per-species vs all-species path; /compare uses species: undefined

### src/lib/db/queries/compare.ts
- `compareBoats(db, {boatIds[], fromDate, toDate, tripType})` — TRN-03: throws 'compareBoats: max 3 boats' for boatIds.length > 3 (T-02-38); NULLIF guard (T-02-05); per-boat top_species via sub-query; result order matches boatIds order; null for boats without data in window

### src/lib/shared/urlState.ts
- `parseHomeFilters / serializeHomeFilters` — home page filter state (tripType?, landing?, species? all optional)
- `parseDateFilters / serializeDateFilters` — date view filter state (same shape as home)
- `parsePickerFilters / serializePickerFilters` — picker: date+species+tripType required, windowDays [0,14] default 3, rangeMode boolean, optional fromDate/toDate
- `parseCompareFilters / serializeCompareFilters` — compare: tripType+fromDate+toDate required, boatIds array 2..3 (getAll() for repeated keys), number coercion
- `parseTrendsFilters / serializeTrendsFilters` — trends: species+tripType required, boatId? optional, range enum('3mo','6mo','1y','all') default '1y', granularity? optional

### src/lib/db/scrapeRuns.ts (extended)
- `latestSuccessOrEmpty(db)` — D-21: most recent finished_at where outcome IN ('success','empty'); null when no qualifying run

### src/lib/db/boats.ts (extended)
- `getByIdWithLanding(db, id)` — BOAT-01/02: boats × landings JOIN; null if boat missing; {boat: {id, display_name, source_url}, landing: {id, display_name, source_url}}

### tests/helpers/seedTestDb.ts
- `seedBoat(db, {boatName, landingName, sourceUrl?})` — uses upsertBoatsAndLandings; idempotent; returns {boatId, landingId}
- `seedTrip(db, {boatId, landingId, date, tripType, species, anglers, count, scrapedAt?})` — single catch_reports row via upsertMany
- `seedTripsBatch(db, rows[])` — batch insert via upsertMany

## Decisions Implemented

| Decision | Implementation |
|----------|---------------|
| D-06 | All 5 new query modules in src/lib/db/queries/; DAL boundary enforced |
| D-07 | browse, tripPicker, boatDetail, trends, compare — exact modules as specified |
| D-08 | SUM(species_count)*1.0/NULLIF(SUM(angler_count),0) in tripPicker, trends, compare |
| D-09 | COUNT(DISTINCT source_date \|\| '\|' \|\| trip_type) AS n_trips everywhere |
| D-13 | heatmapForQuery returns {date, value, n} tuples; Phase 3 contract preserved |
| D-15 | heatmapForQuery shape is stable; gap-fill is loader's responsibility |
| D-18 | urlState.ts with Zod schemas + parse/serialize per route |
| D-21 | latestSuccessOrEmpty added to scrapeRuns.ts |
| D-22 | BrowseRow includes boat_source_url + landing_source_url |
| D-23 | getBoatProfile + getByIdWithLanding both include source_url fields |
| D-27 | trends: ISO week strftime('%G-W%V'), monthly '%Y-%m', gap-fill is loader job |

## Test Count + Green Status

| Test File | Tests | Status |
|-----------|-------|--------|
| tests/unit/shared/dates.test.ts | 32 | PASS |
| tests/unit/db/queries/browse.test.ts | 11 | PASS |
| tests/unit/db/queries/tripPicker.test.ts | 10 | PASS |
| tests/unit/db/queries/boatDetail.test.ts | 7 | PASS |
| tests/unit/db/queries/trends.test.ts | 10 | PASS |
| tests/unit/db/queries/compare.test.ts | 9 | PASS |
| tests/unit/shared/urlState.test.ts | 24 | PASS |
| Existing tests (unchanged) | 39 | PASS |
| **Total** | **142** | **ALL PASS** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Missing .svelte-kit/tsconfig.json in worktree**
- **Found during:** Task 1 verification
- **Issue:** The worktree had no `.svelte-kit/tsconfig.json` file (generated by `vite dev/build`), causing all Vitest test runs to fail with `TSConfckParseError`
- **Fix:** Ran `npx vite build` to generate `.svelte-kit/tsconfig.json` and sibling files
- **Files created:** `.svelte-kit/tsconfig.json` (and related generated files)

**2. [Rule 1 - Bug] Incorrect import paths in query test files**
- **Found during:** Task 2 initial test run
- **Issue:** Tests in `tests/unit/db/queries/` imported `../../helpers/in-memory-db` (wrong — one level too shallow)
- **Fix:** Corrected to `../../../helpers/in-memory-db` (tests are nested one level deeper than expected)

**3. [Rule 1 - Bug] currentPtMonth() used s.split('-')[1] not banned split**
- **Found during:** Code review of dates.ts extension
- **Issue:** Considered changing `s.split('-')[1]` to `s.slice(5,7)` in currentPtMonth, but the boundary test only bans `.split('T')[0]` not `.split('-')[...]` — original code was correct
- **Fix:** Reverted the unnecessary change; kept original implementation

## Notes for Wave 2 Consumers

- **Loaders MUST gap-fill heatmap:** `heatmapForQuery` returns only dates with rows. Use `addDays` from dates.ts to build the 30-cell array and insert null-value cells for dates not present in the result.
- **boatTrend all-species path:** Pass `species: undefined` (not an empty string or omit the key) to get all-species aggregate. An empty string would try to filter for species='' and return 0 rows.
- **getDateBounds returns {min: null, max: null} on empty DB:** Route loaders must handle this case (default to today() or show "no data" state).
- **compareBoats returns null entries:** For boats with no data in the window, the corresponding index in the result array is `null` — not an empty row. Loaders must handle null entries in the result array.
- **Trend gap-fill is the loader's responsibility:** `speciesTrend` and `boatTrend` return only buckets with rows. The route loader for `/trends` must fill gaps (buckets with no data) with null-value entries before passing to the chart component.
- **urlState parse error handling:** Parse functions return `{error: ZodError}` on failure (not null, not undefined). Loaders should treat error results as "render guidance" (no rankings, no chart).
- **latestSuccessOrEmpty returns null:** When the scrape_runs table has no success/empty outcomes, returns null. The "Last scraped at" indicator should handle null gracefully (show "never" or hide the indicator).

## Known Stubs

None — all functions are fully implemented and return real data from SQLite queries.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All SQL injection mitigations verified:
- T-02-01 (SQL injection): All queries use prepared statements with bound parameters
- T-02-02 (URL param injection): Zod schemas validate all filter values
- T-02-03 (DoS via huge ranges): windowDays clamped [0,14] in Zod; date range queries use indexed columns
- T-02-05 (integer division): NULLIF(SUM(angler_count), 0) in all yield calculations
- T-02-06 (ISO week confusion): strftime('%G-W%V') used throughout; test verifies 2024-12-30 → "2025-W01"
- T-02-38 (compareBoats DoS): boatIds.length > 3 throws at function entry

## Self-Check: PASSED

Files exist:
- src/lib/db/queries/browse.ts: FOUND
- src/lib/db/queries/tripPicker.ts: FOUND
- src/lib/db/queries/boatDetail.ts: FOUND
- src/lib/db/queries/trends.ts: FOUND
- src/lib/db/queries/compare.ts: FOUND
- src/lib/shared/urlState.ts: FOUND
- src/lib/shared/dates.ts: FOUND (extended)
- tests/helpers/seedTestDb.ts: FOUND

Commits exist:
- f52d6e0: Task 1 (dates + seed + boundary tests)
- 69628c6: Task 2 (browse, tripPicker, boatDetail, scrapeRuns, boats)
- 18a2ecb: Task 3 (trends, compare, urlState)

All 142 tests pass: VERIFIED
