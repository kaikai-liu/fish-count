---
title: Front-door / discovery design decisions
date: 2026-05-01
context: post Phase-7 ship — operator surfaced four front-door concerns; this note captures the design conclusions reached in the /gsd-explore session before Phase 7.5 planning
related_phases: [7.5, 8, 11]
---

# Front-door / discovery design decisions

## Background

After Phase 7 (moon overlay) shipped, the operator raised four concerns about
the experience an angler has *getting to* the explorer, distinct from the
explorer itself:

1. No "top performers / recent activity" section — anglers landing at the site
   can't tell which of dozens of boats / species / landings to pick.
2. `/compare` page asks for boat IDs that don't appear anywhere else in the UI.
3. v1 `/picker` and `/trends` routes still live; should they retire earlier than
   the planned Phase 10?
4. Home page renders "today's counts" but the daily scrape hasn't run yet on a
   morning visit — page is blank.

These four hang together: the explorer works once you know what you want to
look at; the surrounding context to *get* there is incomplete.

## Decisions reached

### Discovery lives on the home page (not the explorer's empty state)

The home page is being reframed from "today's counts dashboard" to a
"what's been biting" front door. Replacing the page solves concerns #1 and #4
together — the today-fallback bug just goes away because we're showing
past-N-days, not today.

### Unit is fish per angler — always

Different boats carry different numbers of anglers, so raw counts aren't
honestly comparable. This matches what the explorer already does and what
CLAUDE.md has always said. Raw catch and angler count appear next to the
fish-per-angler number as supporting context (e.g. `Premier · 5.5 fish/angler ·
45 anglers · 247 total`), not as the lead metric.

### Structure: separate top-lists per trip type

A "top boats by fish/angler this week" list that mixes 1/2 Day AM, Full Day,
and Long Range trips would be misleading — fish/angler scales differently on
each trip type (a 4 fish/angler day on a 1/2 Day AM is different from 4
fish/angler on a Long Range). The home page therefore shows a separate top
list per trip type.

Polish (trip-type filter, time-window control, etc.) explicitly deferred —
ship the per-trip-type lists first, polish later.

### Time window = past 7 days (first cut)

For the initial home page, "recent" means past 7 days. A multi-window switcher
(yesterday / past 7 / past 30) is polish — defer to a later phase. 7 days
gives enough volume for most trip types while still feeling current.

### `/compare` is v2 scope, NOT a v1 retirement candidate

Operator confirmed (2026-05-01) that `/compare` is a v2-scope route. Its
boat-ID UX is a real bug that needs fixing — a typeahead/picker like the
explorer's boat dropdown. Captured as a todo
(`.planning/todos/pending/compare-page-boat-id-picker.md`); likely absorbs
into Phase 7.5 since "discover by name, not ID" shares the discovery theme.

### Pull v1 `/picker` and `/trends` retirement forward (was Phase 10)

Operator decision (2026-05-01): retire v1 `/picker` and `/trends` earlier than
the originally-planned Phase 10. The explorer is now the de-facto front door
and v1 nav items are noise. `/compare` does NOT retire (see above). v1
forecast pipeline still retires in original Phase 10 scope. See
`.planning/notes/v1-retirement-pull-forward.md` for risks (link breakage,
redirect strategy) and packaging options.

### Job-to-be-done is a mix

The home page serves three jobs simultaneously, not one:

- **Trip planning** — "which boat should I book this weekend?"
- **Curiosity** — "what's been biting in SD recently?"
- **Validation** — "I went out yesterday and got X — was that a good day?"

We are not picking a single primary job; the page should serve all three. This
implies more than one section (top boats per trip type, top species, possibly
a recent-activity strip) — concrete shape decided after the data spike.

### Top-performer rankings are core value, NOT gamification

CLAUDE.md previously banned "leaderboards or gamification" together. The
operator clarified mid-session that honest top-performer rankings (most fish
caught last week, etc.) are exactly the value the site is supposed to provide
— what dock-totals readers already do by hand. CLAUDE.md and PROJECT.md were
updated to allow rankings while keeping gamification (points / levels /
streaks / hype badges) out of scope.

## What this means for upcoming phases

**Update 2026-05-01 (post-spike):** the data spike (`spikes/001-phase-7.5-data-exploration/`)
ran and surfaced source-label drift as a real, just-happened issue. The
operator then expanded Phase 7.5's scope: it now absorbs Phase 10 (v1
Retirement) and Phase 11 (Polish & Dark Mode) entirely, plus the `/compare`
boat-ID picker fix and a new trip-type alias mapping table. The roadmap
collapses from 6 v2 phases to 4. See "Final Phase 7.5 scope" below for the
authoritative list.

- **Phase 7.5 → renumbered to Phase 8: Home, Retire, Polish** (the big phase) —
  implements all the above plus everything previously in Phases 10 and 11.
- **Old Phase 8: Sharing → renumbered to Phase 9** — should round-trip
  home-page state, not just explorer state.
- **Old Phase 9: Email Alerts → renumbered to Phase 10** — unchanged scope.
- **Phase 10 (v1 Retirement) and Phase 11 (Polish & Dark Mode): removed** —
  all scope absorbed into the new Phase 8.

## Final Phase 7.5 / Phase 8 scope (decided 2026-05-01)

The big phase. Plan-phase will likely wave-split it; this is the
authoritative scope list, not a plan.

**Home & Discovery (original 7.5):**
- New home page: top boats per viable trip type, past 7 days, fish/angler.
- Per-trip-type bar normalization (~30× scale variance — see spike).
- "New label" indicator for trip types that just appeared.
- No "top species" section in v1 (spike showed weekly membership is too
  stable to be interesting; revisit as rank-shift later).
- Skunked-trip / zero-angler defensive code NOT needed (zero such cases
  in 14 months of data).

**Trip-type alias mapping (added today):**
- New table the operator can edit when the source renames a trip type
  ("Full Day" → "Full Day Coronado Islands" on 2026-04-27 was the
  triggering case).
- Home-page query + explorer queries consult the alias table so renamed
  series stay continuous.

**v1 retirement (pulled forward from old Phase 10):**
- Delete `/picker` route + calendar heatmap → 301 redirect to `/explorer`.
- Delete `/trends` route → 301 redirect to `/explorer`.
- Drop v1 forecast pipeline: `forecasts` table migration drop, delete
  `src/lib/forecast/`, remove nightly recompute cron, delete
  `scripts/forecast-benchmark.ts`, delete forecast UI surfaces.
- Remove the 3-file allowlist lint (no longer applicable per v2
  trust-the-audience principle).
- Replace row-count <50% silent-failure alert with scraper/parser-failure-only
  alerting (off-season zero-row days don't false-positive).
- Clean `/about` page — no leftover picker/forecast/heatmap references.
- Delete v1-only test files for retired surfaces.

**`/compare` fix (folded in):**
- Replace boat-ID input with a typeahead/picker like the explorer's
  (`.planning/todos/pending/compare-page-boat-id-picker.md`).

**Polish & Dark Mode (pulled forward from old Phase 11):**
- Friendly error pages on every route (no stack traces, no blank screens).
- Loading skeletons / spinners while charts fetch.
- Empty-state copy when a ticker has no data.
- Descriptive `<title>` per route.
- Light / dark / follow-system theme toggle, persisted across visits.
- Carry-forward Phase 7 polish: chart x-axis `category` → `time`;
  explicit Daily / Weekly / Monthly granularity selector for ranges ≥3M.

## Process note

Phase 7.5 / Phase 8 is NOT to be plan-phased directly. A `/gsd-spike` data-exploration
session must run first (see `phase-7.5-data-spike-prompt.md`) so that the
phase plan is grounded in actual data distributions, not speculation about
what trip types have enough volume etc.
