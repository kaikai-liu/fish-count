# Project Research Summary

**Project:** FishCount
**Domain:** Public data-aggregation web app — scheduled scraper + historical store + statistical forecast + read-only web UI + email alerts (San Diego charter fishing)
**Researched:** 2026-04-22
**Confidence:** HIGH (stack, features, architecture); MEDIUM on hosting choice finalization and alert-threshold specifics

## Executive Summary

FishCount is a modular-monolith, data-aggregation web app whose entire value proposition depends on one upstream source (`sandiegofishreports.com/dock_totals/boats.php`). Research across the stack, features, architecture, and pitfalls converges on an unambiguous shape: a single SvelteKit Node process that hosts the web UI, the scraper, an in-process scheduler, and a SQLite database, deployed on a cheap always-on VM, with Litestream replicating the DB file to object storage for disaster recovery. The dataset is small (per-boat-per-day aggregates, well under 1M rows lifetime), the write volume is one job per night, the read path is dominated by precomputed aggregates, and the only user-personal surface is an email-alerts signup. None of that justifies microservices, a managed Postgres, a message queue, or a serverless split — and picking any of those would actively hurt shipping speed.

The feature picture is equally clear: FishCount sits in a real, unoccupied gap between raw count-aggregator sites (show today, one date at a time), social fishing apps (FishBrain et al., UGC + gamification, wrong audience), and booking marketplaces (sell trips, don't rank objectively). The winning move is to stay narrowly focused on the "which boat should I book?" decision: trip picker + trend charts + calendar heatmap + side-by-side comparison + honest statistical forecast + email alerts. The biggest failure modes are not missing features — they are (a) over-building toward FishBrain territory, (b) implying false precision in per-angler averages or forecasts, and (c) losing the source relationship by scraping rudely.

Five critical, project-ending risks must be engineered out from Phase 1: polite scraping (rate limit + robots.txt + identifying User-Agent + proactive outreach to the site operator), silent-failure detection on the scraper (row-count SLA + schema validation + freshness alerts, not just HTTP 200 checks), forecast honesty (prediction intervals + sample-size annotations + refusal to forecast when n is too small), per-angler metric framing (clear labeling as a derived average, mandatory trip-type segmentation, absolute totals shown alongside), and email compliance (double opt-in + rate limits + honeypot + SPF/DKIM/DMARC before the first send). Every one of these is cheap to do on day one and very expensive to retrofit. The roadmap must treat them as phase-exit criteria, not polish.

## Key Findings

### Recommended Stack

A single SvelteKit Node process on Fly.io, backed by SQLite with Litestream, is the right size for this workload. Verified against npm as of 2026-04-22 and matches the official `npx sv add drizzle` scaffold. See `STACK.md` for version compatibility matrix, alternatives considered, and scraping-ethics rules.

**Core technologies (versions verified 2026-04-22):**
- **Node.js 22.x LTS + TypeScript 5.7.x** — current LTS through 2027; native `fetch`/`undici`
- **SvelteKit 2.57.x (Svelte 5.55.x) + adapter-node 5.x** — SSR + server endpoints + in-process scheduler in one deployable; ~50–70% less JS than React for the same charts UI
- **better-sqlite3 12.9.x + SQLite 3.46+** — synchronous, fastest Node SQLite binding; one file, zero ops
- **Drizzle ORM 0.45.x + drizzle-kit 0.31.x** — TS-first, plain-SQL migrations, thin enough to drop to raw SQL
- **Cheerio 1.2.x + native undici fetch** — source is server-rendered PHP; Playwright would be 50× overkill
- **ECharts 6.0.x** — only mainstream lib with native calendar heatmap (`coordinateSystem: 'calendar'`)
- **Resend 6.12.x** — 3,000 emails/month permanent free tier
- **Litestream 0.3.x** — continuous SQLite replication to Backblaze B2 / S3
- **Fly.io shared-cpu-1x + 1 GB volume** — ~$2–3/mo all-in, always-on
- **croner 10.0.x, p-queue 9.1.x, p-retry 6.x, date-fns 4.x, Zod 4.3.x, pino 9.x, Tailwind 4.2.x** — supporting libraries

**Hard rejections:** Puppeteer/Playwright for scraping, Prisma, Recharts/Chart.js (no native calendar heatmap), SendGrid, Vercel (serverless can't host cron or SQLite file), BullMQ/Redis.

### Expected Features

See `FEATURES.md` for the full competitor matrix and SD-specific domain-language gates (trip-type, landing, species names must appear verbatim from source).

**Must have (table stakes):**
- Per-boat-per-day display (boat / landing / anglers / trip-type / species / counts)
- Filters with SD-native names: trip type ("1/2 Day AM", "Full Day Coronado Islands", "2 Day", "Long Range"), landing ("Fisherman's Landing", "Point Loma Sportfishing", "H&M Landing"), species ("bluefin", "yellowtail", "dorado" — not "mahi-mahi" in SD)
- Date navigation (calendar picker + jump-to-date)
- Per-angler average = boat total ÷ anglers, labeled honestly as derived boat-aggregate
- Boat detail / profile page
- Mobile-readable layout
- "Last scraped" timestamp + "today is provisional" badge
- Source attribution link per row

**Should have (differentiators):**
- Trip Picker: date + species → ranked boats with avg/angler, trip count, "Why this boat?" explainer
- 30-day calendar heatmap colored by predicted catch rate (gray for thin-data dates)
- Trend charts; same-week-last-year overlay
- Side-by-side boat comparison with same-trip-type toggle
- Statistical projection with visible confidence/prediction bands (refuse to predict when n<5)
- Email alerts on followed species/boat
- Trip-type-aware normalization (mandatory)
- Anonymous shareable URL state (query-string-based)
- Species seasonality cheatsheet

**Defer (v1.x / v2+):**
- Boat-profile drill-down polish; median/range distribution; CSV/JSON export
- Multi-source aggregation beyond sandiegofishreports.com
- Weather / SST / tide / moon overlays
- Landing locator map, push notifications

**Anti-features (never build):**
- Per-angler individual attribution (source is boat-aggregate only)
- Social feed / posts / photos / comments
- Leaderboards / "ON FIRE" badges / gamification
- ML-based bite-time / weather-fused forecasts
- Mandatory account to browse
- Booking / payment integration
- Sponsored / promoted boat slots in rankings
- Fake-precision projections ("73.4% chance")

### Architecture Approach

A modular monolith: one SvelteKit Node deployment, one SQLite database, internal boundaries enforced by import discipline (DAL is the only module that talks to SQL). In-process `croner` scheduler, but every scheduled job is also exposed as an authenticated `/api/cron/*` route so scheduling is pluggable. Domain modules are pure-ish (take inputs, call repositories, return values), unit-testable without network or clock. See `ARCHITECTURE.md` for component diagram, critical type contracts, anti-patterns.

**Major components:**
1. **Scraper Pipeline** (`lib/scraper/`) — `fetch.ts` (rate-limited undici + robots.txt + custom UA) → `parse.ts` (Cheerio → `CatchReport[]` Zod-validated) → `pipeline.scrapeDate(date)` → idempotent upsert. Backfill reuses `scrapeDate` in a resumable loop.
2. **Data Access Layer** (`lib/db/`) — Drizzle repositories. Only module that imports `db`.
3. **Forecast Engine** (`lib/forecast/`) — `statistics.ts` (pure math) + `compute.ts` (read history → write `forecasts` table). Rebuilds after each scrape.
4. **Trip Picker / Query API** (`lib/trip-picker/`) — Reads precomputed `forecasts` table, not raw `catch_reports`.
5. **Web UI** (`src/routes/`) — SvelteKit server pages call services directly (no internal HTTP). Client JS only for charts, lazy-loaded ECharts.
6. **Subscribe / Verify / Unsub + Alerts Engine** (`lib/alerts/`, `lib/email/`) — Only user-initiated write path. Double opt-in via signed token. Alerts engine produces `AlertCandidate[]`; templates render; provider wrapper sends.

**Build order:** Schema+DAL → Scraper pipeline → UI read path → Backfill → Forecast layer → Cron infrastructure → Email subscriptions → Alerts engine → Polish. Each step produces a usable artifact.

**Key patterns:** Idempotent upsert on `(date, boat_id, trip_type, species)`; precompute aggregates + read cheap; cron-routes-over-HTTP; backfill-as-script + incremental-as-cron. Forbidden: live-computing aggregates per request, scraper owning the schema, email rendering inside alerts logic, backfill via cron route.

### Critical Pitfalls

Every deal-breaker in `PITFALLS.md` has a Phase-1 engineering control. Retrofitting any costs 10–100×.

1. **Backfill hammers the source → project dies** (Phase 1). Controls: 1 req per 5–10s via `p-queue`; resumable via `scrape_runs` ledger; hard daily cap; shared rate limiter between backfill and nightly; off-peak (~3am PT). Verify: backfill takes >24h; logs ≤12 req/min.

2. **Silent scraper failure (HTTP 200 + zero rows)** (Phase 1). Controls: row-count SLA (alert if <50% of rolling 7-day avg); strict Zod validation; freshness SLA (>36h = alert); gzipped raw-HTML snapshots for replay; specific selectors, not clever CSS chains. Verify: synthetic empty-HTML test fires alert.

3. **Forecast looks confident but is noise** (Phase 3 forecast + UI). Controls: always show **prediction intervals** (not CIs — different thing); always show `n`; hard floor at n<5 (render "not enough history"); benchmark against seasonal-naïve and ship the baseline if the model can't beat it; integer-only display; wide grey bands not "±" notation. Verify: every forecast carries `n`; n=2 renders no number.

4. **Per-angler metric misread as personal skill** (Phase 2 UI). The CPUE-bias problem. Controls: mandatory trip-type segmentation; prominent "derived boat-aggregate average, not individual skill" copy; absolute totals shown alongside ratios; angler count per trip in detail views; "About the data" page; consider median/trimmed-mean. Verify: cross-trip-type comparison impossible in UI; every chart axis has tooltip.

5. **Email signup → list-bombing → domain reputation dead** (Phase 4 alerts). Controls (ALL, not a subset): double opt-in; per-IP rate limit (3/hr); honeypot field; disposable-email rejection; suppression list surviving unsubscribes; `List-Unsubscribe` header (Gmail/Yahoo 2024 requirement); SPF+DKIM+DMARC before first send; domain warm-up (50/day → 200/day); physical address in every email. Verify: mail-tester.com >9/10; honeypot blocks scripted submits.

6. **TOS / robots.txt non-compliance → takedown** (Phase 1, before first production scrape). Controls: read TOS + robots.txt in writing first; custom UA with contact link; proactive operator outreach; aggressive caching (never re-scrape historical dates); prominent source attribution; `SCRAPER_ENABLED=false` kill switch. Verify: TOS notes saved; robots.txt parsed at run-start; operator email sent.

**Important (not project-ending but corrosive):**
- **Cost creep** (Phase 0): billing alert at $20/$50/$100 before deploying anything; exponential backoff + ceilings; gzip + tier raw HTML storage; cap email list size programmatically.
- **Data gaps break forecasts silently** (Phase 1 schema + Phase 3 forecast): `scrape_attempts` separate from `catch_reports`; per-trip (not per-day) boat averages; gap-aware aggregation reporting "based on N of M days"; weekly retry-failed-dates job.

## Implications for Roadmap

### Phase 0: Ops Guardrails (pre-deployment)
**Rationale:** Billing alerts, dead-man's switch, kill switch are prerequisites for *any* cloud deployment. Pitfalls #7 and #2 both require this scaffolding before anything goes live.
**Delivers:** Fly.io account + shared-cpu-1x + 1 GB volume; Backblaze B2 bucket; billing alerts ($20/$50/$100); healthchecks.io dead-man's switch; `SCRAPER_ENABLED` env var; pino logging; Litestream sidecar.
**Stack:** Fly.io, Backblaze B2, Litestream, pino, healthchecks.io.
**Avoids:** Cost creep; silent-failure blindness; losing the dataset to a disk event.

### Phase 1: Ingest + Store (data foundation)
**Rationale:** All downstream features read from this. All deal-breaker scraping pitfalls (#1, #2, #6, #8) engineered in here, not layered on later. Backfill is the single most dangerous operation in the project lifecycle.
**Delivers:** Drizzle schema (`catch_reports`, `boats`, `landings`, `scrape_runs`, `scrape_attempts`, `subscribers` stub, `alerts_sent` stub); Cheerio + undici scraper with p-queue rate limiter, Zod, idempotent upsert on `(date, boat_id, trip_type, species)`; raw-HTML snapshotting; row-count + freshness monitoring; resumable backfill CLI; operator outreach; robots.txt honored.
**Features addressed:** Scheduled scrape, historical backfill, per-day per-boat storage, source attribution foundation.
**Stack used:** Drizzle, better-sqlite3, Cheerio, undici, Zod, p-queue, p-retry, croner, date-fns.
**Pitfalls avoided:** #1, #2, #6, #8.
**Exit criteria:** Backfill ≤12 req/min; row-count alert fires on synthetic test; robots.txt honored at run-start; operator notified.

### Phase 2: Read UI — Trip Picker + Browse (core value loop)
**Rationale:** Proves schema queryability before investing in forecast precomputation. First surface showing per-angler numbers, so framing pitfall (#4) must ship with it.
**Delivers:** Routes for `/` (trip picker, historical mean), `/boats/[id]`, `/trends`, `/calendar` (heatmap by historical mean — forecast coloring in Phase 3); filter UI; "Last scraped" + "today is provisional" badges; source links; shareable URL state; "About the data" page; per-angler disclaimer + tooltips; mandatory trip-type segmentation.
**Features addressed:** Trip picker (ranked list), filters, per-angler avg (honestly labeled), calendar heatmap, trend charts, boat comparison, anonymous browsing, shareable URL, "Why this boat?" explainer.
**Stack used:** SvelteKit SSR, Tailwind, ECharts (lazy-loaded), Drizzle reads.
**Pitfalls avoided:** #4; partial #3 (no forecasts yet = no false-precision risk).
**Exit criteria:** Cross-trip-type comparison impossible in UI; every per-angler number carries disclaimer + tooltip; "About the data" page exists.

### Phase 3: Forecast Layer
**Rationale:** Needs historical depth (Phase 1) and a UI (Phase 2). Forecast math + rendering co-designed — math produces intervals + n; UI refuses to render when n<5.
**Delivers:** `lib/forecast/statistics.ts` (mean, std, percentiles, prediction intervals); `lib/forecast/compute.ts` (read-history → write `forecasts` table); seasonal-naïve baseline; forecast-recompute wired into scrape route; trip picker rewired to read `forecasts`; heatmap recolored by expected range; gap-aware aggregation ("based on N of M days").
**Features addressed:** Statistical projection with confidence bands; heatmap color by predicted catch rate; same-week-last-year overlay.
**Stack used:** Drizzle raw SQL for window functions; date-fns rolling windows.
**Pitfalls avoided:** #3, #8.
**Exit criteria:** Seasonal-naïve checked in and beaten on hold-out; every forecast carries `n`; n<5 renders "not enough history"; integers only.

### Phase 4: Email Alerts
**Rationale:** Needs reliable forecasts (Phase 3). Signup-abuse surface (#5) must ship with ALL protections from day one — no retrofit path without tanking sender reputation.
**Delivers:** `subscribers` schema; signup form with honeypot + per-IP rate limit + disposable-email rejection; double-opt-in via signed token; verify + unsubscribe routes; `lib/alerts/rules.ts` (hot-day + run-start); Resend dispatch with templates; `alerts_sent` dedup; `List-Unsubscribe` header; SPF/DKIM/DMARC; warm-up plan; physical-address footer.
**Features addressed:** Email signup; alerts on followed species/boat.
**Stack used:** Resend, email templates, Zod form validation, signed tokens via Node `crypto`.
**Pitfalls avoided:** #5.
**Exit criteria:** mail-tester.com >9/10; honeypot blocks scripted submission; double-opt-in verified end-to-end; unsubscribe is one-click.

### Phase 5: Polish
**Rationale:** "Shareable with friends" bar. Everything non-essential deferred here. Don't gold-plate.
**Delivers:** Loading/error states; empty-data handling (rockfish closed-season copy); mobile QA; filter UX refinement; median/trimmed-mean toggle; same-week-last-year toggle; species seasonality cheatsheet; boat-profile enhancements.
**Exit criteria:** URL shareable with SD angler friends without disclaimers.

### Phase Ordering Rationale

- **Data dependencies dictate order.** Nothing works without Phase 1 data. Forecasts need history (Phase 1) + UI (Phase 2). Alerts need reliable forecasts (Phase 3) + trusted pipeline.
- **Credibility guardrails ship with the surfaces they protect.** Per-angler framing with the first per-angler surface (Phase 2). Forecast honesty with the forecast engine (Phase 3). Email protections with the signup form (Phase 4). Retrofitting costs 10–100×.
- **Phase 0 precedes Phase 1.** Never scrape into the cloud without billing alert + dead-man's switch + kill switch.
- **Backfill is a Phase 1 exit criterion, not a later task.** Run from dev machine via resumable CLI, never via cron route (cron routes time out).
- **Polish is last and narrow.** PROJECT.md is explicit: v1 is "shareable with friends," not public-launch.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Ingest):** Exact source HTML structure (selectors, date-nav mechanism, trip-type/angler-count rendering); TOS + robots.txt in writing; rate-limit cadence (5s vs 10s) based on scout request.
- **Phase 3 (Forecast):** Specific statistical method (bootstrap PI vs Student-t on log-transformed counts); trip-type-specific seasonality; rockfish closed-season handling.
- **Phase 4 (Alerts):** Alert threshold validation with target users (hot-day = 2× trailing-30-day same-trip-type; run-start = 1.5× same-week-last-year).

Phases with standard patterns (skip research-phase):
- **Phase 0 (Ops):** Standard Fly.io + Litestream + healthchecks.io recipe.
- **Phase 2 (Read UI):** SvelteKit SSR + ECharts well-documented; SD domain language captured in FEATURES.md.
- **Phase 5 (Polish):** Iteration on Phase 2–4 surfaces.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified on npm 2026-04-22; official SvelteKit+Drizzle recipe; ECharts calendar-heatmap native; Resend free tier confirmed |
| Features | HIGH | Extensive competitor coverage; SD-specific domain language verified across landings and forums |
| Architecture | HIGH | Modular-monolith is dominant shape for civic-data / small-dashboard projects; pattern library well-established |
| Pitfalls | HIGH | Synthesized from scraping/forecasting/email-deliverability literature + fisheries-specific CPUE research; every critical pitfall has recovery path |

**Overall confidence:** HIGH

### Gaps to Address

- **Source TOS + robots.txt not yet reviewed in writing.** First action in Phase 1, before any production request.
- **Hosting finalization (Fly.io vs Render vs Hetzner/DO VPS).** STACK.md recommends Fly.io ~$2–3/mo; Render free with cold starts; VPS flat $5/mo. Architecture-neutral; decide Phase 0.
- **Forecast method (bootstrap vs log-t PI vs simpler).** PITFALLS.md clear on presentation contract (intervals + n + refusal + beat seasonal-naïve) but not math. Phase 3 picks and documents.
- **Time-zone handling.** All dates Pacific (`America/Los_Angeles`). Enforce via single `lib/shared/dates.ts` helpers module; scraper, DB (YYYY-MM-DD PT strings), UI, cron all consistent.
- **Alert threshold definitions.** Phase 4 user validation. False alarms erode trust faster than misses.
- **Per-angler statistic choice (mean vs median vs trimmed mean).** Mean can shift 40% from one exceptional trip. Phase 2 UI shows both; Phase 3 forecast documents its choice.

## Sources

### Primary (HIGH confidence)
- SvelteKit + Drizzle official docs (`sv add drizzle` recipe)
- Drizzle ORM docs
- npm registry queries 2026-04-22 (version pins)
- San Diego Fish Reports (source site)
- Apache ECharts calendar-heatmap demo (native `coordinateSystem: 'calendar'`)
- Recharts issue #237 (no heatmap support confirmed)
- Fly.io pricing docs
- Email API Pricing Comparison April 2026 (Resend 3k/mo permanent free)
- Litestream docs
- ICES Journal of Marine Science (CPUE bias)
- Forecasting: Principles and Practice (Hyndman) — prediction vs confidence intervals; seasonal-naïve
- Gmail/Yahoo bulk-sender rules (2024) — `List-Unsubscribe`, complaint-rate thresholds

### Secondary (MEDIUM confidence)
- Web Scraping With Node.js in 2026 (DEV.to)
- Database Free Tier Comparison 2026
- Recharts vs Chart.js vs Nivo 2026 (PkgPulse)
- SvelteKit vs Next.js vs Remix vs Astro 2026
- City Bureau `city-scrapers` + biglocalnews `civic-scraper` (modular-monolith reference)
- FishBrain / Fishidy / FishingBooker / FishDope feature pages
- BDOutdoors SD Long Range forum + SDfish.org (domain language)
- Silent-failure detection literature
- Suped email-deliverability knowledge base

### Tertiary (LOW confidence)
- Specific alert threshold numbers — validate with users in Phase 4.
- Rate-limit cadence (5s vs 10s) — scout source response times before committing.
- Render vs Fly.io vs VPS — operational preference, not technical.

---
*Research completed: 2026-04-22*
*Ready for roadmap: yes*
