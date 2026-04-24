# Phase 2: Browse + Trip Picker + Trends - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 02-browse-trip-picker-trends
**Mode:** discuss (auto — recommended defaults selected without interactive questioning)
**Areas discussed:** Routing / IA, Data loading pattern, DAL extension, Ranking metric, Date semantics, Calendar heatmap, Per-angler framing, URL state, Provisional badge, Source-site attribution, Comparison page, Trend chart, "Why this boat?" panel, Caching, Mobile layout, Chart component, Dev seed

---

## Routing / IA

| Option | Description | Selected |
|--------|-------------|----------|
| One-page SPA with tabs | Single `/` route with tabbed browse/picker/trends/compare | |
| Route-per-surface (SSR) | Separate routes: `/`, `/date/[d]`, `/picker`, `/boats/[id]`, `/compare`, `/trends`, `/about` | ✓ |
| Hybrid (single page + deep links) | One page, URL controls active view via hash/query | |

**Choice rationale:** Shareable URLs (BRW-07) and SSR-first data loading (D-03) both favor distinct routes. Each route maps to a `+page.server.ts` loader that reads URL state and queries the DAL.

---

## Data loading pattern

| Option | Description | Selected |
|--------|-------------|----------|
| `+page.server.ts` direct DAL | Server loaders call `src/lib/db/` repositories in-process; ship HTML with data | ✓ |
| REST-style `/api/*` routes | Page components `fetch('/api/...')` client-side; API routes query DAL | |
| Svelte stores + client fetch | Load empty shell, hydrate via fetch from stores | |

**Choice rationale:** SQLite is in-process; a client fetch hop would add latency for zero benefit. SvelteKit adapter-node is built for SSR + direct server-code access.

---

## DAL extension structure

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing per-table files | Pile more query functions into `catchReports.ts` etc. | |
| New `queries/` subfolder | Cross-table read compositions live under `src/lib/db/queries/` | ✓ |
| SQL in route loaders | Quick and dirty; violates STO-03 | |

**Choice rationale:** STO-03 + CLAUDE.md lock the DAL boundary. Splitting write-path repos from read-composition modules keeps files focused without leaking SQL.

---

## Ranking metric semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Weighted yield: Σ catch / Σ anglers | One ratio across all trips in window — matches "boat-aggregate average" framing | ✓ |
| Mean of per-trip ratios | Averages each trip's ratio independently; small-trip sensitivity | |
| Median of per-trip ratios | Robust to outlier trips but loses sample-size intuition | |

**Choice rationale:** PITFALLS §4 flagged cross-trip ratio averaging as the honest framing. Median/trimmed-mean is a V1X-03 toggle deferred.

---

## Trip picker date handling

| Option | Description | Selected |
|--------|-------------|----------|
| Single target date + ± window | Default single date, optional "± N days" input (default N=3) | ✓ |
| Always a date range | Force user to pick from/to — more input friction | |
| Fixed 30-day window | No user control — simplest UI but inflexible | |

**Choice rationale:** TRP-01 says "date or range". Single-date-plus-window is the common case (picking a specific trip day); explicit range toggle covers "I have flexibility across a week".

---

## Calendar heatmap: low-data + palette

| Option | Description | Selected |
|--------|-------------|----------|
| Gray cells at n<5, viridis scale otherwise | Colorblind-safe continuous palette; gray override via itemStyle | ✓ |
| Red/green hot/cold | Intuitive but falsely implies "good/bad" + colorblind-unsafe | |
| Single-hue intensity (all blue) | Low contrast; n<5 distinguishing harder | |

**Choice rationale:** PITFALLS §UX + CLAUDE.md honesty rules. TRP-09 mandates gray for insufficient data; viridis is the default colorblind-safe option ECharts supports natively.

---

## Per-angler framing placement

| Option | Description | Selected |
|--------|-------------|----------|
| Reusable component with inline caveat + link | One component renders metric + "derived boat-aggregate average" + /about link | ✓ |
| Tooltip-only caveat | Hover/tap reveals the caveat; easier to miss | |
| Single page-header disclaimer | Mentioned once at page top; harder to reinforce per-row | |

**Choice rationale:** CLAUDE.md non-negotiable #4 explicitly says "inline disclaimer (not tooltip-only)". The component pattern enforces the rule structurally — no way to render a metric without its framing.

---

## URL state

| Option | Description | Selected |
|--------|-------------|----------|
| URL query strings + typed helper | Single source of truth; SSR + client both read from URL | ✓ |
| Svelte stores (memory) | Lost on reload; not shareable | |
| Cookies / localStorage | Persists but not shareable; complicates SSR | |

**Choice rationale:** BRW-07 explicitly requires "shareable via link (query-string state)".

---

## Provisional badge rule

| Option | Description | Selected |
|--------|-------------|----------|
| Today-date → always provisional; past → final | Calendar-date rule, not clock-event-based | ✓ |
| Time-of-day gate (e.g., before 23:00 PT) | Clock-dependent; rolls over mid-day; complicates display logic | |
| Tied to scrape-run completion events | Requires reading scrape_runs on every render | |

**Choice rationale:** Simplicity + correctness. Once calendar midnight PT passes, "today" becomes "yesterday" automatically — the nightly scrape at 23:00 PT has had hours to finalize the data.

---

## Comparison page UX

| Option | Description | Selected |
|--------|-------------|----------|
| Required trip-type + 2-3 boats + date range | Columns side-by-side; shared line chart below | ✓ |
| Free-form multi-boat, no trip-type lock | Violates CLAUDE.md non-negotiable #4 (mandatory trip-type segmentation) | |
| Paired boat vs boat only (exactly 2) | TRN-03 says "two or three" — locking at 2 loses flexibility | |

**Choice rationale:** TRN-03 + CLAUDE.md non-negotiable #4.

---

## Trend chart UX

| Option | Description | Selected |
|--------|-------------|----------|
| Species + trip-type required, boat optional, weekly/monthly toggle | Locks honest comparison; covers both TRN-01 + TRN-02 | ✓ |
| Species-only, auto-average across trip types | Violates trip-type segmentation rule | |
| Fixed weekly granularity | Loses the "multi-year monthly pattern" view | |

**Choice rationale:** CLAUDE.md non-negotiable #4 enforces the trip-type filter; toggle granularity supports both TRN-01 (species over time) and TRN-02 (boat over time).

---

## Caching

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP Cache-Control max-age only | Differs by page type (today=60s, past=1d, derived=5min) | ✓ |
| In-app LRU cache layer | Adds invalidation complexity; SQLite is already in-process | |
| No caching at all | Wastes CDN capacity for past-date pages that never change | |

**Choice rationale:** SQLite reads are ~microseconds in-process. HTTP headers let intermediary caches (if any) do useful work; no invalidation complexity.

---

## Mobile layout

| Option | Description | Selected |
|--------|-------------|----------|
| Tailwind mobile-first + responsive breakpoints | 375px baseline, `md:` adds columns on wider viewports | ✓ |
| Separate mobile/desktop routes | Duplicate maintenance; SEO-hostile | |
| CSS Grid desktop-first + media queries downgrading | Inverts Tailwind's intended flow | |

**Choice rationale:** BRW-08 requires 375px usability. Tailwind 4.2's mobile-first conventions pair naturally with Svelte's `class:` directive.

---

## Chart component

| Option | Description | Selected |
|--------|-------------|----------|
| `<Chart>` wrapper with dynamic ECharts import | Client-only; server passes shaped data; bundle-split per chart type | ✓ |
| svelte-echarts library | Extra dep; less control over lifecycle/teardown | |
| SSR chart fallback (Canvas on server) | ECharts 6 docs explicitly warn against SSR | |

**Choice rationale:** STACK.md: "Render charts client-side — do not try to SSR them." Dynamic import keeps the home page from shipping ECharts JS when it doesn't render a chart.

---

## Dev seed strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Fixture replay via scripts/seed-dev-db.ts | Committed HTML fixtures → parser → DAL; deterministic; safe | ✓ |
| Live backfill via npm run backfill (Phase 1 path) | Requires FIRST_SCRAPE_OK; not all contributors will have this | |
| SQL dump committed to repo | Leaks any real scraped data; opens PII/compliance issues | |

**Choice rationale:** Phase 2 UI development needs data before backfill lands in the dev environment. Fixtures are idempotent, shareable, and already in repo.

---

## Claude's Discretion

Areas left flexible for the planner:
- Exact filenames in `src/lib/db/queries/`
- Svelte component decomposition beyond `PerAnglerMetric` + `Chart`
- Heatmap historical-aggregate formula (same-month-day mean vs rolling window) — gray-at-n<5 rule non-negotiable
- Viridis palette hex values
- Whether Tailwind Typography plugin is installed for `/about`
- Boat URL ID vs slug

---

## Auto-Resolved (Auto Mode)

All 17 areas above were auto-resolved with recommended defaults. No interactive questions were asked. Rationale: every decision has a strongly-recommended option grounded in either CLAUDE.md non-negotiables, STACK.md research, or PITFALLS guidance; none are 50/50 tradeoffs requiring user input.

## Deferred Ideas

See CONTEXT.md `<deferred>` section — includes forecast-layer items (Phase 3), alert system (Phase 4), polish (Phase 5), v1.x analytics extensions, and a handful of non-load-bearing UI choices.
