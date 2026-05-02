# Phase 8: Home, Retire, Polish - Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 50+ (8 new DAL/route, 6 new components, 5 new copy modules, 11 modifications, 18 deletions, 7+ new tests)
**Analogs found:** Strong analog for every NEW file; deletions mirror prior retirement waves.

Phase 8 is mostly composition over invention. Every NEW file has a strong analog already living in the Phase 6/7 codebase. The plan is to mirror the established rhythms exactly:

- **DAL boundary** — every SQL query goes through `src/lib/db/`. New `aliases.ts` and `queries/home.ts` follow the `landings.ts` / `queries/trends.ts` shape (single export per concern, prepared statement, named params, JSDoc with source citations).
- **URL-as-state** — explorer state lives in `URLSearchParams` parsed via Zod in `src/lib/shared/urlState.ts`. Granularity (D-39) extends `ExplorerFiltersSchema` exactly the way Phase 7's `moon` flag did. Home page (`/`) deliberately has no URL state (D-14); the existing `parseHomeFilters` / `serializeHomeFilters` helpers retire.
- **Loader-shapes-data, DAL-stays-pure** — all gap-fill, alias resolution, and chart-option JSON live in route loaders consuming DAL helpers.
- **ECharts dynamic import** — `Chart.svelte` already wraps the dynamic import; theme integration (D-30) and x-axis migration (D-35) extend it without re-architecture.
- **Copy modules** — verbatim user-facing strings live in `src/lib/copy/*.ts` (constants only, no logic). Pattern set by `metrics.ts` (Phase 2) and `moon.ts` (Phase 7).
- **Sticky header rhythm** — `ExplorerHeader.svelte` already slots `RangeStrip` + `CustomDateInputs` + Phase 7 moon button. Granularity selector + theme toggle extend it inline.

---

## File Classification

### NEW files (8 + 6 + 5 + 7 = 26)

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/lib/db/aliases.ts` | DAL repository | CRUD + lookup | `src/lib/db/landings.ts` (small repo with single-table CRUD) | exact (role + flow) |
| `src/lib/db/queries/home.ts` | DAL query module | request-response (read-aggregate) | `src/lib/db/queries/trends.ts` (bucketed aggregate per series) and `src/lib/db/queries/explorer.ts::speciesAcrossBoats` (two-pass top-N) | exact (role) + role-match (flow) |
| `src/lib/auth/admin.ts` | utility (auth) | request-response (cookie sign/verify) | None in repo (no auth surface yet) — mirror Node `crypto` idiom from RESEARCH.md §"Admin Auth — Recommendation" | new pattern (cite RESEARCH) |
| `src/routes/+page.server.ts` | controller (loader) | request-response | `src/routes/explorer/+page.server.ts` (loader composes DAL + cache headers + logger) | exact (role + flow) — REPLACE existing |
| `src/routes/+page.svelte` | component (page) | event-driven render | `src/routes/explorer/+page.svelte` (page + sections) | exact — REPLACE existing |
| `src/routes/+layout.server.ts` | controller (layout loader) | request-response (locals → data) | `src/routes/about/+page.server.ts` (small loader) — but the operative model is RESEARCH.md §Pattern 2 | role-match |
| `src/routes/+error.svelte` | component (error boundary) | event-driven | `src/routes/+layout.svelte` (root-level page render); SvelteKit `+error.svelte` is a primitive | new pattern (cite RESEARCH §Pattern 6) |
| `src/routes/admin/trip-types/+page.server.ts` | controller (loader + form actions) | request-response + CRUD | `src/routes/compare/+page.server.ts` (loader with parse-filter + DAL composition) | role-match |
| `src/routes/admin/trip-types/+page.svelte` | component (page) | event-driven | `src/routes/compare/+page.svelte` (form + table + per-row actions) | role-match |
| `src/lib/components/ThemeToggle.svelte` | component (UI control) | event-driven (click → cookie write) | `src/lib/components/ExplorerHeader.svelte` (Moon toggle button at lines 58-71) — same icon/role-switch button pattern | exact (role) |
| `src/lib/components/GranularitySelector.svelte` | component (UI control) | event-driven (click → callback) | `src/lib/components/RangeStrip.svelte` (entire file is the model) | exact |
| `src/lib/components/NewLabelBadge.svelte` | component (badge) | static render | `src/lib/components/ProvisionalBadge.svelte` (existing tiny badge component, used by `BoatRow` and `PageHeader`) | exact |
| `src/lib/components/HomeSectionCard.svelte` | component (card) | static render | `src/lib/components/BoatCard.svelte` (existing card component for /boats detail) | role-match |
| `src/lib/components/BoatBarRow.svelte` | component (row with bar) | static render | `src/lib/components/BoatRow.svelte` (table row with cells) — extends with `<div>` bar bg layer | role-match |
| `src/lib/components/LoadingSkeleton.svelte` | component (skeleton) | static render | `src/lib/components/Chart.svelte` lines 92-97 (in-component "Loading chart…" placeholder) | role-match |
| `src/lib/components/BoatSearchInput.svelte` (or extracted) | component (typeahead) | event-driven (input → callback) | `src/lib/components/TickerPills.svelte` (small accessible button group) — but typeahead pattern is new; RESEARCH.md §"Don't Hand-Roll" recommends `<datalist>` | role-match (HTML `<datalist>`) |
| `src/lib/copy/home.ts` | config (copy constants) | n/a | `src/lib/copy/moon.ts` (small focused copy module with section comment + 3-5 exports) | exact |
| `src/lib/copy/admin.ts` | config (copy constants) | n/a | `src/lib/copy/moon.ts` | exact |
| `src/lib/copy/theme.ts` | config (copy constants) | n/a | `src/lib/copy/moon.ts` | exact |
| `src/lib/copy/empty-states.ts` | config (copy constants — variants by ticker × scenario) | n/a | `src/lib/copy/metrics.ts` (multiple named exports for the same domain) | exact |
| `src/lib/copy/error-page.ts` | config (copy constants) | n/a | `src/lib/copy/moon.ts` | exact |
| `src/lib/shared/theme.ts` | utility (cookie name + token names) | n/a | `src/lib/shared/range.ts` (small constants/helpers module) | role-match |
| `tests/unit/db/aliases.test.ts` | test | request-response | `tests/unit/db/landings.test.ts` (CRUD repo unit-test) | exact |
| `tests/unit/db/queries/home.test.ts` | test | request-response | `tests/unit/db/queries/trends.test.ts`, `tests/unit/db/queries/explorer.test.ts` | exact |
| `tests/unit/auth/admin.test.ts` | test | request-response | `tests/unit/shared/slug.test.ts` (pure-helper unit test) | role-match |
| `tests/unit/shared/urlState.test.ts` | test (extension) | request-response | self — extend with new `granularity` cases | exact (extend) |
| `tests/integration/redirects.test.ts` | test (integration) | request-response | `tests/integration/explorer-routes.test.ts` (full URL → loader path) | exact |
| `tests/integration/admin.test.ts` | test (integration) | request-response | `tests/integration/explorer-routes.test.ts` | role-match |

### MODIFIED files (11)

| File | Section / Surface Receiving Change | Closest Analog |
|------|------------------------------------|----------------|
| `src/lib/db/migrations.ts` | (a) Add `runAliasTableMigration(db)` helper (alias-table CREATE+seed); (b) drop `forecasts` block from `SCHEMA_SQL`; (c) add `dropForecastsTable(db)` helper called from `runMigrations`. See SCHEMA_SQL lines 17-112 for the existing pattern. | self (existing helpers `hasSlugColumn`, `backfillSlugs` are the prior-art for additive migration helpers) |
| `src/lib/db/queries/explorer.ts` | Inject alias join/COALESCE into `boatExplorerSeries`, `speciesAcrossBoats`, `landingAcrossSpecies` (D-03 alias-aware). `GROUP BY <canonical_expr>` everywhere — never `GROUP BY trip_type` (RESEARCH §Pitfall 1). | self — apply RESEARCH §Pattern 1 (`ALIAS_JOIN_SQL` + `CANONICAL_TRIP_TYPE_EXPR` constants) |
| `src/lib/db/queries/compare.ts` | Same alias injection (D-25). Lines 60-72 GROUP BY currently uses `cr.trip_type` filter; trip type is a single-value WHERE filter so the alias-aware change there is to use canonical-expr matching against the WHERE clause. | self |
| `src/lib/db/queries/trends.ts` | Alias-aware bucketing (D-03). The two prepared-statement variants in `boatTrend` (lines 95-146) need their GROUP BY adjusted. | self |
| `src/lib/shared/urlState.ts` | (a) Add `granularity: z.enum(['daily','weekly','monthly']).optional()` to `ExplorerFiltersSchema` (D-39); (b) clean-URL serialization — emit only when non-default (mirror `moon` pattern at lines 308-309); (c) consider deleting `HomeFiltersSchema` / `parseHomeFilters` / `serializeHomeFilters` since D-14 removes home URL state. | self — Phase 7 moon-flag pattern at lines 252-261 + 308-309 is the literal model |
| `src/lib/shared/dates.ts` | Possibly add `weekStart(s)` / `monthStart(s)` helpers if loader needs canonical bucket-start ISO dates for x-axis `time` migration (D-35, RESEARCH §Pitfall 4). Existing `isoWeekKey`, `monthKey` at lines 74-89 are the analog. | self |
| `src/routes/explorer/+page.server.ts` | (a) Resolve granularity from URL with range-default fallback (D-36, D-38); (b) emit `bucket_start_iso` for x-axis `time` (D-35); (c) call alias-aware DAL functions; (d) emit theme-aware chart palette tokens (or expose them to the chart). Loader is 28K lines — focus on `granularity` resolution + chartOption builder (search for `xAxis: { type: 'category'`). | self (existing 28K loader is its own model) |
| `src/routes/explorer/+page.svelte` | (a) Wire granularity callback through `ExplorerHeader`; (b) on range change, compute new range's default granularity and strip from URL if user-chosen == default (RESEARCH §Pitfall 3); (c) read theme palette for tooltipFormatter. | self |
| `src/routes/compare/+page.server.ts` | Replace boat-ID schema with name/slug-based picker. `parseCompareFilters` (`urlState.ts:143-163`) must change to accept slugs or boat names. Alias-aware queries already covered above. | self + `src/routes/explorer/+page.server.ts` (slug pattern for boat ticker) |
| `src/routes/compare/+page.svelte` | Replace text input "Boat IDs (comma-separated, 2–3)" (lines 82-95) with `BoatSearchInput` component instances or a typeahead picker. | self + `src/lib/components/TickerPills.svelte` |
| `src/lib/components/ExplorerHeader.svelte` | (a) Add `<GranularitySelector>` next to `<RangeStrip>` in Row 3 (currently lines 54-72); (b) consider adding `<ThemeToggle>` alongside, OR put it in `+layout.svelte` for cross-route presence. CONTEXT.md D-37 says "lives in `ExplorerHeader`" but D-27 says "in the page header" — operator-level resolution: theme toggle goes in nav/layout (every route), granularity selector goes in `ExplorerHeader` (explorer-only). | self |
| `src/lib/components/Chart.svelte` | (a) X-axis `category → time` migration is loader-side; component just passes through; (b) add ECharts theme integration via CSS-var readback + MutationObserver (RESEARCH §Pattern 3). | self (lines 26-83 — the `onMount` IIFE + `$effect` re-apply pattern) |
| `src/lib/components/EmptyState.svelte` | Already supports `cta`. Variants come from copy module strings. May not need code change — verify and add `tone` prop only if needed. | self |
| `src/routes/+layout.svelte` | (a) Drop `/picker`, `/trends` from `navItems` (lines 7-13); (b) add `<ThemeToggle>` to nav row; (c) optional: read `data.theme` to render `data-theme` somewhere. | self |
| `src/routes/about/+page.svelte` | Drop forecast section (lines 78-141), drop heatmap references, drop picker references; rewrite to describe v2 explorer + home + alias mapping; keep "Where the data comes from", "What fish/angler means", "Trip type matters", "Sample size", "Data gaps", "How fresh", "Contact" (lines 14-77 + 142-145). | self |
| `src/lib/server/scheduler.ts` | Remove `recomputeForecasts` import (line 27), remove the recompute block (lines 84-97), and the import of `getDb` if no longer used. Replace OPS-04 SLA call (line 78) consistent with D-21 (scraper/parser-failure-only — verify `checkSlaAndAlert` already does this; if not, simplify). | self |
| `src/hooks.server.ts` | (a) Add 301 redirect block before existing requestId/logger; (b) add admin auth gate for `/admin/*`; (c) add cookie read for theme + `transformPageChunk` swap on `<html data-theme>`. Existing 38-line file is small; the additions roughly double it. | self + RESEARCH §Pattern 2 (theme cookie SSR), §Pattern 4 (301 redirect), §Pattern 5 (admin auth) |
| `src/app.html` | Add `data-theme="%fc_theme%"` placeholder on `<html>` so `transformPageChunk` can substitute. Currently line 2: `<html lang="en">`. | RESEARCH §Pattern 2 |
| `src/app.css` | Add dark-palette CSS variable block + `@custom-variant dark` rule per RESEARCH §Pattern 2. Existing `@theme` block (lines 3-39) is the model. | self + RESEARCH §Pattern 2 |
| `package.json` | Delete `scripts.forecasts:rebuild` entry (per RESEARCH §"Build artifacts"). | n/a |

### DELETED files (18)

| File | Reason |
|------|--------|
| `src/routes/picker/+page.server.ts` | D-16 |
| `src/routes/picker/+page.svelte` | D-16 |
| `src/routes/picker/heatmapOption.ts` | D-16 (calendar heatmap retires) |
| `src/routes/trends/+page.server.ts` | D-16 |
| `src/routes/trends/+page.svelte` | D-16 |
| `src/lib/forecast/compute.ts` | D-19 (entire `src/lib/forecast/` directory) |
| `src/lib/db/forecasts.ts` | D-19 |
| `src/lib/db/queries/forecastHeatmap.ts` | D-19 |
| `scripts/forecast-benchmark.ts` | D-19 |
| `scripts/forecasts-rebuild.ts` (if exists) | D-19 |
| `tests/forecast/` (entire dir — 6 files) | D-19 + RTR-09 |
| `tests/unit/db/forecasts.test.ts` | D-19 |
| `tests/unit/db/queries/forecastHeatmap.test.ts` | D-19 |
| `tests/unit/routes/picker.test.ts` | D-16, RTR-09 |
| `tests/unit/routes/picker-heatmap-option.test.ts` | D-16, RTR-09 |
| `tests/unit/routes/picker/heatmapOption-forecast.test.ts` | D-16, RTR-09 |
| `tests/unit/routes/trends.test.ts` | D-16, RTR-09 |
| `tests/unit/lint/per-angler-discipline.test.ts` | D-20 (3-file allowlist lint removed) |
| `tests/unit/components/PerAnglerMetric-forecast.test.ts` | D-19 (forecast variant tests) |
| `tests/unit/routes/home.test.ts` | replaced by tests for new home (rewrite, not pure delete) |
| `.planning/todos/pending/compare-page-boat-id-picker.md` (if still present) | folded per CONTEXT §Folded Todos |

---

## Pattern Assignments

### `src/lib/db/aliases.ts` (DAL repository, CRUD + lookup) — NEW

**Analog:** `src/lib/db/landings.ts` (a small DAL module exposing focused CRUD on a single table) and `src/lib/db/boats.ts` (richer-shaped repository with multiple `prepare`-and-`get`/`all` methods).

**Module-header pattern** (mirrors `src/lib/db/queries/trends.ts:1-23`):

```typescript
// src/lib/db/aliases.ts — Trip-type alias DAL (D-01..D-06).
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
// Read-time translation only — raw catch_reports.trip_type is never mutated (D-01).
//
// Sources:
//   .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-01..D-06
//   .planning/phases/08-home-retire-polish/08-RESEARCH.md §Pattern 1
//
// Responsibilities:
//   ALI-01: trip_type_aliases schema constraints (FK-free; status enum)
//   ALI-02: alias-aware SQL fragments consumed by every query that surfaces trip_type
//   ALI-03: list-all-distinct-source-labels for /admin/trip-types
//   ALI-04: upsert (alias / accept / reset-to-pending) for admin CRUD
import type Database from 'better-sqlite3';
```

**Exported SQL fragments pattern** (per RESEARCH §Pattern 1 — used by every alias-aware query):

```typescript
// Pure SQL fragments (no user input). Consumed by explorer/compare/trends/home queries
// to inject the read-time alias join. Mirrors how src/lib/copy/metrics.ts owns the
// shared "fish/angler" string — one source of truth.
export const ALIAS_JOIN_SQL = `
  LEFT JOIN trip_type_aliases tta ON tta.source_label = cr.trip_type
`;

export const CANONICAL_TRIP_TYPE_EXPR = `
  COALESCE(
    CASE WHEN tta.status = 'aliased' THEN tta.canonical_label ELSE NULL END,
    cr.trip_type
  )
`;
```

**Repository CRUD pattern** (mirrors `src/lib/db/landings.ts` — one prepared statement per concern):

```typescript
export interface AliasRow {
  source_label: string;
  canonical_label: string;
  status: 'aliased' | 'accepted' | 'pending';
  accepted_at: string | null;
  notes: string | null;
}

/** ALI-04: Insert or update an alias row (admin CRUD entry point). */
export function upsertAlias(
  db: Database.Database,
  args: { source_label: string; canonical_label: string; status: AliasRow['status']; notes?: string | null }
): void {
  db.prepare(
    `INSERT INTO trip_type_aliases (source_label, canonical_label, status, accepted_at, notes)
     VALUES (@source_label, @canonical_label, @status,
             CASE WHEN @status = 'pending' THEN NULL ELSE datetime('now') END,
             @notes)
     ON CONFLICT(source_label) DO UPDATE SET
       canonical_label = excluded.canonical_label,
       status = excluded.status,
       accepted_at = CASE WHEN excluded.status = 'pending' THEN NULL ELSE datetime('now') END,
       notes = excluded.notes`
  ).run({ ...args, notes: args.notes ?? null });
}

/** ALI-03: List every distinct source_label ever scraped, joined with current alias state.
 *  Used by /admin/trip-types as the master list. */
export function listAllLabelsWithStatus(db: Database.Database): Array<{
  source_label: string;
  canonical_label: string | null;
  status: AliasRow['status'] | null;
  first_seen: string;
  last_seen: string;
  trip_count: number;
}> {
  return db.prepare(
    `SELECT cr.trip_type AS source_label,
            tta.canonical_label,
            tta.status,
            MIN(cr.source_date) AS first_seen,
            MAX(cr.source_date) AS last_seen,
            COUNT(DISTINCT cr.source_date || '|' || cr.boat_id) AS trip_count
       FROM catch_reports cr
       LEFT JOIN trip_type_aliases tta ON tta.source_label = cr.trip_type
      GROUP BY cr.trip_type
      ORDER BY trip_count DESC`
  ).all() as Array<{ source_label: string; canonical_label: string | null; status: AliasRow['status'] | null; first_seen: string; last_seen: string; trip_count: number }>;
}
```

---

### `src/lib/db/queries/home.ts` (DAL query module, request-response read-aggregate) — NEW

**Analog (primary):** `src/lib/db/queries/trends.ts` — bucketed aggregate query, gap-fill is loader-side (`trends.ts:18-23`), prepared statements with named params, type-safe args/return interfaces.
**Analog (secondary):** `src/lib/db/queries/explorer.ts::speciesAcrossBoats` — two-pass top-N pattern (Pass 1 selects top N entities, Pass 2 fetches series restricted to those IDs). Lines 99-130. Same shape applies to home: Pass 1 = viable trip types (≥5/7d); Pass 2 = top-5 boats per trip type by fpa.

**Imports pattern**:

```typescript
import type Database from 'better-sqlite3';
import type { BoatRow } from '$lib/db/boats';
import { ALIAS_JOIN_SQL, CANONICAL_TRIP_TYPE_EXPR } from '$lib/db/aliases';
```

**Two-pass query pattern** (mirrors `explorer.ts::speciesAcrossBoats:99-130`):

```typescript
export interface HomeArgs {
  fromDate: string; // today() - 7 days
  toDate: string;   // today()
  minTrips?: number; // default 5 per D-08
  perSection?: number; // default 5 per D-09
}

export interface HomeRow {
  boat_id: number;
  boat_slug: string;
  boat_display_name: string;
  trip_count: number;
  total_caught: number;
  total_anglers: number;
  fpa: number;
}

export interface HomeSection {
  canonical_trip_type: string;
  status: 'aliased' | 'accepted' | 'pending';
  trip_count: number;
  rows: HomeRow[];
}

/** HOME-01..03: top-N boats per viable trip type, past 7 days, fpa-ranked, alias-aware. */
export function homeSections(db: Database.Database, args: HomeArgs): HomeSection[] {
  const minTrips = args.minTrips ?? 5;
  const perSection = args.perSection ?? 5;

  // Pass 1 — viable canonical trip types (after alias merge), ≥ minTrips/7d.
  const viable = db.prepare(
    `SELECT ${CANONICAL_TRIP_TYPE_EXPR} AS canonical_trip_type,
            COALESCE(tta.status, 'pending') AS status,
            COUNT(DISTINCT cr.source_date || '|' || cr.boat_id) AS trip_count
       FROM catch_reports cr
       ${ALIAS_JOIN_SQL}
      WHERE cr.source_date BETWEEN @fromDate AND @toDate
      GROUP BY canonical_trip_type
     HAVING trip_count >= @minTrips
      ORDER BY trip_count DESC`
  ).all({ fromDate: args.fromDate, toDate: args.toDate, minTrips });

  // Pass 2 — top-N boats per canonical trip type, restricted to the Pass-1 set.
  // Implementation: one prepared statement run once per canonical_trip_type,
  // bounded by the Pass-1 row count (typically 7 in current data).
  // ...
}
```

**SQL conventions to mirror** (from existing DAL):
- `SUM(species_count) * 1.0 / NULLIF(SUM(angler_count), 0)` for weighted yield (matches `trends.ts:55-56` and `compare.ts:64`).
- `COUNT(DISTINCT cr.source_date || '|' || cr.trip_type)` for trip-count (matches `trends.ts:56`, `compare.ts:62`).
- `GROUP BY <canonical expression>` — never `GROUP BY trip_type` (RESEARCH §Pitfall 1).

---

### Migration additions in `src/lib/db/migrations.ts` — MODIFIED

**Analog:** the existing `runMigrations` function (lines 152-170) and `SCHEMA_SQL` constant (lines 17-112). The `hasSlugColumn` / `backfillSlugs` helper pair (lines 117-143) is the prior-art for "additive helper called from `runMigrations`."

**Idempotent additive helper pattern** (mirror `backfillSlugs:129-143`):

```typescript
// In src/lib/db/migrations.ts — added below backfillSlugs():

/** ALI-01 (D-02, D-06): create trip_type_aliases + seed confident merges. Idempotent.
 *  Re-running on a populated table is a no-op (seed only when COUNT = 0). */
function runAliasTableMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trip_type_aliases (
      source_label TEXT PRIMARY KEY,
      canonical_label TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('aliased', 'accepted', 'pending')),
      accepted_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_alias_canonical ON trip_type_aliases(canonical_label);
    CREATE INDEX IF NOT EXISTS idx_alias_status ON trip_type_aliases(status);
  `);

  const count = (db.prepare('SELECT COUNT(*) AS c FROM trip_type_aliases').get() as { c: number }).c;
  if (count === 0) {
    // Seed per D-06 + RESEARCH §"Code Examples — Idempotent Alias Table Migration + Seed"
    // (lines 891-957). Operator must review the seed list before commit.
    // ...
  }
}

/** RTR-03 (D-19): drop forecasts table + indexes. Idempotent. */
function dropForecastsTable(db: Database.Database): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_forecasts_unique;
    DROP INDEX IF EXISTS idx_forecasts_range;
    DROP TABLE IF EXISTS forecasts;
  `);
}
```

**`SCHEMA_SQL` edit** — strip the forecasts block (lines 92-111) so the canonical schema no longer recreates it on boot. `runMigrations` calls `db.exec(SCHEMA_SQL)` first, then the new helpers:

```typescript
export function runMigrations(db: Database.Database): void {
  db.exec(`DROP TABLE IF EXISTS ${LEGACY_PHASE0_TABLE}`);
  db.exec(SCHEMA_SQL); // forecasts block removed — see Phase 8 D-19
  // ... existing slug migration ...
  runAliasTableMigration(db); // ALI-01
  dropForecastsTable(db);     // RTR-03 — must run AFTER SCHEMA_SQL strip
  // ... existing index ensures ...
}
```

---

### `src/routes/+page.server.ts` (controller, request-response) — REPLACE

**Analog:** `src/routes/explorer/+page.server.ts` lines 114-150 (loader composes DAL + cache headers + logger + return shape) — same general arc as the new home loader, just simpler shape.

**Loader skeleton** (mirrors `explorer/+page.server.ts:114-150` with the simpler shape of `compare/+page.server.ts:24-50`):

```typescript
// src/routes/+page.server.ts — Home (HOME-01..05)
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Sources:
//   .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-07..D-15
//   .planning/phases/08-home-retire-polish/08-RESEARCH.md §"Home-Page Section Shape"
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db/client';
import { homeSections } from '$lib/db/queries/home';
import { latestSuccessOrEmpty } from '$lib/db/scrapeRuns';
import { today, addDays, toPtTimeLabel } from '$lib/shared/dates';

export const load: PageServerLoad = async ({ setHeaders, locals }) => {
  const db = getDb();
  const toDate = today();
  const fromDate = addDays(toDate, -7);

  // D-15: Cache-Control discipline matches Phase 6 hot-path queries
  setHeaders({ 'cache-control': 'public, max-age=300' });

  const sections = homeSections(db, { fromDate, toDate });
  const lastScrape = latestSuccessOrEmpty(db);
  const lastScrapedLabel = lastScrape ? toPtTimeLabel(lastScrape.finished_at) : null;

  locals.logger?.info({
    msg: 'home_loaded',
    sections: sections.length,
    fromDate, toDate
  });

  return { sections, fromDate, toDate, lastScrapedLabel };
};
```

**Cache-Control note** — current `+page.server.ts:23` uses `max-age=60` (today-inclusive provisional). New home is past-7-days, no provisional flag, so the longer Phase 6 cache is appropriate.

---

### `src/routes/+page.svelte` (component, page) — REPLACE

**Analog:** `src/routes/explorer/+page.svelte` (sections + chart + empty-state) and `src/routes/compare/+page.svelte` lines 117-159 (per-row card grid).

**Title + structure pattern** (D-34):

```svelte
<svelte:head>
  <title>What's been biting — FishCount</title>
</svelte:head>

<PageHeader title="What's been biting" subtitle="Past 7 days, San Diego" lastScrapedLabel={data.lastScrapedLabel} />

{#each data.sections as section (section.canonical_trip_type)}
  <HomeSectionCard {section} />
{/each}

{#if data.sections.length === 0}
  <EmptyState
    heading="Nothing scraped in the last 7 days"
    body="The nightly scraper may be down — try again later, or check the explorer."
    cta={{ label: 'Open the explorer', href: '/explorer' }}
  />
{/if}
```

---

### `src/lib/components/ThemeToggle.svelte` (UI control, event-driven) — NEW

**Analog:** `ExplorerHeader.svelte` lines 58-71 — the moon button. Same `<button type="button" role="switch" aria-checked={...}>` pattern with state-aware `aria-label` and Tailwind class composition.

**Cycle button pattern** (D-27):

```svelte
<script lang="ts">
  import { THEME_TOGGLE_LABEL, themeToggleAria } from '$lib/copy/theme';
  let { theme }: { theme: 'auto' | 'light' | 'dark' } = $props();

  // D-27: cycle Auto → Light → Dark → Auto
  const next: Record<typeof theme, typeof theme> = { auto: 'light', light: 'dark', dark: 'auto' };

  function cycle() {
    const n = next[theme];
    document.cookie = `fc_theme=${n}; Path=/; SameSite=Lax; Max-Age=31536000`;
    document.documentElement.dataset.theme = n;
    theme = n; // local state for icon swap
  }
</script>

<button
  type="button"
  aria-label={themeToggleAria(theme)}
  onclick={cycle}
  class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-3 py-2 text-sm">
  <!-- Icon reflects CURRENT state (D-27): sun for light, moon for dark, sun-moon for auto -->
  {#if theme === 'light'}☀{:else if theme === 'dark'}☾{:else}☼{/if}
</button>
```

Cookie name `fc_theme`; SameSite=Lax; Max-Age=1 year. The cookie write is mirrored server-side via `transformPageChunk` in `hooks.server.ts` per RESEARCH §Pattern 2.

---

### `src/lib/components/GranularitySelector.svelte` (UI control, event-driven) — NEW

**Analog:** `src/lib/components/RangeStrip.svelte` (entire 36-line file is the literal model).

**Identical button-group pattern** (D-37):

```svelte
<script lang="ts">
  type Granularity = 'daily' | 'weekly' | 'monthly';
  let { value, onChange }: { value: Granularity; onChange: (next: Granularity) => void } = $props();

  const items: Array<{ id: Granularity; label: string }> = [
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' }
  ];
</script>

<div role="group" aria-label="Chart granularity" class="flex gap-1">
  {#each items as item (item.id)}
    <button
      type="button"
      aria-pressed={value === item.id}
      class="min-h-11 shrink-0 rounded border px-3 py-2 text-sm font-semibold transition-colors {value === item.id
        ? 'bg-(--color-accent) text-white border-(--color-accent) hover:bg-(--color-accent-hover) hover:border-(--color-accent-hover)'
        : 'bg-(--color-surface) text-(--color-text-muted) border-(--color-border) hover:bg-(--color-accent-bg) hover:text-(--color-accent) hover:border-(--color-accent)'}"
      onclick={() => onChange(item.id)}>
      {item.label}
    </button>
  {/each}
</div>
```

D-37: hide when range < 3M. The hide is the parent's responsibility (`ExplorerHeader` `{#if showGranularity}{#snippet}...{/snippet}{/if}`).

---

### `src/lib/components/NewLabelBadge.svelte` (badge, static) — NEW

**Analog:** `src/lib/components/ProvisionalBadge.svelte` (existing tiny badge; `wc -l` reports ~8 lines). Same shape: zero props, one styled `<span>` with token-driven color.

```svelte
<!-- src/lib/components/NewLabelBadge.svelte (D-05) -->
<span
  class="inline-flex items-center rounded bg-(--color-provisional-bg) px-2 py-0.5 text-xs font-semibold text-(--color-provisional)"
  title="This trip-type label is awaiting review"
  aria-label="New trip-type label, awaiting review">
  NEW
</span>
```

Color tokens already exist (`--color-provisional` / `--color-provisional-bg`). Reuse rather than introducing a new badge color.

---

### `src/lib/components/HomeSectionCard.svelte` + `BoatBarRow.svelte` (cards/rows, static) — NEW

**Analog:** `BoatRow.svelte` (single-row table-cell layout) and `BoatCard.svelte` for the section-card framing.

**Per-section bar normalization pattern** (D-10) — RESEARCH §"Don't Hand-Roll" recommends inline-style CSS:

```svelte
<!-- BoatBarRow.svelte snippet — bar width = (row.fpa / sectionMax) * 100% -->
<div class="relative">
  <div
    class="absolute inset-y-0 left-0 bg-(--color-accent-bg)"
    style="width: {(row.fpa / sectionMax) * 100}%"
    aria-hidden="true">
  </div>
  <div class="relative flex items-baseline justify-between px-3 py-2">
    <a href="/explorer?ticker=boat&slug={row.boat_slug}" class="text-(--color-accent) underline">
      {row.boat_display_name}
    </a>
    <span class="tabular-nums">
      {row.fpa.toFixed(1)} fish/angler · {row.trip_count} {row.trip_count === 1 ? 'trip' : 'trips'}
    </span>
  </div>
</div>
```

Note: "fish/angler" literal — currently the per-angler-discipline lint blocks any non-allowlisted file from using this string. **D-20 retires that lint** entirely, so the home page can inline the literal. If the planner wants a softer migration, route the string through `FISH_PER_ANGLER_TOOLTIP_UNIT` from `src/lib/copy/metrics.ts` (lines 22-23) which is already exported.

---

### `src/lib/components/Chart.svelte` — MODIFIED

**Analog:** self. Existing dynamic-import + `onMount` IIFE + `$effect` re-apply pattern (lines 26-83) is the model.

**Theme-integration addition** (D-30, RESEARCH §Pattern 3):

```typescript
// Add to onMount IIFE, after `chart = init(chartEl)`:
const readPalette = () => {
  const cs = getComputedStyle(document.documentElement);
  return {
    background: cs.getPropertyValue('--color-surface').trim(),
    text: cs.getPropertyValue('--color-text').trim(),
    axis: cs.getPropertyValue('--color-text-muted').trim(),
    grid: cs.getPropertyValue('--color-border').trim()
  };
};
const applyPalette = () => {
  const p = readPalette();
  chart?.setOption({
    backgroundColor: p.background,
    textStyle: { color: p.text },
    xAxis: { axisLabel: { color: p.axis }, axisLine: { lineStyle: { color: p.grid } } },
    yAxis: { axisLabel: { color: p.axis }, splitLine: { lineStyle: { color: p.grid } } },
    legend: { textStyle: { color: p.text } },
    tooltip: { backgroundColor: p.background, textStyle: { color: p.text } }
  });
};
applyPalette(); // initial
const observer = new MutationObserver(() => requestAnimationFrame(applyPalette)); // RESEARCH §Pitfall 6
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
// teardown — observer.disconnect() in the existing return cleanup.
```

**X-axis migration** (D-35) is loader-side — `Chart.svelte` is pass-through.

---

### `src/lib/shared/urlState.ts` — MODIFIED

**Analog:** self. The Phase 7 `moon` flag (lines 252-261, 308-309) is the literal pattern to mirror for the new `granularity` field.

**Schema extension** — add to `RangeBase` (lines 257-262):

```typescript
const RangeBase = z.object({
  range: z.enum(RANGE_PRESETS).default('1y'),
  fromDate: dateField.optional(),
  toDate: dateField.optional(),
  moon: boolFlagField,
  // D-39: granularity URL param (Phase 8 GRN-01). Optional — loader resolves
  // to the range's default when absent. Default values are NOT serialized
  // (clean-URL pattern — see serializeExplorerFilters below, mirroring `moon`).
  granularity: z.enum(['daily', 'weekly', 'monthly']).optional()
});
```

**Serialize extension** — add at bottom of `serializeExplorerFilters` (around line 309):

```typescript
// D-39 + RESEARCH §Pitfall 3: serialize ONLY when value differs from the
// range's default. Caller passes pre-resolved value; this function emits
// the param verbatim if present. Default-stripping happens in the page's
// range-change handler before goto().
if (filters.granularity) sp.set('granularity', filters.granularity);
```

**Range default helper** — add a new exported function (parallel to `RANGE_PRESETS` from `range.ts`):

```typescript
// D-36 default mapping
export function defaultGranularityForRange(range: ExplorerFilters['range']): 'daily' | 'weekly' {
  const daily = new Set(['1m', '3m', '6m', 'custom']);
  return daily.has(range) ? 'daily' : 'weekly';
}
```

**Home filter retirement** — D-14 says home has no URL state. Lines 37-57 (`HomeFiltersSchema`, `parseHomeFilters`, `serializeHomeFilters`) can be deleted. Confirm no other importers via `git grep -nE 'parseHomeFilters|serializeHomeFilters|HomeFiltersSchema'` first.

---

### `src/hooks.server.ts` — MODIFIED

**Analog:** self (existing 38-line file is the structural skeleton). Additions slot inside the existing `handle` function.

**Combined hook pattern** (RESEARCH §Pattern 2 + §Pattern 4 + §Pattern 5):

```typescript
import { redirect, type Handle } from '@sveltejs/kit';
import { runStartup } from '$lib/server/startup';
import { logger } from '$lib/server/logger';
import { verifyAdminCookie } from '$lib/auth/admin';

runStartup();

export const handle: Handle = async ({ event, resolve }) => {
  // RDR-01, RDR-02 — 301 redirects (D-17, D-18). Drop query strings silently.
  const path = event.url.pathname;
  if (path === '/picker' || path.startsWith('/picker/') ||
      path === '/trends' || path.startsWith('/trends/')) {
    throw redirect(301, '/explorer');
  }

  // ALI-03 admin gate — mirror RESEARCH §Pattern 5 single-cookie check.
  if (path.startsWith('/admin/')) {
    const isLogin = path === '/admin/trip-types/login';
    if (!isLogin && !verifyAdminCookie(event.cookies.get('fc_admin'))) {
      throw redirect(303, '/admin/trip-types/login');
    }
  }

  // THM-02 theme cookie SSR — D-28 zero-flash. Validate against literal set
  // before substitution (RESEARCH §Pitfall 2).
  const rawTheme = event.cookies.get('fc_theme');
  const theme = rawTheme === 'light' || rawTheme === 'dark' ? rawTheme : 'auto';
  event.locals.theme = theme;

  // ... existing requestId/logger block ...

  const response = await resolve(event, {
    transformPageChunk: ({ html }) => html.replace('data-theme="%fc_theme%"', `data-theme="${theme}"`)
  });
  return response;
};
```

**`src/app.html` change** — line 2 becomes `<html lang="en" data-theme="%fc_theme%">`.

---

### `src/routes/+error.svelte` (error boundary) — NEW

**Analog:** None in repo (first error boundary). The pattern is SvelteKit-primitive; RESEARCH §Pattern 6 lines 642-674 has the full template. Project convention to mirror: use `$lib/copy/error-page` for strings, use `--color-text-muted` and `--color-accent` tokens (matches `EmptyState.svelte:13-21`).

---

### `src/routes/admin/trip-types/+page.server.ts` + `+page.svelte` — NEW

**Analog:** `src/routes/compare/+page.server.ts` (loader returns DAL data + filterOptions; form action would be a SvelteKit `actions` export — but compare uses `goto`, so admin diverges here). Closer analog for form actions: SvelteKit docs (RESEARCH cites this as `[CITED: svelte.dev/docs/kit/form-actions]`).

**Loader pattern** (mirror `compare/+page.server.ts:24-50`):

```typescript
import type { PageServerLoad, Actions } from './$types';
import { getDb } from '$lib/db/client';
import { listAllLabelsWithStatus, upsertAlias } from '$lib/db/aliases';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ setHeaders, locals }) => {
  setHeaders({ 'cache-control': 'private, no-store' }); // RESEARCH §"Admin Auth" gotcha
  const db = getDb();
  const labels = listAllLabelsWithStatus(db);
  return { labels };
};

export const actions: Actions = {
  alias: async ({ request, locals }) => {
    if (!locals.isAdmin) return fail(401, { error: 'Not authorized' });
    const fd = await request.formData();
    upsertAlias(getDb(), {
      source_label: String(fd.get('source_label')),
      canonical_label: String(fd.get('canonical_label')),
      status: 'aliased',
      notes: fd.get('notes') ? String(fd.get('notes')) : null
    });
    return { success: true };
  },
  // accept, reset (set status=pending) actions follow same shape
};
```

---

### `src/lib/auth/admin.ts` — NEW

**Analog:** None in repo. Follow RESEARCH §Pattern 5 verbatim — Node `crypto.createHmac` + `crypto.timingSafeEqual`, env vars `ADMIN_PASSWORD` + `ADMIN_COOKIE_SECRET`. ~30 lines. No external library.

```typescript
// src/lib/auth/admin.ts — Single-password admin gate (ALI-03).
// Sources: .planning/phases/08-home-retire-polish/08-RESEARCH.md §Pattern 5
import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.ADMIN_COOKIE_SECRET;
const PASSWORD = process.env.ADMIN_PASSWORD;

export function checkPassword(input: string): boolean {
  if (!PASSWORD) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(PASSWORD);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function signAdminCookie(): string {
  if (!SECRET) throw new Error('ADMIN_COOKIE_SECRET unset');
  const payload = JSON.stringify({ admin: true, iat: Date.now() });
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifyAdminCookie(cookie: string | undefined): boolean {
  if (!cookie || !SECRET) return false;
  const [payloadB64, sig] = cookie.split('.');
  if (!payloadB64 || !sig) return false;
  const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  const expected = createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;
  // Optional: enforce 24h expiry on iat
  const { iat } = JSON.parse(payload);
  return Date.now() - iat < 24 * 60 * 60 * 1000;
}
```

---

### Copy modules (`src/lib/copy/{home,admin,theme,empty-states,error-page}.ts`) — NEW

**Analog (template):** `src/lib/copy/moon.ts` (24 lines, single domain, header-comment + named consts).

**Header pattern** (mirror `moon.ts:1-9`):

```typescript
// src/lib/copy/home.ts — Phase 8 home-page copy constants
//
// Single source of truth for home-page user-facing strings (HOME-01..05).
// Strings are user-facing — verbatim per .planning/phases/08-home-retire-polish/08-CONTEXT.md
// §D-09, §D-34. Do NOT paraphrase.
//
// Why a separate file (not metrics.ts): metrics.ts is scoped to the per-angler
// metric. A separate home.ts keeps both modules' purposes legible. (Pattern set
// by Phase 7's moon.ts — same rationale.)

export const HOME_PAGE_TITLE = "What's been biting — FishCount";
export const HOME_PAGE_HEADING = "What's been biting";
export const HOME_PAGE_SUBTITLE = (fromDate: string, toDate: string) =>
  `Past 7 days · ${fromDate} → ${toDate}`;
export const sectionHeading = (canonicalLabel: string, tripCount: number) =>
  `${canonicalLabel} · ${tripCount} trips this week`;
```

Same skeleton for `admin.ts` (per-row action labels), `theme.ts` (toggle aria-labels for the 3 states), `error-page.ts` (404 vs 500 headings/bodies), `empty-states.ts` (boatNoHistoryAtAll, boatNoHistoryInRange, speciesNoHistoryInRange, etc.).

---

### Tests — NEW

**Analog (DAL test):** `tests/unit/db/landings.test.ts`, `tests/unit/db/migrations.test.ts` (lines 1-80 — describe/it/expect with `openTestDb` helper).

**Analog (route loader test):** `tests/unit/routes/explorer.test.ts`, `tests/integration/explorer-routes.test.ts` (lines 1-80 — `vi.mock` on `$lib/db/client`, in-memory DB seeding).

**Analog (URL state test):** `tests/unit/shared/urlState.test.ts` (existing 21K test extends with new `granularity` cases).

**Standard test header**:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { openTestDb } from '../../helpers/in-memory-db';
import { runMigrations } from '../../../src/lib/db/migrations';
import { upsertAlias, listAllLabelsWithStatus } from '../../../src/lib/db/aliases';
```

**Test files to create** (per VALIDATION wave-0; finalize at planning):
- `tests/unit/db/aliases.test.ts` — CRUD + listAllLabelsWithStatus
- `tests/unit/db/queries/home.test.ts` — viable-trip-type filter, top-N per section, alias merge
- `tests/unit/db/migrations.test.ts` — extend with alias-table tests + forecasts-drop test
- `tests/unit/auth/admin.test.ts` — sign/verify roundtrip + tampered cookie rejection
- `tests/unit/shared/urlState.test.ts` — extend with granularity parse/serialize cases
- `tests/integration/redirects.test.ts` — `/picker*` → 301 `/explorer`; same for `/trends*`
- `tests/integration/admin.test.ts` — gate enforces 303 to login when cookie absent
- `tests/integration/home.test.ts` — replace existing `home.test.ts`; viable-trip-type sections, n=1 cells render

---

### `src/lib/server/scheduler.ts` — MODIFIED

**Analog:** self. The existing tick body (lines 48-110) is the model; surgical removal only.

**Excerpt to delete** (lines 27, 84-97):

```typescript
// Line 27 — REMOVE this import
import { recomputeForecasts } from '$lib/forecast/compute';
import { getDb } from '$lib/db/client'; // line 28 — REMOVE if no longer used

// Lines 84-97 — REMOVE this entire block (forecast nightly recompute, FCT-06)
if (result.outcome === 'success' || result.outcome === 'empty') {
  try {
    recomputeForecasts(getDb());
    tickLogger.info({ msg: 'forecast_recompute_complete' });
  } catch (err) {
    tickLogger.error({ err, msg: 'forecast_recompute_failed_non_fatal' });
  }
}
```

**SLA alert simplification (D-21)** — verify `checkSlaAndAlert` already gates on `outcome` (it short-circuits per the comment at line 73). If the function still has a row-count <50% rule internally, drop that branch and keep only `parse_error` / `http_error` alerting. May require a separate edit to `src/lib/scraper/sla.ts` — out of this file's scope but called out here for the planner.

---

## Shared Patterns

### Authentication / Admin Gate

**Source:** `src/hooks.server.ts` (modified) + `src/lib/auth/admin.ts` (new)
**Apply to:** Any route under `/admin/*`. Currently only `/admin/trip-types`; the gate is generalized so future admin routes inherit it.

### DAL alias-injection

**Source:** `src/lib/db/aliases.ts` exports `ALIAS_JOIN_SQL` + `CANONICAL_TRIP_TYPE_EXPR`
**Apply to:** Every query that surfaces or groups by `trip_type` — `queries/home.ts` (new), `queries/explorer.ts` (modified), `queries/compare.ts` (modified), `queries/trends.ts` (modified). Always GROUP BY the canonical expression — never `cr.trip_type` (RESEARCH §Pitfall 1).

### Cache-Control discipline

**Source:** `src/routes/explorer/+page.server.ts:?` (`setHeaders({ 'cache-control': 'public, max-age=...' })`)
**Apply to:**
- New home loader → `public, max-age=300` (5 min, hot path)
- Admin route → `private, no-store` (RESEARCH §"Admin Auth" gotcha)
- Existing today-inclusive routes already set `max-age=60` — unchanged.

### Logger discipline

**Source:** `src/routes/explorer/+page.server.ts:?` (`locals.logger?.info({ msg: '...', ... })`)
**Apply to:** Every new loader (`+page.server.ts`). Payload contains no PII (anonymous explorer); admin loader can include `isAdmin: true` flag.

### Copy module pattern

**Source:** `src/lib/copy/moon.ts` lines 1-9 (header) + body (named const exports + small helper functions for parameterized strings)
**Apply to:** All 5 new copy modules (`home`, `admin`, `theme`, `empty-states`, `error-page`). One module per domain; never extend an existing module to cover an unrelated domain.

### URL clean-serialization (default-stripping)

**Source:** `src/lib/shared/urlState.ts:308-309` (Phase 7 moon flag — `if (filters.moon) sp.set('moon', '1');`)
**Apply to:** New `granularity` field — emit only when non-default. The default-stripping happens at the page-component layer (range-change handler) before `goto()` per RESEARCH §Pitfall 3.

### Sticky header rhythm

**Source:** `src/lib/components/ExplorerHeader.svelte` (entire file, especially lines 42-87)
**Apply to:** Any new control on the explorer page (granularity selector slots into Row 3 alongside `RangeStrip` and the moon button).

### Single-color-token discipline

**Source:** `src/app.css` lines 3-39 (`@theme` block — every component reads `--color-*` via `bg-(--color-...)` Tailwind 4 syntax)
**Apply to:** All new components. Dark theme adds parallel CSS variables under `[data-theme="dark"]` and `@media (prefers-color-scheme: dark) :where([data-theme="auto"]) { ... }` — components do NOT branch on theme; they use the same `var(--color-...)` references and the variables resolve correctly.

### Idempotent migration

**Source:** `src/lib/db/migrations.ts:152-170` (existing `runMigrations`)
**Apply to:** Alias-table create + seed (count-zero check before INSERT) and forecasts-drop (`IF EXISTS`). Both must be safe to re-run on every boot.

### Zod URL parse + safeParse error branch

**Source:** `src/lib/shared/urlState.ts:287-291` (existing `parseExplorerFilters`)
**Apply to:** Any new URL-state contract — admin form submissions (form actions) reuse Zod against `formData` directly.

---

## No Analog Found

Files with no close match in the codebase (planner should rely on RESEARCH.md primarily):

| File | Role | Data Flow | Reason | Source to Cite |
|------|------|-----------|--------|----------------|
| `src/lib/auth/admin.ts` | utility (cookie HMAC) | request-response | First auth surface in repo | RESEARCH §Pattern 5 (lines 609-641) |
| `src/routes/+error.svelte` | error boundary | event-driven | First `+error.svelte` in repo | RESEARCH §Pattern 6 (lines 642-674) |
| Theme cookie SSR plumbing | hook + layout + html | request-response | First cookie-driven SSR pattern | RESEARCH §Pattern 2 (lines 449-524) |
| `BoatSearchInput.svelte` | typeahead | event-driven | No typeahead component yet (existing inputs are `<select>`) | RESEARCH §"Don't Hand-Roll" — recommends HTML `<datalist>` |
| Dark-mode CSS variable block | styling | n/a | First three-mode theme | RESEARCH §Pattern 2 (`@custom-variant dark`) + Tailwind 4 v6 docs |
| ECharts theme readback | chart wrapper | event-driven | First theme-aware chart | RESEARCH §Pattern 3 (lines 525-575) |

For all of the above, the pattern is fully spec'd in RESEARCH.md and the planner can cite section + line numbers in the plan's `read_first` list.

---

## Metadata

**Analog search scope:**
- `src/lib/db/` — 8 files (boats.ts, catchReports.ts, client.ts, forecasts.ts, landings.ts, migrations.ts, parseFailures.ts, scrapeRuns.ts) + `src/lib/db/queries/` 8 files
- `src/lib/components/` — 17 files
- `src/lib/copy/` — 2 files
- `src/lib/shared/` — 5 files
- `src/lib/server/` — 6 files
- `src/routes/` — 12 directories + root layout/page
- `tests/` — `unit/db/`, `unit/db/queries/`, `unit/routes/`, `unit/components/`, `unit/lint/`, `unit/shared/`, `integration/`, `forecast/`

**Files scanned:** ~70 source files, ~30 test files
**Pattern extraction date:** 2026-05-02

---

*Phase: 08-home-retire-polish*
*Pattern map: 2026-05-02*
