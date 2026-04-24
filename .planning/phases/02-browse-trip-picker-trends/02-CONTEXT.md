# Phase 2: Browse + Trip Picker + Trends - Context

**Gathered:** 2026-04-24 (auto mode — recommended defaults)
**Status:** Ready for planning

<domain>
## Phase Boundary

Public, anonymous, mobile-first read surfaces over the Phase 1 dataset. An SD angler can open the site, see today's per-boat counts, jump to any past date the store covers, run a trip-picker query for a target date + species + trip type, open a boat's detail page, compare 2–3 boats side-by-side, and view weekly/monthly trend charts — all with per-angler numbers labeled honestly as derived boat-aggregate averages.

**In scope:** SvelteKit routes and `+page.server.ts` loaders for home/today, date-view, trip picker, boat detail, compare, trends, about; new read-query modules under `src/lib/db/queries/`; URL-encoded shareable filter state; 30-day calendar heatmap (ECharts, historical-average coloring with gray for low-data cells); per-angler metric component with mandatory inline framing; "About the data" page; mobile layout at 375px; provisional badge for today; source-site attribution links; `scripts/seed-dev-db.ts` (fixture replay).

**Out of scope — deferred to other phases:** statistical forecasts / prediction intervals / `n<5` refusal / heatmap recoloring from forecasts (Phase 3 — FCT-01..07); user-facing email signup + alerts (Phase 4); loading/empty/error-state polish + rockfish-closed-season messaging (Phase 5 — POL-01..03); any write path other than DB reads driven by URL state.

**Out of scope — architectural guardrails that remain binding:** the DAL remains the only module that issues SQL (CLAUDE.md / STO-03); all dates are `YYYY-MM-DD` in America/Los_Angeles from `src/lib/shared/dates.ts` (STO-04); per-angler metrics can never be cross-trip-type compared in UI (CLAUDE.md non-negotiable #4).

</domain>

<decisions>
## Implementation Decisions

### Routing / Information Architecture
- **D-01:** Route map (all public, anonymous, SSR-rendered):
  - `/` — today's per-boat counts (BRW-01..04) with provisional badge, "Last scraped" indicator, filter controls.
  - `/date/[YYYY-MM-DD]` — per-date view (BRW-05). Prev/next buttons + native date picker jump.
  - `/picker` — trip picker (TRP-01..09). Filters in query string; results table + heatmap on one page.
  - `/boats/[id]` — boat detail (BOAT-01/02). Recent trips, season totals, trip types, landing link, source-site link.
  - `/compare` — 2–3 boat side-by-side within single trip type (TRN-03).
  - `/trends` — weekly/monthly aggregation charts (TRN-01, TRN-02).
  - `/about` — "About the data" (BRW-09). Static content.
- **D-02:** Route IDs use `boats.id` (surrogate INTEGER PK from Phase 1 D-01), not source_name. Keeps URLs stable across source-side renames. `source_name` stays the filter-matching key for backend queries.

### Data loading pattern
- **D-03:** Every data-loading page uses SvelteKit `+page.server.ts` `load()` functions that call DAL repositories directly (in-process better-sqlite3). No internal `/api/*` fetch hops for reads. Server-rendered HTML ships with data already present — no client-side data fetching for first paint.
- **D-04:** Charts (ECharts) are the only client-only surface. The server passes already-shaped JSON (e.g., 30 `(date, value, n)` tuples) to a `<Chart>` Svelte component that dynamic-imports `echarts` in `onMount`. Per STACK.md: no chart SSR.
- **D-05:** No REST endpoints / no `/api/*` routes in Phase 2. Filter state is encoded in URL query strings only; `+page.server.ts` reads `url.searchParams`, composes a query, returns shaped data.

### DAL extension (STO-03 compliance)
- **D-06:** New subfolder `src/lib/db/queries/` holds multi-table read compositions (repositories that span `catch_reports × boats × landings`). Per-table repositories under `src/lib/db/` (e.g. `catchReports.ts`) stay focused on single-table CRUD; `queries/` is for cross-table aggregations. This preserves the "DAL is the only SQL surface" invariant while avoiding one 2000-line god-file.
- **D-07:** New query modules — exact names at planner discretion, but the seams are:
  - `queries/browse.ts` — today's rows, by-date rows, joined with boat/landing display names.
  - `queries/tripPicker.ts` — `rankBoatsForQuery({ date, species, tripType, windowDays })` → ranked list; `heatmapForQuery({ fromDate, toDate, species, tripType })` → 30 cells.
  - `queries/boatDetail.ts` — recent trips + season-to-date totals + trip types this boat runs.
  - `queries/trends.ts` — weekly/monthly time-series by species+trip_type (+ optional boat).
  - `queries/compare.ts` — multi-boat same-trip-type aggregation over a user window.

### Ranking metric semantics (TRP-02, TRP-03 + PITFALLS §4 + CLAUDE.md non-negotiable #4)
- **D-08:** "Average fish/angler" for ranking is the **weighted per-angler yield**: `SUM(species_count) / SUM(angler_count)` over the matched trips, where the match window is `(date, species, tripType)` plus a date window (see D-11). Not mean-of-ratios. Matches the "derived boat-aggregate average" framing; avoids small-trip over-weighting.
- **D-09:** `n` is the count of matched **trips** (distinct `(source_date, trip_type)` tuples per boat), not the count of rows or anglers. Per-trip granularity is the honest sample-size statement.
- **D-10:** Trip type is a **required** filter on the picker — the UI refuses to submit without one (TRP-05). Defaults to most-common trip type in the dataset at page-load time (likely "1/2 Day AM"), but never pre-selects implicitly.

### Date semantics in trip picker (TRP-01)
- **D-11:** Single target date is the default input. A "± days" numeric field (default value 3, range 0–14) expands the historical match window symmetrically around the same month/day across past years (for future dates, we're asking "what did boats catch in this time of year historically?"). For past target dates, the window includes both past and future real dates around that date (within dataset bounds).
- **D-12:** Range mode is available via a "use date range" toggle: user picks `fromDate` + `toDate` explicitly; ± days UI hides.

### Calendar heatmap (TRP-08, TRP-09)
- **D-13:** 30-day window rendered: the 30 days starting on the selected target date (or the "from" date in range mode). Past dates render actual per-day aggregates; future dates render the historical same-month-day average (weighted yield) across all prior years in the dataset for the selected species + trip type.
- **D-14:** Low-data rule (TRP-09): any cell where the supporting sample size (trips, not rows) is `< 5` renders in gray via ECharts `itemStyle` override, bypassing the color scale. All other cells use a colorblind-safe palette (viridis-like; ECharts `visualMap` continuous scale). Always-visible legend with units ("fish/angler"). No red/green for "good/bad".
- **D-15:** Phase 3 will recolor cells using forecasts (FCT-05). Phase 2 must keep the heatmap's data-shape interface stable so Phase 3 can swap the source from "historical same-week-of-year avg" to "precomputed forecast mean" without rewriting the component.

### Per-angler metric framing (TRP-04, BRW-09, PITFALLS §4)
- **D-16:** Single reusable component: `src/lib/components/PerAnglerMetric.svelte`. Props: `{ value: number; nTrips: number; ctx?: 'row' | 'card' | 'hero' }`. Renders:
  - Integer or one-decimal value (≤ 2 decimals never).
  - "fish/angler" unit label.
  - Inline (not tooltip-only) framing: "derived boat-aggregate average" on first use per page + link to `/about`.
  - "low data" badge when `nTrips < 5` (not hidden — flagged per TRP-07).
  - `n=X trips` always visible on the component.
- **D-17:** "About the data" page (`/about`) content: source site + scrape cadence (nightly 23:00 PT) + what "per angler" means (boat total ÷ anglers, derived average, never an individual attribution) + trip-type semantics + n thresholds (n<5 = low data; Phase 3 adds n<5 → no forecast) + data gap handling + contact pointer. Every PerAnglerMetric links here.

### URL state (BRW-07)
- **D-18:** All filter state lives in `$page.url.searchParams`. No client-side stores, no cookies, no localStorage. Single typed helper at `src/lib/shared/urlState.ts` exposes parse + serialize functions per route's filter shape (e.g., `parsePickerFilters(searchParams)`). Server load functions and client-side filter controls both use the helper — one schema, two call sites.
- **D-19:** Filter UI changes call SvelteKit `goto(url, { keepFocus: true, replaceState: true, noScroll: true })` so the page re-renders via SSR (load function re-runs) and the URL updates without a full navigation ripple.

### Provisional badge (BRW-04)
- **D-20:** Rule: if `source_date === today()` (PT), render provisional badge on every row and at the page header. Past dates render "final" (no badge). The badge does **not** depend on the clock hour — once the nightly scrape at 23:00 PT writes the final "today" rows, the day rolls over to tomorrow at midnight PT anyway; yesterday becomes final by calendar, not by scrape-event. Simple rule, no drift.
- **D-21:** "Last scraped at [time PT]" indicator (BRW-03) reads from `scrape_runs` — most recent `outcome='success'` or `outcome='empty'` `finished_at`, formatted in PT. Present on every data-showing page.

### Source-site attribution (BRW-02, BOAT-02)
- **D-22:** Per-row source link format: `https://www.sandiegofishreports.com/dock_totals/boats.php?date=YYYY-MM-DD` (source's daily page — one URL per date, not per-row).
- **D-23:** Per-boat source link on boat detail page reads from `boats.source_url` (populated by Phase 1 parser); fallback to source landing page if null. Same pattern for `landings.source_url`.

### Comparison page UX (TRN-03)
- **D-24:** `/compare` controls: trip-type selector (required, single); date-range picker (default last 30 days — adjustable); boat multi-select (2 or 3 boats, searchable by display_name, required ≥ 2). Submit is URL-state round-trip (D-18).
- **D-25:** Render = side-by-side columns, one per boat. Each column shows: total trips in window, weighted avg fish/angler (per D-08), top species by total catch, last trip date in window. Below columns: a single ECharts multi-series weekly line of avg fish/angler per boat, same axis.

### Trend chart UX (TRN-01, TRN-02)
- **D-26:** `/trends` filters: species (required), trip-type (required), boat (optional, single), time range (preset: 3mo / 6mo / 1y / all, default 1y), granularity toggle (weekly | monthly, default weekly for ≤ 6mo range, monthly for > 6mo).
- **D-27:** Weekly bucket = ISO week (Mon–Sun) in PT. Monthly bucket = calendar month PT. Aggregation = weighted avg fish/angler per bucket (same math as D-08). Gap-aware: buckets with zero matching trips render as a gap in the line (not a zero), matching PITFALLS §8 honesty rule. Phase 2 does not annotate "N of M days" — that's a Phase 3 forecast concern.

### "Why this boat?" panel (TRP-06)
- **D-28:** Expandable per-row panel on picker results. Content: n trips in the matched window, weighted avg fish/angler, last trip date in window, best-day in window (date + value), the exact `(species, trip_type, date window)` filter applied in plain English, and the link to the boat detail page. Expand/collapse is client-side (no additional fetches — all data already in the loader result).

### Caching strategy
- **D-29:** No in-app caching layer in v1. SQLite is already in-process. HTTP cache headers set in `+page.server.ts` via `setHeaders`:
  - `/` (today's page): `Cache-Control: public, max-age=60` (1 min — today still reporting).
  - `/date/[past-date]`: `Cache-Control: public, max-age=86400` (1 day — past dates are immutable once final).
  - `/picker`, `/trends`, `/compare`, `/boats/[id]`: `max-age=300` (5 min — input-derived).
  - `/about`: `max-age=3600` (1 hr — static-ish content).
- **D-30:** Today's-date detection for the past-vs-today cache split: `source_date < today()` → past cache; else → today cache.

### Mobile layout (BRW-08)
- **D-31:** Tailwind-first mobile baseline: all components authored at mobile (375px) baseline, `sm:`/`md:`/`lg:` modifiers add breathing room on larger viewports. Data tables use responsive patterns (horizontal-scroll container on narrow; full table on wide) to meet "no horizontal page scroll" at 375px. No hamburger navigation in v1 — top nav is 4–5 links inline (Home, Picker, Trends, Compare, About), wraps on narrow viewport.

### Chart component contract
- **D-32:** Single `<Chart>` Svelte component (`src/lib/components/Chart.svelte`) wraps ECharts init/destroy lifecycle. Props: `{ option: EChartsOption; height?: string; theme?: 'light' }`. Dynamic-imports `echarts/core` + only the chart types and components the page uses (line, heatmap, calendar, tooltip, grid, visualMap) per STACK.md's keep-bundle-small guidance.

### Dev seed strategy
- **D-33:** `scripts/seed-dev-db.ts` (tsx-run) replays committed HTML fixtures from `tests/fixtures/scraper/*.html` through the Phase 1 parser + DAL upsert to populate a dev DB. Repeats across synthetic dates (e.g., 2025-01-01..2026-04-23 mapped to rotating fixtures) so trends/heatmaps have something to render. Idempotent (leverages Phase 1 idempotent-upsert invariant). Explicitly non-production: gated by `NODE_ENV !== 'production'` check.
- **D-34:** An optional second path — `npm run backfill -- --from ... --to ...` against production source — exists from Phase 1 and is the real path for an operator who has set `FIRST_SCRAPE_OK`. Phase 2 UI development does **not** require this; fixture seed is sufficient to exercise every route.

### Claude's Discretion
- Exact filenames and internal structure under `src/lib/db/queries/` — planner decides per query complexity.
- Svelte component decomposition beyond `PerAnglerMetric` + `Chart` (e.g., reusable `<FilterBar>`, `<BoatRowCard>`) — planner decides based on duplication observed during implementation.
- Color palette specifics (exact hex values in the viridis scale) — planner decides using ECharts' built-in visualMap or a small custom ramp.
- Whether the heatmap's 30 future cells render from same-month-day-historical-mean OR a simpler rolling-historical aggregate — planner picks whichever is simpler to compute and honest at n<5 boundary. The low-data gray rule (D-14) is non-negotiable either way.
- Whether to install Svelte `typography` plugin for the `/about` page — planner decides; prose styling is not a Phase 2 decision point.
- Whether `/boats/[id]` uses numeric ID or a slug for humanization — planner decides (numeric is simpler + stable; slug adds a migration tail).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project rules + domain
- `CLAUDE.md` — Non-negotiable rules #4 (per-angler framing: derived boat-aggregate average, mandatory trip-type segmentation, inline disclaimer not tooltip-only, `/about` page linked from every per-angler number), architecture rules (DAL = only SQL source, idempotent-upsert invariant preserved, all dates via `src/lib/shared/dates.ts`), anti-features list (no social feed, no leaderboards, no "ON FIRE" badges, no sponsored slots, no fake-precision numbers, no manual scrape trigger in UI), domain language (trip-types verbatim, landing names verbatim, species names verbatim incl. "dorado" not "mahi-mahi").
- `.planning/REQUIREMENTS.md` §Browse (BRW-01..09), §Trip Picker (TRP-01..09), §Boat Detail (BOAT-01..02), §Trends (TRN-01..03) — authoritative REQ descriptions for the 23 requirements this phase owns.
- `.planning/ROADMAP.md` Phase 2 — goal statement + 5 success criteria.

### Research (consulted during phase design)
- `.planning/research/STACK.md` — SvelteKit 2.57 + Svelte 5.55 + adapter-node (SSR + server endpoints in one process), ECharts 6.0 (native calendar heatmap, render client-side, dynamic-import to keep bundle small), Tailwind 4.2, better-sqlite3 12.9 (in-process reads), date-fns for date math.
- `.planning/research/FEATURES.md` — SD-specific UI quality gates (§SD-Specific UI Patterns), competitor feature matrix, anti-feature rationale, "Why this boat?" explainer pattern, per-angler labeling pattern, trip-type-aware normalization.
- `.planning/research/ARCHITECTURE.md` — Precompute-aggregates-read-cheap pattern (Phase 2 partially; fully realized by Phase 3 forecasts table), modular monolith with DAL bulkhead, Server-Component-direct-DAL-call data flow, critical contracts (`CatchReport` shape downstream consumers depend on).
- `.planning/research/PITFALLS.md` §4 (per-angler misread as skill — P2 is "first time the metric is shown"), §8 (gap-aware aggregation honesty for trends), §UX Pitfalls (legend on heatmap, mandatory trip-type filtering, show `n`, viridis palette not red-green, "last updated" visible), §Performance Traps (precompute > live compute, index `(species, date)` already present from Phase 1 D-06).

### Phase 1 artifacts Phase 2 builds on
- `.planning/phases/01-ingest-store/01-CONTEXT.md` — Complete Phase 1 decisions. Key schema for Phase 2 consumption: `catch_reports(source_date, boat_id, landing_id, trip_type, species, angler_count, species_count, scraped_at)` with UNIQUE idempotent-upsert index on `(source_date, boat_id, trip_type, species)`, and query-serving indexes on `(source_date, species)` and `(boat_id, source_date)` (D-06).
- `src/lib/db/migrations.ts` — Canonical schema declarations; Phase 2 queries must consume these column names exactly.
- `src/lib/db/catchReports.ts` / `boats.ts` / `landings.ts` / `scrapeRuns.ts` — Existing single-table repositories Phase 2 extends with more read functions (or supplements via `queries/`).
- `src/lib/shared/dates.ts` — Sole producer of `YYYY-MM-DD` strings in PT. Every Phase 2 date reference routes through `today()`, `toIsoDate(d)`, or `currentPtMonth()`.
- `src/lib/server/logger.ts` — pino + request-ID correlation (OPS-06). `+page.server.ts` load functions should log with the request logger available via `event.locals` (Phase 1 wired `hooks.server.ts`).
- `src/routes/healthz/+server.ts` — Existing SvelteKit route pattern Phase 2 can reference for server-endpoint shape if needed (though Phase 2 prefers `+page.server.ts` over `+server.ts` per D-05).
- `src/routes/+page.svelte` — Current placeholder Phase 2 replaces with the real home/today page.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **SvelteKit SSR infrastructure** — `src/hooks.server.ts` + `app.d.ts` already wired with logger/requestId correlation. Phase 2's `+page.server.ts` loaders inherit the request logger via `event.locals`.
- **DAL boundary already enforced** — `src/lib/db/client.ts` exposes `getDb()` singleton; every Phase 2 read goes through this + typed repository functions. Pattern locked by Phase 1.
- **Dates module** (`src/lib/shared/dates.ts`) — `today()` for "is this today's date?" checks (D-20, D-30), `toIsoDate(d)` for formatting user-selected dates into canonical strings, `currentPtMonth()` for billing/period logic.
- **Existing per-table repositories** (`catchReports.ts`, `boats.ts`, `landings.ts`, `scrapeRuns.ts`) — Phase 2 reads extend these with more query functions; new cross-table compositions go under `src/lib/db/queries/` (D-06).
- **Tailwind 4.2 already installed + @tailwindcss/vite plugin wired** — no setup cost for Phase 2 styling.
- **Vitest + `tests/fixtures/scraper/` with committed HTML** — seed script (D-33) reuses these fixtures; page-loader tests can replay parsed fixtures into an in-memory DB.

### Established Patterns
- **`src/lib/db/` is the only SQL surface** (CLAUDE.md + STO-03) — Phase 2's new query modules (D-06/D-07) MUST live under `src/lib/db/`; no SQL in `+page.server.ts` loaders, no SQL in components.
- **Single date producer** (CLAUDE.md + STO-04) — Every Phase 2 `YYYY-MM-DD` string goes through `src/lib/shared/dates.ts`. No `new Date().toISOString().slice(0,10)` anywhere.
- **Prepared statements via better-sqlite3** (Phase 1 D-06) — New queries follow the same prepared-statement + `.all()`/`.get()` pattern as existing repositories; no inline string SQL.
- **Logger correlation** — Loaders and query functions that log should use `event.locals.logger` (request-scoped child logger) for correlation with the HTTP request.
- **Vitest fixtures + glob pattern** — `tests/**/*.{test,spec}.{js,ts}`; Phase 2 page-load tests follow same structure (e.g., `tests/unit/queries/tripPicker.test.ts`).

### Integration Points
- **Routes** — `src/routes/` gains `/date/[date]/+page.svelte` + `+page.server.ts`, `/picker/...`, `/boats/[id]/...`, `/compare/...`, `/trends/...`, `/about/+page.svelte`, plus the existing `/` upgraded to today-view. `/healthz/+server.ts` unchanged.
- **Components** — New `src/lib/components/` directory for `PerAnglerMetric.svelte`, `Chart.svelte`, and any shared filter-bar / boat-row primitives. Does not exist yet (only `src/lib/` subfolders are `db`, `server`, `shared`, `scraper`, `alerts`, `ops`).
- **DAL extension** — New `src/lib/db/queries/` subfolder for cross-table read compositions (browse, tripPicker, boatDetail, trends, compare). Exact filenames planner-discretionary (D-07).
- **Shared helpers** — `src/lib/shared/urlState.ts` (new) for typed parse/serialize of filter query strings (D-18).
- **Scripts** — `scripts/seed-dev-db.ts` (new) joins the existing `scripts/backfill.ts` as the two offline-runnable entry points. Same tsx runner, same DAL imports, non-production only.

</code_context>

<specifics>
## Specific Ideas

- **"per angler" is verbatim** (CLAUDE.md domain language) — never render "per rod" or "per person" or "per fisherman". Every metric reads as "X fish/angler" with `n=Y trips` adjacent.
- **Trip types shown verbatim from source** — the strings in `catch_reports.trip_type` are the user-facing labels. No normalization to lowercase or to shortened forms. "1/2 Day AM" stays "1/2 Day AM".
- **Landing names verbatim** — "Point Loma Sportfishing" not "Pt Loma"; "Fisherman's Landing" not "Fishermans Landing". Source strings via `landings.display_name` (Phase 1 D-02 already canonicalizes from `source_name` when needed).
- **No "ON FIRE" / hype badges** — anti-feature per CLAUDE.md + FEATURES.md. The "low data" badge on n<5 cells/rows is the only state-signaling badge Phase 2 ships.
- **No sponsored slots, no paid boat placement** in picker ranking ever. Ranking is strictly by weighted fish/angler (D-08) within the enforced trip-type filter.
- **The heatmap palette is colorblind-safe (viridis-like)**, not a red-green "hot/cold" scale. Per PITFALLS §UX and CLAUDE.md non-negotiable #3 honesty.
- **Integer-only display for future-forecast cells** (CLAUDE.md #3). Phase 2 renders historical averages which may be decimals — one-decimal max, never two. Phase 3 will flip forecast cells to integers.

</specifics>

<deferred>
## Deferred Ideas

- **Statistical projections / prediction intervals / `n<5` refusal / forecast-colored heatmap cells** — Phase 3 (FCT-01..07). Phase 2 heatmap renders from historical same-month-day averages; Phase 3 swaps the data source to `forecasts` table precomputes.
- **Email alerts / signup / double-opt-in / suppression list** — Phase 4 (ALT-01..12).
- **Loading / empty / error-state polish; rockfish-closed-season friendly message; contact pointers on errors** — Phase 5 (POL-01..03). Phase 2 routes render sensible fallbacks but are not polished per the POL criteria.
- **Median / trimmed-mean toggle on per-angler metric** (PITFALLS §4 nuance, V1X-03). Deferred to v1.x; Phase 2 ships weighted-mean only.
- **Same-week-last-year overlay on trend charts** (V1X-01). Deferred; Phase 2 renders single-series (+ optional boat as second series) only.
- **Species seasonality cheatsheet** (V1X-02). Deferred.
- **Distribution / range view alongside top counts** (V1X-04). Deferred.
- **CSV / JSON export of filtered query** (V1X-05). Deferred.
- **Landing locator map** (V2-03). Deferred.
- **Boat slug URLs instead of numeric IDs** — minor humanization; numeric ID suffices for Phase 2, revisit if URL sharing picks up.
- **In-app caching layer (LRU / ETag for page results)** — not needed at current scale; HTTP max-age is the only caching mechanism (D-29). Revisit only if read traffic saturates single-instance SQLite.
- **Horizontal nav hamburger / mobile drawer** — 4–5 links inline is sufficient for 375px; revisit if nav count grows (Phase 4 adds "Alerts" signup page; Phase 5 may add more).
- **Gap annotations on trend chart** ("based on N of M weeks") — Phase 3 scope per CLAUDE.md non-negotiable #3 + PITFALLS §8. Phase 2 renders gaps as line discontinuities without explanatory overlay.
- **Service Worker / PWA / offline mode** — out of scope for v1 "shareable with friends" bar.
- **Typography plugin for `/about`** — planner-discretionary; default styles are sufficient.

</deferred>

---

*Phase: 02-browse-trip-picker-trends*
*Context gathered: 2026-04-24 (auto mode)*
