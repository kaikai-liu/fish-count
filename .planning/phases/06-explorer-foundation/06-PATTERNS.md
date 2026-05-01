# Phase 6: Explorer Foundation - Pattern Map

**Mapped:** 2026-04-30
**Files analyzed:** 16 (new + modified)
**Analogs found:** 14 / 16

This map tells the planner exactly which existing files each Phase 6 file should copy from. Where an analog is "exact" the new file is a structural twin (different content, same shape). Where it is "role-match" the new file shares responsibilities but differs in data flow.

## File Classification

### New files

| New file | Role | Data flow | Closest analog | Match quality |
|----------|------|-----------|----------------|---------------|
| `src/routes/explorer/+page.server.ts` | route loader | request-response (URL → SQL → option JSON) | `src/routes/trends/+page.server.ts` | exact |
| `src/routes/explorer/+page.svelte` | route page (Svelte 5 runes) | request-response (data → DOM) | `src/routes/trends/+page.svelte` | role-match (form pattern) + `src/routes/compare/+page.svelte` (multi-series consumer) |
| `src/lib/components/ExplorerHeader.svelte` | presentational wrapper (sticky 3-row top bar) | event-driven (UI events → goto) | `src/lib/components/FilterBar.svelte` | role-match (NOT a form — 3 distinct rows) |
| `src/lib/components/TickerPills.svelte` | segmented toggle (3-button tablist) | event-driven | none — new pattern (see "No Analog Found") | — |
| `src/lib/components/RangeStrip.svelte` | horizontal-scroll preset button strip | event-driven | none — new pattern (see "No Analog Found") | — |
| `src/lib/components/CustomDateInputs.svelte` | paired `<input type="date">` | event-driven | `src/routes/compare/+page.svelte` lines 64-80 (date input markup) | role-match (extracted into a component) |
| `src/lib/components/SpeciesBreakdownTable.svelte` | presentational table | request-response | `src/routes/compare/+page.svelte` lines 119-148 (article grid) | role-match |
| `src/lib/db/queries/explorer.ts` | DAL — explorer aggregations | CRUD (read-only aggregate) | `src/lib/db/queries/trends.ts` | exact |
| `src/lib/shared/slug.ts` | pure utility (slugify + uniqueSlug) | transform (string → string) | `src/lib/shared/dates.ts` (pure-function module) | role-match (different domain, same purity discipline) |

### Modified files

| Modified file | Role | Data flow | Closest analog | Match quality |
|---------------|------|-----------|----------------|---------------|
| `src/lib/db/boats.ts` | DAL — boats table | CRUD | self (existing patterns) | exact (extending current file) |
| `src/lib/db/landings.ts` | DAL — landings table | CRUD | self | exact |
| `src/lib/db/migrations.ts` | schema migration | schema/DDL | self (existing `runMigrations`) | exact |
| `src/lib/shared/urlState.ts` | URL parse/serialize boundary | transform (URL ↔ typed) | self (`TrendsFiltersSchema`) | exact |
| `src/lib/db/queries/trends.ts` | DAL — trend buckets | CRUD aggregate | self (existing `boatTrend`/`speciesTrend`) | exact (granularity union extended to `'daily'`) |
| `src/routes/+layout.svelte` | nav config | static config | self | exact (one-line `navItems` edit) |
| `src/lib/scraper/*` (one ingestion-path file, planner pinpoints exact module) | DAL caller — slug generation on insert | CRUD | `src/lib/db/boats.ts` `upsertBoatsAndLandings` (lines 137-174) | exact |

## Pattern Assignments

### `src/routes/explorer/+page.server.ts` — controller (loader, request-response)

**Analog:** `src/routes/trends/+page.server.ts` (full file). `src/routes/compare/+page.server.ts` provides the multi-series chart-option shape.

**Imports pattern** (`trends/+page.server.ts:12-21`):
```typescript
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db/client';
import { speciesTrend, boatTrend, type TrendBucket } from '$lib/db/queries/trends';
import { distinctTripTypes, distinctSpecies } from '$lib/db/queries/browse';
import { getById } from '$lib/db/boats';
import { latestSuccessOrEmpty } from '$lib/db/scrapeRuns';
import { today, toPtTimeLabel, addDays } from '$lib/shared/dates';
import { parseTrendsFilters, type TrendsFilters } from '$lib/shared/urlState';
import { FISH_PER_ANGLER_AXIS } from '$lib/copy/metrics';
import { eachWeekOfInterval, eachMonthOfInterval, format } from 'date-fns';
```
The Phase 6 loader copies this list verbatim, swaps in `parseExplorerFilters`/`type ExplorerFilters`, adds `eachDayOfInterval`, adds the new `landingTrend`/`boatExplorerSeries`/`speciesAcrossBoats` imports from `$lib/db/queries/explorer`, and adds new `boats.ts` helpers (`findBySlug`, `mostActiveBoatLast30Days`, `listBoatsByActivity`).

**URL-parse boundary pattern** (`trends/+page.server.ts:63-78`):
```typescript
const parseResult = parseTrendsFilters(url.searchParams);
if ('error' in parseResult) {
  return {
    filters: null,
    guidance: 'Pick a species and trip type to view its trend over time.',
    /* …other null fields… */
  };
}
const filters = parseResult as TrendsFilters;
```
For Phase 6, the explorer's "no params" path resolves defaults server-side (D-04 clean URL on first load) — the parse error branch is only hit when params are present but malformed. New code path: when `url.searchParams.size === 0`, skip `parseExplorerFilters` and synthesize a default `ExplorerFilters` via `mostActiveBoatLast30Days(db)` + `range='1y'`.

**Range-to-dates pattern** (`trends/+page.server.ts:27-35`):
```typescript
function rangeToDates(range: TrendsFilters['range']): { fromDate: string; toDate: string } {
  const toDate = today();
  let days = 365;
  if (range === '3mo') days = 90;
  else if (range === '6mo') days = 180;
  else if (range === '1y') days = 365;
  else if (range === 'all') days = 365 * 10; // T-02-31: bounded sentinel
  return { fromDate: addDays(toDate, -days), toDate };
}
```
Phase 6 extends to `1m → 30`, `2y → 730`, `5y → 1825`, `all → 365 * 15`, and adds a `custom` branch that takes `{fromDate, toDate}` from validated filters. Granularity decision (D-18) sits in a sibling helper `chooseGranularity(range, span)` returning `'daily' | 'weekly' | 'monthly'`.

**Loader-does-gap-fill pattern** (`trends/+page.server.ts:103-120`):
```typescript
const expectedKeys: string[] =
  granularity === 'weekly'
    ? eachWeekOfInterval({ start: fromDateObj, end: toDateObj }, { weekStartsOn: 1 })
        .map((d) => format(d, "RRRR-'W'II"))
    : eachMonthOfInterval({ start: fromDateObj, end: toDateObj }).map((d) =>
        format(d, 'yyyy-MM')
      );
const presentMap = new Map(buckets.map((b) => [b.bucket_key, b]));
const aligned = expectedKeys.map((k) => ({
  bucket_key: k,
  value: presentMap.get(k)?.value ?? null, // null = gap, NOT zero
  n_trips: presentMap.get(k)?.n_trips ?? 0
}));
```
Phase 6 adds the `daily` branch using `eachDayOfInterval` + `format(d, 'yyyy-MM-dd')`. Multi-series alignment (one chart, multiple series): wrap the `presentMap` step in a per-series loop — each series produces its own aligned array against the shared `expectedKeys`.

**Multi-series chartOption pattern** (`compare/+page.server.ts:89-112`):
```typescript
const chartOption = {
  tooltip: { trigger: 'axis' as const },
  legend: { data: rows.filter((r) => r !== null).map((r) => r!.boat_name), bottom: 0 },
  xAxis: { type: 'category' as const, data: expectedBuckets },
  yAxis: { type: 'value' as const, name: FISH_PER_ANGLER_AXIS },
  series: rows.filter((r) => r !== null).map((r) => {
    const presentMap = new Map(
      (trendsByBoat[r!.boat_id] ?? []).map((b) => [b.bucket_key, b.value])
    );
    return {
      name: r!.boat_name,
      type: 'line' as const,
      connectNulls: false, // gap-aware per D-27
      data: expectedBuckets.map((k) => presentMap.get(k) ?? null)
    };
  })
};
```
Phase 6 additions to this skeleton:
1. `tooltip.axisPointer: { type: 'cross' }` (D-22 axis-crosshair).
2. `tooltip.formatter: (params) => ...` rendering per-series rows with `n=NN` per bucket (D-16). Pass per-series + per-bucket `n` via a closure variable `nByBucketBySeries`.
3. `legend.selected: { [seriesName]: false }` for series 7+ (D-15 "+N more" rule). All series stay in `option.series`; UI flips them on via `dispatchAction({type:'legendToggleSelect', name})`.
4. Series `name` includes `· n=NN` for the legend label (D-16).
5. Trip-type / boat / species labels stay verbatim from DB (CLAUDE.md domain-language rule). No `.replace()`, no normalization.

**Cache-Control pattern** (`trends/+page.server.ts:54` + `+page.server.ts:24`):
```typescript
// trends (history-only):
setHeaders({ 'cache-control': 'public, max-age=300' });
// home (today-inclusive):
setHeaders({ 'cache-control': 'public, max-age=60' });
```
Phase 6 chooses dynamically (D-20):
```typescript
const includesToday = toDate >= today(); // string comparison; both YYYY-MM-DD PT
setHeaders({
  'cache-control': includesToday ? 'public, max-age=60' : 'public, max-age=300'
});
```

**Auto-widen pattern** (Phase 6 new — no analog beyond the no-data branch in `trends/+page.server.ts:128-141`):
After resolving default boat + 1Y range, run a single existence check via a new DAL helper `countCatchRowsForBoatInRange(db, boatId, fromDate, toDate): number`. If 0, swap range to `'all'`, recompute `fromDate`/`toDate`, and set `noteOverride = 'No 1Y data — showing full history.'` on the loader return. The page banner reads `data.noteOverride` and renders a small note above `<Chart>`.

**Logger pattern** (`trends/+page.server.ts:163-171` + `hooks.server.ts:18`):
```typescript
locals.logger?.info({
  msg: 'explorer_loaded',
  ticker: filters.ticker,
  /* slug | name */: filters.ticker === 'boat' ? filters.slug : filters.name,
  range: filters.range,
  granularity,
  bucketCount: expectedKeys.length
});
```

---

### `src/routes/explorer/+page.svelte` — component (request-response)

**Analog (form/state):** `src/routes/trends/+page.svelte`. **Analog (multi-series chart consumption + EmptyState):** `src/routes/compare/+page.svelte`.

**Imports pattern** (`trends/+page.svelte:1-9`):
```typescript
import type { PageData } from './$types';
import { goto } from '$app/navigation';
import PageHeader from '$lib/components/PageHeader.svelte';
import FilterBar from '$lib/components/FilterBar.svelte';
import Chart from '$lib/components/Chart.svelte';
import EmptyState from '$lib/components/EmptyState.svelte';
import { serializeTrendsFilters, type TrendsFilters } from '$lib/shared/urlState';
import { FISH_PER_ANGLER_ARIA } from '$lib/copy/metrics';
```
Phase 6 swaps `FilterBar` for the new `ExplorerHeader`, adds `SpeciesBreakdownTable`, swaps in `serializeExplorerFilters`/`type ExplorerFilters`. **Critical:** does NOT import `'echarts'` at the top — the option JSON is built in the loader; the dynamic-import discipline lives entirely inside `Chart.svelte` (Pitfall 2).

**Form-state seeding pattern** (`trends/+page.svelte:17-26`):
```typescript
let formSpecies = $state(data.filters?.species ?? '');
let formTripType = $state(data.filters?.tripType ?? '');
let formBoatId = $state(data.filters?.boatId?.toString() ?? '');
let formRange = $state<TrendsFilters['range']>(data.filters?.range ?? '1y');
let formGranularity = $state<TrendsFilters['granularity']>(data.filters?.granularity);
```
Phase 6 form state:
```typescript
let formTicker = $state<ExplorerFilters['ticker']>(data.filters.ticker);
let formSlug = $state(data.filters.ticker === 'boat' ? data.filters.slug : '');
let formName = $state(data.filters.ticker !== 'boat' ? data.filters.name : '');
let formRange = $state<ExplorerFilters['range']>(data.filters.range);
let formFromDate = $state(data.filters.fromDate ?? '');
let formToDate = $state(data.filters.toDate ?? '');
```

**URL-round-trip pattern** (`trends/+page.svelte:28-39` + `compare/+page.svelte:21-35`):
```typescript
function submit() {
  /* ... build typed filters ... */
  const sp = serializeTrendsFilters(filters);
  goto(`/trends?${sp.toString()}`, { keepFocus: true, replaceState: true, noScroll: true });
}
function reset() {
  goto('/trends', { noScroll: true });
}
```
Phase 6 keeps `keepFocus: true, replaceState: true, noScroll: true` exactly. The `reset()` target is `/explorer` (no params) which resolves D-04 clean URL.

**Chart consumer pattern** (`compare/+page.svelte:151-158`):
```svelte
<Chart
  option={data.chartOption}
  ariaLabel={`Weekly ${FISH_PER_ANGLER_ARIA} comparison for ${data.filters?.boatIds.length} boats on ${data.filters?.tripType} from ${data.filters?.fromDate} to ${data.filters?.toDate}`}
  height="320px"
/>
```
Phase 6 sets `height="280px"` on mobile and `360px` ≥768px (D-23). Implementation: pass a Tailwind class wrapper around `<Chart>` with responsive height, OR pass `height="280px"` and rely on `$effect` resize. Simpler: always pass `360px`, but constrain via parent `<section class="md:h-[360px] h-[280px]">` if Chart accepts pct heights — verify with the planner. (Existing `Chart.svelte:8` accepts a string CSS height; default `'320px'`.)

**EmptyState pattern** (`compare/+page.svelte:160-165` + `trends/+page.svelte:135-139`):
```svelte
<EmptyState
  heading="No data for this combination."
  body={`We have no records for ${data.filters.species} on ${data.filters.tripType}${data.boatName ? ' for ' + data.boatName : ''} in the selected range. ...`}
/>
```
Phase 6 uses `EmptyState` only when auto-widen also returns nothing (truly empty dataset for that ticker). Default-load auto-widen success → render the chart with the `noteOverride` banner; `EmptyState` is the all-else-fails branch.

**Per-angler discipline (CLAUDE.md non-negotiable #2):** Every appearance of `'fish/angler'` in this file (or any new component) must come via `FISH_PER_ANGLER_AXIS` / `FISH_PER_ANGLER_ARIA` / `FISH_PER_ANGLER_TOOLTIP_UNIT` from `src/lib/copy/metrics.ts:17-23`. The tooltip formatter built in the loader uses `FISH_PER_ANGLER_TOOLTIP_UNIT`.

---

### `src/lib/components/ExplorerHeader.svelte` — sticky top bar (event-driven)

**Analog:** `src/lib/components/FilterBar.svelte` for the snippet/slot wrapper convention. **Anti-analog:** FilterBar is a `<form role="search">` with one flex container — the explorer header has three semantically distinct rows. Build new, do NOT reshape FilterBar.

**Snippet-slot props pattern** (`FilterBar.svelte:14-23`):
```typescript
import type { Snippet } from 'svelte';
let {
  filters,
  actions
}: {
  filters: Snippet;
  actions?: Snippet;
} = $props();
```
ExplorerHeader takes 3 snippets: `tickerPills`, `selector`, `rangeStrip`. Each row renders into its own `<div>`.

**Sticky markup** (RESEARCH.md Pattern 4 lines 410-426):
```svelte
<header class="sticky top-0 z-20 bg-(--color-surface) border-b border-(--color-border)
               flex flex-col gap-2 px-4 py-3 md:py-4">
  <div role="tablist" class="flex w-full overflow-hidden rounded border border-(--color-border)">
    {@render tickerPills()}
  </div>
  <div class="w-full">{@render selector()}</div>
  <div class="flex gap-1 overflow-x-auto -mx-4 px-4 pb-1 md:overflow-visible md:-mx-0 md:px-0">
    {@render rangeStrip()}
  </div>
</header>
```
**z-index gotcha** (RESEARCH.md line 429): the existing layout `md:sticky md:top-0 md:z-10` would collide on desktop. RESEARCH.md prescribes option (b): keep ExplorerHeader inside `<main>` (not above the layout nav). On desktop both stick, but ExplorerHeader stacks below the nav since it lives later in DOM order — verify in implementation.

**Tailwind tokens** (consistent with `FilterBar.svelte:27`, `PageHeader.svelte:18`): `border-(--color-border)`, `bg-(--color-surface)`, `text-(--color-text-muted)`, min-h-11 on every interactive child (44px mobile target — `FilterBar.svelte:13` comment).

---

### `src/lib/components/TickerPills.svelte` — segmented toggle (event-driven)

**No exact analog.** Closest tonal reference: the `<a>` nav-link styling in `+layout.svelte:22-28` (active vs muted classes). Closest interactive shape: the action buttons in `FilterBar.svelte` (min-h-11 + accent background).

**Pattern to copy from `+layout.svelte:22-28`:**
```svelte
class={page.url.pathname === item.href || (item.href !== '/' && page.url.pathname.startsWith(item.href))
  ? 'text-(--color-accent) font-semibold'
  : 'text-(--color-text-muted) hover:underline'}
```
Apply the same active/muted styling logic to a 3-button row, where "active" = the current `formTicker` value.

**Props shape** (Svelte 5 runes, matching `Chart.svelte:5-10` style):
```typescript
let {
  value,
  onChange
}: {
  value: 'boat' | 'species' | 'landing';
  onChange: (next: 'boat' | 'species' | 'landing') => void;
} = $props();
```

**Markup sketch:**
```svelte
<button
  type="button"
  role="tab"
  aria-selected={value === 'boat'}
  class="flex-1 min-h-11 px-3 {value === 'boat' ? 'bg-(--color-accent) text-white font-semibold' : 'bg-(--color-surface) text-(--color-text-muted)'}"
  onclick={() => onChange('boat')}
>Boat</button>
```
Three of these in a row. The wrapping `role="tablist"` lives in `ExplorerHeader.svelte`.

---

### `src/lib/components/RangeStrip.svelte` — preset button strip (event-driven)

**No exact analog.** Closest reference: `trends/+page.svelte:91-99` `<select>` for range — Phase 6 replaces this with buttons.

**Props shape:**
```typescript
let {
  value,
  onChange
}: {
  value: ExplorerFilters['range'];
  onChange: (next: ExplorerFilters['range']) => void;
} = $props();
```

**Pattern (RESEARCH.md Pattern 4 lines 421-425):**
```svelte
<div class="flex gap-1 overflow-x-auto md:overflow-visible">
  {#each ['1m','3m','6m','1y','2y','5y','all','custom'] as r}
    <button
      type="button"
      class="min-h-11 px-3 whitespace-nowrap {value === r ? 'bg-(--color-accent) text-white font-semibold' : 'bg-(--color-surface) text-(--color-text-muted) border border-(--color-border)'}"
      onclick={() => onChange(r)}
    >{r === 'all' ? 'All' : r === 'custom' ? 'Custom' : r.toUpperCase()}</button>
  {/each}
</div>
```

---

### `src/lib/components/CustomDateInputs.svelte` — paired date inputs (event-driven)

**Analog:** `src/routes/compare/+page.svelte:64-80`.

**Markup excerpt** (compare lines 64-80):
```svelte
<label class="flex flex-col gap-1">
  <span class="text-sm font-semibold">From</span>
  <input
    type="date"
    class="min-h-11 rounded border border-(--color-border) px-2"
    bind:value={formFromDate}
  />
</label>
<label class="flex flex-col gap-1">
  <span class="text-sm font-semibold">To</span>
  <input
    type="date"
    class="min-h-11 rounded border border-(--color-border) px-2"
    bind:value={formToDate}
  />
</label>
```
Phase 6 wraps both into one component, adds `onblur` handler on the second input that fires `onSubmit({fromDate, toDate})` when both fields are filled (D-19 "submit on blur of the second field"). Adds clamp validation note ("Adjusted to available data window") shown inline when fromDate/toDate were clamped.

---

### `src/lib/components/SpeciesBreakdownTable.svelte` — presentational table

**Analog:** `src/routes/compare/+page.svelte:118-149` (per-boat article cards using `<dl>`).

**Excerpt** (compare lines 132-145):
```svelte
<dl class="mt-3 text-sm text-(--color-text-muted)">
  <div>
    <dt class="inline">Total trips:</dt>
    <dd class="inline tabular-nums">{r.total_trips}</dd>
  </div>
  <div>
    <dt class="inline">Top species:</dt>
    <dd class="inline">{r.top_species ?? '—'}</dd>
  </div>
</dl>
```
Phase 6 SpeciesBreakdownTable: single column on mobile, 2-column grid on `md:` (D-23). One row per species: species name + total catch + n_trips. Sort by total catch DESC. **Domain language:** species names rendered verbatim from DB — no normalization (CLAUDE.md rule).

---

### `src/lib/db/queries/explorer.ts` — DAL aggregations (CRUD, read-only)

**Analog:** `src/lib/db/queries/trends.ts` (full file). Same prepared-statement pattern, same gap-fill-is-loader's-job invariant.

**Module-header pattern** (`trends.ts:1-24`):
```typescript
// src/lib/db/queries/trends.ts — Weekly/monthly trend time-series queries.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
// ...
// Key contracts:
//   - Weekly bucket: strftime('%G-W%V', source_date) — ISO week + ISO year.
//   - Monthly bucket: strftime('%Y-%m', source_date)
//   - Weighted yield: SUM(species_count) * 1.0 / NULLIF(SUM(angler_count), 0)
//   - Gap-filling: this module returns ONLY buckets with rows. Gap-filling
//     is the ROUTE LOADER's responsibility — keeps the DAL pure.
import type Database from 'better-sqlite3';
```

**Bucket-expression pattern** (`trends.ts:44-48`):
```typescript
const bucketExpr =
  args.granularity === 'weekly'
    ? "strftime('%G-W%V', source_date)"
    : "strftime('%Y-%m', source_date)";
```
Phase 6 extends this branch with `'daily' → "strftime('%Y-%m-%d', source_date)"`. The granularity is a typed enum — never user-input — so the conditional substitution remains SQL-safe (T-02-01).

**Prepared-statement pattern with named params** (`trends.ts:50-68`):
```typescript
return db
  .prepare(
    `SELECT ${bucketExpr} AS bucket_key,
            SUM(species_count) * 1.0 / NULLIF(SUM(angler_count), 0) AS value,
            COUNT(DISTINCT source_date || '|' || trip_type)           AS n_trips
       FROM catch_reports
      WHERE species    = @species
        AND trip_type  = @tripType
        AND source_date BETWEEN @fromDate AND @toDate
      GROUP BY bucket_key
      ORDER BY bucket_key ASC`
  )
  .all({
    species: args.species,
    tripType: args.tripType,
    fromDate: args.fromDate,
    toDate: args.toDate
  }) as TrendBucket[];
```
Phase 6 functions follow the same shape:
- `boatExplorerSeries({boatId, fromDate, toDate, granularity})` — groups by `(bucket_key, trip_type)` for trip-type overlay; returns `Array<{bucket_key, trip_type, value, n_trips}>`.
- `speciesAcrossBoats({species, fromDate, toDate, granularity})` — two-pass (Pitfall 9): pass 1 returns top-6 boat_ids by total within window; pass 2 returns the bucketed series for those 6.
- `landingAcrossSpecies({landingId, fromDate, toDate, granularity})` — two-pass top-6 by species.
- `speciesBreakdownForBoat({boatId, fromDate, toDate})` — totals per species (no bucketing) for the breakdown table.
- `countCatchRowsForBoatInRange({boatId, fromDate, toDate})` — `SELECT 1 FROM catch_reports ... LIMIT 1` for the auto-widen check (D-03).
- `mostCaughtSpeciesByBoatInRange({boatId, fromDate, toDate})` — D-08 cross-axis default.
- `topBoatForSpeciesInRange({species, fromDate, toDate})` — D-08 cross-axis default.
- `mostRecentlyActiveLanding(db)` — D-08 cross-axis default.

**Two-prepared-statements rule (T-02-01)** (`trends.ts:99-141`): when a query has an optional filter, use two complete prepared statements rather than concatenating WHERE clauses. Phase 6 follows: `boatExplorerSeries` doesn't have optional filters, but `speciesAcrossBoats`'s "top-6" pass and "bucketed series" pass are two separate prepared statements with `IN (?,?,?,?,?,?)` for the 6 boat_ids.

**TypeScript interface pattern** (`trends.ts:26-30`):
```typescript
export interface TrendBucket {
  bucket_key: string;
  value: number | null;
  n_trips: number;
}
```
Phase 6 adds `ExplorerSeriesBucket` and `ExplorerBoatSeriesBucket` (boat_id + trip_type or species discriminator).

---

### `src/lib/shared/slug.ts` — pure utility (transform)

**Analog:** `src/lib/shared/dates.ts` (pure-function module, no SQL, no state).

**Module shape pattern** (`dates.ts:1-13`):
```typescript
// All dates are YYYY-MM-DD in America/Los_Angeles (CLAUDE.md Architecture Rules).
// This module is the SOLE producer of date strings in the entire project.
const TZ = 'America/Los_Angeles';

/** Today's date as YYYY-MM-DD in Pacific time. */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { /* ... */ }).format(new Date());
}
```

**Phase 6 slug.ts** (RESEARCH.md Pattern 5 lines 472-490):
```typescript
// src/lib/shared/slug.ts — Pure slugify + collision-resolution helpers.
// Used at boat ingestion (one place) to generate boats.slug values.
// D-13 (06-CONTEXT.md): slug is frozen-at-first-seen.

/** Lowercase, hyphenated, ASCII slug. Max 60 chars. Never empty. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'boat';
}

/** Returns first of {base, base-2, base-3, ...} not in `taken`. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
```

---

### `src/lib/db/boats.ts` (MODIFIED) — DAL

**Analog:** itself (`boats.ts` lines 21-50 and 137-174).

**Existing upsert pattern** (`boats.ts:21-41`):
```typescript
export function upsertByName(
  db: Database.Database,
  source_name: string,
  landing_id: number,
  display_name?: string,
  source_url?: string
): number {
  const display = display_name ?? source_name;
  const row = db
    .prepare(
      `INSERT INTO boats (source_name, display_name, landing_id, source_url)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(source_name) DO UPDATE SET
         display_name = excluded.display_name,
         landing_id   = excluded.landing_id,
         source_url   = COALESCE(excluded.source_url, boats.source_url)
       RETURNING id`
    )
    .get(source_name, display, landing_id, source_url ?? null) as { id: number };
  return row.id;
}
```
**Phase 6 modification (D-13 freeze-at-first-seen):** add a `slug` parameter; INSERT clause sets it; `ON CONFLICT` clause omits slug from the UPDATE list:
```sql
INSERT INTO boats (source_name, display_name, landing_id, source_url, slug)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(source_name) DO UPDATE SET
  display_name = excluded.display_name,
  landing_id   = excluded.landing_id,
  source_url   = COALESCE(excluded.source_url, boats.source_url)
  -- NOTE: slug NOT in UPDATE clause — frozen at first-seen (D-13)
RETURNING id
```
The `BoatRow` interface (line 7-13) gains `slug: string`. `getById` SELECT list adds `slug`. `getByIdWithLanding` SELECT list adds `b.slug`.

**Batch slug-tracking pattern** (`boats.ts:137-174` extended per RESEARCH.md Pitfall 10):
```typescript
const taken = new Set<string>(
  db.prepare(`SELECT slug FROM boats WHERE slug IS NOT NULL`).all().map((r:any) => r.slug)
);
for (const [name, meta] of boatsByName) {
  const existing = db.prepare(`SELECT slug FROM boats WHERE source_name = ?`).get(name) as { slug?: string } | undefined;
  let slug = existing?.slug;
  if (!slug) {
    slug = uniqueSlug(slugify(meta.displayName ?? name), taken);
    taken.add(slug);
  }
  upsertByName(db, name, landingId, meta.displayName, meta.url, slug);
}
```

**New helpers** to add:
- `findBySlug(db, slug): BoatRow | undefined` — single-row lookup mirror of `getById` (line 43-50).
- `listBoatsByActivity(db, days = 90): BoatRow[]` — JOIN catch_reports, GROUP BY boat, ORDER BY `COUNT(DISTINCT source_date)` DESC (D-09).
- `mostActiveBoatLast30Days(db): BoatRow | null` — D-01 default boat resolver, tie-break by `display_name ASC`.

All follow `getById`'s prepared-statement-with-positional-args style.

---

### `src/lib/db/landings.ts` (MODIFIED) — DAL

**Analog:** itself (lines 18-45).

**New helpers** to add following the existing `upsertByName`/`getById` shape:
- `getByName(db, name): LandingRow | undefined` — for landing-ticker lookup by URL-encoded name (D-14: landings use plain names, not slugs).
- `mostRecentlyActiveLanding(db): LandingRow | null` — D-08 cross-axis default; ORDER BY most-recent `source_date` across boats at the landing.

---

### `src/lib/db/migrations.ts` (MODIFIED) — schema

**Analog:** itself (`migrations.ts:120-123` `runMigrations`).

**Existing pattern** (`migrations.ts:120-123`):
```typescript
export function runMigrations(db: Database.Database): void {
  db.exec(`DROP TABLE IF EXISTS ${LEGACY_PHASE0_TABLE}`);
  db.exec(SCHEMA_SQL);
}
```
The current SCHEMA_SQL is built from `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` (lines 16-110). All DDL is idempotent. **Phase 6 cannot add a column to `CREATE TABLE IF NOT EXISTS`** because IF-NOT-EXISTS skips the body when the table already exists; the ALTER must happen out-of-band.

**Phase 6 pattern (RESEARCH.md Pattern 5 lines 444-466):**
```typescript
function hasSlugColumn(db: Database.Database): boolean {
  const cols = db.prepare(`PRAGMA table_info(boats)`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === 'slug');
}

export function runMigrations(db: Database.Database): void {
  db.exec(`DROP TABLE IF EXISTS ${LEGACY_PHASE0_TABLE}`);
  db.exec(SCHEMA_SQL);
  // Phase 6 additive migration:
  if (!hasSlugColumn(db)) {
    db.exec(`ALTER TABLE boats ADD COLUMN slug TEXT`);
    backfillSlugs(db); // helper imported from boats.ts or inlined
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_boats_slug ON boats(slug) WHERE slug IS NOT NULL`);
  }
  // Covering indexes (D-20):
  db.exec(`CREATE INDEX IF NOT EXISTS idx_catch_species_date ON catch_reports(species, source_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_catch_landing_date ON catch_reports(landing_id, source_date)`);
}
```
The existing `idx_catch_boat_date` (line 61-62) already exists, so D-20's `(boat_id, source_date)` requirement is satisfied — only species and landing-id indexes are net-new.

**Idempotency invariant:** `hasSlugColumn` guard + `IF NOT EXISTS` indexes mean re-running on a migrated DB is a no-op. Matches the rest of `runMigrations`.

---

### `src/lib/shared/urlState.ts` (MODIFIED) — URL boundary

**Analog:** itself, specifically `TrendsFiltersSchema` (lines 182-206).

**Existing pattern** (`urlState.ts:182-206`):
```typescript
export const TrendsFiltersSchema = z.object({
  species: z.string().min(1, 'species is required'),
  tripType: z.string().min(1, 'tripType is required'),
  boatId: z.coerce.number().int().positive().optional(),
  range: z.enum(['3mo', '6mo', '1y', 'all']).default('1y'),
  granularity: z.enum(['weekly', 'monthly']).optional()
});

export type TrendsFilters = z.infer<typeof TrendsFiltersSchema>;

export function parseTrendsFilters(sp: URLSearchParams): TrendsFilters | { error: ZodError } {
  const result = TrendsFiltersSchema.safeParse(Object.fromEntries(sp.entries()));
  if (!result.success) return { error: result.error };
  return result.data;
}

export function serializeTrendsFilters(filters: TrendsFilters): URLSearchParams {
  const sp = new URLSearchParams();
  /* ... sp.set('range', filters.range) etc ... */
  return sp;
}
```

**Phase 6 schema** (RESEARCH.md Pattern 1 lines 268-309):
```typescript
const RANGE_PRESETS = ['1m', '3m', '6m', '1y', '2y', '5y', 'all', 'custom'] as const;
const slugField = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'invalid slug').max(80);

const BoatTickerSchema = z.object({ ticker: z.literal('boat'), slug: slugField });
const SpeciesTickerSchema = z.object({ ticker: z.literal('species'), name: z.string().min(1).max(80) });
const LandingTickerSchema = z.object({ ticker: z.literal('landing'), name: z.string().min(1).max(120) });

const TickerVariant = z.discriminatedUnion('ticker', [
  BoatTickerSchema, SpeciesTickerSchema, LandingTickerSchema
]);

const RangeBase = z.object({
  range: z.enum(RANGE_PRESETS).default('1y'),
  fromDate: dateField.optional(),
  toDate: dateField.optional()
});

export const ExplorerFiltersSchema = z.intersection(TickerVariant, RangeBase)
  .superRefine((v, ctx) => {
    if (v.range === 'custom') {
      if (!v.fromDate || !v.toDate) {
        ctx.addIssue({ code: 'custom', message: 'fromDate and toDate required when range=custom' });
        return;
      }
      if (v.fromDate > v.toDate) {
        ctx.addIssue({ code: 'custom', message: 'fromDate must be <= toDate' });
      }
    }
  });

export type ExplorerFilters = z.infer<typeof ExplorerFiltersSchema>;
```
Use `dateField` already declared at line 30. `parseExplorerFilters` and `serializeExplorerFilters` mirror the trends pair exactly. Add `Object.fromEntries(sp.entries())` and `safeParse` per existing pattern.

---

### `src/routes/+layout.svelte` (MODIFIED) — nav config

**Analog:** itself.

**Existing pattern** (`+layout.svelte:6-12`):
```typescript
const navItems = [
  { href: '/', label: 'Home' },
  { href: '/picker', label: 'Picker' },
  { href: '/trends', label: 'Trends' },
  { href: '/compare', label: 'Compare' },
  { href: '/about', label: 'About' }
];
```

**Phase 6 modification (D-25):**
```typescript
const navItems = [
  { href: '/', label: 'Home' },
  { href: '/explorer', label: 'Explorer' },
  { href: '/picker', label: 'Picker' },
  { href: '/trends', label: 'Trends' },
  { href: '/compare', label: 'Compare' },
  { href: '/about', label: 'About' }
];
```
One line added at index 1. Active-link styling (`+layout.svelte:24-26`) automatically picks up `/explorer` via `page.url.pathname.startsWith(item.href)`.

---

### `src/lib/db/queries/trends.ts` (MODIFIED — granularity union)

**Analog:** itself.

**Existing branch** (`trends.ts:44-48`, repeated `93-97`):
```typescript
const bucketExpr =
  args.granularity === 'weekly'
    ? "strftime('%G-W%V', source_date)"
    : "strftime('%Y-%m', source_date)";
```

**Phase 6 modification** — extend to a 3-way branch:
```typescript
const bucketExpr =
  args.granularity === 'daily'
    ? "strftime('%Y-%m-%d', source_date)"
    : args.granularity === 'weekly'
      ? "strftime('%G-W%V', source_date)"
      : "strftime('%Y-%m', source_date)";
```
And update both `SpeciesTrendArgs.granularity` and `BoatTrendArgs.granularity` from `'weekly' | 'monthly'` to `'daily' | 'weekly' | 'monthly'` (lines 37 and 76).

**Backwards compatibility:** existing callers in `trends/+page.server.ts` and `compare/+page.server.ts` pass only `'weekly'` or `'monthly'` — neither needs to change.

---

## Shared Patterns

### DAL boundary (CLAUDE.md non-negotiable #3)

**Source:** every file in `src/lib/db/`. Lint test: `tests/unit/db/dal-boundary.test.ts` (referenced in RESEARCH.md Pitfall 6).

**Apply to:** every Phase 6 file that issues SQL — `explorer.ts`, `boats.ts`, `landings.ts`, `migrations.ts`. **Apply NOT to:** the loader `+page.server.ts`, the components, `slug.ts`, `urlState.ts`. The static-grep test forbids `db.prepare(` outside `src/lib/db/`.

```typescript
// ALL SQL is wrapped in db.prepare() inside src/lib/db/ — example pattern from boats.ts:43-50
export function getById(db: Database.Database, id: number): BoatRow | undefined {
  return db
    .prepare(`SELECT id, source_name, display_name, landing_id, source_url FROM boats WHERE id = ?`)
    .get(id) as BoatRow | undefined;
}
```

### Date-discipline (CLAUDE.md non-negotiable #4)

**Source:** `src/lib/shared/dates.ts` — sole producer of date strings.

**Apply to:** the loader, the auto-widen check, the cache-control predicate, the range-to-dates mapper. Use `today()`, `addDays()`, `daysBetween()`, `clampDate()`. **NEVER** call `new Date()`, `.toISOString().slice(0,10)`, `Intl.DateTimeFormat` outside `dates.ts`.

```typescript
// Source: src/lib/shared/dates.ts:6-13 + 36-43
import { today, addDays } from '$lib/shared/dates';
const toDate = today();
const fromDate = addDays(toDate, -365);
```

### Per-angler discipline (CLAUDE.md non-negotiable #2)

**Source:** `src/lib/copy/metrics.ts:17-23`.

**Apply to:** every Phase 6 file that mentions per-angler metrics — `+page.svelte`, `+page.server.ts` (chart axis name + tooltip formatter), `SpeciesBreakdownTable.svelte`. Lint test `tests/unit/lint/per-angler-discipline.test.ts` enforces.

```typescript
import { FISH_PER_ANGLER_AXIS, FISH_PER_ANGLER_ARIA, FISH_PER_ANGLER_TOOLTIP_UNIT } from '$lib/copy/metrics';
// yAxis: { type: 'value', name: FISH_PER_ANGLER_AXIS }   ✓
// tooltip row: `${value.toFixed(1)} ${FISH_PER_ANGLER_TOOLTIP_UNIT}`  ✓
// inline 'fish/angler' literal anywhere else  ✗ (lint fail)
```

### Domain-language verbatim (CLAUDE.md non-negotiable #1)

**Source:** the data itself — `catch_reports.trip_type`, `boats.display_name`, `landings.display_name`, `catch_reports.species`. CLAUDE.md lists the canonical spellings.

**Apply to:** every legend label, every dropdown option, every tooltip row, every table cell. **Never** call `.replace()`, `.toLowerCase()`, or any normalizing transform on a trip-type, landing, or species string before display. Phase 6 fully relies on the upstream Zod parse boundary (existing scraper) + DB storage to keep these verbatim.

### URL-as-state round-trip

**Source:** `src/routes/trends/+page.svelte:28-39` + `src/lib/shared/urlState.ts:192-206`.

**Apply to:** every UI control that changes a filter — ticker pills, selector, range strip, custom date inputs. The component fires `onChange`; the page's `submit()` builds an `ExplorerFilters` object, calls `serializeExplorerFilters`, then `goto(url, { keepFocus: true, replaceState: true, noScroll: true })`. SSR re-renders via the loader.

```typescript
goto(`/explorer?${sp.toString()}`, { keepFocus: true, replaceState: true, noScroll: true });
```

### Logger pattern

**Source:** `src/hooks.server.ts:18-19` + every loader's `locals.logger?.info({...})` calls (e.g. `trends/+page.server.ts:163-171`).

**Apply to:** the explorer loader, optionally the migration on first-run.

```typescript
locals.logger?.info({ msg: 'explorer_loaded', ticker, range, granularity, bucketCount });
```

### Cache-Control discipline

**Source:** `home/+page.server.ts:24` (`max-age=60`), `trends/+page.server.ts:54` (`max-age=300`), `compare/+page.server.ts:27` (`max-age=300`).

**Apply to:** explorer loader. Conditional per D-20 — `max-age=60` if `toDate >= today()`, else `max-age=300`.

### Loader-does-gap-fill / DAL-stays-pure

**Source:** `src/routes/trends/+page.server.ts:103-120` + DAL contract documented in `trends.ts:18-20`.

**Apply to:** every chart-producing path in the explorer loader. DAL functions return only buckets with rows; loader enumerates expected keys via `eachDayOfInterval` / `eachWeekOfInterval` / `eachMonthOfInterval` and aligns. `null` for missing values (never `0`) per D-17 + Pitfall 1.

## No Analog Found

| File | Role | Data flow | Reason |
|------|------|-----------|--------|
| `src/lib/components/TickerPills.svelte` | segmented toggle | event-driven | No tab/segmented-control component exists in the codebase. Closest is the nav-link active-styling pattern in `+layout.svelte:22-28`. Planner should use Tailwind tokens consistent with existing components. |
| `src/lib/components/RangeStrip.svelte` | preset button strip | event-driven | No horizontal-scroll button strip exists. The closest is the `<select>` range picker in `trends/+page.svelte:91-99`. Planner builds new from RESEARCH.md Pattern 4 sketch. |

Both files are small (each ≤50 lines, button-list shape). The lack of an analog is fine — RESEARCH.md Pattern 4 supplies the Tailwind sketch.

## Metadata

**Analog search scope:**
- `src/routes/` (all routes — focused on `/trends`, `/compare`, `/`, `+layout.svelte`)
- `src/lib/components/` (all 11 components)
- `src/lib/db/` (boats, landings, migrations, scrapeRuns, catchReports, queries/*)
- `src/lib/shared/` (dates, urlState)
- `src/lib/copy/metrics.ts`
- `src/hooks.server.ts`

**Files scanned:** 18 source files read in full (one was excerpted via Grep+offset reads).

**Pattern extraction date:** 2026-04-30
