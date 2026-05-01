---
phase: 06-explorer-foundation
plan: "03"
subsystem: dal-queries
tags: [phase-6, explorer, dal, aggregations, trends, landings]
dependency_graph:
  requires:
    - src/lib/db/migrations.ts (Phase 01 — boats.slug column + covering indexes idx_catch_species_date, idx_catch_landing_date)
    - src/lib/db/boats.ts (Phase 01 — BoatRow.slug, findBySlug)
  provides:
    - src/lib/db/queries/explorer.ts (7 DAL aggregation functions for all three ticker shapes)
    - src/lib/db/queries/trends.ts (daily granularity extension, backward-compatible)
    - src/lib/db/landings.ts (getByName + mostRecentlyActiveLanding helpers)
  affects:
    - src/routes/explorer/+page.server.ts (Plan 05 — loader composes these without writing SQL)
tech_stack:
  added: []
  patterns:
    - Two-pass Pitfall-9-safe top-N aggregation (window totals, not per-bucket)
    - Typed Granularity enum prevents user-input injection into SQL branch (T-02-01)
    - IN (?,?,?,...) parameterized second pass bounded by top-N IDs
    - LIMIT 1 existence sentinel for auto-widen check (D-03)
    - Alpha tie-break (ORDER BY total DESC, display_name ASC) for deterministic defaults
key_files:
  created:
    - src/lib/db/queries/explorer.ts
    - tests/unit/db/queries/explorer.test.ts
    - tests/unit/db/landings.test.ts
  modified:
    - src/lib/db/queries/trends.ts (granularity union extended)
    - tests/unit/db/queries/trends.test.ts (daily granularity describe block added)
decisions:
  - "Two-pass aggregation in speciesAcrossBoats/landingAcrossSpecies: Pass 1 selects top-N by window totals; Pass 2 fetches bucketed series only for those N IDs — prevents Pitfall 9 (per-bucket top-N differs from window top-N)"
  - "bucketExpr(g) is a module-private function returning a hard-coded SQL literal from a typed enum — TypeScript exhaustiveness ensures correctness; never user-controlled"
  - "countCatchRowsForBoatInRange uses LIMIT 1 and returns 0/1 (not actual count) — O(1) existence check matching the D-03 spec: all we need is has-data vs no-data"
  - "trends.ts daily extension uses 3-way conditional instead of two-way — backward-compatible; weekly/monthly callers in trends/compare routes continue to work unchanged"
metrics:
  duration_minutes: 6
  completed_date: "2026-05-01"
  tasks_completed: 2
  files_modified: 5
---

# Phase 6 Plan 03: Explorer DAL Aggregations Summary

**One-liner:** Seven parameterized SQLite query functions covering all three explorer ticker shapes (boat/species/landing), with Pitfall-9-safe two-pass top-N aggregation, backward-compatible daily-granularity extension in trends.ts, and two new landing cross-axis helpers.

## What Was Built

### New Module: src/lib/db/queries/explorer.ts

Seven exported DAL functions:

| Export | Signature summary | Purpose |
|--------|-------------------|---------|
| `boatExplorerSeries` | `(db, {boatId, fromDate, toDate, granularity})` | D-15 boat ticker: per-angler yield bucketed by `(bucket_key, trip_type)` |
| `speciesAcrossBoats` | `(db, {species, fromDate, toDate, granularity, topN?})` | D-15 species ticker: two-pass top-6 boat series |
| `landingAcrossSpecies` | `(db, {landingId, fromDate, toDate, granularity, topN?})` | D-15 landing ticker: two-pass top-6 species series |
| `speciesBreakdownForBoat` | `(db, {boatId, fromDate, toDate})` | D-15 secondary: unbucketed species totals for breakdown table |
| `countCatchRowsForBoatInRange` | `(db, {boatId, fromDate, toDate})` | D-03 auto-widen: 0/1 existence sentinel |
| `mostCaughtSpeciesForBoatInRange` | `(db, {boatId, fromDate, toDate})` | D-08 cross-axis: boat→species default |
| `topBoatForSpeciesInRange` | `(db, {species, fromDate, toDate})` | D-08 cross-axis: species→boat default with slug |

#### Two-Pass Top-N Pattern (Pitfall 9 Mitigation)

Both `speciesAcrossBoats` and `landingAcrossSpecies` use a two-pass strategy to avoid Pitfall 9 (the bug where top-N is chosen per-bucket instead of over the full window):

**Pass 1:** `SELECT ... GROUP BY boat_id ORDER BY SUM(species_count) DESC LIMIT @topN` — selects the N entities that performed best across the *entire* window.

**Pass 2:** `SELECT ... WHERE boat_id IN (?,?,?,...) AND source_date BETWEEN ? AND ? GROUP BY boat_id, bucket_key` — fetches bucketed series *only* for those N IDs, parameterized with positional `?` markers (T-06-17 DoS mitigation: bounded at 6 IDs by default).

This ensures that a boat that caught 1000 fish in January and 0 in other months won't drop out of the top-6 if it only had a weak bucket-level showing in the viewed window.

#### Granularity Type

```typescript
export type Granularity = 'daily' | 'weekly' | 'monthly';
```

The module-private `bucketExpr(g: Granularity)` function maps this to the appropriate SQLite `strftime(...)` literal. It is never user-input — the TypeScript compiler enforces the union, preventing SQL branch injection (T-06-15).

### Extended: src/lib/db/queries/trends.ts

`BoatTrendArgs.granularity` and `SpeciesTrendArgs.granularity` updated from `'weekly' | 'monthly'` to `'daily' | 'weekly' | 'monthly'`.

Both `boatTrend` and `speciesTrend` now use a 3-way conditional:
```typescript
const bucketExpr =
  args.granularity === 'daily'
    ? "strftime('%Y-%m-%d', source_date)"
    : args.granularity === 'weekly'
      ? "strftime('%G-W%V', source_date)"
      : "strftime('%Y-%m', source_date)";
```

**Backward compatibility:** Existing callers in `trends/+page.server.ts` and `compare/+page.server.ts` pass only `'weekly'` or `'monthly'` — no changes needed at the call site.

### Extended: src/lib/db/landings.ts

Two new exports:

- **`getByName(db, name)`** — exact case-sensitive match on `display_name` (D-14 landing lookup by URL-encoded name)
- **`mostRecentlyActiveLanding(db)`** — D-08 cross-axis default; `GROUP BY l.id ORDER BY MAX(cr.source_date) DESC, l.display_name ASC LIMIT 1`; returns `null` when `catch_reports` is empty

## Soft Perf Result

`boatExplorerSeries` over a synthetic 15-year × 1728-row dataset (monthly buckets, 3 trip types, 3 species):

```
boatExplorerSeries all-range 15yr monthly: 0.813ms (run 1) / 0.933ms (run 2)
```

Well under the 300ms soft budget from D-20. The covering indexes on `(boat_id, source_date)` (existing), `(species, source_date)`, and `(landing_id, source_date)` (added in Plan 01) ensure index-bounded scans for all three ticker queries.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — all SQL uses parameterized statements; DAL boundary lint test passes; no new network endpoints introduced.

## Self-Check: PASSED

- `src/lib/db/queries/explorer.ts` — EXISTS (302 lines, 7 exported functions)
- `src/lib/db/queries/trends.ts` — EXISTS, modified (daily granularity in both interfaces + both bucketExpr branches)
- `src/lib/db/landings.ts` — EXISTS, modified (getByName + mostRecentlyActiveLanding)
- `tests/unit/db/queries/explorer.test.ts` — EXISTS (24 tests, all green)
- `tests/unit/db/queries/trends.test.ts` — EXISTS, extended (14 tests total, all green)
- `tests/unit/db/landings.test.ts` — EXISTS (6 tests, all green)
- Commits: 299a32f (RED trends+landings), 7730b6f (GREEN trends+landings), 75266b3 (RED explorer), 32abe2c (GREEN explorer)
- Total: 89 tests passing across all affected test files
