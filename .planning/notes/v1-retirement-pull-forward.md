---
title: Pull v1 /picker + /trends retirement forward
date: 2026-05-01
context: /gsd-explore session after Phase 7 ship — operator decided to retire v1 surfaces earlier than the original Phase 10 plan
related_phases: [7.5, 10]
status: decided, awaiting plan-phase placement
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

- v1 forecast pipeline — DAL tables (`forecasts`, `forecast_runs`), recompute
  cron, `forecast-benchmark` script, any forecast UI surfaces. Separate concern;
  retire as planned.

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

## Probable phase placement

Three options for packaging:

- **(a) Folded into Phase 7.5 (Home & Discovery)** — coherent because the new
  home page is what replaces `/picker`. Bigger phase but atomic.
- **(b) Its own small phase 7.6 (Retire `/picker` + `/trends`)** — smaller,
  easier review. Adds an extra phase boundary.
- **(c) Reduced Phase 10 pulled forward** — Phase 10 originally covered
  picker, trends, AND forecast pipeline. Pull forward only the picker/trends
  half, leave the forecast pipeline retirement at its original Phase 10 slot.

Decision deferred to the eventual plan-phase session. Operator preference
reads as "ship small things, polish later" — that argues for (b) or (c).

## Carry-forward into Phase 8 (Sharing)

When Phase 8's URL-roundtrip contract is designed, it should NOT include any
`/picker`- or `/trends`-style URL formats. Only `/explorer` URLs round-trip.
