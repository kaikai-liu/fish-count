# FishCount

## What This Is

FishCount is a public web app that aggregates San Diego charter boat fishing data — scraped from sandiegofishreports.com's dock totals page — and turns it into views the source site doesn't offer: a trip picker that recommends boats for a target species on a future date, trend charts across seasons, side-by-side boat comparisons, and statistical forecasts for how the upcoming season looks. It's for San Diego recreational anglers deciding which charter to book.

## Core Value

**Trip picker.** Given a date (or range) and a target species, help an angler pick the charter boat with the best historical odds. Everything else — trends, comparisons, forecasts, alerts — orbits this decision.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] Scheduled scrape of `sandiegofishreports.com/dock_totals/boats.php` into local storage *(Phase 1)*
- [x] Historical backfill of all dates the source exposes *(Phase 1)*
- [x] Store per-boat, per-day records: boat, landing, trip type, angler count, species + counts *(Phase 1)*
- [x] Derive per-angler averages (boat total ÷ anglers on that trip) *(Phase 2)*
- [x] Trip picker: given date + species, show ranked boat list *(Phase 2)*
- [x] Trip picker: show historical avg fish/angler alongside rankings *(Phase 2)*
- [x] Trip picker: 30-day calendar heatmap view *(Phase 2 — gray for n<5; Phase 3 added forecast-driven coloring for today/future)*
- [x] Trend charts: catches over weeks/months/seasons by species and/or boat *(Phase 2)*
- [x] Boat comparison: side-by-side performance across custom date ranges *(Phase 2)*
- [x] Filters + search: by species, boat, landing, trip type *(Phase 2)*
- [x] Anonymous browsing (no account needed to view any data) *(Phase 2)*
- [x] Statistical projection: seasonal-naïve weighted-yield baseline + 80% prediction interval + sample size, refusing to render at n<5, capped at 30-day horizon *(Phase 3)*

### Active

<!-- Current scope. Building toward these. -->


- [ ] Email signup for alerts (the one account-gated feature) *(Phase 4)*
- [ ] Alerts: notify when a followed species starts running or a followed boat has a hot day *(Phase 4)*
- [ ] Polish sufficient to share a URL with fellow anglers without embarrassment *(Phase 5)*

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Individual per-angler tracking — source data is boat-aggregate only; per-angler numbers are derived averages, not real people
- Web push / SMS / in-app notifications — email is enough for v1
- ML-based forecast models — statistical projection is transparent and sufficient; revisit only if projections prove insufficient
- Mandatory account / login to browse — browsing stays anonymous; signup exists only to receive alerts
- Manual-only scrape trigger — scheduled scraping covers it; no UI button needed
- SEO, domain, public launch polish — v1 is "shareable with friends," not "post on r/fishing"
- Non-San-Diego fishing reports — scope is the one source site

## Context

- **Data source:** `sandiegofishreports.com/dock_totals/boats.php`. Pages are date-scoped and expose past dates via a calendar/date navigation. Each page lists boats with: name, landing, angler count, trip type, and species-level catch counts.
- **Data granularity:** The source only publishes per-boat-per-day aggregates. There is no per-person data, so "fish per angler" will always be a derived average, never an attribution to an individual angler.
- **Audience:** San Diego recreational anglers who already know the scene — they're familiar with the landings, the trip types (1/2 Day AM/PM, Full Day Coronado Islands, 2 Day Trips, etc.), and the target species.
- **Differentiation vs. source:** The source site shows today's totals and lets you navigate one date at a time. FishCount's value is cross-date analysis: trends, forecasts, and trip-picker recommendations built on the full historical dataset.

## Constraints

- **Data source**: One upstream site — if sandiegofishreports.com changes its HTML or rate-limits scrapers, the pipeline breaks. Scrape respectfully (rate-limit, cache, don't hammer during backfill).
- **Data granularity**: Cannot attribute catches to individuals. All per-angler metrics are averages only — UI copy must be honest about this.
- **Scope polish**: v1 target is "shareable with friends," not public-launch ready. Don't gold-plate SEO, marketing pages, or onboarding.
- **Forecast honesty**: Statistical projection only — no ML magic. Confidence bands must be shown so users understand prediction uncertainty.
- **Account model**: Anonymous browsing is the default; email is collected only for alerts. Don't build login flows into paths that don't need them.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Derive per-angler metric as boat-total ÷ angler-count | Source only provides boat aggregates; honest interpretation of available data | — Pending |
| Statistical projection (averages + confidence bands) over ML for forecasts | Transparent math, fits v1 scope, avoids data-hungry model training | — Pending |
| Scheduled scrape only — no manual trigger in UI | User preference; scheduled nightly pull is sufficient | — Pending |
| Anonymous browsing + email-only signup for alerts | Low friction for a public tool; email is the only personal data needed for the alerts feature | — Pending |
| Backfill all available historical data from source | Trip picker / forecasts depend on depth of history; backfill once, then incremental from that point | — Pending |
| Trip picker ships with all three views (ranked list, avg/angler numbers, calendar heatmap) | User picks the lens that fits their decision-making style; no single view dominates | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-26 after Phase 3 (Forecast Layer) complete — 3/6 phases done. Forecast layer ships seasonal-naïve baseline labeled as such per ROADMAP success criterion #2; FCT-04 honesty benchmark documents calibration; n<5 hard floor + 80% PI + 30-day horizon enforced.*
