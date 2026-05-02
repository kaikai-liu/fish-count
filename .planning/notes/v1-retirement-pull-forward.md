---
title: Pull v1 /picker + /trends retirement forward
date: 2026-05-01
context: /gsd-explore session after Phase 7 ship — operator decided to retire v1 surfaces earlier than the original Phase 10 plan
related_phases: [8]
status: scope-extended 2026-05-01 — entire Phase 10 scope (incl. forecast pipeline) folded into renumbered Phase 8 (was 7.5); old Phase 10 removed from roadmap
---

# Pull v1 /picker + /trends retirement forward

## Original plan

Phase 10 (v1 Retirement) was scheduled to retire v1's read surfaces — `/picker`,
`/trends`, the calendar heatmap, and the forecast pipeline — after the
explorer milestone settled (i.e., after Phases 6, 7, 8, 9 shipped). Goal: keep
the live site stable through the v2 build-out.

## Operator decision (2026-05-01)

Pull `/picker` and `/trends` retirement **forward**. Reasons:

- The explorer (Phase 6 + 7) is now the de-facto front door.
- v1 routes in the nav are noise that confuses anglers about which surface to
  use.
- The new home page (Phase 7.5) is what replaces `/picker` as the landing — it
  makes more sense to retire `/picker` at the same time the new home lands,
  not three phases later.

## Scope

**Retire as part of the pull-forward:**

- `/picker` — v1 trip-picker route. Replaced by the explorer's multi-axis
  ticker selection.
- `/trends` — v1 trends route. Replaced by the explorer's range selector.
- The picker's calendar heatmap (already deferred for retirement; goes with
  `/picker`).

**Keep in v2 (do NOT retire):**

- `/compare` — operator confirmed v2 scope, NOT v1 retirement. Needs the
  boat-ID UX fixed (`.planning/todos/pending/compare-page-boat-id-picker.md`).

**Stays in original Phase 10 scope (NOT pulled forward):**

- ~~v1 forecast pipeline — DAL tables (`forecasts`, `forecast_runs`), recompute
  cron, `forecast-benchmark` script, any forecast UI surfaces. Separate concern;
  retire as planned.~~ **Superseded 2026-05-01:** operator extended scope to
  fold the entire Phase 10 (incl. forecast pipeline) into the renumbered
  Phase 8. See "Final placement decision" below.

## Risks to address

### Breaking shared v1 links / bookmarks

Anyone who pinned a v1 URL like `/picker?date=2025-08-15&species=yellowtail`
loses their link. **Mitigation**: 301 redirects from old routes to the closest
explorer equivalent.

Suggested redirect map:

| From | To |
|------|----|
| `/picker` | `/explorer` |
| `/picker?date=…&species=Y…` | `/explorer?ticker=species&name=Y…` (drop date) |
| `/trends` | `/explorer` |
| `/trends?species=Y…` | `/explorer?ticker=species&name=Y…` |

Param mapping is best-effort — v1's date-scoped picker doesn't have a clean
analog in v2 (the explorer is range-based, not date-pinned). Acceptable to
drop the date param and let the explorer use its default range.

### Search engines indexed v1 routes

Same 301 strategy fixes this. Update `robots.txt` if needed; remove the
retired routes from the sitemap.

### Internal links

Search the codebase for hard-coded `/picker` / `/trends` references and update.
At minimum: nav, footer, README, any blog/announcement copy.

```bash
git grep -nE "/(picker|trends)" -- :^.planning :^node_modules
```

### Tests for v1 surfaces

Phase 10's plan will have removed test files for `/picker` and `/trends`
already — pull those test removals into the same phase as the route removal
to keep the build green.

## Final placement decision (2026-05-01)

Picked option **(a) extended**: fold the entire Phase 10 (`/picker`, `/trends`,
calendar heatmap, forecast pipeline, lints, alert rule cleanup, `/about` page
cleanup, v1 test removals) into the renumbered **Phase 8** alongside the
new home page, the trip-type alias mapping, the `/compare` boat-ID picker
fix, and the entirety of old Phase 11 (Polish & Dark Mode).

Rationale:
- The home page is what replaces `/picker` as the landing — retiring at the
  same time the new home lands is more coherent than splitting.
- Forecast pipeline retirement is mostly DB and cron work — it doesn't
  conflict with home-page UI work; running them together saves a phase
  boundary.
- v2 is small enough (4 phases after the merge) that one big "ship the v2
  story" phase is reviewable if the plan wave-splits the work.

Plan-phase will likely produce 3-5 plans wave-split as: (1) alias table +
home-page query, (2) home-page UI + per-section bar normalization, (3) v1
route retirement + 301 redirects + forecast pipeline drop, (4) `/compare`
fix + dark mode + error/loading/empty states.

## Carry-forward into renumbered Phase 9 (Sharing — was Phase 8)

When the URL-roundtrip contract is designed, it should NOT include any
`/picker`- or `/trends`-style URL formats. Only `/explorer` URLs round-trip.
Home-page filter state (e.g. window selector, if added later) should also
round-trip — see `front-door-design-decisions.md`.
