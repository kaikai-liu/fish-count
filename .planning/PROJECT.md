# FishCount

## What This Is

FishCount is a public web app for San Diego recreational anglers, built around publicly-scraped charter boat catch data from `sandiegofishreports.com/dock_totals/boats.php`. v1.0 shipped a browse + trip-picker + statistical-forecast read surface; **the project pivots in v2 to a multi-axis catch trend explorer** — pick a species, boat, or landing as your "ticker"; overlay comparisons across the others — moving away from the picker/forecast direction toward an explorer-style UX.

The v1.0 codebase remains in `src/` after milestone close; the picker and forecast routes are deliberately-retired v1 features that may or may not survive the v2 redesign. The scraper, DAL, and historical store are the load-bearing foundation that carries forward.

## Core Value

**v1.0 (shipped, retired):** Given a date and a target species, help an angler pick the charter boat with the best historical odds.

**v2 (TBD via `/gsd-new-milestone`):** Visualise SD charter boat catch over time across multiple comparison axes (species across boats / landings; boat or landing performance across species), like exploring a stock-market chart. Email alerts retained on top. Pure historical — no forecasts, no picker, no heatmap.

## Requirements

### Validated (v1.0)

<!-- Shipped and confirmed working in v1.0. Foundation for v2. -->

- ✓ Scheduled scrape of `sandiegofishreports.com/dock_totals/boats.php` into local SQLite — *v1.0 (Phase 1)*
- ✓ Polite scraper: ≤12 req/min, robots.txt honor, custom UA with contact, file-mutex single-flight, gzipped HTML snapshots — *v1.0 (Phase 1)*
- ✓ Idempotent upsert on `(date, boat_id, trip_type, species)`; re-running scrape produces identical state — *v1.0 (Phase 1)*
- ✓ Resumable backfill CLI (`npm run backfill`) covering full historical range — *v1.0 (Phase 1)*
- ✓ `scrape_runs` ledger distinguishing "tried no rows" from "never tried"; row-count SLA alert at <50% of 7-day average — *v1.0 (Phase 1)*
- ✓ DAL boundary enforced — `lib/db/` is the only module that issues SQL; static-grep test — *v1.0 (Phase 1)*
- ✓ Single date producer in `lib/shared/dates.ts`, all dates `YYYY-MM-DD` in `America/Los_Angeles` — *v1.0 (Phase 1)*
- ✓ Boats + landings as first-class tables; verbatim source labels preserved for filters — *v1.0 (Phase 1)*
- ✓ Anonymous browse (no account); URL filter state round-trips for shareability — *v1.0 (Phase 2)*
- ✓ Mobile-usable at 375px — *v1.0 (Phase 2)*
- ✓ Per-angler framing inline (not tooltip-only) on every metric, enforced by 3-file allowlist lint — *v1.0 (Phase 2; structural carry-over to v2)*
- ✓ Mandatory trip-type segmentation — cross-trip-type comparison impossible in UI — *v1.0 (Phase 2; structural carry-over to v2)*
- ✓ Side-by-side compare for 2–3 boats within a single trip type — *v1.0 (Phase 2)*
- ✓ Trend chart with weekly/monthly aggregation; gap-aware bucketing — *v1.0 (Phase 2; carries to v2)*
- ✓ "About the data" page explaining source + scrape cadence + per-angler caveat — *v1.0 (Phase 2)*
- ✓ Statistical forecast layer (seasonal-naïve baseline + 80% PI + n + n<5 refusal + 30-day horizon cap) — *v1.0 (Phase 3) — slated for retirement in v2*

### Active (v2 — pending `/gsd-new-milestone`)

<!-- v2 scope is anticipated but not yet locked. /gsd-new-milestone will redo this section. -->

- [ ] Multi-axis trend explorer: pick a species, boat, or landing as the "ticker"; overlay comparison series across the others
- [ ] Email signup + abuse-safe alerts (carried from retired v1 Phase 4 with redesigned trigger logic)
- [ ] Polish for "shareable with friends" finish (carried from retired v1 Phase 5)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- **Trip picker** — retired in v2. The "rank a boat for a target species" framing felt narrower than the explorer-style multi-axis view; v1 picker code remains in `src/routes/picker/` until v2 plans say otherwise.
- **Statistical forecasts** — retired in v2. Wide PIs on thin data felt hectic per the operator; v2 stays purely historical. v1 `forecasts` table + recompute pipeline remains in code until v2 plans retire them.
- **Calendar heatmap** — retired in v2. The picker's 30-day heatmap was one of the consumers; without the picker it doesn't carry obvious value.
- Individual per-angler tracking — source data is boat-aggregate only; per-angler numbers are derived averages, not real people.
- Social feed / posts / comments / photos — orthogonal to "explore the data."
- Leaderboards / gamification — incentivises meatlocker-boat metrics over quality fishing.
- ML-based forecast models — data-hungry, opaque, not honestly achievable on one upstream source.
- Web push / SMS / in-app notifications — email is sufficient.
- Mandatory account / login to browse — explorer stays anonymous; signup exists only to receive alerts.
- Booking / payment integration — regulatory exposure (PCI); source already links to operators.
- Bait / tackle / technique recommendations — source doesn't capture; would be guesswork.
- Map of catch locations / GPS coordinates — source doesn't publish; captains protect spots.
- Personal catch logbook — off-mission; FishCount is a decision/exploration tool, not a journal.
- AI-generated / chat-assistant fishing reports — hallucination risk on a domain anglers can verify.
- "ON FIRE" / "hot bite" engagement-bait badges — SD audience is sophisticated.
- Paywall / premium tier — data is publicly sourced.
- Sponsored / promoted boat slots — compromises objectivity.
- Manual scrape trigger in UI — scheduled + resumable CLI covers it.
- Non-San-Diego data — scope is the one source site.

## Context

- **Data source:** `sandiegofishreports.com/dock_totals/boats.php`. Date-scoped pages with boats × (landing, angler count, trip type, species-level catch counts). Server-rendered PHP — no Playwright needed.
- **Data granularity:** boat-aggregate per day. No per-person data; "fish per angler" is always a derived average, never an attribution.
- **Audience:** San Diego recreational anglers familiar with the scene (landings, trip types like 1/2 Day AM/PM, Full Day Coronado Islands, 2 Day Trips, target species like bluefin, yellowtail, dorado, calicos).
- **v1 scope target:** "shareable with friends," not public-launch ready. Same target carries to v2.
- **v1 codebase state at close:** 7,272 LOC source / 9,249 LOC tests across 28 plans. SvelteKit + adapter-node, better-sqlite3 + Drizzle, Cheerio + undici, ECharts 6, Tailwind 4, croner. 459/459 tests passing on main.
- **v1 known integration defect (carried):** `src/routes/picker/+page.svelte:180` short-circuits the heatmap render when `rankings.length===0`. Fix may not be needed if v2 retires the route.

## Constraints

- **Data source single point of failure:** if sandiegofishreports.com changes HTML or rate-limits scrapers, the pipeline breaks. Stay polite (≤12 req/min) and keep gzipped snapshots so parser fixes can replay.
- **Data granularity:** cannot attribute catches to individuals. All per-angler metrics are averages — UI copy must be honest about this. Mandatory trip-type segmentation is structural, not cosmetic.
- **Scope polish:** v2 target is still "shareable with friends." Don't gold-plate SEO, marketing pages, or onboarding.
- **Account model:** anonymous browse remains the default. Email collected only for alerts.
- **Source-site goodwill:** TOS review + courtesy outreach email gate (`FIRST_SCRAPE_OK`) is structural — first production scrape is held until operator completes both. Carries unchanged to v2.

## Key Decisions

<!-- Decisions that constrain future work. v1.0 outcomes recorded; v2 decisions added as they're made. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Modular monolith over services (one SvelteKit deployment, one SQLite) | Fits v1 scope; preserves option to swap SQLite for Postgres later via DAL boundary | ✓ Good — DAL boundary enforced, no leaks |
| DAL is the only module that issues SQL | Boundary preservation; static-grep test enforces it | ✓ Good — survives unchanged into v2 |
| Idempotent upsert on `(date, boat_id, trip_type, species)` | Backfill = loop; parser fixes = re-run affected dates | ✓ Good — saved time on multiple Phase 3 fixes |
| Single date producer in `lib/shared/dates.ts` | DST safety; PT-canonical; static-grep test | ✓ Good — caught two Phase 3 bugs (today() called twice; Feb-29 mismatch) |
| Phase 0 precedes Phase 1 (guardrails before scraping) | Cost/kill/backup costs 10–100× to retrofit | ✓ Good — paid off in catching CR-01 (litestream env-var) before live deploy |
| Backfill is a CLI, not a cron route | Cron timeouts can't cover hours of polite-rate-limited backfill | ✓ Good — also enabled D-12 resume pattern |
| Pure-math forecast engine with db-injected handle | Per-cell try/catch isolation; no module-scope SQL | ✓ Good — survived the Phase 3 nightly recompute hook without rework |
| Forecast honesty: ship the seasonal-naïve baseline labeled, not a fake-fancy model | CLAUDE.md non-negotiable #3 | ✓ Good — but feature itself retiring in v2 |
| Per-angler framing rendered inline, not tooltip-only | UI honesty per CLAUDE.md non-negotiable #4 | ✓ Good — structural; carries to v2 |
| Trip picker as v1 core value | Operator's stated decision-making flow at v1 start | ⚠️ Revisited — retired in v2. The "pick the boat" frame turned out narrower than the explorer-style "see the data" frame the operator wanted |
| Statistical projection (PIs + n + refusal) over ML | Transparent math, fits scope | ⚠️ Revisited — retired in v2 (operator: "too hectic seems"). Pure historical preferred |
| Trip picker ships with all three views (ranked list, avg/angler numbers, heatmap) | Multiple lenses for different decision styles | ⚠️ Revisited — only the trend view direction survives to v2 |
| Anonymous browse + email-only signup for alerts | Low friction, alerts only need email | — Pending v2 (alerts feature carries forward; redesigned triggers) |
| Email alerts on day 1 with anti-abuse + deliverability | 10× retrofit cost per CLAUDE.md non-negotiable #5 | — Pending v2 (carries forward as planned-but-unbuilt requirement) |

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
*Last updated: 2026-04-30 after v1.0 milestone close. v1.0 shipped early at 4 of 6 planned phases due to scope pivot. v2 direction (multi-axis trend explorer) anticipated but pending /gsd-new-milestone.*
