# Phase 8: Home, Retire, Polish - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace v1's "Today's Counts" home page with a "what's been biting" front
door, retire the v1 read surfaces (`/picker`, `/trends`, calendar heatmap,
forecast pipeline) behind 301 redirects, fix the `/compare` boat-ID input,
and ship the polish (error / loading / empty states, descriptive titles,
dark mode, Phase 7 chart-axis carry-forward) needed for "shareable with a
fishing buddy."

In scope:
- New `/` home page: top-5 boats per viable trip type (≥5 trips/7d), past 7
  days, fish/angler ranked, per-section bar normalization, trip count beside
  fpa for n=1 honesty
- `trip_type_aliases` table + admin page so the operator can keep series
  continuous when the source site renames labels
- Delete `/picker`, `/trends`, calendar heatmap, `src/lib/forecast/`,
  `forecasts` table (migration drop), `scripts/forecast-benchmark.ts`,
  3-file allowlist lint, nightly forecast recompute hook, row-count <50%
  silent-failure alert; aggressive sweep of internal references
- Replace `/compare` boat-ID input with a name typeahead picker matching
  the explorer pattern
- Polish across every route: friendly error pages, loading skeletons,
  explanatory empty states, descriptive `<title>` per route, three-mode
  theme system (Auto/Light/Dark)
- Phase 7 carry-forward: chart x-axis `category` → `time`; explicit
  Daily / Weekly / Monthly granularity selector for ranges ≥3M

Out of scope (deferred to later phases or backlog):
- Home-page filters (trip-type filter, time-window switcher) — defer to
  later; Phase 8 home ships filter-free with no URL state of its own
- "Top species this week" section — spike showed weekly membership too
  stable to be interesting (revisit as rank-shift signal later)
- Skunked-trip / zero-angler defensive code (zero such cases in 14 months)
- Sparse trip types (1/2 Day Twilight, Overnight, 3.5 Day, 3/4 Day) get
  hidden in 7d view, not surfaced under a longer-window section in v1
- Multi-window switcher on home page (yesterday / 7d / 30d) — defer
- Site-wide cross-device theme persistence (requires account system that
  doesn't exist)
- "Long Range" home-page section — confirmed absent from 3.7yr of data

</domain>

<decisions>
## Implementation Decisions

### Trip-type alias mapping (cross-cutting — affects DAL, ingest, home, explorer, /compare)

- **D-01:** Aliases are a **read-time translation layer**, not a write-time
  rewrite. Raw scraped data in `catch_reports.trip_type` stays untouched.
  Reads consult the alias table to merge renamed labels into a preferred
  display name. Reversible by definition: edit or delete an alias and the
  rename undoes everywhere.
- **D-02:** New table: `trip_type_aliases` with columns roughly
  `(source_label PRIMARY KEY, canonical_label, status, accepted_at,
  notes)`. `status` is one of `aliased` (merge into canonical_label),
  `accepted` (this is its own canonical label, no merge), or `pending`
  (operator hasn't decided — show "NEW" badge). Schema specifics are
  Claude's discretion at planning; the *behavior* above is the contract.
- **D-03:** Home-page query and explorer queries (boat ticker, species
  ticker, landing ticker, /compare) all consult the alias table via a
  shared DAL helper. There is one canonical "what label does this trip
  belong to?" function — never inline mapping logic in route loaders.
- **D-04:** Operator edit UX is a **password-gated `/admin/trip-types`
  route** in the SvelteKit app, not a CLI and not a JSON-in-repo file.
  Page lists every distinct `source_label` ever scraped with first-seen,
  last-seen, trip-count, current status. Per-row actions: alias to an
  existing canonical label (typeahead), accept as own canonical label, or
  leave pending. Auth mechanism is Claude's discretion (env-var-set
  bearer token / basic auth / single-password cookie — pick the lightest
  one). Mobile-usable at 375px (operator may adjudicate from a phone).
- **D-05:** "NEW" badge appears on any trip-type label whose alias-table
  status is `pending`. Badge stays until the operator adjudicates (aliases
  it or accepts it). No auto-expiry, no time threshold. Honest signal:
  "we haven't decided what this label is yet."
- **D-06:** Phase 8 ships the alias table **pre-seeded with confident
  merges** for the 22 historical labels surfaced in the spike. Operator
  reviews the seed; ambiguous one-offs (5 Day, 7 Day, Lobster, etc.) ship
  as `pending` and badge accordingly. Confident seeds (e.g.
  `"Extended 1.5 Day" → "1.5 Day"`, `"Full Day Coronado Islands" →
  "Full Day"`) are the data migration's first commits and are reversible
  via the admin page if the operator disagrees.

### Home page (`/`)

- **D-07:** New home page replaces v1's "Today's Counts" dashboard
  entirely. The today-fallback bug (blank page before the morning scrape
  runs) is fixed by definition because the new page shows past-7-days,
  not today.
- **D-08:** Sections = **one per viable trip type**, ordered by 7-day
  trip count descending. "Viable" = ≥5 trips in past 7 days, *after*
  alias-table merging. Today that yields 7 sections: 1/2 Day AM, Full
  Day Coronado Islands (or its merged-into label), 1/2 Day PM, 1.5 Day,
  Full Day, 3 Day, 2 Day. Number of sections varies week to week as
  trip-type activity shifts.
- **D-09:** Each section: **top 5 boats by fish-per-angler** over the past
  7 days. Each row shows boat name, trip count this week, fish/angler.
  Per-row layout includes raw catch + angler totals as supporting context
  beside the headline fpa (matches the spike report's `Premier · 5.5
  fish/angler · 45 anglers · 247 total` framing).
- **D-10:** **Bar widths normalize per section.** The within-section
  reference scale is the section's own max fpa (or a fixed multiple of
  the section median — pick the cleaner-looking option at planning;
  per-section *max* is the simpler default). NO global axis. The 30×
  scale variance between Overnight and 3.5 Day would compress short
  trips into invisibility on a global axis.
- **D-11:** Minimum trips per boat for the 7d window = **1**. n=1 cells
  ship; trip count beside the fpa is what makes them honest. CLAUDE.md
  rule: "show data with context, let anglers judge thin data."
- **D-12:** No "top species this week" section in Phase 8 — spike showed
  weekly membership 9/10 overlap with 30d, so the leaderboard is dull.
  Revisit later as a rank-shift visualization, not a leaderboard.
- **D-13:** Sparse trip types (Twilight, Overnight, 3.5 Day, 3/4 Day in
  most weeks) are **hidden** in the 7d view, not surfaced under a longer-
  window section. Page is already 7 sections tall; clean focus beats
  completeness for v1.
- **D-14:** Home page ships **without filters** in Phase 8 — no trip-type
  filter, no time-window switcher. URL has no query state of its own.
  Phase 9 (Sharing) does NOT need to round-trip home-page state because
  there is no home-page state to round-trip. If the operator wants
  filters later, a follow-up phase adds them and Phase 9's URL contract
  extends.
- **D-15:** Home-page query strategy is Claude's discretion. The cleanest
  shape is one query returning rows pre-grouped by canonical trip type;
  splitting per-section is also fine. Performance budget: the page must
  not regress mobile TTFB. Cache-Control discipline same as Phase 6.

### v1 retirement

- **D-16:** Delete the routes: `src/routes/picker/` and `src/routes/trends/`
  removed entirely. Calendar heatmap component (consumer of `/picker`)
  also deleted.
- **D-17:** **Bare `/explorer` redirect** for everything. `/picker`,
  `/picker?...anything`, `/trends`, `/trends?...anything` → `/explorer`
  with no query-param translation. Rationale: the explorer covers what
  the picker covered, and the operator does not want elaborate param
  mapping. Drop the v1 query strings silently.
- **D-18:** **301 permanent redirects** (not 302). Search engines transfer
  weight to `/explorer` over time; browsers cache aggressively. Right
  signal because these routes aren't coming back.
- **D-19:** Retirement of forecast pipeline:
  - Delete `src/lib/forecast/` (compute, recompute, benchmark code)
  - Delete `scripts/forecast-benchmark.ts`
  - Migration: drop `forecasts` table (and any forecast-related tables;
    audit `src/lib/db/forecasts.ts` at planning time)
  - Remove forecast nightly recompute hook from `src/lib/server/scheduler.ts`
  - Delete forecast UI surfaces if any remain after route deletion
- **D-20:** Remove the **3-file per-angler allowlist lint** — no longer
  applicable per the v2 trust-the-audience principle. The lint enforced
  the now-deleted mandatory trip-type segmentation rule.
- **D-21:** Replace **row-count <50% silent-failure alert** with
  scraper/parser-failure-only alerting. Off-season zero-row days are
  normal and would false-positive every winter under the v1 rule.
- **D-22:** **Aggressive whole-repo sweep** for `/picker` and `/trends`
  references: source files, tests, docs, README, `/about` page copy,
  nav, footer, planning notes that survive into the project. Use
  `git grep -nE "/(picker|trends)"` (excluding `:^.planning :^node_modules
  :^milestones`). Update or delete each hit. Delete v1-only test files
  for retired surfaces (heatmap tests, picker route tests, forecast
  benchmark tests, etc.).
- **D-23:** Update `/about` page copy: drop picker / forecast / heatmap
  references; describe v2 explorer + home page + alias mapping; keep the
  source-attribution + scrape-cadence + per-angler-caveat sections (they
  carry forward unchanged).

### `/compare` route fix (stays in v2)

- **D-24:** Replace the boat-ID input with a **name-based typeahead
  picker** matching the explorer's `TickerPills` / boat-search pattern.
  Reuse the same component or extract a shared `BoatPicker` component if
  the explorer's version is too coupled to its surrounding state. Either
  approach is Claude's discretion — exact UX target is "selecting a boat
  on `/compare` should feel exactly like selecting a boat ticker on the
  explorer."
- **D-25:** `/compare` queries also consult the alias table (D-03) so
  side-by-side comparisons show continuous history across renames.

### Theme system (light / dark / follow-system)

- **D-26:** Three modes: **Auto** (follow OS `prefers-color-scheme`),
  **Light**, **Dark**. Auto is the default on first visit. Per-device
  persistence: toggle on a device, that device remembers the choice;
  other devices stay on Auto. No cross-device sync (no account system).
- **D-27:** Toggle UX is a **single cycle button with a sun/moon icon**
  in the page header. Click cycles Auto → Light → Dark → Auto. CRITICAL:
  the icon must reflect the **current** state (not the next state). If
  current is Dark, show a moon. If Auto, show a sun-with-moon
  composite (or distinct "auto" glyph). Add an aria-label describing
  current state and what clicking will do. Tooltip on desktop hover so
  the cycle order is discoverable.
- **D-28:** **Zero flash on first paint.** Theme choice is stored in a
  cookie (not localStorage) so the SSR loader can read it and emit the
  correct `data-theme` attribute (or class) on the HTML root before any
  CSS loads. No flash of unstyled / wrong-theme content, ever. Worth the
  small extra plumbing cost for a "shareable with friends" polish bar.
  Cookie name and SameSite settings are Claude's discretion (lean
  SameSite=Lax, 1-year expiry).
- **D-29:** Implementation strategy for the dark palette is Claude's
  discretion. Two reasonable approaches:
  (a) Parallel CSS-variable set keyed by `[data-theme="dark"]` on
      `<html>` (Tailwind 4 + CSS custom properties)
  (b) Tailwind 4's native dark variant (`dark:` classes) toggled by the
      same `<html>` attribute
  Pick whichever gives less duplication given Phase 6/7's existing
  `--color-*` token usage. Audit the existing tokens during research;
  every named token (`--color-surface`, `--color-border`, `--color-text-*`,
  any chart palette) needs a dark counterpart.
- **D-30:** ECharts theme integration: charts must respect the chosen
  theme. Background, axis labels, legend, tooltip, moon-overlay sine
  curve all swap. Approach is Claude's discretion (ECharts theme JSON,
  or pass `option.darkMode` + per-series colors). Test at every range
  preset including the All view.

### Polish (every route)

- **D-31:** **Friendly error boundary** on every route. No stack traces,
  no blank pages. Page reads "something broke on our end" with a link
  back to `/` and a one-line context line. Tone is neutral and concise
  — not jokey, not apologetic-grovelling. Status pages return appropriate
  HTTP codes (500 / 404 / etc.) so monitoring still works.
- **D-32:** **Loading states** during chart fetches: skeleton-style (gray
  shimmery placeholder shaped like the chart) is preferred over a
  centered spinner where the visual structure is known. Spinner is fine
  for non-chart waits where there's no shape to skeleton (e.g. typeahead
  result load). Pick per-surface at planning time.
- **D-33:** **Empty states** with explanatory copy: "this boat has no
  scraped trips in this range — try widening the range." Tickers with
  zero history get a different copy than tickers whose history is just
  outside the current range. Specific copy strings are Claude's
  discretion; tone matches the FishCount voice (plain English, no jargon,
  per CLAUDE.md).
- **D-34:** **Descriptive `<title>` per route** so shared / pinned /
  bookmarked URLs look right in the browser tab and on social-share
  preview cards. Format: `{Page-specific} — FishCount`. Examples:
  - `/` → `What's been biting — FishCount`
  - `/explorer?ticker=boat&name=Premier` → `Premier — FishCount`
  - `/explorer?ticker=species&name=yellowtail` → `Yellowtail — FishCount`
  - `/about` → `About FishCount`
  Boat / species / landing names use the verbatim source label (with
  alias-table canonical name if applicable).

### Phase 7 carry-forward — chart axis + granularity

- **D-35:** Migrate the explorer chart's x-axis from `category` (string
  labels) to `time` (real timestamps). Required for moon overlay
  alignment at long ranges and for the granularity selector to work
  correctly. Verify at every range × granularity combination that:
  (a) gap-aware bucketing still works, (b) the moon sine row stays
  aligned, (c) tooltip date formatting still reads in PT (not UTC).
- **D-36:** **Granularity selector** with Daily / Weekly / Monthly
  buttons. Defaults per range:
  - 1M / 3M / 6M → Daily
  - 1Y / 2Y / 5Y / All → Weekly
  - Monthly is never a default; it's available as a manual override.
    Operator chose Weekly for All (3.7yr ≈ 260 weekly buckets) — dense
    but readable; monthly is one click away if anyone wants it.
- **D-37:** Selector lives in **`ExplorerHeader`** alongside the range
  strip — keeps all "how the chart is shaped" controls in one row.
  Hide the selector when range < 3M (no meaningful Weekly/Monthly
  alternative). Same hide rule for any range where granularity choice
  collapses to a single option.
- **D-38:** **Range switch resets granularity to the new range's default.**
  Switch from 1M (Daily) to 1Y → granularity becomes Weekly automatically.
  If the operator overrides on the new range, that override sticks until
  they switch ranges again. Simpler mental model: "each range has its
  own natural granularity, I rarely override it."
- **D-39:** Granularity is a URL parameter (extends `ExplorerFiltersSchema`).
  Round-trips through Phase 9's share-the-chart contract. Default values
  are NOT serialized (clean-URL pattern from Phase 7's `moon` flag).

### Cross-cutting executor instruction

- **D-40:** **Self-validate UI work in the browser before declaring done.**
  After every UI-affecting change, run the dev server, click through the
  golden path and obvious edge cases (375px mobile, dark mode, empty
  states, error pages), take screenshots, and surface any bugs or
  improvement opportunities you spot. Type checking + tests verify code
  correctness, not feature correctness. Skip self-validation only when a
  change isn't observable in the browser, and say so explicitly.

### Claude's Discretion

- Exact admin auth mechanism (D-04) — pick the lightest secure option
- Schema specifics for `trip_type_aliases` (D-02) — column types, indexes
- Home-page query shape (D-15) — single grouped query or per-section
- Bar normalization arithmetic (D-10) — section max vs k × median
- Per-section heading copy ("1/2 Day AM (17 trips this week)" vs other)
- Skeleton vs spinner per surface (D-32)
- Empty-state copy strings (D-33)
- Error-page copy strings (D-31)
- Auth cookie name / lifetime / SameSite (D-28)
- Dark palette token strategy — parallel CSS vars vs Tailwind dark:
  classes (D-29)
- ECharts theme integration approach (D-30)
- "NEW" badge visual style (color, placement) (D-05)
- Wave-split of plans — design notes speculate 4 plans; planner picks
  the actual cut

### Folded Todos

- **`compare-page-boat-id-picker`** — folded into D-24. The pending todo
  in `.planning/todos/pending/compare-page-boat-id-picker.md` (if it
  still exists) is satisfied by Phase 8.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Vision, scope, requirements (project-level)

- `.planning/PROJECT.md` — v2 vision, "trust the audience" principle,
  Phase 8 scope (home, retire, polish), Out-of-Scope list (gamification,
  ML forecasts, etc.)
- `.planning/REQUIREMENTS.md` §RTR (RTR-01..09) — v1 retirement, §POL
  (POL-01..05) — polish, §EXPL — explorer foundation Phase 8 modifies
- `.planning/ROADMAP.md` §"Phase 8: Home, Retire, Polish" — goal + 6
  success criteria (front door, alias drift handled, v1 retired,
  /compare fixed, polish, Phase 7 chart-axis carry-forward)
- `CLAUDE.md` — operator voice, domain language verbatim list, "show
  data with context" rule, "trust the audience"

### Phase 8-specific design grounding

- `.planning/notes/front-door-design-decisions.md` — discovery /
  ranking / mixed jobs-to-be-done framing; locked decisions on home-page
  scope (top boats per trip type, 7d, fpa, no top-species, no filters)
- `.planning/notes/v1-retirement-pull-forward.md` — rationale for folding
  Phase 10 retirement into Phase 8; redirect strategy notes (operator
  has since simplified to bare /explorer per D-17)
- `.planning/notes/phase-7.5-spike-report.md` — full data spike report
  including 3.7-year backfill addendum; 22-label trip-type inventory;
  per-section bar normalization rationale; n=1 honesty rule; null/zero/
  duplicate data-quality confirmation
- `.planning/spikes/001-phase-7.5-data-exploration/report.md` — same
  content, in spike directory
- `.planning/spikes/001-phase-7.5-data-exploration/data.json` — raw
  numbers backing the home-page design decisions

### Prior phase context

- `.planning/phases/06-explorer-foundation/06-CONTEXT.md` — explorer
  architecture; URL state contract (`ExplorerFiltersSchema`); chart
  conventions; cross-axis defaults; ticker pill / range strip pattern
  the granularity selector and `/compare` boat picker reuse
- `.planning/phases/07-moon-phase-overlay/07-CONTEXT.md` — moon overlay
  architecture; clean-URL serialization pattern (default values not
  serialized — extends to D-39 for granularity); copy module pattern
  (`src/lib/copy/moon.ts`); chart x-axis conversation that lands as D-35
  here

### Architecture rules (carrying forward, non-negotiable)

- **DAL boundary** — all SQL goes through `src/lib/db/`. Alias-table
  helper, home-page query, `/compare` query, retirement-related queries
  all live in DAL. No SQL in route loaders.
- **Date discipline** — `src/lib/shared/dates.ts` is the only producer
  of dates. PT-canonical, `YYYY-MM-DD`. No `new Date()` in route loaders
  or components. Granularity-bucketing math uses these primitives.
- **Single date producer** — same as above; static-grep test enforces it
- **Idempotent ingest** — alias-table seed migration must be idempotent
  (re-runnable). Same for the `forecasts` table drop.
- **Static-grep / lint discipline** — the 3-file per-angler allowlist
  lint is being removed (D-20); confirm no new lints replace it. The
  DAL-boundary static-grep test stays.

### Existing code touch-points

- `src/routes/+page.svelte` + `src/routes/+page.server.ts` — current
  "Today's Counts" home page. Phase 8 replaces both.
- `src/lib/components/PageHeader.svelte`, `FilterBar.svelte`,
  `BoatRow.svelte`, `EmptyState.svelte` — existing home-page components.
  Some carry forward into the new home, some retire.
- `src/lib/components/ExplorerHeader.svelte` — adds granularity selector
  (D-37) and theme toggle (D-27)
- `src/lib/components/Chart.svelte` — receives axis-type change (D-35),
  ECharts theme integration (D-30)
- `src/lib/shared/urlState.ts` — `ExplorerFiltersSchema` extended with
  `granularity` (D-39); `serializeHomeFilters` likely retired (D-14
  removes home-page URL state)
- `src/lib/shared/dates.ts` — bucket helpers may need additions for the
  granularity selector (Daily/Weekly/Monthly canonical bucket boundaries
  in PT)
- `src/lib/db/queries/trends.ts` — already has weekly/monthly aggregation
  from v1; verify alias-table integration and granularity contract
- `src/lib/db/queries/compare.ts` — `/compare` DAL; consults alias table
  per D-25
- `src/lib/db/forecasts.ts` — deleted entirely (D-19)
- `src/lib/forecast/` — deleted entirely (D-19)
- `scripts/forecast-benchmark.ts` — deleted (D-19)
- `src/lib/server/scheduler.ts` — forecast recompute hook removed (D-19)
- `src/lib/copy/metrics.ts` — pattern for new copy modules
  (`src/lib/copy/home.ts`, `src/lib/copy/admin.ts`, `src/lib/copy/theme.ts`,
  `src/lib/copy/empty-states.ts` are likely additions)
- `src/routes/about/` — copy update (D-23)
- `src/routes/picker/`, `src/routes/trends/` — deleted (D-16); 301s
  configured in `src/hooks.server.ts` or per-route `+server.ts`
- `drizzle/` — new migration: alias-table create + seed; forecasts
  table drop

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`Chart.svelte`** (`src/lib/components/`) — ECharts dynamic-import
  wrapper. Receives x-axis type change (D-35) and theme integration
  (D-30). The Phase 7 moon sub-chart pattern (sub-grid + synced x-axis)
  is the model.
- **`ExplorerHeader.svelte`** — already holds ticker pills + range strip;
  granularity selector (D-37) and theme toggle (D-27) slot in here.
  Already mobile-tested at 375px in Phase 6.
- **`TickerPills.svelte`** + boat-search pattern — `/compare` boat picker
  (D-24) reuses or extracts from this. The component currently couples
  to ticker-type switching; extracting a `BoatPicker` core may be the
  cleaner path.
- **`PageHeader.svelte`** — pattern for the new home-page header; carries
  the theme toggle on every route.
- **`EmptyState.svelte`** — reused for D-33 empty states across the
  explorer, /compare, and the new home page. May need variant copy /
  illustration props.
- **`urlState.ts`** — `ExplorerFiltersSchema` (Zod) extended with
  `granularity` (D-39). Clean-URL serialization (don't serialize
  defaults) is the established pattern from Phase 7's `moon` flag.
- **`dates.ts`** — `today()`, `addDays()`, `toPtTimeLabel()`. Granularity
  bucketing math (D-36) lives next to these as pure helpers.
- **`metrics.ts`** + `moon.ts` (`src/lib/copy/`) — copy module pattern.
  New modules likely: `home.ts`, `admin.ts`, `theme.ts`,
  `empty-states.ts`, `error-page.ts`.

### Established Patterns

- **URL-as-state** — explorer state lives in URL (extends to granularity
  per D-39). Home page deliberately has none (D-14).
- **Loader-does-shape, DAL-stays-pure** — alias-table helper is a pure
  DAL function consumed by every loader that surfaces trip-type labels.
- **ECharts dynamic import** — must remain. Theme integration (D-30)
  must not bundle ECharts into the SSR path.
- **Reactive on filter change** — Phase 6/7 ship chart re-render on form
  state change. Granularity selector slots into the same flow.
- **Cache-Control discipline** — home-page response headers shouldn't
  regress Phase 6's caching; the alias-table read is on the hot path.
- **Cookie-driven SSR theme** (new in Phase 8) — `+layout.server.ts` (or
  `hooks.server.ts`) reads the theme cookie and forwards to layout for
  `<html data-theme>` rendering. Pattern is new; document it for Phase 9
  / 10 if any future server-rendered preference needs the same.

### Integration Points

- `drizzle/` — new migration creating `trip_type_aliases`; pre-seed
  insert; forecasts-table drop migration; both idempotent
- `src/hooks.server.ts` — 301 redirect handlers for `/picker`, `/trends`
  (and any subpaths); cookie reading for theme SSR
- `src/lib/db/aliases.ts` (new) — alias-table DAL: lookup by source
  label, list-all-with-status (admin), create/update/delete
- `src/lib/db/queries/home.ts` (new) — home-page section query: top-N
  boats per viable trip type, past 7 days, fpa, alias-table-aware
- `src/routes/+page.server.ts` — replaced (current today's-counts loader
  retired)
- `src/routes/+page.svelte` — replaced (current today's-counts page
  retired)
- `src/routes/admin/trip-types/+page.server.ts` + `+page.svelte` (new) —
  admin route, password-gated
- `src/routes/api/admin/trip-types/+server.ts` (new) — alias CRUD
  endpoints consumed by the admin page
- `src/routes/explorer/+page.server.ts` — extends with granularity
  resolution (D-36, D-38) and alias-aware queries (D-03)
- `src/routes/compare/+page.server.ts` + `+page.svelte` — boat picker
  swap (D-24), alias-table integration (D-25)
- `src/routes/about/+page.svelte` — copy update (D-23)
- `src/lib/components/ExplorerHeader.svelte` — granularity selector
  (D-37), theme toggle (D-27)
- `src/lib/components/ThemeToggle.svelte` (new) — cycle button per D-27
- `src/lib/components/GranularitySelector.svelte` (new) — per D-37
- `src/lib/components/NewLabelBadge.svelte` (new) — per D-05
- `src/lib/server/scheduler.ts` — remove forecast nightly recompute hook
  (D-19); update silent-failure alert (D-21)
- `src/app.css` (or wherever palette tokens live) — dark-mode token set
  (D-29)

</code_context>

<specifics>
## Specific Ideas

- **"Treat me like a product manager, not a tech lead"** — operator
  framing, durable. Engineering decisions that have no user-visible
  difference are Claude's call (see "Claude's Discretion" list).
  Decisions that affect what the user/operator does or sees should be
  framed in plain language, with the mechanism as supporting detail.
- **"Self-validate by launching the web and looking at screenshots"** —
  durable executor instruction (D-40). Saved to memory as
  `feedback_self_validate_ui.md`. Run preview, click through, screenshot,
  surface bugs/improvements proactively.
- **"Source site renames trip types and we have to live with it"** —
  the 2026-04-27 "Full Day → Full Day Coronado Islands" relabel is the
  triggering case for D-01..D-06. The aliasing system is built for the
  source-site behavior already observed, not for hypothetical edge cases.
- **"`/explorer` covers what `/picker` covered"** — operator's
  rationale for D-17 (no param translation). Don't over-engineer the
  redirect; the explorer is the destination.
- **"Honest about thin data — show n, let anglers judge"** — CLAUDE.md
  rule that anchors D-11 (n=1 cells ship), D-09 (trip count beside fpa),
  and D-05 ("NEW" badge stays until adjudicated, not auto-expired).
- **"Shareable with a fishing buddy" polish bar** — anchors D-28 (zero
  flash, not "good enough"), D-31 (friendly errors, not stack traces),
  D-32 (skeleton over spinner where shape known).

</specifics>

<deferred>
## Deferred Ideas

- **Top-species "what moved this week" rank-shift visualization** —
  spike showed simple top-species leaderboard is dull (membership too
  stable); rank deltas are interesting but a different visual. Revisit
  after the home page settles.
- **Multi-window switcher on home page** (yesterday / 7d / 14d / 30d) —
  a focused 7d page is the v1 bet; widen later if anglers ask.
- **Trip-type filter on home page** — defer; Phase 8 home is filter-free
  to keep the front door clean.
- **Sparse trip-type "low-volume — last N days" section** — Twilight,
  Overnight, 3.5 Day, 3/4 Day are real trip types but produce ≤3 trips
  per week. Hidden in 7d view; revisit if anglers report missing them.
- **Cross-device theme persistence** — would require an account system.
  Out of scope; per-device persistence is the v2 model.
- **Embed / screenshot / image-export for chart sharing** — Phase 9's
  share-the-URL contract is enough for "shareable with friends." See
  REQUIREMENTS.md "Future Requirements" §EXPL-Ex.
- **"Long Range" home-page section** — confirmed absent across 3.7 years
  of data; CLAUDE.md keeps the term in vocab but Phase 8 plans no LR
  surface.
- **Alias-table grouping UX** — operator may want to group dormant
  variants ("3/4 Day Local" + "3/4 Day Islands" + "3/4 Day Offshore")
  under a parent canonical label with sub-aliases. Phase 8 ships the
  flat alias model (single source_label → single canonical_label); a
  hierarchical model is a follow-up if the flat model proves
  insufficient.

### Reviewed Todos (not folded)

- None outstanding. The `compare-page-boat-id-picker` todo is folded
  per D-24.

</deferred>

---

*Phase: 08-home-retire-polish*
*Context gathered: 2026-05-02*
