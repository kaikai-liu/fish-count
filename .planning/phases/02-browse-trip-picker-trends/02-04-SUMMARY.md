---
phase: 02-browse-trip-picker-trends
plan: "04"
subsystem: trip-picker-route
tags: [svelte5, trip-picker, heatmap, per-angler, tdd, pure-function, echarts]
dependency_graph:
  requires: [02-01, 02-02]
  provides:
    - src/routes/picker/+page.server.ts (picker load function)
    - src/routes/picker/heatmapOption.ts (pure ECharts option builder)
    - src/routes/picker/+page.svelte (picker UI)
    - tests/unit/routes/picker.test.ts (loader integration tests)
    - tests/unit/routes/picker-heatmap-option.test.ts (pure helper unit tests)
  affects: [02-07 (lint verification)]
tech_stack:
  added: []
  patterns:
    - SvelteKit +page.server.ts SSR loader pattern (DAL + setHeaders + locals.logger)
    - Pure exported helper (heatmapOption.ts) factored out of Svelte component for unit testability
    - Svelte 5 runes ($state, $derived.by, $derived) for form state + derived chart option
    - PerAnglerFramingProvider context wrapping results region (CLAUDE.md non-negotiable #4)
    - TRP-05 server-side enforcement: guidance state returned when tripType absent
    - 30-cell heatmap gap-fill via addDays loop (HeatmapCell[] stable shape for Phase 3)
    - n<5 gray override via ECharts per-cell itemStyle (T-02-23 mitigated)
key_files:
  created:
    - src/routes/picker/+page.server.ts
    - src/routes/picker/heatmapOption.ts
    - src/routes/picker/+page.svelte
    - tests/unit/routes/picker.test.ts
    - tests/unit/routes/picker-heatmap-option.test.ts
  modified: []
decisions:
  - "TRP-05 enforced at server: parsePickerFilters + explicit !url.searchParams.get('tripType') check returns guidance state with no rankings — URL bypass cannot defeat this"
  - "heatmapOption.ts factored into a pure helper (no DOM) so the n<5 gray override is unit-testable from Node.js without JSDOM"
  - "Svelte 5 state_referenced_locally warnings in form init are by design — form state captures initial server data and user edits from there; no behavior issue"
  - "Pre-existing svelte-check errors (vite.config.ts, scraper/billing .ts extensions) are unchanged — 0 new errors from this plan"
  - "visualMap.max derived from n>=5 cells only to prevent low-data outliers distorting the color scale (D-14)"
metrics:
  duration_minutes: 7
  completed_date: "2026-04-25"
  tasks_completed: 2
  files_created: 5
  files_modified: 0
  tests_added: 17
  tests_total_after: 291
---

# Phase 02 Plan 04: Trip Picker Route Summary

One-liner: Trip picker route with server-side TRP-05 enforcement, 30-cell heatmap gap-fill via pure buildHeatmapOption helper, and ranked BoatCard list wrapped in PerAnglerFramingProvider — all per-angler strings pulled from $lib/copy/metrics constants.

## What Was Built

### Server Loader (`src/routes/picker/+page.server.ts`)

The loader is the credibility core of the product. Key behaviors:

- **TRP-05 server-side guard (T-02-19):** The loader checks `parsePickerFilters(url.searchParams)` and whether `tripType` is present in the raw params. If either fails, it returns `{ rankings: null, guidance: '...' }` — no rankings, no heatmap. This cannot be bypassed via URL manipulation.
- **Window computation (D-11):** Single-date mode expands to `[date - windowDays, date + windowDays]` via `addDays`. Range mode uses explicit `fromDate`/`toDate`.
- **DAL calls:** `rankBoatsForQuery` (TRP-07: no HAVING filter) + `heatmapForQuery` (returns only dates with rows).
- **30-cell gap-fill:** Iterates 30 dates with `addDays(heatmapStart, i)`, inserts `{ date, value: null, n: 0 }` for dates missing from the query result.
- **Why-panel data (D-28):** Computed per-boat: `{ species, tripType, windowStart, windowEnd, bestDay }`. Available for every ranked boat without additional fetches.
- **D-10 defaultTripType:** `mostCommonTripType(db)` is included in `filterOptions` so the FilterBar's trip-type `<select>` can default to the most common value.
- **Cache-Control:** `public, max-age=300` (D-29).

### Pure Heatmap Option Helper (`src/routes/picker/heatmapOption.ts`)

Factored out of the Svelte component to enable unit testing without DOM/JSDOM:

- **`buildHeatmapOption(cells, range)`:** Accepts the gap-filled `HeatmapCell[]` and `{ from, to }` range. Returns a complete EChartsOption.
- **T-02-23 / D-14 gray override:** `n<5` cells emit `{ value: [date, val ?? 0], itemStyle: { color: '#e5e7eb' } }`. `n>=5` cells emit bare `[date, value]` tuples consumed by the viridis visualMap.
- **Max derivation:** `visualMap.max` uses only `n>=5` cells to prevent outlier low-data values distorting the color scale.
- **Constants:** Imports `FISH_PER_ANGLER_TOOLTIP_UNIT` and `HEATMAP_LEGEND_HIGH` from `$lib/copy/metrics` — never inlines the literal string.
- **Exports:** `buildHeatmapOption`, `HEATMAP_LOWDATA_GRAY`, `VIRIDIS_STOPS` (testable constants).

### Picker UI (`src/routes/picker/+page.svelte`)

- **FilterBar:** Three required fields (date, species, trip type) + optional `± days` or date-range mode. Submit calls `serializePickerFilters` + `goto` per D-19.
- **Guidance state:** Renders the guidance message when `data.guidance` is set (no trip type selected).
- **Results region:** Wrapped in `<PerAnglerFramingProvider>` so the first `<PerAnglerMetric>` inside `BoatCard` renders the inline framing disclaimer (CLAUDE.md non-negotiable #4).
- **Heatmap:** `<Chart option={heatmapOption} ariaLabel={heatmapAriaLabel} />` — option built via `buildHeatmapOption`, aria-label uses `FISH_PER_ANGLER_ARIA` constant.
- **Ranked boats:** Grid of `<BoatCard rank={i+1} boat why />` — why-panel data from loader.
- **Anti-features:** No "ON FIRE" badges, no hype signals, no sponsored slots, no per-angler literal strings, no `{@html}`.

## Decisions Implemented

| Decision | Implementation |
|----------|----------------|
| D-08 | Weighted yield via rankBoatsForQuery (SUM/SUM, not mean-of-ratios — implemented in DAL) |
| D-09 | n_trips = COUNT(DISTINCT date\|trip_type) — implemented in DAL |
| D-10 | filterOptions.defaultTripType from mostCommonTripType feeds the trip-type select default |
| D-11 | Single-date mode: ± windowDays expansion via addDays |
| D-12 | Range mode: explicit fromDate/toDate toggle in form |
| D-13 | 30-day heatmap window starting at target date |
| D-14 | n<5 cells gray override in buildHeatmapOption (per-cell itemStyle) |
| D-15 | HeatmapCell shape stable for Phase 3 forecast swap (same {date, value, n} contract) |
| D-16 | PerAnglerMetric rendered via BoatCard — framing provider wraps results region |
| D-19 | goto() pattern for filter submission (keepFocus, replaceState, noScroll) |
| D-28 | Why-this-boat panel data computed server-side per row |
| D-29 | cache-control: public, max-age=300 |

## Test Count + Green Status

| Test File | Tests | Status |
|-----------|-------|--------|
| tests/unit/routes/picker.test.ts | 9 | PASS |
| tests/unit/routes/picker-heatmap-option.test.ts | 8 | PASS |
| tests/unit/db/dal-boundary.test.ts | 1 | PASS |
| tests/unit/shared/dates-boundary.test.ts | 2 | PASS |
| **Total new** | **17** | **ALL PASS** |

### picker.test.ts Coverage
1. TRP-05: missing tripType → guidance state (rankings=null, filters=null, guidance non-empty)
2. TRP-07: boat with n=2 trips is NOT filtered out
3. Heatmap: exactly 30 cells with {date, value, n} keys
4. Gap-fill: 25 null/n=0 cells when only 5 dates have data
5. Why-panel: every ranking row has species/tripType/windowStart/windowEnd/bestDay
6. Cache-control: setHeaders called with public max-age=300
7. Window math: date=2024-07-15 + windowDays=3 → from=2024-07-12, to=2024-07-18
8. defaultTripType: returns most-common trip type from seeded DB
9. defaultTripType: returns null on empty DB

### picker-heatmap-option.test.ts Coverage
1. n<5 cells get gray itemStyle.color = '#e5e7eb'
2. n<5 + null value: coerced to 0 in itemStyle tuple
3. visualMap.max from n>=5 cells only (n<5 outlier ignored)
4. Fallback max=1 when no n>=5 cells
5. Viridis palette stops verbatim (#440154 → #fde725)
6. Calendar range matches supplied range input
7. Series: type=heatmap, coordinateSystem=calendar
8. Empty cells array handled without throwing

## Notes for Plan 02-07 (Lint Verification)

- **Heatmap gray-cell visual UAT:** The gray override is runtime-verified by picker-heatmap-option.test.ts but visual confirmation (actual gray cells in the browser for n<5 dates) should be checked in the Plan 02-07 UAT pass.
- **PerAnglerFramingProvider wrapping pattern:** The `/picker` route's results region is wrapped in `<PerAnglerFramingProvider>`. The same pattern should be applied to `/compare` and `/trends` routes in plans 02-05 and 02-06.
- **heatmapOption.ts pure-helper pattern:** Any future route that needs a calendar heatmap (compare, trends if adding a calendar view) should factor the ECharts option builder out the same way — zero DOM deps, testable from Node.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing .svelte-kit/tsconfig.json in worktree**
- **Found during:** Task 1 initial test run
- **Issue:** Worktree had no `.svelte-kit/tsconfig.json` (generated by vite dev/build), causing Vitest to fail with `TSConfckParseError`
- **Fix:** Ran `npx vite build` to generate `.svelte-kit/tsconfig.json` and sibling files (same fix as Plan 02-01)
- **Files created:** `.svelte-kit/tsconfig.json` (and related generated files)

**2. [Rule 1 - Bug] Comment in +page.svelte contained inline 'fish/angler' literal**
- **Found during:** Task 2 acceptance criteria check
- **Issue:** A code comment read "No inline 'fish/angler' literals" which matched the grep pattern
- **Fix:** Rewrote comment to "No inline per-angler unit literals"
- **Files modified:** src/routes/picker/+page.svelte

**3. [Rule 1 - Bug] Implicit 'any' type in picker.test.ts filter callback**
- **Found during:** svelte-check run after Task 2
- **Issue:** `result.heatmap!.filter((c) => ...)` inferred `c` as `any` because the test's dynamic import returns an untyped result
- **Fix:** Added explicit type assertion `result.heatmap! as Array<{ date: string; value: number | null; n: number }>` before the filter call
- **Files modified:** tests/unit/routes/picker.test.ts

## Known Stubs

None — the picker loader returns real SQLite data via `rankBoatsForQuery` and `heatmapForQuery`. The "Why this boat?" best-day value is the boat's `last_trip_date` + `avg_per_angler` (not a per-day breakdown). This is documented as "Phase 2 shortcut" in the code comment; Phase 3 can extend without changing the loader API surface.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes introduced.

Mitigations from threat model implemented:
- T-02-19 (URL bypass of tripType): `parsePickerFilters` + explicit `!url.searchParams.get('tripType')` guard returns guidance, not rankings
- T-02-20 (huge windowDays DoS): Zod clamps windowDays to [0, 14] in parsePickerFilters (Plan 02-01)
- T-02-21 (date param injection): All SQL uses named-parameter binding in DAL (Plan 02-01)
- T-02-22 (filter values in logs): Structured fields only (species, tripType as field values, not format strings)
- T-02-23 (heatmap n<5 not gray): buildHeatmapOption per-cell itemStyle override tested at runtime in picker-heatmap-option.test.ts

## Self-Check: PASSED

Files exist:
- src/routes/picker/+page.server.ts: FOUND
- src/routes/picker/heatmapOption.ts: FOUND
- src/routes/picker/+page.svelte: FOUND
- tests/unit/routes/picker.test.ts: FOUND
- tests/unit/routes/picker-heatmap-option.test.ts: FOUND

Commits exist:
- e1ce723: feat(02-04): trip picker server load
- 054b6a6: feat(02-04): buildHeatmapOption pure helper + picker UI

All 17 new tests pass: VERIFIED
Boundary tests (dal + dates) still green: VERIFIED
0 new errors in svelte-check: VERIFIED (3 pre-existing errors unchanged)
