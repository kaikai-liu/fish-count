# Roadmap: FishCount

## Milestones

- ✅ **v1.0 — Browse + Picker + Forecast** (early-closed) — Phases 0–3 (shipped 2026-04-30) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- 📋 **v2 — Multi-Axis Trend Explorer** (planning) — Phases 6–11 (defined 2026-04-30)

## Phases

<details>
<summary>✅ v1.0 (Phases 0–3) — SHIPPED 2026-04-30 (early close, pivot to v2)</summary>

- [x] Phase 0: Ops Guardrails (6/7 plans, OPS-02 deferred to operator) — completed 2026-04-23
- [x] Phase 1: Ingest + Store (9/9 plans) — completed 2026-04-24
- [x] Phase 2: Browse + Trip Picker + Trends (7/7 plans) — completed 2026-04-25
- [x] Phase 3: Forecast Layer (6/6 plans) — completed 2026-04-26
- [retired] Phase 4: Email Alerts — never executed (carried to v2 as Phase 9, redesigned; implementation preserved at git tag `phase-4-shipped`)
- [retired] Phase 5: Polish — never executed (carried to v2 as Phase 11)

Full archive: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) · [milestones/v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md) · [milestones/v1.0-MILESTONE-AUDIT.md](milestones/v1.0-MILESTONE-AUDIT.md) · [milestones/v1.0-phases/](milestones/v1.0-phases/)

</details>

### 📋 v2 — Multi-Axis Trend Explorer

- [ ] **Phase 6: Explorer Foundation** — Build the multi-axis ticker explorer (boat / species / landing) with overlay series and a 1M–All range selector
- [ ] **Phase 7: Moon-phase Overlay** — Add toggleable moon-phase markers on the explorer's time axis
- [ ] **Phase 8: Sharing** — Make every explorer view shareable via URL and exportable as CSV
- [ ] **Phase 9: Email Alerts** — Let anglers follow boats and species and receive hot-day / starting-to-run email alerts
- [ ] **Phase 10: v1 Retirement** — Remove picker, forecast layer, calendar heatmap, and now-obsolete lints/alerts; redirect the v1 routes the explorer subsumes
- [ ] **Phase 11: Polish & Dark Mode** — Error/loading/empty states, descriptive page titles, and a dark-mode toggle to hit the "shareable with friends" finish

## Phase Details

### Phase 6: Explorer Foundation
**Goal**: An angler can land on the explorer, pick a boat / species / landing as the "ticker," see catch history with comparison overlays, and zoom into any time range from 1 month to all-time.
**Depends on**: v1.0 scraper + DAL + historical store (already shipped)
**Requirements**: EXPL-01, EXPL-02, EXPL-03, EXPL-04, EXPL-05, EXPL-06, EXPL-07, EXPL-08, EXPL-09, EXPL-10, EXPL-11, EXPL-12, EXPL-13, EXPL-14
**Success Criteria** (what must be TRUE):
  1. An angler can open the site and immediately see a chart of one boat's catch history, with each trip type as a separate overlay series, without picking anything first.
  2. An angler can switch the ticker between boat, species, and landing, and pick any item from a searchable list — verbatim SD names (Fisherman's Landing, dorado, 1/2 Day AM, etc.).
  3. An angler can change the time range using preset buttons (1M / 3M / 6M / 1Y / 2Y / 5Y / All) or by entering a custom start/end date, and the chart updates without a noticeable stall even at All.
  4. Per-angler numbers always appear next to the sample size `n`, and every chart series shows its trip-type label in the legend so the angler always knows what they're looking at.
  5. The explorer is usable on a phone at 375px width (single-column layout, readable chart, working selectors).
**Plans**: 5 plans
- [ ] 06-01-PLAN.md — Slug schema migration + slugify util + boats DAL extensions
- [ ] 06-02-PLAN.md — ExplorerFilters URL contract (Zod) + range/granularity mapper
- [ ] 06-03-PLAN.md — Explorer DAL queries (boat/species/landing tickers) + trends.ts daily granularity
- [ ] 06-04-PLAN.md — Sticky ExplorerHeader + TickerPills/RangeStrip/CustomDateInputs/SpeciesBreakdownTable
- [ ] 06-05-PLAN.md — /explorer route loader + page + nav update + integration tests
**UI hint**: yes

### Phase 7: Moon-phase Overlay
**Goal**: An angler can toggle moon-phase markers onto the explorer chart's time axis to eyeball whether catch days line up with new / first-quarter / full / last-quarter moons.
**Depends on**: Phase 6
**Requirements**: MOON-01, MOON-02, MOON-03
**Success Criteria** (what must be TRUE):
  1. An angler sees a moon-phase toggle on the explorer; turning it on adds markers (icons or background shading) for new, first-quarter, full, and last-quarter moons on the chart's time axis.
  2. The markers stay correctly positioned when the angler changes the time range or the ticker — no extra page load or API call needed.
  3. With moon overlay off, the chart looks identical to Phase 6 (no leftover artifacts).
**Plans**: TBD
**UI hint**: yes

### Phase 8: Sharing
**Goal**: An angler can share any explorer view with a fishing buddy by copying the URL, and can pull the underlying numbers into a spreadsheet via CSV export.
**Depends on**: Phase 6 (URL-state contract is more useful once the explorer is stable); Phase 7 (so the moon toggle round-trips through the URL too)
**Requirements**: SHR-01, SHR-02
**Success Criteria** (what must be TRUE):
  1. An angler can copy the explorer URL, paste it into a text message, and the recipient opens the exact same view — same ticker type, ticker selection, time range, overlays, and moon toggle state.
  2. An angler can click a "Download CSV" button and get a spreadsheet of the rows currently driving the chart (one row per data point with date, trip type, species, anglers, catch count, per-angler value).
**Plans**: TBD
**UI hint**: yes

### Phase 9: Email Alerts
**Goal**: An angler can sign up by email to follow specific boats and/or species, and receive timely email alerts when a followed boat has an unusual day or a followed species starts showing a fleet-wide rising trend.
**Depends on**: Phase 6 (alert emails should deep-link to the relevant explorer view); Phase 8 (deep-links use the share-URL contract from Phase 8)
**Requirements**: ALT-01, ALT-02, ALT-03, ALT-04, ALT-05, ALT-06, ALT-07, ALT-08
**Success Criteria** (what must be TRUE):
  1. An angler can enter their email on a signup form, pick boats and/or species to follow, click a confirmation link in the resulting email, and start receiving alerts (no account/password required to manage preferences afterward — all done via emailed links).
  2. When a followed boat has an unusually high catch day relative to its own trailing baseline, the angler gets a "hot day" email; when a followed species starts trending up across the fleet, they get a "starting to run" email. Each email links into the explorer at the right view.
  3. Every email is one-click unsubscribable (RFC 8058), includes a physical postal address, the reason the angler is receiving it, and an unsubscribe link (CAN-SPAM compliant), and the sending domain is authenticated with SPF + DKIM + DMARC before the first real-recipient send.
  4. The signup form rejects abuse — honeypot field, per-IP rate limit, disposable-email rejection, suppression list that cannot be re-subscribed accidentally.
**Plans**: TBD
**UI hint**: yes
**Notes**: Cherry-pick candidate from git tag `phase-4-shipped` (commit fba1207): DAL alert repos, email send wrapper, anti-abuse libs, RFC 8058 lifecycle, scheduler hook, deliverability runbook. The two evaluators (`hotDay`, `startingToRun`) are pure-historical and conceptually compatible with the explorer mental model.

### Phase 10: v1 Retirement
**Goal**: The codebase no longer carries the v1 trip-picker / forecast / heatmap surfaces or their supporting infrastructure; the explorer is the de-facto front door, and v1 routes either redirect to it or are gone.
**Depends on**: Phase 6 (don't delete v1 surfaces until the explorer can stand in for them); Phase 7 + Phase 8 + Phase 9 not strictly required, but retirement after them keeps the live site stable through the v2 build-out.
**Requirements**: RTR-01, RTR-02, RTR-03, RTR-04, RTR-05, RTR-06, RTR-07, RTR-08, RTR-09
**Success Criteria** (what must be TRUE):
  1. The picker, forecast layer, and calendar heatmap are gone — `/picker` no longer exists (or redirects to the explorer), `src/routes/picker/`, `src/lib/forecast/`, and the calendar heatmap component are deleted, the `forecasts` table is dropped, and the nightly forecast recompute is removed from the scheduler.
  2. The v1 `/trends` and `/compare` routes are either retired or redirect to the equivalent explorer view (their use cases are subsumed by the explorer's overlays).
  3. The 3-file allowlist lint that enforced per-angler trip-type segmentation is removed (no longer applicable per the v2 trust-the-audience principle), and the row-count <50% silent-failure alert is replaced with scraper/parser-failure-only alerting (so off-season zero-row days don't false-positive).
  4. The `/about` page reads correctly for v2 — no leftover references to picker, forecasts, or heatmaps — and the test suite passes with all v1-only tests for retired features removed.
**Plans**: TBD

### Phase 11: Polish & Dark Mode
**Goal**: The explorer feels finished enough to share with a fishing buddy — failures show friendly messages, slow loads show a spinner instead of a blank screen, empty cases are handled, page titles look right when pinned/shared, and an angler can pick light / dark / follow-system theme.
**Depends on**: Phases 6–10 (polish the surface that exists after retirement)
**Requirements**: POL-01, POL-02, POL-03, POL-04, POL-05
**Success Criteria** (what must be TRUE):
  1. If something breaks on any route, the angler sees a friendly error message — never a stack trace or a blank page.
  2. While the chart is fetching data, a skeleton or spinner shows so the angler knows something is happening; if the chosen ticker has no data (e.g., a boat that's never been scraped), the angler sees an explanatory empty state instead of a broken chart.
  3. Each route has a descriptive browser tab title (so a pinned tab or shared link looks right, not a generic "FishCount").
  4. The angler can toggle between light, dark, and follow-system color themes; the choice persists across visits.
**Plans**: TBD
**UI hint**: yes

## Operator Punch List (carry-forward, not v2 dev work)

These items remain on the operator's plate from v1.0. They are not assigned to any v2 phase but are tracked here so they don't get lost. Operator can address them at any time alongside v2 work.

- **OPS-02** — Fly.io live deploy + 5 drills (Plan 00-06 was autonomous: false in v1.0)
- **ING-10/11** — Source-site TOS review + courtesy outreach email + `FIRST_SCRAPE_OK` flip
- **CR-01** — `litestream.yml ${VAR}` interpolation bug must be fixed before first production deploy

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 0. Ops Guardrails | v1.0 | 6/7 (OPS-02 deferred) | Code complete; deploy operator-gated | 2026-04-23 |
| 1. Ingest + Store | v1.0 | 9/9 | Code complete; first-scrape operator-gated | 2026-04-24 |
| 2. Browse + Trip Picker + Trends | v1.0 | 7/7 | Complete | 2026-04-25 |
| 3. Forecast Layer | v1.0 | 6/6 | Complete (retired in v2) | 2026-04-26 |
| 4. Email Alerts | v1.0 | 0/— | Retired with v1.0 close (carried to v2 Phase 9) | — |
| 5. Polish | v1.0 | 0/— | Retired with v1.0 close (carried to v2 Phase 11) | — |
| 6. Explorer Foundation | v2 | 0/5 | Planned | — |
| 7. Moon-phase Overlay | v2 | 0/TBD | Not started | — |
| 8. Sharing | v2 | 0/TBD | Not started | — |
| 9. Email Alerts | v2 | 0/TBD | Not started | — |
| 10. v1 Retirement | v2 | 0/TBD | Not started | — |
| 11. Polish & Dark Mode | v2 | 0/TBD | Not started | — |

---

*Roadmap created: 2026-04-22*
*v1.0 milestone closed: 2026-04-30*
*v2 milestone roadmapped: 2026-04-30 — 6 phases (6–11), 41 requirements mapped*
*Next: `/gsd-discuss-phase 6` (Explorer Foundation)*
