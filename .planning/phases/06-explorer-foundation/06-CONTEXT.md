# Phase 6: Explorer Foundation - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the multi-axis ticker explorer at `/explorer`: an angler picks a boat (default), species, or landing as the "ticker," sees catch history with comparison overlay series, and can change the time range using preset buttons (1M / 3M / 6M / 1Y / 2Y / 5Y / All) or a custom start/end date. The explorer must be usable on mobile at 375px. Per-angler numbers always show sample size `n` alongside; trip-type labels always appear in the chart legend.

In scope: the route, the ticker-switcher UI, the selector UI, the chart overlay surface, range presets + custom dates, mobile layout, the URL state contract for ticker/selection/range.

Out of scope (other phases): moon-phase overlay (Phase 7), URL-share/CSV-export (Phase 8), email alerts (Phase 9), v1 retirement of picker/forecast/heatmap (Phase 10), polish/dark-mode (Phase 11).

</domain>

<decisions>
## Implementation Decisions

### First-screen default view

- **D-01:** **Default ticker on landing `/explorer` = boat.** Specific boat = the boat with the most trip-days reported in the last 30 days (`COUNT(DISTINCT source_date)` over `catch_reports` joined to `boats`). Tie-break: alphabetical (`boats.display_name ASC`).
- **D-02:** **Default time range = 1Y** (365 days back from `today()` in PT).
- **D-03:** **Auto-widen on empty default.** If the default boat has no data in the default range, auto-widen until data shows (try 1Y → All). Render a small note above the chart: `"No 1Y data — showing full history."` Goal: never blank screen on first load.
- **D-04:** **Clean URL on first load.** `/explorer` with no params resolves defaults server-side. The URL only gains query params (`ticker`, `slug`/`name`, `range`, etc.) when the user changes a control. Bookmarking `/explorer` always lands on a stable "home" view; downstream Phase 8 share-URLs will be the fully-expanded form.

### Ticker switcher + selector UX

- **D-05:** **Ticker TYPE switcher = segmented pill toggle.** Three pills in a row: `[Boat] [Species] [Landing]`. Tapping a pill changes the ticker type and updates the selector below. Sized for 375px mobile.
- **D-06:** **Specific-item picker = plain native HTML `<select>` dropdown.** Consistent with v1's FilterBar pattern (`/trends`, `/compare`); mobile-native picker on iOS/Android. Lower scope than introducing a combobox component in this phase.
- **D-07:** **Layout = sticky top bar.** Ticker pills + selector + range buttons live in a top bar that stays sticky on scroll. Anglers can change the ticker without scrolling back up — matches the "stock-chart" feel.
- **D-08:** **Ticker TYPE switch behavior — range stays, selection resets to a sensible cross-axis default:**
  - `boat → species` → species this boat catches most (highest total `species_count` for that `boat_id` over the active range)
  - `species → boat` → boat that catches this species most (highest total `species_count` for that species)
  - `* → landing` → landing with most recent activity (most-recent `source_date` across boats at that landing)
  Range presets (and any active custom dates) are preserved across the switch. Feels like "explore the same window from a different angle."
- **D-09:** **Boat dropdown order = activity-first.** Sort by `COUNT(DISTINCT source_date)` over the last 90 days, descending. Tie-break: alphabetical (`display_name ASC`). Hot boats float to top in season; alphabetical fallback keeps order stable across ties.
- **D-10:** **Species dropdown order = alphabetical.** Verbatim SD names: `bluefin`, `calico bass`, `dorado`, `lingcod`, `rockfish`, `wahoo`, `yellowfin`, `yellowtail` — easy to scan.
- **D-11:** **Boat scope in dropdown = show all boats with any scrape data ever.** No "active only" gate. Empty-state handles "no data in current range" cleanly. Aligns with "trust the audience."
- **D-12:** **URL identifier for boats = slug.** Example: `/explorer?ticker=boat&slug=pacific-voyager&range=1y`. Slug column lives on the `boats` table; downstream Phase 8 share-URLs reuse this contract.
- **D-13:** **Slug rename policy = frozen at first-seen.** Slug is generated once when a boat is first ingested and never changes, even if `display_name` later changes at the source site. Old shared URLs always resolve. Trade-off accepted: a renamed boat keeps its original slug (mildly confusing, never broken).
- **D-14:** **Slug scope = boats only.** Species and landings use plain URL-encoded names (e.g. `?ticker=species&name=bluefin`, `?ticker=landing&name=Fisherman%27s+Landing`). Species/landings rarely rename and are a small canonical list — slug indirection adds storage/query overhead with no shareability win.

### Chart, overlays, and presentation (Claude-decided so the planner has a complete contract)

- **D-15: Chart overlay shape — one chart, primary axis is per-angler, overlays are series-on-the-same-chart.**
  - **Boat ticker** → primary overlay = one series per **trip type** the boat ran in the window (e.g., `1/2 Day AM`, `Full Day`, `Overnight`). Secondary "species breakdown" = a small table BELOW the chart listing the species this boat caught with totals (no chart of its own — keeps the chart focused, satisfies the success-criterion phrase "plus species breakdown").
  - **Species ticker** → one series per **boat** that caught the species in the window. Cap to top-6 boats by total catch; collapse the rest into "+N more" in the legend (a click on the "+N more" pill reveals them). Single-chart, no breakdown table.
  - **Landing ticker** → one series per **species** caught at the landing in the window. Cap to top-6 species by total catch; same "+N more" collapse rule.
  - All overlay series start visible on load. Legend uses ECharts native click-to-toggle so an angler can isolate or hide series.
- **D-16: Sample-size `n` shows in three places (no clutter, always available):**
  - **Legend label** — `[boat/species/trip type] · n=NN` per series (NN = total trips contributing across the window for that series).
  - **Tooltip** (axis-crosshair, see D-22) — per-bucket `n` per series at the hovered date.
  - **Chart caption** below the chart — `Based on NNN trips across the [range]. [Granularity] buckets, PT.`
  - No `n` badge on individual data points (would clutter mobile). No n<5 refusal (operator: "trust the audience").
- **D-17: Thin-data rendering = literal gaps.** Buckets with no rows render as `null` and the line breaks (`connectNulls: false`, matching v1 `trends.ts` D-27). No dotted/dashed treatment, no annotations — anglers read the gap correctly. `n` shown alongside lets them judge thin (but non-zero) buckets themselves.
- **D-18: Time bucketing per range = auto-pick, no user override (this phase).**
  - `1M` → **daily** (new code path; bucket key = `strftime('%Y-%m-%d', source_date)`)
  - `3M` → **weekly** (ISO week, `%G-W%V` — same as v1)
  - `6M` → **weekly**
  - `1Y` → **weekly**
  - `2Y` → **monthly** (`%Y-%m`)
  - `5Y` → **monthly**
  - `All` → **monthly**
  - Custom range → daily if span ≤45d, weekly if ≤2y, monthly otherwise.
  - User-facing granularity toggle is **not in this phase** (kept off the UI for "stock-chart" simplicity). If demand surfaces, add later.
- **D-19: Custom date range UX.**
  - Range strip: `[1M] [3M] [6M] [1Y] [2Y] [5Y] [All] [Custom]` — `Custom` is the 8th button.
  - Tap `Custom` → reveals two native `<input type="date">` fields below (`From` / `To`). Both required; submit on blur of the second field.
  - Picking a preset clears any active custom dates. Picking custom dates highlights the `Custom` button and unhighlights presets.
  - URL: `range=custom&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD`. Validation: `fromDate <= toDate`, both within `[earliest_scrape, today()]` (clamp out-of-range; show a small inline note if clamped).
  - Daily/weekly/monthly bucketing falls out of D-18's custom-range rules.
- **D-20: Performance at "All" range — query-tuning + caching, no pre-aggregated table this phase.**
  - Use existing `catch_reports` indexes; if missing, add `(boat_id, source_date)`, `(species, source_date)`, and `(landing_id, source_date)` covering indexes during planning.
  - Monthly bucketing at `All` keeps the result set small (~7y × 12mo × ~6 visible series ≈ 500 points max).
  - Cache-Control: `public, max-age=300` for any view that excludes `today()`; `max-age=60` for ranges that include today (matches v1 home/trends pattern).
  - If profiling during execution shows >300ms server time at `All`, add a `boat_monthly_yields` materialized table populated by the existing nightly scheduler hook. Treat as a planner contingency, not Phase 6 default scope.
- **D-21: Series colors = ECharts categorical defaults (color-blind-friendly palette), capped at 6 visible.**
  - Use `option.color` with the default ECharts palette (already accessibility-vetted).
  - Visible-series cap: 6. Series 7+ go into "+N more" in the legend (D-15).
  - On the boat ticker (trip-type overlay), order series by total catch in the window so the top-6 = the trip types that actually fished.
- **D-22: Tooltip interaction model = axis-crosshair, single tooltip showing all visible series.**
  - ECharts `tooltip.trigger: 'axis'` with `axisPointer.type: 'cross'`.
  - Tooltip shows: bucket label (date / week / month), then per-visible-series rows with name, value (`fish/angler`, 1 decimal), and per-bucket `n`.
  - Mobile-touch: tap-to-pin tooltip; tap-elsewhere to dismiss (ECharts default).
- **D-23: Mobile layout at 375px (sticky top bar + chart + caption + breakdown):**
  - **Sticky top bar** — three rows on mobile: (1) ticker pills `[Boat][Species][Landing]` full-width; (2) `<select>` selector full-width; (3) range strip horizontal-scroll (no wrap), `Custom` opens date inputs that push the chart down.
  - **Chart** — full-width minus 16px page padding; height 280px on mobile, 360px ≥768px.
  - **Caption** — D-16 caption directly below the chart, small text, muted color.
  - **Species breakdown table** (boat ticker only) — below the caption, single column, sorted by total catch desc; on ≥768px renders as a 2-column grid.
- **D-24: Route name = `/explorer`.** Final, not provisional. Used in URLs, nav, all references.
- **D-25: Nav menu placement = second item, right after `Home`.**
  - During Phase 6 (before Phase 10 retirement): `Home / Explorer / Picker / Trends / Compare / About`.
  - Phase 10 retirement reduces to: `Home / Explorer / About`.
  - Edit `src/routes/+layout.svelte` `navItems` array accordingly.

### Folded Todos

None — no pending todos matched Phase 6 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Vision, scope, and requirements
- `.planning/PROJECT.md` — v2 vision, "trust the audience" principle, inline per-angler framing carry-over, URL filter state carry-over, key decisions table
- `.planning/REQUIREMENTS.md` §EXPL — EXPL-01..14 (the 14 explorer requirements this phase delivers)
- `.planning/ROADMAP.md` §"Phase 6: Explorer Foundation" — goal + 5 success criteria
- `.planning/STATE.md` §"Accumulated Context > Decisions" — carry-forward structural decisions (modular monolith, DAL boundary, single date producer, idempotent upsert, backfill CLI)
- `CLAUDE.md` — domain language (verbatim trip types, landings, species; "per angler" metric)

### Reusable code (extend these — don't duplicate)
- `src/lib/components/Chart.svelte` — ECharts wrapper: line + heatmap, dynamic import to keep ~800KB out of SSR, reduced-motion honor, ariaLabel
- `src/lib/db/queries/trends.ts` — `speciesTrend()` and `boatTrend()`: weighted per-angler yield, ISO-week (`%G-W%V`) and monthly (`%Y-%m`) bucket aggregation. Extend (do NOT duplicate) for the landing-ticker case.
- `src/lib/shared/urlState.ts` — Zod parse/serialize pattern. `TrendsFiltersSchema` is the closest analog to a new `ExplorerFiltersSchema`. Untrusted-input boundary; safeParse.
- `src/lib/shared/dates.ts` — single date producer: `today()`, `addDays()`, `toPtTimeLabel()`. MUST use these for all date math (DST safety, PT canonical).
- `src/lib/copy/metrics.ts` — canonical fish/angler copy: `FISH_PER_ANGLER_AXIS`, `FISH_PER_ANGLER_ARIA`, `FISH_PER_ANGLER_TOOLTIP_UNIT`. Note: per-angler-discipline lint allowlist may apply — `RTR-05` (Phase 10) removes the lint, but it's still active during Phase 6.
- `src/lib/components/FilterBar.svelte`, `PageHeader.svelte`, `EmptyState.svelte`, `PerAnglerMetric.svelte`, `LastScrapedLabel.svelte` — reusable presentational components
- `src/lib/db/boats.ts` — boat DAL: `getById()` exists; will need new `findBySlug()` and a slug-aware activity-ordered list helper
- `src/lib/db/landings.ts` — landing DAL: extend for landing-ticker queries (cross-species across the landing's fleet)
- `src/lib/db/scrapeRuns.ts` — `latestSuccessOrEmpty()` for the "Last scraped …" subtitle pattern

### Existing route patterns (study before writing /explorer)
- `src/routes/trends/+page.server.ts` + `+page.svelte` — closest analog: filter-bar, Zod URL parse, range mapping, gap-aware bucket alignment. Inherits the loader-does-gap-fill / DAL-stays-pure rule.
- `src/routes/+page.server.ts` — server-side filter parsing pattern, `setHeaders` cache-control discipline
- `src/routes/+layout.svelte` — current nav (`Home / Picker / Trends / Compare / About`); add `/explorer` here. Picker/Trends/Compare retire in Phase 10.
- `src/hooks.server.ts` — request logger pattern (`event.locals.logger?.info(...)`)

### Architecture rules (non-negotiable)
- **DAL boundary** — only `src/lib/db/` may issue SQL. Static-grep test enforces it. Any explorer DB access goes through new or extended `src/lib/db/queries/*.ts` modules.
- **Date discipline** — all dates `YYYY-MM-DD` in `America/Los_Angeles` via `src/lib/shared/dates.ts`. No ad-hoc `new Date()` math.
- **Idempotent upsert** — `(date, boat_id, trip_type, species)` is the unique key. New `boats.slug` column needs a migration that backfills slugs deterministically from existing `display_name` rows.

### Schema work that this phase will introduce
- **`boats.slug` column** — new column, populated at boat ingestion (and backfilled for existing rows). Slug-generation rules: lowercase, hyphenated, `display_name` collisions resolved with numeric suffix (`pacific-voyager-2`). Frozen-at-first-seen per D-13.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Chart.svelte` (`src/lib/components/`): ECharts dynamic-import wrapper, responsive resize, reduced-motion-aware. Pass an `EChartsOption` and an `ariaLabel`. Already supports multi-series via `option.series[]`.
- `speciesTrend()` / `boatTrend()` (`src/lib/db/queries/trends.ts`): weighted per-angler yield with ISO-week or monthly bucketing. Extend with a `landingTrend()` for the landing-ticker case (aggregate across boats at a landing, group by species or trip type per overlay).
- `urlState.ts` Zod schemas: copy the `TrendsFiltersSchema` pattern. Add a new `ExplorerFiltersSchema` for `{ticker: 'boat'|'species'|'landing', slug?, name?, range, fromDate?, toDate?}`. Untrusted-input boundary discipline carries over.
- `dates.ts`: `today()`, `addDays()`, `toPtTimeLabel()`. The 1M / 3M / 6M / 1Y / 2Y / 5Y / All preset → date-window mapper builds on `addDays()`. "All" must remain a bounded sentinel (never unbounded) per the v1 T-02-31 pattern.
- `EmptyState.svelte`: use for the "no data for this ticker in this range" message after the auto-widen fallback exhausts.
- `FilterBar.svelte`: form-style wrapper. The new ticker switcher + selector + range bar may need a new wrapper component (`ExplorerHeader.svelte`?) that's sticky and pill-styled — FilterBar is a simpler form layout.

### Established Patterns
- **Server-render with URL-as-state** — `+page.server.ts` parses search params via Zod, queries DAL, returns aligned data. Client uses `goto(url, { replaceState: true, noScroll: true, keepFocus: true })` to round-trip filter changes.
- **Loader-does-gap-fill** — DAL returns only buckets with rows; the loader enumerates expected keys (using `date-fns/eachWeekOfInterval` etc.) and aligns. Keeps SQL straightforward.
- **Dynamic import for ECharts** — `Chart.svelte` keeps ~800KB out of the SSR bundle. New explorer must do the same.
- **Cache-Control discipline** — `/trends` uses `max-age=300`; home (today's data) uses `max-age=60`. Explorer should follow: short for "live" today-inclusive views, longer for static-history views.
- **Per-angler copy constants** — never inline `'fish/angler'`; import from `metrics.ts`.

### Integration Points
- `src/routes/explorer/+page.server.ts` + `+page.svelte` — new route
- `src/routes/+layout.svelte` — add `{ href: '/explorer', label: 'Explorer' }` to `navItems` (placement TBD during planning — likely first or after `/`)
- `src/lib/shared/urlState.ts` — add `ExplorerFiltersSchema` + `parseExplorerFilters` + `serializeExplorerFilters`
- `src/lib/db/queries/` — extend `trends.ts` (or new `explorer.ts`) with the landing-ticker query and any new aggregation shapes (boat-ticker species-overlay; species-ticker boat-overlay)
- `src/lib/db/boats.ts` — new `findBySlug()`, new `listBoatsByActivity()` helper (returns ordered list for the dropdown)
- `src/lib/db/migrations.ts` — new migration: add `boats.slug` column + backfill from `display_name`
- Boat-ingestion path (whichever scraper module writes to `boats`) — generate slug on first-seen, leave slug untouched on subsequent updates

</code_context>

<specifics>
## Specific Ideas

- **"Stock-chart for fish"** — the framing the operator keeps using. Sticky top-bar with ticker pills + selector + range buttons matches that mental model (TradingView-style).
- **Auto-widen on empty default** — never blank screen on first load. The note `"No 1Y data — showing full history."` should match the operator-readable, plain-English copy tone.
- **Selection-translation on ticker-type switch** (D-08) — `boat → species → species this boat catches most` keeps the angler's exploration coherent across axes. This is a small smart-default that pays off; planner should make sure the cross-axis lookup uses the active range, not all-time.
- **Slug = pacific-voyager** — illustrative; planner picks the exact slugify rules. Lowercase, hyphenated, ASCII; collisions resolved with numeric suffix; frozen at first ingestion.

</specifics>

<deferred>
## Deferred Ideas

None from this discussion — both selected areas stayed within Phase 6 scope.

Items the planner / researcher should treat as **planner contingencies** (not deferred, but not Phase 6 default scope):

- **`boat_monthly_yields` materialized table** — only build if D-20's profiling shows >300ms server time at the `All` range. Plan should include the trigger condition + the migration shape, but not implement upfront.
- **User-facing granularity toggle (Daily / Weekly / Monthly)** — D-18 ships auto-only. If anglers ask for control during/after Phase 6, add in a later milestone.
- **Combobox / type-ahead selector** — D-06 ships plain `<select>`. If 30+ boats becomes painful in practice, revisit.

</deferred>

---

*Phase: 06-explorer-foundation*
*Context gathered: 2026-04-30*
