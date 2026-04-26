# Requirements: FishCount

**Defined:** 2026-04-22
**Core Value:** Given a date (or range) and a target species, help an angler pick the charter boat with the best historical odds.

## v1 Requirements

Requirements for initial release ("shareable with friends" polish bar). Each maps to exactly one roadmap phase.

### Ops

- [ ] **OPS-01**: Billing alerts configured on hosting provider at $20, $50, $100 monthly spend thresholds
- [ ] **OPS-02**: Deployed always-on environment (single node process + persistent volume) reachable over HTTPS
- [ ] **OPS-03**: SQLite database file is continuously replicated off the server (Litestream → object storage)
- [ ] **OPS-04**: Dead-man's switch fires if the nightly scrape hasn't completed within 36 hours
- [ ] **OPS-05**: `SCRAPER_ENABLED` environment-variable kill switch halts all scraping immediately
- [ ] **OPS-06**: Structured request/job logging is persisted and queryable

### Ingest

- [ ] **ING-01**: Nightly scheduled scrape of `sandiegofishreports.com/dock_totals/boats.php` runs unattended
- [ ] **ING-02**: Scraper honors `robots.txt` and sends a custom User-Agent identifying the project with a contact link
- [ ] **ING-03**: Scraper rate-limits outbound requests to ≤ 1 request per 5 seconds across backfill and incremental
- [ ] **ING-04**: Per-date scrape stores parsed `CatchReport[]` idempotently, keyed on (date, boat, trip_type, species)
- [ ] **ING-05**: Raw scraped HTML is snapshotted (gzipped) for every successful fetch, retained for replay
- [ ] **ING-06**: Parser rejects records that fail schema validation and logs the offending fixture path
- [ ] **ING-07**: Row-count SLA alert fires when a scrape ingests < 50% of the rolling 7-day average row count
- [ ] **ING-08**: Resumable CLI backfills all historical dates the source exposes, from a local dev machine
- [ ] **ING-09**: A `scrape_runs` ledger records every scrape attempt with outcome, so backfill can resume after crash
- [ ] **ING-10**: Source-site TOS is reviewed in writing and summarized in `.planning/research/` before the first production scrape
- [ ] **ING-11**: Operator of the source site is emailed proactively before backfill begins (courtesy outreach)

### Store

- [ ] **STO-01**: Schema captures per-boat-per-day records with boat, landing, trip_type (verbatim), angler_count, species, species_count, source_date, scraped_at
- [ ] **STO-02**: Boats and landings are first-class tables so names can be normalized (display) without losing source verbatim labels (filters)
- [ ] **STO-03**: Data Access Layer (`lib/db/`) is the only module that issues SQL — every other module calls typed repository functions
- [ ] **STO-04**: All dates are persisted as `YYYY-MM-DD` in `America/Los_Angeles` and a single `dates.ts` module is the sole producer of date strings
- [ ] **STO-05**: A `scrape_attempts` table records dates attempted but returning no rows, distinct from `catch_reports`, so forecast math can distinguish "0 fish" from "no data"

### Browse

- [x] **BRW-01**: Public home page lists today's per-boat counts with boat, landing, trip type, angler count, species, and counts — matching the source schema an SD angler recognizes
- [x] **BRW-02**: Every per-boat row links back to the corresponding source-site page for attribution and verification
- [x] **BRW-03**: A "Last scraped at [time PT]" indicator is visible on every data-showing page
- [x] **BRW-04**: Today's data is labeled "provisional — boats still reporting" until after the evening scrape
- [x] **BRW-05**: Date navigation allows jumping to any past date the store covers (calendar picker + prev/next)
- [x] **BRW-06**: Trip type, landing, and species filters use verbatim SD-native labels pulled from the source
- [x] **BRW-07**: Filter state is reflected in the URL so the page is shareable via link (query-string state)
- [x] **BRW-08**: Mobile layout is usable at 375px viewport without horizontal scroll
- [x] **BRW-09**: An "About the data" page explains the source, scrape cadence, and the per-angler-average caveat

### Trip Picker

- [x] **TRP-01**: User can enter a target date (or date range) and a target species and see a ranked list of boats
- [x] **TRP-02**: Ranking defaults to avg fish-per-angler for the chosen species on the matching trip type, not raw totals
- [x] **TRP-03**: Every ranked result shows: n historical trips in the window, avg fish/angler, last trip date, and trip type
- [x] **TRP-04**: Results prominently label "avg fish/angler — boat aggregate, not individual angler"
- [x] **TRP-05**: Trip type is a required filter (enforced default) so users cannot accidentally compare a Long Range trip to a 1/2 Day trip
- [x] **TRP-06**: Results include an expandable "Why this boat?" explanation with the data behind the ranking
- [x] **TRP-07**: Boats with < 5 trips in the matched window are shown with a "low data" flag, not hidden
- [x] **TRP-08**: A 30-day calendar heatmap view of the same query (date + species + trip type) is available
- [x] **TRP-09**: Calendar cells with insufficient data render gray, not a green/red color, to avoid false signal

### Boat Detail

- [x] **BOAT-01**: Every boat has a detail page showing its recent trips, season-to-date totals, and trip types it runs
- [x] **BOAT-02**: Boat detail page shows a link back to the landing and to the source site's boat page

### Trends

- [x] **TRN-01**: Trend chart shows species-catch over time (weekly/monthly aggregation) with a species + trip-type filter
- [x] **TRN-02**: Trend chart shows boat-performance over time (avg fish/angler) for a selected boat within a trip type
- [x] **TRN-03**: Users can compare two or three boats side-by-side across a user-selected date range in the same trip type

### Forecast

- [x] **FCT-01**: Statistical projection (average + prediction bands) is precomputed per (species, trip_type, date-window) and stored in a `forecasts` table
- [x] **FCT-02
**: Every forecast displays its sample size `n` alongside the projection
- [x] **FCT-03
**: Projections with `n < 5` do NOT render a point estimate — they render "not enough history"
- [ ] **FCT-04**: A seasonal-naïve baseline is implemented and projection output must beat it on a held-out validation window; otherwise the baseline ships
- [x] **FCT-05
**: Calendar heatmap cell coloring uses the precomputed forecast for the cell's date/species/trip-type
- [x] **FCT-06
**: Forecasts regenerate as part of the nightly scrape pipeline (no stale precomputations served)
- [x] **FCT-07
**: Forecast horizon is capped at 30 days ahead; farther-out queries render "horizon too far"

### Subscriptions & Alerts

- [ ] **ALT-01**: Anonymous signup form collects email and (optional) followed boat(s) / species
- [ ] **ALT-02**: Signup uses double opt-in — verification link signed with a project secret, required before activation
- [ ] **ALT-03**: Signup endpoint rate-limits to 3 signups per hour per IP and includes a honeypot field that rejects obvious bots
- [ ] **ALT-04**: Disposable-email domains are rejected at signup
- [ ] **ALT-05**: Every outbound email carries a `List-Unsubscribe` header and a visible one-click unsubscribe link
- [ ] **ALT-06**: Unsubscribe writes to a suppression list that cannot be re-subscribed from the public signup form
- [ ] **ALT-07**: Every outbound email includes a physical postal address and plain-language description of why it was sent
- [ ] **ALT-08**: SPF, DKIM, and DMARC are configured for the sending domain before the first production email
- [ ] **ALT-09**: "Hot day" alert fires when a followed boat's today avg/angler > 2× its trailing 30-day same-trip-type average, with ≥ N anglers
- [ ] **ALT-10**: "Starting to run" alert fires when a followed species' rolling 7-day fleet-wide avg > 1.5× the same-week-last-year baseline
- [ ] **ALT-11**: `alerts_sent` dedup table prevents the same alert from firing twice for the same subscriber/trigger/day
- [ ] **ALT-12**: Alert dispatch is warmed up over at least a week (50/day ramping to 200/day) before scaling to the full list

### Polish

- [ ] **POL-01**: Every data-showing page has loading and empty states; rockfish closed-season renders a friendly explanation rather than an empty list
- [ ] **POL-02**: Error states surface a link back to the home page and a contact pointer for reporting issues
- [ ] **POL-03**: URL is shareable with SD angler friends without accompanying explanation

## v2 Requirements

Deferred; tracked but not in current roadmap.

### Analytics v1.x

- **V1X-01**: Same-week-last-year overlay on trend charts
- **V1X-02**: Species seasonality cheatsheet derived from historical aggregates
- **V1X-03**: Median / trimmed-mean toggle on per-angler metrics
- **V1X-04**: Distribution view (median + range) alongside top counts
- **V1X-05**: CSV / JSON export of the current filtered query

### Future

- **V2-01**: Additional data sources beyond sandiegofishreports.com
- **V2-02**: Weather / SST / tide / moon overlays
- **V2-03**: Landing-locator map (landings only, not fishing spots)
- **V2-04**: Web push or SMS notifications

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Individual per-angler tracking | Source data is boat-aggregate only; per-angler numbers are derived averages, never attributions |
| Social feed / posts / comments / photos | Orthogonal to "pick a boat"; pulls product toward FishBrain territory |
| Leaderboards / gamification | Incentivizes meatlocker-boat metrics over quality fishing; misaligned with core value |
| ML-based forecast models | Data-hungry, opaque, not honestly achievable on one upstream source |
| Web push / SMS / in-app notifications (v1) | Email is sufficient for v1; push adds apps, device tokens, on-call infra |
| Mandatory account to browse | Public data should be browsable; account friction kills the share-a-URL workflow |
| Booking / payment integration | Regulatory exposure (PCI); source already links to operators |
| Bait / tackle / technique recommendations | Source doesn't capture bait/tackle; would be guesswork |
| Map of catch locations / GPS coordinates | Source doesn't publish trip GPS; captains protect spots |
| Personal catch logbook | Off-mission; FishCount is a decision tool, not a journal |
| AI-generated / chat-assistant fishing reports | Hallucination risk on a domain anglers can verify |
| "ON FIRE" / "hot bite" engagement-bait badges | SD audience is sophisticated — overstating a 3-fish day looks amateur |
| Paywall / premium tier | Data is publicly sourced; paywalling would be ethically dubious |
| Sponsored / promoted boat slots in rankings | Compromises picker integrity — the whole value prop is objective ranking |
| Fake-precision projections ("73.4% chance") | Wide bands on thin data; precise-looking numbers mislead |
| Manual scrape trigger in UI | Scheduled + resumable CLI covers it; no UI button needed |
| Non-San-Diego fishing reports | Scope is the one source site |

## Traceability

Populated by roadmap creation. Each v1 requirement maps to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| OPS-01 | Phase 0: Ops Guardrails | Pending |
| OPS-02 | Phase 0: Ops Guardrails | Pending |
| OPS-03 | Phase 0: Ops Guardrails | Pending |
| OPS-04 | Phase 0: Ops Guardrails | Pending |
| OPS-05 | Phase 0: Ops Guardrails | Pending |
| OPS-06 | Phase 0: Ops Guardrails | Pending |
| ING-01 | Phase 1: Ingest + Store | Pending |
| ING-02 | Phase 1: Ingest + Store | Pending |
| ING-03 | Phase 1: Ingest + Store | Pending |
| ING-04 | Phase 1: Ingest + Store | Pending |
| ING-05 | Phase 1: Ingest + Store | Pending |
| ING-06 | Phase 1: Ingest + Store | Pending |
| ING-07 | Phase 1: Ingest + Store | Pending |
| ING-08 | Phase 1: Ingest + Store | Pending |
| ING-09 | Phase 1: Ingest + Store | Pending |
| ING-10 | Phase 1: Ingest + Store | Pending |
| ING-11 | Phase 1: Ingest + Store | Pending |
| STO-01 | Phase 1: Ingest + Store | Pending |
| STO-02 | Phase 1: Ingest + Store | Pending |
| STO-03 | Phase 1: Ingest + Store | Pending |
| STO-04 | Phase 1: Ingest + Store | Pending |
| STO-05 | Phase 1: Ingest + Store | Pending |
| BRW-01 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25BRW
| BRW-02 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25BRW
| BRW-03 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25BRW
| BRW-04 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25BRW
| BRW-05 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25BRW
| BRW-06 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25BRW
| BRW-07 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25BRW
| BRW-08 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25BRW
| BRW-09 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25BRW
| TRP-01 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25TRP
| TRP-02 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25TRP
| TRP-03 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25TRP
| TRP-04 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25TRP
| TRP-05 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25TRP
| TRP-06 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25TRP
| TRP-07 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25TRP
| TRP-08 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25TRP
| TRP-09 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25TRP
| BOAT-01 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25BOAT
| BOAT-02 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25BOAT
| TRN-01 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25TRN
| TRN-02 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25TRN
| TRN-03 | Phase 2: Browse + Trip Picker + Trends | Validated 2026-04-25TRN
| FCT-01 | Phase 3: Forecast Layer | Validated 2026-04-26 |
| FCT-02 | Phase 3: Forecast Layer | Validated 2026-04-26 |
| FCT-03 | Phase 3: Forecast Layer | Validated 2026-04-26 |
| FCT-04 | Phase 3: Forecast Layer | Pending |
| FCT-05 | Phase 3: Forecast Layer | Validated 2026-04-26 |
| FCT-06 | Phase 3: Forecast Layer | Pending |
| FCT-07 | Phase 3: Forecast Layer | Pending |
| ALT-01 | Phase 4: Email Alerts | Pending |
| ALT-02 | Phase 4: Email Alerts | Pending |
| ALT-03 | Phase 4: Email Alerts | Pending |
| ALT-04 | Phase 4: Email Alerts | Pending |
| ALT-05 | Phase 4: Email Alerts | Pending |
| ALT-06 | Phase 4: Email Alerts | Pending |
| ALT-07 | Phase 4: Email Alerts | Pending |
| ALT-08 | Phase 4: Email Alerts | Pending |
| ALT-09 | Phase 4: Email Alerts | Pending |
| ALT-10 | Phase 4: Email Alerts | Pending |
| ALT-11 | Phase 4: Email Alerts | Pending |
| ALT-12 | Phase 4: Email Alerts | Pending |
| POL-01 | Phase 5: Polish | Pending |
| POL-02 | Phase 5: Polish | Pending |
| POL-03 | Phase 5: Polish | Pending |

**Coverage:**
- v1 requirements: 67 total
- Mapped to phases: 67 (100%)
- Unmapped: 0

**Per-Phase Counts:**

| Phase | Requirement Count | IDs |
|-------|-------------------|-----|
| Phase 0: Ops Guardrails | 6 | OPS-01..06 |
| Phase 1: Ingest + Store | 16 | ING-01..11, STO-01..05 |
| Phase 2: Browse + Trip Picker + Trends | 23 | BRW-01..09, TRP-01..09, BOAT-01..02, TRN-01..03 |
| Phase 3: Forecast Layer | 7 | FCT-01..07 |
| Phase 4: Email Alerts | 12 | ALT-01..12 |
| Phase 5: Polish | 3 | POL-01..03 |
| **Total** | **67** | |

---
*Requirements defined: 2026-04-22*
*Last updated: 2026-04-22 after roadmap creation (phase assignments added)*
