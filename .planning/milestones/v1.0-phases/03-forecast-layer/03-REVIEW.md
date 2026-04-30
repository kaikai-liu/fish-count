---
phase: 03-forecast-layer
reviewed: 2026-04-26T00:00:00Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - package.json
  - scripts/backfill.ts
  - scripts/forecast-benchmark.ts
  - scripts/forecasts-rebuild.ts
  - src/lib/components/PerAnglerMetric.svelte
  - src/lib/copy/metrics.ts
  - src/lib/db/catchReports.ts
  - src/lib/db/forecasts.ts
  - src/lib/db/migrations.ts
  - src/lib/db/queries/benchmark.ts
  - src/lib/db/queries/forecastHeatmap.ts
  - src/lib/db/scrapeRuns.ts
  - src/lib/forecast/compute.ts
  - src/lib/server/scheduler.ts
  - src/routes/about/+page.svelte
  - src/routes/picker/+page.server.ts
  - src/routes/picker/heatmapOption.ts
  - tests/forecast/compute.test.ts
  - tests/forecast/gap-aware.test.ts
  - tests/forecast/heatmap-composer.test.ts
  - tests/forecast/horizon.test.ts
  - tests/forecast/percentile.test.ts
  - tests/forecast/year-boundary.test.ts
  - tests/scheduler/scrape-tick.test.ts
  - tests/unit/components/PerAnglerMetric-forecast.test.ts
  - tests/unit/db/countPresentDays.test.ts
  - tests/unit/db/forecasts.test.ts
  - tests/unit/db/getRatiosForWindow.test.ts
  - tests/unit/db/migrations.test.ts
  - tests/unit/db/queries/forecastHeatmap.test.ts
  - tests/unit/routes/picker/heatmapOption-forecast.test.ts
  - tests/unit/scripts/forecast-benchmark.test.ts
  - tests/unit/scripts/forecasts-rebuild.test.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-04-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 32 (17 source + 15 tests/config)
**Status:** issues_found

## Summary

Phase 3 (Forecast Layer) is a well-engineered implementation that meets every CLAUDE.md non-negotiable for forecast honesty. Verified strengths:

- **DAL boundary preserved.** `src/lib/forecast/compute.ts` and all three scripts (`backfill.ts`, `forecast-benchmark.ts`, `forecasts-rebuild.ts`) are SQL-free; SQL lives only in `src/lib/db/*`. Grep verified.
- **Forecast honesty.** `n<5` floor enforced in `computeCell` (D-07); integer-only display via `Math.round` in both `PerAnglerMetric` (kind=forecast) and tooltip; 80% PI bounds stored and rendered with verbatim `80% PI` label; verbatim copy constants centralized in `src/lib/copy/metrics.ts` (`forecast`, `not enough history`, `80% PI`).
- **Idempotent UPSERT.** `forecasts.upsertMany` uses `ON CONFLICT(forecast_date, species, trip_type) DO UPDATE`, verified by `tests/unit/db/forecasts.test.ts`.
- **Date discipline.** All `YYYY-MM-DD` strings flow through `src/lib/shared/dates.ts`. The `/picker` loader captures `today()` once into `todayPt` and reuses it for both the horizon check and the past/future split (DST safety).
- **Non-fatal scheduler integration.** `_scrapeTick` wraps `recomputeForecasts(getDb())` in a dedicated try/catch, gated to outcomes `success` and `empty`, so a recompute failure cannot block `pingHealthcheck('success')`. Verified by `scrape-tick.test.ts`'s "recompute failure is NON-FATAL" assertion.
- **Horizon cap.** `>30 days` returns verbatim `horizon too far — historical data only` while still computing rankings from historical data.
- **Year-boundary wrap.** `getRatiosForWindow` handles MM-DD wrap via `windowWraps` parameter; `year-boundary.test.ts` covers Jan and Dec edge cases.
- **Gap accounting.** `countPresentDays` correctly excludes `killed`/`http_error`/`parse_error` and absent rows.

The findings below are issues that should be addressed but do not block phase completion. None are security or data-integrity bugs.

## Warnings

### WR-01: `gap_days_expected` includes prior years where ingestion did not yet exist, inflating gap fraction reported to users

**File:** `src/lib/forecast/compute.ts:237-252`
**Issue:** `enumerateWindowDates` hardcodes `EARLIEST_YEAR = 2010` and emits 15 candidate dates per prior year between 2010 and `forecastYear - 1`. For a 2026 forecast that produces 16 years × 15 days = 240 expected dates. But the project did not start scraping in 2010 — early years have NO `scrape_runs` rows, so they all count as gaps in `gap_days_present`. Once initial backfill completes, `catch_reports` rows might exist for those years (filling the SQL window), but `scrape_runs` does NOT get backfilled — only the dates the scraper actually attempted are recorded. Result: every forecast cell could permanently display `based on N of M days` with N << M, even when the underlying SQL window is fully covered by backfilled `catch_reports`. This undermines the PITFALLS §8 honesty signal — the annotation will be present so often it loses meaning.
**Fix:** Either (a) bound `EARLIEST_YEAR` dynamically to the year of the earliest `scrape_runs` row, or (b) compute `gap_days_expected` from years where any `catch_reports` row exists for the (species, trip_type), e.g.:
```typescript
// Add a DAL helper in src/lib/db/scrapeRuns.ts:
export function earliestScrapeRunYear(db: Database.Database): number | null {
  const row = db.prepare(
    `SELECT MIN(CAST(strftime('%Y', run_date) AS INTEGER)) AS y FROM scrape_runs`
  ).get() as { y: number | null };
  return row.y;
}
// Then in compute.ts enumerateWindowDates:
const earliest = earliestScrapeRunYear(db) ?? forecastYear; // empty ledger ⇒ no expected dates
for (let y = earliest; y < forecastYear; y++) { ... }
```
Alternative: document in `/about` that "based on N of M days" measures coverage relative to a fixed historical baseline so users understand a low N/M does not always mean recent gaps.

---

### WR-02: Feb-29 forecast date produces a one-day mismatch between `gap_days_expected` candidate set and the SQL window

**File:** `src/lib/forecast/compute.ts:259-265` (`canonicalAnchor`) vs `271-283` (`computeWindowBounds`)
**Issue:** For `forecast_date='2026-02-29'`, `computeWindowBounds` anchors against year 2000 (leap) and produces SQL window `02-22..03-07`. But `enumerateWindowDates` calls `canonicalAnchor(2023, '02', '29')` which returns `2023-02-28` (because 2023 is non-leap), then emits `addDays('2023-02-28', -7..7)` = `2023-02-21..2023-03-07`. That set includes `2023-02-21`, which is OUTSIDE the SQL window (`02-22..03-07`). Net effect: in non-leap prior years, `gap_days_expected` is over-counted by 1 day, and a `scrape_runs` row on `02-21` would count toward `gap_days_present` even though no `catch_reports` row from that date is in the forecast input set. The discrepancy is small (1 day per non-leap prior year, only when forecast_date is Feb 29) but breaks the invariant that `gap_days_present <= gap_days_expected` reflects the SAME calendar set the SQL aggregates.
**Fix:** Anchor `enumerateWindowDates` to the same year-2000-leap basis as `computeWindowBounds`, then map (year, MM-DD) for each prior year, dropping 02-29 in non-leap years rather than rolling to 02-28:
```typescript
function enumerateWindowDates(forecastDate: string, forecastYear: number): string[] {
  const dates: string[] = [];
  const earliest = 2010; // or earliestScrapeRunYear(db) per WR-01
  // Generate 15 MM-DD slots once via year-2000 anchor (same basis as computeWindowBounds).
  const slots: string[] = [];
  const yearAnchor = `2000-${forecastDate.slice(5)}`;
  for (let d = -7; d <= 7; d++) slots.push(addDays(yearAnchor, d).slice(5));
  for (let y = earliest; y < forecastYear; y++) {
    for (const mmdd of slots) {
      // Drop 02-29 in non-leap years (matches SQL — strftime never emits 02-29 there).
      if (mmdd === '02-29') {
        const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
        if (!isLeap) continue;
      }
      dates.push(`${y}-${mmdd}`);
    }
  }
  return dates;
}
```

---

### WR-03: `/picker` loader calls `today()` twice per request — minor DST risk and inconsistent with CONTEXT.md "captured once per request" rule

**File:** `src/routes/picker/+page.server.ts:53, 107`
**Issue:** Line 53 calls `today()` for `filterOptions.defaultDate`, and line 107 calls it again for `todayPt`. CONTEXT.md / RESEARCH §4 explicitly states "capture the PT calendar date ONCE per request and reuse for horizon check AND past/future split. Re-reading inside the load body can produce DST-boundary inconsistency within a single request." The two calls are nanoseconds apart so DST flips are vanishingly rare — but the principle exists to make the rule unambiguous, and the heatmap-composer test (`tests/forecast/heatmap-composer.test.ts:215-217`) already permits up to 2 calls, normalizing the violation.
**Fix:** Hoist `todayPt` above `filterOptions` and reuse:
```typescript
export const load: PageServerLoad = async ({ url, setHeaders, locals }) => {
  const db = getDb();
  setHeaders({ 'cache-control': 'public, max-age=300' });

  // Capture PT calendar date ONCE per request — reused for filterOptions default,
  // horizon check, and past/future heatmap split. (CONTEXT.md / RESEARCH §4.)
  const todayPt = today();

  const filterOptions = {
    tripTypes: distinctTripTypes(db),
    speciesList: distinctSpecies(db),
    defaultTripType: mostCommonTripType(db),
    defaultDate: todayPt
  };
  // ... remainder unchanged; remove the second `const todayPt = today();` on line 107.
};
```
Then update `tests/forecast/heatmap-composer.test.ts:216` to assert exactly 1 call.

---

### WR-04: Heatmap gap-fill cell in the future portion produces "low data — n=0 trips" tooltip instead of "not enough history" — UX inconsistency for forecast cells

**File:** `src/routes/picker/+page.server.ts:166-169`
**Issue:** When iterating the 30-cell window, missing dates fall back to `{ date: d, value: null, n: 0 }`. This shape lacks `pi_low`, so `isForecastCell` in `heatmapOption.ts` returns `false`, and the tooltip routes to the actuals branch — producing `low data — n=0 trips` for what is conceptually a forecast cell (date >= today). The user sees "low data" for a future date, which is semantically wrong; per D-08 the verbatim copy should be `not enough history — n=0 trips` (and should be the same as for forecast cells with `n_trips < 5`).
**Fix:** Branch the gap-fill on past vs future and emit a forecast-shaped stub when the date is today/future:
```typescript
const cells: AnyHeatmapCell[] = [];
for (let i = 0; i < 30; i++) {
  const d = addDays(heatmapStart, i);
  const existing = presentMap.get(d);
  if (existing) {
    cells.push(existing);
    continue;
  }
  if (d >= todayPt) {
    // Future cell with no forecast row → render as forecast n=0 (not "low data").
    cells.push({
      date: d, value: null, n: 0,
      pi_low: null, pi_high: null,
      gap_present: 0, gap_expected: 0
    } as ForecastHeatmapCell);
  } else {
    cells.push({ date: d, value: null, n: 0 });
  }
}
```
This keeps the n<5 gray render unchanged (since `n=0 < 5`) and routes the tooltip to the verbatim "not enough history" branch for forecast cells.

---

### WR-05: `forecast-benchmark.ts` recomputes `fleetMeanForecast` per-date inside the inner loop — quadratic cost, but more importantly produces noisy logs and could time out on real-sized datasets

**File:** `scripts/forecast-benchmark.ts:359-388`
**Issue:** The triple-nested loop calls `fleetMeanForecast(db, species, tripType, heldOutYear)` for every (date, species, tripType). The result is invariant per (species, tripType) — it depends only on `heldOutYear`. With ~365 dates × 10 species × 12 trip types = ~43,800 iterations, the helper runs ~43,800 times when ~120 distinct (species, tripType) pairs would suffice (a ~365× overhead). The per-cell `getRatiosForWindow` is similarly invariant per (species, tripType, MM-DD-window) but at least depends on date. The script is one-shot and the user accepts a "few minutes" runtime, but on production-scale `catch_reports` (10+ years × ~6,000 rows/yr = ~60K rows) the unindexed fleet-mean COUNT-aggregate could push runtime to many minutes per call. Caveat: the workflow brief says performance is out of v1 scope; flagging because the wasted work also bloats the operator log line `[forecast-benchmark] evaluated N cells` with a misleading count if the operator measures throughput.
**Fix:** Cache `fleetMeanForecast` per (species, tripType):
```typescript
const fleetCache = new Map<string, number | null>();
function cachedFleetMean(species: string, tripType: string): number | null {
  const k = `${species}\x00${tripType}`;
  if (!fleetCache.has(k)) fleetCache.set(k, fleetMeanForecast(db, species, tripType, heldOutYear));
  return fleetCache.get(k)!;
}
// Inside the loop:
const fleet = cachedFleetMean(species, tripType);
```

## Info

### IN-01: `crypto.randomUUID()` relies on the Node global rather than an explicit `node:crypto` import

**File:** `src/lib/forecast/compute.ts:175` and (pre-existing) `src/lib/server/scheduler.ts:51`
**Issue:** Node 22 exposes `crypto` on `globalThis`, so this works, but explicit imports are easier to grep and survive runtime changes. This is consistent with the existing scheduler code so it's not a regression.
**Fix:** Optional cleanup: `import { randomUUID } from 'node:crypto';` at top of file, then `jobId: randomUUID()`.

---

### IN-02: `recomputeForecasts` writes the entire forecast set in a single `upsertMany` transaction — fine for v1 but worth documenting

**File:** `src/lib/forecast/compute.ts:184, 218`
**Issue:** `rows` accumulates ~3,720 cells in memory then a single transaction writes them all. With WAL mode this does not block readers, but the transaction holds a write lock for the duration. Per CONTEXT.md "Claude's Discretion" the planner explicitly chose single-transaction; calling that out here for traceability. Per-cell errors are correctly caught and skipped (line 205-213) so a single bad cell does not abort the batch — verified.
**Fix:** None required. If batch size ever grows >10K consider chunking; not a concern at v1 cardinality.

---

### IN-03: `pruneBeforeHorizon` is a documented no-op stub; underscore-prefixed unused params accepted by TS but linters may flag

**File:** `src/lib/db/forecasts.ts:83-85`
**Issue:** `pruneBeforeHorizon(_db, _cutoffDate)` returns 0 always per D-16 (past rows retained indefinitely). The leading underscore signals "intentionally unused" but some ESLint configs (e.g., `no-unused-vars` without `argsIgnorePattern: '^_'`) still flag this.
**Fix:** None required if lint passes locally. Otherwise add an explicit ignore comment:
```typescript
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function pruneBeforeHorizon(_db: Database.Database, _cutoffDate: string): number {
  return 0;
}
```

---

### IN-04: Scripts use `console.log` for CLI output while runtime modules use `pino` logger — intentional but undocumented convention

**File:** `scripts/backfill.ts:148`, `scripts/forecast-benchmark.ts:317,404`, `scripts/forecasts-rebuild.ts:63,75`
**Issue:** Scripts emit operator-facing CLI output via `console.log/error` rather than the structured pino logger. This is the right choice (CLI users expect plaintext, not JSON) but it's not stated anywhere. Worth a single line in `CLAUDE.md` or a script header note.
**Fix:** Optional. Add to one script header (e.g., `backfill.ts`):
```typescript
// Logging policy: CLI scripts emit operator-facing output via console.log/error
// (plaintext is what humans expect at a terminal). Runtime modules — including
// recomputeForecasts() called from this script — use the pino logger as usual.
```

---

_Reviewed: 2026-04-26T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
