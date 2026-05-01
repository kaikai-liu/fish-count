# Phase 6: Explorer Foundation - Research

**Researched:** 2026-04-30
**Domain:** SvelteKit explorer route — multi-axis ticker chart (boat / species / landing) with overlay series, range selector (1M..All + Custom), sticky mobile-first top bar; better-sqlite3 schema migration (boats.slug); Zod URL contract; ECharts 6 multi-series.
**Confidence:** HIGH (verified against the existing `/trends` and `/compare` route implementations, the v1 DAL, ECharts 6 docs via Context7, and current package.json versions)

## Summary

Phase 6 is mostly **disciplined extension** of patterns that already exist in this codebase, plus one new schema concern (`boats.slug`) and one new UI surface (sticky mobile top bar with three-row layout). Every decision in 06-CONTEXT.md (D-01..D-25) maps cleanly to an existing analog: `/trends` provides the loader-does-gap-fill pattern; `/compare` provides multi-series with `connectNulls: false`; `urlState.ts` provides the Zod-bounded URL contract; `dates.ts` provides date math primitives. The DAL boundary (only `src/lib/db/` issues SQL), enforced by static-grep test, is non-negotiable and constrains how the new explorer queries are wired.

The two real research questions: (1) **the slug migration must be additive and backfill deterministically** without changing the upsert path's `(date, boat_id, trip_type, species)` invariant, and (2) **ECharts 6 cross-axis tooltip + click-to-toggle legend + scrollable legend** is configured at the option level — no custom component needed, just a richer `option` object passed to the existing `Chart.svelte` wrapper.

**Primary recommendation:** Follow the `/trends` and `/compare` patterns verbatim for the explorer route shell. Add `boats.slug` as an additive migration with deterministic backfill; modify only the boat-ingestion DAL function to populate it on first-insert. Build a new `ExplorerHeader.svelte` (sticky, three-row mobile, two-row desktop) — `FilterBar.svelte` is a form wrapper, not a sticky header. Add a `landingTrend()` query alongside the existing `speciesTrend()` and `boatTrend()` in `trends.ts` (or new `explorer.ts` if the file gets too dense). Add three covering indexes (`(boat_id, source_date)` already exists; add `(species, source_date)` and `(landing_id, source_date)`). For the chart, reuse `Chart.svelte` as-is — ECharts 6's multi-series + `tooltip.trigger='axis'` + `axisPointer.type='cross'` + `connectNulls: false` is all option-level config.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**First-screen default view:**
- **D-01:** Default ticker on landing `/explorer` = boat. Specific boat = the boat with the most trip-days reported in the last 30 days (`COUNT(DISTINCT source_date)` over `catch_reports` joined to `boats`). Tie-break: alphabetical (`boats.display_name ASC`).
- **D-02:** Default time range = 1Y (365 days back from `today()` in PT).
- **D-03:** Auto-widen on empty default. If the default boat has no data in the default range, auto-widen until data shows (try 1Y → All). Render note: `"No 1Y data — showing full history."` Goal: never blank screen on first load.
- **D-04:** Clean URL on first load. `/explorer` with no params resolves defaults server-side. URL only gains query params when user changes a control.

**Ticker switcher + selector UX:**
- **D-05:** Ticker TYPE switcher = segmented pill toggle. Three pills: `[Boat] [Species] [Landing]`.
- **D-06:** Specific-item picker = plain native HTML `<select>` dropdown.
- **D-07:** Layout = sticky top bar (ticker pills + selector + range buttons stay sticky on scroll).
- **D-08:** Ticker TYPE switch behavior: range stays, selection resets to a sensible cross-axis default. (`boat → species` → species this boat catches most over the active range; `species → boat` → boat that catches species most; `* → landing` → landing with most-recent activity.)
- **D-09:** Boat dropdown order = activity-first (`COUNT(DISTINCT source_date)` over last 90 days, descending; alpha tie-break).
- **D-10:** Species dropdown order = alphabetical, verbatim SD names.
- **D-11:** Boat scope in dropdown = show all boats with any scrape data ever.
- **D-12:** URL identifier for boats = slug. `/explorer?ticker=boat&slug=pacific-voyager&range=1y`.
- **D-13:** Slug rename policy = frozen at first-seen.
- **D-14:** Slug scope = boats only. Species and landings use plain URL-encoded names.

**Chart + overlays + presentation:**
- **D-15:** One chart, primary axis is per-angler, overlays are series-on-the-same-chart.
  - Boat ticker → one series per trip type the boat ran in the window. Below chart: small species-breakdown table.
  - Species ticker → one series per boat that caught the species. Cap top-6, "+N more" collapse.
  - Landing ticker → one series per species caught at the landing. Cap top-6, "+N more" collapse.
  - All overlay series start visible. Legend uses ECharts native click-to-toggle.
- **D-16:** Sample-size `n` shows in three places: legend label (`name · n=NN`), tooltip (per-bucket `n` per series), chart caption (`Based on NNN trips across the [range]. [Granularity] buckets, PT.`). No n<5 refusal.
- **D-17:** Thin-data rendering = literal gaps. `connectNulls: false`.
- **D-18:** Time bucketing per range = auto-pick: 1M=daily, 3M/6M/1Y=weekly, 2Y/5Y/All=monthly. Custom: daily ≤45d, weekly ≤2y, monthly otherwise. No user-facing granularity toggle this phase.
- **D-19:** Custom date range UX. 8th button on range strip; reveals two `<input type="date">`. Validation: `fromDate <= toDate`, both within `[earliest_scrape, today()]`. URL: `range=custom&fromDate=...&toDate=...`.
- **D-20:** Performance at All = query-tuning + caching. Add covering indexes if missing. Cache-Control: `max-age=300` for views excluding `today()`; `max-age=60` for ranges that include today. Materialized table is a planner contingency only (trigger: >300ms server time at All).
- **D-21:** Series colors = ECharts categorical defaults, capped at 6 visible.
- **D-22:** Tooltip = axis-crosshair single tooltip showing all visible series. `tooltip.trigger='axis'`, `axisPointer.type='cross'`. Mobile: tap-to-pin (ECharts default).
- **D-23:** Mobile layout at 375px: sticky top bar 3 rows on mobile (ticker pills full-width / selector full-width / range strip horizontal-scroll); chart 280px on mobile, 360px ≥768px; caption below; species-breakdown table below caption (boat ticker only).
- **D-24:** Route name = `/explorer`. Final.
- **D-25:** Nav menu placement = second item, right after `Home`. During Phase 6: `Home / Explorer / Picker / Trends / Compare / About`.

### Claude's Discretion

(Embedded into the locked decisions above — D-15 through D-23 were Claude-decided in the discuss phase so the planner has a complete contract. Treat them as locked for Phase 6 planning.)

### Deferred Ideas (OUT OF SCOPE)

None from the discussion — all selected areas stayed within Phase 6.

**Planner contingencies (NOT default scope, NOT deferred):**
- **`boat_monthly_yields` materialized table** — only build if D-20 profiling shows >300ms server time at the All range. Planner should include trigger condition + migration shape; do not implement upfront.
- **User-facing granularity toggle (Daily / Weekly / Monthly)** — D-18 ships auto-only.
- **Combobox / type-ahead selector** — D-06 ships plain `<select>`.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXPL-01 | User lands on the explorer with a default boat ticker pre-selected | D-01 + D-03 auto-widen; loader resolves default boat server-side via `boats.id` joined to `catch_reports` aggregation |
| EXPL-02 | User can switch the ticker type between boat, species, and landing | D-05 segmented pills; new `ExplorerHeader.svelte`; URL `ticker=boat\|species\|landing` |
| EXPL-03 | User can pick any boat from a searchable/filterable list | D-06 native `<select>`, D-09 activity-first ordering, D-11 all-boats-ever scope |
| EXPL-04 | User can pick any species from a list (verbatim SD names) | D-10 alphabetical, verbatim — extends existing `distinctSpecies()` in `browse.ts` |
| EXPL-05 | User can pick any landing from a list (verbatim names) | extends existing `distinctLandings()` in `browse.ts` |
| EXPL-06 | Boat ticker → boat catch history with trip-type series overlaid | D-15 boat-ticker shape; new query path: per-trip-type aggregation for one boat in range |
| EXPL-07 | Species ticker → species catch history across boats (boats as overlays) | D-15 species-ticker shape; existing `speciesTrend()` extended to per-boat aggregation, top-6 cap |
| EXPL-08 | Landing ticker → landing fleet's catch history across species (species as overlays) | D-15 landing-ticker shape; new `landingTrend()` DAL function; top-6 species cap |
| EXPL-09 | Time range via selector — 1M / 3M / 6M / 1Y / 2Y / 5Y / All | D-18 auto-bucket; range mapper in loader; T-02-31 bounded sentinel for All |
| EXPL-10 | Per-angler numbers always show sample size n alongside | D-16 three-places-for-n contract |
| EXPL-11 | Trip-type label appears on every series in the chart legend | D-15 boat-ticker series naming; legend label per D-16 |
| EXPL-12 | Explorer is usable on mobile at 375px | D-23 sticky 3-row layout, 280px chart |
| EXPL-13 | Chart loads within reasonable time at All range | D-20 covering indexes + monthly bucketing keeps result-set small (~500 points max); cache-control |
| EXPL-14 | User can pick a custom date range | D-19 custom date-input UX; URL contract `range=custom&fromDate=...&toDate=...`; validation |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Default-boat resolution + auto-widen fallback | API / Backend (loader) | Database (DAL aggregate query) | Pure SQL aggregate; loader composes the "any-data?" check + range widening |
| URL state parse / serialize | API / Backend (loader on parse) + Browser (serialize on submit) | — | Untrusted-input boundary lives in the loader; client only emits canonical URLs via `goto()` |
| Slug migration + backfill | Database (idempotent DDL on boot) | Backend (ingestion path generates slug on first-insert) | Migration is one-shot DDL+UPDATE; ingestion path becomes the steady-state source |
| Time-bucketing aggregation | Database (DAL via `strftime`) | API / Backend (loader gap-fills) | DAL stays pure; loader composes calendar-complete axis using `date-fns` helpers |
| Multi-series chart rendering | Browser (ECharts dynamic-import) | API / Backend (loader produces aligned `option`) | SSR avoidance critical (D-15 references existing Chart.svelte 800kB-out-of-SSR rule) |
| Sticky mobile top bar | Browser (CSS sticky + Tailwind classes) | — | Pure presentation; no server contribution |
| Cache-Control discipline | API / Backend (loader `setHeaders`) | — | Browser respects `max-age` automatically |
| Cross-axis ticker switch defaults (D-08) | API / Backend (loader query) | — | "Most-caught species for this boat over active range" is a SQL aggregate; client just navigates to the new URL |

## Standard Stack

### Core (already installed — verified against package.json 2026-04-30)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@sveltejs/kit` | 2.57.1 | Full-stack framework | Already the project framework; explorer is one new route on it |
| `svelte` | 5.55.4 | UI runtime | Svelte 5 runes (`$props`, `$state`, `$effect`) used throughout existing components |
| `better-sqlite3` | 12.9.0 | SQLite driver | DAL convention; synchronous; transaction wrappers for migrations |
| `echarts` | 6.0.0 | Multi-series line chart | Already imported via `Chart.svelte` dynamic-import wrapper. ECharts 6.0 was the latest stable as of 2026-04-30 (`npm view echarts version` → 6.0.0) [VERIFIED: npm registry] |
| `zod` | 4.3.6 | URL parse boundary | All existing route filters use Zod safeParse → `{error}` discriminated return |
| `date-fns` | 4.1.0 | Bucket axis enumeration | `eachDayOfInterval`, `eachWeekOfInterval`, `eachMonthOfInterval` for the loader gap-fill |
| `tailwindcss` | 4.2.4 | Styling | All existing components use Tailwind v4; sticky header uses `sticky top-0 z-20 bg-(--color-surface)` |

[VERIFIED: package.json read 2026-04-30] No new top-level dependencies are needed for Phase 6.

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino` | 10.3.1 | Structured logging | `event.locals.logger?.info({ msg: 'explorer_loaded', ... })` per existing convention |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain `<select>` dropdowns | Combobox component (e.g., `bits-ui` Combobox, headless type-ahead) | D-06 explicitly rejects this for Phase 6 to keep scope down; revisit if 30+ boats becomes painful in practice. |
| Hand-rolled chart legend with custom collapse | ECharts native `legend.type='scroll'` | Native scroll preserves built-in accessibility + click-to-toggle. For "+N more" specifically, an option is to use `legend.type='scroll'` for the overflow case — but D-15 specifies a "+N more" pill. The cleanest implementation is **render only top-6 in `series` and use a Svelte-side custom overflow control above the chart that adds hidden series via `dispatchAction({type:'legendToggleSelect', name})`**. This keeps the option object small and the chart fast. |
| Separate `boat_slugs` table | Inline `boats.slug` column | Inline is simpler — slug is 1:1 with boat, never multi-valued, never needs separate audit table. |
| Materialized `boat_monthly_yields` | On-the-fly aggregation | D-20: only add the materialized table if profiling at `All` shows >300ms. Default scope is on-the-fly with covering indexes. |

**No installation needed.** All required libraries already present.

**Version verification (2026-04-30):**
- `npm view echarts version` → 6.0.0 [VERIFIED]
- `npm view date-fns version` → 4.1.0 [VERIFIED]
- `npm view zod version` → 4.4.1 (latest); installed 4.3.6 — minor drift, no API impact for our usage [VERIFIED]

## Architecture Patterns

### System Architecture Diagram

```
                         +----------------------------------+
                         |  Browser (mobile 375px+)         |
                         |                                  |
                         |  /explorer page                  |
                         |  +----------------------------+  |
                         |  | Sticky top bar (3 rows mob)|  |
                         |  |  Row 1: [Boat][Spc][Land]  |  |
                         |  |  Row 2: <select>           |  |
                         |  |  Row 3: 1M 3M 6M ... Custom|  |
                         |  +----------------------------+  |
                         |  | Chart.svelte (ECharts dyn) |  |
                         |  |  multi-series line, axis   |  |
                         |  |  crosshair tooltip, legend |  |
                         |  +----------------------------+  |
                         |  | Caption "Based on N trips"|   |
                         |  +----------------------------+  |
                         |  | Species breakdown (boat)   |  |
                         |  +----------------------------+  |
                         +-------------------|--------------+
                                             | URL change → goto()
                                             | (replaceState, noScroll, keepFocus)
                                             v
              +----------------------------------------------------+
              |  /explorer/+page.server.ts  (SvelteKit loader)     |
              |                                                    |
              |  1. parseExplorerFilters(url.searchParams)         |
              |     → ExplorerFilters | { error }                  |
              |  2. Resolve defaults (D-01: most-active boat)      |
              |  3. Map range → {fromDate, toDate, granularity}    |
              |  4. Auto-widen if empty (D-03)                     |
              |  5. Cross-axis default if ticker switched (D-08)   |
              |  6. Branch on ticker type:                         |
              |     boat   → boatExplorerSeries() (DAL)            |
              |     species→ speciesAcrossBoats() (DAL)            |
              |     landing→ landingAcrossSpecies() (DAL)          |
              |  7. Gap-fill aligned axis via date-fns             |
              |  8. Build EChartsOption (server-built, plain JSON) |
              |  9. setHeaders Cache-Control                        |
              |     max-age=60 if range includes today, else 300   |
              +-----------------------|----------------------------+
                                      |
                                      v
              +----------------------------------------------------+
              |  src/lib/db/queries/  (DAL — only SQL writer)      |
              |                                                    |
              |  trends.ts (extended) or new explorer.ts:          |
              |   - boatExplorerSeries(boatId, range, granul.)     |
              |     → series-by-trip-type per bucket               |
              |   - speciesAcrossBoats(species, range, granul.)    |
              |     → series-by-boat per bucket (top-6 by total)   |
              |   - landingAcrossSpecies(landingId, range, gran.)  |
              |     → series-by-species per bucket (top-6)         |
              |   - speciesBreakdownForBoat(boatId, range)         |
              |     → totals per species for the table             |
              |                                                    |
              |  boats.ts (extended):                              |
              |   - findBySlug(slug) → BoatRow | undef             |
              |   - listBoatsByActivity(days=90) → ordered list    |
              |   - mostActiveBoatLast30Days() → BoatRow           |
              |   - upsertByName modified: generate slug on        |
              |     INSERT only (frozen-at-first-seen, D-13)       |
              |                                                    |
              |  landings.ts (extended):                           |
              |   - getByName(name) → LandingRow                   |
              |   - mostRecentlyActiveLanding() → LandingRow       |
              |                                                    |
              |  migrations.ts (extended):                         |
              |   - ALTER TABLE boats ADD COLUMN slug TEXT         |
              |   - one-shot backfill UPDATE from display_name     |
              |     with collision suffixes                        |
              |   - CREATE UNIQUE INDEX idx_boats_slug             |
              |   - CREATE INDEX idx_catch_species_date            |
              |   - CREATE INDEX idx_catch_landing_date            |
              +-----------------------|----------------------------+
                                      |
                                      v
                              +-------+--------+
                              |  SQLite (WAL)  |
                              |  catch_reports |
                              |  boats(.slug)  |
                              |  landings      |
                              |  scrape_runs   |
                              +----------------+
```

### Recommended Project Structure

```
src/
├── routes/
│   ├── explorer/
│   │   ├── +page.server.ts        # NEW — load + Zod parse + DAL composition
│   │   └── +page.svelte           # NEW — wraps ExplorerHeader + Chart + caption + breakdown
│   └── +layout.svelte             # MODIFIED — add { href: '/explorer', label: 'Explorer' } as 2nd nav item
├── lib/
│   ├── components/
│   │   ├── ExplorerHeader.svelte  # NEW — sticky 3-row mobile / 2-row desktop top bar
│   │   ├── TickerPills.svelte     # NEW — segmented [Boat][Species][Landing] toggle
│   │   ├── RangeStrip.svelte      # NEW — 1M..All + Custom horizontal-scroll buttons
│   │   ├── CustomDateInputs.svelte # NEW — pair of <input type="date"> with clamp note
│   │   └── SpeciesBreakdownTable.svelte # NEW — single-col mobile / 2-col desktop
│   ├── db/
│   │   ├── boats.ts               # MODIFIED — slug-aware insert; findBySlug; listBoatsByActivity
│   │   ├── landings.ts            # MODIFIED — getByName; mostRecentlyActiveLanding
│   │   ├── migrations.ts          # MODIFIED — slug ADD COLUMN + backfill + indexes
│   │   └── queries/
│   │       ├── trends.ts          # MODIFIED — keep existing; add explorer-shaped queries
│   │       └── explorer.ts        # NEW (alternative) — house explorer-specific queries
│   └── shared/
│       ├── urlState.ts            # MODIFIED — add ExplorerFiltersSchema + parse/serialize
│       ├── slug.ts                # NEW — pure slugify(name, existingSlugs) helper
│       └── range.ts               # NEW (optional) — preset → {fromDate, toDate, granularity, includesToday} mapper (currently lives in /trends loader)
```

### Pattern 1: Zod-bounded URL parse with discriminated union

**What:** A discriminated union by `ticker` field ensures `slug` is required when `ticker='boat'` and `name` is required for species/landing. Custom-range validation goes through Zod's `superRefine`.

**When to use:** Every untrusted input boundary — the explorer URL parse.

**Example** (modeled on existing `parseTrendsFilters` in `urlState.ts`):

```typescript
// Source: extends pattern from src/lib/shared/urlState.ts (existing)
import { z, ZodError } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const dateField = z.string().regex(dateRegex, 'Must be YYYY-MM-DD');

const RANGE_PRESETS = ['1m', '3m', '6m', '1y', '2y', '5y', 'all', 'custom'] as const;

// Slug allowlist: lowercase letters, digits, hyphens. Length 1..80 keeps URL bounded.
const slugField = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'invalid slug').max(80);

const BoatTickerSchema = z.object({
  ticker: z.literal('boat'),
  slug: slugField
});
const SpeciesTickerSchema = z.object({
  ticker: z.literal('species'),
  name: z.string().min(1).max(80)
});
const LandingTickerSchema = z.object({
  ticker: z.literal('landing'),
  name: z.string().min(1).max(120)
});

const TickerVariant = z.discriminatedUnion('ticker', [
  BoatTickerSchema,
  SpeciesTickerSchema,
  LandingTickerSchema
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

[VERIFIED: existing urlState.ts patterns, this codebase] [CITED: zod docs — discriminatedUnion + superRefine]

### Pattern 2: Loader-does-gap-fill (existing)

**What:** DAL returns only buckets with rows. Loader enumerates expected keys via `date-fns/eachDayOfInterval`, `eachWeekOfInterval` (with `weekStartsOn: 1` to match SQLite's ISO week), or `eachMonthOfInterval`, then aligns DAL output against expected keys with `null` for missing values.

**When to use:** Every chart axis. Already used by `/trends` and `/compare`.

**Example** (from `src/routes/trends/+page.server.ts:103-120`):

```typescript
const expectedKeys: string[] =
  granularity === 'weekly'
    ? eachWeekOfInterval({ start: fromDateObj, end: toDateObj }, { weekStartsOn: 1 })
        .map((d) => format(d, "RRRR-'W'II"))
    : granularity === 'monthly'
      ? eachMonthOfInterval({ start: fromDateObj, end: toDateObj }).map((d) => format(d, 'yyyy-MM'))
      : eachDayOfInterval({ start: fromDateObj, end: toDateObj }).map((d) => format(d, 'yyyy-MM-dd'));

const presentMap = new Map(buckets.map((b) => [b.bucket_key, b]));
const aligned = expectedKeys.map((k) => ({
  bucket_key: k,
  value: presentMap.get(k)?.value ?? null,    // null = gap, NOT zero (D-17)
  n_trips: presentMap.get(k)?.n_trips ?? 0
}));
```

**Daily-bucketing addition for Phase 6:** SQLite `strftime('%Y-%m-%d', source_date)` matches `format(d, 'yyyy-MM-dd')` exactly (no DST/TZ subtlety because `source_date` is already a `YYYY-MM-DD` string in PT — see `dates.ts` discipline). [VERIFIED: this codebase's dates.ts comment block]

### Pattern 3: Multi-series ECharts option with axis-crosshair tooltip + click-to-toggle legend

**What:** `tooltip.trigger: 'axis'`, `axisPointer.type: 'cross'`, plus a `tooltip.formatter` function that renders per-series rows with the per-bucket `n`. Legend is native ECharts (click-to-toggle is automatic).

**When to use:** Every multi-series explorer chart. Reuses existing `Chart.svelte`.

**Example** ([CITED: Apache ECharts docs via Context7 /apache/echarts-doc — "Configure Tooltip with Custom Formatting and Positioning"]):

```typescript
const chartOption = {
  color: undefined, // omit → ECharts uses its categorical-default palette (D-21)
  tooltip: {
    trigger: 'axis' as const,
    axisPointer: { type: 'cross' as const },
    formatter: (params: any[]) => {
      // params is array of one entry per visible series at the hovered axis index
      const header = `<strong>${params[0].axisValue}</strong>`;
      const rows = params
        .map((p) => {
          const n = nByBucketBySeries[p.seriesName]?.[p.dataIndex] ?? 0;
          const v = p.value == null ? '—' : `${p.value.toFixed(1)} fish/angler`;
          return `${p.marker} ${p.seriesName}: ${v} (n=${n})`;
        })
        .join('<br/>');
      return `${header}<br/>${rows}`;
    }
  },
  legend: {
    type: 'scroll' as const, // safe default — gracefully handles narrow viewport
    bottom: 0
  },
  xAxis: { type: 'category' as const, data: expectedKeys },
  yAxis: { type: 'value' as const, name: FISH_PER_ANGLER_AXIS },
  series: visibleSeries.map((s) => ({
    name: `${s.label} · n=${s.totalN}`, // D-16 legend label
    type: 'line' as const,
    connectNulls: false, // D-17 literal gaps
    data: expectedKeys.map((k) => s.byBucket.get(k) ?? null)
  }))
};
```

**Mobile tap-to-pin** is built into ECharts — `triggerOn: 'mousemove|click'` is the default for axis tooltip. Tap on chart pins; tap elsewhere dismisses. [CITED: ECharts 6 tooltip.triggerOn docs]

**"+N more" series 7+ collapse (D-15, D-21):** Render only the top-6 series in `option.series`. For series 7+, render a Svelte-side pill below the chart titled `"+N more"`. When the user taps it, expand the pill into a list of hidden-series toggles; tapping a name calls `chartInstance.setOption({ series: [...all series] }, true)` OR (preferred) keeps all series in `option.series` from the start, marks 7+ as `legend.selected[name] = false`, and uses `dispatchAction({ type: 'legendToggleSelect', name })` to flip them on. [CITED: Context7 /apache/echarts-doc — `dispatchAction` + `legendToggleSelect`]

> **Recommendation:** Keep all N series in `option.series`. Use `legend.selected: { [seriesName]: false }` for series 7+. Render the legend with a custom Svelte component (so we can show "+N more" instead of overflow) and use `dispatchAction` to toggle on tap. This avoids re-issuing `setOption(option, true)` on toggle (cheaper, no animation flash).

### Pattern 4: Sticky 3-row mobile top bar (Tailwind v4)

**What:** A Svelte component that's `sticky top-0 z-20 bg-(--color-surface) border-b border-(--color-border)`, with three flex rows on mobile that collapse to two rows on `md:` breakpoint.

**Why a new component, not FilterBar:** `FilterBar.svelte` is a `<form role="search">` wrapper with a single flex container. The explorer needs three semantically distinct rows with different responsive behavior. Forcing this into FilterBar would balloon its props surface and confuse callers. Build `ExplorerHeader.svelte` as a new component; leave FilterBar untouched.

**Layout sketch** (mobile, `<375px-ish>`):
```
┌──────────────────────────────────────┐
│ [Boat] [Species] [Landing]    row 1  │   ← w-full segmented pills
├──────────────────────────────────────┤
│ <select>           ▾          row 2  │   ← w-full
├──────────────────────────────────────┤
│ 1M 3M 6M 1Y 2Y 5Y All Custom  row 3  │   ← horizontal-scroll, no wrap
└──────────────────────────────────────┘
```

**Tailwind classes** (sketch):
```html
<header class="sticky top-0 z-20 bg-(--color-surface) border-b border-(--color-border)
               flex flex-col gap-2 px-4 py-3 md:py-4">
  <!-- Row 1: ticker pills -->
  <div role="tablist" class="flex w-full overflow-hidden rounded border border-(--color-border)">
    <button role="tab" class="flex-1 min-h-11 ...">Boat</button>
    <button role="tab" class="flex-1 min-h-11 ...">Species</button>
    <button role="tab" class="flex-1 min-h-11 ...">Landing</button>
  </div>
  <!-- Row 2: native select -->
  <select class="w-full min-h-11 rounded border border-(--color-border) px-2">...</select>
  <!-- Row 3: range strip (horizontal-scroll on mobile) -->
  <div class="flex gap-1 overflow-x-auto -mx-4 px-4 pb-1 md:overflow-visible md:-mx-0 md:px-0">
    <button class="min-h-11 px-3 whitespace-nowrap ...">1M</button>
    ...
    <button class="min-h-11 px-3 whitespace-nowrap ...">Custom</button>
  </div>
</header>
```

**z-index gotcha:** existing `+layout.svelte` uses `md:sticky md:top-0 md:z-10` for the nav (only sticky on `md:`). On mobile the nav is NOT sticky — so the explorer header at `top-0 z-20` works on mobile without overlap. On desktop both are sticky. **The explorer header MUST sit BELOW the nav.** Solutions: (a) use `md:top-[56px]` (or whatever the nav height resolves to) to offset the explorer header below the nav on desktop; or (b) make the explorer header live INSIDE `<main>` so the nav layout is unaffected and the explorer header just stacks vertically with the rest of the page. Option (b) is simpler and matches existing route patterns. [VERIFIED: layout.svelte read 2026-04-30]

**Reduced-motion + reduced-transparency:** No animations needed. Sticky behavior is CSS, not JS. No transitions on row collapse — the responsive breakpoint is a hard switch.

### Pattern 5: Slug column migration (additive, idempotent, deterministic backfill)

**What:** A single migration step that (1) `ALTER TABLE boats ADD COLUMN slug TEXT` if missing, (2) backfills `slug` for all rows where `slug IS NULL` deterministically from `display_name`, (3) creates a `UNIQUE INDEX idx_boats_slug ON boats(slug) WHERE slug IS NOT NULL` (partial index keeps it safe even if a future row temporarily lacks slug — though we expect all rows to have slug after backfill).

**Why a partial unique index:** If we later allow NULL slugs (e.g., during a brief migration window), a non-partial UNIQUE on a NULL-allowing column is OK in SQLite (NULL values are not considered equal), but a partial WHERE-clause makes the intent explicit. Either works.

**Why backfill in code, not in pure SQL:** Collisions need numeric suffixes (`pacific-voyager`, `pacific-voyager-2`, ...). Pure SQL recursion is awkward; better to read all `(id, display_name)` tuples in code, slugify, dedupe with suffixes, and `UPDATE boats SET slug = ? WHERE id = ?` per row inside one transaction.

**Migration file extension** (the project uses a single SCHEMA_SQL string in `migrations.ts`, not numbered files):

```typescript
// migrations.ts (extended)
const ADD_SLUG_COLUMN = `
  ALTER TABLE boats ADD COLUMN slug TEXT;
`;
// run only when boats has no 'slug' column
function hasSlugColumn(db: Database.Database): boolean {
  const cols = db.prepare(`PRAGMA table_info(boats)`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === 'slug');
}

export function runMigrations(db: Database.Database): void {
  db.exec(`DROP TABLE IF EXISTS smoke_test`); // existing legacy step
  db.exec(SCHEMA_SQL);                         // existing canonical schema
  // Phase 6 additive migration:
  if (!hasSlugColumn(db)) {
    db.exec(ADD_SLUG_COLUMN);
    backfillSlugs(db);                        // imported from a new helper
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_boats_slug ON boats(slug) WHERE slug IS NOT NULL`);
  }
  // Phase 6 covering indexes:
  db.exec(`CREATE INDEX IF NOT EXISTS idx_catch_species_date ON catch_reports(species, source_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_catch_landing_date ON catch_reports(landing_id, source_date)`);
}
```

**Slug generator** (pure helper in `src/lib/shared/slug.ts`):

```typescript
// slug(displayName) — lowercase, hyphenated, ASCII only, max 60 chars before suffix
export function slugify(name: string): string {
  return name
    .normalize('NFKD')                  // strip accents
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'boat';            // never empty
}

// Resolves collisions deterministically: returns the first {base, base-2, base-3, ...} not in `taken`.
export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
```

**Ingestion path change (one line) — D-13 freeze-at-first-seen:** in `boats.ts::upsertByName`, change the SQL so `slug` is set on INSERT only and ignored on UPDATE:

```sql
INSERT INTO boats (source_name, display_name, landing_id, source_url, slug)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(source_name) DO UPDATE SET
  display_name = excluded.display_name,
  landing_id   = excluded.landing_id,
  source_url   = COALESCE(excluded.source_url, boats.source_url)
  -- NOTE: slug NOT in the UPDATE clause — frozen at first-seen (D-13)
RETURNING id
```

The caller (`upsertBoatsAndLandings`) computes the slug before calling `upsertByName` for new boats. For existing boats the upsert will write the new slug into the INSERT clause but the ON CONFLICT branch ignores it — so passing a freshly-computed slug for an existing boat is harmless (the UPDATE branch never touches slug).

**Subtle correctness:** the slug we generate at ingestion time MUST consult the `taken` set including (a) all existing slugs in the DB AND (b) any slugs we've already assigned to other new-boats earlier in the same batch. Implementation: in `upsertBoatsAndLandings`, fetch all existing slugs once, then iterate boats accumulating into the `taken` set as we go.

### Anti-Patterns to Avoid

- **Don't compute slugs in SQL.** Recursive collision-suffix logic in pure SQLite is fragile. Do it in code.
- **Don't rebuild `option` from scratch on every filter change.** ECharts `setOption(opt, true)` works fine and is what `Chart.svelte`'s `$effect` already does. Don't add a separate "merge" code path. (Existing `Chart.svelte:55-61` handles this.)
- **Don't issue SQL outside `src/lib/db/`.** The static-grep DAL boundary test (`tests/unit/db/dal-boundary.test.ts`) will fail loudly. Every new query gets a DAL function.
- **Don't hand-roll a sticky header with `position:fixed`.** `position:sticky` is fine on every browser the audience runs (the project already uses it on the nav). Fixed positioning breaks scroll-into-view and confuses screen readers.
- **Don't trust `searchParams` on the client.** `goto()` can be called by anyone, including via a bookmarklet. Always re-parse with Zod on the server.
- **Don't use `today()` inside DAL functions.** All time math goes through the loader. DAL takes `fromDate` and `toDate` strings (existing pattern).
- **Don't put `<input type="date">` in the URL on submit if the user hasn't clicked a real range button.** D-19's "submit on blur of the second field" rule means we wait until both inputs are filled.
- **Don't normalize trip-type strings.** "1/2 Day AM" stays verbatim. CLAUDE.md domain language rule is enforced everywhere — including in series legend labels.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Calendar-bucket axis enumeration | Custom date loop with month/leap-year handling | `date-fns/eachDayOfInterval`, `eachWeekOfInterval`, `eachMonthOfInterval` | Already used by `/trends` and `/compare`; battle-tested. |
| ISO-week formatting (matching SQLite `%G-W%V`) | String concatenation | `date-fns/format(d, "RRRR-'W'II")` | Year-boundary bug at 2024-12-30 → "2025-W01" already verified by `/trends`. |
| URL parse / serialize | `URLSearchParams` + manual validation | Zod `safeParse` returning discriminated `{error}` | Existing pattern in `urlState.ts`; one source of truth for the boundary. |
| Slug uniqueness | Random suffixes / UUID fragments | Deterministic numeric suffix (`name-2`, `name-3`) | D-13 wants stable, recoverable, frozen-at-first-seen URLs. |
| Multi-series chart legend with toggle | Hand-rolled DOM with click handlers | ECharts native legend + `dispatchAction({type:'legendToggleSelect', name})` for "+N more" | Built-in accessibility (ARIA labels, keyboard), proven in `/compare`. |
| Tooltip with crosshair across all series | Custom hover logic | `tooltip.trigger='axis'` + `axisPointer.type='cross'` | Single config flag; native to ECharts since v3. |
| Sticky element | JS scroll listener that toggles `position:fixed` | CSS `position: sticky; top: 0; z-index: N` | Native, smooth, accessibility-friendly, already used in nav. |
| "Last scraped" subtitle | Custom datetime formatter | Existing `latestSuccessOrEmpty()` + `toPtTimeLabel()` + `LastScrapedLabel.svelte` | Whole pipeline already wired in `/trends`, `/compare`, home. |
| EmptyState rendering | Inline error markup per page | Existing `EmptyState.svelte` | Consistent visual treatment across the site. |

**Key insight:** Phase 6 has zero "first time" technical problems. Every challenge has an existing pattern in this codebase — Phase 6's job is to compose them into one new route.

## Runtime State Inventory

> **NOT APPLICABLE.** Phase 6 introduces a new route, a new column, and new DAL functions. It does NOT rename or refactor any existing identifier, table, file, or service config. The slug column is purely additive — no existing code path consumes `boats.slug` until Phase 6 itself reads it.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — adding a new column. Existing rows backfilled deterministically; no data deleted, renamed, or re-keyed. | Add migration (Pattern 5 above). |
| Live service config | None. No external services touched (no scraper change, no scheduler change, no email config). | None. |
| OS-registered state | None. No systemd/cron/Task Scheduler entries reference the new route. | None. |
| Secrets/env vars | None. Phase 6 adds no env var. | None. |
| Build artifacts | None. SvelteKit's `.svelte-kit/` is regenerated on dev/build automatically; no stale binaries. | None. |

**Verified by:** reading STATE.md "Carry-forward structural decisions" + 06-CONTEXT.md decisions list + searching for any rename/refactor cue. Phase 6 is greenfield-on-existing-foundation.

## Common Pitfalls

### Pitfall 1: Default-boat resolution returns a boat with zero rows in the default range

**What goes wrong:** D-01 picks "boat with most trip-days in last 30 days." But if the user lands during deep off-season (December for example), the most-active boat over the last 30 days might have only one trip in the entire 1Y default range. The chart looks empty even though the default selection is "valid."

**Why it happens:** "Most-active" is a popularity proxy, not a "has data in default range" check. The two queries are different.

**How to avoid:** D-03 mandates auto-widen. The loader MUST run a "any-data-in-1Y?" check after default resolution and widen to All if zero data. Implementation: a single `SELECT 1 FROM catch_reports WHERE boat_id = ? AND source_date BETWEEN ? AND ? LIMIT 1`. If null, swap the range to `all` and set a `noteOverride: "No 1Y data — showing full history."` field on the loader return. The page banner reads this field.

**Warning signs:** First-load returns an empty chart. Auto-widen note never appears in any test snapshot. Default-boat unit test doesn't include an off-season fixture.

### Pitfall 2: SSR includes ECharts and bundle balloons

**What goes wrong:** A new page that imports ECharts at the top forces it into the SSR bundle (~800kB). First-load metrics regress.

**Why it happens:** Forgetting that `Chart.svelte`'s discipline is "dynamic import inside `onMount`." A naïve copy-paste of the trends page might `import echarts from 'echarts'` at the top of `+page.svelte`.

**How to avoid:** Reuse `Chart.svelte` verbatim. The `option` object built in `+page.server.ts` is plain JSON — no ECharts types are imported there (only the `EChartsOption` type from `'echarts'` is imported by `Chart.svelte`'s `<script>`, and types are erased at compile time). Don't reach for `echarts/core` outside `Chart.svelte`. [VERIFIED: existing Chart.svelte:20-35 dynamic-import pattern]

**Warning signs:** Bundle analyzer shows `echarts/charts` in the SSR chunk. `+page.svelte` has a top-level `import 'echarts'`. Initial HTML payload >100kB.

### Pitfall 3: Hydration timing — chart renders empty on first paint

**What goes wrong:** The user sees "Loading chart…" for a moment after hydration even though all the data is in `data.chartOption`. ECharts module download takes time.

**Why it happens:** Chart.svelte's `onMount` callback awaits the dynamic import; until that resolves, `mounted` is false and the placeholder shows. This is correct — server-rendered HTML can't render ECharts. But it should be perceptible only as a brief spinner.

**How to avoid:** This is acceptable and matches the existing `/trends` behavior. The "Loading chart…" placeholder lives inside the chart's bounding box (heights match), so there's no layout shift. Don't try to "fix" it — fixing means SSR-ing the chart, which loses the bundle-size benefit.

**Warning signs:** Layout shift on chart mount (CLS regression). Placeholder height doesn't match chart height.

### Pitfall 4: Domain language drift in legend labels

**What goes wrong:** A series legend label normalizes "1/2 Day AM" → "Half Day AM" or "1/2 Day Morning." Anglers immediately notice; trust drops.

**Why it happens:** Developer convenience instinct ("/" looks weird in a legend label) overrides the domain rule.

**How to avoid:** CLAUDE.md "Domain language — use verbatim, don't normalize" is non-negotiable. Trip-type strings come from `catch_reports.trip_type` directly into legend labels with no transform. The same goes for landing names ("Point Loma Sportfishing", never "Pt Loma") and species ("dorado", never "mahi-mahi"). [CITED: CLAUDE.md, this repository]

**Warning signs:** Code or test fixtures contain "Half Day", "Pt Loma", "mahi", "morning", "afternoon" as labels. A `String.replace()` call on a trip-type/landing/species value.

### Pitfall 5: Per-angler discipline lint failure

**What goes wrong:** A new component or route inlines the literal string `'fish/angler'`. The Plan-02 lint test (`tests/unit/lint/per-angler-discipline.test.ts`) fails CI loudly. Phase 6 ships broken.

**Why it happens:** Developer forgets the constants module exists. `RTR-05` (Phase 10) will eventually retire the lint, but it's still active in Phase 6.

**How to avoid:** Always import from `src/lib/copy/metrics.ts` (`FISH_PER_ANGLER_AXIS`, `FISH_PER_ANGLER_ARIA`, `FISH_PER_ANGLER_TOOLTIP_UNIT`). Never inline. Run the lint locally before committing: `npx vitest run tests/unit/lint/per-angler-discipline.test.ts`. [VERIFIED: tests/unit/lint/per-angler-discipline.test.ts existed before Phase 6 — discipline still active]

**Warning signs:** CI red on lint test. Grep finds `'fish/angler'` outside `metrics.ts`, `PerAnglerMetric.svelte`, `/about/+page.svelte`.

### Pitfall 6: DAL boundary breach via clever loader

**What goes wrong:** A loader, faced with an unusual aggregation, reaches for `db.prepare(...)` directly. The static-grep DAL boundary test fails.

**Why it happens:** New aggregation shape feels too narrow to add a DAL function. Or developer forgets the rule.

**How to avoid:** Every SQL string lives in `src/lib/db/`. Every aggregation gets a DAL function — even if it's used only once. Cost of a one-off DAL function: 10 lines. Cost of a CI-red test: 30 minutes.

**Warning signs:** `tests/unit/db/dal-boundary.test.ts` fails. `db.prepare(` appears in `src/routes/`, `src/lib/components/`, or `src/lib/shared/`.

### Pitfall 7: T-02-31 "All" range becomes unbounded

**What goes wrong:** A loader passes `range='all'` straight into a query without a date floor. SQLite scans the entire history; query time grows with database size.

**Why it happens:** Forgetting the `/trends` precedent: "all" is mapped to a `today() - 365*10 days` sentinel ([VERIFIED: src/routes/trends/+page.server.ts:33]).

**How to avoid:** The range mapper produces a `fromDate` for every preset including "all." For "all," use `today() - 365*15` (~15 years — wider than the Phase 1 backfill horizon). The covering index on `(boat_id|species|landing_id, source_date)` makes even a 15-year scan fast.

**Warning signs:** No explicit date floor for "all." A `WHERE source_date >= ?` clause that takes a nullable parameter. Query time grows linearly with rows.

### Pitfall 8: Cache-Control includes-today logic is wrong

**What goes wrong:** A query for the last 365 days (which always includes today) gets `max-age=300` instead of `max-age=60`. Users see 5-minute-stale data on a chart that should refresh hourly.

**Why it happens:** Misjudging the "includes today" predicate.

**How to avoid:** Predicate is simple: `toDate >= today()`. After the loader resolves the range to concrete `fromDate`/`toDate` strings, compare `toDate` to `today()` (string comparison is sufficient because both are `YYYY-MM-DD` PT). If `toDate >= today()`, set `max-age=60`. Else `max-age=300`. [VERIFIED: existing pattern home `+page.server.ts:21` uses 60; trends `+page.server.ts:54` uses 300 unconditionally because trends doesn't include today by default — explorer is more nuanced.]

**Warning signs:** Cache-Control header is unconditional. `max-age=60` appears for ranges that exclude today (wasteful). `max-age=300` appears for ranges that include today (stale).

### Pitfall 9: Top-6 cap chosen by current bucket totals instead of window totals

**What goes wrong:** D-15 says "top-6 by total catch in the window" but the implementer picks top-6 per bucket, producing a different boat set per bucket and a confusing legend.

**Why it happens:** Conflating "top-6 series by sum across window" with "top-6 values at any given point."

**How to avoid:** Two-pass aggregation. Pass 1 (DAL): `SELECT boat_id, SUM(species_count) AS total FROM catch_reports WHERE species=? AND source_date BETWEEN ? AND ? GROUP BY boat_id ORDER BY total DESC LIMIT 6`. This is the visible-series set. Pass 2 (DAL): for each visible boat, run the bucketed-trend query. Series 7+ get `legend.selected[name] = false` (start hidden) but are still in `series` so the "+N more" toggle can flip them on without a data refetch.

**Warning signs:** Two boats appear in different buckets but never together in the same legend. Series count varies between buckets.

### Pitfall 10: Slug-aware insert ignores existing slugs in the same batch

**What goes wrong:** The scraper sees two new boats whose `display_name` slugify to the same base. Both get the same slug; UNIQUE INDEX rejects the second INSERT.

**Why it happens:** `upsertBoatsAndLandings` resolves slugs by querying existing DB rows but doesn't track slugs assigned earlier in the same batch.

**How to avoid:** In `upsertBoatsAndLandings`, accumulate a `Set<string>` of taken slugs that grows as the loop proceeds:

```typescript
const taken = new Set<string>(db.prepare(`SELECT slug FROM boats WHERE slug IS NOT NULL`).all().map((r:any) => r.slug));
for (const [name, meta] of boatsByName) {
  // Check if boat already exists — only generate slug for new boats
  const existing = db.prepare(`SELECT slug FROM boats WHERE source_name = ?`).get(name) as { slug?: string } | undefined;
  let slug = existing?.slug;
  if (!slug) {
    slug = uniqueSlug(slugify(meta.displayName ?? name), taken);
    taken.add(slug);
  }
  upsertByName(db, name, landingId, meta.displayName, meta.url, slug);
}
```

**Warning signs:** Test with two same-name boats in one batch fails with UNIQUE constraint. Slug column shows duplicates after a busy ingestion run.

## Code Examples

Verified patterns from this repository's existing files (paths absolute):

### Multi-series ECharts option (existing `/compare`)

```typescript
// Source: /Users/zen/Documents/code/fish-count/src/routes/compare/+page.server.ts:89-112
const chartOption = {
  tooltip: { trigger: 'axis' as const },
  legend: { data: rows.filter((r) => r !== null).map((r) => r!.boat_name), bottom: 0 },
  xAxis: { type: 'category' as const, data: expectedBuckets },
  yAxis: { type: 'value' as const, name: FISH_PER_ANGLER_AXIS },
  series: rows.filter((r) => r !== null).map((r) => {
    const presentMap = new Map((trendsByBoat[r!.boat_id] ?? []).map((b) => [b.bucket_key, b.value]));
    return {
      name: r!.boat_name,
      type: 'line' as const,
      connectNulls: false,                 // gap-aware per D-27
      data: expectedBuckets.map((k) => presentMap.get(k) ?? null)
    };
  })
};
```

Phase 6 adds `axisPointer: { type: 'cross' }` to the tooltip object and a `formatter` for per-series + per-bucket `n`.

### DAL function with optional filter and granularity (existing `boatTrend`)

```typescript
// Source: /Users/zen/Documents/code/fish-count/src/lib/db/queries/trends.ts:93-142
export function boatTrend(db: Database.Database, args: BoatTrendArgs): TrendBucket[] {
  const bucketExpr =
    args.granularity === 'weekly'
      ? "strftime('%G-W%V', source_date)"
      : "strftime('%Y-%m', source_date)";
  // Phase 6 adds:
  //   args.granularity === 'daily' ? "strftime('%Y-%m-%d', source_date)" : ...
  // Two prepared statements (per-species + all-species), parameterized inputs only.
  // ...
}
```

Phase 6 extends the granularity union to `'daily' | 'weekly' | 'monthly'`. The bucket expression branches in code (not from user input — granularity is a typed enum).

### Loader-does-gap-fill with date-fns (existing `/trends`)

```typescript
// Source: /Users/zen/Documents/code/fish-count/src/routes/trends/+page.server.ts:103-120
const expectedKeys: string[] =
  granularity === 'weekly'
    ? eachWeekOfInterval({ start: fromDateObj, end: toDateObj }, { weekStartsOn: 1 })
        .map((d) => format(d, "RRRR-'W'II"))
    : eachMonthOfInterval({ start: fromDateObj, end: toDateObj })
        .map((d) => format(d, 'yyyy-MM'));
// Phase 6 adds:
//   : granularity === 'daily'
//     ? eachDayOfInterval({ start: fromDateObj, end: toDateObj }).map((d) => format(d, 'yyyy-MM-dd'))
//     : ...
```

### Range-to-dates mapper (existing pattern, extend for Phase 6)

```typescript
// Source: /Users/zen/Documents/code/fish-count/src/routes/trends/+page.server.ts:27-35 (extended for Phase 6)
function rangeToDates(range: ExplorerFilters['range'], custom?: { fromDate: string; toDate: string }):
  { fromDate: string; toDate: string } {
  if (range === 'custom' && custom) return custom;
  const toDate = today();
  const days =
    range === '1m' ? 30 :
    range === '3m' ? 90 :
    range === '6m' ? 180 :
    range === '1y' ? 365 :
    range === '2y' ? 365 * 2 :
    range === '5y' ? 365 * 5 :
    /* all */          365 * 15;       // T-02-31 bounded sentinel
  return { fromDate: addDays(toDate, -days), toDate };
}
```

### Cache-Control conditional (Phase 6 new)

```typescript
// Phase 6 addition to +page.server.ts
const includesToday = toDate >= today();   // string comparison — both YYYY-MM-DD PT
setHeaders({
  'cache-control': includesToday ? 'public, max-age=60' : 'public, max-age=300'
});
```

### Auto-widen on empty default (Phase 6 new)

```typescript
// Phase 6 addition to +page.server.ts when filters are defaults (no URL params)
let { fromDate, toDate } = rangeToDates(filters.range);
let noteOverride: string | null = null;

if (filters.ticker === 'boat' && /* defaults applied */ filters.range === '1y') {
  const hasAnyIn1Y = countCatchRowsForBoatInRange(db, defaultBoatId, fromDate, toDate) > 0;
  if (!hasAnyIn1Y) {
    ({ fromDate, toDate } = rangeToDates('all'));
    filters = { ...filters, range: 'all' };
    noteOverride = 'No 1Y data — showing full history.';
  }
}
```

`countCatchRowsForBoatInRange` is a new DAL helper returning `number`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ECharts 5.x with `tooltip.formatter` returning HTML strings | ECharts 6.0 (released 2025) — same API; CSS containment improvements; no breaking changes for our usage | 2025 | None for this project. Already on 6.0.0. |
| Svelte 4 stores | Svelte 5 runes (`$state`, `$props`, `$effect`) | 2025-Q1 | All existing components in this repo use runes. New components MUST follow. |
| Drizzle ORM (recommended in `STACK.md`) | Plain better-sqlite3 + custom `migrations.ts` | Phase 1 implementation | The project chose plain better-sqlite3 — Drizzle was recommended in research but never adopted. STACK.md is now slightly stale on this point. **Plan accordingly.** [VERIFIED: package.json has no `drizzle-orm`; `migrations.ts` is a single SCHEMA_SQL string] |
| Trip-type segmentation lint allowlist | RTR-05 retires it (Phase 10) | Phase 10 | **Still active in Phase 6.** New `metrics.ts` constant imports stay required. |

**Deprecated/outdated:**
- The recommendation to use Drizzle ORM (`STACK.md:11`) does not match the actual code. Phase 6 follows the plain-better-sqlite3 pattern.
- `STACK.md` mentions `svelte-echarts` as a possible wrapper. The project does NOT use it — `Chart.svelte` is hand-written with a dynamic ECharts core import. Stay with `Chart.svelte`.

## Project Constraints (from CLAUDE.md)

The planner must verify every plan satisfies these directives:

1. **Domain language is verbatim, never normalized.** Trip types, landings, and species use exact strings from CLAUDE.md. Trip type "1/2 Day AM" never becomes "Half Day AM"; landing "Point Loma Sportfishing" never becomes "Pt Loma"; species "dorado" never becomes "mahi-mahi". This applies to legend labels, dropdown options, tooltip text, table cells — every user-visible surface.
2. **Per-angler metric — never inline `'fish/angler'`.** Always import from `src/lib/copy/metrics.ts`. Lint test `tests/unit/lint/per-angler-discipline.test.ts` enforces this.
3. **DAL boundary — only `src/lib/db/` may issue SQL.** Lint test `tests/unit/db/dal-boundary.test.ts` enforces. Loaders compose DAL functions; no `db.prepare()` calls in routes.
4. **Single date producer — `src/lib/shared/dates.ts`.** No ad-hoc `new Date()` math, no `.toISOString().slice(0, 10)`, no inline `Intl.DateTimeFormat`. The dates-boundary test forbids these patterns outside `dates.ts`.
5. **All dates `YYYY-MM-DD` in `America/Los_Angeles`.** This is enforced by the dates module; new code consumes its outputs without re-parsing.
6. **Idempotent upsert key `(date, boat_id, trip_type, species)` is non-negotiable.** Phase 6 must not change this. Slug column is purely additive on `boats`.
7. **Trust the audience.** Show `n` next to per-angler numbers. Don't refuse to render based on n<5 (D-16). Show data with sample size and let anglers judge thin data.
8. **Anti-feature lint guard.** No "ON FIRE", "HOT BITE", flame/trophy/star/medal emojis, "Sponsored", "Featured", "Promoted", "Leaderboard", "Top N this season", "Scrape now" anywhere in `src/routes` or `src/lib/components`. Lint test `tests/unit/lint/anti-feature.test.ts` enforces.
9. **Polish bar = "shareable with a fishing buddy".** Not a startup product. No A/B test telemetry, no animation polish for its own sake.
10. **Ask before destructive actions.** Migration-related changes that touch existing data (e.g., the slug backfill UPDATE) should be reviewed before merge.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ECharts 6 `axisPointer.type='cross'` works on touch devices with tap-to-pin via the `triggerOn: 'mousemove\|click'` default. | Pattern 3 + D-22 | If touch behavior is poor on iOS Safari, may need `triggerOn: 'click'` and lose the desktop hover. Verify on a real iPhone during execution. |
| A2 | `legend.type='scroll'` gracefully handles narrow 375px viewport without overflow into the chart canvas. | Pattern 3 | If the legend pagination buttons crowd the chart, may need to render the legend OUTSIDE ECharts (Svelte component) and hide ECharts's legend with `legend.show: false`. |
| A3 | `boats.display_name` is unique enough that slug collisions are rare (<5% of boats). | Pattern 5 (slug migration) | If many collisions, the `-2`, `-3` suffixes proliferate and the URL aesthetics suffer. Mitigation: examine the actual data during planning — `SELECT display_name, COUNT(*) FROM boats GROUP BY display_name HAVING COUNT(*) > 1`. |
| A4 | Auto-widen from 1Y → All is sufficient. We don't need to try 2Y or 5Y as intermediate steps. | D-03 + Pitfall 1 | If a default boat has thin data even at All (truly inactive boat), the screen is still "almost empty." Acceptable per "trust the audience" — chart renders honestly with a few points. |
| A5 | The materialized `boat_monthly_yields` table will NOT be needed. Covering indexes + monthly bucketing keeps All-range queries under 300ms. | D-20 | If Phase 6 hits >300ms during execution, the contingency plan (materialized table populated by the existing nightly scheduler hook) is invoked. Plan this as a fallback in the wave structure but don't implement upfront. |
| A6 | The `boats` table has fewer than ~500 rows (the SD charter fleet is small). | listBoatsByActivity sort | A full-table scan with a `COUNT(DISTINCT source_date)` aggregate is fine at this scale. If the table grows past ~5000, revisit. |
| A7 | All catch_reports rows in the project have `boat_id` and `landing_id` populated (no orphan rows). | DAL queries | Orphan rows would silently drop from JOIN-based queries. Phase 1 DAL guarantees FK integrity, so this is verified by schema. |
| A8 | The "+N more" pill design (D-15, D-21) is acceptable at 375px width without rendering issues. | Pattern 3 | If 7+ series cause the "+N more" pill to overflow, fall back to ECharts's native `legend.type='scroll'` with no custom Svelte overlay. |

**Recommendation to planner:** Surface A1, A2, and A3 to the operator during plan-check if there's any concern. A1/A2 can be confirmed by manual smoke on a real device during execution. A3 can be verified with a single SELECT against the production DB before planning.

## Open Questions

1. **Should the species-breakdown table (boat ticker only) link species names to the species ticker?**
   - What we know: D-15 says "small table BELOW the chart listing the species this boat caught with totals." No interaction specified.
   - What's unclear: Whether tapping "yellowtail" in the table should switch the ticker to species/yellowtail.
   - Recommendation: Ship as plain text in Phase 6; revisit after watching actual usage. Adding cross-axis links is small but expands the cross-axis-default contract (D-08) — and we don't have a "boat → species" cross-axis where the species is *known* (currently D-08 uses "the most-caught species for this boat").

2. **Where do `parseExplorerFilters` and `serializeExplorerFilters` defaults live when the URL is empty?**
   - What we know: D-04 wants a clean URL on first load. Defaults are server-resolved (D-01, D-02).
   - What's unclear: If parseExplorerFilters returns `{ error }` for an empty URL (because `slug` is missing for the implicit default-boat ticker), should the loader treat it as "use defaults" or "error guidance"?
   - Recommendation: Make ALL fields optional in the schema (including `ticker`). When `ticker` is missing, the loader applies defaults (D-01: ticker=boat, default boat). When `ticker=boat` is present but `slug` is missing, that's a 400-level error (still defaultable, but logged differently). Drift risk is small either way.

3. **For "+N more" expansion (D-15), is the pill itself part of the chart legend area or above/below it?**
   - What we know: D-15 says "click on the +N more pill reveals them."
   - What's unclear: UX placement.
   - Recommendation: Render the pill INSIDE the legend area (replacing the pagination chevrons of `legend.type='scroll'`) by hiding ECharts's native legend (`legend.show: false`) and rendering a Svelte legend that includes the visible-6 swatches plus a `"+N more"` button. Tapping the button toggles a list of hidden series; tapping a hidden series flips it on via `dispatchAction({type:'legendToggleSelect', name})`. This keeps the rendering coherent and accessible.

4. **Scope of `defaultBoatId` resolution failure path.**
   - What we know: D-01's "most-active boat in last 30 days" assumes catch_reports has rows in the last 30 days.
   - What's unclear: What if the database is freshly initialized and has no rows at all (dev setup or scrape never run)?
   - Recommendation: Loader returns an empty-state response with no defaults, no chart, just an EmptyState explaining "No data yet — the scraper hasn't run." This matches existing v1 patterns in the home and trends routes.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | 22.x (per `engines.node` in package.json) | — |
| better-sqlite3 native binding | DAL | ✓ | 12.9.0 | — |
| SQLite | Storage | ✓ (bundled with better-sqlite3) | 3.46+ | — |
| ECharts | Chart rendering | ✓ | 6.0.0 | — |
| date-fns | Bucket axis | ✓ | 4.1.0 | — |
| Zod | URL parse | ✓ | 4.3.6 | — |
| Tailwind CSS v4 | Styling | ✓ | 4.2.4 | — |
| date input native picker (`<input type="date">`) | Custom range UX | ✓ on iOS Safari, Chrome, Firefox, Safari ≥14, Edge | — | Manual `<input type="text">` with regex if older browser support needed (not required) |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest@2.1.0` (already configured) |
| Config file | `/Users/zen/Documents/code/fish-count/vitest.config.ts` (vitest only — separate from `vite.config.ts`) |
| Quick run command | `npx vitest run --reporter=dot` |
| Targeted run | `npx vitest run tests/unit/<file>.test.ts` |
| Full suite command | `npm run test:run` |
| Test environment | Node (no jsdom needed for current tests; check if explorer page tests need jsdom for Svelte component testing) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXPL-01 | Loader resolves default boat ticker (most-active in last 30d, alpha tie-break) | unit | `npx vitest run tests/unit/db/queries/explorer.test.ts -t "default boat"` | ❌ Wave 0 |
| EXPL-01 | Auto-widen 1Y → All when default boat has no 1Y data | integration | `npx vitest run tests/integration/explorer-routes.test.ts -t "auto-widen"` | ❌ Wave 0 |
| EXPL-02 | URL `ticker=boat\|species\|landing` round-trips through Zod parse/serialize | unit | `npx vitest run tests/unit/shared/urlState.test.ts -t "ExplorerFilters"` | ⚠️ extend existing |
| EXPL-03 | `listBoatsByActivity` returns boats ordered by 90-day trip-day count desc, alpha tie-break | unit | `npx vitest run tests/unit/db/boats.test.ts -t "listBoatsByActivity"` | ⚠️ extend existing |
| EXPL-04 | Species options use verbatim SD names (no normalization) | unit | `npx vitest run tests/unit/db/queries/browse.test.ts -t "distinctSpecies"` | ⚠️ existing |
| EXPL-05 | Landing options use verbatim names | unit | existing `distinctLandings` test | ⚠️ existing |
| EXPL-06 | Boat ticker → series-by-trip-type per bucket | unit | `npx vitest run tests/unit/db/queries/explorer.test.ts -t "boatExplorerSeries"` | ❌ Wave 0 |
| EXPL-07 | Species ticker → series-by-boat per bucket, top-6 cap | unit | `npx vitest run tests/unit/db/queries/explorer.test.ts -t "speciesAcrossBoats"` | ❌ Wave 0 |
| EXPL-08 | Landing ticker → series-by-species per bucket, top-6 cap | unit | `npx vitest run tests/unit/db/queries/explorer.test.ts -t "landingAcrossSpecies"` | ❌ Wave 0 |
| EXPL-09 | Range mapper: each preset → correct `(fromDate, toDate, granularity, includesToday)` | unit | `npx vitest run tests/unit/shared/range.test.ts` | ❌ Wave 0 |
| EXPL-10 | Loader output includes `n` per series (legend) AND per bucket per series (tooltip data) AND total trips (caption) | unit | `npx vitest run tests/unit/routes/explorer.test.ts -t "n surfaces"` | ❌ Wave 0 |
| EXPL-11 | Boat-ticker series legend labels include verbatim trip-type strings (e.g., "1/2 Day AM · n=NN") | unit | `npx vitest run tests/unit/routes/explorer.test.ts -t "trip-type label verbatim"` | ❌ Wave 0 |
| EXPL-12 | Sticky header at 375px renders 3 rows; chart height = 280px | manual / Playwright (visual) | manual UAT scenario or `tests/integration/explorer-mobile.test.ts` (Playwright) | ❌ manual UAT (Phase 6 doesn't include Playwright) |
| EXPL-13 | All-range loader query returns within 300ms on a representative DB (covering indexes present) | integration / perf | `npx vitest run tests/integration/explorer-routes.test.ts -t "all-range performance"` | ❌ Wave 0 |
| EXPL-14 | Custom range URL with valid dates produces correct chart; invalid dates return guidance | unit + integration | `npx vitest run tests/unit/shared/urlState.test.ts -t "custom range"` + integration | ⚠️ extend + new |
| Slug | `slugify` produces deterministic, ASCII-only output | unit | `npx vitest run tests/unit/shared/slug.test.ts` | ❌ Wave 0 |
| Slug | `uniqueSlug` resolves collisions with `-2`, `-3` suffixes; idempotent | unit | `npx vitest run tests/unit/shared/slug.test.ts -t "collisions"` | ❌ Wave 0 |
| Slug | Migration backfills slugs from `display_name` deterministically; UNIQUE INDEX created | unit | `npx vitest run tests/unit/db/migrations.test.ts -t "slug migration"` | ⚠️ extend existing |
| Slug | `boats.upsertByName` with new boat assigns slug; with existing boat keeps slug frozen | unit | `npx vitest run tests/unit/db/boats.test.ts -t "frozen-at-first-seen"` | ⚠️ extend existing |
| DAL boundary | No SQL outside `src/lib/db/` after explorer added | unit (existing static-grep) | `npx vitest run tests/unit/db/dal-boundary.test.ts` | ✅ existing |
| Per-angler discipline | No `'fish/angler'` literal outside allowlist after explorer added | unit (existing static-grep) | `npx vitest run tests/unit/lint/per-angler-discipline.test.ts` | ✅ existing |
| Anti-feature | No hype/leaderboard patterns in new explorer route/components | unit (existing static-grep) | `npx vitest run tests/unit/lint/anti-feature.test.ts` | ✅ existing |
| Date discipline | No new `new Date()` / `.toISOString().slice(0,10)` outside `dates.ts` | unit (existing static-grep) | `npx vitest run tests/unit/shared/dates-boundary.test.ts` | ✅ existing |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/<changed-file>.test.ts` (under 5s typical)
- **Per wave merge:** `npm run test:run` (full suite — unit + integration + lint static-grep)
- **Phase gate:** Full suite green before `/gsd-verify-work`. Plus a manual mobile UAT against EXPL-12 (375px viewport via DevTools or real device).

### Wave 0 Gaps

Files to create or extend in Wave 0 of the plan:

- [ ] `tests/unit/db/queries/explorer.test.ts` — covers EXPL-06, EXPL-07, EXPL-08, EXPL-13 (perf at All)
- [ ] `tests/unit/db/queries/explorer.test.ts` (continued) — `defaultBoatLast30Days`, `mostCaughtSpeciesForBoat`, `mostFrequentBoatForSpecies`, `mostRecentlyActiveLanding` for D-01 and D-08
- [ ] `tests/unit/shared/slug.test.ts` — `slugify` + `uniqueSlug` collision logic
- [ ] `tests/unit/shared/range.test.ts` (optional, depending on whether range mapper is extracted) — preset → date-window mapping for all 8 presets including custom
- [ ] `tests/unit/routes/explorer.test.ts` — loader-level: default resolution, auto-widen, n-surfaces, cache-control includesToday branch
- [ ] `tests/integration/explorer-routes.test.ts` — full-page load + URL round-trip; auto-widen end-to-end; all-range perf assertion (use `console.time` style with a soft 300ms budget — log only, don't fail CI under noisy environments)
- [ ] **Extend** `tests/unit/db/boats.test.ts` — add `listBoatsByActivity`, `findBySlug`, slug-frozen-at-first-seen on upsert
- [ ] **Extend** `tests/unit/db/migrations.test.ts` — add slug ADD COLUMN + backfill scenario, idempotency on second runMigrations call, existing-row preservation
- [ ] **Extend** `tests/unit/shared/urlState.test.ts` — `parseExplorerFilters` happy path + every error case (custom-range incomplete, invalid slug, unknown ticker, fromDate > toDate, fromDate < earliest_scrape clamp, toDate > today() clamp)

**Framework install:** None — vitest already installed.

**No Playwright in Phase 6.** EXPL-12 mobile-at-375px verification is a manual UAT scenario in `/gsd-verify-work`. If a Playwright pass is desired, propose it as a Phase 11 polish item, not Phase 6 scope.

## Security Domain

> Required because `security_enforcement` is not explicitly disabled in `.planning/config.json` (treat as enabled by default).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Explorer is anonymous-public; no signup. Phase 9 introduces email-only auth for alerts. |
| V3 Session Management | no | No sessions in Phase 6. |
| V4 Access Control | no | All explorer data is public; no per-user gating. |
| V5 Input Validation | yes | Zod `safeParse` at the URL boundary (`parseExplorerFilters`), parameterized SQL throughout DAL. T-02-02 dates regex carries forward. |
| V6 Cryptography | no | No secrets, no encryption-at-rest, no hashes in Phase 6. |
| V7 Errors and Logging | yes | `event.locals.logger?.info({ msg: 'explorer_loaded', ... })` per existing convention. No PII logged. |
| V13 Configuration | yes | No new env vars. Cache-Control headers explicit per D-20. |
| V14 Build / Deploy | partial | New migration runs idempotently on every boot (per existing pattern). |

### Known Threat Patterns for SvelteKit + better-sqlite3 + ECharts

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via crafted `slug` URL param | Tampering | Parameterized queries via better-sqlite3 prepared statements + Zod regex on slug field (only `[a-z0-9-]`). [VERIFIED: existing pattern enforced by `tests/unit/db/dal-boundary.test.ts`] |
| SQL injection via crafted `name` (species/landing) URL param | Tampering | Parameterized queries; Zod `min(1).max(80\|120)` length cap + literal exact-match in SQL. No LIKE patterns. |
| URL-string DoS (e.g., 100MB `slug` value) | DoS | Zod `max()` length caps reject before SQL hits. SvelteKit's default URL length cap (~8KB) is also a backstop. |
| All-range query DoS (huge scan) | DoS | T-02-31 bounded sentinel (`today() - 365*15 days`) + covering index — even worst case scans bounded rows. |
| HTML injection via boat/species/landing names rendered in tooltip | Spoofing | Tooltip formatter constructs HTML strings — names from DB are rendered via ECharts's tooltip `formatter`. Names come from a verified scrape source, but defense-in-depth: HTML-escape names in the formatter. (ECharts sanitizes `params[].seriesName` for its own rendering but a custom formatter that returns HTML is the developer's responsibility.) |
| URL-shareable view leaks PII | Information disclosure | Explorer URLs contain only public identifiers (slug, species name, landing name, dates). No emails, no user IDs. |
| Cache poisoning of public response | Tampering | Cache-Control responses are `public`; only safe (read-only) data; no per-user variation. Standard SvelteKit reverse-proxy assumptions apply. |
| Open redirect on form submit | Tampering | `goto()` URLs are constructed from typed Zod-validated state, not from arbitrary user input. No redirect parameter. |

**Specific defense-in-depth for tooltip formatter HTML construction:**

```typescript
// Source: this research, defense-in-depth pattern
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// Use escapeHtml(p.seriesName) inside any formatter that returns HTML strings.
```

[ASSUMED] ECharts 6's default tooltip formatter (string-template form, e.g., `{a}: {c}`) auto-escapes; the function-form formatter does not. Verify against ECharts docs during execution if a tooltip XSS test is added.

## Sources

### Primary (HIGH confidence — verified in this session)
- `/Users/zen/Documents/code/fish-count/CLAUDE.md` — domain language rules, audience, polish bar
- `/Users/zen/Documents/code/fish-count/package.json` — version verification (echarts 6.0.0, date-fns 4.1.0, zod 4.3.6, svelte 5.55.4, sveltekit 2.57.1)
- `/Users/zen/Documents/code/fish-count/src/lib/components/Chart.svelte` — dynamic-import ECharts wrapper, reduced-motion, ariaLabel
- `/Users/zen/Documents/code/fish-count/src/lib/db/queries/trends.ts` — `speciesTrend`, `boatTrend`, ISO-week `%G-W%V`, monthly `%Y-%m`
- `/Users/zen/Documents/code/fish-count/src/routes/trends/+page.server.ts` — loader-does-gap-fill, T-02-31 bounded sentinel, range mapper
- `/Users/zen/Documents/code/fish-count/src/routes/compare/+page.server.ts` — multi-series `connectNulls: false`, EChartsOption shape
- `/Users/zen/Documents/code/fish-count/src/lib/shared/urlState.ts` — Zod safeParse → `{error}` discriminated return, untrusted-input boundary
- `/Users/zen/Documents/code/fish-count/src/lib/shared/dates.ts` — `today()`, `addDays()`, `isoWeekKey`, `monthKey`, PT canonical, no `new Date()` math discipline
- `/Users/zen/Documents/code/fish-count/src/lib/db/migrations.ts` — single SCHEMA_SQL string, idempotent on every boot, existing UNIQUE/INDEX patterns
- `/Users/zen/Documents/code/fish-count/src/lib/db/boats.ts` — `upsertByName` pattern, `upsertBoatsAndLandings` batch helper
- `/Users/zen/Documents/code/fish-count/src/lib/db/landings.ts` — landing DAL pattern
- `/Users/zen/Documents/code/fish-count/src/routes/+layout.svelte` — current `navItems` array, sticky-md-only nav z-index 10
- `/Users/zen/Documents/code/fish-count/src/lib/copy/metrics.ts` — `FISH_PER_ANGLER_AXIS`, `FISH_PER_ANGLER_ARIA`, `FISH_PER_ANGLER_TOOLTIP_UNIT` constants
- `/Users/zen/Documents/code/fish-count/tests/unit/db/dal-boundary.test.ts` — DAL boundary static-grep enforcement
- `/Users/zen/Documents/code/fish-count/tests/unit/lint/per-angler-discipline.test.ts` — per-angler lint allowlist
- `/Users/zen/Documents/code/fish-count/tests/unit/lint/anti-feature.test.ts` — anti-hype guard
- `/Users/zen/Documents/code/fish-count/.planning/research/STACK.md` — ecosystem reference (CAVEAT: STACK.md recommends Drizzle but the project uses plain better-sqlite3)
- `/Users/zen/Documents/code/fish-count/.planning/research/PITFALLS.md` — domain pitfalls (per-angler misread, silent scraper failure, cost creep)

### Secondary (HIGH confidence — verified via Context7)
- Apache ECharts via Context7 `/apache/echarts-doc` — `tooltip.trigger='axis'` + `axisPointer.type='cross'` config + `dispatchAction({type:'legendToggleSelect', name})` + `legend.type='scroll'` pagination
- npm registry — `echarts@6.0.0` (latest), `date-fns@4.1.0`, `zod@4.4.1` (latest, installed 4.3.6 minor drift)

### Tertiary (LOW confidence — assumptions to verify in execution)
- ECharts 6 mobile tap-to-pin behavior on iOS Safari (A1) — verify on real device during execution
- `legend.type='scroll'` rendering at 375px viewport (A2) — verify visually during execution
- Slug collision rate in production data (A3) — verify with `SELECT display_name, COUNT(*) FROM boats GROUP BY display_name HAVING COUNT(*) > 1` before planning execution

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library already installed and verified at known versions
- Architecture (slug migration, DAL extensions, loader pattern): HIGH — mirrors existing `/trends` and `/compare` directly; new patterns are additive only
- ECharts multi-series + tooltip + legend toggle: HIGH — verified against Context7 ECharts docs and existing `/compare` code
- Mobile sticky 3-row layout: MEDIUM — pattern is straightforward Tailwind sticky, but a 375px visual smoke during execution will catch z-index/overlap surprises (A2)
- "+N more" expansion UX (D-15): MEDIUM — recommended approach (custom Svelte legend + `dispatchAction` toggle) is sound but not exercised elsewhere in this codebase
- Slug collision rate / aesthetics (A3): LOW until verified against actual `boats` data

**Research date:** 2026-04-30
**Valid until:** 2026-05-30 (30 days — stack is stable; ECharts API hasn't changed in months; the only fast-moving piece is the project's own evolving DAL)
