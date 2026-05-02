# Roadmap: FishCount

## Milestones

- ✅ **v1.0 — Browse + Picker + Forecast** (early-closed) — Phases 0–3 (shipped 2026-04-30) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- 📋 **v2 — Multi-Axis Trend Explorer** (planning) — Phases 6–10 (defined 2026-04-30; restructured 2026-05-01: old Phases 10 + 11 absorbed into Phase 8, old Phases 8 + 9 renumbered to 9 + 10)

## Phases

<details>
<summary>✅ v1.0 (Phases 0–3) — SHIPPED 2026-04-30 (early close, pivot to v2)</summary>

- [x] Phase 0: Ops Guardrails (6/7 plans, OPS-02 deferred to operator) — completed 2026-04-23
- [x] Phase 1: Ingest + Store (9/9 plans) — completed 2026-04-24
- [x] Phase 2: Browse + Trip Picker + Trends (7/7 plans) — completed 2026-04-25
- [x] Phase 3: Forecast Layer (6/6 plans) — completed 2026-04-26
- [retired] Phase 4: Email Alerts — never executed (carried to v2 as Phase 10 [renumbered from Phase 9 on 2026-05-01], redesigned; implementation preserved at git tag `phase-4-shipped`)
- [retired] Phase 5: Polish — never executed (carried to v2 as Phase 8 [renumbered from Phase 11 on 2026-05-01, expanded into the merged Home/Retire/Polish phase])

Full archive: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) · [milestones/v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md) · [milestones/v1.0-MILESTONE-AUDIT.md](milestones/v1.0-MILESTONE-AUDIT.md) · [milestones/v1.0-phases/](milestones/v1.0-phases/)

</details>

### 📋 v2 — Multi-Axis Trend Explorer

- [x] **Phase 6: Explorer Foundation** — Build the multi-axis ticker explorer (boat / species / landing) with overlay series and a 1M–All range selector
- [x] **Phase 7: Moon-phase Overlay** — Add toggleable moon-phase markers on the explorer's time axis
- [ ] **Phase 8: Home, Retire, Polish** — New "what's been biting" home page (top boats per trip type, past 7 days, fish/angler) + trip-type alias mapping + `/compare` boat-ID picker fix + retire v1 (`/picker`, `/trends`, calendar heatmap, forecast pipeline) + polish (error/loading/empty states, descriptive titles, dark mode). Absorbs old Phases 10 + 11.
- [ ] **Phase 9: Sharing** — Make every explorer view (and home-page filter state) shareable via URL and exportable as CSV
- [ ] **Phase 10: Email Alerts** — Let anglers follow boats and species and receive hot-day / starting-to-run email alerts

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
**Plans**: 3 plans
- [x] 07-01-PLAN.md — Pure moon-illumination module (`src/lib/shared/moon.ts`) + unit tests against NASA/USNO anchor dates (MOON-03)
- [x] 07-02-PLAN.md — `ExplorerFiltersSchema` `moon` flag with clean-URL serialization + `src/lib/copy/moon.ts` constants (MOON-01)
- [x] 07-03-PLAN.md — Loader emits `moonChartOption`; ExplorerHeader MoonToggle (role=switch); +page.svelte sub-chart + integration tests (MOON-01, MOON-02)
**UI hint**: yes

### Phase 8: Home, Retire, Polish
**Goal**: An angler landing on the site sees a "what's been biting" home page (top boats per viable trip type, past 7 days, fish/angler) instead of today's empty pre-scrape dashboard; v1 surfaces (`/picker`, `/trends`, calendar heatmap, forecast pipeline) are retired with 301 redirects to the explorer; the `/compare` route's boat-ID input is replaced with a name-based picker; and every route has the polish (error / loading / empty states, descriptive titles, dark mode) needed to be "shareable with a fishing buddy."
**Depends on**: Phase 7 (moon overlay shipped) + the data spike `.planning/spikes/001-phase-7.5-data-exploration/` (run 2026-05-01) which grounds home-page scope in actual data distributions
**Requirements**: RTR-01..09, POL-01..05, plus new HOME-*, ALI-*, CMP-* requirements added by plan-phase
**Success Criteria** (what must be TRUE):
  1. **Home page is the front door.** An angler landing on `/` sees a "what's been biting" page with one section per viable trip type (≥5 trips in past 7 days), top-5 boats per section ranked by fish/angler, with trip count shown alongside each fpa value. Bar widths are normalized per-section (not globally) so trip types with different scales (Overnight ~1 fpa vs. 3.5 Day ~35 fpa) read correctly.
  2. **Source-label drift is handled.** A trip-type alias mapping table exists and is consulted by home-page and explorer queries so renamed series stay continuous (e.g. "Full Day" → "Full Day Coronado Islands" rename of 2026-04-27 doesn't fragment a boat's history). New labels surface in the UI with a "new" indicator until the operator has aliased or accepted them.
  3. **v1 retirement is complete.** `/picker`, `/trends` routes deleted (301 redirects to `/explorer`), `src/routes/picker/`, `src/lib/forecast/`, calendar heatmap component, and `scripts/forecast-benchmark.ts` deleted; `forecasts` table dropped via migration; nightly forecast recompute removed from scheduler; 3-file per-angler allowlist lint removed; row-count <50% silent-failure alert replaced with scraper/parser-failure-only alerting; `/about` page no longer references picker/forecast/heatmap; v1-only test files for retired surfaces removed.
  4. **`/compare` is fixed.** The boat-ID input is replaced with a name-based typeahead picker matching the explorer's pattern. `/compare` stays in v2 scope (NOT retired).
  5. **Polish hits the "shareable" bar.** Every route has a friendly error boundary (no stack traces, no blank pages), loading skeletons / spinners while charts fetch, explanatory empty states for tickers with no data, descriptive `<title>` per route, and a light / dark / follow-system theme toggle whose choice persists across visits.
  6. **Carry-forward Phase 7 polish lands here.** Chart x-axis switches from `category` to `time` (ECharts auto-formats date labels, moon overlay aligns at all granularities); explicit Daily / Weekly / Monthly granularity selector for ranges ≥ 3M (with sensible default per range, URL param, header control, loader override).
**Plans**: TBD — plan-phase will likely wave-split as: (1) alias table + home-page query, (2) home-page UI + per-section bar normalization, (3) v1 retirement + 301 redirects + forecast pipeline drop, (4) `/compare` fix + polish + dark mode + chart-axis / granularity carry-forwards.
**UI hint**: yes
**Notes**: This phase absorbed the original Phase 10 (v1 Retirement) and Phase 11 (Polish & Dark Mode) per operator decision 2026-05-01. See `.planning/notes/front-door-design-decisions.md` and `.planning/notes/v1-retirement-pull-forward.md` for the design intent and `.planning/notes/phase-7.5-spike-report.md` for the data grounding (the spike directory name preserves the historical "Phase 7.5" label).

### Phase 9: Sharing
**Goal**: An angler can share any explorer view (and any home-page filter state) with a fishing buddy by copying the URL, and can pull the underlying numbers into a spreadsheet via CSV export.
**Depends on**: Phase 6 (URL-state contract is more useful once the explorer is stable); Phase 7 (so the moon toggle round-trips through the URL too); Phase 8 (so home-page filter state can be included in the URL contract from the start, not retrofitted; v1 routes are retired so the URL contract doesn't need to support them).
**Requirements**: SHR-01, SHR-02
**Success Criteria** (what must be TRUE):
  1. An angler can copy the explorer URL, paste it into a text message, and the recipient opens the exact same view — same ticker type, ticker selection, time range, overlays, and moon toggle state. Home-page filter state (window selector, etc.) likewise round-trips through the URL.
  2. An angler can click a "Download CSV" button and get a spreadsheet of the rows currently driving the chart (one row per data point with date, trip type, species, anglers, catch count, per-angler value).
**Plans**: TBD
**UI hint**: yes

### Phase 10: Email Alerts
**Goal**: An angler can sign up by email to follow specific boats and/or species, and receive timely email alerts when a followed boat has an unusual day or a followed species starts showing a fleet-wide rising trend.
**Depends on**: Phase 6 (alert emails should deep-link to the relevant explorer view); Phase 9 (deep-links use the share-URL contract from Phase 9)
**Requirements**: ALT-01, ALT-02, ALT-03, ALT-04, ALT-05, ALT-06, ALT-07, ALT-08
**Success Criteria** (what must be TRUE):
  1. An angler can enter their email on a signup form, pick boats and/or species to follow, click a confirmation link in the resulting email, and start receiving alerts (no account/password required to manage preferences afterward — all done via emailed links).
  2. When a followed boat has an unusually high catch day relative to its own trailing baseline, the angler gets a "hot day" email; when a followed species starts trending up across the fleet, they get a "starting to run" email. Each email links into the explorer at the right view.
  3. Every email is one-click unsubscribable (RFC 8058), includes a physical postal address, the reason the angler is receiving it, and an unsubscribe link (CAN-SPAM compliant), and the sending domain is authenticated with SPF + DKIM + DMARC before the first real-recipient send.
  4. The signup form rejects abuse — honeypot field, per-IP rate limit, disposable-email rejection, suppression list that cannot be re-subscribed accidentally.
**Plans**: TBD
**UI hint**: yes
**Notes**: Cherry-pick candidate from git tag `phase-4-shipped` (commit fba1207): DAL alert repos, email send wrapper, anti-abuse libs, RFC 8058 lifecycle, scheduler hook, deliverability runbook. The two evaluators (`hotDay`, `startingToRun`) are pure-historical and conceptually compatible with the explorer mental model.

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
| 4. Email Alerts | v1.0 | 0/— | Retired with v1.0 close (carried to v2 Phase 10) | — |
| 5. Polish | v1.0 | 0/— | Retired with v1.0 close (carried to v2 Phase 8 — merged into Home/Retire/Polish) | — |
| 6. Explorer Foundation | v2 | 5/5 | Shipped | 2026-05-01 |
| 7. Moon-phase Overlay | v2 | 3/3 | Shipped (PR #3) | 2026-05-01 |
| 8. Home, Retire, Polish | v2 | 0/TBD | Not started — spike complete, awaiting plan-phase | — |
| 9. Sharing | v2 | 0/TBD | Not started | — |
| 10. Email Alerts | v2 | 0/TBD | Not started | — |

---

*Roadmap created: 2026-04-22*
*v1.0 milestone closed: 2026-04-30*
*v2 milestone roadmapped: 2026-04-30 — originally 6 phases (6–11), 41 requirements mapped*
*Phase 7 planned: 2026-05-01 — 3 plans, shipped same day via PR #3*
*v2 restructured: 2026-05-01 — Phase 8 absorbed old Phases 10 + 11; old Phases 8 + 9 renumbered to 9 + 10; v2 now 4 phases (6–10). Spike `001-phase-7.5-data-exploration` grounds Phase 8 scope.*
*Next: `/gsd:plan-phase 8` (Home, Retire, Polish)*
