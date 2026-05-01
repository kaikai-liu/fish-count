---
phase: 06-explorer-foundation
plan: "01"
subsystem: dal-schema
tags: [phase-6, explorer, slug, migration, dal, boats]
dependency_graph:
  requires: []
  provides:
    - src/lib/shared/slug.ts (slugify + uniqueSlug pure helpers)
    - src/lib/db/migrations.ts (boats.slug additive migration, idx_boats_slug, idx_catch_species_date, idx_catch_landing_date)
    - src/lib/db/boats.ts (BoatRow.slug, findBySlug, listBoatsByActivity, mostActiveBoatLast30Days, slug-aware upsertByName + upsertBoatsAndLandings)
  affects:
    - src/lib/scraper/pipeline.ts (upsertBoatsAndLandings call site — API unchanged)
tech_stack:
  added: []
  patterns:
    - Pure utility module (slug.ts — no SQL, no state, analogous to dates.ts)
    - Additive ALTER TABLE migration with PRAGMA guard (hasSlugColumn)
    - Transaction-wrapped backfill (backfillSlugs)
    - D-13 frozen-at-first-seen: slug in INSERT VALUES, omitted from ON CONFLICT UPDATE
    - Activity-ordered boat list with LEFT JOIN (all boats ever, D-11)
key_files:
  created:
    - src/lib/shared/slug.ts
    - tests/unit/shared/slug.test.ts
  modified:
    - src/lib/db/migrations.ts
    - src/lib/db/boats.ts
    - tests/unit/db/migrations.test.ts
    - tests/unit/db/boats.test.ts
decisions:
  - "slug in INSERT VALUES only; omitted from ON CONFLICT UPDATE SET — enforces D-13 freeze-at-first-seen"
  - "backfillSlugs runs inside db.transaction() for atomicity; WHERE slug IS NULL predicate makes it idempotent"
  - "listBoatsByActivity uses LEFT JOIN to include boats with zero recent activity (D-11 all-boats-ever scope)"
  - "uniqueSlug accumulates taken Set within same upsertBoatsAndLandings batch to prevent intra-batch collisions (Pitfall 10)"
metrics:
  duration_minutes: 8
  completed_date: "2026-05-01"
  tasks_completed: 3
  files_modified: 6
---

# Phase 6 Plan 01: Slug Foundation and Schema Indexes Summary

**One-liner:** Additive boats.slug column with NFKD-normalized slugify helper, deterministic backfill migration, frozen-at-first-seen upsert, and activity-ordered boat DAL helpers for explorer queries.

## What Was Built

### Schema Delta

| Change | Type | DDL |
|--------|------|-----|
| `boats.slug` | New column (TEXT) | `ALTER TABLE boats ADD COLUMN slug TEXT` |
| `idx_boats_slug` | Partial UNIQUE index | `ON boats(slug) WHERE slug IS NOT NULL` |
| `idx_catch_species_date` | Covering index (D-20) | `ON catch_reports(species, source_date)` |
| `idx_catch_landing_date` | Covering index (D-20) | `ON catch_reports(landing_id, source_date)` |

Existing `idx_catch_boat_date` is preserved and not duplicated.

### Slug Generator (src/lib/shared/slug.ts)

`slugify(name)` pipeline:
1. NFKD normalize → strip combining marks (diacritics) → lowercase
2. Replace `[^a-z0-9]+` with `-` → trim leading/trailing hyphens
3. Slice to 60 chars → fallback `'boat'` if empty

`uniqueSlug(base, taken)`:
- Returns `base` if not in `taken`
- Increments suffix: `base-2`, `base-3`, ... until non-conflicting
- Deterministic: same inputs → same output

### Migration Behavior (src/lib/db/migrations.ts)

- `hasSlugColumn()` guard: `PRAGMA table_info(boats)` — prevents re-ALTER on migrated DBs
- `backfillSlugs()`: reads all `slug IS NULL` boats ordered by `id ASC`, generates unique slugs in transaction
- Covering indexes use `CREATE INDEX IF NOT EXISTS` — idempotent on every boot
- Fresh DB: runMigrations adds slug column + backfill + 3 indexes
- Already-migrated DB: runMigrations is a no-op for the slug block, re-applies covering indexes safely

### New Boat DAL Exports (src/lib/db/boats.ts)

| Export | Signature | Purpose |
|--------|-----------|---------|
| `findBySlug` | `(db, slug) → BoatRow \| undefined` | Lookup by URL identifier (D-12) |
| `listBoatsByActivity` | `(db, days=90) → BoatRow[]` | Dropdown population, activity-first order (D-09, D-11) |
| `mostActiveBoatLast30Days` | `(db) → BoatRow \| null` | Default boat on first explorer load (D-01) |

`upsertByName` extended with 6th `slug?: string` parameter. SQL:
- `INSERT INTO boats (..., slug) VALUES (?, ?, ?, ?, ?)` — writes slug
- `ON CONFLICT DO UPDATE SET display_name, landing_id, source_url` — slug intentionally absent (D-13)

`upsertBoatsAndLandings` extended:
- Pre-loads `taken` Set from `SELECT slug FROM boats WHERE slug IS NOT NULL`
- For each new boat: checks existing slug via `WHERE source_name = ?`, generates if absent, adds to `taken`
- Existing boats retain their slug regardless of display_name changes

### Pipeline Integration

`src/lib/scraper/pipeline.ts` line 182 is unchanged:
```typescript
const { boatIds, landingIds } = upsertBoatsAndLandings(db, rows);
```
Slug generation is internal to `upsertBoatsAndLandings` — callers do not need updating.

## Decisions Made

- **Slug in INSERT VALUES only:** D-13 frozen-at-first-seen enforced at SQL level, not application logic. Even if `upsertByName` is called with a different slug on a subsequent upsert, the DB ignores it.
- **backfillSlugs in transaction:** atomicity on boot. If the server restarts mid-backfill, the whole backfill re-runs on next boot.
- **LEFT JOIN in listBoatsByActivity:** D-11 requires all boats ever, even those with no recent trips (off-season boats must appear in the dropdown).
- **taken Set accumulated across intra-batch boats:** Pitfall 10 from RESEARCH.md — without accumulating the batch's own assignments into `taken`, two boats in the same scrape with identical display_name would both receive `pacific-voyager` and the second INSERT would violate the UNIQUE index.

## Test Coverage

| File | Tests | Key scenarios |
|------|-------|---------------|
| `tests/unit/shared/slug.test.ts` | 14 | All slugify behaviors + uniqueSlug collision chain |
| `tests/unit/db/migrations.test.ts` | +7 (16 total) | Backfill, duplicate names, idempotency, index existence, partial index WHERE clause |
| `tests/unit/db/boats.test.ts` | +10 (14 total) | Slug freeze, intra-batch uniqueness, findBySlug, listBoatsByActivity, mostActiveBoatLast30Days |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `src/lib/shared/slug.ts` — EXISTS
- `src/lib/db/migrations.ts` — EXISTS, modified
- `src/lib/db/boats.ts` — EXISTS, modified
- `tests/unit/shared/slug.test.ts` — EXISTS, 14 tests
- `tests/unit/db/migrations.test.ts` — EXISTS, 16 tests total
- `tests/unit/db/boats.test.ts` — EXISTS, 14 tests total
- Commits: 831dbe0 (RED slug), a078e9c (GREEN slug), 095ee6d (RED migration), de2d7dd (GREEN migration), af9be5a (RED boats), dbf933e (GREEN boats)
