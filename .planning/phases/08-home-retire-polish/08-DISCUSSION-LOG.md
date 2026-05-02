# Phase 8: Home, Retire, Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or
> execution agents. Decisions are captured in CONTEXT.md — this log
> preserves the alternatives considered and the framing.

**Date:** 2026-05-02
**Phase:** 08-home-retire-polish
**Mode:** discuss (interactive)
**Areas discussed:** Trip-type alias architecture, v1 retirement redirect contract, Theme system architecture, Granularity selector defaults

---

## Pre-discussion framing

Per operator request mid-discussion: "treat me more like a product manager
rather than tech lead." Subsequent questions reframed in plain-language
outcome terms (what the user / operator experiences), with mechanism as
supporting detail. Saved as durable feedback memory
`feedback_communication_style.md` for future sessions.

Per operator request late in discussion: "please do the validation yourself
by launching the web and testing and looking at screenshots ... feel free
to propose [bugs / improvements] when you find them." Saved as
`feedback_self_validate_ui.md`. Captured in CONTEXT.md as D-40 so the
executor agent inherits the rule.

---

## Trip-type alias architecture

### Operator edit UX

| Option | Description | Selected |
|--------|-------------|----------|
| A simple admin page | `/admin/trip-types` route, password-gated, mobile-usable. ~1 plan of work. | ✓ |
| A CLI command | `npm run alias-trip-type ...`. Lighter to build, requires laptop + repo checkout. | |
| Edit a JSON file in the repo | `aliases.json`, commit + redeploy per change. Zero UI cost. | |

**Selected:** A simple admin page (Recommended). Mobile workflow matters —
operator may adjudicate from phone.

### Aliasing strategy / data effect

| Option | Description | Selected |
|--------|-------------|----------|
| Both labels merge under one preferred name | Read-time translation. Raw scraped data untouched. Reversible. | ✓ |
| Both labels stay separate, just visually grouped | Two lines on chart, "combined" label on home. More confusing. | |
| Rename rewrites the data permanently | Overwrites trip_type column. Irreversible without re-scrape. | |

**Selected:** Read-time translation (Recommended). Reversibility is the
deciding factor — operator will be experimenting with renames.

### Initial seed strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-seed obvious merges, badge uncertain ones | Confident merges shipped; ambiguous one-offs ship as `pending` with NEW badges. | ✓ |
| Ship completely empty, you decide everything | Every historical label gets NEW badge. Max operator burden, zero misinterpretation risk. | |
| Pre-seed everything, no badges | Claude's best guess across all 22 labels. Fastest, lowest UX. | |

**Selected:** Pre-seed obvious + badge uncertain (Recommended). Saves
operator clicks on launch day; reversibility from D-02 means mistakes are
fixable.

### NEW badge lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Only when you adjudicate it | Badge stays until operator aliases or accepts. | ✓ |
| Auto-disappear after 30 days of activity | Removes operator burden; can hide source-site bug for 30 days. | |
| Never show in public UI — admin signal only | Public UI uniform; less honest to anglers. | |

**Selected:** Adjudicate-only (Recommended). Honest signal: "we haven't
decided what this label is yet."

---

## v1 retirement redirect contract

### Redirect mapping detail

| Option | Description | Selected |
|--------|-------------|----------|
| Translate what we can, drop the rest | `/picker?species=Y` → `/explorer?ticker=species&name=Y`; date param dropped silently. | |
| Send everything to bare `/explorer` | No param translation; `/picker?...` → `/explorer`. | ✓ |
| Send everything to `/` (new home page) | All v1 routes land on home. Throws away species/boat intent. | |

**Selected (free text):** "let's hide this page, I might think explorer
page covers what picker provides." Read as Option B (bare `/explorer`).
Operator's rationale: explorer covers picker's purpose, no need for
elaborate param translation.

### Permanent vs temporary redirect

| Option | Description | Selected |
|--------|-------------|----------|
| Permanent — 301 | Search engines transfer weight; browsers cache aggressively. | ✓ |
| Temporary — 302 | Engines keep indexing old URL; browsers don't cache. Wrong signal here. | |

**Selected:** 301 permanent (Recommended).

### Internal link sweep scope

| Option | Description | Selected |
|--------|-------------|----------|
| Aggressive — grep whole repo, fix everything | Source, tests, docs, README, /about, nav, footer, CHANGELOG. | ✓ |
| Just user-facing ones (nav, footer, /about) | Skip stale references in tests / planning docs. | |

**Selected:** Aggressive (Recommended). Risk of a broken UI link slipping
through outweighs the small extra time.

---

## Theme system architecture

### Toggle UX

| Option | Description | Selected |
|--------|-------------|----------|
| Three-way segmented control: Light / Dark / Auto | Pill in header, all options visible. Most discoverable. Slightly more pixels. | |
| Cycle button (sun/moon icon) | Single icon, click to cycle. Compact. Current state must be clearly indicated by icon. | ✓ |
| Dropdown menu | Compact + explicit. Two clicks to change. | |

**Selected:** Cycle button (operator override of recommended segmented
control). Captured the icon-clarity caveat in CONTEXT.md D-27.

### First-paint flash

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — zero flash even on first paint | Theme stored in cookie; SSR renders with chosen theme. Most polished. | ✓ |
| No — brief flash on first paint is fine | LocalStorage; HTML loads light, JS flips to dark in ~50–150ms. Simpler. | |

**Selected:** Zero flash (Recommended). Matches "shareable with friends"
polish bar.

### Cross-device persistence model

| Option | Description | Selected |
|--------|-------------|----------|
| Per-device with Auto default | First visit follows device; toggling overrides locally. | ✓ |
| Site-wide across devices | Requires account system not yet built. Confirmed out of scope. | |

**Selected:** Per-device with Auto default (Recommended).

---

## Granularity selector defaults

### Default per range

| Option | Description | Selected |
|--------|-------------|----------|
| Daily 1M–3M, Weekly 6M–2Y, Monthly 5Y–All | Conservative density per range. Recommended baseline. | |
| Daily 1M only, Weekly 3M–1Y, Monthly 2Y–All | Lower density default; cleaner, less noisy. | |
| Always default to densest readable | Show-me-everything mental model. | |

**Selected (free text):** "daily for 1-6 M, weekly for 1y - all."
Translated to: Daily for 1M / 3M / 6M; Weekly for 1Y / 2Y / 5Y / All;
Monthly never a default (still available as manual override).
Operator-chosen density: ~180 dots at 6M/Daily, ~260 dots at All/Weekly —
dense but readable; monthly is one click away.

### Selector placement

| Option | Description | Selected |
|--------|-------------|----------|
| In ExplorerHeader alongside range strip | All "how the chart is shaped" controls in one row. Hidden for ranges <3M. | ✓ |
| Right above the chart, separate row | More breathing room; uses more vertical space (matters on phone). | |

**Selected:** Header alongside range strip (Recommended).

### Behavior on range switch

| Option | Description | Selected |
|--------|-------------|----------|
| Reset to new range's default | Each range has its own natural granularity. Override sticks until next range switch. | ✓ |
| Keep previous choice if compatible | Less surprising for power users; more invisible logic. | |

**Selected:** Reset to default (Recommended).

---

## Claude's Discretion

Areas explicitly delegated to Claude at planning / implementation time. Full
list in CONTEXT.md `<decisions>` "Claude's Discretion" subsection.
Highlights:

- Admin auth mechanism (lightest secure option)
- `trip_type_aliases` schema specifics
- Home-page query shape (single grouped vs per-section)
- Bar normalization arithmetic (section max vs k × median)
- Skeleton vs spinner per loading surface
- Empty-state and error-page copy strings
- Dark palette token strategy (parallel CSS vars vs Tailwind dark variant)
- ECharts theme integration approach
- Plan wave-split (4 plans speculated by design notes; planner picks)

---

## Deferred Ideas

Captured in CONTEXT.md `<deferred>`. Highlights:

- Top-species "what moved this week" rank-shift visualization
- Multi-window switcher on home page
- Trip-type filter on home page
- Sparse trip-type "low-volume" section
- Cross-device theme persistence (requires account system)
- Embed / screenshot chart sharing
- Hierarchical alias-table grouping UX
- "Long Range" home-page section (confirmed absent across 3.7yr of data)
