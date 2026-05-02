---
phase: 08-home-retire-polish
plan: 01
subsystem: database
tags: [phase-8, alias, dal, migration, sqlite, better-sqlite3, trip-type, retire-forecasts]

# Dependency graph
requires:
  - phase: 02-browse-trip-picker-trends
    provides: trends.ts boatTrend / speciesTrend prepared statements (alias-aware overlay)
  - phase: 06-explorer-foundation
    provides: explorer.ts boat/species/landing query shape, compare.ts compareBoats
  - phase: 07-moon-phase-overlay
    provides: nothing direct — but pattern of DAL-only SQL & idempotent migration helpers
provides:
  - trip_type_aliases table (PRIMARY KEY source_label, status enum, accepted_at, notes)
  - ALIAS_JOIN_SQL + CANONICAL_TRIP_TYPE_EXPR — read-time alias-aware SQL fragments
  - upsertAlias / getAlias / deleteAlias / listAllLabelsWithStatus DAL CRUD
  - 26-row alias seed (3 aliased + 11 accepted + 12 pending)
  - explorer.ts / compare.ts / trends.ts queries that fold aliased labels into canonicals
  - forecasts table dropped (idempotent) — RTR-03 / D-19
affects: [phase-08-plan-02-home, phase-08-plan-04-explorer, phase-08-plan-03-retire]

# Tech tracking
tech-stack:
  added: []   # No new packages — pure better-sqlite3 SQL.
  patterns:
    - Read-time alias translation (LEFT JOIN + COALESCE/CASE) — never mutate raw catch_reports.trip_type
    - Idempotent additive migration with seed-only-on-empty (preserves operator edits across boots)
    - Single-source SQL fragment exports (ALIAS_JOIN_SQL, CANONICAL_TRIP_TYPE_EXPR) — D-03 discipline

key-files:
  created:
    - src/lib/db/aliases.ts
    - tests/unit/db/aliases.test.ts
    - tests/unit/db/aliases-translation.test.ts
    - tests/unit/db/migrations-aliases.test.ts
  modified:
    - src/lib/db/migrations.ts   # +runAliasTableMigration, +dropForecastsTable, -SCHEMA_SQL forecasts block
    - src/lib/db/queries/explorer.ts  # ALIAS_JOIN_SQL injected into all 3 series queries
    - src/lib/db/queries/compare.ts   # canonical-expr WHERE filter for aliased fold-in
    - src/lib/db/queries/trends.ts    # canonical-expr WHERE filter on speciesTrend + boatTrend variants
    - tests/unit/db/migrations.test.ts # forecasts assertions inverted (must NOT exist)

key-decisions:
  - "Seed reflects 25 distinct labels in dev DB + Long Range (forward-compatible). Only 'Full Day Coronado Islands → Full Day' is operator-confirmed; the other 25 rows are Claude-inferred and reversible via Wave 2 admin page."
  - "Drop forecasts table BEFORE creating alias table inside runMigrations so a partially-migrated DB can't interleave. SCHEMA_SQL no longer creates forecasts; the helper is the sole DROP."
  - "speciesAcrossBoats / landingAcrossSpecies don't surface trip_type but still get ALIAS_JOIN_SQL — the LEFT JOIN is a no-op (source_label PRIMARY KEY → 1:1 with cr.trip_type) and keeps the file pattern uniform for downstream readers."
  - "bucketExpr in explorer.ts and trends.ts now qualifies cr.source_date because the alias-aware queries always alias catch_reports as `cr` for the LEFT JOIN."

patterns-established:
  - "Pattern 1 (RESEARCH §Pattern 1): every alias-aware query LEFT JOINs trip_type_aliases tta on tta.source_label = cr.trip_type and groups by COALESCE(CASE WHEN tta.status='aliased' THEN tta.canonical_label END, cr.trip_type)."
  - "Pitfall 1 (RESEARCH §Pitfall 1): never `GROUP BY cr.trip_type` directly in alias-aware queries — always the canonical expression. The merged group is the truth."
  - "Idempotent seed: count===0 gate before INSERT OR IGNORE in a transaction. Operator edits via /admin/trip-types (Wave 2) survive every reboot."

requirements-completed: [ALI-01, ALI-02, ALI-05, RTR-03]

# Metrics
duration: ~10min
completed: 2026-05-02
---

# Phase 8 Plan 1: Trip-type alias DAL foundation Summary

**26-row trip_type_aliases table with read-time COALESCE/CASE merge, alias-aware DAL fragments wired into explorer/compare/trends, and the retired Phase 3 forecasts table idempotently dropped — all on a single migration boundary.**

## Performance

- **Duration:** ~10 minutes
- **Started:** 2026-05-02 (UTC)
- **Completed:** 2026-05-02
- **Tasks:** 4 (Task 4 was the seed-review checkpoint — auto-approved per `--auto` mode)
- **Files modified:** 5 (3 query modules + migrations.ts + existing migrations test); 4 created (aliases.ts + 3 test files)

## Accomplishments
- New `trip_type_aliases` table with 26-row pre-seed (3 aliased / 11 accepted / 12 pending), idempotent across boots — operator edits via Wave 2 admin page survive every reboot.
- Two pure SQL fragments — `ALIAS_JOIN_SQL` and `CANONICAL_TRIP_TYPE_EXPR` — that every downstream alias-aware query consumes. Single source of truth (D-03 discipline).
- explorer.ts (3 queries), compare.ts (2 queries), trends.ts (3 query variants) all fold aliased rows into their canonical at read time. Verified end-to-end: 'Full Day Coronado Islands' → 'Full Day' merge surfaces as ONE series with combined catch + angler totals.
- Retired Phase 3 `forecasts` table at the migration layer — `dropForecastsTable()` is idempotent (DROP IF EXISTS) and runs on every boot. `SCHEMA_SQL` no longer creates the table, so the drop is a no-op on fresh DBs.
- 23 new test cases (8 alias DAL + 9 migration + 3 translation + 4 alias-merge in existing query tests) covering the contract end-to-end.

## Task Commits

Each task was committed atomically (per-task commits with `--no-verify` for parallel-executor safety):

1. **Task 1: Create alias DAL module + Wave-0 unit tests (RED)** — `122ebae` (test)
2. **Task 2: Migrations — alias table CREATE+seed, forecasts DROP, with TDD (GREEN)** — `32a33bc` (feat)
3. **Task 3: Make explorer / compare / trends queries alias-aware (D-03)** — `0761e58` (feat)
4. **Task 4: Operator review checkpoint** — auto-approved per `--auto` mode (no commit; seed shipped as committed in Task 2)

## Files Created/Modified

### Created
- `src/lib/db/aliases.ts` — Trip-type alias DAL. Exports the two SQL fragments (`ALIAS_JOIN_SQL`, `CANONICAL_TRIP_TYPE_EXPR`) consumed by every alias-aware read query, plus CRUD (`upsertAlias`, `getAlias`, `deleteAlias`) and the admin-page master list (`listAllLabelsWithStatus`).
- `tests/unit/db/aliases.test.ts` — 11 cases covering CRUD contracts (upsert flips accepted_at by status, idempotent last-write-wins, CHECK-constraint rejection, get/delete semantics, listAllLabelsWithStatus joined output and sort).
- `tests/unit/db/aliases-translation.test.ts` — 3 cases proving the read-time COALESCE/CASE pattern works end-to-end: aliased label merges, pending label surfaces unchanged, unseeded label falls through the LEFT JOIN.
- `tests/unit/db/migrations-aliases.test.ts` — 9 cases covering the alias-table create + seed (count, status mix, idempotency w/ operator-edit preservation, CHECK constraint, accepted_at semantics) and the forecasts DROP (fresh DB, legacy DB, double-run idempotency).

### Modified
- `src/lib/db/migrations.ts` — Added `runAliasTableMigration()` (idempotent CREATE + count-zero seed of 26 rows in a transaction) and `dropForecastsTable()` (idempotent DROP); removed the `forecasts` block from `SCHEMA_SQL`; wired both helpers into `runMigrations()` (DROP first, then CREATE).
- `src/lib/db/queries/explorer.ts` — `boatExplorerSeries` GROUP BY now uses `CANONICAL_TRIP_TYPE_EXPR` (merged trip-type series). `speciesAcrossBoats` and `landingAcrossSpecies` get `ALIAS_JOIN_SQL` for pattern symmetry. `bucketExpr` qualifies `cr.source_date` for the JOIN.
- `src/lib/db/queries/compare.ts` — `compareBoats` aggregate WHERE clause and per-boat top-species query both filter on `CANONICAL_TRIP_TYPE_EXPR = ?`, so passing `tripType='Full Day'` includes raw 'Full Day Coronado Islands' rows.
- `src/lib/db/queries/trends.ts` — `speciesTrend` and both `boatTrend` variants (per-species + all-species aggregate) apply the same alias-aware WHERE filter. Bucket expressions qualify `cr.source_date`.
- `tests/unit/db/migrations.test.ts` — Forecasts assertions inverted: the table must NOT exist post-migration (RTR-03 / D-19). Canonical-table list updated to include `trip_type_aliases`.
- `tests/unit/db/queries/explorer.test.ts` — +1 alias-merge case (`boatExplorerSeries` merges 'Full Day Coronado Islands' into 'Full Day' with combined n_trips=2, weighted yield = 18/35).
- `tests/unit/db/queries/compare.test.ts` — +1 alias-merge case (`compareBoats` folds aliased rows into total_trips & avg_per_angler when filtering by canonical).
- `tests/unit/db/queries/trends.test.ts` — +2 alias-merge cases (`speciesTrend` + `boatTrend` all-species variant fold aliased rows when filtering by canonical trip_type).

## Decisions Made

- **Seed list (D-06):** 26 rows reflecting the live dev DB inventory of 25 distinct labels plus `Long Range` for forward-compatibility. Only `Full Day Coronado Islands → Full Day` is operator-confirmed (per CONTEXT.md D-06, 2026-04-27 source-site relabel); every other row is Claude-inferred from the spike addendum and reversible via the /admin/trip-types page in Wave 2. Rationale: even a wrong inference is better than no row — every existing catch_reports row gets a status, and the operator can adjudicate at leisure with full context.
- **DROP-before-CREATE inside `runMigrations`:** removes any chance of an interleaved partial state on a legacy DB. Safe because `SCHEMA_SQL` no longer recreates `forecasts`.
- **JOIN injection on queries that don't surface trip_type** (`speciesAcrossBoats`, `landingAcrossSpecies`): added for pattern uniformity. Source_label is PRIMARY KEY so the LEFT JOIN cannot duplicate or drop rows; downstream readers see one consistent shape.
- **bucketExpr now qualifies cr.source_date:** the alias-aware queries all alias catch_reports as `cr` for the LEFT JOIN, so the bucket expression must qualify too. Old per-table-default behavior would resolve ambiguously once a JOIN was added.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Generated SvelteKit tsconfig before running tests**
- **Found during:** Task 1 (RED gate verification)
- **Issue:** `npx vitest` failed at module-load with `TSConfckParseError: failed to resolve "extends":"./.svelte-kit/tsconfig.json"`. The worktree was freshly created and had not run `svelte-kit sync` yet.
- **Fix:** `npx svelte-kit sync` to generate `.svelte-kit/tsconfig.json`. One-time worktree bootstrap.
- **Files modified:** none (generated artifacts only)
- **Verification:** Same vitest command succeeded after.
- **Committed in:** N/A (worktree bootstrap, not part of any task commit)

**2. [Rule 1 — Bug] listAllLabelsWithStatus test assumed an empty alias table**
- **Found during:** Task 2 (Task 1's tests should turn GREEN once the migration lands)
- **Issue:** Test `listAllLabelsWithStatus … sorted by trip_count desc` upserted only `Full Day` and asserted `1/2 Day AM` would surface with `status=NULL`. After Task 2's seed populated 26 rows by default, `1/2 Day AM` came back as `status='accepted'`.
- **Fix:** Replace `1/2 Day AM` in the test with an invented label (`Brand New Trip`) that is intentionally not in the seed — represents the realistic "scraped after the seed was applied" case (D-05 NEW badge flow). Stronger assertion of the LEFT JOIN's NULL fallback.
- **Files modified:** tests/unit/db/aliases.test.ts
- **Verification:** All 11 alias DAL test cases green.
- **Committed in:** 32a33bc (Task 2 GREEN commit)

**3. [Rule 3 — Blocking] migrations.test.ts forecasts assertions stale after RTR-03**
- **Found during:** Task 2 (running existing migrations.test.ts)
- **Issue:** Existing test had two cases asserting the forecasts table exists post-migration. RTR-03 / D-19 retires it; assertion would fail.
- **Fix:** Inverted to `forecasts table must NOT exist`. Updated the canonical-table list to include `trip_type_aliases` and exclude `forecasts`.
- **Files modified:** tests/unit/db/migrations.test.ts
- **Verification:** All 15 cases in migrations.test.ts green.
- **Committed in:** 32a33bc (Task 2 GREEN commit)

**4. [Rule 1 — Bug] Type-check `db` possibly null in migrations-aliases.test.ts**
- **Found during:** Task 3 (`npm run check`)
- **Issue:** `expect(() => db.prepare(...))` triggered TS2531 because `db` is typed as `DatabaseType.Database | null`. Other tests use `db!`.
- **Fix:** Non-null assertion `db!.prepare(...)` matches the file's idiom.
- **Files modified:** tests/unit/db/migrations-aliases.test.ts
- **Verification:** Targeted `npm run check` clean for that file.
- **Committed in:** 0761e58 (Task 3 commit — bundled as a small follow-up)

---

**Total deviations:** 4 auto-fixed (1 blocking bootstrap, 1 logic-on-stale-fixture bug, 1 stale-test-assertion blocker, 1 type bug)
**Impact on plan:** All four were necessary to land a green test suite; no scope creep, no architectural drift.

## Issues Encountered

- **Forecast source files & their tests still exist after this plan**: Plan 08-03 (Wave 2) deletes `src/lib/forecast/`, `src/lib/db/forecasts.ts`, `src/lib/db/queries/forecastHeatmap.ts`, `src/routes/picker/`, `src/routes/trends/`, and the test suites that reference them. Until 08-03 ships, those test files (e.g. `tests/unit/db/queries/forecastHeatmap.test.ts`, `tests/unit/db/forecasts.test.ts`, `tests/forecast/*`) will fail with `SqliteError: no such table: forecasts`. This is the documented wave-1 → wave-2 transitional state per the plan's `wave_rationale`. The fail-set is bounded and known.
- **Pre-existing `npm run check` errors** (e.g. urlState.ts Zod overload, `scripts/*.ts` import-extension errors, `src/lib/scraper/parser.ts`, `src/lib/ops/billing.ts`, `tests/unit/routes/{home,date}.test.ts`) are NOT introduced by this plan. My changes add zero new TypeScript errors. The Phase 7 baseline already had these warnings.

## User Setup Required

None — no external service configuration required. Operator review of the seed list is in-scope for the Wave 2 admin page (/admin/trip-types) and was auto-approved at this plan's checkpoint per `--auto` mode.

## Next Phase Readiness

- **Wave 2 (Plan 08-02 — home page + admin):** ready to consume `import { ALIAS_JOIN_SQL, CANONICAL_TRIP_TYPE_EXPR, type AliasRow, listAllLabelsWithStatus, upsertAlias, getAlias, deleteAlias } from '$lib/db/aliases';` for the home-page sections and the /admin/trip-types CRUD route.
- **Wave 4 (Plan 08-04 — explorer/compare polish):** all three target query modules (explorer, compare, trends) are already alias-aware. No further DAL alias work needed in those modules — Wave 4 inherits the contract.
- **Plan 08-03 (Wave 2 — retire forecasts source):** can safely delete `src/lib/forecast/`, `src/lib/db/forecasts.ts`, `src/lib/db/queries/forecastHeatmap.ts`, the picker/trends routes, and their test suites — the table is already gone from the schema.
- **No blockers.** The contract surface (alias-aware DAL fragments + canonical helpers) is the load-bearing primitive Wave 2 depends on.

## Self-Check: PASSED

- src/lib/db/aliases.ts — FOUND
- src/lib/db/migrations.ts — present (modified)
- tests/unit/db/aliases.test.ts — FOUND
- tests/unit/db/aliases-translation.test.ts — FOUND
- tests/unit/db/migrations-aliases.test.ts — FOUND
- Commit 122ebae — FOUND in git log
- Commit 32a33bc — FOUND in git log
- Commit 0761e58 — FOUND in git log
- All 6 alias-aware test files green (74 cases) when run together: aliases / aliases-translation / migrations-aliases / queries/explorer / queries/compare / queries/trends.
- No `CREATE TABLE IF NOT EXISTS forecasts` in src/lib/db/migrations.ts (verified — 0 hits).
- No code-level `GROUP BY cr.trip_type` in the 3 alias-aware query files (only the comment-block citations).

---
*Phase: 08-home-retire-polish*
*Completed: 2026-05-02*
