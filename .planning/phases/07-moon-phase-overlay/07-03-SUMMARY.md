---
phase: 07-moon-phase-overlay
plan: 03
subsystem: explorer-route
tags:
  - phase-7
  - moon
  - explorer
  - sveltekit
  - echarts
  - integration-test

# Dependency graph
requires:
  - phase: 07-moon-phase-overlay
    provides: src/lib/shared/moon.ts (moonIllumination), src/lib/copy/moon.ts (3 constants), src/lib/shared/urlState.ts (moon: boolean field + omit-when-off serialization)
  - phase: 06-explorer-foundation
    provides: /explorer route, Chart.svelte, ExplorerHeader.svelte, RangeStrip.svelte (visual twin), expectedKeys gap-fill
provides:
  - moonChartOption (object | null) on PageData — emitted by /explorer loader when filters.moon === true
  - MoonToggle button (role=switch, aria-checked, copy from $lib/copy/moon) inside ExplorerHeader Row 3
  - Moon row sub-chart rendered flush below the catch chart at 36px when filters.moon
  - Off-state byte-identity guarantee enforced by SSR: no moon DOM, no moon param in URL, no echarts moon code in client bundle
affects:
  - phase 8 (sharing) — moon=1 will appear in shareable URLs end-to-end
  - phase 11 (polish) — moon copy module is ready for any locale/style sweep

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Loader-shapes-second-chartOption for additive overlays (Phase 7 establishes the precedent — emit a sibling chart option only when toggle is on; reuse expectedKeys for axis alignment)"
    - "URL-as-state-via-omit-when-off carry-through: ExplorerHeader.moon prop propagates through every navigation handler (range, ticker, custom-dates, selector, moon)"
    - "EChartsOption type cast in svelte page (import type erased at compile time; preserves T-07-14 — no moon math ships to client)"

key-files:
  created:
    - tests/integration/routes/explorer-moon.test.ts
  modified:
    - src/routes/explorer/+page.server.ts
    - src/lib/components/ExplorerHeader.svelte
    - src/routes/explorer/+page.svelte

key-decisions:
  - "moon series uses moonIllumination(perBucketDate) — NOT moonIlluminationSeries(from, to) — because expectedKeys are non-contiguous on weekly/monthly granularity. Mapping each bucket key directly preserves alignment without re-walking the daily series."
  - "Added bucketKeyToDate helper inside the loader: handles YYYY-MM-DD (use as-is), YYYY-MM (first of month), YYYY-Www (Monday of ISO week). UI-SPEC D-06 explicitly accepts the fuzzy band on long ranges."
  - "Wrapper for RangeStrip + MoonToggle uses md:flex md:items-start md:gap-2 (the gap-2 supplies the 8px desktop gap from UI-SPEC §Spacing). The toggle wrapper itself uses mt-2 md:mt-0 — md:ml-2 is dropped to avoid a double-margin bug now that the parent provides the gap. Visual contract identical."
  - "Cast moonChartOption to EChartsOption inside +page.svelte via `import type { EChartsOption } from 'echarts'`. The type-only import is fully erased at compile time, so T-07-14 (no moon code in client bundle) is preserved. Loader keeps `let moonChartOption: object | null = null` as required by acceptance criteria."
  - "All 5 early-return branches in the loader gained `moonChartOption: null` to keep PageData type stable when the chart cannot be built."

patterns-established:
  - "Sibling chart option pattern: loader emits chartOption + moonChartOption (object | null); page renders second <Chart> conditionally with no wrapper margin"
  - "Bucket-key-to-date helper for non-daily granularities (carries forward to any future date-anchored overlay)"

requirements-completed:
  - MOON-01
  - MOON-02

# Metrics
duration: 6min
completed: 2026-05-01
---

# Phase 7 Plan 03: Wire moon overlay end-to-end Summary

**Loader emits a second `moonChartOption` (locked UI-SPEC shape, plain JSON, no echarts import) when `filters.moon === true`; ExplorerHeader Row 3 gains a `role="switch"` MoonToggle pill (copy from `$lib/copy/moon.ts`, visual twin of RangeStrip); +page.svelte conditionally renders a 36px Chart flush below the catch chart. 7 new integration tests prove off-state identity, on-state bucket alignment, range-reposition without client refetch, ticker-switch persistence, and `?moon=garbage` rejection. All Phase 7 success criteria met.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-01T20:59:35Z
- **Completed:** 2026-05-01T21:06:20Z (approx)
- **Tasks:** 3 (atomic commits per task)
- **Files created:** 1 (test)
- **Files modified:** 3 (loader, header component, page component)

## Accomplishments

- `/explorer` loader emits `moonChartOption: null` when off and the locked UI-SPEC shape (grid flush to catch grid; xAxis category data === expectedKeys; yAxis [0,1] hidden; single line series with smooth/lttb/silent/animation:false; tooltip:show:false; top-level animation:false) when on.
- `bucketKeyToDate` helper inside the loader converts daily / weekly-ISO / monthly bucket keys to YYYY-MM-DD anchors so `moonIllumination` returns one value per bucket aligned 1:1 with the catch chart's xAxis.
- `locals.logger?.info({ msg: 'explorer_loaded', ... })` gained a `moon: filters.moon` boolean field (T-06-31 carry-forward — boolean, no PII).
- ExplorerHeader Row 3 layout: a new flex wrapper holds RangeStrip + MoonToggle side-by-side on desktop and stacked on mobile; the `{#if range === 'custom'}` CustomDateInputs block stays below the wrapper unchanged.
- MoonToggle markup: `role="switch"`, `aria-checked={moon}`, `aria-label={MOON_TOGGLE_ARIA}`, visible label `{MOON_TOGGLE_LABEL}`. Same pill geometry as RangeStrip buttons (`min-h-11 shrink-0 rounded border px-3 py-2 text-sm font-semibold transition-colors`). State matrix mirrors RangeStrip's selected/unselected exactly.
- +page.svelte: imports `MOON_ROW_ARIA` and `EChartsOption` (type-only — erased), derives `formMoon`, defines `onMoonChange` (preserves every other filter, navigates via existing `navigate(f)` pattern), passes `moon` + `onMoonChange` to ExplorerHeader, renders a second `<Chart>` flush below the catch chart conditional on `data.moonChartOption`.
- Off-state DOM: when `data.moonChartOption` is null/undefined, the `{#if}` block is entirely skipped — no `<Chart>` instance, no wrapper div, no `display:none`. Combined with Plan 02's URL omit-when-off, the off-state contract is byte-identical to Phase 6.
- 7 new integration tests in `tests/integration/routes/explorer-moon.test.ts` covering off-state, alternate literal forms (`?moon=1`, `?moon=true`), garbage rejection, on-state bucket alignment, range-reposition without re-fetch, and ticker-switch persistence. All 7 pass.

## Task Commits

1. **Task 1: Loader emits moonChartOption** — `68e3cf9` (feat)
2. **Task 2: MoonToggle in ExplorerHeader + sub-chart in page** — `7ba80cd` (feat)
3. **Task 3: 7 integration tests** — `f77413e` (test)

## Files Created/Modified

- `src/routes/explorer/+page.server.ts` (modified) — Step 8b moonChartOption build (~80 lines added inside the load function), `moon: filters.moon` field added to both logger calls, `moonChartOption: null` added to all 5 early-return branches and the empty-result branch + moonChartOption added to the success return shape.
- `src/lib/components/ExplorerHeader.svelte` (modified) — moon copy import, `moon` + `onMoonChange` props (added to both destructure and type literal), Row 3 markup wrapped in `md:flex md:items-start md:gap-2` container with the MoonToggle button as a sibling of `<RangeStrip>`.
- `src/routes/explorer/+page.svelte` (modified) — `MOON_ROW_ARIA` and `EChartsOption` (type) imports, `formMoon` derived, `onMoonChange` handler, ExplorerHeader prop additions (`moon={formMoon}`, `{onMoonChange}`), conditional `<Chart>` for moon row immediately after the catch `<Chart>` and immediately before the caption.
- `tests/integration/routes/explorer-moon.test.ts` (created, 264 lines) — full integration harness mirroring `tests/integration/explorer-routes.test.ts` (in-memory DB seed, getDb mock, direct load() call). 7 test cases.

## Loader Step 8b shape

```typescript
let moonChartOption: object | null = null;
if (filters.moon) {
  function bucketKeyToDate(key: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;        // daily
    if (/^\d{4}-\d{2}$/.test(key)) return `${key}-01`;       // monthly
    const m = /^(\d{4})-W(\d{2})$/.exec(key);                // weekly (ISO)
    if (m) { /* compute Monday of ISO week */ }
    return fromDate;
  }
  const moonData = expectedKeys.map((key) => moonIllumination(bucketKeyToDate(key)));
  moonChartOption = {
    grid: { left: chartOption.grid?.left ?? 'auto', right: chartOption.grid?.right ?? 'auto', top: 0, bottom: 0 },
    xAxis: { type: 'category', data: expectedKeys, show: false, /* axisLine/Tick/splitLine all false */ },
    yAxis: { type: 'value', min: 0, max: 1, show: false, splitLine: { show: false } },
    series: [{
      type: 'line', smooth: true, showSymbol: false, sampling: 'lttb',
      lineStyle: { color: 'var(--color-text-muted)', width: 1.5 },
      areaStyle: { color: 'rgba(203, 213, 225, 0.35)' },
      data: moonData, silent: true, animation: false
    }],
    tooltip: { show: false }, animation: false
  };
}
```

## ExplorerHeader Row 3 final markup

```svelte
<div class="py-2 md:py-3">
  <div class="md:flex md:items-start md:gap-2">
    <RangeStrip value={range} onChange={onRangeChange} />
    <div class="mt-2 md:mt-0 inline-flex">
      <button
        type="button"
        role="switch"
        aria-checked={moon}
        aria-label={MOON_TOGGLE_ARIA}
        onclick={() => onMoonChange(!moon)}
        class="min-h-11 shrink-0 rounded border px-3 py-2 text-sm font-semibold transition-colors {moon
          ? 'bg-(--color-accent) text-white border-(--color-accent) hover:bg-(--color-accent-hover) hover:border-(--color-accent-hover)'
          : 'bg-(--color-surface) text-(--color-text-muted) border-(--color-border) hover:bg-(--color-accent-bg) hover:text-(--color-accent) hover:border-(--color-accent)'}"
      >
        {MOON_TOGGLE_LABEL}
      </button>
    </div>
  </div>
  {#if range === 'custom'}
    <CustomDateInputs bind:fromDate bind:toDate onSubmit={onCustomDates} {clampNote} />
  {/if}
</div>
```

## Decisions Made

- **`moonIllumination` per-bucket vs `moonIlluminationSeries`:** chose per-bucket via `expectedKeys.map(moonIllumination(bucketKeyToDate(key)))`. Rationale: on weekly/monthly granularity, expectedKeys are non-contiguous (e.g., `2025-W42`, `2026-M01`). Mapping each bucket directly produces one illumination value per visible bucket — exact alignment with the catch chart's xAxis. `moonIlluminationSeries(fromDate, toDate)` would return one value per inclusive day, which then needs index-mapping back into expectedKeys; the per-bucket approach is simpler and equivalent.
- **Wrapper class shape:** UI-SPEC suggested `mt-2 md:mt-0 md:ml-2 inline-flex` for the toggle wrapper alone. We used `md:flex md:items-start md:gap-2` on a parent element + `mt-2 md:mt-0 inline-flex` on the toggle. This is a small cosmetic deviation from UI-SPEC's suggestion, deliberately chosen to avoid a double-margin bug (parent gap + child margin). Visual outcome is identical: 8px desktop gap, mobile wrap. Plan §Action Step 3 anticipated and authorized this exact substitution.
- **EChartsOption cast in +page.svelte:** the loader's acceptance criterion explicitly requires `let moonChartOption: object | null = null` (the typed declaration). That widens the type as it flows through PageData, so `<Chart option={...}/>` would error. Solution: `import type { EChartsOption } from 'echarts'` and cast `data.moonChartOption as EChartsOption`. Type-only imports are erased — T-07-14 (no moon code in client bundle) is preserved.
- **Logger field added in BOTH the empty-result branch and the success branch:** the empty-result logger predates Phase 7 and lives at a different return site than the success logger. Adding `moon: filters.moon` to both keeps the field consistent in operator queries.
- **`moonChartOption: null` added to all 5 early-return branches:** keeps the PageData type stable. Without this, `data.moonChartOption` would be undefined in some branches and null/object in others, complicating the `{#if data.moonChartOption}` narrowing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Worktree was based on stale main commit (fb6e466), not the post-wave-1 base (a9413d1)**
- **Found during:** worktree branch check at start of execution
- **Issue:** `git merge-base HEAD a9413d1f` returned `fb6e466`, meaning the worktree was created from a base prior to wave-1's merged work. Without the reset, `src/lib/shared/moon.ts`, `src/lib/copy/moon.ts`, and the `moon: boolean` URL field would all be missing.
- **Fix:** `git reset --hard a9413d1f45c1b05f7bc0052477c744b34bca7ac6` (per worktree_branch_check protocol). Verified wave-1 deps are present after reset.
- **Files modified:** none (worktree base correction only)
- **Verification:** all three wave-1 outputs present; HEAD == a9413d1f.

**2. [Rule 2 — Type Correctness] PageData type narrowing across return branches**
- **Found during:** Task 1 npm run check
- **Issue:** Five early-return branches in the loader returned objects without `moonChartOption`. SvelteKit's `$types` inference produces a union, so `data.moonChartOption` would be `object | null | undefined` across branches — untidy and prone to subtle bugs.
- **Fix:** Added `moonChartOption: null` to all 5 early-return branches and the empty-result branch (6 total locations).
- **Files modified:** `src/routes/explorer/+page.server.ts`
- **Verification:** `npm run check` shows no errors in the loader; `data.moonChartOption` narrowed cleanly by `{#if data.moonChartOption}` in +page.svelte.
- **Committed in:** `68e3cf9` (Task 1).

**3. [Rule 2 — Type Correctness] Chart prop expected `EChartsOption`, loader emits `object | null`**
- **Found during:** Task 2 npm run check after wiring the moon `<Chart>` in +page.svelte
- **Issue:** `Chart.svelte`'s `option` prop is typed `EChartsOption`. The loader's `let moonChartOption: object | null = null` (required by acceptance criterion) widens to `object` after the `{#if}` narrowing, which TS rejects against `EChartsOption`.
- **Fix:** Added `import type { EChartsOption } from 'echarts'` to +page.svelte (type-only, erased at compile time) and cast `data.moonChartOption as EChartsOption` at the call site. T-07-14 preserved because nothing from echarts ships at runtime via this import.
- **Files modified:** `src/routes/explorer/+page.svelte`
- **Verification:** `npm run check` clean for explorer files.
- **Committed in:** `7ba80cd` (Task 2).

**4. [Rule 3 — Blocking] Plan referenced `tests/integration/routes/` directory that did not exist**
- **Found during:** Task 3 — listing the integration test directory
- **Issue:** Plan §Step 1 said to enumerate `tests/integration/routes/`. The directory does not exist; existing integration tests live directly in `tests/integration/`. The plan's `files_modified` frontmatter explicitly lists `tests/integration/routes/explorer-moon.test.ts`.
- **Fix:** Honored the plan path. Created the directory `tests/integration/routes/` and placed the new test there. Adjusted relative imports accordingly (`../../helpers/...` → `../../../src/...`). Mirrored the harness from `tests/integration/explorer-routes.test.ts`.
- **Files modified:** new directory + new test file.
- **Verification:** all 7 new tests pass; existing 167 tests still pass.

---

**Total deviations:** 4 auto-fixed (1 worktree-base, 2 type-correctness, 1 path mismatch)
**Impact on plan:** None expand scope. The worktree reset is mandatory protocol. The two type fixes are TypeScript correctness on the additive shape. The directory creation honors the plan's stated path verbatim.

## Threat Surface Verification

| Threat ID | Mitigation Confirmed | Evidence |
|-----------|----------------------|----------|
| T-07-09 (Tampering — moon=garbage) | yes | Test "falls back to default-off when ?moon=garbage" passes — Zod safeParse rejects, loader's existing safeParse-error branch returns defaults (moon: false). |
| T-07-10 (XSS in MoonToggle markup) | yes | aria-label and visible label come from `$lib/copy/moon.ts` (static literals); `aria-checked={moon}` from typed boolean — Svelte auto-escapes. No string interpolation of user input. |
| T-07-11 (Off-state integrity) | yes | Test "moonChartOption is null on clean URL" + the `{#if data.moonChartOption}` block in +page.svelte (Svelte does not emit a placeholder when the condition is false) + Plan 02's URL omit-when-off. Three-layer guarantee. |
| T-07-12 (Information Disclosure via logger) | yes | Added field is `moon: filters.moon` — a boolean. No PII. |
| T-07-13 (DoS via large ranges) | accept | series[0].data length bounded by expectedKeys (Phase 6 D-19 range clamping). All-time ≈ 60 monthly buckets. lttb sampling further reduces visual rendering cost. |
| T-07-14 (Bundle size — no moon code in client) | yes | `moon.ts` is imported only by `+page.server.ts`. The +page.svelte side imports `MOON_ROW_ARIA` (string constant) and `type { EChartsOption }` (erased). Vite tree-shakes server-only modules out of the client bundle. |

No new threat surface beyond what the plan's threat_model anticipated.

## Phase 7 Success Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Toggle works (MOON-01) | yes | MoonToggle button in ExplorerHeader Row 3; clicking flips `aria-checked` and navigates via `onMoonChange` → `navigate({...filters, moon: !moon})`. |
| Markers correctly positioned (MOON-02) | yes | Test "moonChartOption is present when ?moon=1 (alignment guaranteed)" — moonChartOption.series[0].data.length === chartOption.xAxis.data.length. |
| Markers reposition without re-fetch | yes | Test "moon series re-aligns when range changes" — 1y vs 6m produce different bucket counts; both align with their catch chart. Loader is pure-functional; no client fetch. |
| Off-state identical to Phase 6 | yes | Test "moonChartOption is null on clean URL"; Plan 02's URL omit-when-off; `{#if data.moonChartOption}` block skipped entirely (no DOM). Three-layer guarantee. |
| All strings sourced from copy/moon.ts | yes | `! grep -E '"Moon"|"Show moon' src/lib/components/ExplorerHeader.svelte` passes; only the comment `<!-- Row 3: Range strip + Moon toggle -->` mentions "Moon" and that's not user-facing. |
| role="switch" + aria-checked | yes | grep confirms; aria-pressed not present. |
| npm run check clean | yes (modified files) | 144 pre-existing errors in unrelated files; 0 errors in explorer-route, ExplorerHeader, +page.svelte, moon.ts, copy/moon.ts. |
| npm test green | yes | 174/174 tests pass (7 new + all existing). |

## Manual Smoke Verification

A live browser smoke was not run from inside the worktree (the integration test suite covers all observable behaviors at the SSR boundary, and the orchestrator merges back to main before any user-facing preview is meaningful). The 7 integration tests collectively prove:

- **Toggle on (`?moon=1`):** `data.moonChartOption !== null` and series length matches catch xAxis (alignment guarantee). The `{#if data.moonChartOption}` block in +page.svelte renders the second Chart at 36px flush below the catch Chart.
- **Toggle off (clean URL):** `data.moonChartOption === null`. The `{#if}` block emits no DOM. URL has no `moon=` substring (Plan 02 contract).
- **Range change with moon on (1y → 6m):** Different bucket counts, both still aligned. Loader recomputes; client does not fetch.
- **Ticker switch with moon on (boat → species):** `filters.moon` remains true after the switch — preserved through the cross-axis-default branch via the existing `rawMoon` literal pre-parse from Plan 02.
- **Garbage rejection (`?moon=garbage`):** Falls back to default off. No error surfaced to user.

## Issues Encountered

- 144 pre-existing TypeScript errors in unrelated test files (`tests/unit/routes/date.test.ts`, `tests/unit/routes/home.test.ts`) and `scripts/forecast-benchmark.ts` / `scripts/forecasts-rebuild.ts`. These are out-of-scope per scope-boundary rule; the error count did not increase from my changes.
- Pre-existing svelte-check warnings on `compare/+page.svelte`, `picker/+page.svelte`, `trends/+page.svelte` ("This reference only captures the initial value of `data`") — out of scope, not in any file I touched.

## User Setup Required

None — pure server + UI wiring; no environment configuration, no migrations, no external services.

## Next Phase Readiness

Phase 7 ships complete. Wave 2 closes the phase:
- MOON-01 (toggle) — done.
- MOON-02 (visualization) — done.
- MOON-03 (pure module) — done in Plan 01.
- All three Phase 7 success criteria met.

Phase 8 (sharing) can now build on top of:
- The off-state-clean-URL guarantee (`/explorer` is byte-identical to Phase 6).
- The on-state share URL (`/explorer?ticker=...&slug=...&range=...&moon=1`) is already a fully-typed Zod-validated filter set.

## Self-Check: PASSED

**Files exist:**
- `src/routes/explorer/+page.server.ts` — FOUND (modified)
- `src/lib/components/ExplorerHeader.svelte` — FOUND (modified)
- `src/routes/explorer/+page.svelte` — FOUND (modified)
- `tests/integration/routes/explorer-moon.test.ts` — FOUND (created)

**Commits exist:**
- `68e3cf9` (feat: loader emits moonChartOption) — FOUND
- `7ba80cd` (feat: MoonToggle + sub-chart wired) — FOUND
- `f77413e` (test: 7 integration tests) — FOUND

**Tests pass:** all 7 new tests + 167 pre-existing tests = 174 / 174.

**Acceptance criteria (all green):**
- Task 1: 12/12 grep checks + check exits 0 in modified files
- Task 2: 17/17 grep checks + check exits 0 in modified files
- Task 3: 7/7 acceptance criteria + 7/7 tests pass

---
*Phase: 07-moon-phase-overlay*
*Plan: 03*
*Completed: 2026-05-01*
