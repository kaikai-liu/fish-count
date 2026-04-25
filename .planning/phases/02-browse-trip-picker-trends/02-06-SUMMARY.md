---
phase: 02-browse-trip-picker-trends
plan: 06
subsystem: ui
tags: [sveltekit, echarts, date-fns, trends, about, iso-week, gap-fill]

requires:
  - phase: 02-browse-trip-picker-trends/01
    provides: speciesTrend, boatTrend queries; TrendBucket type; isoWeekKey/monthKey helpers; date-fns installed
  - phase: 02-browse-trip-picker-trends/02
    provides: FISH_PER_ANGLER_AXIS, FISH_PER_ANGLER_ARIA constants; Chart/FilterBar/PageHeader/EmptyState components

provides:
  - /trends route (TRN-01, TRN-02): species+trip-type weekly/monthly line chart with gap-fill, optional boat filter
  - /about route (BRW-09): static verbatim copy page, destination for every per-angler framing link
  - tests/unit/routes/trends.test.ts: 11 tests covering guidance state, auto-granularity, boat filter, gap-aware nulls, ISO-week boundary

affects:
  - 02-07: per-angler-discipline lint must allowlist src/routes/about/+page.svelte + src/lib/copy/metrics.ts + src/lib/components/PerAnglerMetric.svelte
  - 02-07: seed-dev-db data must span ≥6 months so /trends weekly+monthly toggle is meaningful in manual UAT
  - 02-07: /about copy strings (fish/angler, derived boat-aggregate average, low data, provisional, 23:00 PT) will be grep-verified

tech-stack:
  added: []
  patterns:
    - URL-driven filter form state seeded from $props() via $state (D-18/D-19 pattern)
    - Node-side gap-fill via date-fns eachWeekOfInterval/eachMonthOfInterval + Map alignment
    - Static about page with verbatim spec copy — allowlisted from per-angler lint

key-files:
  created:
    - src/routes/trends/+page.server.ts
    - src/routes/trends/+page.svelte
    - src/routes/about/+page.server.ts
    - src/routes/about/+page.svelte
    - tests/unit/routes/trends.test.ts
  modified: []

key-decisions:
  - "D-26: auto-granularity — weekly for ≤6mo range, monthly for >6mo; explicit URL param always overrides"
  - "D-27: gap-fill produces null (not zero) for missing buckets; connectNulls: false on ECharts series"
  - "D-29: /trends cache-control max-age=300 (5 min); /about max-age=3600 (1 hr)"
  - "T-02-31: range=all maps to 10-year bounded sentinel — no unbounded SQL scan"
  - "/about is allowlisted by Plan 02-07 per-angler-discipline lint for legitimate inline literals"

patterns-established:
  - "Trends gap-fill: enumerate expected bucket keys via date-fns, align with DB results Map, null for absent keys"
  - "ISO-week key format: RRRR-'W'II via date-fns format() matches SQLite strftime('%G-W%V')"
  - "About page: verbatim UI-SPEC copy as static Svelte markup with max-w-prose mx-auto container"

requirements-completed:
  - BRW-09
  - TRN-01
  - TRN-02

duration: 67min
completed: 2026-04-25
---

# Phase 2 Plan 06: Trends + About Routes Summary

**Gap-aware /trends line chart (weekly/monthly with ISO-week boundary correctness) + verbatim /about data-framing page anchoring every per-angler metric link**

## Performance

- **Duration:** ~67 min
- **Started:** 2026-04-25T21:25:00Z
- **Completed:** 2026-04-25T22:33:00Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments

- `/trends` route enforces required species + trip type, auto-picks granularity (weekly ≤6mo, monthly >6mo), calls `speciesTrend` or `boatTrend`, gap-fills missing ISO-week/month buckets via date-fns with null (not zero), and renders via ECharts with `connectNulls: false`
- ISO-week boundary correctness verified: 2024-12-30 correctly produces bucket key "2025-W01" (matching SQLite `strftime('%G-W%V')`); test seeds catch report on that date and asserts `xAxis.data` contains "2025-W01" with correct yield value
- `/about` ships verbatim UI-SPEC copy covering all required topics: source/scrape cadence (23:00 PT), fish/angler definition, derived boat-aggregate average framing, trip-type semantics, n<5/"low data" explanation, data gap handling, freshness indicator, contact placeholder
- 11 unit tests for trends load(): guidance state, granularity auto-selection, explicit override, boat filter series naming, gap-aware null generation, ISO-week boundary, `yAxis.name === 'fish/angler'`

## Task Commits

1. **Task 1: Trends route — server load with gap-fill + UI + test** - `2fac42c` (feat)
2. **Task 2: About route — verbatim copy + cache header** - `3f12739` (feat)

## Files Created/Modified

- `src/routes/trends/+page.server.ts` — load() with D-26 auto-granularity, D-27 gap-fill, T-02-30 guidance state, T-02-31 bounded range, FISH_PER_ANGLER_AXIS yAxis name
- `src/routes/trends/+page.svelte` — FilterBar (species + tripType required, boat optional, range preset, granularity toggle), Chart with FISH_PER_ANGLER_ARIA aria-label
- `src/routes/about/+page.server.ts` — tiny load() setting Cache-Control: max-age=3600
- `src/routes/about/+page.svelte` — static markup with verbatim UI-SPEC copy, max-w-prose container
- `tests/unit/routes/trends.test.ts` — 11 tests, vi.mock on $lib/db/client, in-memory DB, all acceptance criteria covered

## Decisions Made

- Used `$state` (not `$derived`) for form fields in trends.svelte — intentional: form state is independently mutable between submit cycles; URL-driven reload re-seeds the state. Svelte 5 advisory warning is expected and acceptable for this URL-form pattern.
- `range=all` maps to a 10-year sentinel (3650 days) per T-02-31, not an unbounded query. The SQL's `BETWEEN @fromDate AND @toDate` on an indexed `source_date` column is safe at this bound.
- ISO-week key format uses date-fns `format(d, "RRRR-'W'II")` which matches the `RRRR` (ISO week year) + `II` (ISO week number with leading zero) tokens — correctly handles the 2024-12-30 → "2025-W01" year-boundary case.

## Deviations from Plan

**1. [Rule 3 - Blocking] svelte-kit sync required before tests**
- **Found during:** Task 1 (test run)
- **Issue:** Worktree lacked `.svelte-kit/tsconfig.json` (generated by SvelteKit build step) causing all tests to fail with TSConfckParseError
- **Fix:** Ran `npx svelte-kit sync` to generate `.svelte-kit/` directory in the worktree
- **Files modified:** `.svelte-kit/tsconfig.json` (generated)
- **Verification:** All tests passed after sync
- **Committed in:** Not committed (generated artifact, not tracked)

**2. [Rule 1 - Bug] Fixed gap-aware test seed dates**
- **Found during:** Task 1 (test 7)
- **Issue:** Test seeded catch rows in March/April 2025 but queried `range=3mo` (90 days from 2026-04-25 = back to 2026-01-25) — 2025 dates are outside the window
- **Fix:** Updated seed dates to 2026-02-02 and 2026-03-02 (within the 90-day window)
- **Files modified:** `tests/unit/routes/trends.test.ts`
- **Verification:** Test 7 passes; gap-fill logic confirmed working

---

**Total deviations:** 2 (1 environment setup, 1 test date fix)
**Impact on plan:** Both auto-fixed; no scope changes. The svelte-kit sync is a standard worktree setup step.

## Issues Encountered

- Pre-existing svelte-check errors in `vite.config.ts` (vitest `test` key not in UserConfigExport), `parser.ts`, and `billing.ts` (allowImportingTsExtensions) — all pre-existing from Phase 1, out of scope. No new errors in Phase 2 files.

## Known Stubs

- `/about` contact section: "Reach out: [contact pointer — populated in Phase 5]." — intentional verbatim stub from UI-SPEC; Phase 5 (POL-02) will populate with real contact info.

## Notes for Plan 02-07

1. **Per-angler-discipline lint allowlist** must include:
   - `src/routes/about/+page.svelte` — legitimate inline "fish/angler" / "per angler" in verbatim copy
   - `src/lib/copy/metrics.ts` — the constants module itself
   - `src/lib/components/PerAnglerMetric.svelte` — the rendering component

2. **seed-dev-db data must span ≥6 months** so the weekly/monthly granularity toggle on `/trends` is meaningful in manual UAT. With ≤6 months of data, the 1y and all presets will both auto-select monthly, making the toggle less testable.

3. **grep-verify strings** for `/about`:
   - "derived boat-aggregate average" (framing)
   - "fish/angler" (metric unit)
   - "low data" (n<5 badge label)
   - "provisional" (today's data badge label)
   - "23:00 PT" or "nightly" (scrape cadence)
   - "n<5" or "n=X" (sample size explanation)
   - "gap, not a zero" (data gap honesty)
   - "Where the data comes from" (section heading)

## Self-Check: PASSED

All created files exist on disk. Commits 2fac42c and 3f12739 verified in git log. 11 tests pass. No unexpected file deletions. No SQL in route files. No inline `fish/angler` literals in trends files. /about verbatim copy verified against UI-SPEC. Cache headers (max-age=300 for /trends, max-age=3600 for /about) confirmed.

## Next Phase Readiness

- /trends and /about are complete and ready for Plan 02-07 UAT
- All pre-existing errors are in Phase 1 files, not in Phase 2 routes
- The trends test suite provides regression coverage for ISO-week boundary, gap-fill, and auto-granularity

---
*Phase: 02-browse-trip-picker-trends*
*Completed: 2026-04-25*
