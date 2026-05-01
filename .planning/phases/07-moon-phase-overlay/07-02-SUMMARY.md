---
phase: 07-moon-phase-overlay
plan: 02
subsystem: ui
tags:
  - phase-7
  - moon
  - url-state
  - zod
  - copy
  - svelte

# Dependency graph
requires:
  - phase: 06-explorer-foundation
    provides: ExplorerFiltersSchema, RangeBase, serializeExplorerFilters, /explorer route + page.server load() pattern
provides:
  - moon: boolean field on ExplorerFiltersSchema (default off; URL-as-state)
  - boolFlagField helper accepting URL flags `1|0|true|false`
  - serializeExplorerFilters omit-when-off behaviour for clean default-landing URL (D-04)
  - src/lib/copy/moon.ts with three locked copy constants (label, toggle aria, row aria)
affects:
  - 07-03-PLAN — consumes ExplorerFilters.moon for MoonRow visibility + writes via toggle handler
  - phase 8 (sharing) — share URL contract now includes optional ?moon=1
  - phase 11 (polish) — moon copy lives in dedicated module, ready for any future locale/style sweep

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zod `.default('false')` placed BEFORE `.transform()` so default flows through transform → boolean (avoids returning the literal string 'false')"
    - "URL-as-state with omit-when-off discipline for boolean flags (D-04 clean URL): emit `param=1` only when on; default-landing URL byte-equal to Phase 6"
    - "Per-feature copy module pattern (one .ts file per feature surface) — moon.ts joins metrics.ts; keeps per-angler-discipline lint allowlist scoped"

key-files:
  created:
    - src/lib/copy/moon.ts
  modified:
    - src/lib/shared/urlState.ts
    - src/routes/explorer/+page.svelte
    - src/routes/explorer/+page.server.ts
    - tests/unit/shared/urlState.test.ts

key-decisions:
  - "boolFlagField is a NEW helper — kept separate from existing boolStringField because UI-SPEC requires `?moon=1` shorthand which boolStringField (true|false only) does not accept"
  - "Default placed BEFORE transform: `z.enum(...).default('false').transform(...)`. Putting `.default()` after `.transform()` yields the raw string default, not the transformed boolean"
  - "Existing call sites in +page.svelte / +page.server.ts now pass moon explicitly through the typed ExplorerFilters constructions; cross-axis ticker switch preserves rawMoon via a loose URL pre-parse (full Zod validation still runs in the normal parse branch)"
  - "moon.ts is a separate copy module (not extension of metrics.ts) per UI-SPEC and PATTERNS — keeps the per-angler-discipline lint allowlist from silently widening"

patterns-established:
  - "boolFlagField helper: URL boolean accepting 1|0|true|false, default-then-transform ordering"
  - "Off-state byte guarantee for clean-URL discipline: serialize emits param ONLY when truthy"

requirements-completed:
  - MOON-01

# Metrics
duration: 5min
completed: 2026-05-01
---

# Phase 7 Plan 02: URL Schema + Copy Constants Summary

**Extended ExplorerFiltersSchema with `moon: boolean` (default off, clean-URL omit-when-off serialization) and added three locked moon copy constants in a dedicated `copy/moon.ts` module — both foundation pieces consumed by Plan 03's MoonToggle and MoonRow.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-01T20:49:00Z
- **Completed:** 2026-05-01T20:54:01Z
- **Tasks:** 2 (Task 1 TDD: RED → GREEN; Task 2 single commit)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `boolFlagField` helper: accepts URL-style boolean flags `1|0|true|false`, default flows through transform via `.default('false')` placed BEFORE `.transform(...)`.
- `RangeBase` extended with `moon: boolFlagField`; the moon flag flows to `ExplorerFiltersSchema` via the existing intersection — no schema-shape rewrite needed.
- `serializeExplorerFilters` now emits `moon=1` ONLY when `filters.moon` is true. Off-state byte test confirms the URL contains no `moon=` substring when off.
- 10 new moon-field test cases pass (parse 1/0/true/false/garbage, serialize on/off, two round-trips). All 4 existing round-trip tests updated to include `moon: false` in fixtures (the inferred type now requires the field).
- `src/lib/copy/moon.ts` created with three locked constants verbatim from UI-SPEC §Copywriting Contract:
  - `MOON_TOGGLE_LABEL = 'Moon'`
  - `MOON_TOGGLE_ARIA = 'Show moon phases'`
  - `MOON_ROW_ARIA = 'Moon illumination over the same time range'`

## Task Commits

1. **Task 1 RED — failing moon-field URL contract tests** — `0a53a05` (test)
2. **Task 1 GREEN — moon flag added to ExplorerFiltersSchema** — `8a594b1` (feat)
3. **Task 2 — copy/moon.ts with three locked constants** — `332aa7d` (feat)

## Files Created/Modified

- `src/lib/copy/moon.ts` (created) — three locked copy constants for the moon overlay (toggle label, toggle aria, chart row aria)
- `src/lib/shared/urlState.ts` (modified) — `boolFlagField` helper added; `RangeBase` extended with `moon`; `serializeExplorerFilters` now has `if (filters.moon) sp.set('moon', '1')` guard before return
- `src/routes/explorer/+page.svelte` (modified) — navigation handlers (`onTickerChange`, `onRangeChange`, `onCustomDates`, `onSelectorChange`) now preserve `filters.moon` across SPA navigations
- `src/routes/explorer/+page.server.ts` (modified) — cross-axis-default branches now pass `moon: rawMoon` (loose pre-parse for the ticker-switch shorthand) and the empty-defaults branch passes `moon: false`
- `tests/unit/shared/urlState.test.ts` (modified) — 10 new moon tests appended; 4 existing round-trip fixtures updated with `moon: false` (type now requires the field)

## Decisions Made

- **`.default()` ordering:** Placed `.default('false')` BEFORE `.transform(...)` so the default value flows through the transform and yields the boolean `false`. The existing `boolStringField.default('false')` (line 103) has `.default()` after `.transform()` which produces a TypeScript error pre-existing in main; that line is out of scope for this plan but flagged below.
- **Loose moon pre-parse in +page.server.ts:** The cross-axis-default branch in the loader bypasses Zod (it constructs ExplorerFilters from raw URL params + DB queries). Added a tiny string check `rawMoonStr === '1' || rawMoonStr === 'true'` so a ticker-switch URL like `?ticker=species&range=1y&moon=1` preserves the moon flag through the cross-axis resolution. Full Zod validation still runs in the normal parse branch.
- **Verbatim copy:** Did NOT paraphrase. UI-SPEC §Copywriting Contract is locked.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Project test script is `test:run`, not `test:unit`**
- **Found during:** Task 1 RED test run
- **Issue:** Plan referenced `npm run test:unit -- urlState.test`; `package.json` only defines `test`, `test:run`, `check`, etc.
- **Fix:** Used `npx vitest run tests/unit/shared/urlState.test.ts` directly (equivalent to `npm run test:run -- tests/unit/shared/urlState.test.ts`). Verification recorded under acceptance criteria reflects the actual command run.
- **Files modified:** none (operational, not code)
- **Verification:** `npx vitest run tests/unit/shared/urlState.test.ts` → 57 passed
- **Committed in:** n/a (no code change required)

**2. [Rule 3 — Blocking] `.svelte-kit/tsconfig.json` missing in fresh worktree**
- **Found during:** Task 1 RED test run
- **Issue:** Vitest's tsconfig resolution failed because `tsconfig.json` extends `./.svelte-kit/tsconfig.json`, which is generated by `svelte-kit sync` and absent in a fresh worktree.
- **Fix:** Ran `npx svelte-kit sync` once before tests.
- **Files modified:** `.svelte-kit/` directory regenerated (gitignored — not committed).
- **Verification:** Tests now collect and run.
- **Committed in:** n/a (generated dir is gitignored)

**3. [Rule 1 — Bug + Rule 2 — Type Correctness] `.default()` placement caused string-typed default**
- **Found during:** Task 1 GREEN first run after schema change
- **Issue:** Initial implementation `z.enum(...).transform(...).default('false')` returned the raw string `'false'` (not boolean `false`) when the param was missing — 6 of 10 new tests + several round-trip tests failed.
- **Fix:** Reordered to `z.enum(...).default('false').transform(...)` so the default value flows through the transform.
- **Files modified:** `src/lib/shared/urlState.ts`
- **Verification:** All 57 urlState tests pass.
- **Committed in:** `8a594b1` (Task 1 GREEN)

**4. [Rule 1 — Type Inference Propagation] Existing call sites required `moon` field after schema change**
- **Found during:** Task 1 GREEN — type inference propagated across the codebase
- **Issue:** `ExplorerFilters` is now `{...; moon: boolean}`. Existing literal constructions in `+page.svelte` (4 call sites) and `+page.server.ts` (6 call sites) lacked the field; round-trip test fixtures (4) lacked it too.
- **Fix:** Added `moon: filters.moon` (preserving live state in svelte) and `moon: false` / `moon: rawMoon` (server-side defaults) to every literal construction. Test fixtures: `moon: false`.
- **Files modified:** `src/routes/explorer/+page.svelte`, `src/routes/explorer/+page.server.ts`, `tests/unit/shared/urlState.test.ts`
- **Verification:** `npm run check` shows no new errors in modified files; 23/23 explorer route + integration tests pass.
- **Committed in:** `8a594b1` (Task 1 GREEN, same commit as schema change)

---

**Total deviations:** 4 auto-fixed (2 blocking infra, 1 bug, 1 type-inference propagation)
**Impact on plan:** All deviations were necessary to make the plan executable in the worktree; none expand scope. The schema-default reordering is a real Zod-v4 correctness fix that the plan's snippet did not anticipate.

## Threat Surface Verification

| Threat ID (from plan) | Mitigation Confirmed | Evidence |
|-----------------------|----------------------|----------|
| T-07-05 (Tampering — moon=garbage) | yes | Test "rejects moon=garbage" → safeParse failure → loader's existing safeParse-error path treats failure as default-off |
| T-07-06 (Info Disclosure) | accepted | Non-secret state; no PII |
| T-07-07 (XSS via copy/moon.ts) | yes | All three constants are static literals; no interpolation |
| T-07-08 (Off-state integrity) | yes | Test "serializeExplorerFilters omits moon param when off" asserts byte-level absence |

No new threat surface introduced beyond what the plan's threat_model anticipated.

## TDD Gate Compliance

- ✅ RED gate: `0a53a05 test(07-02): add failing moon-field URL contract tests` — 9 of 10 new tests fail at HEAD
- ✅ GREEN gate: `8a594b1 feat(07-02): add moon flag to ExplorerFiltersSchema (MOON-01)` — all tests pass
- N/A REFACTOR: no separate refactor pass needed; changes were minimal additive edits.

## Issues Encountered

- Pre-existing `boolStringField.default('false')` type error in `urlState.ts:103` — unrelated to this plan; left untouched (out-of-scope; documented here for future cleanup).
- Pre-existing TypeScript errors in unrelated test files (`tests/unit/routes/date.test.ts`, `tests/unit/routes/home.test.ts`) and `scripts/forecast-benchmark.ts` — total error count went DOWN from 154 (HEAD with RED tests) to 145 after my changes. No regressions introduced.

## Verification Snapshot

```
$ npx vitest run tests/unit/shared/urlState.test.ts
✓ 57 tests passed (47 existing + 10 new moon tests)

$ npx vitest run tests/unit/routes/explorer.test.ts tests/integration/explorer-routes.test.ts
✓ 23 tests passed

$ git diff src/lib/shared/urlState.ts | grep '^+' | wc -l
~12 (additive only — no large rewrites)

$ Off-state byte test: serializeExplorerFilters({...,moon:false}).toString()
→ 'ticker=boat&slug=pacific-voyager&range=1y' (no moon= substring)
```

## User Setup Required

None — no external service configuration; pure in-codebase TypeScript change.

## Next Phase Readiness

Ready for Plan 03 (the moon-overlay UI components) to consume:
- `filters.moon` as a typed boolean from `ExplorerFiltersSchema`
- `serializeExplorerFilters` to write moon-on URLs (`?...&moon=1`) and moon-off URLs (no `moon=`)
- `MOON_TOGGLE_LABEL`, `MOON_TOGGLE_ARIA`, `MOON_ROW_ARIA` from `$lib/copy/moon`

Plan 01 (`src/lib/moon.ts` — pure illumination math) is the parallel-wave sibling; Plan 03 depends on both.

---

## Self-Check: PASSED

- ✅ FOUND: src/lib/copy/moon.ts
- ✅ FOUND: src/lib/shared/urlState.ts (boolFlagField + moon field present)
- ✅ FOUND commit 0a53a05 (RED tests)
- ✅ FOUND commit 8a594b1 (GREEN feat)
- ✅ FOUND commit 332aa7d (copy/moon.ts feat)
- ✅ All 57 urlState tests pass
- ✅ All 23 explorer route + integration tests pass
- ✅ Off-state byte test confirms `moon=` absent from default-landing serialization

---
*Phase: 07-moon-phase-overlay*
*Completed: 2026-05-01*
