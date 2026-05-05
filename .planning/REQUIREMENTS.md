# Requirements: FishCount v2 — Multi-Axis Trend Explorer

**Defined:** 2026-04-30
**Core Value:** Pick a boat, species, or landing as a "ticker" and see SD charter boat catch history with comparison overlays across a chosen time range — like exploring a stock-market chart.

## v2 Requirements

Requirements for the v2 milestone. Each maps to a roadmap phase via the Traceability section below.

### EXPL — Explorer (the core surface)

- [ ] **EXPL-01**: User lands on the explorer with a default boat ticker pre-selected
- [ ] **EXPL-02**: User can switch the ticker type between **boat**, **species**, and **landing**
- [ ] **EXPL-03**: User can pick any boat from a searchable/filterable list
- [ ] **EXPL-04**: User can pick any species from a list (using verbatim SD names: bluefin, yellowtail, dorado, etc.)
- [ ] **EXPL-05**: User can pick any landing from a list (using verbatim names: Fisherman's Landing, Point Loma Sportfishing, etc.)
- [ ] **EXPL-06**: When boat ticker is active, user sees that boat's catch history with trip-type series overlaid on the same chart
- [ ] **EXPL-07**: When species ticker is active, user sees that species' catch history across boats (boats as overlay series)
- [ ] **EXPL-08**: When landing ticker is active, user sees the landing fleet's catch history across species (species as overlay series)
- [ ] **EXPL-09**: User can change the chart's time range via selector — 1M / 3M / 6M / 1Y / 2Y / 5Y / All
- [ ] **EXPL-10**: Per-angler numbers always show sample size `n` alongside, so anglers can judge thin data themselves
- [ ] **EXPL-11**: Trip-type label appears on every series in the chart legend so users always know which type they're looking at
- [ ] **EXPL-12**: Explorer is usable on mobile at 375px width (carries forward v1 UX standard)
- [ ] **EXPL-13**: Chart loads within a reasonable time at the longest range (All) — no visible stalls on a typical broadband connection
- [ ] **EXPL-14**: User can pick a custom date range (start date + end date) in addition to the preset selector

### MOON — Moon-phase overlay

- [ ] **MOON-01**: User can toggle moon-phase markers on/off on the chart's time axis
- [ ] **MOON-02**: When enabled, new / first-quarter / full / last-quarter moons appear as markers (icons or background shading) on the time axis
- [ ] **MOON-03**: Moon-phase data is computed deterministically from the date (no API call, no DB column required)

### SHR — Sharing

- [ ] **SHR-01**: User can copy the current explorer URL and share it; opening that URL reproduces the same view (ticker type, ticker selection, time range, overlays, moon toggle)
- [ ] **SHR-02**: User can download the active chart's underlying data as a CSV file

### ALT — Email alerts (redesigned for explorer mental model)

- [ ] **ALT-01**: User can sign up via email to receive alerts for one or more followed boats and/or species (double opt-in confirmation)
- [ ] **ALT-02**: User receives a "hot day" alert when a followed boat has an unusually high catch day relative to its own trailing baseline
- [ ] **ALT-03**: User receives a "starting to run" alert when a followed species shows a rising trend across the fleet
- [ ] **ALT-04**: User can manage their alert preferences via an emailed link (no account/password)
- [ ] **ALT-05**: User can unsubscribe from any email with a single click (RFC 8058 one-click)
- [ ] **ALT-06**: Email signup has anti-abuse protections (honeypot, rate limit, disposable-email rejection, suppression list)
- [ ] **ALT-07**: Every sent email includes a physical postal address, reason-for-receipt, and unsubscribe link (CAN-SPAM compliance)
- [ ] **ALT-08**: Sender domain is authenticated (SPF + DKIM + DMARC) before first production send

### RTR — v1 retirement

- [ ] **RTR-01**: `src/routes/picker/` deleted from the codebase
- [ ] **RTR-02**: `src/lib/forecast/` (compute, recompute, benchmark scripts) deleted
- [ ] **RTR-03**: `forecasts` table dropped + nightly recompute pipeline removed from scheduler
- [ ] **RTR-04**: Calendar heatmap component deleted
- [ ] **RTR-05**: 3-file allowlist lint that enforced per-angler trip-type segmentation removed (no longer applicable per the v2 trust-the-audience principle)
- [ ] **RTR-06**: Row-count <50% silent-failure alert replaced with scraper/parser-failure-only alerting (off-season zero-row days are normal, not failures)
- [ ] **RTR-07**: `/about` page copy updated to describe v2 explorer (drop picker/forecast/heatmap references)
- [ ] **RTR-08**: `/trends` and `/compare` v1 routes retired or redirected (their use cases subsumed by the explorer's overlays)
- [ ] **RTR-09**: All v1-only tests for retired features removed

### POL — Polish to "shareable with friends"

- [ ] **POL-01**: Every route has an error boundary so failures show a friendly message, not a stack trace
- [ ] **POL-02**: Loading states (skeleton or spinner) appear during chart data fetches
- [ ] **POL-03**: Empty states for tickers with no data (e.g., a boat that has never been scraped)
- [ ] **POL-04**: Page tab titles are descriptive per route, so shared/pinned URLs look right in the browser
- [ ] **POL-05**: Dark mode toggle (light / dark / follow-system); preference persists across visits


### HOME — New v2 home page ("what's been biting")

- [ ] **HOME-01**: New `/` shows per-trip-type sections, one per viable canonical trip type (≥5 trips/7d after alias merge), sorted by 7-day trip count desc
- [ ] **HOME-02**: Each section shows up to 5 boats by fish-per-angler over the past 7 days, with trip count + raw catch/anglers totals beside the fpa value
- [ ] **HOME-03**: Bar widths normalize per section (not globally) so trip types with different scales (Overnight ~1 fpa vs 3.5 Day ~35 fpa) read correctly
- [ ] **HOME-04**: Rows whose alias status is `pending` show a NEW badge until the operator adjudicates
- [ ] **HOME-05**: Home page ships filter-free; URL has no query state of its own

### ALI — Trip-type alias mapping

- [ ] **ALI-01**: `trip_type_aliases` table exists, created via idempotent migration; pre-seeded with confident merges for historical labels
- [ ] **ALI-02**: Alias-aware DAL helper (`ALIAS_JOIN_SQL` + `CANONICAL_TRIP_TYPE_EXPR`) is consumed by every query that surfaces or groups by trip_type (home, explorer, /compare, trends)
- [ ] **ALI-03**: `/admin/trip-types` route is password-gated (env-var-set + signed cookie), mobile-usable at 375px, lists every distinct source_label with first-seen / last-seen / trip-count / current status
- [ ] **ALI-04**: Operator can alias / accept / leave-pending each label via per-row form actions; changes reflected on next page load (reversible)
- [ ] **ALI-05**: Pre-seed migration ships confident merges for the 22+ historical labels surfaced in the spike

### CMP — /compare boat-picker fix

- [ ] **CMP-01**: `/compare` boat-ID input is replaced with a name-based typeahead picker (HTML `<datalist>`) matching the explorer pattern
- [ ] **CMP-02**: `/compare` queries consult the alias table so side-by-side comparisons show continuous history across renames

### THM — Theme system (light / dark / follow-system)

- [ ] **THM-01**: Auto/Light/Dark cycle button in the page header reflects the CURRENT state via icon + aria-label (not the next state)
- [ ] **THM-02**: Theme cookie SSR — zero flash on first paint; `<html data-theme=...>` set server-side from `fc_theme` cookie
- [ ] **THM-03**: ECharts charts respect the chosen theme — background, axis labels, legend, tooltip, moon overlay all swap on toggle without page reload

### GRN — Granularity selector (Phase 7 carry-forward)

- [ ] **GRN-01**: Granularity (Daily/Weekly/Monthly) extends `ExplorerFiltersSchema` as a URL parameter; default values are NOT serialized (clean-URL pattern)
- [ ] **GRN-02**: Range switch resets granularity to the new range's default (Daily for 1M/3M/6M; Weekly for 1Y/2Y/5Y/All); user override sticks until next range switch

### AXS — Chart x-axis migration (Phase 7 carry-forward)

- [ ] **AXS-01**: Explorer chart x-axis migrates from `category` (string labels) to `time` (real timestamps); ECharts auto-formats date labels in PT; moon overlay aligns at all granularities

### RDR — v1 route redirects

- [ ] **RDR-01**: `/picker` (any subpath, any query string) returns HTTP 301 with Location: `/explorer`
- [ ] **RDR-02**: `/trends` (any subpath, any query string) returns HTTP 301 with Location: `/explorer`

## Future Requirements

Acknowledged but deferred to v3 (or later). Not in v2 scope.

### Explorer extensions

- **MOON-Lx**: Aggregate "fish/angler by moon phase" stat block alongside the chart (Level 2 — deferred per the v2 trust-the-audience approach; revisit if anglers ask for it)
- **EXPL-Mx**: Multi-ticker side-by-side compare ("show Pacific Queen and Pacific Voyager together") — partially subsumed by the species → boats overlay; if a curated 2–3 boat compare emerges as needed, build then
- **EXPL-Ex**: Embed / screenshot / image-export for chart sharing (today's SHR-01 URL is enough for "shareable with friends")

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Per-angler individual tracking | Source data is boat-aggregate only; per-angler numbers are derived averages, never real people |
| Social feed / posts / comments / photos | Off-mission; FishCount is a data-exploration tool |
| Leaderboards / gamification | Incentivises meatlocker-boat metrics over quality fishing |
| ML or AI-generated fishing forecasts | Data-hungry, opaque, hallucination risk on a domain anglers can verify |
| Push or SMS notifications | Email is sufficient |
| Mandatory account / login to browse | Explorer stays anonymous; signup exists only for alerts |
| Booking / payment integration | Regulatory exposure (PCI); source already links to operators |
| Bait / tackle / technique recommendations | Source doesn't capture; would be guesswork |
| GPS catch maps | Source doesn't publish; captains protect spots |
| Personal catch logbook | Off-mission; FishCount is a decision/exploration tool, not a journal |
| AI chat-assistant fishing reports | Hallucination risk on a domain anglers can verify |
| "ON FIRE" hype badges | SD audience is sophisticated |
| Paywall / premium tier | Data is publicly sourced |
| Sponsored / promoted boat slots | Compromises objectivity |
| Manual scrape trigger in UI | Scheduled + resumable CLI covers it |
| Non-San-Diego data | Scope is the one source site |
| Statistical projections / forecasts | Retiring with v1 (operator: "too hectic seems") |
| Trip picker UI | Retiring with v1 (narrower than explorer-style "see the data" frame) |
| Calendar heatmap | Retiring with v1 (was a picker consumer; no obvious value standalone) |
| Moon-phase predictions ("best moon for bluefin") | Crosses into ML-bite-forecaster anti-feature; honesty risk |

## Traceability

Which phases cover which requirements. Populated by the roadmapper on 2026-04-30.

| Requirement | Phase | Status |
|-------------|-------|--------|
| EXPL-01 | Phase 6: Explorer Foundation | Pending |
| EXPL-02 | Phase 6: Explorer Foundation | Pending |
| EXPL-03 | Phase 6: Explorer Foundation | Pending |
| EXPL-04 | Phase 6: Explorer Foundation | Pending |
| EXPL-05 | Phase 6: Explorer Foundation | Pending |
| EXPL-06 | Phase 6: Explorer Foundation | Pending |
| EXPL-07 | Phase 6: Explorer Foundation | Pending |
| EXPL-08 | Phase 6: Explorer Foundation | Pending |
| EXPL-09 | Phase 6: Explorer Foundation | Pending |
| EXPL-10 | Phase 6: Explorer Foundation | Pending |
| EXPL-11 | Phase 6: Explorer Foundation | Pending |
| EXPL-12 | Phase 6: Explorer Foundation | Pending |
| EXPL-13 | Phase 6: Explorer Foundation | Pending |
| EXPL-14 | Phase 6: Explorer Foundation | Pending |
| MOON-01 | Phase 7: Moon-phase Overlay | Pending |
| MOON-02 | Phase 7: Moon-phase Overlay | Pending |
| MOON-03 | Phase 7: Moon-phase Overlay | Pending |
| RTR-01 | Phase 8: Home, Retire, Polish | Pending |
| RTR-02 | Phase 8: Home, Retire, Polish | Pending |
| RTR-03 | Phase 8: Home, Retire, Polish | Pending |
| RTR-04 | Phase 8: Home, Retire, Polish | Pending |
| RTR-05 | Phase 8: Home, Retire, Polish | Pending |
| RTR-06 | Phase 8: Home, Retire, Polish | Pending |
| RTR-07 | Phase 8: Home, Retire, Polish | Pending |
| RTR-08 | Phase 8: Home, Retire, Polish | Pending |
| RTR-09 | Phase 8: Home, Retire, Polish | Pending |
| POL-01 | Phase 8: Home, Retire, Polish | Pending |
| POL-02 | Phase 8: Home, Retire, Polish | Pending |
| POL-03 | Phase 8: Home, Retire, Polish | Pending |
| POL-04 | Phase 8: Home, Retire, Polish | Pending |
| POL-05 | Phase 8: Home, Retire, Polish | Pending |
| SHR-01 | Phase 9: Sharing | Pending |
| SHR-02 | Phase 9: Sharing | Pending |
| ALT-01 | Phase 10: Email Alerts | Pending |
| ALT-02 | Phase 10: Email Alerts | Pending |
| ALT-03 | Phase 10: Email Alerts | Pending |
| ALT-04 | Phase 10: Email Alerts | Pending |
| ALT-05 | Phase 10: Email Alerts | Pending |
| ALT-06 | Phase 10: Email Alerts | Pending |
| ALT-07 | Phase 10: Email Alerts | Pending |
| ALT-08 | Phase 10: Email Alerts | Pending |

| HOME-01 | Phase 8: Home, Retire, Polish | Pending |
| HOME-02 | Phase 8: Home, Retire, Polish | Pending |
| HOME-03 | Phase 8: Home, Retire, Polish | Pending |
| HOME-04 | Phase 8: Home, Retire, Polish | Pending |
| HOME-05 | Phase 8: Home, Retire, Polish | Pending |
| ALI-01 | Phase 8: Home, Retire, Polish | Pending |
| ALI-02 | Phase 8: Home, Retire, Polish | Pending |
| ALI-03 | Phase 8: Home, Retire, Polish | Pending |
| ALI-04 | Phase 8: Home, Retire, Polish | Pending |
| ALI-05 | Phase 8: Home, Retire, Polish | Pending |
| CMP-01 | Phase 8: Home, Retire, Polish | Pending |
| CMP-02 | Phase 8: Home, Retire, Polish | Pending |
| THM-01 | Phase 8: Home, Retire, Polish | Pending |
| THM-02 | Phase 8: Home, Retire, Polish | Pending |
| THM-03 | Phase 8: Home, Retire, Polish | Pending |
| GRN-01 | Phase 8: Home, Retire, Polish | Pending |
| GRN-02 | Phase 8: Home, Retire, Polish | Pending |
| AXS-01 | Phase 8: Home, Retire, Polish | Pending |
| RDR-01 | Phase 8: Home, Retire, Polish | Pending |
| RDR-02 | Phase 8: Home, Retire, Polish | Pending |

**Note (2026-05-01):** Phase 8 (Home, Retire, Polish) absorbed the original
Phase 10 (v1 Retirement) and Phase 11 (Polish & Dark Mode) entirely, plus
new home-page work, a trip-type alias mapping table, and the `/compare`
boat-ID picker fix. New requirements for those additions (HOME-*, ALI-*,
CMP-*) will be added by `/gsd:plan-phase 8`. Phase 9 (Sharing) and Phase 10
(Email Alerts) shifted up one number; their requirement IDs (SHR-*, ALT-*)
are unchanged.

**Coverage:**
- v2 requirements: 61 total (14 EXPL + 3 MOON + 2 SHR + 8 ALT + 9 RTR + 5 POL + 5 HOME + 5 ALI + 2 CMP + 3 THM + 2 GRN + 1 AXS + 2 RDR)
- Mapped to phases: 61 ✓
- Unmapped: 0 ✓
- Phase 8 new IDs minted by /gsd:plan-phase 8 on 2026-05-02: HOME-01..05, ALI-01..05, CMP-01..02, THM-01..03, GRN-01..02, AXS-01, RDR-01..02 (20 new)

---
*Requirements defined: 2026-04-30*
*Last updated: 2026-05-02 — Phase 8 plan-phase added 20 new requirement IDs (HOME-*, ALI-*, CMP-*, THM-*, GRN-*, AXS-*, RDR-*) covering home page, alias mapping, /compare typeahead, theme system, granularity selector, chart-axis migration, and v1 redirect contract*
