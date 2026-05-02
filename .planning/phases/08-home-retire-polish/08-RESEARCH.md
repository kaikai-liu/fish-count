# Phase 8: Home, Retire, Polish - Research

**Researched:** 2026-05-02
**Domain:** SvelteKit 2 / Svelte 5 / better-sqlite3 / ECharts 6 / Tailwind 4 — home-page UI, alias DAL, route retirement with 301s, theme system, polish
**Confidence:** HIGH (stack locked, codebase well-documented, all key questions verified)

## Summary

Phase 8 is the v2 "ship it" phase. Almost everything in scope is well-trodden territory in the
current codebase: Phase 6/7 already established the explorer architecture, the URL-state
pattern, the DAL boundary, the date-discipline contract, and the Chart.svelte ECharts wrapper.
The new work — alias DAL, admin auth, theme SSR, 301 redirects, polish — fits cleanly into
those existing patterns without architectural disruption.

The two non-obvious decisions are (1) **how to express read-time alias translation in DAL
prepared statements** without polluting every query with extra joins (recommend a
`canonical_trip_type` SQL expression baked into a small helper, joined only where needed —
not a global SQL view, since the home page's hot-path query benefits from a different shape
than explorer queries), and (2) **dark theme strategy** (recommend Tailwind 4
`@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))` paired with parallel
CSS-variable token blocks — gives both Tailwind `dark:` utilities and CSS-custom-property
overrides for components that already use `var(--color-*)`).

The aggressive sweep for `/picker`, `/trends`, and forecast references found ~50 hits across
source, tests, scripts, and copy — inventoried below as deletion targets.

**Primary recommendation:** Wave-split as follows (planner has final say):
1. **Migrations + alias DAL** — `trip_type_aliases` create + seed, `forecasts` drop, alias
   helper module, alias-aware view of explorer/trends queries
2. **Home page** — new `/` loader + `+page.svelte`, per-section bar normalization, NEW badge
3. **Retirement + redirects** — delete `/picker`, `/trends`, `src/lib/forecast/`, scripts,
   tests; 301 hooks; SLA alert simplification; allowlist lint removal; nav cleanup; /about
   rewrite
4. **Compare fix + polish + theme + chart-axis carry-forward** — `/compare` typeahead,
   error/loading/empty patterns, descriptive titles, three-mode theme, x-axis
   `category→time`, granularity selector

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Trip-type alias mapping (D-01..D-06):**
- D-01: Aliases are read-time translation only. Raw `catch_reports.trip_type` untouched.
  Reversible by editing/deleting alias rows.
- D-02: New table `trip_type_aliases` with columns roughly `(source_label PRIMARY KEY,
  canonical_label, status, accepted_at, notes)`. Status enum: `aliased | accepted | pending`.
- D-03: One canonical "what label does this trip belong to?" function in DAL — never inline
  mapping logic in route loaders.
- D-04: Operator edit UX is a **password-gated `/admin/trip-types` route** in SvelteKit
  (not CLI, not JSON file). Auth mechanism is Claude's discretion. Mobile-usable at 375px.
- D-05: "NEW" badge appears on any `pending`-status label. No auto-expiry.
- D-06: Phase 8 ships pre-seeded with **confident merges** for the 22 historical labels;
  ambiguous one-offs ship as `pending`. Reversible via the admin page.

**Home page (D-07..D-15):**
- D-07: New home replaces today's-counts dashboard entirely.
- D-08: Sections = **one per viable trip type** (≥5 trips/7d after alias merging), ordered
  by 7-day trip count desc.
- D-09: Each section: **top 5 boats by fish-per-angler over 7 days**. Each row: boat name,
  trip count, fpa. Show raw catch + angler totals as supporting context.
- D-10: **Bar widths normalize per-section** (per-section max OR k×median — Claude's call).
  No global axis.
- D-11: Minimum 1 trip per boat. n=1 cells ship; trip count beside fpa makes them honest.
- D-12: No "top species this week" section in Phase 8.
- D-13: Sparse trip types (Twilight, Overnight, 3.5 Day, 3/4 Day in most weeks) hidden in 7d.
- D-14: Home page ships **without filters**. URL has no query state of its own.
- D-15: Home-page query strategy is Claude's discretion. Cache-Control discipline matches
  Phase 6.

**v1 retirement (D-16..D-23):**
- D-16: Delete `src/routes/picker/` and `src/routes/trends/`. Calendar heatmap deleted.
- D-17: **Bare `/explorer` redirect** for everything. No query-param translation. Drop v1
  query strings silently.
- D-18: **301 permanent redirects** (not 302).
- D-19: Forecast pipeline retirement: delete `src/lib/forecast/`, `scripts/forecast-benchmark.ts`,
  drop `forecasts` table, remove forecast hook from `src/lib/server/scheduler.ts`.
- D-20: Remove the **3-file per-angler allowlist lint**.
- D-21: Replace **row-count <50% silent-failure alert** with scraper/parser-failure-only.
- D-22: **Aggressive whole-repo sweep** for `/picker` and `/trends` references.
- D-23: Update `/about` page copy.

**`/compare` route fix (D-24, D-25):**
- D-24: Replace boat-ID input with **name typeahead picker** matching the explorer pattern.
- D-25: `/compare` queries also consult the alias table (D-03).

**Theme system (D-26..D-30):**
- D-26: Three modes: **Auto / Light / Dark**. Auto is the default. Per-device persistence.
- D-27: **Single cycle button with sun/moon icon** in header. Click cycles Auto→Light→Dark.
  Icon must reflect **current** state. Aria-label describes current state and what clicking
  will do.
- D-28: **Zero flash on first paint.** Cookie-based theme (not localStorage), SSR reads,
  emits correct `data-theme` on `<html>` before CSS loads. SameSite/lifetime is Claude's
  discretion (lean SameSite=Lax, 1-year).
- D-29: Dark palette strategy is Claude's discretion: parallel CSS vars vs Tailwind `dark:`.
- D-30: ECharts theme integration: charts respect chosen theme. Background, axis, legend,
  tooltip, moon sine curve all swap. Approach is Claude's discretion.

**Polish (D-31..D-34):**
- D-31: Friendly error boundary every route. Plain English. Status codes preserved.
- D-32: Skeleton loading for charts (shape known); spinner for typeahead. Per-surface call.
- D-33: Empty states with explanatory copy. Different copy for "ticker has no history" vs
  "history is just outside current range."
- D-34: Descriptive `<title>` per route. Format: `{Page-specific} — FishCount`.

**Phase 7 carry-forward (D-35..D-39):**
- D-35: Migrate explorer chart x-axis from `category` to `time`. Preserve gap-aware bucketing,
  moon alignment, PT tooltip dates.
- D-36: **Granularity selector** Daily/Weekly/Monthly. Defaults: 1M/3M/6M → Daily;
  1Y/2Y/5Y/All → Weekly. Monthly never default.
- D-37: Selector lives in **`ExplorerHeader`** alongside range strip. Hide when range < 3M.
- D-38: **Range switch resets granularity to new range's default.** Override sticks until
  next range switch.
- D-39: Granularity is a URL parameter on `ExplorerFiltersSchema`. Default values NOT
  serialized (clean-URL pattern).

**Cross-cutting:**
- D-40: **Self-validate UI in browser before declaring done.** Run preview, click through
  golden path, screenshot, surface bugs. Skip only when change isn't observable.

### Claude's Discretion
- Admin auth mechanism (D-04) — pick the lightest secure option
- `trip_type_aliases` schema specifics (D-02) — column types, indexes
- Home-page query shape (D-15) — single grouped vs per-section
- Bar normalization arithmetic (D-10) — section max vs k × median
- Per-section heading copy
- Skeleton vs spinner per surface (D-32)
- Empty-state copy strings (D-33)
- Error-page copy strings (D-31)
- Auth cookie name / lifetime / SameSite (D-28)
- Dark palette strategy — parallel CSS vars vs Tailwind `dark:` (D-29)
- ECharts theme integration approach (D-30)
- "NEW" badge visual style (D-05)
- Wave-split of plans (planner picks)

### Deferred Ideas (OUT OF SCOPE — do NOT research)
- Top-species rank-shift visualization
- Multi-window switcher on home page
- Trip-type filter on home page
- Sparse trip-type "low-volume" section
- Cross-device theme persistence (would require accounts)
- Embed / screenshot / image-export
- Hierarchical alias-table grouping UX
- "Long Range" home-page section (confirmed absent)
</user_constraints>

<phase_requirements>
## Phase Requirements

### Pre-existing requirement IDs (from REQUIREMENTS.md §RTR, §POL)

| ID | Description | Research Support |
|----|-------------|------------------|
| RTR-01 | `src/routes/picker/` deleted | §"Aggressive Retirement Inventory"; §"301 Redirect Pattern" |
| RTR-02 | `src/lib/forecast/` deleted | §"Aggressive Retirement Inventory" |
| RTR-03 | `forecasts` table dropped + nightly recompute removed from scheduler | §"Idempotent Forecasts-Table Drop"; §"Scheduler Trim" |
| RTR-04 | Calendar heatmap component deleted | §"Aggressive Retirement Inventory" |
| RTR-05 | 3-file per-angler allowlist lint removed | §"Per-angler Lint Removal" |
| RTR-06 | Row-count <50% silent-failure alert replaced with scraper/parser-failure-only | §"SLA Alert Simplification" |
| RTR-07 | `/about` page copy updated to drop picker/forecast/heatmap | §"/about Rewrite" |
| RTR-08 | `/trends` and `/compare` v1 routes retired or redirected | Note: `/compare` is **kept** in v2 with a fix per D-24/D-25; only `/trends` retires |
| RTR-09 | All v1-only tests for retired features removed | §"Aggressive Retirement Inventory" |
| POL-01 | Friendly error boundary per route | §"Error Boundary Pattern (SvelteKit 2)" |
| POL-02 | Loading skeletons / spinners during chart fetches | §"Loading State Patterns" |
| POL-03 | Empty states for tickers with no data | §"Empty State Pattern" |
| POL-04 | Descriptive `<title>` per route | §"Title Pattern (`<svelte:head>`)" |
| POL-05 | Light/Dark/Auto theme toggle persisting across visits | §"Theme System (Cookie-Driven SSR)" |

### New requirement IDs that plan-phase will mint (suggested shape — planner has final authority)

| Suggested ID | Description | Research Support |
|--------------|-------------|------------------|
| HOME-01 | New `/` shows per-trip-type sections, ≥5 trips/7d after alias merge | §"Home-Page Query Strategy" |
| HOME-02 | Each section: top 5 boats by fpa, with trip count + raw catch/anglers shown | §"Home-Page Section Shape" |
| HOME-03 | Bars normalize per section (not globally) | §"Per-Section Bar Normalization" |
| HOME-04 | NEW badge on rows whose alias status is `pending` | §"NEW Badge UX" |
| HOME-05 | Home page ships filter-free; no URL state | (D-14 — straight implementation) |
| ALI-01 | `trip_type_aliases` table created via idempotent migration | §"Alias Table Schema + Seed Migration" |
| ALI-02 | Alias-aware DAL helper consulted by all trip-type-surfacing queries | §"Alias DAL Helper Module" |
| ALI-03 | `/admin/trip-types` route password-gated, mobile-usable, lists all distinct labels | §"Admin Auth — Recommendation" |
| ALI-04 | Admin can alias / accept / leave-pending; changes reflected immediately | §"Admin CRUD Endpoints" |
| ALI-05 | Pre-seed migration ships confident merges for 22 historical labels | §"Pre-Seed Migration Content" |
| CMP-01 | `/compare` boat picker is name-typeahead (no boat-ID input) | §"`/compare` Typeahead Pattern" |
| CMP-02 | `/compare` queries consult alias table | §"Alias DAL Helper Module" |
| THM-01 | Auto/Light/Dark cycle button in header reflects current state | §"Theme Toggle UX" |
| THM-02 | Theme cookie SSR — zero flash | §"Theme System (Cookie-Driven SSR)" |
| THM-03 | ECharts charts respect theme | §"ECharts Theme Integration" |
| GRN-01 | Granularity selector Daily/Weekly/Monthly extends `ExplorerFiltersSchema` | §"Granularity URL State" |
| GRN-02 | Range switch resets granularity to range's default | §"Range-Switch Reset Behavior" |
| AXS-01 | Chart x-axis migrates `category → time` | §"Chart X-Axis Migration" |
| RDR-01 | `/picker` (any subpath/query) → `/explorer` 301 | §"301 Redirect Pattern" |
| RDR-02 | `/trends` (any subpath/query) → `/explorer` 301 | §"301 Redirect Pattern" |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

These are non-negotiable directives that constrain all plans and tasks:

- **PM-framing for the operator** — explain decisions in plain English; mechanism is supporting detail
- **Ask before destructive actions** — deleting code, force-pushing, dropping data, sending email to real people, rewriting git history. The forecasts-table drop and the /picker /trends deletions are within phase scope (already authorized via D-16, D-19), but every other destructive action needs explicit operator OK
- **Trust operator domain knowledge** — they know SD fishing better than Claude
- **Don't invent rules and present them as the operator's** — if a habit is Claude's recommendation, label it that way
- **Show data with context (n, sample size); never refuse to render thin data** — anchors the n=1 honesty rule (D-11) and the NEW badge rule (D-05)
- **Domain language verbatim** — never normalize trip-type, landing, or species names. Examples: "1/2 Day AM" (not "half-day AM"), "Point Loma Sportfishing" (not "Pt Loma"), "dorado" (not "mahi-mahi"), "per angler" (not "per rod")
- **Per-CLAUDE.md memory** — *PR workflow: default to /gsd-ship*; *Talk PM, not peer engineer*; *Self-validate UI in browser* (matches D-40)

## Architectural Responsibility Map

Phase 8 is a single-tier SvelteKit app on a Node adapter with one SQLite database. There is
no separate API tier; route loaders consume DAL functions and render server-side. The
"tiers" relevant to this phase are layers within that monolith:

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Home-page section data | DAL (`src/lib/db/queries/home.ts`) | Loader (`+page.server.ts`) | DAL boundary rule — all SQL goes through `src/lib/db/`; loader composes shape |
| Alias resolution | DAL (`src/lib/db/aliases.ts`) | Loader (any route surfacing trip_type) | One canonical helper per D-03 |
| Admin alias CRUD | Form action (`src/routes/admin/trip-types/+page.server.ts`) | DAL (alias module) | SvelteKit progressive-enhancement pattern; no separate JSON endpoint needed |
| Admin auth | Hook (`src/hooks.server.ts`) | Cookie-checking helper | One choke-point for the gate; reusable if future admin routes appear |
| 301 redirects (`/picker`, `/trends`) | Hook (`src/hooks.server.ts`) | — | Pre-routing intercept is the cleanest place; no need for placeholder routes |
| Theme cookie SSR | Hook (`src/hooks.server.ts`) + Layout (`+layout.server.ts` + `+layout.svelte`) | Tailwind 4 `@custom-variant` + CSS-variable token block | Hook reads cookie; layout forwards to `<html data-theme>`; CSS does the styling |
| Theme client toggle | Component (`ThemeToggle.svelte`) | — | Writes cookie + re-renders attribute; pure UI |
| ECharts theme integration | Component (`Chart.svelte`) | Loader returns palette tokens or theme name | Chart wrapper already does dynamic import; theme read happens client-side after mount |
| Granularity selector | Component (`GranularitySelector.svelte`) in `ExplorerHeader` | Loader resolves granularity from URL | Same pattern as range strip |
| Chart x-axis time migration | Loader (`/explorer/+page.server.ts` chartOption builder) | Component (`Chart.svelte` consumes new option shape) | Plain JSON change in loader; component already passes through |
| Polish (error/loading/empty/title) | Layout + per-route components | — | `+error.svelte` and `<svelte:head>` are SvelteKit primitives |

## Standard Stack

### Core (already locked, not changing)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SvelteKit | 2.57.1 | App framework | Already in use; Phase 6/7 architecture built on it `[VERIFIED: package.json]` |
| Svelte | 5.55.4 | UI runtime | Runes (`$state`, `$props`, `$effect`) are the project's idiom `[VERIFIED: package.json]` |
| better-sqlite3 | 12.9.0 | DB driver | Phase 1 chose it; synchronous prepared statements fit DAL pattern `[VERIFIED: package.json]` |
| ECharts | 6.0.0 | Charts | Phase 6/7 wrapper already does dynamic import `[VERIFIED: package.json]` |
| Tailwind CSS | 4.2.4 | Styling | v4 is fully CSS-first — `@theme` block in `src/app.css` is the project's idiom `[VERIFIED: package.json]` |
| Zod | 4.3.6 | Schema validation | URL state contract; admin form validation `[VERIFIED: package.json]` |
| date-fns | 4.1.0 | Date math (`eachWeekOfInterval`, `format`) | Already used by `/explorer` loader for bucket axis `[VERIFIED: package.json]` |
| Croner | 10.0.1 | Scheduler | Phase 0/1; will lose forecast hook in this phase `[VERIFIED: package.json]` |
| Pino | 10.3.1 | Logger | Phase 0/1 `[VERIFIED: package.json]` |
| Vitest | 2.1.0 | Test runner | Standard project test framework `[VERIFIED: package.json]` |

### New for Phase 8 — none required

The phase deliberately does **not** add new dependencies. Cookie reading is built into
SvelteKit's `event.cookies` API. Tailwind 4 dark variant uses native `@custom-variant`
syntax; no plugin needed. ECharts theme switching is supported natively in v6 via
`registerTheme` + `setTheme` (or `setOption` with new colors).

### Alternatives Considered (and rejected)

| Instead of | Could Use | Why rejected |
|------------|-----------|--------------|
| Inline alias-aware SQL | Drizzle ORM | Project already chose better-sqlite3 directly; CONTEXT.md `drizzle/` path references are documentation drift — actual migrations are in `src/lib/db/migrations.ts`. Adding Drizzle now is scope creep. |
| `localStorage` theme persistence | Cookie | D-28 explicitly requires zero-flash SSR; localStorage can't be read server-side. |
| Tailwind `dark:class` mode | `@custom-variant dark` with `[data-theme=dark]` | Enables three-mode UX (Auto/Light/Dark) — class mode forces choice between media-query OR class. Custom variant lets `<html data-theme="auto">` fall through to media query, while `data-theme="light|dark"` overrides explicitly. |
| `bcrypt` / passport / lucia for admin auth | Constant-time string compare against env-var | One operator, one route, no user system. Bcrypt + session table is hilarious overkill. See "Admin Auth — Recommendation" below. |
| Separate `/api/admin/trip-types/+server.ts` JSON endpoint | SvelteKit form actions on `/admin/trip-types/+page.server.ts` | Form actions are the SvelteKit idiom for write operations from a page; progressive enhancement, no client-side JSON handling needed. |

**Version verification (run 2026-05-02):**
```
$ npm view tailwindcss version → 4.2.4 (matches package.json)
$ npm view echarts version     → 6.0.0 (matches package.json)
$ npm view @sveltejs/kit version → 2.59.0 (project at 2.57.1, no upgrade needed)
$ npm view svelte version      → 5.55.5 (project at 5.55.4, parity)
$ npm view better-sqlite3 version → 12.9.0 (matches package.json)
```
All `[VERIFIED: npm registry, 2026-05-02]`.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser                                                                 │
│   • Theme cycle button → writes `theme` cookie + reloads or sets attr  │
│   • Typeahead input on /compare + /admin (boat search / canonical pick)│
│   • ECharts client-side render with theme palette                       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │  HTTP (cookies, URL state)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ SvelteKit hooks.server.ts (single choke-point)                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ 1. 301 redirect: /picker* → /explorer, /trends* → /explorer        │ │
│  │ 2. Admin gate: /admin/* requires valid cookie OR basic auth        │ │
│  │ 3. Read theme cookie → event.locals.theme (for SSR data-theme)     │ │
│  │ 4. Existing: requestId, request logger                             │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
            ┌────────────────────┼────────────────────┬─────────────────┐
            ▼                    ▼                    ▼                 ▼
   ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐  ┌──────────┐
   │ / (home)        │  │ /explorer        │  │ /compare       │  │ /admin/  │
   │ +page.server.ts │  │ +page.server.ts  │  │ +page.server.ts│  │ trip-... │
   │  • home query   │  │  • alias-aware   │  │  • alias-aware │  │  CRUD    │
   │  • alias merge  │  │  • granularity   │  │  • boat search │  │          │
   │  • per-section  │  │    selector      │  │  • typeahead   │  │          │
   │    bars         │  │  • x-axis time   │  │                │  │          │
   └────────┬────────┘  └────────┬─────────┘  └────────┬───────┘  └────┬─────┘
            └───────────┬────────┴─────────────────────┴───────────────┘
                        ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │ DAL (src/lib/db/)                                                    │
   │   • queries/home.ts     (NEW) — home page section query              │
   │   • aliases.ts          (NEW) — alias lookup, list, CRUD             │
   │   • queries/explorer.ts (EDIT) — alias-aware                         │
   │   • queries/compare.ts  (EDIT) — alias-aware                         │
   │   • queries/trends.ts   (EDIT) — alias-aware                         │
   │   • migrations.ts       (EDIT) — alias table create+seed; forecasts  │
   │                                  drop                                │
   │   • forecasts.ts        (DELETE)                                     │
   └──────────────────────────────────────────────────────────────────────┘
                        ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │ SQLite (data/dev.sqlite3 — 50,297 rows, 3.7yr)                       │
   │   • catch_reports (untouched) — raw `trip_type` stays verbatim       │
   │   • trip_type_aliases (NEW) — read-time translation                  │
   │   • forecasts (DROPPED)                                              │
   └──────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── hooks.server.ts                    # ADD: 301 redirects, admin gate, theme cookie read
├── app.css                            # ADD: dark theme tokens (parallel CSS vars)
├── lib/
│   ├── auth/                          # NEW dir
│   │   └── admin.ts                   # Constant-time compare; cookie helpers
│   ├── components/
│   │   ├── ThemeToggle.svelte         # NEW (D-27 cycle button)
│   │   ├── GranularitySelector.svelte # NEW (D-37)
│   │   ├── NewLabelBadge.svelte       # NEW (D-05)
│   │   ├── BoatSearchInput.svelte     # NEW or extracted from explorer (D-24)
│   │   ├── HomeSectionCard.svelte     # NEW (per-trip-type section)
│   │   ├── BoatBarRow.svelte          # NEW (boat row with normalized bar)
│   │   ├── LoadingSkeleton.svelte     # NEW (D-32)
│   │   ├── ExplorerHeader.svelte      # EDIT: add granularity, theme toggle
│   │   ├── EmptyState.svelte          # EDIT: add cta + variant slots
│   │   └── Chart.svelte               # EDIT: theme integration, x-axis time
│   ├── copy/
│   │   ├── home.ts                    # NEW
│   │   ├── admin.ts                   # NEW
│   │   ├── theme.ts                   # NEW (toggle aria-label patterns)
│   │   ├── empty-states.ts            # NEW
│   │   └── error-page.ts              # NEW
│   ├── db/
│   │   ├── aliases.ts                 # NEW
│   │   ├── queries/
│   │   │   └── home.ts                # NEW
│   │   ├── migrations.ts              # EDIT
│   │   ├── forecasts.ts               # DELETE
│   │   └── queries/forecastHeatmap.ts # DELETE
│   ├── forecast/                      # DELETE entire dir
│   ├── server/
│   │   └── scheduler.ts               # EDIT: drop forecast recompute hook
│   └── shared/
│       ├── dates.ts                   # EDIT: add bucketing helpers (Daily/Weekly/Monthly canonicalization)
│       ├── urlState.ts                # EDIT: ExplorerFiltersSchema gains `granularity`
│       └── theme.ts                   # NEW (cookie name constants, palette token names)
├── routes/
│   ├── +error.svelte                  # NEW (POL-01)
│   ├── +layout.svelte                 # EDIT: nav cleanup, theme attr, ThemeToggle
│   ├── +layout.server.ts              # NEW (or EDIT) — return theme to client
│   ├── +page.server.ts                # REPLACE (today's-counts → home query)
│   ├── +page.svelte                   # REPLACE
│   ├── about/+page.svelte             # EDIT (drop picker/forecast/heatmap copy)
│   ├── admin/
│   │   └── trip-types/
│   │       ├── +page.server.ts        # NEW
│   │       └── +page.svelte           # NEW
│   ├── compare/
│   │   ├── +page.server.ts            # EDIT (boat picker, alias-aware)
│   │   └── +page.svelte               # EDIT
│   ├── explorer/
│   │   ├── +page.server.ts            # EDIT (granularity, alias-aware, x-axis time)
│   │   └── +page.svelte                # EDIT
│   ├── picker/                        # DELETE
│   └── trends/                        # DELETE
└── tests/
    ├── unit/db/queries/home.test.ts   # NEW
    ├── unit/db/aliases.test.ts        # NEW
    ├── unit/auth/admin.test.ts        # NEW
    ├── unit/lint/per-angler-discipline.test.ts  # DELETE (RTR-05)
    ├── forecast/                      # DELETE entire dir
    ├── unit/routes/picker*.test.ts    # DELETE
    ├── unit/routes/trends*.test.ts    # DELETE
    └── integration/redirects.test.ts  # NEW
```

### Pattern 1: Read-Time Alias Translation in Prepared Statements

**What:** A SQL fragment that resolves a row's effective canonical trip_type at read time
without touching `catch_reports`. Used by every query that surfaces or groups by trip_type.

**When to use:** Home-page query, explorer's `boatExplorerSeries`, `/compare`'s queries,
admin page's "list all distinct labels" query.

**Example (recommended pattern — LEFT JOIN with COALESCE):**
```sql
-- Source: This pattern is standard for soft-rename mappings; see e.g. the well-known
-- "type 1 slowly changing dimension" approach. [CITED: SQLite docs — JOIN]
SELECT
  COALESCE(
    CASE WHEN tta.status = 'aliased' THEN tta.canonical_label ELSE NULL END,
    cr.trip_type
  ) AS effective_trip_type,
  -- ... other columns
FROM catch_reports cr
LEFT JOIN trip_type_aliases tta ON tta.source_label = cr.trip_type
WHERE cr.source_date BETWEEN @fromDate AND @toDate
GROUP BY effective_trip_type, ...
```

The JOIN is on a small table (≤22 rows growing slowly); SQLite handles it with no measurable
overhead. Index on `trip_type_aliases.source_label` (PRIMARY KEY auto-indexed) makes the
lookup constant-time per row.

**Alternative considered — SQLite VIEW:** A `CREATE VIEW catch_reports_aliased AS ...`
view is tempting (DRY) but has two downsides: (1) every `EXPLAIN QUERY PLAN` shows the
view expansion, making query tuning indirect; (2) the home-page query's "viable trip type"
filter (≥5 trips) requires aggregating against the canonical label specifically — a view
that pre-resolves makes that natural, but so does a CTE inline. Recommend **inline LEFT
JOIN per query**, with a tiny shared SQL fragment string in `src/lib/db/aliases.ts`:

```typescript
// src/lib/db/aliases.ts
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

Queries import these constants — no string concatenation of user input, no SQL injection
risk (these are pure SQL fragments, not derived from any input). `[ASSUMED]` that these
constants are clearer than a CTE; planner may prefer CTE — both are equivalent in
performance. Confidence MEDIUM on the choice; HIGH on the technique.

### Pattern 2: Cookie-Driven SSR Theme (Three-Mode)

**What:** `<html data-theme="auto|light|dark">` set server-side from a cookie, then
honored by Tailwind 4's `@custom-variant dark` and parallel CSS variables.

**Steps:**

1. **`src/hooks.server.ts`** reads `event.cookies.get('fc_theme')` and sets
   `event.locals.theme` (one of `'auto'|'light'|'dark'`, defaulting to `'auto'`).

2. **`src/routes/+layout.server.ts`** returns `{ theme: locals.theme }` to the page tree:
   ```typescript
   export const load = async ({ locals }) => ({ theme: locals.theme });
   ```

3. **`src/app.html`** — set the attribute via SvelteKit's `%sveltekit.html.attributes%`
   pattern, OR put it in `+layout.svelte` reading `data.theme`. The cleanest path is to
   set it in `app.html` using a placeholder substituted by a `transformPageChunk` in the
   `handle` hook:
   ```typescript
   // src/hooks.server.ts inside handle():
   const theme = event.cookies.get('fc_theme') ?? 'auto';
   const response = await resolve(event, {
     transformPageChunk: ({ html }) =>
       html.replace('data-theme="%fc_theme%"', `data-theme="${theme}"`)
   });
   ```
   Source: SvelteKit hooks docs — `transformPageChunk` is the documented way to inject
   per-request HTML changes server-side `[CITED: svelte.dev/docs/kit/hooks]`.

4. **`src/app.css`** — declare both palettes as parallel CSS variable blocks:
   ```css
   @import 'tailwindcss';

   /* Tailwind 4 — three-mode dark variant. data-theme="auto" falls through to
      prefers-color-scheme media query naturally; explicit light/dark overrides it. */
   @custom-variant dark (
     &:where(
       [data-theme="dark"],
       [data-theme="dark"] *,
       [data-theme="auto"]:where([data-theme-system="dark"]) &
     )
   );

   @theme {
     --color-surface: #ffffff;
     /* ...existing light tokens */
   }

   /* Dark token overrides — applied when html has data-theme="dark" OR
      (data-theme="auto" AND user OS prefers dark). */
   @media (prefers-color-scheme: dark) {
     :where([data-theme="auto"]) {
       --color-surface: #0f172a;
       --color-surface-muted: #1e293b;
       /* ...all 14 tokens get dark variants */
     }
   }
   [data-theme="dark"] {
     --color-surface: #0f172a;
     /* ...same as above */
   }
   ```
   `[CITED: tailwindcss.com/docs/dark-mode + Tailwind 4 @custom-variant docs]`. The
   approach above gives BOTH (a) any component using `bg-(--color-surface)` flips
   automatically — no edits — AND (b) any new component can use `dark:bg-slate-900`
   utility.

5. **`ThemeToggle.svelte`** writes the cookie client-side (`document.cookie = 'fc_theme=dark; ...'`)
   and updates `document.documentElement.dataset.theme = 'dark'` immediately so the
   change takes effect without reload.

**Gotcha:** Cookie write must use `Path=/`, `SameSite=Lax`, `Max-Age=31536000` (1 year),
and must be readable server-side (no `httpOnly`). `[ASSUMED]` SameSite=Lax is fine;
the cookie carries no secrets.

### Pattern 3: ECharts 6 Theme Integration

**What:** Charts respect `data-theme` by passing palette tokens into the chart option,
and re-rendering on theme change.

**Recommended approach — read computed CSS variables at chart-init time**, attach a
`MutationObserver` to `<html>`'s `data-theme` attribute, and call `setOption` with new
colors when theme changes:

```typescript
// in Chart.svelte onMount
const readPalette = () => {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  return {
    background: cs.getPropertyValue('--color-surface').trim(),
    text: cs.getPropertyValue('--color-text').trim(),
    axis: cs.getPropertyValue('--color-text-muted').trim(),
    grid: cs.getPropertyValue('--color-border').trim()
  };
};

const applyPalette = () => {
  const p = readPalette();
  chart.setOption({
    backgroundColor: p.background,
    textStyle: { color: p.text },
    xAxis: { axisLabel: { color: p.axis }, axisLine: { lineStyle: { color: p.grid } } },
    yAxis: { axisLabel: { color: p.axis }, splitLine: { lineStyle: { color: p.grid } } },
    legend: { textStyle: { color: p.text } },
    tooltip: { backgroundColor: p.background, textStyle: { color: p.text } }
  });
};

// On theme change
const observer = new MutationObserver(applyPalette);
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
```

Source: ECharts 6 supports dynamic theme switching natively (no instance disposal/recreate)
— `setOption({ ... })` with theme keys merges into current state.
`[CITED: echarts.apache.org/handbook/en/basics/release-note/v6-feature/]`. ECharts also
supports `chart.setTheme(name)` if a theme JSON is registered with `registerTheme`, but
since the project's tokens already live in CSS variables, reading them directly avoids
duplication. `[ASSUMED]` reading CSS vars is cheaper than maintaining two parallel theme
JSONs.

**Alternative (rejected):** `registerTheme('fishcount-dark', {...})` + `chart.setTheme()`.
Forces duplication of palette tokens between CSS and JS. The CSS-var-readback pattern keeps
one source of truth (CSS).

### Pattern 4: 301 Redirect in `hooks.server.ts`

**What:** Pre-routing intercept that redirects all `/picker*` and `/trends*` traffic
to `/explorer` with HTTP 301, dropping query strings silently per D-17.

**Example:**
```typescript
// src/hooks.server.ts (excerpt)
import { redirect } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // RDR-01, RDR-02 — 301 redirect retired v1 routes
  const path = event.url.pathname;
  if (path === '/picker' || path.startsWith('/picker/') ||
      path === '/trends' || path.startsWith('/trends/')) {
    throw redirect(301, '/explorer');
  }

  // ... existing requestId / logger logic
  return resolve(event);
};
```

Source: `@sveltejs/kit` exports `redirect(status, location)`; status 301 is permanent,
search engines transfer page rank to the destination, browsers cache aggressively.
`[CITED: svelte.dev/docs/kit/hooks]`.

**Dev cache gotcha:** Browsers cache 301s aggressively. During development, if the
redirect target changes (e.g., adding `/picker?slug=x → /explorer?ticker=...`), already-cached
clients will keep redirecting to the old destination. Mitigation: while iterating, return
302 (temporary), then flip to 301 only at ship time. For Phase 8 specifically the
destination is fixed (`/explorer` bare per D-17), so 301 from day one is fine.

### Pattern 5: Admin Auth — Recommendation

**Recommended:** Single password held in env var `ADMIN_PASSWORD`. Admin page renders a
login form on first visit; submitting the form sets a signed cookie (`fc_admin`).
`hooks.server.ts` checks the cookie on every `/admin/*` request and 401s if missing/invalid.

**Why this and not the alternatives:**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| HTTP Basic Auth | One header, browser does prompt UI | Browser-native UI is ugly, weird on mobile, no logout button | Reject |
| Bearer token in URL | Simple | Tokens leak in logs, server logs, browser history. Not safe for shared device | Reject |
| Single password + signed cookie (RECOMMENDED) | Mobile-friendly, has logout, no library needed | Need to sign the cookie | **Pick** |
| Lucia / Auth.js | Battle-tested | Massive overkill for one operator one route | Reject |
| Bcrypt + sessions table | Battle-tested | Same as above | Reject |

**Implementation:**
- Env var `ADMIN_PASSWORD` (read once at module load).
- Form action: receives `password`, runs `crypto.timingSafeEqual` against env var (avoids
  timing leaks `[CITED: Node crypto docs — timingSafeEqual]`).
- On match: sign a cookie payload `{ admin: true, iat: <timestamp> }` with HMAC-SHA256 over
  `ADMIN_COOKIE_SECRET` (a second env var). Cookie name `fc_admin`, `HttpOnly`, `Secure`,
  `SameSite=Strict`, `Max-Age=86400` (24h — short on purpose, force re-auth daily).
- `hooks.server.ts` extracts cookie, verifies HMAC, sets `event.locals.isAdmin = true` if
  valid; else returns 401 for `/admin/*`.

**No library required:** Node's built-in `node:crypto` (`createHmac`, `timingSafeEqual`)
handles signing/verifying. About 30 lines in `src/lib/auth/admin.ts`. `[VERIFIED: node:crypto
ships with Node 22 — package.json engines requires >=22.0.0]`.

**Gotcha:** The admin page must NOT be cached (`Cache-Control: private, no-store`) — Phase
6 uses `public, max-age=300` widely; the admin route must override.

### Pattern 6: SvelteKit 2 Error Boundary (`+error.svelte`)

**What:** A page-level error boundary that catches load-function errors and 4xx/5xx
HTTP responses, rendering a friendly page instead of a stack trace.

**Where:** `src/routes/+error.svelte` (root-level — catches everything not caught by a
nested error boundary). Receives `$page.error` (message) and `$page.status` (HTTP code).

**Pattern:**
```svelte
<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  import { ERROR_HEADINGS, ERROR_BODIES } from '$lib/copy/error-page';
</script>

<svelte:head>
  <title>{page.status === 404 ? 'Page not found' : 'Something broke'} — FishCount</title>
</svelte:head>

<section class="mx-auto max-w-prose py-16 text-center">
  <h1 class="text-2xl font-semibold">
    {page.status === 404 ? ERROR_HEADINGS.notFound : ERROR_HEADINGS.generic}
  </h1>
  <p class="mt-3 text-(--color-text-muted)">
    {page.status === 404 ? ERROR_BODIES.notFound : ERROR_BODIES.generic}
  </p>
  <a href="/" class="mt-6 inline-block text-(--color-accent) underline">Back to home</a>
</section>
```

The HTTP status is preserved — monitoring, sitemaps, and analytics keep working.
`[CITED: svelte.dev/docs/kit/errors]`.

**Server-side errors** (loader throws) also need a `handleError` hook in `src/hooks.server.ts`
to format the error consistently before SvelteKit hands it to `+error.svelte`. Optional;
the default is fine for v1.

### Pattern 7: Loading State (Skeleton vs Spinner)

The `Chart.svelte` component already shows `Loading chart…` on first paint. For Phase 8:

- **Chart loading** (skeleton preferred): a gray-shimmer box matching `height="320px"`. Add
  `LoadingSkeleton.svelte` with a `variant: 'chart' | 'rows' | 'card'` prop.
- **Typeahead suggestion loading** (spinner): use a small CSS-only spinner inline in the
  dropdown. Don't skeleton 5 fake rows — feels deceptive.

Skeleton uses CSS animation; respect `prefers-reduced-motion` (already wired into `app.css`).

### Pattern 8: Empty State Variants (D-33)

`EmptyState.svelte` already exists; extend with a copy variant prop OR keep as-is and pass
distinct `heading`/`body` from the loader. Existing component already supports `cta` link.
Recommend keeping the component minimal and varying the strings via `src/lib/copy/empty-states.ts`:

```typescript
export const EMPTY_STATES = {
  boatNoHistoryAtAll: {
    heading: (name: string) => `${name} has no scraped trips yet`,
    body: 'This boat may have only run trips outside our scrape window. Check back later.'
  },
  boatNoHistoryInRange: {
    heading: (name: string) => `No ${name} trips in this range`,
    body: 'Try widening the time range, or pick a different boat.'
  },
  speciesNoHistoryInRange: { /* ... */ },
  // ... per ticker × scenario
};
```

The loader picks which variant based on `countCatchRowsForBoat` (in range) vs
`countCatchRowsForBoatEver` (zero ever). The latter helper is new; one prepared statement.

### Anti-Patterns to Avoid

- **Don't write a SQLite VIEW for the alias join** — see Pattern 1; planner may consider
  it but inline LEFT JOIN per query is the established codebase idiom (DAL queries are
  self-contained prepared statements). Adding a view introduces a hidden coupling for
  future contributors.
- **Don't store the theme in localStorage** — D-28 zero-flash requirement makes cookie
  mandatory.
- **Don't put the admin password in a `.env` file checked into git** — env var only;
  document setup in a runbook (separate task).
- **Don't use CSS class-based dark mode (`darkMode: 'class'`)** — Tailwind 4 deprecated
  the JS config; CSS-first `@custom-variant` is the v4 idiom `[CITED: tailwindcss.com/docs/dark-mode]`.
- **Don't put SQL in route loaders** — DAL boundary rule from CLAUDE.md / STATE.md.
  Even one-off admin CRUD goes through `src/lib/db/aliases.ts`.
- **Don't hand-roll a typeahead from scratch** — see "Don't Hand-Roll" table; the explorer's
  existing `<select>` + the new `BoatSearchInput` should reuse a small set of patterns
  (HTML `<datalist>` is the lightest path; full combobox is a separate concern).
- **Don't try to be clever about released-species variants** — the spike confirmed they
  must stay separate (Q11). Don't collapse them in any new query.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cookie signing for admin auth | Custom HMAC + base64 string parser | Node built-in `crypto.createHmac` + `crypto.timingSafeEqual` | Built-in, audited, constant-time |
| Boat-name typeahead | Full combobox with keyboard nav, ARIA roles, debounce | HTML `<input list="boats">` + `<datalist>` | Native browser behavior; mobile-native picker; zero JS for v1. See "Compare Typeahead Pattern" below |
| Theme cookie reader | `document.cookie.split(';').filter(...)` | SvelteKit's `event.cookies.get()` | Already wired; handles encoding |
| Per-section bar widths | Custom flex math | CSS `width: calc((value / sectionMax) * 100%)` inline style | One line; no JS layout |
| ISO-week / month bucket helpers | New regex parsing | `date-fns` (already in deps) `eachWeekOfInterval`, `eachMonthOfInterval`, `format(d, "RRRR-'W'II")` | Already used by explorer loader |
| Alias-join SQL fragments inlined per query | 5 copies of the same JOIN clause | One shared constant string in `src/lib/db/aliases.ts` (see Pattern 1) | DRY without a view |
| HMAC verification | Custom string compare on signed cookie | `crypto.timingSafeEqual` | Constant-time; prevents timing attacks |
| ECharts theme JSON | `registerTheme('dark', {...})` parallel to CSS palette | CSS-var readback in `Chart.svelte` (Pattern 3) | One source of truth (CSS) |

**Key insight:** Phase 8 is mostly composition over invention. The Phase 6/7 codebase
already has DAL helpers, URL state primitives, the chart wrapper, and date primitives.
Most "new" work is wiring those together for new shapes (home-page sections, alias-aware
queries, theme-aware chart colors).

## Runtime State Inventory

> Phase 8 deletes routes (`/picker`, `/trends`), drops a database table (`forecasts`),
> and removes scheduler hooks. This is a refactor / migration phase — every category
> below is checked.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| **Stored data** | `forecasts` table — 1 table, ~indeterminate row count (per (date, species, trip_type) tuple). All to be dropped. | Migration: `DROP TABLE IF EXISTS forecasts; DROP INDEX IF EXISTS idx_forecasts_unique; DROP INDEX IF EXISTS idx_forecasts_range;`. Single statement, idempotent. The data is recoverable from raw scrapes if ever needed. |
| **Live service config** | None outside the repo. Production deploys (if any) need to redeploy with the new code; no external service config (n8n, Cloudflare Tunnel, etc.) carries forecast or picker references. | Verified by grep: no references to `/picker`, `/trends`, or `forecasts` in `fly.toml`, `litestream.yml`, or any other infra config. |
| **OS-registered state** | None. The Croner scheduler runs in-process; no OS-level cron, no Windows Task Scheduler, no launchd plists. Removing the forecast hook from `src/lib/server/scheduler.ts` is sufficient. | None — verified by inspecting `src/lib/server/scheduler.ts` and `package.json` scripts. |
| **Secrets and env vars** | New env vars added: `ADMIN_PASSWORD`, `ADMIN_COOKIE_SECRET`. None removed. The forecast pipeline used no env vars. | Document in operator runbook. Add `*.env` lines if there's an `.env.example`. |
| **Build artifacts / installed packages** | None — no separate package built from forecasts. The `npm run forecasts:rebuild` script in `package.json` is purely a `tsx scripts/forecasts-rebuild.ts` invocation; once the script is deleted, removing the script entry from `package.json` is sufficient. | Edit `package.json` `scripts.forecasts:rebuild` → delete. Edit `scripts/backfill.ts` to drop the `recomputeForecasts` import + call (lines 37, 135–143). |

**The canonical question:** *After every file in the repo is updated, what runtime systems
still have the old data, behavior, or registration?*

- The `forecasts` SQLite table on the production DB (if deployed). Migration handles this.
- Browser cache for any user who visited `/picker` or `/trends` (their session persists
  but next request will 301-redirect — by design).
- That's it. No other surface-area carries v1 picker/forecast state.

## Common Pitfalls

### Pitfall 1: Alias join changes home-page query result count vs explorer query

**What goes wrong:** The home page filters "viable trip types" by `COUNT(trips) >= 5`.
If that count is computed against the *raw* `trip_type`, then aliased into the canonical
label only at presentation time, you can get a section labeled "Full Day" that includes
trips originally labeled "Full Day Coronado Islands" (10 trips merged in). But if the
operator hasn't yet aliased "Full Day Coronado Islands" to "Full Day", you'd want them
counted separately. The aggregation MUST happen against the *effective* canonical label,
not the raw label.

**Why it happens:** Two places to apply alias translation in a query — the projection
(SELECT) vs the GROUP BY. Only GROUP BY (against the COALESCEd canonical expr) gives
correct merging.

**How to avoid:** Use `GROUP BY <canonical_expr>` everywhere, never `GROUP BY cr.trip_type`.
The explorer's existing `boatExplorerSeries` query in `src/lib/db/queries/explorer.ts`
groups by `trip_type` — needs updating per D-03.

**Warning signs:** Two near-identical sections on the home page (e.g., "Full Day" with 5
trips AND "Full Day Coronado Islands" with 10), or a single boat showing two trip-type
series in the explorer that should have merged.

### Pitfall 2: Theme cookie raw value injected into HTML attribute

**What goes wrong:** If `transformPageChunk` does
`html.replace('%fc_theme%', cookie)` without validating the cookie value, an attacker can
set `cookie = '" onerror="alert(1)' ` and inject HTML attributes.

**Why it happens:** `transformPageChunk` is a string replace; cookies are user-controlled.

**How to avoid:** Validate the cookie value against the literal set `'auto'|'light'|'dark'`
in the `handle` hook and fall back to `'auto'` on any other value. Never inject the raw
cookie:
```typescript
const raw = event.cookies.get('fc_theme') ?? 'auto';
const theme = raw === 'light' || raw === 'dark' ? raw : 'auto';
```

**Warning signs:** `<html data-theme="<anything-with-quotes-or-spaces>">`.

### Pitfall 3: Granularity URL param round-trip differs from default-on-range-switch

**What goes wrong:** D-38 says range switch resets granularity to default. D-39 says
defaults are not serialized. If the loader resolves `granularity` from the URL and the URL
has none, defaults apply. But if the user manually overrode (e.g., 1Y at Daily), and then
switches range to 5Y, the URL must drop the `granularity=daily` param — otherwise 5Y comes
up at Daily (~1825 buckets, slow).

**Why it happens:** Range-switch handler in the page component must explicitly compute the
new range's default and decide whether to serialize.

**How to avoid:** When the user changes range, the handler computes
`defaultFor(newRange)` and emits a URL that omits `granularity` if user-chosen ==
default. Always serialize the *effective* granularity through the loader, but let the
URL-write phase strip default-equal values.

**Warning signs:** All-range chart loads daily (1342 buckets, 50K data points) and feels
sluggish.

### Pitfall 4: x-axis `time` migration breaks ISO-week bucket axis

**What goes wrong:** The current explorer chart's xAxis is `category` with `bucket_key`
strings like `"2025-W14"`. Migrating to `time` requires real timestamps. ECharts can't
parse `"2025-W14"` as a date — needs explicit conversion (Monday of that ISO week).

**Why it happens:** The bucket-key strings produced by `strftime('%G-W%V', ...)` are
opaque to JS Date parsers.

**How to avoid:** In the loader, when granularity is weekly or monthly, also emit a
`bucket_start_iso` field (the canonical Monday or 1st-of-month as `YYYY-MM-DD`) and pass
THOSE to the chart's `xAxis: { type: 'time' }`. The bucket-key strings can become
human-readable axis labels via a formatter, but the value passed to ECharts is the date.

**Warning signs:** Chart renders blank, ECharts console warning "no data" or "invalid
date string."

### Pitfall 5: 301 cached during dev; redirect target appears stuck

**What goes wrong:** Browser caches `/picker → /explorer` 301. You change the redirect
during development; browser never re-fetches.

**Why it happens:** 301 is browser-cached aggressively, often indefinitely.

**How to avoid:** During development, use 302 (temporary). Flip to 301 only at ship time.
For Phase 8 specifically, redirect target is fixed (`/explorer` bare per D-17), so the
risk is low — but still worth a one-time `Clear browsing data` if iterating.

**Warning signs:** Dev environment redirects to a stale destination after code changes.

### Pitfall 6: ECharts dark-mode color readback runs before CSS loads

**What goes wrong:** `Chart.svelte`'s `onMount` runs after first paint; `getComputedStyle`
reads the current CSS variables. But if the chart is initialized in a `$effect` that fires
before the `data-theme` attribute is set on `<html>`, you get light-theme colors even on
dark.

**Why it happens:** SSR sets `data-theme` correctly via `transformPageChunk`, so the very
first paint is right. But if the user toggles theme client-side, the chart needs to
re-read computed styles AFTER the attribute change AND a paint cycle.

**How to avoid:** Use `requestAnimationFrame` in the MutationObserver callback before
calling `applyPalette`:
```typescript
const observer = new MutationObserver(() => requestAnimationFrame(applyPalette));
```
This guarantees the browser has applied the new CSS variable values before ECharts reads
them.

**Warning signs:** Chart stays in old theme until next page load.

## Code Examples

### Idempotent Alias Table Migration + Seed

```typescript
// src/lib/db/migrations.ts (excerpt — added to existing runMigrations)
// Idempotent: runs on every boot, skips on already-present.
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
    CREATE INDEX IF NOT EXISTS idx_alias_canonical
      ON trip_type_aliases(canonical_label);
    CREATE INDEX IF NOT EXISTS idx_alias_status
      ON trip_type_aliases(status);
  `);

  // Seed only if table is empty (idempotent — re-running won't overwrite operator edits)
  const count = (db.prepare('SELECT COUNT(*) AS c FROM trip_type_aliases').get() as { c: number }).c;
  if (count === 0) {
    const seed = db.prepare(`
      INSERT OR IGNORE INTO trip_type_aliases (source_label, canonical_label, status, notes)
      VALUES (@source, @canonical, @status, @notes)
    `);
    const tx = db.transaction((rows: Array<{source: string; canonical: string; status: string; notes?: string}>) => {
      for (const r of rows) seed.run(r);
    });
    tx([
      // Confident merges (D-06)
      { source: 'Extended 1.5 Day', canonical: '1.5 Day', status: 'aliased', notes: 'Source-site variant; merged 2026-05' },
      { source: 'Extended 1/2 Day', canonical: '1/2 Day AM', status: 'aliased', notes: 'Likely AM extension; operator review on admin page' },
      { source: 'Full Day Coronado Islands', canonical: 'Full Day', status: 'aliased', notes: '2026-04-27 source-site relabel; reversible' },
      // Stable canonicals (status=accepted means "this IS its own canonical")
      { source: '1/2 Day AM', canonical: '1/2 Day AM', status: 'accepted' },
      { source: '1/2 Day PM', canonical: '1/2 Day PM', status: 'accepted' },
      { source: '1/2 Day Twilight', canonical: '1/2 Day Twilight', status: 'accepted' },
      { source: 'Full Day', canonical: 'Full Day', status: 'accepted' },
      { source: '1.5 Day', canonical: '1.5 Day', status: 'accepted' },
      { source: '2 Day', canonical: '2 Day', status: 'accepted' },
      { source: '3 Day', canonical: '3 Day', status: 'accepted' },
      { source: 'Overnight', canonical: 'Overnight', status: 'accepted' },
      { source: '3.5 Day', canonical: '3.5 Day', status: 'accepted' },
      { source: '3/4 Day', canonical: '3/4 Day', status: 'accepted' },
      // Pending (operator must adjudicate via admin page) — D-05 NEW badge
      { source: '1.75 Day', canonical: '1.75 Day', status: 'pending' },
      { source: '4 Day', canonical: '4 Day', status: 'pending' },
      { source: '4.5 Day', canonical: '4.5 Day', status: 'pending' },
      { source: '5 Day', canonical: '5 Day', status: 'pending' },
      { source: '6 Day', canonical: '6 Day', status: 'pending' },
      { source: '7 Day', canonical: '7 Day', status: 'pending' },
      { source: '3.25 Day', canonical: '3.25 Day', status: 'pending' },
      { source: '2.5 Day', canonical: '2.5 Day', status: 'pending' },
      { source: '3/4 Day Local', canonical: '3/4 Day', status: 'pending', notes: 'Probably 3/4 Day variant — operator review' },
      { source: '3/4 Day Islands', canonical: '3/4 Day', status: 'pending' },
      { source: '3/4 Day Offshore', canonical: '3/4 Day', status: 'pending' },
      { source: 'Lobster', canonical: 'Lobster', status: 'pending', notes: 'Distinct category — keep separate?' }
    ]);
  }
}
```

The seed is `[ASSUMED]` and must be reviewed by the operator before commit. The
2026-04-27 "Full Day → Full Day Coronado Islands" relabel (per CONTEXT.md "specifics") is
the only confident merge fully grounded in operator-confirmed reasoning; the others are
educated guesses from the spike addendum 2.

### Forecasts-Table Drop Migration

```typescript
// src/lib/db/migrations.ts (excerpt)
function dropForecastsTable(db: Database.Database): void {
  // RTR-03. Idempotent — IF EXISTS makes re-runs safe.
  db.exec(`
    DROP INDEX IF EXISTS idx_forecasts_unique;
    DROP INDEX IF EXISTS idx_forecasts_range;
    DROP TABLE IF EXISTS forecasts;
  `);
}
```

Note the existing `SCHEMA_SQL` constant in `src/lib/db/migrations.ts` still has the
`CREATE TABLE IF NOT EXISTS forecasts` statement. Phase 8 must remove that block so the
migration ordering is `drop → no recreate`. The `runMigrations` function calls
`db.exec(SCHEMA_SQL)` — strip the forecasts block from `SCHEMA_SQL`, then add a
`dropForecastsTable(db)` call before or after.

### Home-Page Section Query (alias-aware)

```typescript
// src/lib/db/queries/home.ts (NEW)
import type Database from 'better-sqlite3';
import { ALIAS_JOIN_SQL, CANONICAL_TRIP_TYPE_EXPR } from '$lib/db/aliases';

export interface HomeSection {
  canonical_trip_type: string;
  trip_count: number;
  rows: HomeRow[];
  status: 'aliased' | 'accepted' | 'pending';  // for NEW badge propagation
}

export interface HomeRow {
  boat_id: number;
  boat_slug: string;
  boat_display_name: string;
  trip_count: number;
  total_caught: number;
  total_anglers: number;
  fish_per_angler: number;
  pending: boolean;  // any constituent label was pending
}

export function homeSections(
  db: Database.Database,
  args: { fromDate: string; toDate: string; minTripsPerSection: number; topNPerSection: number }
): HomeSection[] {
  // Step 1: viable canonical trip types (≥minTripsPerSection trips in window after alias merge)
  const viable = db.prepare(`
    SELECT ${CANONICAL_TRIP_TYPE_EXPR} AS canonical_trip_type,
           COUNT(DISTINCT cr.source_date || '|' || cr.boat_id) AS trip_count
      FROM catch_reports cr
      ${ALIAS_JOIN_SQL}
     WHERE cr.source_date BETWEEN @fromDate AND @toDate
     GROUP BY canonical_trip_type
    HAVING trip_count >= @minTripsPerSection
     ORDER BY trip_count DESC
  `).all(args) as Array<{ canonical_trip_type: string; trip_count: number }>;

  if (viable.length === 0) return [];

  // Step 2: per-canonical top-N boats by fpa
  const perSection = db.prepare(`
    SELECT b.id AS boat_id, b.slug AS boat_slug, b.display_name AS boat_display_name,
           COUNT(DISTINCT cr.source_date) AS trip_count,
           SUM(cr.species_count) AS total_caught,
           SUM(cr.angler_count) AS total_anglers,
           SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS fish_per_angler,
           MAX(CASE WHEN tta.status = 'pending' THEN 1 ELSE 0 END) AS pending
      FROM catch_reports cr
      JOIN boats b ON b.id = cr.boat_id
      ${ALIAS_JOIN_SQL}
     WHERE cr.source_date BETWEEN @fromDate AND @toDate
       AND ${CANONICAL_TRIP_TYPE_EXPR} = @canonical
     GROUP BY cr.boat_id
     ORDER BY fish_per_angler DESC, b.display_name ASC
     LIMIT @topN
  `);

  return viable.map((v) => ({
    canonical_trip_type: v.canonical_trip_type,
    trip_count: v.trip_count,
    status: 'accepted' as const,  // section-level; row-level pending is what we care about
    rows: perSection.all({
      fromDate: args.fromDate,
      toDate: args.toDate,
      canonical: v.canonical_trip_type,
      topN: args.topNPerSection
    }) as HomeRow[]
  }));
}
```

`[ASSUMED]` two-pass query is faster than a single window-function query at this scale
(~50K rows). SQLite supports window functions but the project hasn't used them; LIMIT-per-
group requires emulation. Two prepared statements is clearer.

### Granularity URL State Extension

```typescript
// src/lib/shared/urlState.ts (excerpt — extending RangeBase)
const granularityField = z
  .enum(['daily', 'weekly', 'monthly'])
  .optional();  // undefined → loader resolves default per range

const RangeBase = z.object({
  range: z.enum(RANGE_PRESETS).default('1y'),
  fromDate: dateField.optional(),
  toDate: dateField.optional(),
  moon: boolFlagField,
  granularity: granularityField  // NEW
});

// In serializeExplorerFilters:
//   only emit `granularity` if it differs from default-for-range (clean URL pattern)
export function defaultGranularityFor(range: ExplorerFilters['range']): 'daily' | 'weekly' | 'monthly' {
  if (range === '1m' || range === '3m' || range === '6m') return 'daily';
  if (range === '1y' || range === '2y' || range === '5y' || range === 'all') return 'weekly';
  return 'daily'; // custom — loader can refine based on span
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind `darkMode: 'class'` in JS config | `@custom-variant dark (...)` in CSS | Tailwind v4 (2024) | Project must adopt CSS-first; no JS config exists `[CITED: tailwindcss.com/docs/dark-mode]` |
| ECharts theme switch via dispose+recreate | `chart.setOption({...})` or `chart.setTheme()` dynamic | ECharts 6 (late 2024) | Dynamic switching now native `[CITED: echarts.apache.org/handbook/en/basics/release-note/v6-feature/]` |
| localStorage theme persistence | Cookie + SSR | (project decision, D-28) | Zero-flash; mandatory for "shareable" polish bar |
| Class-based dark mode toggle | `data-theme` attribute (3-state) | (project decision, D-26) | Enables Auto fallthrough + explicit override |
| HTTP Basic auth for admin | Signed cookie + form login | (project decision, D-04) | Mobile-friendly; logout possible |

**Deprecated/outdated:**
- `forecasts` table + `src/lib/forecast/` — retired with v1; do not regenerate
- `/picker`, `/trends` routes — retired
- 3-file allowlist lint (`tests/unit/lint/per-angler-discipline.test.ts`) — retired with v2
  trust-the-audience principle (RTR-05)
- Row-count <50% silent-failure alert (`src/lib/scraper/sla.ts` `shouldAlert`) — replaced
  with parser/scraper-failure-only logic (RTR-06)

## Aggressive Retirement Inventory (`/picker`, `/trends`, forecasts)

Based on `git grep -nE "/(picker|trends)"` and `git grep -nE "forecast"` (excluding
.planning, node_modules, milestones), 2026-05-02:

### Files to DELETE entirely (RTR-01, RTR-02, RTR-04, RTR-05, RTR-09)
- `src/routes/picker/` (whole directory — `+page.server.ts`, `+page.svelte`, `heatmapOption.ts`)
- `src/routes/trends/` (whole directory — `+page.server.ts`, `+page.svelte`)
- `src/lib/forecast/` (whole directory — `compute.ts`)
- `src/lib/db/forecasts.ts`
- `src/lib/db/queries/forecastHeatmap.ts`
- `src/lib/db/queries/benchmark.ts` (used only by forecast benchmark — verify before delete)
- `scripts/forecast-benchmark.ts`
- `scripts/forecasts-rebuild.ts`
- `tests/forecast/` (entire dir — `heatmap-composer.test.ts`, `horizon.test.ts`)
- `tests/unit/routes/picker.test.ts`
- `tests/unit/routes/picker-heatmap-option.test.ts`
- `tests/unit/routes/picker/heatmapOption-forecast.test.ts` (and parent dir if empty)
- `tests/unit/routes/trends.test.ts`
- `tests/unit/db/queries/trends.test.ts` — KEEP only if `trends.ts` survives. The DAL
  module `src/lib/db/queries/trends.ts` is consumed by `/compare` and was carried into
  Phase 6 — KEEP the module, delete the v1-only test file (`trends.test.ts`) ONLY if it
  exclusively tests behavior tied to `/trends` route. The plan task should review test
  contents and split — likely KEEP some unit tests covering `speciesTrend`/`boatTrend`,
  delete others.
- `tests/unit/lint/per-angler-discipline.test.ts` (RTR-05)

### Files to EDIT (remove references)
- `package.json` — drop `"forecasts:rebuild"` script
- `scripts/backfill.ts` — line 37 `import { recomputeForecasts }`; lines 135–143 the
  `recomputeForecasts(getDb())` call + log lines. Remove all.
- `scripts/seed-dev-db.ts` — line 5 comment mentions `/picker` and `/heatmap` — update
  comment; verify seed data shape doesn't depend on forecasts schema
- `src/lib/db/migrations.ts` — remove the `forecasts` CREATE TABLE block from
  `SCHEMA_SQL`; add `dropForecastsTable` call
- `src/lib/db/queries/browse.ts` — line 11 + 101 comments mention `/picker`. Update
  comments. The functions themselves (`mostCommonTripType`, `distinctTripTypes`, etc.)
  are reusable — keep them.
- `src/lib/server/scheduler.ts` — remove `recomputeForecasts` import (line 27) and the
  `if (result.outcome === 'success' || ...) { recomputeForecasts(...) }` block
  (lines 90–97)
- `src/lib/scraper/sla.ts` — RTR-06: replace `shouldAlert` logic. New behavior:
  alert ONLY when `outcome IN ('http_error', 'parse_error')`. Don't alert on `empty` or
  on any row-count threshold. Update tests accordingly.
- `src/routes/+layout.svelte` — line 9 `/picker` and line 10 `/trends` nav items —
  delete. Final nav: `Home / Explorer / Compare / About`.
- `src/routes/about/+page.svelte` — RTR-07: drop picker/forecast/heatmap copy. Keep
  source-attribution + scrape-cadence + per-angler caveat sections (carry forward
  unchanged per CONTEXT.md). Add new copy describing v2 explorer + home + alias mapping.
  Also: remove the `// NOTE: This file is allowlisted by Plan 02-07's per-angler-discipline
  lint` comment since the lint is being removed (RTR-05).
- `src/lib/copy/metrics.ts` — lines 4–12 + 34–39: comments mention "lint allowlist" and
  `FORECAST_LABEL`. Drop forecast-specific copy constants (`FORECAST_LABEL`,
  `NOT_ENOUGH_HISTORY` if forecast-only). Audit each constant for current-route usage.
- `src/lib/copy/moon.ts` — line 8 mentions "allowlisted by per-angler-discipline lint" —
  drop that comment (lint going away)
- `src/lib/components/PerAnglerMetric.svelte` — lines 7, 32, 33, 38, 48, 53, 55, 56:
  `kind: 'historical' | 'forecast'`. Drop the `'forecast'` branch entirely. Type becomes
  just `kind: 'historical'` (or remove the prop). Audit consumers — anyone passing
  `kind="forecast"` is on a retired surface.
- `src/lib/db/catchReports.ts` — lines 86–126: forecast-related comments + a
  `forecastYear` parameter on a query function used by `forecast/compute.ts`. Once
  `forecast/compute.ts` is deleted, the function may be dead code — audit and remove or
  simplify.
- `src/lib/shared/urlState.ts` — remove `PickerFiltersSchema`, `parsePickerFilters`,
  `serializePickerFilters` (lines 87–126). Also remove `TrendsFiltersSchema`,
  `parseTrendsFilters`, `serializeTrendsFilters` (lines 177–206). Keep
  `HomeFiltersSchema` for now — it'll be deleted after the new home page lands (which
  has no URL state per D-14), or earlier if the planner prefers a single sweep.
- `src/lib/shared/urlState.ts` — `CompareFiltersSchema` stays but per D-24 the picker
  changes. Schema may stay as boatIds[] internally, but the UI swaps from text-input to
  typeahead.
- `tests/integration/phase2-routes.test.ts` — lines 14, 162–198, 268–310: tests for
  `/picker` and `/trends`. Drop those `it(...)` blocks; keep the `/`, `/about`, `/compare`,
  `/boats/[id]`, `/date/[d]` tests.

### `forecasts` references that survive deletion (review)
- `src/lib/db/catchReports.ts` line 90: `Excludes the year of forecastDate itself...` —
  comment block describing a function used by forecast compute. If function only used by
  forecast, delete with the rest. Audit during planning.

### One-line `git grep` confirmation commands for the executor
```bash
# Should return zero hits after retirement:
git grep -nE "/(picker|trends)" -- ':!.planning' ':!node_modules' ':!milestones'
git grep -n "forecast" -- ':!.planning' ':!node_modules' ':!milestones'
git grep -n "recomputeForecasts" -- ':!.planning' ':!node_modules' ':!milestones'
git grep -n "PerAngler.*forecast\|kind.*forecast" -- ':!.planning' ':!node_modules' ':!milestones'
```

## Compare Typeahead Pattern (D-24)

**Recommended:** `<input list="boats">` with `<datalist id="boats">` populated server-side
in the loader. Native browser autocomplete; mobile-native picker; zero client JS for v1.

```svelte
<!-- src/routes/compare/+page.svelte (new pattern) -->
<input
  type="text"
  list="boats-list"
  bind:value={boatNameInput}
  placeholder="Type a boat name…"
/>
<datalist id="boats-list">
  {#each data.allBoats as b (b.slug)}
    <option value={b.display_name}></option>
  {/each}
</datalist>
```

The form action looks up `boat_id` from `display_name` (or slug — slug is unambiguous;
`display_name` may have rare collisions). Recommend storing slug as the form value
internally (`<option value={b.slug}>{b.display_name}</option>`-style mapping).

**Why not a custom combobox:** A11y is hard, mobile is hard, deps add up. Native
`<datalist>` covers 95% of the "selecting a boat feels right" UX. If the explorer's existing
`<select>` (50+ options) feels OK at 375px, the typeahead-with-datalist will feel better.

`[ASSUMED]` `<datalist>` UX is good enough; if operator self-validation reveals fitness
gaps, upgrade to a small custom combobox in a follow-up.

**Alternative — extract `BoatSearchInput.svelte`:** If the explorer's boat picker also
wants typeahead later (currently a `<select>` per Phase 6 D-06), this component can be
shared. Phase 8 ships it ONLY for `/compare` — explorer keeps `<select>` until it's
demonstrated to need an upgrade.

## Granularity Bucketing Math (D-36)

The current explorer loader (`src/routes/explorer/+page.server.ts` lines 76–98) uses
`date-fns` helpers:
- Daily: `eachDayOfInterval` with `format(d, 'yyyy-MM-dd')`
- Weekly: `eachWeekOfInterval(..., { weekStartsOn: 1 })` (ISO Monday) with
  `format(d, "RRRR-'W'II")`
- Monthly: `eachMonthOfInterval` with `format(d, 'yyyy-MM')`

These match SQLite's `strftime('%Y-%m-%d' | '%G-W%V' | '%Y-%m', ...)`. **No new bucket
math is needed** — the existing helpers already cover Daily/Weekly/Monthly.

What IS needed:
- A `defaultGranularityFor(range)` helper in `src/lib/shared/range.ts` (or `dates.ts`)
  per D-36
- A bucket-start-date helper for x-axis `time` migration (per Pitfall 4) — convert
  `2025-W14` → ISO Monday timestamp; `2025-04` → first-of-month timestamp. Pure functions
  in `src/lib/shared/dates.ts`.

Both are tiny additions; tested with property-style cases (every range × granularity
combination produces correct bucket count).

## Validation Architecture

> Required per workflow.nyquist_validation enabled in .planning/config.json (default).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.0 |
| Config file | `vite.config.ts` (vitest section) |
| Quick run command | `npm run test:run -- <pattern>` (single file) or `npx vitest run path/to/test` |
| Full suite command | `npm run test:run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ALI-01 | `trip_type_aliases` table created idempotently; re-running migrations is no-op | unit | `npx vitest run tests/unit/db/migrations.test.ts` | ❌ Wave 0 |
| ALI-02 (read merge) | `homeSections` returns merged canonical labels; "Full Day Coronado Islands" sums into "Full Day" when aliased | unit | `npx vitest run tests/unit/db/queries/home.test.ts` | ❌ Wave 0 |
| ALI-02 (status passthrough) | `pending`-status labels propagate `pending: true` flag to home rows | unit | same as above | ❌ Wave 0 |
| ALI-03 (gate) | GET `/admin/trip-types` returns 401 without cookie; 200 with valid cookie | integration | `npx vitest run tests/integration/admin-auth.test.ts` | ❌ Wave 0 |
| ALI-03 (HMAC) | `verifyAdminCookie` rejects tampered payload; constant-time | unit | `npx vitest run tests/unit/auth/admin.test.ts` | ❌ Wave 0 |
| ALI-04 | Form action POST upserts alias row; idempotent | integration | `npx vitest run tests/integration/admin-crud.test.ts` | ❌ Wave 0 |
| ALI-05 | Migration seeds expected 22 rows on fresh DB; no-op on populated DB | unit | `tests/unit/db/migrations.test.ts` | ❌ Wave 0 |
| HOME-01 | Home loader returns ≥0 sections; each has ≥minTrips trip_count after alias merge | integration | `npx vitest run tests/integration/home.test.ts` | ❌ Wave 0 |
| HOME-02 | Each section's rows ordered by fpa desc; trip_count and totals correct vs spike fixture | unit | `tests/unit/db/queries/home.test.ts` | ❌ Wave 0 |
| HOME-03 | Bar normalization: `width = round((row.fpa / sectionMax) * 100)` — pure helper | unit | `tests/unit/lib/home/normalize.test.ts` | ❌ Wave 0 |
| HOME-04 | NEW badge: row's `pending` flag mirrored from any aliased input | unit | `tests/unit/db/queries/home.test.ts` | ❌ Wave 0 |
| HOME-05 | Home page URL has no query state; reset link points to `/` | integration | `tests/integration/home.test.ts` | ❌ Wave 0 |
| CMP-01 | `/compare` page renders `<datalist>` with N boats; selecting a name resolves to slug + boat_id | integration | `tests/integration/compare-route.test.ts` | ❌ Wave 0 |
| CMP-02 | `/compare` query results merge aliased trip types in chart series | unit | `tests/unit/db/queries/compare.test.ts` | already exists for old behavior; UPDATE |
| THM-01 | Toggle aria-label reflects current state ("Theme: Auto. Click for Light.") | unit | `tests/unit/components/ThemeToggle.test.ts` | ❌ Wave 0 |
| THM-02 (cookie roundtrip) | hooks reads cookie, passes to layout, `<html data-theme>` matches | integration | `tests/integration/theme-ssr.test.ts` | ❌ Wave 0 |
| THM-02 (validation) | Invalid cookie value → falls back to 'auto' (Pitfall 2) | unit | `tests/unit/server/theme.test.ts` | ❌ Wave 0 |
| THM-03 | Chart palette readback returns light tokens when `data-theme=light`, dark when `data-theme=dark` | unit (jsdom) | `tests/unit/components/Chart-palette.test.ts` | ❌ Wave 0 |
| GRN-01 | URL `?granularity=weekly` parses to `weekly`; missing param resolves to range default | unit | `tests/unit/shared/urlState.test.ts` | UPDATE existing |
| GRN-02 | Range switch handler: 1Y → 5Y resets `granularity` URL param to default for 5Y | unit | `tests/unit/routes/explorer-handlers.test.ts` | ❌ Wave 0 |
| AXS-01 | x-axis `time` mode: weekly bucket key `'2025-W14'` maps to Monday `2025-03-31` | unit | `tests/unit/shared/dates.test.ts` | UPDATE existing |
| RDR-01 | GET `/picker` → 301 with Location: /explorer; `/picker?slug=x` → same | integration | `tests/integration/redirects.test.ts` | ❌ Wave 0 |
| RDR-02 | GET `/trends` → 301 with Location: /explorer | integration | `tests/integration/redirects.test.ts` | ❌ Wave 0 |
| RTR-03 | Migration drops `forecasts` table idempotently | unit | `tests/unit/db/migrations.test.ts` | ❌ Wave 0 |
| RTR-06 | `shouldAlert(outcome='success', baseline=100, today=10)` → `false` (no row-count alert); `shouldAlert(outcome='parse_error', ...)` → `true` | unit | `tests/unit/scraper/sla.test.ts` | UPDATE existing if exists |
| POL-01 | `+error.svelte` renders for thrown loader error; preserves status code | integration | `tests/integration/error-boundary.test.ts` | ❌ Wave 0 |
| POL-02 | Loading skeleton appears in chart slot when `data.chartOption === null` and `loading` flag set | unit | `tests/unit/components/Chart.test.ts` | ❌ Wave 0 |
| POL-03 | Empty state copy varies based on `noHistoryEver` vs `noHistoryInRange` flag | unit | `tests/unit/copy/empty-states.test.ts` | ❌ Wave 0 |
| POL-04 | Each route's `<title>` matches expected pattern | integration | `tests/integration/route-titles.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:run -- <pattern>` for files touched
- **Per wave merge:** `npm run test:run` (full suite)
- **Phase gate:** Full suite green + manual UI walkthrough (D-40) before `/gsd-verify-work`

### Wave 0 Gaps

The following test files don't exist yet and must be authored alongside the corresponding
plan tasks (a "Wave 0" task pulls them in before implementation begins). Test framework
(Vitest) and config are already present — no install needed.

- [ ] `tests/unit/db/queries/home.test.ts` — covers HOME-02, HOME-04, ALI-02 (read merge)
- [ ] `tests/unit/db/aliases.test.ts` — covers ALI-02 unit-level (DAL helper functions)
- [ ] `tests/unit/db/migrations.test.ts` — covers ALI-01, ALI-05, RTR-03 (alias seed +
  forecasts drop, both idempotent)
- [ ] `tests/unit/auth/admin.test.ts` — covers ALI-03 HMAC verify, timing-safe compare
- [ ] `tests/unit/server/theme.test.ts` — covers THM-02 cookie validation (Pitfall 2)
- [ ] `tests/unit/components/ThemeToggle.test.ts` — covers THM-01 aria-label state machine
- [ ] `tests/unit/components/Chart-palette.test.ts` — covers THM-03 (jsdom + mocked
  computedStyle) — `[ASSUMED]` jsdom supports CSS-var readback; if not, defer this to
  manual self-validation
- [ ] `tests/unit/copy/empty-states.test.ts` — covers POL-03
- [ ] `tests/unit/routes/explorer-handlers.test.ts` — covers GRN-02 (pure URL-handler
  functions extracted from +page.svelte)
- [ ] `tests/integration/home.test.ts` — covers HOME-01, HOME-05
- [ ] `tests/integration/admin-auth.test.ts` — covers ALI-03 gate
- [ ] `tests/integration/admin-crud.test.ts` — covers ALI-04 form action
- [ ] `tests/integration/compare-route.test.ts` — covers CMP-01
- [ ] `tests/integration/theme-ssr.test.ts` — covers THM-02 SSR roundtrip
- [ ] `tests/integration/redirects.test.ts` — covers RDR-01, RDR-02
- [ ] `tests/integration/error-boundary.test.ts` — covers POL-01
- [ ] `tests/integration/route-titles.test.ts` — covers POL-04
- [ ] `tests/unit/scraper/sla.test.ts` — UPDATE: covers RTR-06 (verify only
  http_error/parse_error fire alerts; success+empty don't, regardless of row count)

### What requires manual browser self-validation per D-40

Some Phase 8 behaviors are inherently visual/interactive and either can't be unit-tested
or testing them in jsdom is more brittle than valuable. These need explicit manual
walkthrough per D-40:

| Surface | What to validate | Why manual |
|---------|------------------|------------|
| Home page rendering | Per-section bars look right at typical scale variance (3 Day section vs Full Day Coronado Islands); n=1 cells read honestly with trip-count beside fpa | Visual proportions; CSS layout |
| NEW badge | Visible, not too loud, not too quiet; positions correctly next to the trip-type heading | Visual signal-to-noise |
| Theme toggle | Three-mode cycle is intuitive; icon clearly indicates current state; tooltip explains; aria-label describes both state and action | UX feel |
| Theme — first-paint | Open in incognito with OS in dark mode; verify NO flash of light theme before CSS settles | Browser timing — can't simulate in jsdom |
| Theme — cookie persistence | Toggle Dark, refresh, still Dark. Toggle Auto, change OS theme, page follows. | OS integration |
| ECharts dark mode | Background, axis labels, legend, tooltip, moon sine curve all swap on theme change without re-rendering the page | Live render |
| Granularity selector | Hidden when range <3M; visible 3M+; clicking changes URL + chart; range switch resets to range default | Interaction sequencing |
| `/compare` typeahead | Native datalist UI feels right on iOS, Android, desktop; selecting a boat by typing first letters works | Mobile native UI |
| Mobile 375px | Home, /admin/trip-types, /compare all usable; bar widths don't overflow; theme toggle target is ≥44px | Layout + touch targets |
| Loading skeleton | Skeleton shape matches eventual chart shape; transitions in <200ms; respects reduced-motion | Visual continuity |
| Empty states | Copy reads naturally; "no history at all" vs "no history in range" feel distinct | Copy review |
| Error boundary | Throw a test error in a loader; page renders friendly message; status code preserved (browser DevTools Network tab) | Status code + HTML |
| 301 redirect | `/picker` → `/explorer` with HTTP 301 (DevTools Network tab); query strings dropped silently | Browser-level behavior |
| Admin login + CRUD | Mobile-usable at 375px; login form + table view + alias action all work; logout clears cookie | UX + a11y |

D-40 is durable executor instruction: after every UI-affecting task commit, run
`npm run dev`, click through the affected surface(s), screenshot, surface bugs.

## Sources

### Primary (HIGH confidence)
- Tailwind CSS v4 dark mode docs — `[CITED: tailwindcss.com/docs/dark-mode]` — verified pattern for `@custom-variant dark (...)` with `data-theme` attribute
- ECharts 6 release notes — `[CITED: echarts.apache.org/handbook/en/basics/release-note/v6-feature/]` — confirmed dynamic theme switching is native in v6
- SvelteKit 2 hooks docs — `[CITED: svelte.dev/docs/kit/hooks]` — `redirect(301, url)`, `transformPageChunk`, `handleError`
- SvelteKit 2 errors/redirects — `[CITED: svelte.dev/docs/kit/errors]` — `+error.svelte` pattern
- npm registry — `[VERIFIED: npm view]` — package versions current as of 2026-05-02
- Codebase grep — `[VERIFIED]` — retirement inventory derived from `git grep`

### Secondary (MEDIUM confidence)
- Tailwind v4 community articles — confirmed `@custom-variant` syntax via multiple independent sources (Medium, dev.to, schoen.world, jianliao blog)
- Discussion threads on `data-theme` attribute approach for tri-state Auto/Light/Dark

### Tertiary (LOW confidence — flagged for validation)
- Pre-seed alias content (the 22-label classification) — derived from spike addendum 2 inference, NOT operator-confirmed; only `Full Day Coronado Islands → Full Day` (CONTEXT.md "specifics") is a confirmed merge. Operator review required before commit.
- ECharts CSS-var readback approach — `[ASSUMED]` better than `registerTheme`; planner may revisit if jsdom test ergonomics are poor

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | LEFT JOIN with COALESCE is faster than a SQLite VIEW for alias resolution at this scale | Pattern 1 | Performance regression on home-page hot path. Mitigation: profile during execution; the Phase 6 D-20 contingency pattern (materialized table) applies here too |
| A2 | Two-pass home-page query (viable trip types → per-section top-N) is faster than a single window-function query | Code Examples §Home-Page | Same as A1 — profile if home page feels slow |
| A3 | The 22-label seed classification is operator-acceptable | Code Examples §Idempotent Alias Migration | Operator must hand-review; mistakes are reversible via admin page (D-01) |
| A4 | `<input list> + <datalist>` typeahead UX is good enough for `/compare` | Compare Typeahead Pattern | Operator self-validates; if poor, follow-up plan upgrades to combobox |
| A5 | Cookie SameSite=Lax with 1-year lifetime is acceptable for the theme cookie | Pattern 2 | Privacy review — cookie carries no PII; benign |
| A6 | Constant-time HMAC compare is sufficient for admin auth (no rate limit needed at v1 scale) | Pattern 5 | Brute force is the attack surface; one operator, low traffic, fail2ban-style mitigation can be added later |
| A7 | `data-theme="auto"` falls through to `prefers-color-scheme` natively via the `@custom-variant` selector with `:where(...)` | Pattern 2 | Test in browsers explicitly; the syntax is non-trivial |
| A8 | `recomputeForecasts` is the only consumer of `src/lib/db/catchReports.ts`'s `forecastYear`-parameterized query function. Removing the forecast pipeline makes that function dead code. | Aggressive Retirement Inventory | Audit during planning; if other consumers exist, keep the function |
| A9 | jsdom supports `getComputedStyle` reading CSS custom properties for testing the chart palette readback | Validation Architecture | If false, defer THM-03 to manual validation only |
| A10 | The home-page query must aggregate by canonical label, not raw label, for the viability filter (≥5 trips) to behave correctly under aliasing | Pitfall 1 | High impact if wrong — the home page would silently double-count or split rename pairs |
| A11 | jsdom-based unit tests for `data-theme` attribute changes are reliable enough for THM-03 | Validation Architecture | Could be flaky; manual self-validation is the backstop |
| A12 | Tailwind 4 `@custom-variant` accepts the complex `&:where(...)` selector with three-state fallthrough | Pattern 2 | Verify with a smoke test on the actual stack — if it doesn't work, fall back to JS-driven attribute setting (no `auto` mode falls through to media query — `auto` reads media query in JS and sets attribute to `light` or `dark`) |

**If this table is empty:** Not applicable — 12 assumptions flagged; planner and discuss-phase
should validate A3 (operator-only) and A12 (smoke-test) explicitly before committing.

## Open Questions

1. **Should `tests/unit/db/queries/trends.test.ts` survive the retirement?**
   - What we know: `src/lib/db/queries/trends.ts` is consumed by `/compare` (still in v2)
     and by `/explorer` (via `boatTrend`/`speciesTrend` in some shapes).
   - What's unclear: how many of the existing test cases are coupled to `/trends` route
     specifics vs the DAL functions themselves.
   - Recommendation: planner reviews the file and split — keep DAL-level tests, drop
     route-coupled tests.

2. **Pre-seed merges for the 22 labels — operator confirmation needed**
   - What we know: only `Full Day Coronado Islands → Full Day` is operator-confirmed
     (CONTEXT.md "specifics").
   - What's unclear: every other proposed merge in the seed is Claude's inference.
   - Recommendation: ship the migration with all 22 rows as `pending` if operator hasn't
     reviewed pre-ship; OR have plan-phase pause for an operator review of the seed
     content. **Suggest the latter** — this is a small, high-leverage 5-minute review.

3. **`forecastYear` query helper in `catchReports.ts` — dead code or still used?**
   - What we know: it's used by `src/lib/forecast/compute.ts` per the comment.
   - What's unclear: any other consumers.
   - Recommendation: planner audits during Wave 3 (retirement); if no other consumers,
     delete the function with the rest.

4. **Admin auth cookie scope when running on Fly.io vs localhost**
   - What we know: `Secure` flag required in production, breaks localhost dev (`http://`).
   - Recommendation: gate `Secure` flag on `process.env.NODE_ENV === 'production'`.
     Standard pattern.

5. **Should `/compare` allow alias-aware OR raw-label trip-type selection?**
   - What we know: D-25 says queries consult alias table.
   - What's unclear: does the `/compare` form's trip-type `<select>` show canonical labels
     only, or all source labels?
   - Recommendation: show canonical labels only (matches the home page and explorer's
     post-alias presentation). The admin page is the only place raw `source_label` is
     exposed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build + test + dev | ✓ | ≥22 (per package.json engines) | — |
| npm | Package management | ✓ | (with Node) | — |
| SQLite (better-sqlite3 native) | All DB work | ✓ | 12.9.0 | — |
| Browser (testing UI) | D-40 self-validation | ✓ (operator's machine) | n/a | — |
| ECharts CDN/bundle | Client-side chart | ✓ (npm dep) | 6.0.0 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

All Phase 8 work is pure code/config inside the existing repo.

## Security Domain

> Phase 8 introduces an admin route — security analysis required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Single password + signed cookie (admin only); constant-time compare via `crypto.timingSafeEqual` |
| V3 Session Management | yes | HttpOnly + Secure (prod) + SameSite=Strict cookies for admin; short lifetime (24h) |
| V4 Access Control | yes | `hooks.server.ts` gates `/admin/*` routes; explorer/home/compare are public read-only (no access control needed) |
| V5 Input Validation | yes | Zod for URL params + admin form fields; alias `source_label` and `canonical_label` length-bounded; `status` enum-validated |
| V6 Cryptography | yes | HMAC-SHA256 from Node's `crypto` (built-in, audited); never hand-roll signing |
| V7 Error Handling | yes | `+error.svelte` doesn't leak stack traces (POL-01); admin login errors don't reveal whether password was wrong vs other failure (uniform "Invalid credentials") |
| V12 Files / Resources | n/a | No file uploads in this phase |
| V14 Configuration | yes | `ADMIN_PASSWORD` and `ADMIN_COOKIE_SECRET` env vars must be set at deploy time; missing → admin route 503s with a clear "service misconfigured" message (not a stack trace) |

### Known Threat Patterns for SvelteKit + SQLite + Cookie Auth Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection in admin CRUD | Tampering | All DAL queries parameterized via better-sqlite3 named/positional placeholders; `source_label` length capped via Zod |
| Theme cookie injection into `<html data-theme>` (Pitfall 2) | Tampering / XSS | Validate cookie against literal enum; never echo raw |
| Admin password brute force | Spoofing | Constant-time compare; A6 acknowledges no rate limit at v1; mitigation = strong password + low-traffic site |
| Cookie tampering | Tampering | HMAC-signed; verify with `timingSafeEqual` |
| Cookie theft (XSS exfil) | Spoofing | HttpOnly + Secure (prod); session-cookie scope (admin cookie not readable to JS) |
| Open redirect via `/picker` redirect logic | Tampering | Hardcoded `/explorer` destination; no user input flows into the Location header |
| CSRF on admin form | Spoofing / Tampering | SameSite=Strict on admin cookie; SvelteKit form actions also include CSRF protection by default `[CITED: svelte.dev/docs/kit/form-actions]` |
| Information leak via 301 redirect query strings | Information disclosure | D-17 explicitly drops query strings; no leakage |
| Stored XSS via alias `notes` field | Tampering / XSS | Svelte auto-escapes; admin renders `notes` as plain text in `{notes}` interpolation |

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; versions verified against npm
- Architecture: HIGH — Phase 6/7 patterns extend cleanly; one architectural choice (LEFT JOIN vs VIEW) is an `[ASSUMED]` recommendation but both work
- Pitfalls: HIGH — most are codebase-specific and grounded in reading the existing source
- Theme system: MEDIUM — `@custom-variant` 3-mode pattern (A12) needs smoke-test verification; falling back to JS-driven attribute setting is straightforward
- ECharts theme integration: MEDIUM — readback pattern (A9) ergonomic but assumes jsdom support for CSS var readback; manual self-validation (D-40) is the backstop
- Pre-seed migration content: LOW — operator review required before commit (Open Question 2)
- Retirement inventory: HIGH — derived from actual `git grep`, not memory
- Test plan: HIGH — Vitest already present, patterns established

**Research date:** 2026-05-02
**Valid until:** 2026-06-01 (30 days; project moves quickly but stack is stable)

Sources:
- [Tailwind CSS v4 dark mode docs](https://tailwindcss.com/docs/dark-mode)
- [ECharts 6 release notes — handbook](https://echarts.apache.org/handbook/en/basics/release-note/v6-feature/)
- [SvelteKit hooks documentation](https://svelte.dev/docs/kit/hooks)
- [SvelteKit errors documentation](https://svelte.dev/docs/kit/errors)
- [Apache ECharts — themes / registerTheme](https://echarts.apache.org/en/download-theme.html)
- [Implementing Dark Mode and Theme Switching using Tailwind v4 (community)](https://www.thingsaboutweb.dev/en/posts/dark-mode-with-tailwind-v4-nextjs)
- [Flexible Dark Mode with Tailwind CSS v4 Custom Variants (schoen.world)](https://schoen.world/n/tailwind-dark-mode-custom-variant)
- [SvelteKit 2 redirect in hooks discussion #6624](https://github.com/sveltejs/kit/discussions/6624)
