---
phase: 07-moon-phase-overlay
verified: 2026-05-01T21:15:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
human_verification_resolved: 2026-05-01
human_verification_artifact: 07-HUMAN-UAT.md
human_verification:
  - test: "Click 'Moon' toggle on /explorer; verify the URL gains ?moon=1 and a 36px sine-curve row renders flush below the catch chart"
    expected: "URL becomes /explorer?ticker=boat&slug=...&range=1y&moon=1; second chart row visible immediately below catch chart with no gap; sine curve has thin slate line + light shading; toggle button shows accent (filled) state"
    why_human: "Visual contract — button state styling, sine curve rendering, color contrast, flush placement (0px gap), and 36px row height are all visual properties that grep-level checks cannot confirm"
  - test: "With moon overlay on, click 3M then 1M then 6M range buttons; verify the moon row repositions instantly with no DevTools Network request"
    expected: "Each range click updates both the catch chart and moon row in the same SvelteKit navigation tick; no flicker; no extra HTTP request fires (loader recomputes server-side, all in the SSR response); moon row stays vertically aligned with catch chart x-axis at every step"
    why_human: "Real-time reactive behavior — requires interactive browser session to observe network tab and visual sync"
  - test: "With moon overlay on, switch ticker boat → species → landing; verify moon stays on through every switch and the URL keeps moon=1"
    expected: "Each ticker switch preserves ?moon=1 in the URL and the moon row continues to render aligned with the new chart's x-axis; moon toggle remains in 'on' (accent-filled) visual state"
    why_human: "URL state propagation across cross-axis switches — the loader has a special rawMoon pre-parse path that's better verified through actual navigation than by reading code"
  - test: "Click 'Moon' to turn off; verify URL drops the moon param entirely (clean /explorer URL) and the moon row disappears with no leftover artifacts"
    expected: "URL goes from /explorer?...&moon=1 back to /explorer?ticker=boat&slug=...&range=1y (no moon= substring); the 36px row is entirely gone (no hidden div, no 0-height placeholder, no separator); page below catch chart looks byte-identical to Phase 6"
    why_human: "Off-state byte-identity is verified at SSR-data level by integration tests, but the visual 'no leftover artifacts' check (no spacing change, no hidden div) needs a human eye"
  - test: "Tab through ExplorerHeader on keyboard; verify Moon toggle is reachable in tab order between the last range button and (when range=custom) the from-date input, and announces correctly to a screen reader as 'switch, Show moon phases, on/off'"
    expected: "Tab order matches UI-SPEC §Accessibility Contract position 3-m; focus ring visible (4px accent); VoiceOver/NVDA announces role=switch with aria-checked state; pressing Space/Enter toggles moon"
    why_human: "Accessibility verification requires assistive-tech runtime testing"
  - test: "On a 375px-wide mobile viewport, verify the Moon toggle wraps below the RangeStrip on its own line (mt-2) and remains a 44px tall touch target"
    expected: "RangeStrip and MoonToggle stack vertically with 8px gap on mobile; toggle is min-44px tall; on ≥768px desktop, toggle sits inline to the right of RangeStrip with 8px gap"
    why_human: "Responsive breakpoint behavior at 375px requires actual viewport rendering"
  - test: "On a 5Y or All range with moon on, verify the moon row collapses to a 'fuzzy band' with lttb sampling — no fake smoothing, no visible artifacts at year boundaries"
    expected: "Per UI-SPEC D-06: at long ranges with monthly buckets, the sine becomes near-flat / fuzzy. This is the intended honest-resolution-loss behavior, not a bug."
    why_human: "Visual judgment of 'fuzzy band looks honest, not broken' is subjective"
---

# Phase 7: Moon-phase Overlay Verification Report

**Phase Goal:** An angler can toggle moon-phase markers onto the explorer chart's time axis to eyeball whether catch days line up with new / first-quarter / full / last-quarter moons.
**Verified:** 2026-05-01T21:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                          | Status     | Evidence                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | An angler sees a moon-phase toggle on the explorer (ROADMAP SC #1)                                                             | ✓ VERIFIED | `src/lib/components/ExplorerHeader.svelte:59-70` renders a `<button role="switch" aria-checked={moon}>` with `MOON_TOGGLE_LABEL` ('Moon') visible label inside Row 3 of the sticky header                           |
| 2   | Turning the toggle on adds moon-phase markers (sine curve representing illumination) on the chart's time axis (ROADMAP SC #1)  | ✓ VERIFIED | `src/routes/explorer/+page.server.ts:617-688` emits `moonChartOption` (locked UI-SPEC shape — line series with smooth/lttb/silent, no tooltip, animation:false). `+page.svelte:187-193` conditionally renders the second `<Chart>` at 36px height. Per D-01, four quarter phases are inferred from the curve (peak=full, trough=new, ascending zero=first-Q, descending zero=last-Q) — UI-SPEC explicit interpretation of MOON-02 via continuous sine |
| 3   | Markers stay correctly positioned when the angler changes the time range (ROADMAP SC #2)                                       | ✓ VERIFIED | Integration test "moon series re-aligns when range changes" (line 568-577 in explorer-moon.test.ts) — 1y vs 6m bucket counts differ, both still align with their catch chart; loader is pure-functional via `bucketKeyToDate` + `moonIllumination` mapping; no client fetch                                                                      |
| 4   | Markers stay correctly positioned when the angler changes the ticker (ROADMAP SC #2)                                           | ✓ VERIFIED | Integration test "moon flag persists when ticker changes" (line 580-587). `+page.svelte:50-51` `onTickerChange` preserves `&moon=1` URL param via `moonParam` literal; loader's cross-axis-default branch (`+page.server.ts:160-188`) carries `rawMoon` through                                                                              |
| 5   | No extra page load or API call needed (ROADMAP SC #2)                                                                          | ✓ VERIFIED | All moon math computed in loader (server-side) via pure `moonIllumination(date)` — no client HTTP call. `moon.ts` imports only `addDays`/`daysBetween` from dates.ts; `+page.svelte` imports type-only `EChartsOption` (erased) plus the static `MOON_ROW_ARIA` string — no runtime moon code in client bundle (T-07-14)              |
| 6   | With moon overlay off, the chart looks identical to Phase 6 — no leftover artifacts (ROADMAP SC #3)                            | ✓ VERIFIED | Three-layer guarantee: (1) integration tests "moonChartOption is null on clean URL" + "moonChartOption is null when ?moon=0" pass; (2) `+page.svelte:187` `{#if data.moonChartOption}` block emits no DOM when null (Svelte does not produce a placeholder); (3) `serializeExplorerFilters` (urlState.ts:309) only emits `moon=1` when truthy — clean URL byte-equal to Phase 6 |
| 7   | The MoonToggle uses role="switch" with aria-checked (NOT aria-pressed) per WAI-ARIA 1.2 binary toggle pattern                   | ✓ VERIFIED | `grep "aria-pressed=" ExplorerHeader.svelte` returns nothing; `role="switch"` and `aria-checked={moon}` both present at line 61-62                                                                                                                                                                                                          |
| 8   | All user-facing strings sourced from `src/lib/copy/moon.ts` (no hardcoded English in components)                               | ✓ VERIFIED | `grep -E '"Moon"\|"Show moon' ExplorerHeader.svelte` returns nothing; ExplorerHeader imports `MOON_TOGGLE_LABEL, MOON_TOGGLE_ARIA` from `$lib/copy/moon`; +page.svelte imports `MOON_ROW_ARIA`. The three constants exist verbatim in `copy/moon.ts:14-24`                                                                                  |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact                                              | Expected                                                                                                       | Status     | Details                                                                                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/shared/moon.ts`                              | Pure moon-illumination function (deterministic, PT-canonical date input)                                       | ✓ VERIFIED | 59 lines; exports `moonIllumination` + `moonIlluminationSeries`; imports `addDays`, `daysBetween` from `./dates`; no `new Date(`, no SQL/fetch         |
| `tests/unit/shared/moon.test.ts`                      | 10 unit tests — anchor dates, [0,1] bounds, determinism, series shape, year boundary                            | ✓ VERIFIED | 54 lines; 10 tests, all passing (verified via `npx vitest run`); covers four NASA/USNO 2026 anchor dates                                              |
| `src/lib/copy/moon.ts`                                | Three locked copy constants (toggle label, toggle aria, row aria) verbatim from UI-SPEC                        | ✓ VERIFIED | 24 lines; exports `MOON_TOGGLE_LABEL='Moon'`, `MOON_TOGGLE_ARIA='Show moon phases'`, `MOON_ROW_ARIA='Moon illumination over the same time range'`     |
| `src/lib/shared/urlState.ts` (modified)               | `boolFlagField` helper + `moon` field on RangeBase + `serializeExplorerFilters` omit-when-off                  | ✓ VERIFIED | `boolFlagField` defined line 252-255 (default-before-transform ordering); `moon: boolFlagField` on RangeBase line 261; `if (filters.moon) sp.set(...)` line 309 |
| `src/routes/explorer/+page.server.ts` (modified)      | Loader emits `moonChartOption: object \| null` (locked UI-SPEC shape when on, null when off); logger gains `moon` field | ✓ VERIFIED | Step 8b at lines 608-688; `moonChartOption: null` in 5 early-return branches + success branch; `moon: filters.moon` in logger line 698                |
| `src/lib/components/ExplorerHeader.svelte` (modified) | MoonToggle button (role=switch, aria-checked, copy from constants) inside Row 3                                | ✓ VERIFIED | 87 lines total; `moon` + `onMoonChange` props (lines 22-24, 36-38); MoonToggle markup lines 58-71 inside `md:flex md:items-start md:gap-2` wrapper    |
| `src/routes/explorer/+page.svelte` (modified)         | Conditional second `<Chart>` for moon row + `onMoonChange` handler                                             | ✓ VERIFIED | `formMoon` derived line 25; `onMoonChange` lines 63-74; conditional `<Chart>` at lines 187-193 with `height="36px"` and `ariaLabel={MOON_ROW_ARIA}`  |
| `tests/integration/routes/explorer-moon.test.ts`      | 7 integration tests — off-state identity, alignment, range-reposition, ticker switch, garbage rejection         | ✓ VERIFIED | 264 lines; 7 `it(` blocks; all 7 pass under `npx vitest run`                                                                                          |

### Key Link Verification

| From                            | To                              | Via                                            | Status   | Details                                                                                                            |
| ------------------------------- | ------------------------------- | ---------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `+page.server.ts`               | `$lib/shared/moon`              | `import { moonIllumination }`                  | ✓ WIRED  | Line 38; called at line 649 inside `expectedKeys.map(...)`                                                          |
| `+page.server.ts moonChartOption` | catch chart `expectedKeys`      | `expectedKeys.map(bucketKeyToDate)` for alignment | ✓ WIRED  | Line 649 reuses the same `expectedKeys` array assigned to catch chart `xAxis.data` (line 602) — bucket alignment guaranteed |
| `ExplorerHeader.svelte`         | `$lib/copy/moon`                | `import { MOON_TOGGLE_LABEL, MOON_TOGGLE_ARIA }` | ✓ WIRED  | Line 6; both constants used in MoonToggle markup                                                                  |
| `+page.svelte`                  | `$lib/copy/moon`                | `import { MOON_ROW_ARIA }`                     | ✓ WIRED  | Line 11; passed as `ariaLabel` prop on moon `<Chart>`                                                              |
| `+page.svelte`                  | `ExplorerHeader`                | `moon` + `onMoonChange` props                  | ✓ WIRED  | Lines 150, 154 in `<ExplorerHeader>` element                                                                       |
| `urlState.ts boolFlagField`     | `ExplorerFiltersSchema.moon`    | `RangeBase.moon = boolFlagField`               | ✓ WIRED  | Line 261; intersection with TickerVariant produces `ExplorerFilters` with `moon: boolean`                          |
| `serializeExplorerFilters`      | URL                             | conditional `sp.set('moon', '1')`              | ✓ WIRED  | Line 309 — only emits when `filters.moon` truthy                                                                   |

### Data-Flow Trace (Level 4)

| Artifact                                  | Data Variable          | Source                                                                                                | Produces Real Data | Status      |
| ----------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `+page.server.ts moonChartOption.series.data` | `moonData` array       | `expectedKeys.map((key) => moonIllumination(bucketKeyToDate(key)))` — pure deterministic computation  | Yes                | ✓ FLOWING   |
| `+page.svelte` moon `<Chart>` `option`    | `data.moonChartOption` | Loader `return { ..., moonChartOption }` (line 708)                                                   | Yes (when moon=on) | ✓ FLOWING   |
| `MoonToggle aria-checked`                 | `moon` prop            | `+page.svelte` `formMoon = $derived(filters.moon ?? false)` from loader-resolved filters              | Yes                | ✓ FLOWING   |
| `+page.server.ts filters.moon`            | `filters.moon`         | `parseExplorerFilters(url.searchParams)` via Zod `boolFlagField` schema                                | Yes (Zod-validated) | ✓ FLOWING   |

### Behavioral Spot-Checks

| Behavior                                                                | Command                                                                                                  | Result        | Status |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| moon.ts unit tests pass (10 tests, NASA/USNO anchor dates)              | `npx vitest run tests/unit/shared/moon.test.ts`                                                          | 10/10 passing | ✓ PASS |
| urlState.ts moon-field tests pass (10 new + 47 existing)                | `npx vitest run tests/unit/shared/urlState.test.ts`                                                      | 57/57 passing | ✓ PASS |
| explorer-moon integration tests pass (7 cases)                          | `npx vitest run tests/integration/routes/explorer-moon.test.ts`                                          | 7/7 passing   | ✓ PASS |
| TypeScript check passes on all Phase 7 files                            | `npm run check` filtered to phase-7 files                                                                | 0 errors      | ✓ PASS |
| `serializeExplorerFilters({moon:false}).toString()` omits `moon=` substring | (covered by urlState test "serializeExplorerFilters omits moon param when off")                          | Confirmed     | ✓ PASS |
| moon series length === catch xAxis.data length (alignment guarantee)    | (covered by integration test "moonChartOption is present when ?moon=1" — `expect(moonValues).toBe(catchBuckets)`) | Confirmed     | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan         | Description                                                                                                                                | Status      | Evidence                                                                                                                                                                                                            |
| ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MOON-01     | 07-02-PLAN, 07-03-PLAN | User can toggle moon-phase markers on/off on the chart's time axis                                                                          | ✓ SATISFIED | URL field `moon: boolean` (urlState.ts), MoonToggle button (ExplorerHeader.svelte role=switch), `onMoonChange` handler (+page.svelte navigates with new moon state); 7 integration tests cover the toggle round-trip |
| MOON-02     | 07-03-PLAN          | When enabled, new / first-quarter / full / last-quarter moons appear as markers (icons or background shading) on the time axis             | ✓ SATISFIED | Per D-01 design decision: continuous sine curve via `moonChartOption` represents illumination; quarters are visually present as zero-crossings (peak=full, trough=new, ascending zero=first-Q, descending zero=last-Q). UI-SPEC explicitly maps this to MOON-02. The "background shading" alternative is satisfied via `areaStyle: rgba(203,213,225,0.35)` under the curve. Note: a human verification item below confirms the visual interpretation lands correctly with a real angler |
| MOON-03     | 07-01-PLAN          | Moon-phase data is computed deterministically from the date (no API call, no DB column required)                                            | ✓ SATISFIED | `src/lib/shared/moon.ts` is pure (no fetch, no DB, no `new Date(`); deterministic per unit tests "is deterministic across repeated calls"; 10/10 anchor-date tests pass against NASA/USNO 2026 reference dates    |

**Cross-reference check:** REQUIREMENTS.md maps MOON-01, MOON-02, MOON-03 to Phase 7. PLAN frontmatter sums: 07-01 (MOON-03), 07-02 (MOON-01), 07-03 (MOON-01, MOON-02). All 3 IDs accounted for. **No orphaned requirements.**

### Anti-Patterns Found

| File                                          | Line | Pattern                                | Severity | Impact                                                                                              |
| --------------------------------------------- | ---- | -------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `src/routes/explorer/+page.server.ts`         | 635  | `new Date(Date.UTC(year, 0, 4))`       | ℹ️ Info  | Used inside `bucketKeyToDate` for ISO-week-Monday computation. NOT in `moon.ts` (which is pure). The Date constructor here is acceptable: it operates on a parsed integer year (already validated upstream), uses UTC explicitly, and is bounded to converting a YYYY-Www bucket label into a YYYY-MM-DD string for `moonIllumination`. Does not violate CLAUDE.md "single date producer" because this is internal date-string conversion, not a new date emission. Documented in 07-03-SUMMARY |

No TODO/FIXME/HACK/PLACEHOLDER comments in any Phase 7 file. No empty implementations. No `console.log`-only stubs. No hardcoded English strings in components.

### Pre-Existing Test Failure (Out of Scope)

`tests/unit/scripts/forecast-benchmark.test.ts` has one failing test predating Phase 7 (commit cc174a0 — TDD-RED artifact for v1 forecasting code retiring in Phase 10). This is **not caused by Phase 7 work** and does not block the phase per the user's note. All 17 Phase 7 tests pass; total project-wide pass rate is 617/618.

### Human Verification Required

Phase 7 is a visual feature with strong automated backing — all SSR-data contracts are tested at the loader boundary (off-state byte-identity, alignment, range-reposition, ticker persistence, garbage rejection) — but the actual angler-facing experience (button visuals, sine-curve appearance, flush placement, responsive behavior, accessibility runtime) requires a human eye in the browser. See `human_verification` block in frontmatter for the seven detailed checks.

### Gaps Summary

No gaps. All eight observable truths verified, all artifacts present and substantive, all key links wired, all data flows real (deterministic computation from validated date strings), all 17 Phase 7 tests passing, all three requirements (MOON-01, MOON-02, MOON-03) satisfied, no anti-patterns, no orphaned requirements. The phase ships goal-complete pending the seven human verification items above.

**Status is `human_needed` (not `passed`)** because Phase 7 is fundamentally a visual + interactive feature: the toggle's accent state, the sine curve's appearance under various ranges, the flush 0px placement, mobile responsive wrap, screen-reader announcement of role=switch, and the "fuzzy band" honest-resolution-loss judgment at 5Y/All cannot be verified by grep or unit tests. The automated layer is comprehensive (it proves the *contracts* hold); the human layer confirms the *experience* lands.

---

_Verified: 2026-05-01T21:15:00Z_
_Verifier: Claude (gsd-verifier)_
