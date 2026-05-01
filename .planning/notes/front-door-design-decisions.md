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

- **Phase 7.5: Home & Discovery** — implements the above. Inserts between
  Phase 7 (shipped) and Phase 8 (Sharing) so that Sharing's URL-roundtrip
  contract can include any home-page filter state from the start, not be
  retrofitted.
- **Phase 8: Sharing** — should round-trip home-page state, not just explorer
  state.
- **Phase 11: Polish & Dark Mode** — already carries the chart-axis switch
  (`category` → `time`) and the explicit granularity selector; this note
  doesn't add new polish items.

## Process note

Phase 7.5 is NOT to be plan-phased directly. A `/gsd-spike` data-exploration
session must run first (see `phase-7.5-data-spike-prompt.md`) so that the
phase plan is grounded in actual data distributions, not speculation about
what trip types have enough volume etc.
