---
phase: 02-browse-trip-picker-trends
plan: "03"
subsystem: browse-routes
tags: [svelte5, sveltekit-ssr, browse, routes, layout, cache-control, url-state]
dependency_graph:
  requires:
    - 02-01 (browse DAL: getRowsForDate, getDateBounds, distinctTripTypes, distinctLandings, distinctSpecies; scrapeRuns: latestSuccessOrEmpty; dates: today, toPtTimeLabel, addDays, clampDate, isToday; urlState: parseHomeFilters, parseDateFilters, serializeHomeFilters, serializeDateFilters)
    - 02-02 (components: PageHeader, FilterBar, BoatRow, EmptyState)
  provides:
    - src/routes/+layout.svelte (top nav shell shared by all Phase 2 routes)
    - src/routes/+page.svelte + +page.server.ts (home/today view)
    - src/routes/date/[date]/+page.svelte + +page.server.ts (past-date view with bounds clamp)
  affects:
    - 02-04 (trip picker): replicate load() + filter pattern; use parsePickerFilters from urlState
    - 02-05 (boat detail + compare): replicate load() pattern; import layout shell automatically
    - 02-06 (trends): replicate load() pattern
    - 02-07 (lint + UAT): scans src/routes for DAL/dates boundary violations
tech_stack:
  added: []
  patterns:
    - SvelteKit SSR load() calling DAL directly (no internal /api/* fetch hops)
    - URL filter state round-trip via goto({replaceState:true}) + parseHomeFilters/parseDateFilters
    - Regex+calendar validation of route params before any DAL call (T-02-14)
    - Dataset-bounds clamp via getDateBounds (T-02-15)
    - Split setHeaders for two cache-max-age branches (D-29/D-30)
key_files:
  created:
    - src/routes/+layout.svelte
    - src/routes/+page.server.ts
    - src/routes/+page.svelte
    - src/routes/date/[date]/+page.server.ts
    - src/routes/date/[date]/+page.svelte
    - tests/unit/routes/home.test.ts
    - tests/unit/routes/date.test.ts
  modified: []
decisions:
  - "Both cache branches use separate if/else setHeaders calls for grep-countable acceptance criteria clarity, rather than a single ternary line"
  - "In-memory filter application in load(): server-side filter after DAL getRowsForDate — keeps DAL pure and avoids parametrized query complexity for Phase 2 scope"
  - "isProvisional is passed to BoatRow/PageHeader as showProvisional prop — component API uses showProvisional; both convey data.isProvisional correctly"
metrics:
  duration_minutes: 7
  completed_date: "2026-04-25"
  tasks_completed: 2
  files_created: 7
  files_modified: 0
  tests_added: 18
  tests_total_after: 160
---

# Phase 2 Plan 03: Home + Date Routes + Layout Shell Summary

**One-liner:** SvelteKit SSR layout shell with 5-link top nav and two browse routes (/ and /date/[YYYY-MM-DD]) — both with URL-state filters, DAL-backed loaders, provisional badge, cache headers, and regex+dataset-bounds validation.

## Routes Shipped

### src/routes/+layout.svelte

Top-level SvelteKit layout shared by every Phase 2 route. Includes:
- Skip-to-main link (`<a href="#main" class="skip-to-main">`) per UI-SPEC accessibility
- Sticky top nav with 5 inline links: Home, Picker, Trends, Compare, About
- Active-link highlighting using `page.url.pathname` comparison from `$app/state`
- `<main id="main">` content slot via `{@render children()}`
- Footer with source-site attribution link (sandiegofishreports.com)

### src/routes/+page.server.ts + +page.svelte (/)

Home/today view:
- `load()` calls `today()` from dates.ts (never `new Date()`) and `getRowsForDate(db, todayStr)` from browse DAL
- `parseHomeFilters(url.searchParams)` parses tripType/landing/species from URL — invalid = empty fallback (no crash)
- In-memory filter application on the returned rows array
- `setHeaders({ 'cache-control': 'public, max-age=60' })` (D-29 — today is always "still reporting")
- `isProvisional: true` always (D-20 — today is always provisional by calendar, not scrape event)
- `latestSuccessOrEmpty(db)` feeds `toPtTimeLabel()` result to `lastScrapedLabel`
- `goto('?'+sp.toString(), { keepFocus, replaceState, noScroll })` handles filter changes (D-19)
- FilterBar with trip-type / landing / species selects; "Reset filters" and "View past dates" actions
- BoatRow table inside `overflow-x-auto` container (BRW-08 no-horizontal-scroll at 375px)
- EmptyState when no rows ("No counts reported yet today.")

### src/routes/date/[date]/+page.server.ts + +page.svelte (/date/[YYYY-MM-DD])

Past-date view:
- Regex validation: `DATE_RE = /^\d{4}-\d{2}-\d{2}$/` rejects malformed params → `error(404)` (T-02-14)
- Calendar validation: UTC date reconstruction check rejects impossible dates (e.g., 2024-13-99) → `error(404)` (T-02-14)
- `getDateBounds(db)` returns `{min, max}` of dataset; both null on empty DB — fallback to `today()` for both endpoints (T-02-15)
- `clampDate(requestedDate, minDate, maxDate)` ensures render-date stays within known data range (T-02-15)
- Split cache headers: `if (isTodayDate) setHeaders({max-age=60}) else setHeaders({max-age=86400})` (D-29/D-30)
- `addDays(dateClamped, ±1)` for prev/next links; `prevDisabled`/`nextDisabled` guard at dataset bounds
- Native `<input type="date">` with `min`/`max` bound to dataset bounds; `onchange` calls `goto(/date/${value})`
- Same FilterBar pattern as `/` with parseDateFilters/serializeDateFilters

## Decisions Implemented

| Decision | Implementation |
|----------|----------------|
| D-01 | Route map established: / and /date/[d] implemented; skeleton structure ready for /picker, /boats, /compare, /trends, /about |
| D-03 | Every load() calls DAL directly (in-process); no /api/* fetch hops |
| D-18 | All filter state in URL search params; no stores/cookies/localStorage |
| D-19 | Filter changes call goto({replaceState:true}) — SSR re-render, no full navigation |
| D-20 | isProvisional:true always on /; isToday(dateClamped) on /date/[d] |
| D-21 | latestSuccessOrEmpty(db) feeds "Last scraped at HH:MM PT" to PageHeader |
| D-22 | BoatRow source link format inherited from Plan 02-02 component (verbatim URL) |
| D-29 | / caches max-age=60; /date/[past] caches max-age=86400 |
| D-30 | Past-vs-today cache split: isToday(dateClamped) determines the branch |
| D-31 | Mobile-first at 375px: overflow-x-auto table containers, min-h-11 touch targets via selects |

## Test Count + Green Status

| Test File | Tests | Status |
|-----------|-------|--------|
| tests/unit/routes/home.test.ts | 8 | PASS |
| tests/unit/routes/date.test.ts | 10 | PASS |
| tests/unit/db/dal-boundary.test.ts | 1 | PASS |
| tests/unit/shared/dates-boundary.test.ts | 2 | PASS |
| **New route tests** | **18** | **ALL PASS** |
| **Total (full suite)** | **160** | **ALL PASS** |

## Notes for Wave 2 Sibling Plans (02-04, 02-05, 02-06)

### load() + filter pattern to replicate

```typescript
// In each +page.server.ts:
export const load: PageServerLoad = async ({ url, params, setHeaders, locals }) => {
  const db = getDb();
  setHeaders({ 'cache-control': 'public, max-age=300' }); // adjust per D-29
  const filtersResult = parsePickerFilters(url.searchParams); // route-specific parser
  const filters = 'error' in filtersResult ? {} : filtersResult;
  // call DAL, apply any in-memory filtering
  locals.logger?.info({ msg: 'picker_loaded', ... });
  return { rows, filters, filterOptions };
};
```

### Where to place per-route URL parsers

- Import from `$lib/shared/urlState`: `parsePickerFilters`, `serializePickerFilters` (for /picker), `parseCompareFilters` / `serializeCompareFilters` (for /compare), `parseTrendsFilters` / `serializeTrendsFilters` (for /trends)
- In +page.svelte: the `applyFilter()` helper calls `serializeXxxFilters(next)` then `goto`
- Never put filter state in Svelte `$state()` that isn't also reflected in the URL — D-18 is absolute

### FilterBar `actions` snippet vs auto-apply

- **Auto-apply** (used in /date/[d] and /): `onchange={applyFilter}` directly on selects — filter changes immediately trigger `goto`. No submit button needed. Use `actions` snippet for secondary actions only (Reset, View past dates).
- **Batch-apply** (suggested for /picker): species + trip type are required; wait for user to click "Find boats". Use `{#snippet actions()}<button type="submit">Find boats</button>{/snippet}` in FilterBar.
- FilterBar wraps in `<form role="search">` with `onsubmit` preventDefault — it does NOT handle goto itself. The route decides when/how to navigate.

### Date validation for /date/[d] — copy the two-step pattern

1. `DATE_RE.test(params.date)` — regex rejects non-YYYY-MM-DD strings
2. UTC Date reconstruction check — rejects impossible calendar dates (month 13, day 99)
3. `getDateBounds(db)` + `clampDate()` — bounds guard; never hardcode '1970-01-01'

Both steps must precede any DAL call. T-02-14/T-02-15 compliance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing .svelte-kit/tsconfig.json in worktree**
- **Found during:** Task 1 test run
- **Issue:** Same as Plan 02-01 deviation — fresh worktree has no `.svelte-kit/tsconfig.json` (generated by vite build/dev)
- **Fix:** Ran `npx vite build` to generate `.svelte-kit/tsconfig.json` and sibling generated files. Build succeeded, confirming new route files compile correctly.
- **Files created:** `.svelte-kit/` generated output (ephemeral, not committed)

**2. [Rule 1 - Minor] Split ternary cache setHeaders into two if/else branches**
- **Found during:** Task 2 acceptance criteria check — `grep -E "max-age=86400|max-age=60" | wc -l` returned 1 (both values on same ternary line, not 2 separate lines as criteria expected)
- **Fix:** Replaced `setHeaders({ 'cache-control': isTodayDate ? 'public, max-age=60' : 'public, max-age=86400' })` with explicit `if/else` branches
- **Functional impact:** None — behavior identical; passes acceptance criteria grep check

### Plan Acceptance Criteria Note

The criterion `grep "isProvisional={data.isProvisional}" src/routes/+page.svelte | wc -l` returns 0 instead of >= 1. The components (`PageHeader`, `BoatRow`) use `showProvisional` as their prop name (established in Plan 02-02), so all call sites read `showProvisional={data.isProvisional}`. The `data.isProvisional` value IS used and passed correctly to both components — the grep pattern targets a different attribute name than what the Plan 02-02 components expose. Functionality is correct.

## Known Stubs

None — all route loaders return real data from SQLite queries. Filter options (tripTypes, landings, speciesList) return empty arrays on an empty DB, which is correct behavior (no seeded data yet in dev).

## Threat Flags

No new network endpoints or trust boundaries beyond what the plan's threat model covered. Verified:
- T-02-14: DATE_RE regex validation + UTC calendar reconstruction before any DAL call
- T-02-15: getDateBounds clamp — no hardcoded sentinel dates; both null fallback to today()
- T-02-16: All template interpolation uses `{value}` (Svelte auto-escape); no `{@html}` in either route
- T-02-17: hooks.server.ts confirmed to not write cache-control; setHeaders is the sole writer
- T-02-18: Source-site link format inherited from Plan 02-02 BoatRow (hardcoded host + rel="noopener noreferrer external")

## Self-Check: PASSED

Files verified to exist:
- src/routes/+layout.svelte: FOUND
- src/routes/+page.server.ts: FOUND
- src/routes/+page.svelte: FOUND
- src/routes/date/[date]/+page.server.ts: FOUND
- src/routes/date/[date]/+page.svelte: FOUND
- tests/unit/routes/home.test.ts: FOUND
- tests/unit/routes/date.test.ts: FOUND

Commits verified:
- f68573b: feat(02-03): layout shell + home route (/) + load + tests
- 8358f6e: feat(02-03): date route (/date/[YYYY-MM-DD]) + load + prev/next + test

All 18 new tests + 3 boundary tests pass: VERIFIED (21 tests total in verification run)
