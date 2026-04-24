# Phase 1: Ingest + Store - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

A polite, observable, idempotent scraper writes to a canonical SQLite schema; the full historical dataset that `sandiegofishreports.com/dock_totals/boats.php` exposes is in the local store via a resumable CLI; silent-failure monitoring (row-count SLA) is armed. Nightly scheduled scrape runs unattended.

**In scope:** scraper (Cheerio + native fetch), rate-limit enforcement (≤1 req/5s global), parser (Zod + quarantine), upsert DAL (`lib/db/`), `scrape_runs` ledger, gzipped HTML snapshots, resumable backfill CLI, row-count SLA alert, TOS review artifact + courtesy email draft + pre-prod gate.

**Out of scope:** public browse UI, trip picker, trends, forecasts, user-facing email alerts — those are Phases 2–4.

</domain>

<decisions>
## Implementation Decisions

### Schema design (STO-01, STO-02, STO-03, STO-05, ING-04, ING-09)
- **D-01:** `boats` table uses surrogate `id INTEGER PRIMARY KEY` + `source_name TEXT NOT NULL UNIQUE` + `display_name TEXT NOT NULL` + `landing_id INTEGER FK`. Rationale: stable IDs survive source renames; `display_name` lets operator canonicalize ("Pt Loma" → "Point Loma Sportfishing") without mutating raw source label.
- **D-02:** `landings` table mirrors the same shape: `id / source_name UNIQUE / display_name`. Landings are a first-class table (STO-02).
- **D-03:** Species is a column on `catch_reports`, not a separate table. Stored verbatim from source (lowercased, trimmed). CLAUDE.md species list is operator knowledge for display mapping in Phase 2; not a DB constraint here.
- **D-04:** Single `scrape_runs` ledger table with outcome enum — `{success, empty, http_error, parse_error, killed}`. No separate `scrape_attempts` table; the `empty` outcome satisfies STO-05 ("tried, returned no rows" is a first-class row in the ledger). Columns: `id / run_date / started_at / finished_at / outcome / rows_ingested / error_message`.
- **D-05:** `catch_reports` schema: `id / source_date / boat_id FK / landing_id FK / trip_type TEXT / species TEXT / angler_count INTEGER / species_count INTEGER / scraped_at TEXT`. `trip_type` stored VERBATIM from source per CLAUDE.md domain language rule.
- **D-06:** Indexes — `UNIQUE(source_date, boat_id, trip_type, species)` doubles as the idempotent-upsert key (ING-04); `INDEX(source_date, species)` covers Phase 2 trip-picker queries; `INDEX(boat_id, source_date)` covers boat history pages.

### Parser strategy (ING-06)
- **D-07:** Row-level failure = quarantine + continue. Malformed row writes to `parse_failures(run_id, row_index, raw_html_snippet, zod_error)` and parsing continues. Partial data beats no data. Fixture path logged per ING-06.
- **D-08:** Unknown trip_type = accept verbatim. No allow-list validation against CLAUDE.md domain language. Novelty is data, not error. The CLAUDE.md canon is display-layer knowledge for Phase 2.
- **D-09:** HTML fixture approach = commit real scraped HTML files to `tests/fixtures/scraper/YYYY-MM-DD-{case}.html` with paired `.expected.json` for regression. Minimum fixtures: `typical.html`, `empty-day.html`, `parse-edge.html` (mangled row to exercise quarantine path).

### Backfill CLI UX (ING-08, ING-09, ING-03)
- **D-10:** Invocation = `npm run backfill -- --from YYYY-MM-DD --to YYYY-MM-DD [--resume] [--quiet]`. Native Node `parseArgs`, zero CLI framework dependency. tsx runs TS source directly.
- **D-11:** Progress reporting = compact one-line-per-date with running totals: `[2010-03-15] 23 rows / 847 total / next in 5.0s`. Plain stdout, pipe-safe, tmux/ssh-reconnect-safe. `--quiet` for silent CI.
- **D-12:** Resume = auto-detect, default behavior. Query `scrape_runs` for prior outcomes; skip dates with outcome ∈ {success, empty}; retry dates with outcome ∈ {killed, http_error, parse_error}; skip dates with no ledger entry means new work. No flag required. Idempotent upsert makes partial-inflight retry safe.
- **D-13:** Rate-limit coordination = shared p-queue backed by file-based mutex at `/data/scrape.lock`. Exclusive lock acquired by whichever process (backfill CLI or nightly scheduler) runs first; the other blocks. In-process p-queue enforces the 5s spacing on top. Lock file contains PID for debuggability.

### Scheduled scrape cadence (ING-01)
- **D-14:** Nightly scrape runs at **23:00 America/Los_Angeles** (11pm PT). Gives boats 2–3 hours buffer after evening dock-return. DST-safe via croner tz string.
- **D-15:** Scheduled scrape ingests **today only** (single source URL, one fetch per tick). Idempotent upsert means re-scraping "today" on a subsequent day is safe (picks up late-reported boats via that day's own nightly run on the following night — acceptable latency for v1).
- **D-16:** Missed-run catch-up is **operator-driven via CLI**. Scheduler runs current date only; does not auto-backfill. OPS-04 dead-man's switch already alerts operator if heartbeat stops.

### Raw HTML snapshot storage (ING-05)
- **D-17:** Snapshots stored on the local Fly volume at `/data/snapshots/YYYY/MM/DD.html.gz`. Replicated by Litestream to B2 along with the DB. Typical ~100KB gzipped × 365 days/year = ~36MB/year (well within 1GB volume).
- **D-18:** Retention = forever (revisit when volume approaches 80% full). No retention cron in v1.
- **D-19:** Filename convention = `YYYY/MM/DD.html.gz`. Date-partitioned folders. One snapshot per date; idempotent re-scrape overwrites (matches ING-04 semantics).

### TOS review + courtesy outreach (ING-10, ING-11)
- **D-20:** Phase delivers artifact templates + drafts:
  - `.planning/research/TOS-REVIEW.md` — operator fills in with excerpts + summary after reading actual source-site TOS + robots.txt.
  - `.planning/research/OUTREACH-EMAIL.md` — ready-to-send draft with placeholders for operator name/contact.
- **D-21:** First-scrape gate = `FIRST_SCRAPE_OK` Fly secret. Scheduler and CLI both refuse to scrape production source until this is set to `true`. Operator flips it after TOS review is written AND outreach email has been sent (1-week silence = implicit consent + documented good-faith attempt).
- **D-22:** Phase 1 verification does NOT require a live production scrape. Unit tests + fixture replay + local-dev scrape against committed fixtures are sufficient to green-light the code. Live scrape awaits operator action per D-21.

### Row-count SLA (ING-07)
- **D-23:** Baseline = 7-day rolling average of `rows_ingested` from `scrape_runs` where `outcome='success'` AND `run_date BETWEEN today-7 AND today-1`. Excludes `empty` outcomes from the denominator (off-season doesn't poison the baseline).
- **D-24:** Numerator = total rows for `source_date=today` after the scrape completes (not rows-this-run). Stable definition — the SLA question is "is today's data volume suspicious?", not "was this run small?". Idempotent re-scrapes correctly insert 0 new rows without false-alarming.
- **D-25:** Empty-day handling = `outcome='empty'` does NOT trigger the SLA alert. Only `outcome='success'` with `total_for_date < 50% * 7d_avg` fires. OPS-04 dead-man's switch handles the "scrape didn't run at all" case.

### Claude's Discretion
- Internal naming of DAL repository modules (`boats.ts`, `catchReports.ts`, `scrapeRuns.ts`, etc.) — planner decides.
- Parser module structure (single file vs per-section splitters) — planner decides based on source HTML shape.
- Whether Drizzle ORM gets introduced now or deferred to a later refactor — planner weighs raw better-sqlite3 statements vs Drizzle queries for this phase's read patterns.
- Exact column types/widths (TEXT vs VARCHAR(N), INT vs INTEGER) — planner decides per SQLite conventions.
- Where the p-queue instance lives (`lib/scraper/rate-limiter.ts` vs inline in scraper.ts) — planner decides.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project instructions + domain
- `CLAUDE.md` — Non-negotiable rules: polite scraping (≤1 req/5s, UA with contact, robots.txt, TOS review before first scrape, operator email), silent-failure detection (row-count SLA, freshness alert, Zod per record, gzipped HTML snapshots), DAL boundary, domain language (trip types / landings / species verbatim).
- `.planning/REQUIREMENTS.md` §Ingest + §Store — authoritative REQ descriptions for ING-01..11 + STO-01..05.
- `.planning/ROADMAP.md` Phase 1 — goal statement + success criteria.

### Research (from project research + Phase 0)
- `.planning/research/STACK.md` — Cheerio 1.2.x + native undici fetch, better-sqlite3 12.9.x, croner 10.0.x, Zod, p-queue, p-retry, date-fns.
- `.planning/research/ARCHITECTURE.md` — Modular monolith, DAL boundary rationale, precompute-forecasts-serve-cheap-reads pattern.
- `.planning/research/PITFALLS.md` — Known hazards for scraping + SQLite + SvelteKit.

### Phase 0 artifacts the implementation builds on
- `src/lib/server/scheduler.ts` — Existing croner scheduler; Phase 1 replaces the stub heartbeat tick with the real nightly scrape tick.
- `src/lib/server/kill-switch.ts` — `scrapingEnabled()` gate read at tick time (OPS-05). Phase 1 scrape tick calls this FIRST.
- `src/lib/server/heartbeat.ts` — `pingHealthcheck('start'|'success'|'fail')` — Phase 1 scrape tick pings start/success/fail around its work.
- `src/lib/server/logger.ts` — pino logger with request_id correlation (OPS-06). Phase 1 scraper logs under a scrape-run correlation id.
- `src/lib/alerts/operator.ts` — `sendOperatorAlert()` Resend wrapper (OPS-01). Row-count SLA alert reuses this.
- `src/lib/shared/dates.ts` — Sole date producer (`today()`, `toIsoDate()`). All `source_date` values go through this.
- `src/lib/db/smoke.ts` — The ENTIRE Phase 0 DAL (single smoke-test table). Phase 1 replaces this file with the real catch_reports / boats / landings / scrape_runs repositories.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **pino logger + requestId correlation (`src/lib/server/logger.ts` + `src/hooks.server.ts`)** — Phase 1 scraper creates a child logger per scrape-run with `run_id` as the correlation key.
- **Resend operator alert (`src/lib/alerts/operator.ts`)** — row-count SLA alert delivery channel already wired; just call `sendOperatorAlert({ subject, body })`.
- **Kill switch (`scrapingEnabled()`)** — Phase 1 tick body calls this BEFORE any outbound fetch. Pattern already proven by the tick-ordering test.
- **Scheduler (`startScheduler`)** — croner is already running and wired to boot via `runStartup()`. Phase 1 replaces the stub `_heartbeatTick` with `_scrapeTick`.
- **better-sqlite3 + WAL mode (`smoke.ts`)** — Phase 1 replaces this file with the real DAL but keeps the WAL + synchronous=NORMAL pragmas.
- **Dates module (`src/lib/shared/dates.ts`)** — `today()` returns `YYYY-MM-DD` in `America/Los_Angeles`. Every scraper/DAL reference to dates imports from here.

### Established Patterns
- **Single date producer** (CLAUDE.md + STO-04) — Every `YYYY-MM-DD` string in Phase 1 MUST go through `src/lib/shared/dates.ts`. No raw `new Date().toISOString()` calls.
- **DAL boundary** (CLAUDE.md + STO-03) — ONLY `src/lib/db/` issues SQL. `lib/scraper/`, `lib/alerts/`, `src/routes/` call typed repository functions.
- **Tick-ordering invariant** (OPS-05) — Any scheduled work checks `scrapingEnabled(process.env)` at the TOP of the tick, before any side effect. Phase 0 tests enforce this pattern.
- **Heartbeat bookends** (OPS-04) — Scheduled work pings `start` → `success` or `fail`. Phase 1 scrape tick follows the same shape.
- **Vitest + fixtures pattern** — `tests/fixtures/*` are committed; tests are discovered by glob `tests/**/*.{test,spec}.{js,ts}`.

### Integration Points
- **Scheduler** — `src/lib/server/scheduler.ts` `startScheduler()` will gain a second cron entry for the nightly 23:00 PT scrape tick (or replace the stub heartbeat entirely with the real scrape tick + its own heartbeat ping).
- **Startup** — `src/lib/server/startup.ts` `runStartup()` already boots the scheduler idempotently; no change needed.
- **Routes** — No new HTTP routes in Phase 1. SvelteKit's `src/routes/healthz/+server.ts` stays as-is.
- **CLI** — `scripts/backfill.ts` is a new file that imports from `lib/scraper/` + `lib/db/` directly (TSX runs it; it does not boot SvelteKit).

</code_context>

<specifics>
## Specific Ideas

- The source site is server-rendered PHP (confirmed in STACK.md) — no Playwright needed, Cheerio + undici fetch is sufficient.
- `scrape_runs` outcome enum values are lowercase strings: `success`, `empty`, `http_error`, `parse_error`, `killed`. Used in both the SLA baseline query and the backfill CLI's resume logic.
- `/data/snapshots/` path is where Litestream's replication is already replicating the `/data` volume — snapshots get the SQLite backup story for free.
- The `FIRST_SCRAPE_OK` Fly secret is the ING-10/11 gate. CLI + scheduler both read it. Never defaults to true.

</specifics>

<deferred>
## Deferred Ideas

- **Snapshot retention cron** — not needed in v1 (36MB/year / 1GB volume = 28 years). Revisit if volume hits 80%.
- **Day-of-week-adjusted SLA baseline** — current 7-day rolling is simpler; revisit if Phase 4 alerts fire too often on Mondays.
- **Drizzle ORM migration** — Phase 1 ships with raw better-sqlite3 prepared statements in the DAL. If query complexity spikes in Phase 2 browse, consider Drizzle then.
- **Snapshot deduplication via content hash** — over-engineered at this scale.
- **`scrape_attempts` as a separate table** — rejected; the `empty` outcome in `scrape_runs` suffices for STO-05.
- **Multi-date scheduled scrape (today + yesterday)** — rejected for v1. If late-reporting boats become a visible data issue, revisit.

</deferred>

---

*Phase: 01-ingest-store*
*Context gathered: 2026-04-23*
