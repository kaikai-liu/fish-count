---
phase: 06-explorer-foundation
plan: 02
subsystem: shared-lib
tags: [phase-6, explorer, url-state, zod, range, tdd]
dependency_graph:
  requires:
    - src/lib/shared/dates.ts (today(), addDays())
    - src/lib/shared/urlState.ts (existing schemas — not replaced)
  provides:
    - src/lib/shared/range.ts (rangeToDates, chooseGranularity, RANGE_PRESETS)
    - src/lib/shared/urlState.ts — ExplorerFiltersSchema, parseExplorerFilters, serializeExplorerFilters
  affects:
    - Plan 06-03 (explorer loader calls parseExplorerFilters + rangeToDates)
    - Plan 06-04 (explorer page uses serializeExplorerFilters for goto calls)
    - Plan 06-05 (DAL queries receive granularity from rangeToDates)
    - Phase 8 (share-URL contract: same ExplorerFilters shape)
tech_stack:
  added:
    - src/lib/shared/range.ts (new pure-function module)
  patterns:
    - Zod discriminated union for URL parse boundary (z.discriminatedUnion + z.intersection + superRefine)
    - Howard Hinnant civil-epoch integer arithmetic for span calculation (zero Date object calls)
    - Fake timer determinism with vi.useFakeTimers() in tests
key_files:
  created:
    - src/lib/shared/range.ts
    - tests/unit/shared/range.test.ts
  modified:
    - src/lib/shared/urlState.ts (appended ExplorerFilters section)
    - tests/unit/shared/urlState.test.ts (extended with 20 ExplorerFiltersSchema tests)
decisions:
  - "Slug regex ^[a-z0-9]+(-[a-z0-9]+)*$ with max(80) satisfies T-06-07 and T-06-09"
  - "RANGE_PRESETS defined in range.ts; urlState.ts imports from there — single source of truth"
  - "spanDays helper uses civil-epoch integer arithmetic to avoid Date.parse and stay STO-04 compliant"
  - "'all' range bounded at 365*15 = 5475 days (T-02-31 sentinel) — never unbounded"
  - "ticker is REQUIRED in ExplorerFiltersSchema; loader handles empty-URL default synthesis (D-04)"
metrics:
  duration_seconds: 278
  completed_date: "2026-04-30"
  tasks_completed: 2
  tests_added: 43
  files_created: 2
  files_modified: 2
---

# Phase 6 Plan 02: URL State Contract and Range Mapper Summary

Zod-bounded `ExplorerFiltersSchema` (discriminated by `ticker`) with parse/serialize helpers and a pure `rangeToDates` mapper covering every preset including Custom — both implemented TDD with full test coverage.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Range mapper module + tests | e6a2465 | src/lib/shared/range.ts, tests/unit/shared/range.test.ts |
| 2 | ExplorerFiltersSchema + parse/serialize + tests | 6954ae1 | src/lib/shared/urlState.ts, tests/unit/shared/urlState.test.ts |

## ExplorerFilters Type Shape

Discriminated union on `ticker` field — three mutually exclusive shapes:

```typescript
// Boat ticker: slug identifies the boat (D-12, frozen-at-first-seen D-13)
{ ticker: 'boat'; slug: string; range: RangePreset; fromDate?: string; toDate?: string }

// Species ticker: plain URL-encoded name (D-14)
{ ticker: 'species'; name: string; range: RangePreset; fromDate?: string; toDate?: string }

// Landing ticker: plain URL-encoded name (D-14)
{ ticker: 'landing'; name: string; range: RangePreset; fromDate?: string; toDate?: string }
```

Key validation rules:
- `slug`: `^[a-z0-9]+(-[a-z0-9]+)*$` regex + `max(80)` length cap (T-06-07, T-06-09)
- `name` for species: `min(1).max(80)`; for landing: `min(1).max(120)`
- `range=custom` requires both `fromDate` and `toDate` via `superRefine`; `fromDate <= toDate` enforced (T-06-10)
- `ticker` is **required** — empty URLSearchParams is a parse error; the loader synthesizes defaults server-side for clean-URL first load (D-04)

## Range Presets and Granularity Table

| Preset | Days back | Granularity | Notes |
|--------|-----------|-------------|-------|
| `1m`   | 30        | daily       | `strftime('%Y-%m-%d', source_date)` |
| `3m`   | 90        | weekly      | ISO week `%G-W%V` |
| `6m`   | 180       | weekly      | ISO week |
| `1y`   | 365       | weekly      | ISO week |
| `2y`   | 730       | monthly     | `%Y-%m` |
| `5y`   | 1825      | monthly     | |
| `all`  | 5475      | monthly     | T-02-31 bounded sentinel |
| `custom` | computed | auto-pick | daily ≤45d, weekly ≤730d, monthly >730d |

Custom range granularity is chosen by `chooseGranularity(spanDays)`:
- `span <= 45` → `'daily'`
- `span <= 730` → `'weekly'`  
- `span > 730` → `'monthly'`

## All-Sentinel Bounded-Window Rationale (T-02-31)

`rangeToDates('all')` returns `fromDate = today() - 5475 days` (365 × 15 years). The DAL never receives an unbounded `WHERE source_date >= ''` scan. This matches the existing v1 pattern (T-02-31 was already in `trends/+page.server.ts` with a 10-year sentinel; Phase 6 extends to 15 years to cover the full scrape history).

The span calculation uses pure integer arithmetic (Howard Hinnant civil-epoch algorithm) to avoid `Date.parse` or `Date` constructor calls that would trip the STO-04 date-boundary lint test.

## Downstream Consumption Points

| Consumer | How it uses these exports |
|----------|--------------------------|
| Plan 06-03 `explorer/+page.server.ts` | `parseExplorerFilters(url.searchParams)` at URL boundary; `rangeToDates(filters.range, { fromDate, toDate })` to get concrete window |
| Plan 06-04 `explorer/+page.svelte` | `serializeExplorerFilters(filters)` to build goto URL on control changes |
| Plan 06-05 DAL `queries/explorer.ts` | `Granularity` type from range.ts for typed `granularity` param |
| Phase 7 moon-phase overlay | `includesToday` from `ResolvedRange` controls provisional-data badge |
| Phase 8 share-URL | `ExplorerFilters` shape is the canonical URL contract — Phase 8 adds copy-link UI, not a new schema |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

The one deviation was correcting test expected values for 2y/5y/all date calculations: the plan's behavior spec said "today-730d = 2024-05-01" but the actual UTC arithmetic via `addDays` (which accounts for leap years correctly) yields `2024-04-30`. The implementation is correct; the plan's example dates were illustrative approximations. Tests updated to reflect actual values.

## Threat Flags

None — these are pure-function modules with no network endpoints, auth paths, file access, or schema changes. The Zod boundary satisfies T-06-07 through T-06-12 as specified in the plan's threat model.

## Known Stubs

None — all exports are fully implemented and tested.

## Self-Check: PASSED

- `src/lib/shared/range.ts` exists: FOUND
- `src/lib/shared/urlState.ts` modified with ExplorerFiltersSchema: FOUND
- `tests/unit/shared/range.test.ts` exists: FOUND
- `tests/unit/shared/urlState.test.ts` extended with Explorer tests: FOUND
- Commit e6a2465 (range.ts GREEN): FOUND
- Commit 6954ae1 (urlState.ts GREEN): FOUND
- All 73 tests passing (urlState: 47, range: 23, dates-boundary: 2, dal-boundary: 1): CONFIRMED
