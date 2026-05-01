# CLAUDE.md — FishCount

> Project guidance for Claude sessions. Kept short on purpose. The operator is
> not a software engineer or UI designer — read this file as if explaining the
> project to a sharp non-technical person.

## What FishCount is

A public web app that helps San Diego recreational anglers spot trends in
charter-boat catch data. It scrapes daily totals from
`sandiegofishreports.com/dock_totals/boats.php` (the existing public dashboard)
and turns them into views the source site doesn't offer — primarily a
"stock-chart for fish" explorer where you pick a boat, species, or landing as
your ticker and see catch history with comparison overlays.

The audience is SD anglers familiar with the scene. The polish bar is
"shareable with a fishing buddy" — not a startup, not public launch.

## What we're building right now (v2)

A trend explorer replacing v1's trip-picker direction:

- Pick a boat (default), species, or landing as the ticker
- See catch history over a chosen range (1M / 3M / 6M / 1Y / 2Y / 5Y / All)
- Overlay comparisons — a boat's trip types, a species across boats, a
  landing's species mix
- Optional moon-phase markers on the time axis
- Email alerts when a followed boat or species hits an unusual day

v1's trip picker, statistical forecasts, and calendar heatmap are retiring.
The scraper, database, and basic browse routes carry forward.

## What we're NOT building

Per-angler individual tracking · social feed / posts / comments / photos ·
gamification (points / levels / achievements) · ML or AI-generated fishing
forecasts · push or SMS notifications · mandatory accounts to browse · booking
or payment
integration · bait / tackle / technique recommendations · GPS catch maps ·
personal catch logbooks · "on fire" hype badges · paywalls · sponsored boat
slots in rankings · manual scrape triggers in the UI · non–San Diego data.

## How to work with the operator

- Explain decisions in plain English. If you must use a technical term,
  define it inline the first time.
- Ask before destructive actions: deleting code, force-pushing, dropping
  data, sending email to real people, rewriting git history.
- Trust the operator's domain knowledge. They know SD fishing better than
  you do — what trip types mean, what off-season looks like, what numbers
  anglers read intuitively. Ask when uncertain instead of guessing.
- Don't invent rules and present them as the operator's decisions. If a
  habit is your recommendation from research, label it that way.
- Show data with context (e.g., sample size, trip-type label) and let
  anglers judge thin data themselves. Don't paternalistically refuse to
  render facts.

## Domain language — use verbatim, don't normalize

Anglers notice when these are wrong.

- **Trip types:** "1/2 Day AM," "1/2 Day PM," "3/4 Day," "Full Day," "Full
  Day Coronado Islands," "Overnight," "1.5 Day," "2 Day," "2.5 Day," "3 Day,"
  "Long Range." Never collapse to "half-day" or invent buckets.
- **Landings:** "Fisherman's Landing," "Point Loma Sportfishing" (never "Pt
  Loma"), "H&M Landing," "Seaforth," "Helgren's," "Dana Wharf," "Oceanside."
- **Species:** "bluefin," "yellowtail," "yellowfin," "dorado" (not
  "mahi-mahi" — SD uses dorado), "wahoo," "calicos" or "calico bass,"
  "rockfish," "lingcod."
- **Metric:** "per angler" (more honest than "per rod" or "per person").

## Where the detail lives

| If you need... | Read |
|---|---|
| Current project context, what's shipped, what's planned | `.planning/PROJECT.md` |
| What we're working on right now | `.planning/STATE.md` |
| Current milestone's roadmap | `.planning/ROADMAP.md` |
| Current milestone's requirements | `.planning/REQUIREMENTS.md` |
| Tech stack, architecture, prior research | `.planning/research/` |
| Installed libraries and versions | `package.json` |
| Past milestones (archived) | `.planning/milestones/` |

This file (`CLAUDE.md`) is intentionally short. Detail belongs in the files
above so it can age and update without a rewrite here.
