---
phase: 07-moon-phase-overlay
reviewed: 2026-05-01T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/lib/components/ExplorerHeader.svelte
  - src/lib/copy/moon.ts
  - src/lib/shared/moon.ts
  - src/lib/shared/urlState.ts
  - src/routes/explorer/+page.server.ts
  - src/routes/explorer/+page.svelte
  - tests/integration/routes/explorer-moon.test.ts
  - tests/unit/shared/moon.test.ts
  - tests/unit/shared/urlState.test.ts
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-05-01
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 7 (moon-phase overlay) is a clean, additive layer on top of Phase 6's
explorer. The new pure module (`src/lib/shared/moon.ts`) is well-scoped, free
of I/O, and correctly grounded against published lunar anchor dates. URL-state
extension for the `moon` flag is well-tested across all four literal forms
(`1`, `0`, `true`, `false`) with garbage rejection, and the off-state byte-
identity guarantee from UI-SPEC is preserved by the omit-when-off serialization
rule.

No critical security or correctness defects were found. Two warnings worth
addressing before ship: a localized violation of the project's "all date math
flows through `dates.ts`" rule inside the new `bucketKeyToDate` helper, and a
silent-accept-on-garbage gap in the cross-axis defaults branch of the loader
that diverges from the strict Zod path's behavior. Five info items cover
defensive-but-dead code, redundant fallbacks, and a minor type-assertion smell.

The test suite covers the alignment guarantee, off-state, garbage rejection,
range-recompute, and ticker-switch persistence — i.e. every contract the
UI-SPEC pinned. Domain language ("1/2 Day AM", "Fisherman's Landing", etc.)
is preserved verbatim throughout.

## Warnings

### WR-01: `bucketKeyToDate` violates "all date math flows through dates.ts"

**File:** `src/routes/explorer/+page.server.ts:624-647`
**Issue:** The nested `bucketKeyToDate` helper for ISO-week → Monday
conversion uses raw `new Date(Date.UTC(...))` and `setUTCDate(...)` arithmetic.
CLAUDE.md (non-negotiable) and 07-PATTERNS.md §"PT-canonical date math via
`dates.ts`" both stipulate that date string production routes through
`src/lib/shared/dates.ts` — never ad-hoc `new Date()` math. The output is
`YYYY-MM-DD` consumed by `moonIllumination` (which itself is strict about its
input), so the immediate behavior is correct, but the rule exists to catch
TZ drift before it bites; bypassing it here weakens the lint posture and
sets a precedent that future contributors may follow into less-safe territory.

**Fix:** Move ISO-week-to-Monday into `dates.ts` (or wherever
`buildExpectedKeys` already lives, since `eachWeekOfInterval(... { weekStartsOn:
1 })` produced these keys to begin with) and import it. A minimal version:

```typescript
// In src/lib/shared/dates.ts
/** Monday of an ISO week (YYYY-Www) → YYYY-MM-DD in PT. */
export function isoWeekMonday(year: number, week: number): string {
  // jan4 is always in ISO week 1; Monday of week 1 = jan4 - (jan4Dow - 1) days
  const jan4Iso = `${year}-01-04`;
  // dow: 1=Mon..7=Sun via existing dayOfWeek() helper or compute from JDN
  const dow = isoDayOfWeek(jan4Iso); // 1..7
  const week1Monday = addDays(jan4Iso, -(dow - 1));
  return addDays(week1Monday, (week - 1) * 7);
}
```

Then in `+page.server.ts`:

```typescript
const m = /^(\d{4})-W(\d{2})$/.exec(key);
if (m) return isoWeekMonday(Number(m[1]), Number(m[2]));
```

If adding `isoDayOfWeek` to `dates.ts` is too heavy for this phase, the
pragmatic alternative is to use `date-fns` directly in the helper —
`+page.server.ts` already imports from `date-fns`, and `parseISO` +
`startOfISOWeek` keeps the calc out of raw `Date` constructor territory.

### WR-02: Cross-axis defaults branch silently accepts garbage `moon` values

**File:** `src/routes/explorer/+page.server.ts:164-165`
**Issue:** When the URL has `ticker` but no `slug`/`name` (the cross-axis-
default path triggered by ticker switches), the loader bypasses Zod and parses
`moon` with a hand-rolled check:

```typescript
const rawMoonStr = url.searchParams.get('moon');
const rawMoon = rawMoonStr === '1' || rawMoonStr === 'true';
```

This silently treats `?moon=garbage`, `?moon=2`, `?moon=tRuE`, etc. as
`moon=false` — the strict Zod path rejects garbage and shows the error empty
state (covered by integration test `?moon=garbage` at lines 185-195 of
`tests/integration/routes/explorer-moon.test.ts`). The two paths now have
different garbage-handling semantics. Today this is reachable only via a
hand-crafted URL like `/explorer?ticker=boat&moon=garbage` (no `slug`), but
it's exactly the surface where a defense-in-depth match matters: the comment
on line 162 even says "Loose check (not Zod) — only used as a literal pass-
through" — yet the existing tests don't cover this divergence.

The user-visible impact is mild: someone with a malformed bookmark gets the
moon overlay silently disabled instead of an error message. But the schema-
contract rule from UI-SPEC §URL State Contract ("`?moon=garbage` → safeParse
rejects → defaults to off") says the *parse* rejects; here the cross-axis
branch never invokes safeParse for moon at all.

**Fix:** Use `boolFlagField.safeParse()` from urlState (export it) or repeat
the same enum check inline:

```typescript
const rawMoonStr = url.searchParams.get('moon');
const validMoon = rawMoonStr === null || ['1', '0', 'true', 'false'].includes(rawMoonStr);
if (!validMoon) {
  // Match the Zod-path behavior: garbage → error empty state.
  setHeaders({ 'cache-control': 'public, max-age=300' });
  return { /* same shape as the parseResult.error branch on line 251 */ };
}
const rawMoon = rawMoonStr === '1' || rawMoonStr === 'true';
```

Add a regression test in `explorer-moon.test.ts`:

```typescript
it('cross-axis default rejects garbage moon (parity with Zod path)', async () => {
  const data = await load(makeEvent('ticker=boat&moon=garbage'));
  // Either: returns error empty-state, OR documents that this case is reachable
  // only via cross-axis and is intentionally tolerant. Pick one and lock it.
  expect(data.empty?.heading).toBe('Invalid filter');
});
```

## Info

### IN-01: Redundant `??` operator on already-coalesced value

**File:** `src/routes/explorer/+page.server.ts:174`
**Issue:** `rangeToDates((rawRange as ExplorerFilters['range']) ?? '1y')` —
`rawRange` was already coalesced to `'1y'` on line 159
(`url.searchParams.get('range') ?? '1y'`), so the second `?? '1y'` is dead.
**Fix:** Drop the trailing `?? '1y'`:

```typescript
const resolved = rangeToDates(rawRange as ExplorerFilters['range']);
```

### IN-02: Defensive nullish-coalesce on schema-guaranteed boolean

**File:** `src/routes/explorer/+page.svelte:25`
**Issue:** `const formMoon = $derived(filters.moon ?? false);` — the
ExplorerFiltersSchema gives `moon` a default of `false`, so it is never
`undefined` after parse. The `?? false` is dead-but-defensive code.
**Fix:** Either drop the coalesce (`$derived(filters.moon)`) or keep it and
note that it guards the empty-state defaults object on line 133 of
`+page.server.ts` where filters is hand-constructed (not parsed). If keeping,
add a one-line comment.

### IN-03: Verbose discriminated-union type assertion

**File:** `src/routes/explorer/+page.server.ts:326`
**Issue:** `findBySlug(db, (filters as { ticker: 'boat'; slug: string } & typeof filters).slug)`
— inside the `filters.ticker === 'boat'` branch (well, the `filters.range ===
'1y'` block which already enforces `ticker === 'boat'` via the prior `if`),
TypeScript should narrow `filters` to the boat variant and `.slug` should be
directly accessible. The cast is verbose and slightly misleading.
**Fix:**

```typescript
if (usingDefaults && filters.ticker === 'boat' && filters.range === '1y') {
  // filters is narrowed to { ticker: 'boat'; slug: string; ...RangeBase } here
  const boatRow = findBySlug(db, filters.slug);
```

Note: this widget is pre-Phase-7 (the boat-cast already existed in Phase 6),
so it's not a regression — flagged for future cleanup.

### IN-04: `range` value is unvalidated in cross-axis branch

**File:** `src/routes/explorer/+page.server.ts:159, 174, 180, 184, 209, 223, 228, 232`
**Issue:** `rawRange` is read from the URL and asserted into
`ExplorerFilters['range']` without enum validation. If a user sends
`?ticker=boat&range=foobar`, `rangeToDates('foobar' as never)` is invoked.
This is pre-existing from Phase 6 and not introduced by Phase 7, but is worth
noting because Phase 7 adds another place (`moon`) where the cross-axis path
deliberately bypasses Zod. Recommend a follow-up to validate `range` here
the same way WR-02 recommends validating `moon`.
**Fix:** Out of scope for this phase. File a follow-up.

### IN-05: Magic color literal duplicates a CSS token

**File:** `src/routes/explorer/+page.server.ts:679`
**Issue:** `areaStyle: { color: 'rgba(203, 213, 225, 0.35)' }` is hardcoded
with a comment "// --color-border-strong @ 35%". UI-SPEC §Color forbids new
tokens but encourages using the existing `--color-border-strong` token. The
loader emits plain JSON for ECharts, so it cannot use `var(--token)` syntax
here directly without a runtime resolution (line 678 *does* use
`'var(--color-text-muted)'` for `lineStyle.color`, which ECharts may or may
not resolve depending on the rendering context — worth verifying).
**Fix:** Either consistently use `var(--color-border-strong)` (with confidence
that ECharts SVG renderer resolves it) or extract both colors to a
`MOON_COLORS` constant in `src/lib/copy/moon.ts` (or a sibling
`src/lib/charts/moon.ts`) so the magic numbers have a name. Lower priority —
the comment already explains the value.

---

_Reviewed: 2026-05-01_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
