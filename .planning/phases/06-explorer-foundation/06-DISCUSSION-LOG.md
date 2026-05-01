# Phase 6: Explorer Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 06-explorer-foundation
**Areas discussed:** First-screen default view, Ticker switcher + selector UX
**Areas Claude-decided after operator said "decide on those details so we can get to work":** Chart overlay shape, n placement, thin-data rendering, time bucketing, custom date UX, performance at All, series colors, tooltip model, mobile layout, route name, nav placement

---

## First-screen default view

### Q1 — Default ticker / boat

| Option | Description | Selected |
|--------|-------------|----------|
| Most-active in last 30 days | Boat with most trip-days reported in last 30 days. Tie-break alphabetical. | ✓ |
| Most-recently-scraped boat | Most recent boat to appear in any scrape | |
| Operator-pinned boat | Hardcoded favorite | |
| Highest avg fish/angler last 90 days | "Hot" boat by per-angler yield | |

**User's choice:** Most-active in last 30 days (Recommended).

### Q2 — Default time range

| Option | Description | Selected |
|--------|-------------|----------|
| 1Y | Full annual cycle | ✓ |
| 3M | Tight recent window | |
| 6M | Half-year | |
| All | Everything | |

**User's choice:** 1Y (Recommended).

### Q3 — Empty default fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-widen the range until data shows | 1Y → All with explanatory note | ✓ |
| Show empty state + "pick another boat" nudge | Honest, worse first impression | |
| Pick a different boat instead | Falls through to next-most-active | |

**User's choice:** Auto-widen the range until data shows (Recommended). Note copy: "No 1Y data — showing full history."

### Q4 — URL on first load

| Option | Description | Selected |
|--------|-------------|----------|
| Clean /explorer; resolve defaults server-side | URL gains params on user interaction | ✓ |
| Redirect to fully-expanded URL | Always shareable but home bookmark drifts | |
| Clean URL, expand on first interaction | Hybrid | |

**User's choice:** Clean /explorer (Recommended).

---

## Ticker switcher + selector UX

### Q5 — Ticker TYPE switcher

| Option | Description | Selected |
|--------|-------------|----------|
| Segmented pill toggle [Boat][Species][Landing] | Compact, 375px-friendly | ✓ |
| Tab strip with underline | Page-nav feel | |
| Plain "Show me by:" dropdown | Most compact, hides 3-way | |
| Three always-visible selectors | Cluttered at 375px | |

**User's choice:** Segmented pill toggle (Recommended).

### Q6 — Specific-item picker

| Option | Description | Selected |
|--------|-------------|----------|
| Searchable combobox (recommended) | Type to filter; new pattern in codebase | |
| Plain native `<select>` dropdown | Consistent with v1 FilterBar; mobile-native | ✓ |
| List + sticky search field in sheet | Familiar mobile pattern | |

**User's choice:** Plain native `<select>` (NOT recommended — operator preferred v1-pattern consistency and lower scope over the combobox upgrade).

### Q7 — Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Top bar, sticky on scroll | Stock-chart feel | ✓ |
| Top bar, NOT sticky | More vertical space for chart on mobile | |
| Reuse existing FilterBar | Most consistent with v1 routes | |

**User's choice:** Sticky top bar (Recommended).

### Q8 — Ticker TYPE-switch behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Range stays, selection resets to sensible cross-axis default | boat→species the boat catches most; species→boat catches it most | ✓ |
| Range stays, fixed default per type | Simpler logic | |
| Both reset | Cleanest, loses context | |

**User's choice:** Range stays, smart cross-axis default (Recommended).

### Q9 — Boat dropdown order

| Option | Description | Selected |
|--------|-------------|----------|
| Alphabetical (recommended) | Stable, predictable | |
| By activity (most-trips-last-90d first) | Hot boats float up | ✓ |
| Grouped by landing | Optgroup pattern | |

**User's choice:** By activity (NOT recommended — operator wanted live boats up top despite reorder-over-time trade-off). Tie-break later resolved as alphabetical (Q12).

### Q10 — Species dropdown order

| Option | Description | Selected |
|--------|-------------|----------|
| Alphabetical | Predictable | ✓ |
| Curated top-species first | Risks paternalism | |
| By total catch volume last 1Y | Rockfish-heavy | |

**User's choice:** Alphabetical (Recommended).

### Q11 — URL identifier for boats

| Option | Description | Selected |
|--------|-------------|----------|
| Numeric ID (recommended) | `?id=42` — consistent with v1 trends | |
| Slug (e.g., `pacific-voyager`) | Human-readable; new schema work | ✓ |
| Exact name | Brittle, encoding edge cases | |

**User's choice:** Slug (NOT recommended — operator wanted human-readable share URLs; new `boats.slug` column scoped in for this phase).

### Q12 — Boat scope in dropdown

| Option | Description | Selected |
|--------|-------------|----------|
| Show all boats with any scrape data ever | Inclusive | ✓ |
| Only boats scraped last 90 days | Live but loses history | |
| All + visual separator | Best of both, more chrome | |

**User's choice:** Show all (Recommended).

### Q13 — Slug rename behavior (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Slug stays frozen at first-seen | URLs keep working | ✓ |
| Slug regenerates on rename | Old URLs 404 | |
| Regenerate + redirect from old | Slug-history table | |

**User's choice:** Frozen at first-seen (Recommended).

### Q14 — Slug scope (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Slug for boats only; species + landings = plain name | Scoped schema work | ✓ |
| Slug for everything | Consistent but unused | |
| Plain name everywhere | Re-opens earlier decision | |

**User's choice:** Slug boats only (Recommended).

### Q15 — Activity-order tie-break (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Alphabetical secondary sort | Stable | ✓ |
| Most-recent-scrape-date secondary | More live, can flip daily | |
| Total catch volume secondary | Risks meatlocker framing | |

**User's choice:** Alphabetical secondary (Recommended).

---

## Wrap

After 15 questions across 2 areas, the operator selected "Ready for context" then immediately followed with **"can you decide on those details so we can get to work"** — instructing Claude to lock the remaining open items rather than discussing them.

## Claude-decided (operator delegated)

These items were not asked of the operator. Claude resolved them in CONTEXT.md as D-15 through D-25 to give the planner a complete contract. They remain editable — if the operator disagrees with any during plan review, they're easy to flip before execution.

- **D-15 Chart overlay shape** — one chart, series-on-the-same-chart per ticker type; species breakdown as a small table below (boat ticker only); top-6 cap with "+N more" collapse.
- **D-16 Sample-size n placement** — legend label, axis-crosshair tooltip, chart caption.
- **D-17 Thin-data rendering** — gaps as line breaks (`connectNulls: false`).
- **D-18 Time bucketing** — auto-pick: 1M=daily, 3M/6M/1Y=weekly, 2Y/5Y/All=monthly. No user override this phase.
- **D-19 Custom date UX** — `[Custom]` 8th button reveals two native date inputs; URL `range=custom&fromDate=…&toDate=…`.
- **D-20 Performance at All** — query tuning + caching first; pre-aggregated table is a planner contingency triggered at >300ms server time.
- **D-21 Series colors** — ECharts default categorical palette, capped at 6 visible.
- **D-22 Tooltip** — axis-crosshair, single tooltip across all visible series.
- **D-23 Mobile layout at 375px** — three-row sticky top bar; chart 280px height; caption + breakdown table below.
- **D-24 Route name** — `/explorer` (final).
- **D-25 Nav placement** — second item after Home.

## Deferred Ideas

None — discussion stayed in scope. Three items captured as **planner contingencies** in CONTEXT.md `<deferred>`: the materialized-table fallback for All-range performance, a future user-facing granularity toggle, and a future combobox upgrade.
