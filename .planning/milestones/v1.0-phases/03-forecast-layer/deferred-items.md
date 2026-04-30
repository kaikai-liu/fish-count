# Phase 03 — Deferred Items

Items discovered during execution that are out of scope for the current plan but
should be tracked for future cleanup.

## Pre-existing svelte-check errors in route load() test files

**Discovered during:** Plan 03-03 execution (Task 2 — picker loader update)

**Status:** Pre-existing — not caused by Phase 3 changes.

**Description:** `npx svelte-check` reports 137 type errors across 14 files,
all of the same shape: `Property 'X' does not exist on type 'void | (Omit<PageData,...>)'`
when route load() functions are called from tests. The errors stem from
`PageServerLoad`'s return type being `void | PageData` rather than `PageData`,
and the tests destructure properties off the loose result.

**Affected files (pre-existing):**
- `tests/integration/phase2-routes.test.ts` — Phase 2 pattern reference
- `tests/unit/routes/date.test.ts`
- `tests/unit/routes/home.test.ts`
- `tests/unit/routes/picker.test.ts`
- (others, all from Phase 2)

**New files inheriting the pattern:**
- `tests/forecast/heatmap-composer.test.ts`
- `tests/forecast/horizon.test.ts`

These follow the same structure as `phase2-routes.test.ts` (mkdtemp + DB_PATH +
vi.resetModules + dynamic import of `load`) and inherit the same ambient
`void | PageData` typing issue.

**Why deferred:** The tests pass (vitest does not type-check), and the project
ships the same pattern across 14 files. Fixing requires either:
- A shared `assertPageData<T>(result): T` helper that narrows away the `void`
  case, OR
- Type assertions `(result as any)` at every property access site

Either is a project-wide cleanup that belongs in a Phase 5 polish plan, not
in Plan 03-03's surgical scope.

**Resolution path:** Defer to Phase 5 (polish) or whichever phase introduces a
shared test-helpers refactor.
