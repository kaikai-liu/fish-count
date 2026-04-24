# Roadmap: FishCount

## Overview

FishCount ships in six phases, ordered strictly by data dependency and credibility-guardrail co-shipping. Phase 0 installs cost/kill/backup guardrails before a single cloud request is made. Phase 1 builds the polite, observable, resumable scraper-plus-store that the entire product depends on — and exits only when a full historical backfill is done. Phase 2 opens the read surfaces (browse, trip picker, boat detail, trends) and locks in the per-angler framing that every downstream metric inherits. Phase 3 adds the statistical forecast layer (prediction intervals, `n`, refusal-when-n<5, seasonal-naïve baseline) and recolors the calendar heatmap. Phase 4 ships the only user-write path — email signup + double opt-in + alerts — with anti-abuse and deliverability engineered in on day one, never retrofitted. Phase 5 is a narrow polish pass sized for "shareable with friends," not public launch.

## Phases

**Phase Numbering:**
- Integer phases (0, 1, 2, 3, 4, 5): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 0: Ops Guardrails** - Cost alerts, kill switch, backups, and dead-man's switch before any cloud traffic
- [ ] **Phase 1: Ingest + Store** - Polite scraper, idempotent store, observability, resumable backfill complete
- [ ] **Phase 2: Browse + Trip Picker + Trends** - Public read surfaces with honest per-angler framing and shareable URLs
- [ ] **Phase 3: Forecast Layer** - Statistical projections with prediction intervals, `n`, refusal-when-n<5, calendar recolor
- [ ] **Phase 4: Email Alerts** - Abuse-safe signup, double opt-in, deliverability, hot-day and run-start alerts
- [ ] **Phase 5: Polish** - Loading/empty/error states and shareable-with-friends finish

## Phase Details

### Phase 0: Ops Guardrails
**Goal**: Cloud deployment is cost-capped, kill-switchable, backed up, and monitored for silent scraper death — before any production request leaves the machine.
**Depends on**: Nothing (first phase)
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, OPS-06
**Success Criteria** (what must be TRUE):
  1. Setting `SCRAPER_ENABLED=false` in the hosting provider dashboard halts all scraping on the next tick without a redeploy.
  2. A forced test (pausing the scrape ping for >36h in staging) fires the dead-man's switch alert to the operator.
  3. Triggering a simulated $20 spend threshold sends a billing alert to the operator email.
  4. The SQLite file on the server is observably replicated to the object-storage bucket (Litestream status + file listing in bucket with recent timestamp).
  5. Structured logs for a manual request are queryable after the fact (retained, not ephemeral).
**Plans**: 7 plans
Plans:
- [ ] 00-00-PLAN.md — Scaffold SvelteKit + TypeScript + Tailwind + Vitest + Docker + fly.toml (greenfield foundation)
- [ ] 00-01-PLAN.md — Litestream replication to Backblaze B2 + entrypoint restore-on-boot + drill (OPS-03)
- [ ] 00-02-PLAN.md — pino structured logging + SvelteKit request-ID correlation + Better Stack sink (OPS-06)
- [ ] 00-03-PLAN.md — SCRAPER_ENABLED kill-switch gate + croner stub heartbeat + SIGTERM shutdown (OPS-05)
- [ ] 00-04-PLAN.md — healthchecks.io dead-man's switch: pingHealthcheck() + scheduler wiring + drill (OPS-04)
- [ ] 00-05-PLAN.md — Resend operator-alert wrapper + Fly GraphQL billing watcher in GH Actions (OPS-01)
- [ ] 00-06-PLAN.md — Deploy to Fly + verify all 5 success criteria end-to-end + signed verification record (OPS-02)

### Phase 1: Ingest + Store
**Goal**: A polite, observable, idempotent scraper writes to a canonical schema; the full historical dataset sandiegofishreports.com exposes is in the local store via a resumable CLI; silent-failure monitoring is armed.
**Depends on**: Phase 0
**Requirements**: ING-01, ING-02, ING-03, ING-04, ING-05, ING-06, ING-07, ING-08, ING-09, ING-10, ING-11, STO-01, STO-02, STO-03, STO-04, STO-05
**Success Criteria** (what must be TRUE):
  1. Running the backfill CLI against the full historical range completes successfully with outbound rate ≤ 12 requests/minute and resumes correctly after a forced kill mid-run.
  2. A synthetic empty-HTML response triggers the row-count SLA alert without any code change — silent failure is no longer silent.
  3. The nightly scheduled scrape runs unattended and writes new rows idempotently (re-running the same date produces identical final state, no duplicates).
  4. A written TOS + robots.txt summary exists in `.planning/research/` and the operator of the source site has received the courtesy outreach email, both prior to the first production scrape.
  5. Querying a known date in the store returns canonical `CatchReport` rows conforming to schema, with `scrape_attempts` distinguishing "tried, no rows" from "never tried."
**Plans**: 9 plans
Plans:
- [ ] 01-01-PLAN.md — Schema + DAL repositories (boats, landings, catchReports, scrapeRuns, parseFailures) replacing Phase 0 smoke.ts (STO-01..05, ING-04, ING-09)
- [ ] 01-02-PLAN.md — Scraper fetcher + rate limiter + file mutex + FIRST_SCRAPE_OK gate (ING-02, ING-03, ING-10 gate)
- [ ] 01-03-PLAN.md — Parser + Zod schema + HTML fixtures with quarantine on malformed rows (ING-06)
- [ ] 01-04-PLAN.md — Gzipped HTML snapshot writer (ING-05)
- [ ] 01-05-PLAN.md — Pipeline orchestrator + scheduler tick replacing _heartbeatTick (ING-01, ING-04, ING-09)
- [ ] 01-06-PLAN.md — Resumable backfill CLI via tsx + node:util parseArgs (ING-03, ING-08)
- [ ] 01-07-PLAN.md — Row-count SLA alert wired to Phase 0 operator-alert (ING-07)
- [ ] 01-08-PLAN.md — TOS review template + outreach email draft + FIRST_SCRAPE_OK runbook (ING-10, ING-11)
- [ ] 01-09-PLAN.md — Static STO-04 date-boundary test + end-to-end integration + VALIDATION.md sign-off (STO-03, STO-04)

### Phase 2: Browse + Trip Picker + Trends
**Goal**: Any SD angler can open the site, see today's dock totals, jump to any past date, run a trip-picker query, open a boat's detail page, and compare boats — all anonymously, all on mobile, all with per-angler numbers labeled honestly as derived boat-aggregate averages.
**Depends on**: Phase 1
**Requirements**: BRW-01, BRW-02, BRW-03, BRW-04, BRW-05, BRW-06, BRW-07, BRW-08, BRW-09, TRP-01, TRP-02, TRP-03, TRP-04, TRP-05, TRP-06, TRP-07, TRP-08, TRP-09, BOAT-01, BOAT-02, TRN-01, TRN-02, TRN-03
**Success Criteria** (what must be TRUE):
  1. Opening `/` shows today's per-boat counts (boat, landing, trip type, anglers, species, counts) with a visible "Last scraped at [time PT]" indicator and a "provisional" badge during the reporting window; every row links back to its source-site page.
  2. A user can enter a target date and target species, get a ranked list of boats sorted by avg fish/angler for a mandatorily-selected trip type, with each result showing `n` trips, last trip date, and a "Why this boat?" explanation; boats with n<5 render with a "low data" flag (not hidden).
  3. Every page that shows a per-angler number displays the "derived boat-aggregate average, not individual angler" framing inline (not only in tooltips), and the "About the data" page exists and is linked from the metric.
  4. The page is usable at 375px viewport with no horizontal scroll, filter state round-trips through the URL (copy-paste shareable), and the 30-day calendar heatmap renders insufficient-data cells as gray (not green/red).
  5. Every boat has a detail page linking back to its landing and the source site's boat page; users can compare 2–3 boats side-by-side across a custom date range within a single trip type, and can view weekly/monthly trend charts filtered by species + trip type.
**Plans**: TBD
**UI hint**: yes

### Phase 3: Forecast Layer
**Goal**: A statistical projection (mean + prediction band + `n`) per (species, trip_type, date-window) is precomputed nightly, beats seasonal-naïve on a held-out window, refuses to render when `n<5`, and powers the calendar heatmap's coloring.
**Depends on**: Phase 2
**Requirements**: FCT-01, FCT-02, FCT-03, FCT-04, FCT-05, FCT-06, FCT-07
**Success Criteria** (what must be TRUE):
  1. Every rendered forecast displays its sample size `n` alongside the projection; no point estimate is rendered when `n<5` (the UI shows "not enough history" instead).
  2. A seasonal-naïve baseline is checked into the codebase; the shipped projection model has a recorded benchmark result beating it on a held-out validation window (or the baseline ships and is labeled as such).
  3. Forecast tables regenerate automatically as part of the nightly scrape pipeline — no manual recompute step, and queries for "today" never return stale-by-a-cycle results.
  4. The calendar heatmap's cell coloring is driven by the precomputed forecast for that cell's (date, species, trip_type); forecast horizon requests beyond 30 days render a "horizon too far" message instead of a number.
  5. All displayed forecast numbers are integers (no false-precision decimals) and gap-aware aggregations report "based on N of M days" when scrape gaps exist in the input window.
**Plans**: TBD

### Phase 4: Email Alerts
**Goal**: Anglers can opt in to email alerts for followed boats or species and receive "hot day" and "starting to run" notifications — with list-bombing, deliverability, and abuse protections all shipping on day one.
**Depends on**: Phase 3
**Requirements**: ALT-01, ALT-02, ALT-03, ALT-04, ALT-05, ALT-06, ALT-07, ALT-08, ALT-09, ALT-10, ALT-11, ALT-12
**Success Criteria** (what must be TRUE):
  1. A signup attempt with a honeypot-field value, a disposable-email address, or a fourth submission from the same IP inside one hour is rejected; only double-opt-in-confirmed emails end up in the active alerts list.
  2. A test-send to mail-tester.com scores > 9/10; SPF, DKIM, and DMARC pass; every outbound email carries a working `List-Unsubscribe` header, a one-click unsubscribe link, a physical postal address, and a plain-language reason-for-receipt.
  3. Unsubscribing writes to a suppression list; attempting to re-subscribe that address through the public signup form does not re-activate alerts.
  4. After a scrape where a followed boat's avg/angler exceeds 2× its trailing 30-day same-trip-type average (with ≥ N anglers) or a followed species' 7-day fleet-wide avg exceeds 1.5× same-week-last-year, a single alert email is sent to the subscriber and recorded in `alerts_sent` — re-running the same scrape does not duplicate the send.
  5. Alert dispatch volume is programmatically capped to the warm-up schedule (50/day week 1, 200/day week 2) before being allowed to scale to the full list.
**Plans**: TBD

### Phase 5: Polish
**Goal**: The site is shareable with SD angler friends — loading, empty, and error states behave sensibly; the rockfish closed-season is explained rather than appearing as an empty page; the URL stands on its own without a readme.
**Depends on**: Phase 4
**Requirements**: POL-01, POL-02, POL-03
**Success Criteria** (what must be TRUE):
  1. Every data-showing page renders a recognizable loading state and a purposeful empty state — including a friendly explanation (not a blank grid) when a query falls inside the rockfish closed-season window.
  2. Error pages provide a link back to `/` and a contact pointer for reporting issues; no blank browser error page is reachable from normal navigation.
  3. A cold visitor landing on a shared URL can orient, read the data, and understand the per-angler caveat without the sender needing to explain anything first.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 0 → 1 → 2 → 3 → 4 → 5 (decimal phases inserted as needed).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Ops Guardrails | 0/7 | Planned | - |
| 1. Ingest + Store | 0/9 | Planned | - |
| 2. Browse + Trip Picker + Trends | 0/TBD | Not started | - |
| 3. Forecast Layer | 0/TBD | Not started | - |
| 4. Email Alerts | 0/TBD | Not started | - |
| 5. Polish | 0/TBD | Not started | - |

---
*Roadmap created: 2026-04-22*
*Phase 0 planned: 2026-04-23*
*Phase 1 planned: 2026-04-23*
