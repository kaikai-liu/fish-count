# CLAUDE.md — FishCount

> Guidance for Claude Code when working in this repository.

## Project

**FishCount** — A public web app that aggregates San Diego charter boat fishing data (scraped from `sandiegofishreports.com/dock_totals/boats.php`) and turns it into views the source site doesn't offer: a trip picker recommending boats for a target species on a future date, 30-day calendar heatmaps, cross-season trend charts, side-by-side boat comparisons, statistical forecasts, and email alerts.

**Core value:** Given a date (or range) and a target species, help an angler pick the charter boat with the best historical odds.

**Audience:** San Diego recreational anglers. v1 polish bar is "shareable with friends," not public-launch.

## Technology Stack

Confirmed by `.planning/research/STACK.md` (verified 2026-04-22):

- **Runtime:** Node.js 22.x LTS + TypeScript 5.7.x
- **Web framework:** SvelteKit 2.57.x (Svelte 5.55.x) + adapter-node — SSR + server endpoints + in-process scheduler in one deployable
- **Database:** better-sqlite3 12.9.x + SQLite 3.46+ + Drizzle ORM 0.45.x — single file, zero ops
- **Backup:** Litestream 0.3.x → Backblaze B2 / S3 (continuous SQLite replication)
- **Scraper:** Cheerio 1.2.x + native undici `fetch` (no Playwright — source is server-rendered PHP)
- **Scheduler:** croner 10.0.x in-process; every scheduled job is also an authenticated `/api/cron/*` route
- **Charts:** ECharts 6.0.x (only mainstream lib with native calendar heatmap)
- **Email:** Resend 6.12.x (3,000 emails/month permanent free tier)
- **Hosting:** Fly.io shared-cpu-1x + 1 GB volume (~$2–3/mo all-in, always-on)
- **Supporting:** p-queue, p-retry, Zod, date-fns, pino, Tailwind 4.2.x

**Hard rejections:** Puppeteer/Playwright (scraping), Prisma, Recharts/Chart.js (no native calendar heatmap), SendGrid, Vercel (serverless can't host cron + SQLite file), BullMQ/Redis.

## Architecture Rules

- **Modular monolith.** One SvelteKit Node deployment, one SQLite DB. Internal boundaries enforced by import discipline.
- **DAL is the only module that issues SQL.** Everything else (`lib/scraper/`, `lib/forecast/`, `lib/alerts/`, `src/routes/`) calls typed repositories in `lib/db/`. This is the load-bearing boundary — it preserves the option to swap SQLite for Postgres later without touching domain code.
- **Idempotent upsert on `(date, boat_id, trip_type, species)`.** Re-running a scrape produces identical final state. Backfill = loop + call `scrapeDate`. Parser bug fixes = re-run affected dates.
- **Precompute forecasts; serve cheap reads.** UI reads key-lookups against a `forecasts` table populated during the scrape cycle. Never live-compute aggregates per request.
- **All dates are `YYYY-MM-DD` in `America/Los_Angeles`.** A single `lib/shared/dates.ts` module is the sole producer of date strings.
- **Backfill is a CLI, not a cron route.** Cron/function timeouts can't cover hours-long polite-rate-limited backfill.

## Non-Negotiable Rules (retrofitting any of these costs 10–100×)

1. **Polite scraping.** Rate limit ≤ 1 req per 5s shared between backfill + incremental. Custom User-Agent with contact link. Honor `robots.txt`. Review TOS in writing before first production scrape. Email source-site operator proactively.
2. **Silent-failure detection.** Row-count SLA alert (<50% of rolling 7-day average fires). Freshness alert (>36h = dead-man's switch). Zod validation on every record. Gzipped raw-HTML snapshots for replay.
3. **Forecast honesty.** Always show prediction intervals. Always show sample size `n`. Hard floor: `n<5` renders "not enough history" (no point estimate). Beat seasonal-naïve on held-out validation or ship the baseline. Integers only — no false-precision decimals. Horizon capped at 30 days.
4. **Per-angler metric framing.** The metric is a **derived boat-aggregate average**, never an individual attribution. Mandatory trip-type segmentation — cross-trip-type comparison must be impossible in UI. Inline disclaimer (not tooltip-only). `About the data` page exists and is linked from every per-angler number.
5. **Email compliance (all, not a subset).** Double opt-in. Per-IP rate limit. Honeypot. Disposable-email rejection. Suppression list that cannot be re-subscribed. `List-Unsubscribe` header + one-click unsubscribe. Physical postal address. SPF + DKIM + DMARC before first production send. Warm-up schedule (50/day → 200/day → full).

## Anti-Features (never build)

Per-angler individual attribution · social feed / comments / photos · leaderboards / gamification · ML-based bite-time forecasts · push/SMS (v1) · mandatory account to browse · booking / payment integration · bait/tackle recs · GPS catch-spot maps · personal catch logbook · AI-generated reports · "ON FIRE" hype badges · paywalls · sponsored boat slots in rankings · fake-precision projections · manual scrape trigger in UI · non-San-Diego data.

## Domain Language (SD-specific — get these verbatim)

- **Trip types:** "1/2 Day AM," "1/2 Day PM," "3/4 Day," "Full Day," "Full Day Coronado Islands," "Overnight," "1.5 Day," "2 Day," "2.5 Day," "3 Day," "Long Range." Never normalize to "half-day" or invent buckets.
- **Landings:** "Fisherman's Landing," "Point Loma Sportfishing" (never "Pt Loma"), "H&M Landing," "Seaforth," "Helgren's," "Dana Wharf," "Oceanside."
- **Species:** "bluefin," "yellowtail," "yellowfin," "dorado" (not "mahi-mahi" — SD uses dorado), "wahoo," "calicos" or "calico bass," "rockfish," "lingcod."
- **Metric:** "per angler" (more honest than "per rod" or "per person").

## Planning Artifacts

| File | What it is |
|------|------------|
| `.planning/PROJECT.md` | Living project context |
| `.planning/REQUIREMENTS.md` | 66 v1 requirements, REQ-IDs, traceability to phases |
| `.planning/ROADMAP.md` | 6-phase roadmap (Phase 0 Ops → Phase 5 Polish) |
| `.planning/STATE.md` | Current position, velocity, decisions |
| `.planning/config.json` | GSD workflow settings (yolo / standard / parallel / balanced / research+check+verify) |
| `.planning/research/SUMMARY.md` | Consolidated research reference |
| `.planning/research/{STACK,FEATURES,ARCHITECTURE,PITFALLS}.md` | Full research |

## GSD Workflow

This project uses **GSD (Get Shit Done)** for phase-based execution.

- **Start a phase:** `/gsd-discuss-phase <N>` (or `/gsd-plan-phase <N>` to skip discussion)
- **Execute a phase:** `/gsd-execute-phase <N>` after planning
- **Check status:** `/gsd-progress`
- **Full autonomous loop:** `/gsd-autonomous`

Mode: **YOLO** (auto-approve). Granularity: **standard**. Parallelization: **on**. Research / plan-check / verifier agents: **all on**.

Next step: `/gsd-discuss-phase 0` (Ops Guardrails).
