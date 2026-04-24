# Phase 2: Browse + Trip Picker + Trends - Research

**Researched:** 2026-04-24
**Domain:** SvelteKit 2 SSR read-surfaces + cross-table SQL aggregation + ECharts calendar heatmap + mobile-first Tailwind 4 at 375px, layered over the existing Phase 1 `catch_reports`/`boats`/`landings`/`scrape_runs` schema.
**Confidence:** HIGH (stack/schema already in repo and exercised by Phase 1 tests; per-angler and heatmap patterns are project non-negotiables already decided in CONTEXT.md)

## Summary

Phase 2 is almost entirely a **compositional** phase: it assembles new SvelteKit routes, a new `src/lib/db/queries/` cross-table read layer, a single reusable `<Chart>` ECharts wrapper, and a mandatory `<PerAnglerMetric>` component, all on top of Phase 1's already-shipped DAL. There is no new infrastructure — no new runtime, no new external services, no new secrets. The hardest technical pieces are (1) the weighted per-angler SQL (`SUM(species_count)*1.0/SUM(angler_count)`) and its `n = COUNT(DISTINCT (source_date, trip_type))` sample-size companion, and (2) the ECharts calendar heatmap with per-cell `itemStyle` gray overrides for `n<5` cells.

The biggest planning risks are not technical — they're **discipline** risks: leaking SQL out of the DAL, leaking date-string derivation out of `src/lib/shared/dates.ts`, and letting the per-angler metric appear anywhere without its mandatory inline disclaimer + link to `/about`. All three are governed by CLAUDE.md non-negotiables and STO-03/STO-04; the planner must plant checks (dal-boundary test, dates-boundary test, grep-check for PerAnglerMetric usage) so these invariants do not erode.

**Primary recommendation:** Ship Phase 2 as 7 task-sized plans along SvelteKit's natural seams — (1) DAL query module + tests, (2) urlState + dates-helpers extension, (3) `<PerAnglerMetric>` + `<Chart>` + `/about`, (4) `/` + `/date/[d]` + source-link wiring, (5) `/picker` + heatmap, (6) `/boats/[id]` + `/compare` + `/trends`, (7) dev seed + integration + VALIDATION sign-off. Reuse the Phase 1 in-memory SQLite test pattern verbatim. Add `date-fns` only for ISO week/month math on the Node side for trend-chart gap-filling; everything else stays in SQL.

## Architectural Responsibility Map

Phase 2 is a frontend-server + datastore phase only. No browser-side data fetching, no API tier, no CDN work.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Today's/past-date/picker/compare/trends/boat-detail page rendering | Frontend Server (SSR) | Database | SvelteKit `+page.server.ts` `load()` functions compose DAL reads and return shaped JSON; SSR HTML ships with data already rendered (D-03, D-04) |
| Filter bar interactivity (species/trip-type/landing/date/window) | Browser / Client | Frontend Server | Controls call `goto(url, {replaceState:true, noScroll:true, keepFocus:true})` — URL is the source of truth; server load re-runs on URL change (D-18, D-19) |
| URL round-tripping of filter state (BRW-07) | Frontend Server | Browser | `url.searchParams` read in load(); typed parse/serialize helper at `src/lib/shared/urlState.ts` used by both sides (D-18) |
| Weighted per-angler aggregation (TRP-02, TRN-01, TRN-02, TRN-03) | Database (SQL) | — | `SUM(species_count)*1.0/SUM(angler_count)` with HAVING / GROUP BY composes cheaply in SQLite; keeping math in SQL preserves "DAL is only SQL source" (STO-03, D-06) |
| Weekly/monthly bucketing (TRN-01, TRN-02) | Database (SQL) | Frontend Server | SQLite 3.53 `strftime('%V-%G', date)` for ISO-week (verified — handles year-boundary) and `strftime('%Y-%m', date)` for month; gap-filling (empty buckets → discontinuity line) happens Node-side before returning to the chart (D-27) |
| Calendar heatmap n<5 gray cells (TRP-09) | Browser / Client (ECharts) | Frontend Server | Server returns `[{ date, value, n }]`; client `<Chart>` maps each cell to `{value: [date, value], itemStyle: n<5 ? {color:'#888'} : undefined}` — itemStyle has HIGHER priority than visualMap in ECharts ≥5.0 (D-14) |
| HTTP cache tuning per route (D-29) | Frontend Server | — | `setHeaders({'cache-control': ...})` inside load() for `/`, `/date/[d]`, `/picker`, `/trends`, `/compare`, `/boats/[id]`, `/about` |
| Dev seed DB population (D-33) | CLI script (`tsx`) | Database | `scripts/seed-dev-db.ts` replays committed HTML fixtures through the existing Phase 1 `parsePage` + DAL upsert; idempotent via Phase 1 UNIQUE index |

## Project Constraints (from CLAUDE.md)

The planner MUST verify every task's design against these directives. These are binding; research cannot override them.

- **DAL is the only module that issues SQL** (STO-03 + CLAUDE.md). Every new query goes in `src/lib/db/` or its new `queries/` subfolder (D-06). `+page.server.ts` load functions import and call typed DAL functions; they never contain SQL strings. A `tests/unit/db/dal-boundary.test.ts` already exists and must remain green.
- **Single date producer at `src/lib/shared/dates.ts`** (STO-04 + CLAUDE.md). No `new Date().toISOString().slice(0,10)` anywhere in Phase 2. Any new date math (add/subtract days, parse, clamp, ISO-week key, month key, PT start/end-of-week) must live in this file. A `tests/unit/shared/dates-boundary.test.ts` bans the forbidden idiom.
- **Per-angler metric mandates (CLAUDE.md non-negotiable #4):** always a **derived boat-aggregate average**, never individual attribution. Trip-type segmentation is **mandatory** — cross-trip-type per-angler comparison must be impossible in the UI (picker enforces single trip-type via D-10; compare + trends enforce single trip-type via D-24, D-26). Disclaimer is **inline, not tooltip-only**. `/about` page linked from **every** per-angler number via the shared `<PerAnglerMetric>` component.
- **Domain language verbatim** — trip types / landing names / species names flow through to the UI exactly as they appear in source HTML (they're already stored verbatim from Phase 1 D-03/D-05/D-08).
- **Anti-features (never build):** no individual-angler attribution, no social feed, no comments, no leaderboards, no ML bite-time, no push/SMS, no mandatory login, no booking/payment, no GPS spots, no AI reports, no "ON FIRE" / hype badges (the `n<5` "low data" flag is the ONLY state-signaling badge allowed in Phase 2), no sponsored slots, no fake-precision decimals, no manual-scrape-trigger UI, no non-SD data.
- **Polite scraping rules** — not directly Phase 2 scope (no new scraping), but the seed script (D-33) must NOT make live fetches; it replays committed HTML fixtures only. Per-row source-site links (D-22) are display-only anchors; clicking them sends the user to the source, not FishCount.
- **Silent-failure rules** — BRW-03 "Last scraped at" and BRW-04 "provisional" badge are the UI surface of Phase 1's silent-failure defenses. These must appear on every data-showing page so users can self-detect staleness.
- **Forecast honesty** — Phase 3 concern. Phase 2 renders historical averages without prediction intervals; the `n<5` "low data" flag is the Phase 2 equivalent of forecast refusal. D-15: keep the heatmap's `[{date, value, n}]` shape stable so Phase 3 can swap the source without rewriting the component.

## User Constraints (from CONTEXT.md)

### Locked Decisions

Copied verbatim from `02-CONTEXT.md` `<decisions>` section. These are binding — plans must conform, not re-argue.

**Routing / IA (D-01, D-02):**
- `/` — today's per-boat counts (BRW-01..04)
- `/date/[YYYY-MM-DD]` — per-date view (BRW-05); prev/next + native date picker
- `/picker` — trip picker (TRP-01..09); filters in query string; table + heatmap on one page
- `/boats/[id]` — boat detail (BOAT-01/02); numeric ID keyed on `boats.id` surrogate PK
- `/compare` — 2–3 boat side-by-side within a single trip type (TRN-03)
- `/trends` — weekly/monthly aggregation charts (TRN-01, TRN-02)
- `/about` — "About the data" static page (BRW-09)
- All routes public, anonymous, SSR via `+page.server.ts`.

**Data-loading pattern (D-03, D-04, D-05):**
- Every data page uses `+page.server.ts` `load()` functions that call DAL directly in-process (better-sqlite3 singleton).
- No `/api/*` routes for reads. No internal fetch hops.
- ECharts is the ONLY client-only surface — server passes pre-shaped JSON to a `<Chart>` Svelte component that dynamic-imports `echarts` in `onMount`.
- Filter state lives in `$page.url.searchParams`. No stores, no cookies, no localStorage.

**DAL extension (D-06, D-07):**
- New subfolder `src/lib/db/queries/` for cross-table read compositions.
- Suggested modules: `queries/browse.ts`, `queries/tripPicker.ts`, `queries/boatDetail.ts`, `queries/trends.ts`, `queries/compare.ts`. Exact filenames at planner discretion.

**Ranking metric (D-08, D-09, D-10):**
- "Avg fish/angler" = weighted yield `SUM(species_count) / SUM(angler_count)` over matched trips (NOT mean of ratios).
- `n` = count of distinct `(source_date, trip_type)` tuples per boat in the matched window.
- Trip type is a **required** filter on the picker (TRP-05). Default: most-common trip type in the current dataset at page-load.

**Date semantics in picker (D-11, D-12):**
- Single target date + "± days" window (default 3, range 0–14) is the default.
- "Use date range" toggle switches to explicit `fromDate`/`toDate`.
- For future target dates, window is expanded to same-month/day across prior years.

**Calendar heatmap (D-13, D-14, D-15):**
- 30 days starting at the selected target date (or `fromDate` in range mode).
- Past dates = per-day actual aggregate; future dates = historical same-month-day average across prior years.
- `n<5` cells render gray via ECharts `itemStyle` (bypasses visualMap).
- Colorblind-safe viridis-like palette. Always-visible legend with "fish/angler" unit. No red/green.
- Phase 3 will swap the data source to `forecasts` — keep the 30-tuple `[{date, value, n}]` interface stable.

**Per-angler metric framing (D-16, D-17):**
- Reusable component `src/lib/components/PerAnglerMetric.svelte`.
- Props: `{ value: number; nTrips: number; ctx?: 'row' | 'card' | 'hero' }`.
- Integer or one-decimal display (never ≥2 decimals). Unit "fish/angler".
- Inline "derived boat-aggregate average" framing on first use per page + link to `/about`.
- "low data" badge when `nTrips < 5`.
- `n=X trips` always visible.
- `/about` page content includes: source, scrape cadence (nightly 23:00 PT), per-angler meaning, trip-type semantics, `n` thresholds, data-gap handling, contact pointer.

**URL state (D-18, D-19):**
- All filter state lives in `$page.url.searchParams`.
- Typed helper `src/lib/shared/urlState.ts` exposes parse + serialize per route's filter shape.
- Filter changes call `goto(url, { keepFocus: true, replaceState: true, noScroll: true })`.

**Provisional badge (D-20, D-21):**
- `source_date === today()` PT → provisional; past dates → final (no badge).
- "Last scraped at [time PT]" reads from `scrape_runs.finished_at` (most recent `success`/`empty`).

**Source-site attribution (D-22, D-23):**
- Per-row source link: `https://www.sandiegofishreports.com/dock_totals/boats.php?date=YYYY-MM-DD` (verified in `src/lib/scraper/fetcher.ts`).
- Per-boat source link reads `boats.source_url`; fallback to landing page if null. Same for `landings.source_url`.

**Comparison page (D-24, D-25):**
- Required controls: single trip-type selector, date-range picker (default last 30 days), boat multi-select (2–3).
- Layout: side-by-side columns per boat + ECharts multi-series weekly line.

**Trend chart (D-26, D-27):**
- Required filters: species, trip-type. Optional: single boat.
- Time range presets: 3mo / 6mo / 1y / all (default 1y).
- Granularity: weekly (default ≤6mo) or monthly (default >6mo).
- Buckets: ISO week (Mon–Sun) in PT, or calendar month PT.
- Gap-aware: zero-trip buckets render as a gap (NOT zero).
- No "N of M days" annotation — that's Phase 3.

**"Why this boat?" panel (D-28):** expandable per-row; content: n trips, weighted avg, last trip date, best-day in window, filter recap in plain English, link to boat detail. No extra fetches — all data already in the loader result.

**Caching (D-29, D-30):**
- `/` today: `max-age=60`
- `/date/[past]`: `max-age=86400`
- `/picker`, `/trends`, `/compare`, `/boats/[id]`: `max-age=300`
- `/about`: `max-age=3600`
- Past-vs-today split: `source_date < today()` → past cache.

**Mobile (D-31):** mobile-first Tailwind; 375px baseline. Top nav = 4–5 inline links (Home, Picker, Trends, Compare, About). No hamburger. Data tables use `overflow-x-auto` container at narrow viewports.

**Chart contract (D-32):** single `<Chart>` component at `src/lib/components/Chart.svelte`. Props: `{ option: EChartsOption; height?: string; theme?: 'light' }`. Dynamic-import only the chart types and components used (line, heatmap, calendar, tooltip, grid, visualMap).

**Dev seed (D-33, D-34):** `scripts/seed-dev-db.ts` (tsx runner) replays committed HTML fixtures from `tests/fixtures/scraper/*.html` through `parsePage` + DAL upsert. Rotates fixtures across synthetic dates to populate ~16 months of trends/heatmap data. Gated by `NODE_ENV !== 'production'`.

### Claude's Discretion

- Exact filenames under `src/lib/db/queries/` — planner decides per query complexity.
- Svelte component decomposition beyond `<PerAnglerMetric>` + `<Chart>` (e.g. `<FilterBar>`, `<BoatRow>`) — planner decides from observed duplication.
- Exact viridis palette hex values — planner picks; ECharts built-in or custom ramp both acceptable.
- Whether heatmap's 30 future cells use same-month-day-historical-mean OR simpler rolling-historical aggregate — planner picks whichever is simpler and honest at the `n<5` boundary.
- Whether to install Tailwind `@tailwindcss/typography` plugin for `/about` prose styling — planner decides.
- Whether `/boats/[id]` uses numeric ID or human slug — planner decides (numeric is simpler; stable across source-side renames).

### Deferred Ideas (OUT OF SCOPE)

- Statistical projections / prediction intervals / `n<5` refusal / forecast-colored heatmap cells → Phase 3 (FCT-01..07)
- Email alerts / signup / double opt-in → Phase 4 (ALT-01..12)
- Loading / empty / error-state polish; rockfish closed-season message; contact pointer on errors → Phase 5 (POL-01..03)
- Median / trimmed-mean toggle on per-angler (V1X-03)
- Same-week-last-year overlay on trends (V1X-01)
- Species seasonality cheatsheet (V1X-02)
- Distribution / range view alongside top counts (V1X-04)
- CSV / JSON export of filtered query (V1X-05)
- Landing locator map (V2-03)
- Boat slug URLs instead of numeric IDs
- In-app caching layer (LRU / ETag)
- Horizontal nav hamburger / mobile drawer
- Gap annotations on trend chart ("based on N of M weeks") — Phase 3 (CLAUDE.md #3)
- Service Worker / PWA / offline mode
- `@tailwindcss/typography` plugin — planner-discretionary

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BRW-01 | Home lists today's per-boat rows (boat, landing, trip type, anglers, species, counts) | `queries/browse.ts::getRowsForDate(today())` joins `catch_reports × boats × landings` returning display_name + source_url; SSR in `src/routes/+page.server.ts` (D-03) |
| BRW-02 | Every row links back to source-site page | Per-row link format verified in `src/lib/scraper/fetcher.ts`: `https://www.sandiegofishreports.com/dock_totals/boats.php?date=YYYY-MM-DD` (D-22). Per-boat link reads `boats.source_url` populated by Phase 1 parser |
| BRW-03 | "Last scraped at [time PT]" indicator on every data page | New DAL fn `scrapeRuns.latestSuccessOrEmpty()` returning `finished_at` of latest `outcome IN ('success','empty')` row; formatted via extended `dates.ts::toPtTimeLabel(iso)` |
| BRW-04 | "Provisional — boats still reporting" badge during reporting window | `source_date === today()` PT → badge (D-20). `today()` already exists in `dates.ts` |
| BRW-05 | Date navigation to any past date | `/date/[date]` route; prev/next computed via new `dates.ts::addDays(iso, n)` + clamp to dataset bounds; native `<input type="date">` for picker |
| BRW-06 | Verbatim filter labels | Trip types / landings / species already stored verbatim in `catch_reports` (Phase 1 D-05, D-03, D-08). New DAL fns `queries/browse.ts::distinctTripTypes()`, `distinctLandings()`, `distinctSpecies()` for filter-bar options |
| BRW-07 | Filter state in URL (shareable) | `$page.url.searchParams` read in load(); typed `src/lib/shared/urlState.ts` helper (D-18) |
| BRW-08 | 375px viewport usable, no horizontal page scroll | Tailwind mobile-first `overflow-x-auto` wrapper around tables; inline 4–5-link nav (D-31) |
| BRW-09 | "About the data" page | `/about/+page.svelte` static content. Linked from every `<PerAnglerMetric>` (D-17) |
| TRP-01 | Target date (or range) + target species → ranked boats | New DAL fn `queries/tripPicker.ts::rankBoatsForQuery({date, species, tripType, windowDays})`; default single-date + ±3 days window (D-11) |
| TRP-02 | Ranking = avg fish/angler on matching trip type, not raw totals | `SUM(species_count)*1.0/SUM(angler_count)` weighted average (D-08) — verified working in project's SQLite 3.53 |
| TRP-03 | Each ranked result shows n, avg, last trip date, trip type | Query returns `{ boat_id, display_name, landing, avg_per_angler, n_trips, last_trip_date, trip_type }` |
| TRP-04 | Results prominently label "avg fish/angler — boat aggregate, not individual" | `<PerAnglerMetric>` component enforces inline framing (D-16) |
| TRP-05 | Trip type is required filter | UI refuses submit without it (D-10); server load function returns 400-like state with guidance if missing |
| TRP-06 | Expandable "Why this boat?" explanation | Client-side toggle; all data in loader result (D-28) |
| TRP-07 | Boats with n<5 shown with "low data" flag, not hidden | `<PerAnglerMetric>` renders "low data" badge when `nTrips < 5` (D-16); picker does NOT filter these out |
| TRP-08 | 30-day calendar heatmap of same query | New DAL fn `queries/tripPicker.ts::heatmapForQuery({fromDate, toDate, species, tripType})` returning 30× `{date, value, n}` tuples (D-13); rendered by `<Chart>` with `coordinateSystem: 'calendar'` |
| TRP-09 | Insufficient-data cells render gray | Per-cell `itemStyle: { color: '#888' }` on tuples with `n < 5` (D-14) — itemStyle has higher priority than visualMap in ECharts ≥5.0 (verified on echarts handbook) |
| BOAT-01 | Boat detail page with recent trips, season totals, trip types | New DAL fn `queries/boatDetail.ts::getBoatProfile(boatId)` — recent 20 trips, season-to-date aggregate, distinct trip types this boat runs |
| BOAT-02 | Boat detail links to landing and source-site boat page | `boats.source_url` (populated by Phase 1 parser, COALESCE-preserved on upsert); fallback to `landings.source_url` (D-23) |
| TRN-01 | Trend chart: species-catch over time (weekly/monthly) with species+trip-type filter | `queries/trends.ts::speciesTrend({species, tripType, granularity, range})` — SQL `strftime('%V-%G', source_date)` or `strftime('%Y-%m', source_date)` with weighted SUM/SUM (verified D-27) |
| TRN-02 | Trend chart: boat-performance over time (avg fish/angler) in trip type | `queries/trends.ts::boatTrend({boatId, species, tripType, granularity, range})` |
| TRN-03 | Compare 2–3 boats side-by-side across date range in same trip type | `queries/compare.ts::compareBoats({boatIds, fromDate, toDate, tripType})` (D-25) |

## Standard Stack

All versions verified against npm registry on 2026-04-24. Everything except `date-fns` (and optionally `@tailwindcss/typography`) is already installed.

### Core (already installed)

| Library | Installed / Latest | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @sveltejs/kit | ^2.57.1 (latest 2.58.0) | SSR framework, `+page.server.ts` load pattern, `goto()`, `setHeaders()` | Already wired; Phase 1 uses it [VERIFIED: `package.json`] |
| svelte | ^5.55.4 (latest 5.55.5) | Runes ($state, $derived, $effect), client interactivity | Svelte 5 is required for SvelteKit ≥2.20 [VERIFIED: npm view] |
| @sveltejs/adapter-node | ^5.2.0 | Build as Node server, supports in-process DB + scheduler | Phase 0/1 lock-in |
| better-sqlite3 | ^12.9.0 | Synchronous SQLite driver; ships SQLite 3.53.0 | `select sqlite_version()` → 3.53.0 verified [VERIFIED: local Bash] |
| tailwindcss | ^4.2.4 | Utility-first styling, mobile-first defaults | `@tailwindcss/vite` plugin already wired |
| @tailwindcss/vite | ^4.2.4 | Tailwind 4 Vite plugin | Phase 0 |
| zod | ^4.3.6 | Runtime validation (may validate URL-state in `urlState.ts`) | Already used by Phase 1 parser |
| pino | ^10.3.1 | Structured logging; `event.locals.logger` request-scoped child | Phase 0; used by Phase 1 pipeline |
| tsx | ^4.21.0 (devDep) | Run TypeScript scripts (seed, backfill) directly | Phase 1 backfill already uses it |
| vitest | ^2.1.0 (devDep) | Test runner; `tests/**/*.{test,spec}.{js,ts}` glob; `$lib` alias wired | Phase 1 test pattern |

### Add for Phase 2

| Library | Pin to | Purpose | When to Use |
|---------|--------|---------|-------------|
| echarts | ^6.0.0 | Charts + calendar heatmap (only mainstream lib with native `coordinateSystem: 'calendar'`) [VERIFIED: npm view; 6.0.0 released] | Every chart page (`/trends`, `/picker` heatmap, `/compare`). Dynamic-import inside `<Chart>`'s `onMount` so chart JS is not in SSR bundle |
| date-fns | ^4.1.0 (latest) [VERIFIED: npm view] | ISO-week + month utilities Node-side for gap-filling empty buckets on trend charts (SQL groups only rows that exist; gap detection needs iteration over the full expected bucket sequence) | `queries/trends.ts` after SQL returns present buckets, iterate expected buckets via date-fns, insert `null` for missing — produces gap discontinuity in ECharts line (D-27) |

### Optional (planner discretion per CONTEXT.md)

| Library | Pin to | Purpose | Notes |
|---------|--------|---------|-------|
| @tailwindcss/typography | ^0.5.19 [VERIFIED: npm view] | Prose styling for `/about` page | Only if planner decides default Tailwind styles aren't enough for readable long-form content |

### NOT adding

- **drizzle-orm / drizzle-kit** — CLAUDE.md Phase 1 decision locked raw better-sqlite3 prepared statements. Query complexity in Phase 2 (weighted yields, GROUP BY, HAVING, ISO-week buckets) is within raw-SQL comfort zone; adding Drizzle now trades 10 new queries of simplicity for a new abstraction layer and migration story.
- **svelte-echarts wrapper** — CONTEXT.md specifies a hand-rolled `<Chart>` at `src/lib/components/Chart.svelte` because we only need a single thin init/dispose wrapper and we want to control which ECharts modules are imported for bundle size. Wrappers add a dep for minimal savings.
- **sveltekit-search-params / similar URL-state helpers** — D-18 specifies a project-local `src/lib/shared/urlState.ts` with typed parse/serialize per route shape. Third-party helpers add API surface and lock-in; our filter shapes are small enough for hand-written helpers.
- **Testing-library / Playwright for component tests** — Phase 2's verification strategy relies on in-memory SQLite fixture tests for load functions (matches Phase 1 pattern) + manual UAT for UI rendering. E2E browser testing is Phase 5 polish scope.

**Installation for Phase 2:**
```bash
npm install echarts@^6.0.0 date-fns@^4.1.0
# optional, planner's call:
# npm install -D @tailwindcss/typography@^0.5.19
```

## Architecture Patterns

### System Architecture Diagram

```
     ┌─────────────────────────────────────────────────────────────────┐
     │                       Browser (HTML + minimal JS)               │
     │   ┌──────────────────┐     ┌──────────────────────────────┐    │
     │   │ Filter bar       │──┬──│ <Chart> (echarts dynamic-    │    │
     │   │ (Svelte 5 runes) │  │  │   import onMount, client only)│    │
     │   └────────┬─────────┘  │  └──────────────────────────────┘    │
     │            │            │  (data already shaped server-side)   │
     │            ▼            │                                      │
     │   goto(url?filters, { replaceState })                          │
     └────────────┬────────────────────────────────────────────────────┘
                  │  URL is the source of truth for filter state
                  ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │         SvelteKit server (SSR, Node, adapter-node)              │
     │                                                                 │
     │   hooks.server.ts (existing) — requestId + event.locals.logger │
     │              │                                                  │
     │              ▼                                                  │
     │   +page.server.ts  load({ url, setHeaders, locals })           │
     │     ├─ setHeaders({ 'cache-control': ... })        ◄─ D-29     │
     │     ├─ parseFilters(url.searchParams) ── urlState.ts           │
     │     └─ await queries/<module>.<fn>(...)            ◄─ D-06     │
     │                  │                                             │
     │                  ▼                                             │
     │   ┌─────────────────────────────────────────────────────┐     │
     │   │       src/lib/db/queries/ (NEW — cross-table)        │    │
     │   │   browse.ts · tripPicker.ts · boatDetail.ts ·        │    │
     │   │   trends.ts · compare.ts                             │    │
     │   └──────────────┬──────────────────────────────────────┘     │
     │                  │ (only surface that issues SQL — STO-03)    │
     │                  ▼                                             │
     │   ┌─────────────────────────────────────────────────────┐     │
     │   │   src/lib/db/client.ts (Phase 1)  ·  better-sqlite3 │    │
     │   │   journal_mode=WAL · synchronous=NORMAL · FK=ON     │    │
     │   └──────────────┬──────────────────────────────────────┘     │
     │                  ▼                                             │
     │        SQLite file (/data/fishcount.sqlite3)                  │
     │        tables: catch_reports, boats, landings,                │
     │                scrape_runs, parse_failures                    │
     │        indexes: (source_date, species), (boat_id, source_date),│
     │                 UNIQUE(source_date, boat_id, trip_type, species)│
     └─────────────────────────────────────────────────────────────────┘
                         ▲
                         │ nightly 23:00 PT tick (Phase 1; unchanged)
                         │
                ┌────────┴──────────┐
                │  croner scheduler │
                └───────────────────┘
```

**Key data flow (today's page at `/`):**
1. GET `/` → hooks.server.ts attaches request logger
2. `src/routes/+page.server.ts::load({ url, setHeaders, locals })` runs
3. `setHeaders({ 'cache-control': 'public, max-age=60' })`
4. `const today = today()` from `src/lib/shared/dates.ts`
5. `const rows = await browse.getRowsForDate(getDb(), today)` — joins catch×boats×landings
6. `const lastScrape = await scrapeRuns.latestSuccessOrEmpty(getDb())`
7. Return `{ rows, lastScrape, today, isProvisional: true }`
8. `+page.svelte` renders — includes `<PerAnglerMetric>` wherever a fish/angler number appears, passes `rows` to a plain `<table>` (no ECharts on `/` — just data)

### Recommended Project Structure

```
src/
├── lib/
│   ├── components/                       # NEW
│   │   ├── PerAnglerMetric.svelte        # D-16; props { value, nTrips, ctx }
│   │   ├── Chart.svelte                  # D-32; props { option, height?, theme? }
│   │   ├── FilterBar.svelte              # planner discretion; likely composable
│   │   ├── ProvisionalBadge.svelte       # D-20 thin wrapper; reused on /, /date/today
│   │   └── LastScrapedLabel.svelte       # D-21 thin wrapper; reused everywhere
│   ├── db/
│   │   ├── client.ts                     # existing
│   │   ├── migrations.ts                 # existing
│   │   ├── boats.ts                      # existing — add getByIdWithLanding(id)
│   │   ├── landings.ts                   # existing
│   │   ├── catchReports.ts               # existing
│   │   ├── scrapeRuns.ts                 # existing — add latestSuccessOrEmpty()
│   │   ├── parseFailures.ts              # existing
│   │   └── queries/                      # NEW — cross-table compositions (D-06)
│   │       ├── browse.ts                 # getRowsForDate, distinctTripTypes, etc.
│   │       ├── tripPicker.ts             # rankBoatsForQuery, heatmapForQuery
│   │       ├── boatDetail.ts             # getBoatProfile, recentTrips
│   │       ├── trends.ts                 # speciesTrend, boatTrend
│   │       └── compare.ts                # compareBoats
│   └── shared/
│       ├── dates.ts                      # existing — extend with addDays, isoWeekKey,
│       │                                 #   monthKey, clamp, isoDateToday's-provisional?
│       └── urlState.ts                   # NEW — typed parse/serialize per route (D-18)
├── routes/
│   ├── +layout.svelte                    # NEW — top nav (Home/Picker/Trends/Compare/About)
│   ├── +page.svelte                      # REPLACE placeholder with today-view
│   ├── +page.server.ts                   # NEW — load() returns today's rows
│   ├── date/
│   │   └── [date]/
│   │       ├── +page.svelte
│   │       └── +page.server.ts
│   ├── picker/
│   │   ├── +page.svelte
│   │   └── +page.server.ts
│   ├── boats/
│   │   └── [id]/
│   │       ├── +page.svelte
│   │       └── +page.server.ts
│   ├── compare/
│   │   ├── +page.svelte
│   │   └── +page.server.ts
│   ├── trends/
│   │   ├── +page.svelte
│   │   └── +page.server.ts
│   ├── about/
│   │   └── +page.svelte                  # static; no +page.server.ts needed
│   └── healthz/+server.ts                # existing; unchanged
├── hooks.server.ts                       # existing; unchanged
└── app.d.ts                              # existing; unchanged
scripts/
├── backfill.ts                           # existing
└── seed-dev-db.ts                        # NEW — D-33, tsx-run, non-prod only
tests/
├── unit/
│   ├── db/                               # existing Phase 1
│   │   └── queries/                      # NEW
│   │       ├── browse.test.ts
│   │       ├── tripPicker.test.ts
│   │       ├── boatDetail.test.ts
│   │       ├── trends.test.ts
│   │       └── compare.test.ts
│   ├── shared/
│   │   ├── dates-boundary.test.ts        # existing — MUST stay green
│   │   └── urlState.test.ts              # NEW — round-trip property tests
│   └── routes/                           # NEW — load function tests
│       ├── home.test.ts
│       ├── date.test.ts
│       ├── picker.test.ts
│       ├── boats.test.ts
│       ├── compare.test.ts
│       └── trends.test.ts
└── helpers/
    ├── in-memory-db.ts                   # existing; reused for Phase 2 tests
    └── fixture-seed.ts                   # NEW — seed test DB from fixture HTML
```

### Pattern 1: SvelteKit SSR load function with DAL call + Cache-Control header

**What:** Every data page uses `+page.server.ts` with a `load()` function that reads URL state, calls a DAL query function, sets cache headers, and returns pre-shaped JSON. No client-side fetching for first paint.

**When to use:** Every route that displays data. (Every route in Phase 2 except `/about`.)

**Example:**
```ts
// src/routes/+page.server.ts
// Source: https://svelte.dev/docs/kit/load + CONTEXT.md D-03/D-20/D-21/D-29
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db/client';
import { getRowsForDate } from '$lib/db/queries/browse';
import { latestSuccessOrEmpty } from '$lib/db/scrapeRuns';
import { today } from '$lib/shared/dates';

export const load: PageServerLoad = async ({ setHeaders, locals }) => {
  const db = getDb();
  const targetDate = today();
  const rows = getRowsForDate(db, targetDate);
  const lastScrape = latestSuccessOrEmpty(db);

  // D-29: today's page caches 60s (still reporting)
  setHeaders({ 'cache-control': 'public, max-age=60' });

  locals.logger.info({ msg: 'home_loaded', date: targetDate, rowCount: rows.length });

  return {
    rows,
    lastScrape,
    date: targetDate,
    isProvisional: true // D-20: today is always provisional
  };
};
```

### Pattern 2: Weighted per-angler aggregation in SQL (D-08)

**What:** `SUM(species_count) * 1.0 / SUM(angler_count)` within the window. `* 1.0` forces SQLite to promote the division to floating-point (integer division would truncate). `n` counts distinct trips (NOT rows).

**When to use:** Every per-angler ranking/trend query (TRP-02, TRN-02, TRN-03, comparison columns).

**Example (ranking for picker):**
```sql
-- src/lib/db/queries/tripPicker.ts — used by rankBoatsForQuery
SELECT
  b.id                    AS boat_id,
  b.display_name          AS boat_name,
  l.display_name          AS landing_name,
  SUM(cr.species_count)*1.0 / SUM(cr.angler_count) AS avg_per_angler,
  COUNT(DISTINCT cr.source_date || '|' || cr.trip_type) AS n_trips,
  MAX(cr.source_date)     AS last_trip_date
FROM catch_reports cr
JOIN boats    b ON b.id = cr.boat_id
JOIN landings l ON l.id = cr.landing_id
WHERE cr.species   = @species
  AND cr.trip_type = @trip_type
  AND cr.source_date BETWEEN @from_date AND @to_date
GROUP BY b.id
ORDER BY avg_per_angler DESC;
```

Verified working in project's SQLite 3.53.0:
```
> db.prepare("SELECT d, SUM(c)*1.0/SUM(a) as avg FROM t GROUP BY d").all()
  → [ { d: '2024-01-15', avg: 5 }, { d: '2024-01-16', avg: 5 } ]
```

### Pattern 3: ISO-week bucketing with year-boundary correctness

**What:** SQLite's `strftime('%V', date)` returns ISO week number (1–53). Pair with `%G` — the ISO year, which can be the previous or next year for boundary weeks (e.g., 2024-12-30 is ISO week 01 of ISO-year 2025). `%Y-%W` is WRONG for ISO weeks (that's US week numbering).

**Verified:**
- `strftime('%V-%G', '2024-12-29')` → `52-2024`
- `strftime('%V-%G', '2024-12-30')` → `01-2025` ✓ (correct ISO-week year-boundary handling)

**Example (weekly trend):**
```sql
-- src/lib/db/queries/trends.ts — speciesTrend granularity='weekly'
SELECT
  strftime('%G-W%V', source_date) AS bucket_key,      -- e.g. "2024-W52"
  SUM(species_count)*1.0 / SUM(angler_count) AS avg_per_angler,
  COUNT(DISTINCT source_date || '|' || trip_type) AS n_trips
FROM catch_reports
WHERE species   = @species
  AND trip_type = @trip_type
  AND source_date BETWEEN @from_date AND @to_date
GROUP BY bucket_key
ORDER BY bucket_key;
```

**Gap-filling Node-side (D-27):** SQL returns ONLY buckets with rows. For the line-chart gap-discontinuity behaviour, iterate the expected bucket sequence with date-fns and insert `{bucket_key, value: null, n: 0}` for missing buckets. ECharts renders `null` as a gap.

```ts
// Node-side gap-fill
import { eachWeekOfInterval, format } from 'date-fns';
const expected = eachWeekOfInterval({ start: fromDate, end: toDate }, { weekStartsOn: 1 });
const presentKeys = new Set(sqlRows.map(r => r.bucket_key));
const filled = expected.map(d => {
  const key = format(d, "RRRR-'W'II"); // ISO year + week; matches SQL %G-W%V
  const row = sqlRows.find(r => r.bucket_key === key);
  return row ?? { bucket_key: key, avg_per_angler: null, n_trips: 0 };
});
```

### Pattern 4: ECharts calendar heatmap with per-cell gray override

**What:** ECharts ≥5.0 reversed visual-priority so `itemStyle` on a data item wins over `visualMap`. Use this to bypass the viridis gradient for `n<5` cells.

**When to use:** The 30-day heatmap on `/picker` (TRP-08, TRP-09).

**Example:**
```ts
// in Chart.svelte or inline on the picker page
import type { EChartsOption } from 'echarts';

const heatmapOption: EChartsOption = {
  tooltip: { position: 'top' },
  calendar: {
    range: [fromDate, toDate],      // 30-day window
    cellSize: ['auto', 20],
    yearLabel: { show: false },
    dayLabel: { nameMap: 'en' },
    monthLabel: { nameMap: 'en' }
  },
  visualMap: {
    min: 0,
    max: Math.max(1, ...cells.filter(c => c.n >= 5).map(c => c.value)),
    calculable: true,
    orient: 'horizontal',
    left: 'center',
    bottom: 0,
    inRange: { color: ['#440154', '#21908c', '#fde725'] }, // viridis-ish
    text: ['high', 'low']
  },
  series: {
    type: 'heatmap',
    coordinateSystem: 'calendar',
    data: cells.map(c =>
      c.n < 5
        ? { value: [c.date, c.value ?? 0], itemStyle: { color: '#999' } } // D-14 gray override
        : [c.date, c.value]
    )
  }
};
```

### Pattern 5: URL-state round-trip with `goto()` + typed helper

**What:** Single source of truth = `url.searchParams`. One typed helper per route's filter shape. `goto(newUrl, { replaceState: true, noScroll: true, keepFocus: true })` triggers the server load to re-run (load functions that read `url` are re-invoked — verified behaviour [CITED: kit#9390]).

**Example:**
```ts
// src/lib/shared/urlState.ts (outline)
import { z } from 'zod';

const PickerFilters = z.object({
  date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  species:    z.string().min(1),
  tripType:   z.string().min(1),
  windowDays: z.coerce.number().int().min(0).max(14).default(3),
  rangeMode:  z.enum(['single', 'range']).default('single'),
  toDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});
export type PickerFilters = z.infer<typeof PickerFilters>;

export function parsePickerFilters(sp: URLSearchParams): PickerFilters | null {
  const raw = Object.fromEntries(sp.entries());
  const result = PickerFilters.safeParse(raw);
  return result.success ? result.data : null;
}

export function serializePickerFilters(f: PickerFilters): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined) sp.set(k, String(v));
  return sp;
}
```

```svelte
<!-- picker/+page.svelte (outline) -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { serializePickerFilters, type PickerFilters } from '$lib/shared/urlState';

  let { data } = $props(); // from +page.server.ts
  let filters = $state<PickerFilters>(data.filters);

  function apply() {
    const sp = serializePickerFilters(filters);
    goto(`?${sp.toString()}`, { replaceState: true, noScroll: true, keepFocus: true });
  }
</script>
```

### Pattern 6: `<Chart>` wrapper with dynamic import + tree-shaken ECharts modules

**What:** Single Svelte component owns chart lifecycle (init/dispose). Dynamically imports only the ECharts modules needed for the chart types this phase uses (line, heatmap + calendar, tooltip, grid, visualMap, canvas renderer) — skips bar, pie, radar, scatter, etc. ECharts' tree-shakeable interface is documented at [CITED: apache.github.io/echarts-handbook/en/basics/import/].

**Example:**
```svelte
<!-- src/lib/components/Chart.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { EChartsOption } from 'echarts';

  let { option, height = '320px', theme = 'light' } = $props<{
    option: EChartsOption; height?: string; theme?: 'light';
  }>();

  let chartEl: HTMLDivElement;
  let chart: any = null;

  onMount(async () => {
    // Dynamic import — keeps ~800kb of echarts out of the SSR bundle
    const [{ use, init }, { LineChart, HeatmapChart }, components, { CanvasRenderer }] =
      await Promise.all([
        import('echarts/core'),
        import('echarts/charts'),
        import('echarts/components'),
        import('echarts/renderers')
      ]);
    use([
      LineChart,
      HeatmapChart,
      components.TooltipComponent,
      components.GridComponent,
      components.VisualMapComponent,
      components.CalendarComponent,
      components.LegendComponent,
      CanvasRenderer
    ]);
    chart = init(chartEl, theme);
    chart.setOption(option);

    const ro = new ResizeObserver(() => chart?.resize());
    ro.observe(chartEl);

    return () => { ro.disconnect(); chart?.dispose(); chart = null; };
  });

  $effect(() => {
    if (chart) chart.setOption(option, true);
  });
</script>

<div bind:this={chartEl} style="width:100%;height:{height}"></div>
```

### Pattern 7: Svelte 5 runes with URL as source of truth (no stores)

**What:** State lives in URL. Load function returns parsed filters. Client keeps a local `$state` copy only for input-responsiveness; `goto()` writes back to URL; server re-runs load; new data flows in via `$props()`.

**Gotcha:** `page.url.searchParams` is NOT reactive-writable. You can `$derived` from it for read, but you commit via `goto()` — do not try to mutate `searchParams` directly [CITED: sveltejs/kit#13746].

### Anti-Patterns to Avoid

- **SQL in `+page.server.ts` load functions.** Fails `tests/unit/db/dal-boundary.test.ts`; violates STO-03. Every query goes through `src/lib/db/queries/` or the existing per-table repositories.
- **Per-request live aggregation instead of precomputation.** Phase 2 is allowed to live-query because the dataset is small (one nightly scrape, years of history = low-millions rows) and HTTP cache (D-29) absorbs repeat reads. Phase 3 will move forecasts to a precomputed table; Phase 2 must NOT block that move (keep the heatmap's 30-tuple shape stable per D-15).
- **Inline `new Date().toISOString().slice(0,10)` in load functions or components.** Forbidden by `tests/unit/shared/dates-boundary.test.ts`. Extend `src/lib/shared/dates.ts` with helpers (see Standard Stack § "Date helpers to add").
- **Using `%W` for ISO week.** `%W` is Monday-based US week number; ISO week is `%V` + `%G`. Verified in project SQLite 3.53.0.
- **Storing filter state in Svelte stores or localStorage.** D-18 mandates URL-only. Makes the filter "shareable via link" (BRW-07).
- **Cross-trip-type per-angler comparisons in UI.** CLAUDE.md non-negotiable #4. Every per-angler surface MUST be filtered to a single trip type — picker (D-10), compare (D-24), trends (D-26). A plan-check grep should fail on any per-angler UI path that doesn't show a single trip-type filter.
- **Rendering per-angler numbers without `<PerAnglerMetric>`.** Disclaimer is mandatory. A plan-check grep of `*.svelte` for `fish/angler` or "per angler" text outside `<PerAnglerMetric>` should fail.
- **Tooltip-only disclaimers.** CLAUDE.md non-negotiable #4 explicitly says inline, not tooltip-only.
- **Red/green heatmap palette.** CLAUDE.md non-negotiable #3 + PITFALLS §UX. Use viridis-like.
- **"ON FIRE" badges or similar hype labels.** Anti-feature. The "low data" flag is the ONLY badge Phase 2 ships.
- **Hiding boats with `n<5`.** TRP-07 mandates showing them with the flag. Plan-checker should verify picker output does NOT filter by `HAVING n_trips >= 5`.
- **Integer-division truncation on `SUM/SUM`.** `SUM(count)/SUM(anglers)` in SQLite returns INTEGER if both sides are INTEGER. Use `* 1.0` or `CAST(... AS REAL)`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Calendar heatmap | Hand-rolled SVG grid with manual date-cell layout | ECharts `coordinateSystem: 'calendar'` | Recharts and Chart.js don't ship one [VERIFIED: STACK.md + recharts#237]; the calendar component handles month labels, DST, year-spanning ranges |
| Reactive URL search params in Svelte 5 | `$state` that tries to two-way-bind `$page.url.searchParams` | `goto()` for writes; read via `$props().filters` returned from load(), optionally mirror to local `$state` for input responsiveness | `page.url.searchParams` is not reactively writable in SvelteKit 2 [CITED: kit#13746] |
| ISO-week computation | Hand-rolled week-number logic | `strftime('%V-%G', date)` in SQL (verified on project SQLite 3.53.0); `date-fns` `eachWeekOfInterval` + `format('RRRR-\'W\'II')` for Node-side gap-filling | Both sides produce the same bucket keys; year-boundary corner cases (2024-12-30 = 2025-W01) are handled correctly |
| Date math (add/subtract days, clamp, is-past, is-today) | Scattered `Date` arithmetic in route files | Extend `src/lib/shared/dates.ts` (sole date producer) | STO-04 invariant; boundary test would fail |
| Mobile-responsive table | Hand-crafted `display: block` media queries or JS-based column hiding | Tailwind `overflow-x-auto` container on narrow; full table on `md:` and up (D-31) | [CITED: tailwindcss.com/docs/overflow]; standard pattern; one utility |
| Provisional/last-scraped UI logic | Recomputing in every page | Two tiny shared components (`<ProvisionalBadge>`, `<LastScrapedLabel>`) sourcing from page data | D-03 says loaders pre-compute; D-20/D-21 give the rules |
| Gap detection on time-series | Checking for missing dates manually in every query | Node-side iterate expected buckets with date-fns; insert `null` for missing | Clean contract — SQL returns what exists, Node fills gaps; ECharts renders `null` as gap (D-27) |
| URL filter parse/serialize | Ad-hoc `URLSearchParams` reads in each load function | One typed helper per route in `src/lib/shared/urlState.ts` (D-18) with Zod validation | Centralizes type safety; round-trip property testable |
| Chart lifecycle (init, dispose, resize) | Per-page ECharts boilerplate | Single `<Chart>` at `src/lib/components/Chart.svelte` (D-32) | One init/dispose bug to fix, not N |

**Key insight:** This phase is a wiring-and-composition phase. There is very little new code that isn't "call a DAL function, shape the result, pass to a Svelte component." The discipline is to keep the seams clean so Phase 3's forecast layer and Phase 4's alerts layer can bolt on without ripping out UI code.

## Date helpers to add to `src/lib/shared/dates.ts`

Phase 2 needs date math beyond the current `today()` / `toIsoDate()` / `currentPtMonth()`. All must live in `dates.ts` to honor STO-04. The boundary test bans `new Date().toISOString().slice(0,10)` but allows `Date.UTC` arithmetic on pre-existing date strings (pattern already proven in `scrapeRuns.ts::addOneDay`).

| Function | Signature | Purpose | Used by |
|----------|-----------|---------|---------|
| `addDays(iso, n)` | `(iso: string, n: number) => string` | Date math for prev/next + window expansion | `/date/[d]` prev/next; picker ± window; heatmap range end |
| `daysBetween(a, b)` | `(a: string, b: string) => number` | Inclusive day count between two ISO dates | Heatmap window sizing; range-mode validation |
| `clampDate(iso, min, max)` | `(iso, min, max) => string` | Clamp to dataset bounds | Prev/next navigation; range picker |
| `isToday(iso)` | `(iso: string) => boolean` | Provisional-badge rule (D-20) | `/` and `/date/[d]` |
| `isPast(iso)` | `(iso: string) => boolean` | Cache-header choice (D-30) | Every load function that sets cache headers |
| `isoWeekKey(iso)` | `(iso: string) => string` | ISO-week bucket key "YYYY-Www" | `queries/trends.ts` gap-filling |
| `monthKey(iso)` | `(iso: string) => string` | Calendar-month bucket key "YYYY-MM" | `queries/trends.ts` gap-filling |
| `startOfIsoWeekPT(iso)` | `(iso: string) => string` | Monday of the ISO-week containing iso, in PT | Trend gap-fill seed |
| `endOfIsoWeekPT(iso)` | `(iso: string) => string` | Sunday of the ISO-week containing iso, in PT | Trend gap-fill seed |
| `toPtTimeLabel(isoTs)` | `(iso: string) => string` | Format an ISO timestamp as "2026-04-24 11:37 PT" | `<LastScrapedLabel>` |

**Note:** These are PURE functions over already-formatted date strings. They do not call `new Date()` to derive "now" — that's what `today()` is for. The `dates-boundary.test.ts` in the repo should still pass; if it needs a small update to allow these new helpers while still banning the forbidden `.toISOString().slice(0,10)` idiom, the planner should include that in Phase 2 tasks.

## Runtime State Inventory

Phase 2 is not a rename/refactor/migration phase, but worth a brief runtime-state sanity check because it adds routes that read state Phase 1 writes:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | SQLite at `/data/fishcount.sqlite3`. Tables: `catch_reports`, `boats`, `landings`, `scrape_runs`, `parse_failures` (all Phase 1). Phase 2 READ-ONLY on all of them. | None — Phase 2 issues no writes to these tables. |
| Live service config | None — Phase 2 has no new external services. | None. |
| OS-registered state | None — no new cron entries, no new launchd plists, no new systemd units. Phase 1 scheduler (23:00 PT nightly scrape via croner inside the Node process) is unchanged. | None. |
| Secrets / env vars | None new. Phase 2 does not read `FIRST_SCRAPE_OK` or `SCRAPER_ENABLED`. `DB_PATH` (existing) is consumed via `src/lib/db/client.ts`. | None. |
| Build artifacts | SvelteKit will emit new routes into `build/` at deploy; that's standard. No stale artifacts expected. | Ensure `.svelte-kit/` and `build/` stay in `.gitignore` (already excluded by Phase 0). |

**Nothing found in 3 of 5 categories:** Verified by inspection — no new services, no new OS registrations, no new secrets.

## Common Pitfalls

### Pitfall 1: Per-angler metric leaks onto a page without `<PerAnglerMetric>`

**What goes wrong:** A developer renders "4.2 fish/angler" in a summary card or tooltip directly (not via the component), skipping the mandatory inline disclaimer and `/about` link. CLAUDE.md non-negotiable #4 violated.

**Why it happens:** Under deadline pressure, inline display looks convenient. The disclaimer feels "already said on the page."

**How to avoid:**
- Component is the only supported way to render a fish/angler number.
- Plan-check grep: `grep -rE 'fish/angler|per angler|per-angler' src/ | grep -v PerAnglerMetric.svelte` should return nothing except imports and the component's own usage.
- Every page using `<PerAnglerMetric>` must include a visible link to `/about` at least once per page (via first-occurrence metric).

**Warning signs:**
- Fish/angler number appears in a chart tooltip without a separate inline disclaimer.
- `/about` link only present in the footer.

### Pitfall 2: Cross-trip-type comparisons possible via URL tampering

**What goes wrong:** User crafts a URL like `/picker?tripType=` (empty) or submits a shortened URL that lacks trip type. Picker might silently fall back to "all trip types" → apples-to-oranges per-angler comparison.

**Why it happens:** Required-in-UI is not required-in-backend. URL state can arrive malformed.

**How to avoid:**
- `parsePickerFilters()` treats missing `tripType` as a parse failure and returns `null`.
- Load function responds with `{ filters: null, guidance: 'Trip type required' }` when parse fails — UI renders the picker form pre-focused on trip type, not results.
- Unit test: GET `/picker?date=2026-05-01&species=yellowtail` (no tripType) → load function returns guidance, NOT rankings.

### Pitfall 3: SQL integer-division truncates weighted average

**What goes wrong:** `SUM(species_count) / SUM(angler_count)` returns INTEGER when both columns are INTEGER. "3/4 = 0" instead of "0.75".

**How to avoid:**
- Always `SUM(species_count) * 1.0 / SUM(angler_count)` (or `CAST(... AS REAL)`).
- Unit test with fixture: boat with 3 fish across 4 anglers must return `0.75`, never `0`.

### Pitfall 4: ISO-week bucket key uses `%W` instead of `%V`

**What goes wrong:** `strftime('%W', '2024-12-30')` is US Monday-based week ordinal (53 or similar) while `strftime('%V', '2024-12-30')` is ISO week 01. Mixing them causes bucket keys to drift around new year.

**How to avoid:**
- Always pair `%V` with `%G` (ISO year, which shifts at week-01 boundaries).
- Canonical key format: `strftime('%G-W%V', date)` → `"2024-W52"`, `"2025-W01"`.
- Node-side must use matching format: `format(d, "RRRR-'W'II")` from date-fns.
- Unit test: 2024-12-29 bucket = "2024-W52"; 2024-12-30 bucket = "2025-W01".

### Pitfall 5: ECharts option mutation doesn't re-render

**What goes wrong:** Rebuilding `option` on filter change re-creates the object reference; `$effect` should trigger `chart.setOption(option, true)`. If you mutate in place (`option.series[0].data = ...`), Svelte 5 runes may not see the change.

**How to avoid:**
- Build a fresh `option` object on every filter change.
- Pass second arg `true` to `setOption()` — notMerge mode — to replace series data rather than merge/append.
- Unit: smoke-test at manual UAT that toggling trip type updates the chart without page reload.

### Pitfall 6: "Today" drift between server render and client display

**What goes wrong:** Server renders "today" at 23:59:59 PT on day X; client JS loads at 00:00:01 PT on day X+1; the client thinks it's a different day. Provisional badge status mismatches.

**How to avoid:**
- The server is the only source of "today" via `today()` in the load function. Pass `targetDate` + `isProvisional` explicitly to the client. Client does NOT recompute `today()`.
- HTTP `max-age=60` on the today-page (D-29) bounds the drift to 60s window.

### Pitfall 7: Seed script runs against production DB

**What goes wrong:** Operator runs `npm run seed` on the prod machine; fixture-derived fake data lands in live DB.

**How to avoid:**
- `scripts/seed-dev-db.ts` checks `process.env.NODE_ENV !== 'production'` at startup; refuses with a loud error otherwise (D-33).
- Also check `process.env.DB_PATH` — refuse if it equals production default `/data/fishcount.sqlite3` unless `ALLOW_SEED_ON_PROD_PATH=1` is explicitly set.
- Not added to `package.json` scripts under a name like `start` or `deploy` — name it `seed:dev` to make intent obvious.

### Pitfall 8: Bundle bloat from full ECharts import

**What goes wrong:** `import * as echarts from 'echarts'` pulls ~800kB of chart types this project never uses. Mobile 375px first paint slows.

**How to avoid:**
- Only import from `echarts/core`, `echarts/charts`, `echarts/components`, `echarts/renderers`.
- `use()` only: LineChart, HeatmapChart, TooltipComponent, GridComponent, VisualMapComponent, CalendarComponent, LegendComponent, CanvasRenderer.
- Dynamic import inside `<Chart>`'s `onMount` — keeps it out of SSR bundle entirely.

### Pitfall 9: Cache-Control collision with hooks

**What goes wrong:** `setHeaders({'cache-control': 'max-age=60'})` in load; hooks.server.ts also sets a global cache-control via `response.headers.set(...)` → SvelteKit errors ("cache-control already set") [CITED: kit docs].

**How to avoid:**
- Inspect `src/hooks.server.ts` — currently only sets `x-request-id`. No cache-control. Safe.
- Do NOT add cache-control to hooks; keep it load-function-scoped per D-29.

### Pitfall 10: `goto()` doesn't re-run load when URL delta is only a query param

**What goes wrong:** `goto('/picker?x=1')` from `/picker?x=0`: by default, SvelteKit optimizes and skips re-running load if load didn't `depends()` on `url`. You see stale data.

**How to avoid:**
- Load functions that read `url.searchParams` automatically track the dependency — SvelteKit re-runs them [CITED: kit#9390].
- But if you call `url` once and stash it in a variable and operate on query params via the variable, SvelteKit's tracking is still triggered by the initial `url.searchParams.get()` call.
- Safe default: treat every `+page.server.ts` that accepts URL filters as automatically re-running on filter change. Verify by unit test: set filter, read `data`, change filter, read `data` — different result.

## Code Examples

### DAL query: today's per-boat rows (BRW-01, BRW-02, BRW-03)

```ts
// src/lib/db/queries/browse.ts
import type Database from 'better-sqlite3';

export interface BrowseRow {
  boat_id: number;
  boat_name: string;       // display_name
  landing_name: string;
  trip_type: string;
  species: string;
  species_count: number;
  angler_count: number;
  boat_source_url: string | null;
  landing_source_url: string | null;
}

export function getRowsForDate(db: Database.Database, date: string): BrowseRow[] {
  return db.prepare(`
    SELECT
      b.id              AS boat_id,
      b.display_name    AS boat_name,
      l.display_name    AS landing_name,
      cr.trip_type      AS trip_type,
      cr.species        AS species,
      cr.species_count  AS species_count,
      cr.angler_count   AS angler_count,
      b.source_url      AS boat_source_url,
      l.source_url      AS landing_source_url
    FROM catch_reports cr
    JOIN boats    b ON b.id = cr.boat_id
    JOIN landings l ON l.id = cr.landing_id
    WHERE cr.source_date = ?
    ORDER BY l.display_name, b.display_name, cr.trip_type, cr.species
  `).all(date) as BrowseRow[];
}

export function distinctTripTypes(db: Database.Database): string[] {
  const rows = db.prepare(`
    SELECT DISTINCT trip_type FROM catch_reports ORDER BY trip_type
  `).all() as { trip_type: string }[];
  return rows.map(r => r.trip_type);
}

export function mostCommonTripType(db: Database.Database): string | null {
  const row = db.prepare(`
    SELECT trip_type FROM catch_reports
    GROUP BY trip_type
    ORDER BY COUNT(*) DESC
    LIMIT 1
  `).get() as { trip_type: string } | undefined;
  return row?.trip_type ?? null;
}
```

### DAL query: ranked boats for picker (TRP-01..07)

```ts
// src/lib/db/queries/tripPicker.ts
import type Database from 'better-sqlite3';

export interface RankedBoat {
  boat_id: number;
  boat_name: string;
  landing_name: string;
  avg_per_angler: number;
  n_trips: number;
  last_trip_date: string | null;
  trip_type: string;
}

export interface PickerQuery {
  fromDate: string;
  toDate: string;
  species: string;
  tripType: string;   // REQUIRED — TRP-05 / CLAUDE.md #4
}

export function rankBoatsForQuery(db: Database.Database, q: PickerQuery): RankedBoat[] {
  return db.prepare(`
    SELECT
      b.id                                                                       AS boat_id,
      b.display_name                                                             AS boat_name,
      l.display_name                                                             AS landing_name,
      SUM(cr.species_count) * 1.0 / SUM(cr.angler_count)                          AS avg_per_angler,
      COUNT(DISTINCT cr.source_date || '|' || cr.trip_type)                       AS n_trips,
      MAX(cr.source_date)                                                        AS last_trip_date,
      cr.trip_type                                                               AS trip_type
    FROM catch_reports cr
    JOIN boats    b ON b.id = cr.boat_id
    JOIN landings l ON l.id = cr.landing_id
    WHERE cr.species    = @species
      AND cr.trip_type  = @trip_type
      AND cr.source_date BETWEEN @from_date AND @to_date
    GROUP BY b.id, cr.trip_type
    ORDER BY avg_per_angler DESC, n_trips DESC
  `).all({
    from_date: q.fromDate,
    to_date:   q.toDate,
    species:   q.species,
    trip_type: q.tripType
  }) as RankedBoat[];
}

// TRP-08 heatmap data shape preserves Phase 3 swap contract (D-15):
export interface HeatmapCell {
  date: string;           // YYYY-MM-DD
  value: number | null;   // weighted avg fish/angler, null when no data at all
  n: number;              // n_trips; drives D-14 gray override
}

export function heatmapForQuery(
  db: Database.Database,
  q: { fromDate: string; toDate: string; species: string; tripType: string }
): HeatmapCell[] {
  const rows = db.prepare(`
    SELECT
      cr.source_date AS date,
      SUM(cr.species_count) * 1.0 / SUM(cr.angler_count) AS value,
      COUNT(DISTINCT cr.source_date || '|' || cr.trip_type) AS n
    FROM catch_reports cr
    WHERE cr.species    = @species
      AND cr.trip_type  = @trip_type
      AND cr.source_date BETWEEN @from_date AND @to_date
    GROUP BY cr.source_date
    ORDER BY cr.source_date
  `).all({ ...q, from_date: q.fromDate, to_date: q.toDate }) as HeatmapCell[];

  // Caller is responsible for filling missing dates with { value: null, n: 0 }
  // using dates.ts helpers (keeps this DAL function pure).
  return rows;
}
```

### DAL query: weekly trend with ISO-week bucketing (TRN-01)

```ts
// src/lib/db/queries/trends.ts
import type Database from 'better-sqlite3';

export interface TrendBucket {
  bucket_key: string;          // "2024-W52" or "2024-08"
  value: number | null;
  n_trips: number;
}

export function speciesTrendWeekly(
  db: Database.Database,
  q: { species: string; tripType: string; fromDate: string; toDate: string }
): TrendBucket[] {
  return db.prepare(`
    SELECT
      strftime('%G-W%V', source_date)                                 AS bucket_key,
      SUM(species_count) * 1.0 / SUM(angler_count)                     AS value,
      COUNT(DISTINCT source_date || '|' || trip_type)                 AS n_trips
    FROM catch_reports
    WHERE species     = @species
      AND trip_type   = @trip_type
      AND source_date BETWEEN @from_date AND @to_date
    GROUP BY bucket_key
    ORDER BY bucket_key
  `).all({ ...q, from_date: q.fromDate, to_date: q.toDate }) as TrendBucket[];
}

export function speciesTrendMonthly(
  db: Database.Database,
  q: { species: string; tripType: string; fromDate: string; toDate: string }
): TrendBucket[] {
  return db.prepare(`
    SELECT
      strftime('%Y-%m', source_date)                                   AS bucket_key,
      SUM(species_count) * 1.0 / SUM(angler_count)                     AS value,
      COUNT(DISTINCT source_date || '|' || trip_type)                 AS n_trips
    FROM catch_reports
    WHERE species     = @species
      AND trip_type   = @trip_type
      AND source_date BETWEEN @from_date AND @to_date
    GROUP BY bucket_key
    ORDER BY bucket_key
  `).all({ ...q, from_date: q.fromDate, to_date: q.toDate }) as TrendBucket[];
}
```

### Load-function test (Vitest + in-memory DB)

```ts
// tests/unit/db/queries/tripPicker.test.ts
import { describe, it, expect } from 'vitest';
import { openTestDb } from '../../../helpers/in-memory-db';
import { upsertBoatsAndLandings } from '$lib/db/boats';
import { upsertMany } from '$lib/db/catchReports';
import { rankBoatsForQuery } from '$lib/db/queries/tripPicker';

describe('rankBoatsForQuery (D-08 weighted per-angler)', () => {
  it('uses SUM/SUM not mean-of-ratios', () => {
    const db = openTestDb();
    const { boatIds, landingIds } = upsertBoatsAndLandings(db, [
      { source_name: 'Relentless', landing_source_name: "Fisherman's Landing" }
    ]);
    const boatId = boatIds.get('Relentless')!;
    const landingId = landingIds.get("Fisherman's Landing")!;

    // Relentless: 5 fish / 5 anglers (1.0), then 5 fish / 1 angler (5.0)
    // mean-of-ratios would be 3.0; SUM/SUM = 10/6 = 1.667
    upsertMany(db, [
      { source_date: '2024-07-01', boat_id: boatId, landing_id: landingId,
        trip_type: '1/2 Day AM', species: 'yellowtail',
        species_count: 5, angler_count: 5, scraped_at: '2024-07-02T00:00:00Z' },
      { source_date: '2024-07-02', boat_id: boatId, landing_id: landingId,
        trip_type: '1/2 Day AM', species: 'yellowtail',
        species_count: 5, angler_count: 1, scraped_at: '2024-07-03T00:00:00Z' }
    ]);

    const result = rankBoatsForQuery(db, {
      fromDate: '2024-07-01', toDate: '2024-07-02',
      species: 'yellowtail', tripType: '1/2 Day AM'
    });

    expect(result).toHaveLength(1);
    expect(result[0].avg_per_angler).toBeCloseTo(10 / 6, 3);
    expect(result[0].n_trips).toBe(2);
  });

  it('n is distinct-(date, trip_type), not row count', () => {
    // ... fixture with same (date, trip_type) for multiple species → n should be 1
  });
});
```

### Example source-site row link

Per D-22, BRW-02 links use the source's daily-page URL:

```svelte
<!-- in src/routes/+page.svelte — wired in +page.server.ts loader -->
<a href="https://www.sandiegofishreports.com/dock_totals/boats.php?date={data.date}"
   rel="noopener external" target="_blank">
  View on sandiegofishreports.com
</a>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Svelte 4 reactive statements `$:` | Svelte 5 runes `$state`, `$derived`, `$effect` | Svelte 5 (Oct 2024) | Project is already on 5.55 — new code must use runes, not `$:` |
| `$app/stores` (writable stores for `page`, `navigating`) | `$app/state` — reactive-by-default `page`, `navigating` | SvelteKit 2.12+ (early 2025) | Cleaner, compatible with runes; prefer in new code |
| `%W` for SQLite week grouping | `%V` + `%G` for ISO week + ISO year | SQLite 3.46+ (available in 12.9 ≥3.53) | Correct year-boundary handling |
| Full `import 'echarts'` | Tree-shaken `echarts/core` + selective `use()` | ECharts 5.0+ (2021) | 4–6× bundle savings; Phase 2 pattern |
| `visualMap` priority over `itemStyle` | `itemStyle` priority over `visualMap` | ECharts 5.0 (Jan 2021) | Enables D-14 per-cell gray override cleanly |
| Next.js / React app | SvelteKit + Svelte 5 | Project decision (STACK.md) | ~2–3× smaller JS bundle for equivalent UI |

**Deprecated/outdated:**
- Svelte 4 `<script>` top-level state + `$:` — do not mix with runes.
- Recharts, Chart.js (no native calendar heatmap) — rejected in STACK.md.
- `svelte-echarts` third-party wrapper — unnecessary; we hand-roll one thin `<Chart>`.
- `@app/stores` — still supported but `@app/state` is preferred for new code (CONTEXT.md doesn't force this; planner can pick either).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@tailwindcss/typography` current version is ^0.5.19 | Standard Stack | None — planner-discretionary install; if off, npm picks the latest on install |
| A2 | `date-fns` 4.x `format(d, "RRRR-'W'II")` produces keys matching SQLite's `strftime('%G-W%V', date)` format | Code Examples Pattern 3, Pitfall 4 | MEDIUM — if tokens differ, gap-filling bucket keys won't match SQL buckets and trends render incorrectly. Unit test must verify both sides agree on "2024-12-30" → "2024-W01" |
| A3 | Svelte 5 `$effect` with a rebuilt `option` object reliably triggers `chart.setOption(option, true)` | Code Examples Pattern 6, Pitfall 5 | MEDIUM — if runes don't see the new reference, chart appears stale on filter change. Needs smoke-test during implementation; fallback is a `key={filters}` on the `<Chart>` to force remount |
| A4 | SvelteKit 2.57 `goto(url, {replaceState:true,noScroll:true,keepFocus:true})` causes +page.server.ts load to re-run when url.searchParams differ | Architecture Pattern 1, 5 | LOW — kit#9390 documents this works when load reads `url.searchParams`. Verified via behaviour-test at implementation time |
| A5 | Phase 1's `boats.source_url` is populated for all boats the scraper has seen (not null for most production rows) | BOAT-02 mapping | LOW — even if sparse, the fallback to landing page covers it (D-23). Worth a spot-check against a seeded dev DB |
| A6 | Rendering a heatmap cell with `n_trips < 5` using `itemStyle.color: '#999'` overrides the visualMap gradient in ECharts 6.0 | Pattern 4, Pitfall | LOW — verified in ECharts docs (≥5.0 priority reversal). Visual spot-check at implementation |
| A7 | 1 year of fixture-seeded dev data is enough to exercise the heatmap, picker, and trend charts meaningfully | D-33 seed strategy | LOW — planner can bump to 2+ years if charts look thin |
| A8 | `strftime('%V-%G', source_date)` applied to stored `YYYY-MM-DD` strings in PT is equivalent to ISO-week-of-that-PT-date (no timezone shift because the stored string is already PT-correct per STO-04) | Pattern 3 | LOW — verified. Strings stored by dates.ts are already PT-local; strftime treats them as a naked date, no timezone applied |

**Nothing else assumed** — all other claims are either verified against npm/sqlite/grep in this session or cited to official docs.

## Open Questions

1. **Should the trends page allow filtering by boat without species?**
   - What we know: D-26 requires species + trip-type; boat is optional. But BOAT-01 boat-detail page already shows boat history.
   - What's unclear: Is `/trends?boatId=X&tripType=Y` without species a sensible view, or should it redirect to the boat-detail page?
   - Recommendation: Planner decides; default recommendation is to require species (matches D-26 literally) and let the boat detail page cover boat-only views.

2. **Heatmap future cells: same-month-day mean vs. simpler rolling aggregate?**
   - What we know: D-13 says "historical same-month-day average across all prior years for that species + trip_type"; D-14 low-data gray rule is non-negotiable.
   - What's unclear: If fewer than 2 prior years exist in the dataset, same-month-day averaging is effectively the raw historical value — may always fall into `n<5` gray. A rolling "last 14 same-week-of-year days" might produce more visible cells in a thin dataset.
   - Recommendation: Start with same-month-day mean. If the seeded dev DB shows the heatmap mostly gray, planner can pivot to a rolling aggregate within Phase 2 scope; the data shape `[{date, value, n}]` is unchanged.

3. **Compare page: forced same trip-type vs. explicit columns?**
   - What we know: D-24 / D-25 locks single trip-type selector for compare.
   - What's unclear: If a user selects 3 boats where one doesn't run the chosen trip type, should it show "no trips in window" for that column or drop that boat?
   - Recommendation: Show "no trips in window" in the column with the same "low data" treatment — lets users see that the comparison is incomplete without auto-removing their choice.

4. **`@app/state` vs `@app/stores`?**
   - What we know: Both work in SvelteKit 2; `@app/state` is preferred for new code.
   - What's unclear: Whether to standardize on one or let each route pick.
   - Recommendation: Standardize on `@app/state` — runes-native, less ceremony. Plan this as a minor convention in Plan 02-01 or 02-03.

5. **Do we install `@tailwindcss/typography` for `/about`?**
   - What we know: CONTEXT.md makes this discretionary.
   - What's unclear: Whether the `/about` page's content is prose-heavy enough to benefit.
   - Recommendation: Skip for now (one more dep to keep current); if the static content renders cramped, add in a Phase 2 polish pass.

## Environment Availability

Phase 2 has no new external dependencies beyond what Phase 0/1 already require. Audit for safety:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | runtime | ✓ | 22.22.2 (≥22 required) | — |
| better-sqlite3 | DAL | ✓ | ^12.9.0 installed | — |
| SQLite | via better-sqlite3 | ✓ | 3.53.0 (≥3.46 required) | — |
| SvelteKit | framework | ✓ | ^2.57.1 installed | — |
| Svelte | UI | ✓ | ^5.55.4 installed | — |
| Tailwind | styling | ✓ | ^4.2.4 installed | — |
| tsx | CLI runner for seed script | ✓ | ^4.21.0 installed | — |
| Vitest | test runner | ✓ | ^2.1.0 installed | — |
| echarts | charts | ✗ | — | Install — no fallback (only viable lib for calendar heatmap per STACK.md) |
| date-fns | trend gap-fill | ✗ | — | Could hand-roll ISO-week helpers in `dates.ts`; planner's call. Recommendation: install (listed in STACK.md as baseline supporting library) |
| @tailwindcss/typography | `/about` prose styling | ✗ | — | Use raw Tailwind utilities; discretionary |

**Missing dependencies with no fallback:** echarts (must install — the ONLY mainstream library with native calendar heatmap per STACK.md).

**Missing dependencies with fallback:**
- date-fns — could hand-roll but adds date-math complexity in `dates.ts`. Recommended to install.
- @tailwindcss/typography — skip unless `/about` looks cramped.

## Validation Architecture

`workflow.nyquist_validation: true` in `.planning/config.json` — section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1 (existing from Phase 0) |
| Config file | `/Users/zen/Documents/code/fish-count/vitest.config.ts` |
| Quick run command | `npm run test:run -- tests/unit/db/queries/ tests/unit/shared/ tests/unit/routes/` |
| Full suite command | `npm run test:run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BRW-01 | `/` shows today's rows joined with boat + landing display names | unit (load fn) | `npm run test:run -- tests/unit/routes/home.test.ts` | ❌ Wave 0 |
| BRW-02 | Each row has source-site link with date param | unit (data contract) | `npm run test:run -- tests/unit/db/queries/browse.test.ts` | ❌ Wave 0 |
| BRW-03 | "Last scraped at" reads from scrape_runs latest success/empty | unit (DAL) | `npm run test:run -- tests/unit/db/scrapeRuns.test.ts` (extend) | ✅ exists, extend |
| BRW-04 | `source_date === today()` → provisional; past → final | unit | `npm run test:run -- tests/unit/routes/home.test.ts` (provisional branch) | ❌ Wave 0 |
| BRW-05 | `/date/[date]` prev/next navigation clamps to dataset bounds | unit (load fn) | `npm run test:run -- tests/unit/routes/date.test.ts` | ❌ Wave 0 |
| BRW-06 | distinctTripTypes/Landings/Species return verbatim source strings | unit (DAL) | `npm run test:run -- tests/unit/db/queries/browse.test.ts` | ❌ Wave 0 |
| BRW-07 | URL filter round-trip: serialize + parse preserves filter shape | unit (property test) | `npm run test:run -- tests/unit/shared/urlState.test.ts` | ❌ Wave 0 |
| BRW-08 | 375px viewport: no horizontal page scroll | manual UAT | N/A (visual at 375px dev tools) | N/A |
| BRW-09 | `/about` page exists and is linked from every PerAnglerMetric | manual UAT + grep lint | `grep -r 'PerAnglerMetric' src/ && grep -c "href=\"/about\"" src/routes/about/+page.svelte` | ❌ Wave 0 |
| TRP-01 | Target date + species → ranked boats | unit (DAL) | `npm run test:run -- tests/unit/db/queries/tripPicker.test.ts` | ❌ Wave 0 |
| TRP-02 | Ranking uses SUM/SUM weighted avg (not mean-of-ratios) | unit (DAL) | `npm run test:run -- tests/unit/db/queries/tripPicker.test.ts` (fixture: 5/5 then 5/1 → 10/6) | ❌ Wave 0 |
| TRP-03 | Each result has n, avg, last trip date, trip type | unit (DAL contract) | `npm run test:run -- tests/unit/db/queries/tripPicker.test.ts` | ❌ Wave 0 |
| TRP-04 | PerAnglerMetric rendered for every per-angler number | manual UAT + grep lint | `grep -rnE 'fish/angler|per angler' src/ \| grep -v PerAnglerMetric.svelte` returns empty | ❌ Wave 0 |
| TRP-05 | Picker refuses submit without trip type | unit (load fn) | `npm run test:run -- tests/unit/routes/picker.test.ts` (no-tripType → guidance, NOT rankings) | ❌ Wave 0 |
| TRP-06 | "Why this boat?" panel data present in loader result | unit (load fn) | same test file | ❌ Wave 0 |
| TRP-07 | n<5 rows shown with "low data" badge, NOT filtered out | unit (load fn) | `npm run test:run -- tests/unit/routes/picker.test.ts` (fixture w/ n=3 boat still in result) | ❌ Wave 0 |
| TRP-08 | Heatmap returns 30 tuples covering the date range | unit (DAL) | `npm run test:run -- tests/unit/db/queries/tripPicker.test.ts` | ❌ Wave 0 |
| TRP-09 | Cells w/ n<5 render gray via itemStyle | manual UAT (visual) + unit (cell shape) | `npm run test:run -- tests/unit/routes/picker.test.ts` (cell w/ n=3 has itemStyle) | ❌ Wave 0 |
| BOAT-01 | Boat detail page shows recent trips + season totals + trip types run | unit (DAL) | `npm run test:run -- tests/unit/db/queries/boatDetail.test.ts` | ❌ Wave 0 |
| BOAT-02 | Boat detail links to landing and source-site boat page | unit (data contract) + visual UAT | `npm run test:run -- tests/unit/db/queries/boatDetail.test.ts` (source_url fields present) | ❌ Wave 0 |
| TRN-01 | Weekly/monthly species trend with ISO-week bucket keys | unit (DAL) | `npm run test:run -- tests/unit/db/queries/trends.test.ts` (2024-12-30 → 2025-W01) | ❌ Wave 0 |
| TRN-02 | Boat-performance trend filtered by trip type | unit (DAL) | `npm run test:run -- tests/unit/db/queries/trends.test.ts` | ❌ Wave 0 |
| TRN-03 | Compare 2-3 boats side-by-side in same trip type | unit (DAL) | `npm run test:run -- tests/unit/db/queries/compare.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test:run -- tests/unit/db/queries/` for DAL changes; `npm run test:run -- tests/unit/shared/` for dates/urlState changes
- **Per wave merge:** `npm run test:run` (full suite) + `npm run check` (svelte-check)
- **Phase gate:** full suite green + manual 375px viewport walkthrough + grep lint for `fish/angler` outside `<PerAnglerMetric>` returns empty + PerAnglerMetric → `/about` link present on every data page.

### Wave 0 Gaps

All to be created in the first task-wave of Phase 2:
- [ ] `tests/helpers/fixture-seed.ts` — helper to seed an in-memory DB by replaying committed `tests/fixtures/scraper/*.html` through `parsePage` + DAL upsert; used by route/query tests.
- [ ] `tests/unit/db/queries/browse.test.ts` — covers BRW-01, BRW-02, BRW-06
- [ ] `tests/unit/db/queries/tripPicker.test.ts` — covers TRP-01, TRP-02, TRP-03, TRP-08
- [ ] `tests/unit/db/queries/boatDetail.test.ts` — covers BOAT-01, BOAT-02
- [ ] `tests/unit/db/queries/trends.test.ts` — covers TRN-01, TRN-02
- [ ] `tests/unit/db/queries/compare.test.ts` — covers TRN-03
- [ ] `tests/unit/shared/urlState.test.ts` — covers BRW-07 (round-trip property test)
- [ ] `tests/unit/routes/home.test.ts` — covers BRW-01, BRW-04 load-function shape
- [ ] `tests/unit/routes/date.test.ts` — covers BRW-05 prev/next + clamp
- [ ] `tests/unit/routes/picker.test.ts` — covers TRP-05 required-trip-type, TRP-07 n<5 shown not hidden
- [ ] `tests/unit/routes/boats.test.ts` — covers BOAT-01, BOAT-02 shape
- [ ] `tests/unit/routes/compare.test.ts` — covers TRN-03 shape
- [ ] `tests/unit/routes/trends.test.ts` — covers TRN-01, TRN-02 shape + ISO-week bucket correctness
- [ ] Extend `tests/unit/shared/dates-boundary.test.ts` to whitelist the new `dates.ts` helpers while still banning `new Date().toISOString().slice(0,10)` — ensure STO-04 remains enforced.
- [ ] Extend `tests/unit/db/dal-boundary.test.ts` (or equivalent) to include `src/lib/db/queries/` under the "only-SQL-here" scan.
- [ ] Grep lint (added to CI or a script): `grep -rnE 'fish/angler|per angler' src/ | grep -v PerAnglerMetric.svelte` must exit 1 (no matches).
- [ ] Grep lint: `grep -rn 'SELECT\|INSERT\|UPDATE\|DELETE' src/routes src/lib/components` must exit 1 (no SQL outside DAL).

Framework install: none needed (Vitest + SvelteKit + better-sqlite3 already present).

### Manual UAT checklist (documented in VALIDATION.md at phase close)

- [ ] Load `/` at 375px Chrome DevTools viewport — no horizontal page scroll.
- [ ] Provisional badge visible on `/` (today).
- [ ] "Last scraped at [PT time]" visible on every data page.
- [ ] Every row on `/` has a clickable source-site link.
- [ ] Picker: attempting to submit without trip type does NOT show rankings; shows guidance.
- [ ] Picker: result list shows `n=X trips` inline on every row; n<5 rows carry "low data" badge and are NOT removed.
- [ ] Per-angler number on any page has visible inline "derived boat-aggregate average" text + `/about` link nearby.
- [ ] Heatmap: at least one n<5 cell visibly gray; rest colored viridis; legend present with "fish/angler" units; colorblind-safe palette.
- [ ] Changing any filter on `/picker` updates the URL + the result without page reload flash; copy-pasting the URL in a new tab shows the same result.
- [ ] `/boats/[id]`: landing link + source-site boat link both present; source URL format matches `https://www.sandiegofishreports.com/charter_boats/<slug>.php` (or falls back to landing).
- [ ] `/compare`: can pick 2 boats, single trip type, renders side-by-side with weekly line chart; picking 3 boats also works.
- [ ] `/trends`: toggle weekly/monthly; line chart shows gaps (not zero) for empty buckets.
- [ ] `/about`: page exists; linked from at least one PerAnglerMetric on every data page.

## Security Domain

`security_enforcement` not explicitly set in config → treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 2 is anonymous — no user auth (deferred to Phase 4 email signup) |
| V3 Session Management | no | No sessions in Phase 2 |
| V4 Access Control | no | All pages public read-only; no role model |
| V5 Input Validation | yes | Zod schemas in `src/lib/shared/urlState.ts` validate every filter value pulled from `url.searchParams` before reaching DAL; DAL parameters are bound via better-sqlite3 named parameters (prepared statements), never concatenated |
| V6 Cryptography | no | No secrets rendered/stored in Phase 2 |
| V7 Error Handling & Logging | yes | `event.locals.logger` (pino child) on every load function; don't log user-controlled strings at warn+ levels without redaction (filter values can be anything) |
| V8 Data Protection | partial | No PII in Phase 2; outgoing links use `rel="noopener"` |
| V12 Files and Resources | no | No file uploads |
| V13 API and Web Service | partial | No new REST API; all data via `+page.server.ts` load — inputs already Zod-validated |

### Known Threat Patterns for SvelteKit + SQLite

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via URL filter values | Tampering | Named-parameter binding (`@species`, `@trip_type`, etc.) in every DAL prepared statement — NEVER string-concatenate. Already the Phase 1 pattern; Phase 2 must continue it |
| Reflected XSS via URL filter value echoed in HTML | Tampering | Svelte auto-escapes by default (`{value}` is HTML-safe). Avoid `{@html}` entirely in Phase 2 except for static content in `/about` with no user input. `/about` is static markup — safe |
| Open redirect on source-site links | Tampering | All source-site links hard-code the `sandiegofishreports.com` host; never derive host from user input. Add `rel="noopener noreferrer external"` to outbound links |
| Cache poisoning via `Vary` mismatches on filtered pages | Tampering | Every unique filter state = unique URL (D-18), so HTTP cache naturally keys on the full URL. `setHeaders({'cache-control': ...})` is the only header we set; don't add `Vary` |
| DoS via huge date range on picker/trends | DoS | Zod validation clamps: `windowDays: z.coerce.number().int().min(0).max(14)`; date-range queries bounded by dataset min/max via `clampDate` helper; SQL queries are O(rows in range) on indexed columns |
| Request smuggling / header injection via user input | Tampering | SvelteKit handles header parsing; we never construct headers from user input |
| Log injection via user-provided filter string | Tampering | pino logs structured JSON; user-supplied strings are stringified fields, not log format strings — safe by default |
| SSRF via source-url link | Spoofing | Source URL is displayed, not fetched by our server. Phase 2 does NO outbound HTTP (scraper pipeline is Phase 1 and has its own `isAllowed(robots.txt)` gate) |
| better-sqlite3 type coercion bypass | Tampering | Prepared statements with named parameters; Zod at URL boundary ensures values are the expected TypeScript types before reaching the query |

**No new secrets, no new credential handling, no new session surface, no user-writable data path in Phase 2.** The security posture is inherited from Phase 0/1 (the scraper + ops guardrails); Phase 2's contribution is "don't break it."

## Sources

### Primary (HIGH confidence)

- `package.json` — verified installed versions 2026-04-24
- `src/lib/db/migrations.ts` — Phase 1 schema with verified indexes (`source_date, species`), (`boat_id, source_date`), UNIQUE(`source_date, boat_id, trip_type, species`)
- `src/lib/scraper/fetcher.ts` line 17–19 — source URL format `https://www.sandiegofishreports.com/dock_totals/boats.php?date=YYYY-MM-DD` [VERIFIED: repo]
- `src/lib/scraper/parser.ts` — parser stores `source_url` and `landing_source_url` from anchors; Phase 2 consumes `boats.source_url` and `landings.source_url` already populated
- `src/lib/shared/dates.ts` — existing `today()`, `toIsoDate()`, `currentPtMonth()`; STO-04 single-producer rule
- `src/lib/db/scrapeRuns.ts::addOneDay` — precedent for string-arithmetic date helpers that don't trip the `dates-boundary.test.ts` guard
- Local `better-sqlite3` probe: SQLite 3.53.0, `strftime('%V-%G', '2024-12-30')` → `01-2025` verifying ISO-week year-boundary handling [VERIFIED: Bash]
- Local `better-sqlite3` probe: `SELECT SUM(c)*1.0/SUM(a) FROM t GROUP BY d` returns expected floats for weighted per-angler pattern [VERIFIED: Bash]
- npm registry (2026-04-24): echarts@6.0.0, @sveltejs/kit@2.58.0, svelte@5.55.5, date-fns@4.1.0, tailwindcss@4.2.4, better-sqlite3@12.9.0, @tailwindcss/typography@0.5.19, zod@4.3.6 [VERIFIED]
- `.planning/research/STACK.md` — confirmed current stack versions and ECharts-only calendar-heatmap reasoning
- `.planning/research/PITFALLS.md` §4 (per-angler misread), §8 (gap-aware aggregation), §UX Pitfalls (viridis, legend, last-updated visible)
- `.planning/research/ARCHITECTURE.md` — modular monolith, DAL bulkhead, precompute pattern (Phase 3), critical contracts
- `.planning/research/FEATURES.md` §SD-Specific UI Patterns (domain language verbatim, per-angler honesty)

### Secondary (MEDIUM confidence — official docs)

- [SvelteKit Load functions & setHeaders](https://svelte.dev/docs/kit/load) — `setHeaders({'cache-control': ...})` pattern
- [SvelteKit $app/navigation (goto)](https://svelte.dev/docs/kit/$app-navigation) — `goto(url, { replaceState, noScroll, keepFocus })`
- [Svelte 5 $state / $derived runes](https://svelte.dev/docs/svelte/$state) — runes-based reactivity
- [ECharts Import Basics — tree-shaking](https://apache.github.io/echarts-handbook/en/basics/import/) — selective `use()` of chart+component modules
- [ECharts Visual Mapping](https://apache.github.io/echarts-handbook/en/concepts/visual-map/) — confirms v5+ itemStyle priority over visualMap
- [ECharts Calendar Heatmap demo](https://echarts.apache.org/examples/en/editor.html?c=calendar-heatmap) — coordinateSystem 'calendar' + series type 'heatmap'
- [SQLite Date and Time Functions](https://sqlite.org/lang_datefunc.html) — `%V` ISO week, `%G` ISO year; `%W` is US week (do not use for ISO)
- [Tailwind overflow](https://tailwindcss.com/docs/overflow) — `overflow-x-auto` container pattern

### Tertiary (LOW confidence — needs validation at implementation)

- [kit#9390](https://github.com/sveltejs/kit/issues/9390) — goto + replaceState load-function re-run behaviour (behavioral, not API-documented; implementation must smoke-test)
- [kit#13746](https://github.com/sveltejs/kit/issues/13746) — `page.url.searchParams` not reactively writable (community-confirmed; Svelte 5 behaviour)
- [Tailkits responsive table pattern](https://tailkits.com/blog/tailwind-responsive-tables/) — community-level; mobile-card layout is well-established but flavor varies

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm 2026-04-24; all already-installed libs confirmed by inspecting `package.json`; SQLite 3.53.0 and %V/%G week behaviour verified by local probe
- Architecture: HIGH — SvelteKit load + DAL pattern is already Phase 1 orthodoxy in this repo; `src/lib/db/queries/` subfolder (D-06) cleanly preserves STO-03 without refactoring existing per-table repos
- Pitfalls: HIGH — per-angler, cross-trip-type, `n<5`, and SQL-boundary pitfalls are enumerated in CLAUDE.md and PITFALLS.md; SQL integer-division and ISO-week-boundary pitfalls verified by local SQLite probe
- Validation architecture: HIGH — maps 1:1 to phase requirements; test infrastructure already exists (Vitest + in-memory SQLite helper); Wave 0 gaps clearly scoped
- Security: HIGH — Phase 2 surface is read-only + anonymous; ASVS threat surface narrow; existing prepared-statement + Zod-at-boundary pattern covers V5 input validation

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (fast-moving SvelteKit minor updates; ECharts and better-sqlite3 are slower-moving — those claims age to ~90 days)
