# Phase 02: Browse + Trip Picker + Trends — Pattern Map

**Mapped:** 2026-04-24
**Files analyzed:** ~40 new + 2 modified
**Analogs found:** 32 / 40 (8 files have NO analog — flagged below; planner falls back to RESEARCH.md and UI-SPEC.md for those)

> Phase 2 is overwhelmingly **compositional**. Phase 1 already nailed the DAL boundary, the in-process SQLite singleton, the in-memory test rig, the dates-producer rule, and the request-scoped logger. There are NO Svelte component analogs, NO `+page.server.ts` analogs, NO ECharts integration anywhere yet — those file types are net-new. For DAL queries, helpers, scripts, and tests, there are strong existing analogs the planner should reference verbatim.

---

## File Classification

### Query modules (NEW — role: DAL repository, data flow: cross-table read)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/lib/db/queries/browse.ts` | repository | read (today/by-date rows + JOIN boats×landings + filter-bar option lists) | `src/lib/db/catchReports.ts` | role-match (single-table → cross-table extension) |
| `src/lib/db/queries/tripPicker.ts` | repository | read + GROUP BY + weighted aggregate + 30-cell heatmap shape | `src/lib/db/scrapeRuns.ts::computeSlaBaseline` (AVG/window) + `catchReports.ts` | role-match |
| `src/lib/db/queries/boatDetail.ts` | repository | read recent-trips + season-totals + distinct trip types | `src/lib/db/catchReports.ts::getByDate` | role-match |
| `src/lib/db/queries/trends.ts` | repository | read + GROUP BY `strftime('%V-%G' or '%Y-%m', ...)` + node-side gap-fill | `src/lib/db/scrapeRuns.ts::computeSlaBaseline` | role-match |
| `src/lib/db/queries/compare.ts` | repository | read multi-boat aggregate within trip type | `src/lib/db/catchReports.ts` + `scrapeRuns.ts` | role-match |
| `src/lib/db/scrapeRuns.ts` (MODIFY) | repository | add `latestSuccessOrEmpty()` for "Last scraped at" | self | exact (extend with another function in the same file pattern) |
| `src/lib/db/boats.ts` (MODIFY, optional) | repository | add `getByIdWithLanding(id)` helper | self | exact |

### Shared helpers (NEW + MODIFY — role: utility)

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/lib/shared/urlState.ts` (NEW) | utility | parse/serialize URL searchParams per route | `src/lib/scraper/schema.ts` (Zod parse boundary) + `src/lib/shared/dates.ts` (single-purpose pure module) | role-match |
| `src/lib/shared/dates.ts` (MODIFY) | utility | extend with `addDays`, `clamp`, `isoWeekKey`, `monthKey`, `parseIso`, `toPtTimeLabel`, week/month bucket helpers | self | **exact** |

### Routes — `+page.server.ts` (NEW — role: SSR loader)

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/routes/+page.server.ts` | SSR loader | URL → DAL query → JSON | `src/routes/healthz/+server.ts` (server endpoint, similar shape) + `src/lib/scraper/sla.ts` (DAL composition pattern) | partial — shape is similar; load() vs GET() differs in signature |
| `src/routes/date/[date]/+page.server.ts` | SSR loader | URL params + searchParams → DAL → JSON | same | partial |
| `src/routes/picker/+page.server.ts` | SSR loader | URL searchParams → urlState parse → DAL → JSON | same | partial |
| `src/routes/boats/[id]/+page.server.ts` | SSR loader | URL params → DAL → JSON | same | partial |
| `src/routes/compare/+page.server.ts` | SSR loader | URL searchParams → DAL → JSON | same | partial |
| `src/routes/trends/+page.server.ts` | SSR loader | URL searchParams → DAL → JSON | same | partial |

### Routes — `+page.svelte` (NEW + REPLACE — role: Svelte 5 component)

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/routes/+page.svelte` (REPLACE) | page component | data prop → table render | `src/routes/+page.svelte` (placeholder) | none — placeholder is empty stub |
| `src/routes/+layout.svelte` (NEW) | layout shell | top nav + main slot | none | **none** |
| `src/routes/date/[date]/+page.svelte` | page component | data prop → table + date nav | none | **none** |
| `src/routes/picker/+page.svelte` | page component | data prop → FilterBar + Chart + BoatCard list | none | **none** |
| `src/routes/boats/[id]/+page.svelte` | page component | data prop → sections + tables | none | **none** |
| `src/routes/compare/+page.svelte` | page component | data prop → side-by-side cols + Chart | none | **none** |
| `src/routes/trends/+page.svelte` | page component | data prop → FilterBar + Chart | none | **none** |
| `src/routes/about/+page.svelte` | static page | none — pure markup | none | **none** |

### Reusable Svelte components (NEW — role: component)

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/lib/components/PerAnglerMetric.svelte` | component | props → formatted span | none | **none** (no `src/lib/components/` directory exists yet) |
| `src/lib/components/Chart.svelte` | component | echarts dynamic-import in onMount | none | **none** |
| `src/lib/components/FilterBar.svelte` | component | URL goto() handlers | none | **none** |
| `src/lib/components/BoatRow.svelte` | component | row in `<table>` | none | **none** |
| `src/lib/components/BoatCard.svelte` | component | card with expandable panel | none | **none** |
| `src/lib/components/PageHeader.svelte` | component | title + lastScrapedAt + provisional badge | none | **none** |
| `src/lib/components/EmptyState.svelte` | component | heading + body + optional CTA | none | **none** |
| `src/lib/components/ProvisionalBadge.svelte` | component | inline pill | none | **none** |
| `src/lib/components/LastScrapedLabel.svelte` | component | inline text | none | **none** |

> All component files have **no codebase analog**. Planner must use UI-SPEC.md §Component Contracts as the source of truth — those contracts include the exact prop shapes, rendering rules, ARIA attributes, and Tailwind classes. No Phase 1 code references Svelte 5 runes (`$state`, `$derived`, `$effect`); planner should use Svelte 5 docs (linked in RESEARCH.md) for syntax.

### Dev scripts (NEW — role: CLI script)

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `scripts/seed-dev-db.ts` | CLI script | read fixture HTML → parsePage → DAL upsert (loop across synthetic dates) | `scripts/backfill.ts` | **exact** — same tsx + parseArgs + DAL-only + entry-point guard pattern; replace `scrapeDate` call with direct `parsePage` + DAL |

### Test files (NEW — role: test)

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `tests/unit/db/queries/browse.test.ts` | unit test | seeded in-memory DB → query call → assert shape | `tests/unit/db/catchReports.test.ts` | **exact** |
| `tests/unit/db/queries/tripPicker.test.ts` | unit test | seeded in-memory DB → weighted-yield query → assertions | `tests/unit/db/scrapeRuns.test.ts` (windowed AVG) + `catchReports.test.ts` | **exact** |
| `tests/unit/db/queries/boatDetail.test.ts` | unit test | as above | `tests/unit/db/catchReports.test.ts` | **exact** |
| `tests/unit/db/queries/trends.test.ts` | unit test | as above + ISO-week / month-key assertions + gap-fill | `tests/unit/db/scrapeRuns.test.ts` | **exact** |
| `tests/unit/db/queries/compare.test.ts` | unit test | as above | `tests/unit/db/catchReports.test.ts` | **exact** |
| `tests/unit/shared/urlState.test.ts` | unit test | round-trip parse/serialize property tests | `tests/unit/scraper/schema.test.ts` (Zod schema tests) | role-match |
| `tests/unit/shared/dates.test.ts` (NEW or extend) | unit test | new helper coverage | none — `dates.ts` has no test file yet, only the boundary test | partial |
| `tests/unit/routes/*.test.ts` | integration test | mock `event` shape → call load() → assert returned data | `tests/unit/scripts/backfill.test.ts` (vi.resetModules + tmp DB + DAL imports) | **exact** for the env-isolation skeleton; load() invocation is novel |
| `tests/unit/scripts/seed-dev-db.test.ts` | integration test | run main() → assert rows present | `tests/unit/scripts/backfill.test.ts` | **exact** |
| `tests/helpers/seedTestDb.ts` (NEW) | test helper | seed catch_reports with shaped synthetic data | `tests/unit/db/catchReports.test.ts::seedBoat` (inline helper) | role-match — extract+generalize |
| `tests/unit/components/*.test.ts` (optional) | unit test | render component → assert output | none | **none** — no Svelte component test rig in repo. Planner: this is OK to skip in Phase 2 (RESEARCH.md §What's NOT in stack notes Phase 2 verification = SQL fixture tests + manual UAT, NOT browser-component tests) |

### Config / styling (MODIFY — role: config)

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `package.json` | dep manifest | add `echarts ^6.0.0`, `date-fns ^4.1.0` | self | **exact** — Phase 1 added `cheerio`, `croner`, etc. via the same `dependencies` block |
| `src/app.css` (MODIFY) | global styles | add `@theme` block per UI-SPEC.md Color section | self | **exact** — file already exists with `@import 'tailwindcss';` |

---

## Pattern Assignments

### `src/lib/db/queries/browse.ts` (DAL repository, cross-table read)

**Analog:** `src/lib/db/catchReports.ts` + `src/lib/db/scrapeRuns.ts`

**Module-header pattern** (replicate verbatim from `catchReports.ts` lines 1-9 / `scrapeRuns.ts` lines 1-10):

```typescript
// src/lib/db/queries/browse.ts — Cross-table read compositions for /, /date/[d].
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
// D-06 / D-07: cross-table queries live under queries/; per-table CRUD stays
// in the parent src/lib/db/.
//
// Responsibilities:
//   BRW-01: getRowsForDate(date) — JOIN catch_reports × boats × landings
//   BRW-06: distinctTripTypes / distinctLandings / distinctSpecies for filter bars
import type Database from 'better-sqlite3';
```

**Prepared-statement + `.all()` pattern** (copy from `catchReports.ts:62-71`):

```typescript
export function getRowsForDate(db: Database.Database, date: string): RowForDate[] {
  return db
    .prepare(
      `SELECT cr.source_date, cr.boat_id, b.display_name AS boat_name,
              cr.landing_id, l.display_name AS landing_name,
              b.source_url AS boat_source_url,
              l.source_url AS landing_source_url,
              cr.trip_type, cr.species, cr.angler_count, cr.species_count,
              cr.scraped_at
         FROM catch_reports cr
         JOIN boats b ON b.id = cr.boat_id
         JOIN landings l ON l.id = cr.landing_id
        WHERE cr.source_date = ?
        ORDER BY l.display_name, b.display_name, cr.trip_type, cr.species`
    )
    .all(date) as RowForDate[];
}
```

**DO copy:**
- The exact module-header docstring style (CLAUDE.md citation + D-references + responsibilities list).
- `import type Database from 'better-sqlite3';` (type-only, never the constructor — that's `client.ts`'s job).
- `db.prepare(...)`+`.all(date)`+`as RowForDate[]` cast to a typed result interface.
- ORDER BY for deterministic output (matches `catchReports.ts:69`).
- The "DAL is the only module that issues SQL" comment header.

**DO NOT copy:**
- `Database.Database` type as a positional or default arg. Phase 1 always passes the DB handle as the first parameter; preserve that. (Lets tests pass an in-memory DB and prod use the singleton.)
- Inlined SQL inside loops — always prepare once, execute many. (See `catchReports.ts:42-46` `db.transaction` pattern for batching, but Phase 2 is read-only so no transactions are needed.)

---

### `src/lib/db/queries/tripPicker.ts` (DAL repository, weighted aggregate + heatmap)

**Analog:** `src/lib/db/scrapeRuns.ts::computeSlaBaseline` (windowed aggregate) + `catchReports.ts`

**Weighted yield pattern** (D-08): adapt the AVG window pattern from `scrapeRuns.ts:51-62`:

```typescript
// Source: src/lib/db/scrapeRuns.ts:51-62 (windowed aggregate idiom).
// Phase 2 D-08: SUM/SUM weighted yield, NOT AVG of per-row ratios.
export function rankBoatsForQuery(
  db: Database.Database,
  args: { fromDate: string; toDate: string; species: string; tripType: string }
): RankedBoat[] {
  return db
    .prepare(
      `SELECT b.id AS boat_id,
              b.display_name AS boat_name,
              l.display_name AS landing_name,
              SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS avg_per_angler,
              COUNT(DISTINCT cr.source_date || '|' || cr.trip_type) AS n_trips,
              MAX(cr.source_date) AS last_trip_date
         FROM catch_reports cr
         JOIN boats b ON b.id = cr.boat_id
         JOIN landings l ON l.id = cr.landing_id
        WHERE cr.species = ?
          AND cr.trip_type = ?
          AND cr.source_date BETWEEN ? AND ?
        GROUP BY b.id, b.display_name, l.display_name
        ORDER BY avg_per_angler DESC NULLS LAST, n_trips DESC`
    )
    .all(args.species, args.tripType, args.fromDate, args.toDate) as RankedBoat[];
}
```

**DO copy:**
- The windowed `WHERE col BETWEEN ? AND ?` idiom (`scrapeRuns.ts:53-58` uses `date(?, '-7 days')` — Phase 2 receives pre-computed `fromDate`/`toDate` from the caller via `dates.ts::addDays`, so date arithmetic stays in `dates.ts`, not in SQL).
- `1.0 *` to force float division in SQLite (otherwise INTEGER division truncates).
- `NULLIF(SUM(...), 0)` to avoid divide-by-zero (return NULL → `<PerAnglerMetric>` renders "—").
- `ORDER BY ... DESC NULLS LAST` so n=0 boats sink.
- `COUNT(DISTINCT cr.source_date || '|' || cr.trip_type)` — the `||` concat trick gets per-trip distinct count without a subquery (D-09).

**DO NOT copy:**
- AVG-of-ratios — that is the rejected "mean of ratios" pattern. Use SUM/SUM.
- Date arithmetic in SQL (`date(?, '+30 days')`). All date math goes through `src/lib/shared/dates.ts` per STO-04. The caller computes `fromDate`/`toDate` and passes them as already-formatted strings (matches `scrapeRuns.ts:51-62` API shape where `today` is a parameter).

---

### `src/lib/db/queries/trends.ts` (DAL repository, time-bucketed aggregate)

**Analog:** `src/lib/db/scrapeRuns.ts::computeSlaBaseline` (windowed AVG) + RESEARCH.md §SQLite strftime guidance

**ISO-week + month bucket pattern** (D-27):

```typescript
// Phase 2 D-27: weekly buckets are ISO week (Mon–Sun) PT.
// SQLite: strftime('%V-%G', source_date)  → '17-2026' (week-year, year)
//         strftime('%Y-%m', source_date)  → '2026-04'
// We grouped on the strftime expression, then node-side gap-fill empty
// buckets via date-fns iso-week iteration to produce line-discontinuity gaps.
export function speciesTrend(
  db: Database.Database,
  args: { species: string; tripType: string; fromDate: string; toDate: string; granularity: 'weekly' | 'monthly' }
): TrendPoint[] {
  const bucketExpr = args.granularity === 'weekly' ? `strftime('%G-%V', cr.source_date)` : `strftime('%Y-%m', cr.source_date)`;
  return db
    .prepare(
      `SELECT ${bucketExpr} AS bucket,
              SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS value,
              COUNT(DISTINCT cr.source_date || '|' || cr.trip_type) AS n_trips
         FROM catch_reports cr
        WHERE cr.species = ?
          AND cr.trip_type = ?
          AND cr.source_date BETWEEN ? AND ?
        GROUP BY bucket
        ORDER BY bucket ASC`
    )
    .all(args.species, args.tripType, args.fromDate, args.toDate) as TrendPoint[];
}
```

**Gap-fill** is node-side (after the SQL returns):

```typescript
// Iterate expected buckets via date-fns; insert null for missing.
// date-fns has eachWeekOfInterval and eachMonthOfInterval.
import { eachWeekOfInterval, eachMonthOfInterval, formatISO } from 'date-fns';
// dates.ts produces the "from"/"to" Date objects via parseIso() — never `new Date(string)`.
```

**DO copy:**
- Windowed `WHERE BETWEEN ? AND ?` idiom from `scrapeRuns.ts:53-58`.
- The SUM/SUM / NULLIF / `COUNT(DISTINCT ... || '|' || ...)` pattern from `tripPicker.ts` above.

**DO NOT copy:**
- `strftime` with literal `'%V-%G'` interpolated as plain string concatenation when accepting user input — the granularity selector is enum-typed (`'weekly' | 'monthly'`) so safe, but always validate at the `urlState.ts` boundary (Zod) before reaching this query.
- `'%V-%G'` (week-year) vs `'%G-%V'` confusion — `%G` is ISO-week-year, `%V` is ISO-week-number. Bucket sort relies on year-first ordering.

---

### `src/lib/db/queries/boatDetail.ts` + `compare.ts` (DAL repository, cross-table read)

**Analog:** `src/lib/db/catchReports.ts::getByDate` + `boats.ts::getById`

Both follow the same pattern as `browse.ts` and `tripPicker.ts`:
- Module header citing CLAUDE.md + D-refs.
- Typed interfaces (e.g., `interface BoatProfile { ... }`).
- Prepared-statement + `.all()` / `.get()`.
- Caller passes `db: Database.Database` as first arg (matches every Phase 1 DAL fn).

**Specific to `boatDetail.ts`:** boat detail composes 3 queries — recent trips (`getByBoatIdSince(boatId, sinceDate)`), season totals (`getSeasonAggregate(boatId, fromDate)`), trip-type list (`getTripTypesForBoat(boatId)`). Either expose three separate fns or a single `getBoatProfile(boatId)` that calls all three. `boats.ts:42-50` already shows the `getById` pattern.

**Specific to `compare.ts`:** multi-boat aggregation — accept `boatIds: number[]` and use SQLite `WHERE boat_id IN (?, ?, ?)` with prepared placeholders generated from the array length:

```typescript
const placeholders = args.boatIds.map(() => '?').join(',');
db.prepare(`... WHERE boat_id IN (${placeholders}) AND trip_type = ? ...`)
  .all(...args.boatIds, args.tripType, ...);
```

---

### `src/lib/db/scrapeRuns.ts` (MODIFY — add `latestSuccessOrEmpty`)

**Analog:** `src/lib/db/scrapeRuns.ts::computeSlaBaseline` (lines 51-62 — same file, add a sibling function)

```typescript
/**
 * D-21: Returns the most recent finished_at where outcome IN ('success','empty').
 * Used by Phase 2 "Last scraped at" indicator on every data-showing page.
 * Null when no scrape has ever succeeded (fresh install / extended outage).
 */
export function latestSuccessOrEmpty(db: Database.Database): { finished_at: string } | null {
  const row = db
    .prepare(
      `SELECT finished_at
         FROM scrape_runs
        WHERE outcome IN ('success', 'empty')
        ORDER BY id DESC
        LIMIT 1`
    )
    .get() as { finished_at: string } | undefined;
  return row ?? null;
}
```

**DO copy:** the existing JSDoc style from `scrapeRuns.ts:43-49`; the `as { ... } | undefined` cast pattern; the `?? null` normalization.

---

### `src/lib/shared/dates.ts` (MODIFY — extend with bucket helpers)

**Analog:** self — the file already exists with 4 functions (`today`, `toIsoDate`, `currentPtMonth`, `TZ` constant). Extend in the same module. No new imports unless `date-fns` is added.

**Pattern: extend the file in-place with the same shape:**

```typescript
// existing: today(), toIsoDate(d), currentPtMonth()
// add:

/**
 * Add (or subtract, with negative n) calendar days to a YYYY-MM-DD date string.
 * Pure: input string -> output string. Does NOT derive "now" — STO-04 compliant.
 *
 * Implementation note: see scrapeRuns.ts::addOneDay (lines 138-145) for the
 * canonical UTC-Date arithmetic pattern this project uses to avoid the banned
 * `.toISOString().slice(0, 10)` idiom.
 */
export function addDays(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Clamp a YYYY-MM-DD to [min, max] inclusive (string-comparable). */
export function clamp(s: string, min: string, max: string): string {
  if (s < min) return min;
  if (s > max) return max;
  return s;
}

/** Parse "HH:MM" PT label from an ISO-8601 instant. Used by "Last scraped at". */
export function toPtTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(iso));
}
```

**DO copy:**
- The exact UTC-Date arithmetic pattern from `scrapeRuns.ts:138-145` (`addOneDay`). It is STO-04 compliant per the comment block in that function. The new `addDays` lives in `dates.ts` (the proper home); `scrapeRuns.ts::addOneDay` becomes redundant and can either remain (private to `scrapeRuns.ts`) or be deleted in favor of `addDays`.
- The `Intl.DateTimeFormat` + `TZ` pattern from existing `today()` / `toIsoDate()` (lines 6-23).

**DO NOT copy:**
- `new Date().toISOString().slice(0, 10)` — banned by `tests/unit/shared/dates-boundary.test.ts:46`. The boundary test scans `src/lib/shared/dates.ts` is **excluded** from the scan (per the test's `SCOPE_DIRS`), but using the idiom anywhere else in Phase 2 will fail CI. (See test file lines 27-34 for the scope list.)
- `.split('T')[0]` (also banned, see `dates-boundary.test.ts:74-107`).

---

### `src/lib/shared/urlState.ts` (NEW — typed URL parse/serialize)

**Analog:** `src/lib/scraper/schema.ts` (Zod schema parse boundary) + `src/lib/shared/dates.ts` (pure single-purpose module shape)

**Pattern:**

```typescript
// src/lib/shared/urlState.ts
// Source: 02-CONTEXT.md D-18, D-19; 02-RESEARCH.md §URL state.
// Single typed parse/serialize boundary for filter URL search params.
// Server load() functions and client filter UI both call these helpers.
import { z } from 'zod';

// One Zod schema per route's filter shape. Picker example:
export const PickerFiltersSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  species: z.string().min(1),
  tripType: z.string().min(1),               // D-10 required
  windowDays: z.coerce.number().int().min(0).max(14).default(3),
  rangeMode: z.coerce.boolean().default(false),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});
export type PickerFilters = z.infer<typeof PickerFiltersSchema>;

export function parsePickerFilters(searchParams: URLSearchParams): PickerFilters | { error: z.ZodError } {
  const obj = Object.fromEntries(searchParams);
  const result = PickerFiltersSchema.safeParse(obj);
  return result.success ? result.data : { error: result.error };
}

export function serializePickerFilters(f: PickerFilters): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  return sp;
}
```

**DO copy:**
- The Zod schema + `safeParse` boundary pattern from `src/lib/scraper/schema.ts:21-50` (Zod is already a dep — no install needed).
- The verbatim domain-language preservation from `schema.ts:32-34` (trip_type stays verbatim — no normalization).
- One schema + parser + serializer per route (so each route's load function imports only its own filter shape).

**DO NOT copy:**
- The `.transform()` lowercasing from `schema.ts:39-42`. URL state preserves verbatim trip-type / species strings — they need to match DB strings exactly. (Lowercase species ARE stored lowercase in DB per Phase 1 D-03, so the input from a `<select>` of distinct species values from `queries/browse.ts::distinctSpecies()` is already correct.)

---

### `src/routes/+page.server.ts` and other `+page.server.ts` files (NEW — SSR loader)

**Analog:** `src/routes/healthz/+server.ts` (similar SvelteKit shape but `+server.ts` is for API endpoints; `+page.server.ts` is for SSR loaders) + `src/lib/scraper/sla.ts` (DAL composition pattern)

**Closest existing pattern (DAL composition):** `src/lib/scraper/sla.ts:64-94` — the orchestration of "get DB → call DAL → assemble result" is the same shape as a `load()` function:

```typescript
// src/routes/+page.server.ts
// Source: 02-CONTEXT.md D-03, D-20, D-21, D-29.
// SSR home page: today's per-boat counts.
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db/client';
import { getRowsForDate } from '$lib/db/queries/browse';
import { latestSuccessOrEmpty } from '$lib/db/scrapeRuns';
import { today, toPtTimeLabel } from '$lib/shared/dates';

export const load: PageServerLoad = async ({ setHeaders, locals }) => {
  const db = getDb();
  const todayStr = today();

  setHeaders({ 'cache-control': 'public, max-age=60' });   // D-29

  const rows = await getRowsForDate(db, todayStr);        // (sync under the hood — wrap is fine)
  const lastScrape = await latestSuccessOrEmpty(db);

  locals.logger.info({ msg: 'home_load', rows: rows.length });

  return {
    rows,
    today: todayStr,
    isProvisional: true,                                   // D-20
    lastScrapedLabel: lastScrape ? toPtTimeLabel(lastScrape.finished_at) : null
  };
};
```

**DO copy:**
- The `import { getDb } from '$lib/db/client';` aliased import (Phase 1 uses `$lib/...` everywhere — see `pipeline.ts:25-32`).
- `event.locals.logger.info(...)` for request-scoped logging (Phase 1 wires this in `hooks.server.ts:13-23`; `app.d.ts:6-9` declares the `Locals.logger` type).
- The shape "open DB → call DAL → assemble JSON → return" mirrors `sla.ts:64-94`.

**DO NOT copy:**
- `closeDb()` after the load — the singleton is process-lifetime; closing it kills subsequent requests. Only `scripts/backfill.ts:158-162` calls `closeDb()`, because it's a one-shot CLI.
- Any SQL string in this file — STO-03 / `dal-boundary.test.ts` will fail. All SQL stays under `src/lib/db/`.
- Any direct `new Date()` for date strings — STO-04 / `dates-boundary.test.ts` will fail. Use `today()` / `toIsoDate()` from `dates.ts`.
- A `try/catch` around the DAL call that swallows errors. SvelteKit catches load() errors and routes them to `+error.svelte` — let it. (Phase 5 handles error UX; Phase 2 default-errors are acceptable per the UI-SPEC §Error state.)

---

### `src/routes/+page.svelte` and other `+page.svelte` files (NEW — Svelte 5 page)

**Analog:** none — Svelte 5 component contracts come from UI-SPEC.md §Component Contracts and §Per-Route Layouts.

**Pattern (from UI-SPEC.md):**

```svelte
<script lang="ts">
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import BoatRow from '$lib/components/BoatRow.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Today's Counts — FishCount</title></svelte:head>

<PageHeader
  title="Today's Counts"
  subtitle={`${data.today}, San Diego`}
  showProvisional={data.isProvisional}
  lastScrapedLabel={data.lastScrapedLabel}
/>

{#if data.rows.length === 0}
  <EmptyState heading="No counts reported yet today." body="..." />
{:else}
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <!-- header + tbody loop with <BoatRow row={r} /> -->
    </table>
  </div>
{/if}
```

**DO copy from UI-SPEC.md:**
- Per-route layouts (UI-SPEC §Per-Route Layouts, lines 511-585) — heading text, subtitle copy, FilterBar shape, content sections.
- Empty state copy (UI-SPEC §Empty / no-results states, lines 213-225) — exact strings.
- Tailwind class palette (UI-SPEC §Color, §Typography, §Spacing).
- ARIA + accessibility patterns (UI-SPEC §Accessibility).

**DO NOT:**
- Add icons / emojis / hype badges. UI-SPEC §Anti-Feature Guards (lines 673-691) lists 15 forbidden patterns — checker enforces.
- Render any per-angler number except via `<PerAnglerMetric>`. The component owns formatting + framing.
- Mix trip types in a single per-angler comparison view. CLAUDE.md non-negotiable #4.

---

### `src/lib/components/PerAnglerMetric.svelte` (NEW — MANDATORY component)

**Analog:** **none** in codebase. Source of truth: UI-SPEC.md §Component Contracts §1, lines 326-363.

UI-SPEC specifies:
- Props: `{ value: number; nTrips: number; ctx?: 'row' | 'card' | 'hero'; showFraming?: boolean }`
- Format rules: NaN/null/n=0 → "—"; ≥10 → integer; <10 → one decimal trim trailing `.0`.
- Suffix: ` fish/angler · n=${nTrips} trips` (or "1 trip" when nTrips===1).
- Low-data badge inline between unit and n-label when `nTrips < 5 && nTrips > 0`.
- Inline framing on first instance per page (via `<PerAnglerFramingProvider>` Svelte context).
- `<span class="tabular-nums font-semibold">` wrapper.

**DO copy:** the exact text strings from UI-SPEC §Copywriting Contract (lines 188-200).
**DO NOT:** allow any caller to inject pre-formatted strings or override the framing — anti-pattern enforced per UI-SPEC line 358.

---

### `src/lib/components/Chart.svelte` (NEW — ECharts dynamic import wrapper)

**Analog:** **none** in codebase. Source of truth: UI-SPEC.md §Component Contracts §2, lines 365-393, plus RESEARCH.md §ECharts dynamic-import (echarts/core + only the chart-type modules used).

Key constraints (from UI-SPEC + RESEARCH):
- SSR renders skeleton; `onMount` does dynamic `import('echarts/core')` + only `LineChart`, `HeatmapChart`, `CalendarChart`, `TooltipComponent`, `GridComponent`, `VisualMapComponent`.
- ResizeObserver for responsive re-render.
- `aria-label` is required.
- Honor `prefers-reduced-motion: reduce` by passing `animation: false` to `setOption`.

**DO NOT:**
- Statically import `echarts` from any `+page.svelte` or `+page.server.ts`. Bundle size will balloon.
- Render the chart server-side. Chart is client-only per D-04.

---

### `scripts/seed-dev-db.ts` (NEW — dev fixture replay CLI)

**Analog:** `scripts/backfill.ts` — exact pattern.

**Copy this skeleton verbatim** (from `scripts/backfill.ts:1-39`, then adapt the loop):

```typescript
#!/usr/bin/env tsx
// scripts/seed-dev-db.ts — Phase 2 D-33 dev fixture replay.
// Replays committed HTML fixtures from tests/fixtures/scraper/*.html through
// parsePage + DAL upsert across synthetic dates so /trends and /heatmap have
// data to render in dev. Idempotent (Phase 1 ING-04 upsert invariant).
//
// NON-PRODUCTION ONLY: hard-gates on NODE_ENV !== 'production'.
//
// Usage: NODE_ENV=development tsx scripts/seed-dev-db.ts \
//          [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--quiet]
//
// NO SvelteKit boot: relative `.ts` imports at this top-level file per
// 01-PATTERNS.md §SvelteKit-Alias Boundary.
//
// NO SQL: DAL boundary (CLAUDE.md + STO-03). All DB I/O via typed DAL fns.

import { parseArgs } from 'node:util';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parsePage } from '../src/lib/scraper/parser.ts';
import { upsertBoatsAndLandings } from '../src/lib/db/boats.ts';
import { upsertMany as upsertCatchReports } from '../src/lib/db/catchReports.ts';
import { recordOutcome } from '../src/lib/db/scrapeRuns.ts';
import { getDb, closeDb } from '../src/lib/db/client.ts';
import { addDays, today } from '../src/lib/shared/dates.ts';

if (process.env.NODE_ENV === 'production') {
  console.error('[seed-dev-db] refusing to run in production');
  process.exit(1);
}
// ... (see backfill.ts:55-139 for parseArgs + main() loop skeleton)
```

**DO copy verbatim:**
- The shebang `#!/usr/bin/env tsx` (line 1).
- The "NO SvelteKit boot / NO SQL" comment block (lines 23-30).
- Relative `.ts` imports at the top-level script (NOT `$lib/...`) — Phase 1 PATTERNS.md §SvelteKit-Alias Boundary explicitly mandates this for `scripts/*.ts`.
- The `parseArgs` + USAGE + DATE_RE + `main(): Promise<number>` shape from `backfill.ts:38-139`.
- The entry-point self-invocation guard from `backfill.ts:144-174`.
- The `closeDb()` in the exit path (CLI-only — never in `+page.server.ts`).

**DO NOT copy:**
- `scrapeDate()` invocation (that does live HTTP — D-33 explicitly forbids). Replace with: read fixture HTML → `parsePage(html)` → `upsertBoatsAndLandings(db, rows)` → `upsertMany(db, catchRows)` → `recordOutcome(db, { outcome: 'success', ... })`.
- The `FIRST_SCRAPE_OK` env gate. Seed script has its own gate (`NODE_ENV !== 'production'`).

---

### `tests/unit/db/queries/*.test.ts` (NEW — DAL unit tests)

**Analog:** `tests/unit/db/catchReports.test.ts` — exact pattern.

**Copy this skeleton verbatim** (from `tests/unit/db/catchReports.test.ts:1-30`):

```typescript
// tests/unit/db/queries/tripPicker.test.ts
// Phase 2 D-08, D-09: weighted yield + n=distinct-trip-count.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../../helpers/in-memory-db';
import * as boats from '../../../../src/lib/db/boats';
import * as landings from '../../../../src/lib/db/landings';
import * as catchReports from '../../../../src/lib/db/catchReports';
import * as tripPicker from '../../../../src/lib/db/queries/tripPicker';
import type { CatchReportRow } from '../../../../src/lib/db/catchReports';

function seedTrip(db: Database.Database, ...) { /* ... */ }

describe('tripPicker.rankBoatsForQuery (D-08, D-09)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('weights yield by SUM(species_count)/SUM(angler_count) — not mean of ratios', () => {
    db = openTestDb();
    // ... seed two trips with different angler counts so weighted ≠ mean-of-ratios
    // Trip 1: 50 fish / 25 anglers = 2.0
    // Trip 2: 10 fish / 5 anglers = 2.0  (same ratio)
    // Trip 3: 20 fish / 20 anglers = 1.0  (lower yield, 4x the anglers)
    // Mean of ratios = (2.0 + 2.0 + 1.0) / 3 = 1.67
    // Weighted = 80 / 50 = 1.6
    // Assert weighted (1.6) is what the SQL returns.
  });
});
```

**DO copy:**
- `import { openTestDb } from '../../../helpers/in-memory-db';` (relative path adjusted for nested `queries/` subdir).
- `let db: Database.Database | null = null;` + `afterEach` close pattern (lines 18-25).
- Inline `seedBoat()` / `seedTrip()` helper functions per test (lines 12-16). For Phase 2, factor out into `tests/helpers/seedTestDb.ts` because the seeding gets verbose (multiple boats × multiple trips × multiple species).

**DO NOT copy:**
- `vi.resetModules()` / `vi.doMock()` from `tests/unit/scraper/pipeline.test.ts` — those are needed for the singleton + env-gating story; DAL query tests are pure functions of DB state.
- Network mocking. These tests have no fetch.

---

### `tests/unit/routes/*.test.ts` (NEW — load() integration tests)

**Analog:** `tests/unit/scripts/backfill.test.ts` — exact pattern for env isolation + tmp DB; load() invocation is novel.

**Copy this skeleton** (from `tests/unit/scripts/backfill.test.ts:40-77`):

```typescript
// tests/unit/routes/picker.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('routes/picker/+page.server.ts (load)', () => {
  let tmp: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fc-picker-'));
    originalEnv = { DB_PATH: process.env.DB_PATH };
    process.env.DB_PATH = join(tmp, 'test.sqlite3');
    vi.resetModules();
  });

  afterEach(async () => {
    try {
      const { closeDb } = await import('../../../src/lib/db/client');
      closeDb();
    } catch { /* ignore */ }
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(tmp, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns ranked boats sorted by weighted yield desc', async () => {
    // 1. import DAL fns; seed catch_reports
    // 2. import the load function: const { load } = await import('../../../src/routes/picker/+page.server.ts');
    // 3. call load with a fake event:
    //    const result = await load({
    //      url: new URL('http://localhost/picker?date=2026-04-23&species=yellowtail&tripType=Full+Day'),
    //      setHeaders: vi.fn(),
    //      locals: { logger: console as any, requestId: 'test' }
    //    } as any);
    // 4. assert shape: result.results[0].avg_per_angler > result.results[1].avg_per_angler
  });
});
```

**DO copy:**
- The tmp DB pattern (`mkdtempSync` + `process.env.DB_PATH = ...`) from `backfill.test.ts:46-58`.
- `vi.resetModules()` so the singleton rebinds with the new `DB_PATH` (lines 58, 64).
- The dynamic-import-after-env-set idiom — `await import(...)` not top-of-file `import` (lines 87-88, 130-133). Critical for env isolation.
- The fake-`event` shape — `{ url, setHeaders, locals }`. SvelteKit's load() signature is documented; the bare-minimum shape is a `URL` instance + a `setHeaders` mock + a `locals` object with `logger` (per `app.d.ts`).

**DO NOT copy:**
- `stubFetch()` — load() functions don't fetch; they call DAL.
- The `BACKFILL_SCRIPT_PATH` argv-1 dance from `backfill.test.ts:38` — not relevant to load() tests.

---

### `package.json` (MODIFY — add deps)

**Analog:** self — Phase 1 added 11 dependencies the same way.

**Pattern:**

```jsonc
"dependencies": {
  "better-sqlite3": "^12.9.0",
  "cheerio": "^1.2.0",
  "croner": "^10.0.1",
  "date-fns": "^4.1.0",       // ADD — for ISO-week + month iteration in trends gap-fill
  "echarts": "^6.0.0",        // ADD — calendar heatmap + line charts
  "p-queue": "^9.1.2",
  "p-retry": "^8.0.0",
  "pino": "^10.3.1",
  "proper-lockfile": "^4.1.2",
  "resend": "^6.12.2",
  "robots-parser": "^3.0.1",
  "zod": "^4.3.6"
}
```

**DO copy:** the alphabetic sort pattern (Phase 1 maintains this).
**DO NOT:** add `@tailwindcss/typography` unless `/about` clearly needs it — RESEARCH.md flags it as planner-discretionary.

---

### `src/app.css` (MODIFY — add design tokens)

**Analog:** self — file currently contains only `@import 'tailwindcss';`.

**Pattern:** UI-SPEC.md §Color §Tailwind 4 `@theme` declaration (lines 95-130). Copy verbatim.

```css
@import 'tailwindcss';

@theme {
  --color-surface: #ffffff;
  --color-surface-muted: #f8fafc;
  /* ... full block from UI-SPEC.md ... */
  --heatmap-4: #fde725;
}

/* Reduced motion (UI-SPEC §Accessibility line 661-665) */
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

---

## Shared Patterns (cross-cutting — apply to multiple Phase 2 files)

### Module-header docstring (every new `.ts` file)

**Source:** `src/lib/db/catchReports.ts:1-9`, `src/lib/db/scrapeRuns.ts:1-10`, `src/lib/scraper/sla.ts:1-18`

```typescript
// src/lib/db/queries/<module>.ts — <one-line purpose>
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Sources:
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-XX
//   .planning/phases/02-browse-trip-picker-trends/02-RESEARCH.md §<section>
//
// Responsibilities:
//   - <function 1 + REQ-ID>
//   - <function 2 + REQ-ID>
import type Database from 'better-sqlite3';
```

**Apply to:** every new `src/lib/db/queries/*.ts`, every new `+page.server.ts`, `urlState.ts`, and `seed-dev-db.ts`.

---

### DAL boundary discipline

**Source:** `tests/unit/db/dal-boundary.test.ts` (lines 1-56) — static grep enforcement.

The test scans `src/lib/scraper`, `src/lib/server`, `src/lib/alerts`, `src/lib/shared`, `src/lib/ops`, `scripts` for `\b(SELECT|INSERT INTO|UPDATE [a-zA-Z_]+|DELETE FROM)\b` (case-sensitive, comment lines stripped).

**Phase 2 implication:** `src/routes/` is NOT currently scanned. The planner MUST extend `SCOPE_DIRS` in `dal-boundary.test.ts:9-16` to include `'src/routes'` so SQL strings in `+page.server.ts` files would fail CI. This is a 1-line change in the test file. Cite it in the plan.

```typescript
// In tests/unit/db/dal-boundary.test.ts:
const SCOPE_DIRS = [
  'src/lib/scraper',
  'src/lib/server',
  'src/lib/alerts',
  'src/lib/shared',
  'src/lib/ops',
  'src/routes',     // ADD — Phase 2 SSR loaders must not contain SQL
  'src/lib/components',  // ADD — components must not contain SQL
  'scripts'
];
```

**Apply to:** every `+page.server.ts`, every `+page.svelte`, every `src/lib/components/*.svelte`. None of them may contain SQL.

---

### Date-producer discipline (STO-04)

**Source:** `tests/unit/shared/dates-boundary.test.ts:36-107` — bans `.toISOString().slice(0, N)` and `.split('T')[0]` outside `src/lib/shared/dates.ts`.

**Phase 2 implication:** Same scope-extension question. `dates-boundary.test.ts:27-34` does NOT scan `src/routes` either. The planner should extend the SCOPE_DIRS in `dates-boundary.test.ts:27-34` to include `'src/routes'` and `'src/lib/components'`.

```typescript
// In tests/unit/shared/dates-boundary.test.ts:
const SCOPE_DIRS = [
  'src/lib/scraper',
  'src/lib/db',
  'src/lib/server',
  'src/lib/alerts',
  'src/lib/ops',
  'src/routes',          // ADD
  'src/lib/components',  // ADD
  'scripts'
];
```

**Apply to:** every Phase 2 file that handles dates. Use `today()` / `toIsoDate(d)` / `addDays(s, n)` / `clamp(s, min, max)` from `src/lib/shared/dates.ts` exclusively.

---

### Logger correlation in load() functions

**Source:** `src/hooks.server.ts:13-23` (request-scoped child logger attached to `event.locals`) + `src/app.d.ts:6-9` (Locals typing) + `src/lib/scraper/sla.ts:75-93` (consumer pattern).

**Apply to:** every `+page.server.ts` `load()` function. Use `event.locals.logger` for request-correlated logs:

```typescript
export const load: PageServerLoad = async ({ locals, ... }) => {
  locals.logger.info({ msg: 'picker_load', ... });
  // never `import { logger } from '$lib/server/logger'` directly in a route
  // — the singleton lacks request correlation. The exception is non-route
  // code (DAL, scraper, scheduler) which uses the singleton because there
  // is no per-request scope.
};
```

---

### In-memory DB test rig

**Source:** `tests/helpers/in-memory-db.ts:1-13` (12-line helper) — opens `:memory:` DB + runs migrations.

**Apply to:** every `tests/unit/db/queries/*.test.ts`, every `tests/unit/routes/*.test.ts` that needs a real DB.

```typescript
import { openTestDb } from '../../../helpers/in-memory-db';
const db = openTestDb();   // schema applied; ready to seed
```

---

### Shared test seed helper (NEW — `tests/helpers/seedTestDb.ts`)

**Source:** factor from inline `seedBoat()` / `seedTrip()` in `tests/unit/db/catchReports.test.ts:12-16` and `tests/unit/db/scrapeRuns.test.ts:10-24`.

**Pattern:**

```typescript
// tests/helpers/seedTestDb.ts
// Shared seeding helpers for Phase 2 query tests.
import type Database from 'better-sqlite3';
import * as boats from '../../src/lib/db/boats';
import * as landings from '../../src/lib/db/landings';
import * as catchReports from '../../src/lib/db/catchReports';
import type { CatchReportRow } from '../../src/lib/db/catchReports';

export function seedBoat(
  db: Database.Database,
  args: { boatName: string; landingName: string; sourceUrl?: string }
): { boatId: number; landingId: number } {
  const landingId = landings.upsertByName(db, args.landingName, args.landingName);
  const boatId = boats.upsertByName(db, args.boatName, landingId, args.boatName, args.sourceUrl);
  return { boatId, landingId };
}

export function seedTrip(
  db: Database.Database,
  args: { boatId: number; landingId: number; date: string; tripType: string;
          species: string; anglers: number; count: number }
): void {
  catchReports.upsertMany(db, [{
    source_date: args.date, boat_id: args.boatId, landing_id: args.landingId,
    trip_type: args.tripType, species: args.species,
    angler_count: args.anglers, species_count: args.count,
    scraped_at: '2026-04-24T00:00:00Z'
  }]);
}
```

**DO copy:** the exact `seedBoat` pattern from `catchReports.test.ts:12-16`. Only addition is the `sourceUrl` param to support `boatDetail.ts` link tests.

---

### Tailwind 4 + `@theme` token convention

**Source:** UI-SPEC.md §Color (lines 95-130).

**Apply to:** every component and page. Use Tailwind classes like `bg-surface-muted`, `text-text-muted`, `text-accent`, `bg-provisional-bg`. Tailwind 4 auto-generates these from the `@theme` block in `app.css`.

---

## No Analog Found — Use UI-SPEC.md / RESEARCH.md

| File | Role | Why no analog | Source of truth |
|------|------|---------------|-----------------|
| `src/lib/components/PerAnglerMetric.svelte` | component | first Svelte component in repo | UI-SPEC §Component Contracts §1 (lines 326-363) |
| `src/lib/components/Chart.svelte` | component | first ECharts integration | UI-SPEC §Component Contracts §2 (lines 365-393) + RESEARCH §ECharts dynamic-import |
| `src/lib/components/FilterBar.svelte` | component | first interactive client component | UI-SPEC §Component Contracts §3 (lines 395-425) |
| `src/lib/components/BoatRow.svelte`, `BoatCard.svelte`, `PageHeader.svelte`, `EmptyState.svelte`, etc. | component | as above | UI-SPEC §Component Contracts §4-7 |
| `src/routes/+layout.svelte` | layout shell | no SvelteKit layout exists yet | UI-SPEC §Per-Route Layouts (lines 511-520, scaffold block) |
| `src/routes/about/+page.svelte` | static page | first static content page | UI-SPEC §Copywriting Contract §`/about` (lines 263-318, verbatim copy) |
| `src/routes/+page.svelte` (replace) | page | placeholder is a 12-line stub, no real prior pattern | UI-SPEC §Per-Route Layouts §`/` (lines 522-528) |
| `src/routes/<all>/+page.server.ts` | SSR loader | first SvelteKit `+page.server.ts` in repo (Phase 1 only had `+server.ts`) | RESEARCH §Pattern 1 (lines 383-405) — the SSR load + DAL + setHeaders pattern is documented there in full |

---

## Pattern Summary by Phase 2 Plan Sub-task (suggested groupings — planner discretion)

| Sub-task | Files | Primary Analog |
|----------|-------|----------------|
| 1. DAL `queries/*` + tests | `src/lib/db/queries/{browse,tripPicker,boatDetail,trends,compare}.ts` + `tests/unit/db/queries/*` | `catchReports.ts` + `catchReports.test.ts` + `scrapeRuns.ts` (windowed AVG) |
| 2. urlState + dates extension + tests | `src/lib/shared/urlState.ts` + `dates.ts` (extend) + tests | `scraper/schema.ts` (Zod) + `scrapeRuns.ts::addOneDay` (UTC arith) |
| 3. PerAnglerMetric + Chart + about + boundary-test scope expansion | `src/lib/components/{PerAnglerMetric,Chart,EmptyState,PageHeader,ProvisionalBadge,LastScrapedLabel}.svelte` + `routes/about/+page.svelte` + `app.css` + `dal-boundary.test.ts` SCOPE_DIRS extension | UI-SPEC.md §Component Contracts (no code analog) |
| 4. `/` + `/date/[d]` + layout | `routes/+page.{svelte,server.ts}` + `routes/+layout.svelte` + `routes/date/[date]/+page.{svelte,server.ts}` + `BoatRow.svelte` + `FilterBar.svelte` + tests | RESEARCH §Pattern 1 + UI-SPEC §Per-Route Layouts |
| 5. `/picker` + heatmap | `routes/picker/+page.{svelte,server.ts}` + `BoatCard.svelte` ("Why this boat?" expand) + tests | UI-SPEC §`/picker` + RESEARCH §heatmap n<5 itemStyle override |
| 6. `/boats/[id]` + `/compare` + `/trends` | the three route folders + tests | RESEARCH §Pattern 1 + per-route UI-SPEC sections |
| 7. dev seed + integration + VALIDATION | `scripts/seed-dev-db.ts` + `tests/helpers/seedTestDb.ts` + `tests/unit/scripts/seed-dev-db.test.ts` + Phase 2 VALIDATION sign-off | `scripts/backfill.ts` (verbatim skeleton) + `tests/unit/scripts/backfill.test.ts` |

---

## Metadata

**Analog search scope:** `src/lib/db/`, `src/lib/server/`, `src/lib/scraper/`, `src/lib/shared/`, `src/routes/`, `scripts/`, `tests/` (recursive).
**Files scanned:** 36 source files + 13 test files + 5 config files.
**Pattern extraction date:** 2026-04-24
**Phase 1 patterns referenced:** `01-PATTERNS.md` §SvelteKit-Alias Boundary (for script imports), §SLA pure split (for sla.ts decomposition pattern), §DAL boundary discipline (the canary test pattern).
