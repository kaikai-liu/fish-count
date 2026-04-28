---
phase: 03-forecast-layer
fixed_at: 2026-04-28T05:06:00Z
review_path: .planning/phases/03-forecast-layer/03-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-04-28T05:06:00Z
**Source review:** `.planning/phases/03-forecast-layer/03-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (5 Warning, 0 Critical — IN-* findings excluded per `fix_scope=critical_warning`)
- Fixed: 5
- Skipped: 0

All five in-scope warnings were applied. The full vitest suite (460 tests) is green after each commit. No critical findings existed; info findings (IN-01..IN-04) were intentionally out of scope per the fix-scope config.

## Fixed Issues

### WR-01 + WR-02: align forecast gap-day candidates with the SQL window

**Files modified:**
- `src/lib/db/scrapeRuns.ts` (added DAL helper `earliestScrapeRunYear`)
- `src/lib/forecast/compute.ts` (rewrote `enumerateWindowDates`, removed `canonicalAnchor`)
- `tests/forecast/gap-aware.test.ts` (updated "absent scrape_runs" test to seed one anchoring ledger row)

**Commit:** `fe852a0`

**Applied fix:**
- WR-01: `enumerateWindowDates` now bounds the earliest year to `earliestScrapeRunYear(db)` rather than a hardcoded 2010. When the ledger is empty the function returns `[]` (no expected dates) — pre-ingestion years no longer inflate `gap_days_expected` forever, restoring the verbatim "based on N of M days" honesty signal (PITFALLS §8).
- WR-02: enumerated the 15 MM-DD slots once via the same year-2000 leap anchor used by `computeWindowBounds`, then mapped (year, MM-DD) per prior year and dropped 02-29 in non-leap years (matches `strftime('%m-%d', source_date)`). This eliminates the 1-day mismatch on Feb-29 forecasts where the candidate set previously included `02-21` even though the SQL window was `02-22..03-07`.

These were merged into a single atomic commit because both touch `enumerateWindowDates` and share the calendar-set invariant (`gap_days_present <= gap_days_expected` reflects the same calendar set the SQL aggregates).

The DAL boundary (CLAUDE.md) is preserved: the new `earliestScrapeRunYear` SQL lives in `src/lib/db/scrapeRuns.ts`; `compute.ts` calls it as a typed function.

The "absent scrape_runs row" gap-aware test now seeds one unrelated `2024-01-01` ledger row so `gap_days_expected > 0` can still be asserted under the new semantics — without that seed, the empty-ledger branch correctly returns 0 expected days.

---

### WR-03: capture `today()` once per `/picker` request

**Files modified:**
- `src/routes/picker/+page.server.ts`
- `tests/forecast/heatmap-composer.test.ts`

**Commit:** `4ae71ea`

**Applied fix:** Hoisted `const todayPt = today()` above `filterOptions` and reused it for `defaultDate`, the horizon check, and the past/future heatmap split. The previous code called `today()` twice — once at line 53 (`filterOptions.defaultDate`) and once at line 107 (`todayPt`). Per CONTEXT.md / RESEARCH §4 the rule is "captured ONCE per request" for unambiguous DST-boundary safety.

Tightened the heatmap-composer test from `<= 2` calls to exactly `1` call so future drift is caught in CI rather than tolerated by a permissive bound.

---

### WR-04: future-date heatmap gap-fill emits a forecast-shaped stub

**Files modified:**
- `src/routes/picker/+page.server.ts`
- `tests/forecast/heatmap-composer.test.ts` (added a new test asserting per-cell shape)

**Commit:** `4ac2eec`

**Applied fix:** Branched the 30-cell gap-fill on `d >= todayPt`. Future-date stubs now carry `pi_low`, `pi_high`, `gap_present`, `gap_expected` (forecast shape) so `heatmapOption.ts`'s `isForecastCell` discriminant routes the tooltip to verbatim "not enough history — n=0 trips" (D-08). Past-date stubs keep the original Phase-2 `{date, value, n}` shape so the actuals tooltip renders unchanged for historical gaps.

n<5 gray cell rendering is unchanged for both shapes (n=0 still trips the n<5 visualMap override).

Added a focused test covering past, today, and future gap-fills to lock the per-cell shape contract: past gap-fill has no `pi_low`; today/future gap-fill has `pi_low: null`, `gap_present: 0`, `gap_expected: 0`.

---

### WR-05: cache `fleetMeanForecast` per (species, tripType) in the benchmark script

**Files modified:**
- `scripts/forecast-benchmark.ts`

**Commit:** `f91cbb0`

**Applied fix:** `fleetMeanForecast` depends only on `(species, tripType, heldOutYear)` and is invariant across the date dimension. The previous triple-nested loop called the helper for every (date, species, tripType), producing ~43,800 invocations on production-scale data when ~120 distinct (species, tripType) pairs would suffice (a ~365× wasted-work multiplier).

Memoized via `Map<string, number | null>` keyed by `${species}\x00${tripType}` (NUL separator prevents collisions with species or trip-type names containing field separators). Used `Map.has()` to distinguish "not yet cached" from "cached null" — the helper can legitimately return null when no rows exist for the tuple.

The benchmark script's existing smoke tests (`tests/unit/scripts/forecast-benchmark.test.ts`, 4 tests) continue to pass; total cell counts are unchanged because we only deduplicated invocations of an invariant computation.

## Skipped Issues

None.

---

_Fixed: 2026-04-28T05:06:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
