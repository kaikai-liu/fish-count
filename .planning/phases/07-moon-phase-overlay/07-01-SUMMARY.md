---
phase: 07-moon-phase-overlay
plan: 01
subsystem: shared-utility
tags: [phase-7, moon, pure-module, vitest, astronomy, deterministic]

# Dependency graph
requires:
  - phase: 06-explorer-foundation
    provides: src/lib/shared/dates.ts (addDays, daysBetween) — used by moonIlluminationSeries
provides:
  - moonIllumination(s) — pure deterministic [0,1] illumination from YYYY-MM-DD
  - moonIlluminationSeries(from, to) — one value per inclusive day, length n+1
affects: [07-02, 07-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Hand-rolled astronomy approximation (Conway/Meeus synodic-month, Fliegel/Van Flandern JD)
    - Pure module convention (no I/O, no Date constructor) consistent with dates.ts/slug.ts

key-files:
  created:
    - src/lib/shared/moon.ts
    - tests/unit/shared/moon.test.ts
  modified: []

key-decisions:
  - "Hand-rolled algorithm chosen over npm library to keep BUNDLE-SIZE threat mitigated (T-07-04). Implementation is 30 lines of math; a library would be additional bundle weight for a function this small."
  - "Reference epoch JD 2451550.1 (2000-01-06 18:14 UTC) with synodic length 29.530588853 days — standard NASA-published constants."
  - "Date input interpreted as 00:00 PT (08:00 UTC). PT-canonical alignment with dates.ts."
  - "Cosine wave maps phaseFraction → illumination: 0 → 0 (new), 0.5 → 1 (full). Smooth, deterministic, well within ±0.05 tolerance at every NASA/USNO 2026 anchor."

patterns-established:
  - "Pure-module pattern for moon math: same shape as dates.ts/slug.ts (no SQL, no fetch, no Date constructor, no Date.now())"
  - "Series helper iterates via dates.ts::addDays — never raw Date arithmetic"

requirements-completed: [MOON-03]

# Metrics
duration: 2min
completed: 2026-05-01
---

# Phase 7 Plan 1: Moon-illumination Pure Module Summary

**Hand-rolled deterministic moon-illumination function — synodic-month phase fraction (29.530588853 days) anchored on JD 2451550.1, cosine-wave mapped to [0,1], with a series helper iterating through dates.ts::addDays. 10/10 tests pass against NASA/USNO 2026 anchor dates. Zero new dependencies.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-01T20:48:53Z
- **Completed:** 2026-05-01T20:51:00Z (approx)
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files created:** 2

## Accomplishments

- `moonIllumination(s: string): number` — deterministic illumination fraction in [0, 1] for any YYYY-MM-DD date
- `moonIlluminationSeries(from, to): number[]` — one value per inclusive day, walking the range via `dates.ts::addDays`
- 10/10 unit tests passing under `vitest run`, covering: known full moons, known new moons, [0,1] bounds, determinism, single-day series, year-boundary crossing
- Zero new package dependencies added — `package.json` unchanged
- BUNDLE-SIZE threat (T-07-04) mitigated by hand-rolled algorithm

## Task Commits

Each task was committed atomically (TDD cycle):

1. **Task 1: Write failing tests for moon.ts (RED)** — `cf8e32e` (test)
2. **Task 2: Implement src/lib/shared/moon.ts (GREEN)** — `852feda` (feat)

No REFACTOR commit — implementation was already minimal and clean per the planner-locked algorithm.

## Files Created/Modified

- `src/lib/shared/moon.ts` (NEW, 60 lines incl. comments) — pure moon-illumination module: Julian Day → daysSinceRef → phaseFraction → cosine illumination
- `tests/unit/shared/moon.test.ts` (NEW, 54 lines) — 10 unit tests covering anchor dates, bounds, determinism, series shape, year boundary

## Algorithm Reference

**Synodic-month phase-fraction (Conway/Meeus-style):**

1. Reference new moon: `2000-01-06 18:14 UTC` → Julian Day `2451550.1`
2. Synodic month length: `29.530588853` days
3. For input `'YYYY-MM-DD'`:
   - Compute Julian Day at 00:00 PT (08:00 UTC) via Fliegel & Van Flandern algorithm (Gregorian-valid from 1582)
   - `daysSinceRef = JD - 2451550.1`
   - `phaseFraction = ((daysSinceRef mod synodic) + synodic) mod synodic) / synodic` — sign-corrected, in `[0, 1)`
   - `illumination = (1 - cos(2π · phaseFraction)) / 2` — cosine wave in `[0, 1]`

**Anchor verification (computed values at the four NASA/USNO test anchors):**

| Date         | Phase     | Computed | Threshold        | Margin |
| ------------ | --------- | -------- | ---------------- | ------ |
| 2026-01-03   | Full moon | 0.9986   | > 0.95 (must)    | +0.048 |
| 2026-04-01   | Full moon | 0.9900   | > 0.95 (must)    | +0.040 |
| 2026-01-18   | New moon  | 0.0002   | < 0.05 (must)    | +0.050 |
| 2026-04-16   | New moon  | 0.0057   | < 0.05 (must)    | +0.044 |

**Spot-check for non-anchor dates (in-bounds verification):**

| Date         | Computed |
| ------------ | -------- |
| 2024-06-15   | 0.6173   |
| 2025-12-25   | 0.2967   |
| 2026-04-30   | 0.9756   |
| 2030-07-04   | 0.1472   |

All values well within `[0, 1]`. No tolerance adjustments were needed.

## Decisions Made

- **Hand-rolled vs. library:** chose hand-rolled per CONTEXT D-07. The 30-line synodic approximation is more than accurate enough to clear the `>0.95` and `<0.05` thresholds at every NASA-anchored date (margins above are 4–5 percentage points). Adding a library would add bundle weight for no gain.
- **Date interpretation:** moon math accepts the same `YYYY-MM-DD` string format that flows through `dates.ts`. Input is interpreted as 00:00 PT (08:00 UTC), giving a consistent anchor for all PT-canonical date strings. This honors the CLAUDE.md "single date producer" rule — moon.ts emits no date strings, only consumes them.
- **No `new Date()` use:** parsing follows `dates.ts:37` exactly (`s.split('-').map(Number)`). Comments rephrased to "Date constructor" / "Date arithmetic" to avoid the literal substring `new Date(` in the file (acceptance criterion: `! grep -q "new Date("`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSDoc comments contained literal substring `new Date()` triggering acceptance-criterion grep**
- **Found during:** Task 2 (verifying acceptance criteria after implementation)
- **Issue:** Two JSDoc comments wrote "no `new Date()`" / "never `new Date()`" as descriptive prose. The acceptance criterion `! grep -q "new Date("` is a literal substring match and fails on comments containing the prohibited pattern, even though there is no actual `new Date(` call.
- **Fix:** Rephrased comments to "no Date constructor" / "never the Date constructor" — preserving meaning while satisfying the literal grep.
- **Files modified:** `src/lib/shared/moon.ts` (two comment lines)
- **Verification:** `grep -q "new Date(" src/lib/shared/moon.ts` returns no match; all 10 tests still pass.
- **Committed in:** `852feda` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Cosmetic — preserves the spirit of the no-Date-constructor rule and satisfies the literal acceptance grep. No scope creep.

## Issues Encountered

- `npm run test:unit` script does not exist in `package.json`. Available scripts are `test` (vitest watch) and `test:run` (vitest run). I used `npx vitest run tests/unit/shared/moon.test.ts` directly — equivalent behavior. The plan's verification command was approximate; this is not a deviation in code, only in the verification incantation.
- `npm run check` (svelte-check) reports 144 pre-existing TypeScript errors across `tests/unit/routes/home.test.ts`, `scripts/forecast-benchmark.ts`, `scripts/forecasts-rebuild.ts`. None reference moon.ts or moon.test.ts. Out of scope per the deviation-rules scope-boundary; logging here for the verifier.

## User Setup Required

None — pure module, no external service or environment configuration.

## Next Phase Readiness

- `src/lib/shared/moon.ts` is ready for consumption by Plan 07-03 (the explorer loader extension that emits a second `moonChartOption` when `filters.moon === true`).
- `moonIlluminationSeries(fromDate, toDate)` returns one value per inclusive day, exactly matching the bucket-key cardinality the catch chart already uses for daily granularity. For weekly/monthly granularity in Plan 07-03, the loader will index `expectedKeys` into the daily series (per PATTERNS.md).
- No blockers.

## Self-Check: PASSED

**Files exist:**
- `src/lib/shared/moon.ts` — FOUND
- `tests/unit/shared/moon.test.ts` — FOUND

**Commits exist:**
- `cf8e32e` (test: failing moon tests) — FOUND
- `852feda` (feat: moon implementation) — FOUND

**Tests pass:** `vitest run tests/unit/shared/moon.test.ts` — 10/10 passing.

**Acceptance criteria (all green):**
- File exists, exports both functions, no `new Date(` substring, no fetch/http/prisma/db., imports `addDays`/`daysBetween` from `./dates`, no new dependency in `package.json`/`package-lock.json`.

---
*Phase: 07-moon-phase-overlay*
*Plan: 01*
*Completed: 2026-05-01*
