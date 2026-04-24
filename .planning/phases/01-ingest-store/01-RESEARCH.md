# Phase 1: Ingest + Store - Research

**Researched:** 2026-04-23
**Domain:** Polite, observable, idempotent HTTP scraping → canonical SQLite schema; resumable historical backfill CLI; nightly scheduled scrape; row-count SLA monitoring
**Confidence:** HIGH (source HTML probed live; all libraries verified on npm; existing Phase 0 wiring read directly)

## Summary

Phase 1 turns the Phase 0 stub heartbeat into a real, polite scraper that fills a canonical SQLite store with 15+ years of historical fishing reports and runs a nightly scrape unattended. The source site (`sandiegofishreports.com/dock_totals/boats.php`) was probed live during this research: it is server-rendered Bootstrap-3 HTML, robots.txt is wide-open (`Disallow:` empty), historical depth reaches at least 2009, and dates are fetched via `?date=YYYY-MM-DD`. The HTML structure is stable and parseable with Cheerio in ~30 lines: each landing is one `<div class='panel'>` containing a single `<table class='table table-stripped'>`, with one `<tr>` per boat-trip carrying boat name (`<a href="/charter_boats/...">`), landing name (`<a href="/landings/...">`), `N Anglers<br>...trip type...`, and a comma-separated `COUNT SPECIES[, COUNT SPECIES, ...]` dock totals string. The only known qualifier in the dock totals across the dates sampled (2009, 2015, 2024-01, 2024-08, 2026-04) is `<font color="red">Released</font>` — which appears AFTER the count and species ("15 Spiny Lobster <font color="red">Released</font>"). Treat "Released" entries as their own species variant or strip them; CONTEXT.md does not specify, so this is a Claude's-discretion call documented as an OPEN QUESTION below.

All 25 CONTEXT.md decisions (schema shape, parser strategy, CLI UX, snapshot path, TOS gate, SLA formula) are locked. This research therefore narrows to **how to implement what was decided** — not what to decide. The Phase 0 codebase already provides the wiring this phase plugs into: `src/lib/shared/dates.ts` (sole date producer), `src/lib/server/scheduler.ts` (croner scheduler with kill-switch + heartbeat ordering already proven by tests), `src/lib/server/kill-switch.ts`, `src/lib/server/heartbeat.ts`, `src/lib/server/logger.ts` (pino with request_id correlation), and `src/lib/alerts/operator.ts` (Resend wrapper for the row-count SLA alert).

**Primary recommendation:** Build the scraper as a pure pipeline — `fetch(date) → snapshot(html) → parse(html) → upsert(rows) → recordRun(outcome)` — with each stage independently testable against committed HTML fixtures. Wire the same `scrapeDate(date)` primitive into both the croner scrape tick (replacing Phase 0's stub heartbeat) and the standalone `scripts/backfill.ts` CLI (run via `tsx`, no SvelteKit boot). Coordinate the two via a shared in-process p-queue (5s interval) plus a file-based `proper-lockfile` mutex at `/data/scrape.lock` so neither runs over the other. Use raw better-sqlite3 prepared statements in the DAL — Drizzle is deferred per CONTEXT.md.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Schema design (STO-01, STO-02, STO-03, STO-05, ING-04, ING-09):**
- **D-01:** `boats` table = `id INTEGER PRIMARY KEY` + `source_name TEXT NOT NULL UNIQUE` + `display_name TEXT NOT NULL` + `landing_id INTEGER FK`. Surrogate IDs survive source renames; `display_name` lets operator canonicalize ("Pt Loma" → "Point Loma Sportfishing") without mutating raw source label.
- **D-02:** `landings` table mirrors the same shape: `id / source_name UNIQUE / display_name`. Landings are first-class (STO-02).
- **D-03:** Species = column on `catch_reports`, not a separate table. Stored verbatim from source (lowercased, trimmed). CLAUDE.md species list is operator knowledge for display mapping in Phase 2; not a DB constraint here.
- **D-04:** Single `scrape_runs` ledger table with outcome enum — `{success, empty, http_error, parse_error, killed}`. No separate `scrape_attempts`; `empty` outcome satisfies STO-05. Columns: `id / run_date / started_at / finished_at / outcome / rows_ingested / error_message`.
- **D-05:** `catch_reports` schema: `id / source_date / boat_id FK / landing_id FK / trip_type TEXT / species TEXT / angler_count INTEGER / species_count INTEGER / scraped_at TEXT`. `trip_type` stored VERBATIM from source per CLAUDE.md domain language rule.
- **D-06:** Indexes — `UNIQUE(source_date, boat_id, trip_type, species)` doubles as the idempotent-upsert key (ING-04); `INDEX(source_date, species)` covers Phase 2 trip-picker queries; `INDEX(boat_id, source_date)` covers boat history pages.

**Parser strategy (ING-06):**
- **D-07:** Row-level failure = quarantine + continue. Malformed row writes to `parse_failures(run_id, row_index, raw_html_snippet, zod_error)` and parsing continues. Partial data beats no data. Fixture path logged per ING-06.
- **D-08:** Unknown trip_type = accept verbatim. No allow-list validation against CLAUDE.md domain language. Novelty is data, not error.
- **D-09:** HTML fixture approach = commit real scraped HTML files to `tests/fixtures/scraper/YYYY-MM-DD-{case}.html` with paired `.expected.json` for regression. Minimum fixtures: `typical.html`, `empty-day.html`, `parse-edge.html` (mangled row to exercise quarantine path).

**Backfill CLI UX (ING-08, ING-09, ING-03):**
- **D-10:** Invocation = `npm run backfill -- --from YYYY-MM-DD --to YYYY-MM-DD [--resume] [--quiet]`. Native Node `parseArgs`, zero CLI framework dependency. tsx runs TS source directly.
- **D-11:** Progress reporting = compact one-line-per-date with running totals: `[2010-03-15] 23 rows / 847 total / next in 5.0s`. Plain stdout, pipe-safe, tmux/ssh-reconnect-safe. `--quiet` for silent CI.
- **D-12:** Resume = auto-detect, default behavior. Query `scrape_runs` for prior outcomes; skip dates with outcome ∈ {success, empty}; retry dates with outcome ∈ {killed, http_error, parse_error}; dates with no ledger entry = new work. No flag required. Idempotent upsert makes partial-inflight retry safe.
- **D-13:** Rate-limit coordination = shared p-queue backed by file-based mutex at `/data/scrape.lock`. Exclusive lock acquired by whichever process runs first; the other blocks. In-process p-queue enforces the 5s spacing on top. Lock file contains PID for debuggability.

**Scheduled scrape cadence (ING-01):**
- **D-14:** Nightly scrape at **23:00 America/Los_Angeles** (11pm PT). Gives boats 2–3 hours buffer after evening dock-return. DST-safe via croner tz string.
- **D-15:** Scheduled scrape ingests **today only** (single source URL, one fetch per tick). Idempotent upsert means re-scraping "today" on a subsequent day is safe.
- **D-16:** Missed-run catch-up is **operator-driven via CLI**. Scheduler runs current date only; does not auto-backfill. OPS-04 dead-man's switch already alerts operator if heartbeat stops.

**Raw HTML snapshot storage (ING-05):**
- **D-17:** Snapshots stored on local Fly volume at `/data/snapshots/YYYY/MM/DD.html.gz`. Replicated by Litestream to B2 along with the DB. Typical ~100KB gzipped × 365 days/year ≈ 36MB/year (well within 1GB volume).
- **D-18:** Retention = forever in v1.
- **D-19:** Filename convention = `YYYY/MM/DD.html.gz`. Date-partitioned folders. Idempotent re-scrape overwrites.

**TOS review + courtesy outreach (ING-10, ING-11):**
- **D-20:** Phase delivers artifact templates + drafts: `.planning/research/TOS-REVIEW.md` (operator fills in) + `.planning/research/OUTREACH-EMAIL.md` (ready-to-send draft).
- **D-21:** First-scrape gate = `FIRST_SCRAPE_OK` Fly secret. Scheduler and CLI both refuse to scrape production source until set to `true`. Operator flips it after TOS review is written AND outreach email has been sent (1-week silence = implicit consent + documented good-faith attempt).
- **D-22:** Phase 1 verification does NOT require a live production scrape. Unit tests + fixture replay + local-dev scrape against committed fixtures are sufficient.

**Row-count SLA (ING-07):**
- **D-23:** Baseline = 7-day rolling average of `rows_ingested` from `scrape_runs` where `outcome='success'` AND `run_date BETWEEN today-7 AND today-1`. Excludes `empty` outcomes from the denominator.
- **D-24:** Numerator = total rows for `source_date=today` after the scrape completes (not rows-this-run). The SLA question is "is today's data volume suspicious?", not "was this run small?".
- **D-25:** Empty-day handling = `outcome='empty'` does NOT trigger the SLA alert. Only `outcome='success'` with `total_for_date < 50% * 7d_avg` fires.

**Other locked items:**
- Raw better-sqlite3 in Phase 1; Drizzle deferred.
- DAL is the only SQL-issuing module.

### Claude's Discretion
- Internal naming of DAL repository modules (`boats.ts`, `catchReports.ts`, `scrapeRuns.ts`, etc.) — planner decides.
- Parser module structure (single file vs per-section splitters) — planner decides based on source HTML shape.
- Whether Drizzle ORM gets introduced now or deferred to a later refactor — planner weighs raw better-sqlite3 statements vs Drizzle queries for this phase's read patterns.
- Exact column types/widths (TEXT vs VARCHAR(N), INT vs INTEGER) — planner decides per SQLite conventions.
- Where the p-queue instance lives (`lib/scraper/rate-limiter.ts` vs inline in scraper.ts) — planner decides.

### Deferred Ideas (OUT OF SCOPE)
- **Snapshot retention cron** — not needed in v1 (36MB/year / 1GB volume = 28 years). Revisit if volume hits 80%.
- **Day-of-week-adjusted SLA baseline** — current 7-day rolling is simpler; revisit if Phase 4 alerts fire too often on Mondays.
- **Drizzle ORM migration** — Phase 1 ships with raw better-sqlite3 prepared statements in the DAL.
- **Snapshot deduplication via content hash** — over-engineered at this scale.
- **`scrape_attempts` as a separate table** — rejected; the `empty` outcome in `scrape_runs` suffices for STO-05.
- **Multi-date scheduled scrape (today + yesterday)** — rejected for v1.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ING-01 | Nightly scheduled scrape runs unattended | §Architecture Patterns: croner tick replaces Phase 0 stub heartbeat at `0 23 * * *` `America/Los_Angeles`; §Code Examples: croner+protect; §Pitfall: DST handled by croner timezone string [VERIFIED: Context7 /hexagon/croner] |
| ING-02 | Honor robots.txt + custom UA with contact link | §Architecture Patterns: `robots-parser` cached for 24h; UA constant `FishCountBot/0.1 (+https://...; contact@...)`; §Source Probe: robots.txt `Disallow:` is empty so all paths allowed [VERIFIED: live curl 2026-04-23] |
| ING-03 | Rate-limit ≤ 1 req per 5s shared between backfill + incremental | §Architecture Patterns: p-queue `{concurrency:1, intervalCap:1, interval:5000}` + proper-lockfile cross-process mutex; §Code Examples [VERIFIED: Context7 /sindresorhus/p-queue] |
| ING-04 | Idempotent upsert keyed on (date, boat, trip_type, species) | §Code Examples: `INSERT ... ON CONFLICT(...) DO UPDATE` against `UNIQUE(source_date, boat_id, trip_type, species)` index per D-06 [VERIFIED: Context7 /wiselibs/better-sqlite3] |
| ING-05 | Gzipped raw-HTML snapshot per successful fetch | §Architecture Patterns: Node `zlib.gzipSync()` + `fs.writeFileSync` to `/data/snapshots/YYYY/MM/DD.html.gz` per D-17 |
| ING-06 | Parser rejects malformed records + logs fixture path | §Architecture Patterns: per-row Zod `safeParse`; on failure write to `parse_failures(run_id, row_index, raw_html_snippet, zod_error)` per D-07; continue parsing remaining rows [VERIFIED: Context7 /colinhacks/zod] |
| ING-07 | Row-count SLA alert <50% of 7-day rolling average | §Architecture Patterns: post-scrape DAL query computes baseline + today total per D-23/D-24/D-25; reuses `sendOperatorAlert()` from `src/lib/alerts/operator.ts` [VERIFIED: existing Phase 0 file] |
| ING-08 | Resumable CLI for full historical backfill | §Architecture Patterns: `scripts/backfill.ts` invoked via `tsx`; auto-resume by querying `scrape_runs`; `--from/--to/--resume/--quiet` per D-10 [VERIFIED: Node 22.22.2 `parseArgs` works as expected] |
| ING-09 | `scrape_runs` ledger | §Schema: D-04 columns; written by both scheduler tick + backfill CLI; consumed by SLA + resume logic |
| ING-10 | TOS reviewed in writing in `.planning/research/` | §Deliverables: `.planning/research/TOS-REVIEW.md` template per D-20; gates first scrape via `FIRST_SCRAPE_OK` per D-21 |
| ING-11 | Operator emailed proactively before backfill | §Deliverables: `.planning/research/OUTREACH-EMAIL.md` draft per D-20; gates first scrape via `FIRST_SCRAPE_OK` per D-21 |
| STO-01 | Schema captures per-boat-per-day records | §Schema: D-05 `catch_reports` shape |
| STO-02 | Boats + landings as first-class tables | §Schema: D-01 + D-02 |
| STO-03 | DAL is the only SQL-issuing module | §Architecture Patterns: pattern is established in Phase 0 (`src/lib/db/smoke.ts`); Phase 1 replaces smoke.ts with real repos but keeps the boundary [VERIFIED: existing Phase 0 file] |
| STO-04 | All dates `YYYY-MM-DD` America/Los_Angeles via single dates module | §Architecture Patterns: `src/lib/shared/dates.ts` is the SOLE producer; scraper imports `today()` and `toIsoDate()` [VERIFIED: existing Phase 0 file] |
| STO-05 | Distinguish "tried, no rows" from "never tried" | §Schema: D-04 `outcome='empty'` is the first-class "tried, returned no rows" row in `scrape_runs`; absence of a row = "never tried" |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTP fetch + retry + UA + robots.txt | Backend (server) | — | Single Node process owns all outbound HTTP; no edge/CDN involvement |
| HTML parsing + Zod validation | Backend (server) | — | Pure function over a string; runs in-process |
| SQLite UPSERT + indexes | Database / Storage | — | better-sqlite3 is in-process, file lives on `/data` Fly volume |
| Snapshot gzip + write to disk | Database / Storage | — | Filesystem write to `/data/snapshots/`; replicated by Litestream sidecar |
| Cron scheduling (23:00 PT tick) | Backend (server) | — | croner runs in the same Node process as SvelteKit per Phase 0 architecture |
| Backfill CLI orchestration | Backend (CLI) | Database / Storage | tsx-driven Node script; does NOT boot SvelteKit; talks directly to DAL |
| Cross-process rate-limit coordination | Backend (server) + Backend (CLI) | Database / Storage | proper-lockfile on `/data/scrape.lock`; both processes contend for the same file |
| SLA alert dispatch (Resend email) | Backend (server) | — | Reuses Phase 0 `sendOperatorAlert()` wrapper; only the scheduler tick fires this (CLI does not) |
| TOS review artifacts | Documentation (planning) | — | Markdown files under `.planning/research/`; no code |
| `FIRST_SCRAPE_OK` gate | Backend (server) + Backend (CLI) | Configuration (Fly secrets) | Both scrape entry points read `process.env.FIRST_SCRAPE_OK` and refuse to fetch when unset/false |

**Why this matters:** Every capability above runs server-side in one Node process or in the CLI shell — no browser, no CDN, no API tier separation. The DAL boundary is the only internal architectural seam in Phase 1 and it is enforced by import discipline (already established in Phase 0).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | 12.9.0 | SQLite driver, prepared statements, transactions | Already pinned in package.json; synchronous API matches the scraper's "fetch → parse → upsert" sync flow; `db.transaction()` wraps multi-row upserts atomically [VERIFIED: npm view 2026-04-23] |
| `cheerio` | 1.2.0 | HTML parsing (jQuery-like API on htmlparser2) | Source HTML is server-rendered; structure is `div.panel > table > tbody > tr` (verified live); no JS execution needed [VERIFIED: npm view 2026-04-23 + live source probe] |
| `croner` | 10.0.1 | Cron scheduling with IANA timezone + overlap protection | Already pinned in package.json; `protect: true` prevents tick overlap if a scrape runs >24h; DST-safe via `timezone: 'America/Los_Angeles'` [VERIFIED: Context7 /hexagon/croner; existing Phase 0 file] |
| `zod` | 4.3.6 | Per-row schema validation; `safeParse` returns issue list | Per-row failure shape from `result.error.issues` is already serializable JSON for the `parse_failures.zod_error` column [VERIFIED: Context7 /colinhacks/zod; npm view 2026-04-23] |
| `p-queue` | 9.1.2 | In-process rate-limiting for outbound requests | `{concurrency:1, intervalCap:1, interval:5000}` enforces ≤1 req per 5s within a single process; survives across CLI dates because the queue is a module-level singleton [VERIFIED: Context7 /sindresorhus/p-queue; npm view 2026-04-23] |
| `p-retry` | 8.0.0 | Exponential-backoff retry wrapper around `fetch()` | `AbortError` short-circuits 4xx responses (don't retry on 404/410); retries on 5xx and network errors with exponential backoff [VERIFIED: Context7 /sindresorhus/p-retry; npm view 2026-04-23] |
| `proper-lockfile` | 4.1.2 | File-based cross-process mutex on `/data/scrape.lock` | Decision D-13 mandates a file mutex; `proper-lockfile` is the standard Node solution; supports stale-lock detection (kills lock if PID dies) [VERIFIED: Context7 /moxystudio/node-proper-lockfile; npm view 2026-04-23] |
| `robots-parser` | 3.0.1 | Parse + cache robots.txt | ING-02 mandates robots.txt compliance; this lib has been the de facto Node choice for a decade [VERIFIED: npm view 2026-04-23] |
| `tsx` | 4.21.0 | Run TS source directly (no compile step) for the CLI | Decision D-10 mandates tsx for the backfill CLI; runs `scripts/backfill.ts` without booting SvelteKit's vite pipeline [VERIFIED: npm view 2026-04-23] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino` | 10.3.1 | Structured logging | Already pinned; create `logger.child({ run_id, source_date })` per scrape run for correlation [VERIFIED: existing Phase 0 file] |
| `node:zlib` | (built-in) | gzip raw HTML before write | `zlib.gzipSync(html)` is sync and fast for ~14KB pages; no streaming needed |
| `node:fs/promises` | (built-in) | Async file write for snapshots | `mkdir({recursive:true})` + `writeFile()` for `/data/snapshots/YYYY/MM/DD.html.gz` |
| `node:util` `parseArgs` | (built-in) | CLI flag parsing for backfill | Decision D-10 mandates this over yargs/commander; verified working with `--from/--to/--resume/--quiet` shape [VERIFIED: live `node -e` test 2026-04-23] |
| `undici` (native `fetch`) | (built-in) | Outbound HTTP | Decision is locked: native `fetch` over axios; Node 22 ships undici under the hood [VERIFIED: existing Phase 0 file uses native fetch in `heartbeat.ts`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `proper-lockfile` | Built-in `fs.openSync(path, 'wx')` | Hand-rolled would skip the stale-lock-detection edge case (CLI killed with SIGKILL leaves lock orphaned). `proper-lockfile` defaults to a 10s stale window with mtime tracking. Standard-stack > hand-rolled here. |
| `robots-parser` | Hand-roll a `Disallow:` regex | Robots.txt has wildcards, comments, multiple user-agent groups, `Allow:` precedence rules. Library is ~3KB; hand-rolling is the textbook anti-pattern. |
| `cheerio` | `node-html-parser` | `node-html-parser` is faster but has a smaller selector dialect and weaker docs; cheerio's jQuery-style API matches existing developer fluency and STACK.md already pinned it. |
| Drizzle ORM in Phase 1 | Raw better-sqlite3 (chosen per CONTEXT.md) | Drizzle is deferred. Phase 1 has 4 tables and ~10 prepared statements; raw better-sqlite3 keeps the codepath transparent and matches the existing Phase 0 `smoke.ts` pattern. |

**Installation:**
```bash
npm install cheerio zod p-queue p-retry proper-lockfile robots-parser
npm install --save-dev tsx
```

**Version verification:** All versions above were verified via `npm view <pkg> version` on 2026-04-23.

## Architecture Patterns

### System Architecture Diagram

```
                                    ┌──────────────────────────────────────┐
                                    │  Source: sandiegofishreports.com     │
                                    │  /dock_totals/boats.php?date=YYYY... │
                                    │  (server-rendered Bootstrap-3 HTML)  │
                                    └─────────────────┬────────────────────┘
                                                      │ HTTPS GET
                                                      │ (≤1 req per 5s; UA+contact)
                          ┌───────────────────────────┼────────────────────────────┐
                          │                           │                            │
                ┌─────────▼──────────┐     ┌──────────▼──────────┐                 │
                │  Scheduler tick    │     │  Backfill CLI        │                 │
                │  (croner @ 23:00   │     │  (scripts/backfill.ts│                 │
                │   PT, today only)  │     │   via tsx)           │                 │
                └─────────┬──────────┘     └──────────┬──────────┘                 │
                          │                           │                            │
                          │  both call scrapeDate(date)                            │
                          └─────────┬─────────────────┘                            │
                                    │                                              │
                                    │   ┌─────────────────────────────────┐        │
                                    ├──>│ proper-lockfile mutex on        │        │
                                    │   │ /data/scrape.lock (cross-proc)  │        │
                                    │   └─────────────────────────────────┘        │
                                    │                                              │
                                    │   ┌─────────────────────────────────┐        │
                                    ├──>│ p-queue (concurrency:1,         │        │
                                    │   │   intervalCap:1, interval:5000) │        │
                                    │   └─────────────────────────────────┘        │
                                    │                                              │
                                    │   ┌─────────────────────────────────┐        │
                                    ├──>│ FIRST_SCRAPE_OK gate            │        │
                                    │   │ (refuse if unset/false)         │        │
                                    │   └─────────────────────────────────┘        │
                                    │                                              │
                                    │   ┌─────────────────────────────────┐        │
                                    ├──>│ scrapingEnabled() kill switch   │        │
                                    │   │ (existing Phase 0 module)       │        │
                                    │   └─────────────────────────────────┘        │
                                    │                                              │
                                    │   ┌─────────────────────────────────┐        │
                                    └──>│ robots-parser cache (24h TTL)   │────────┘
                                        └─────────────────────────────────┘

                                    │
                                    ▼
                          ┌─────────────────────┐
                          │ fetch(date) via     │
                          │ p-retry + AbortError│
                          │ on 4xx              │
                          └────────┬────────────┘
                                   │
                  HTML response    │
                                   ▼
                          ┌─────────────────────┐         ┌──────────────────────────┐
                          │ snapshot(html)      │────────>│ /data/snapshots/         │
                          │ gzip + writeFile    │         │   YYYY/MM/DD.html.gz     │
                          └────────┬────────────┘         └──────────────────────────┘
                                   │
                                   ▼
                          ┌─────────────────────┐
                          │ parse(html) →       │   per-row Zod safeParse;
                          │ Cheerio walk:       │   on failure → quarantine row,
                          │   div.panel >       │   continue with next row
                          │   table > tbody >   │
                          │   tr → CatchRow     │
                          └────────┬────────────┘
                                   │
                  CatchRow[] +     │
                  ParseFailure[]   │
                                   ▼
                          ┌─────────────────────────────────────────────────┐
                          │ DAL (src/lib/db/) — ONLY module that issues SQL │
                          │  - boats.upsertByName(source_name, landing_id)  │
                          │  - landings.upsertByName(source_name)           │
                          │  - catchReports.upsertMany(rows)  [transaction] │
                          │  - parseFailures.recordMany(failures)           │
                          │  - scrapeRuns.recordOutcome({date, outcome,...})│
                          └─────────────────────┬───────────────────────────┘
                                                │
                                                ▼
                                    ┌────────────────────────┐
                                    │ SQLite (/data/         │
                                    │   fishcount.sqlite3)   │
                                    │ WAL + synchronous=     │
                                    │   NORMAL (Phase 0)     │
                                    └────────┬───────────────┘
                                             │
                                             ▼
                                    ┌────────────────────────┐
                                    │ Litestream → B2        │
                                    │ (Phase 0; replicates   │
                                    │  DB + /data/snapshots) │
                                    └────────────────────────┘

  After-run (scheduler tick only — NOT CLI):
                                    │
                                    ▼
                          ┌─────────────────────────┐
                          │ SLA check:              │
                          │   today_total_rows <    │
                          │   0.5 * 7d_rolling_avg? │
                          └────────┬────────────────┘
                                   │ yes
                                   ▼
                          ┌─────────────────────┐
                          │ sendOperatorAlert() │  (Phase 0 wrapper; Resend)
                          └─────────────────────┘
```

### Recommended Project Structure

```
src/
├── lib/
│   ├── db/                            # DAL — ONLY module that issues SQL
│   │   ├── client.ts                  # better-sqlite3 instance + WAL pragmas
│   │   ├── migrations.ts              # CREATE TABLE / CREATE INDEX bootstrapper
│   │   ├── boats.ts                   # upsertByName, getById, listAll
│   │   ├── landings.ts                # upsertByName, getById, listAll
│   │   ├── catchReports.ts            # upsertMany, getByDate, getByDateRange
│   │   ├── scrapeRuns.ts              # recordOutcome, getRecentByOutcome,
│   │   │                              #   computeBaselineFor(date), totalRowsForDate
│   │   └── parseFailures.ts           # recordMany, getByRunId
│   ├── scraper/
│   │   ├── fetcher.ts                 # fetch(date) wrapped in p-retry + UA + robots check
│   │   ├── rate-limiter.ts            # singleton p-queue {conc:1, intervalCap:1, interval:5000}
│   │   ├── lock.ts                    # proper-lockfile acquire/release on /data/scrape.lock
│   │   ├── snapshot.ts                # gzip + write to /data/snapshots/YYYY/MM/DD.html.gz
│   │   ├── parser.ts                  # Cheerio walk → CatchRow[] + ParseFailure[]
│   │   ├── schema.ts                  # Zod schemas for CatchRow + ParseFailure shapes
│   │   ├── pipeline.ts                # scrapeDate(date) — orchestrates fetch+snapshot+parse+upsert
│   │   ├── sla.ts                     # post-scrape row-count check + alert dispatch
│   │   ├── robots.ts                  # robots-parser wrapper with 24h cache
│   │   └── gate.ts                    # FIRST_SCRAPE_OK env-var check
│   ├── server/
│   │   └── scheduler.ts               # MODIFIED: replace stub _heartbeatTick body with scrapeTick
│   ├── alerts/
│   │   └── operator.ts                # UNCHANGED: reused for SLA alert
│   └── shared/
│       └── dates.ts                   # UNCHANGED: sole date producer
└── routes/                            # NO new routes in Phase 1
scripts/
└── backfill.ts                        # NEW: tsx-run CLI; --from/--to/--resume/--quiet
tests/
├── fixtures/scraper/
│   ├── 2024-08-15-typical.html        # representative production day, ~30 boats
│   ├── 2024-08-15-typical.expected.json  # parsed CatchRow[] expectation
│   ├── 2026-12-25-empty-day.html      # all panels present, zero <tr> rows
│   ├── 2024-01-15-released-qualifier.html  # "Spiny Lobster Released" rows
│   └── parse-edge-mangled.html        # synthetic: one malformed row to exercise quarantine
├── unit/
│   ├── scraper/
│   │   ├── parser.test.ts             # parses fixtures → expected JSON
│   │   ├── fetcher.test.ts            # mocks fetch; asserts UA, retry behavior, AbortError on 4xx
│   │   ├── rate-limiter.test.ts       # asserts ≥5s between two queued tasks
│   │   ├── pipeline.test.ts           # end-to-end fixture replay → in-memory SQLite assertion
│   │   └── sla.test.ts                # baseline + alert-fire conditions
│   └── db/
│       ├── catchReports.test.ts       # idempotent upsert: run twice → same row count
│       ├── scrapeRuns.test.ts         # outcome ledger + 7-day baseline computation
│       └── parseFailures.test.ts      # quarantine writes
└── scheduler/
    └── scrape-tick.test.ts            # NEW: kill-switch ordering preserved with new tick body
```

**Structure rationale:**
- `lib/scraper/` is fine-grained because each file is independently unit-testable: `fetcher.ts` takes a date and returns HTML, `parser.ts` takes HTML and returns rows, `pipeline.ts` composes them. This is the established "pure-ish" pattern from ARCHITECTURE.md.
- `lib/db/` mirrors the locked schema: one file per table for the DAL. Phase 0's `smoke.ts` is replaced — not merely added to — because smoke_test was Phase 0 scaffolding only.
- `scripts/backfill.ts` lives outside `src/` because tsx invokes it directly without booting SvelteKit; it imports from `src/lib/scraper/` and `src/lib/db/` via relative paths or the `$lib` alias if tsconfig paths is configured.

### Pattern 1: Sole-DAL boundary (already established in Phase 0)

**What:** Only files under `src/lib/db/` issue SQL. Every other module imports typed repository functions.

**When to use:** Always — this is the load-bearing architectural rule from CLAUDE.md.

**Example:**
```typescript
// Good — pipeline.ts calls DAL functions
import { upsertCatchReports } from '$lib/db/catchReports';
import { recordScrapeRun } from '$lib/db/scrapeRuns';

await upsertCatchReports(rows);
await recordScrapeRun({ date, outcome: 'success', rowsIngested: rows.length });

// BAD — would violate the boundary
// import db from '$lib/db/client';
// db.prepare('INSERT INTO catch_reports ...').run(...);  // ❌
```

### Pattern 2: Idempotent upsert by natural key

**What:** Every row write is `INSERT ... ON CONFLICT (...) DO UPDATE`, keyed on the unique index from D-06: `(source_date, boat_id, trip_type, species)`.

**When to use:** Every write to `catch_reports`. This is what makes backfill resumable and re-running a scrape safe.

**Example (verified pattern from better-sqlite3 docs):**
```typescript
// src/lib/db/catchReports.ts
const insertStmt = db.prepare(`
  INSERT INTO catch_reports
    (source_date, boat_id, landing_id, trip_type, species,
     angler_count, species_count, scraped_at)
  VALUES (@source_date, @boat_id, @landing_id, @trip_type, @species,
          @angler_count, @species_count, @scraped_at)
  ON CONFLICT(source_date, boat_id, trip_type, species) DO UPDATE SET
    landing_id      = excluded.landing_id,
    angler_count    = excluded.angler_count,
    species_count   = excluded.species_count,
    scraped_at      = excluded.scraped_at
`);

const upsertMany = db.transaction((rows: CatchRow[]) => {
  for (const r of rows) insertStmt.run(r);
});
// Source: Context7 /wiselibs/better-sqlite3 (transaction + prepared statement)
```

### Pattern 3: croner with `protect: true` for overlap prevention

**What:** A single cron job that won't double-fire even if a scrape runs >24h.

**When to use:** The nightly scrape tick (decision D-14).

**Example (from Context7 /hexagon/croner):**
```typescript
// src/lib/server/scheduler.ts (modification of Phase 0 file)
import { Cron } from 'croner';

const scrapeJob = new Cron(
  '0 23 * * *',                           // 23:00 daily
  {
    name: 'nightly-scrape',
    timezone: 'America/Los_Angeles',     // DST-safe per croner docs
    protect: true                         // skip tick if previous one still running
  },
  _scrapeTick                             // body imports scrapeDate(today())
);
```

### Pattern 4: p-queue + file mutex two-tier rate limiting

**What:** In-process p-queue enforces ≤1 req per 5s within a single Node process. proper-lockfile mutex on `/data/scrape.lock` prevents the second process (CLI vs scheduler) from running concurrently at all.

**When to use:** Always for outbound source-site fetches. Decision D-13.

**Example:**
```typescript
// src/lib/scraper/rate-limiter.ts
import PQueue from 'p-queue';
export const sourceQueue = new PQueue({
  concurrency: 1,
  intervalCap: 1,
  interval: 5000  // 5s minimum between any two source-site fetches
});
// Source: Context7 /sindresorhus/p-queue

// src/lib/scraper/lock.ts
import lockfile from 'proper-lockfile';
const LOCK_PATH = process.env.SCRAPE_LOCK_PATH ?? '/data/scrape.lock';

export async function withScrapeLock<T>(fn: () => Promise<T>): Promise<T> {
  // ensure /data/scrape.lock exists as a regular file
  // (proper-lockfile creates a sibling .lock dir for atomicity)
  const release = await lockfile.lock(LOCK_PATH, {
    stale: 60_000,       // assume crashed if lock older than 60s
    retries: { retries: 0 }  // don't queue — fail fast so CLI prints "scheduler is running, exit"
  });
  try { return await fn(); }
  finally { await release(); }
}
// Source: Context7 /moxystudio/node-proper-lockfile
```

### Pattern 5: per-row Zod safeParse with quarantine continue

**What:** Each parsed table row goes through `CatchRowSchema.safeParse(raw)`. Failures write to `parse_failures` and parsing moves on; only catastrophic page-shape failures (e.g., zero `<tr>` found inside a non-empty page) abort.

**When to use:** Decision D-07 mandates this for ING-06.

**Example:**
```typescript
// src/lib/scraper/schema.ts
import { z } from 'zod';
export const CatchRowSchema = z.object({
  source_name: z.string().min(1),                    // boat name from <a><b>...</b></a>
  landing_source_name: z.string().min(1),            // landing name from <a href="/landings/...">
  trip_type: z.string().min(1),                      // verbatim per D-08
  angler_count: z.number().int().nonnegative(),      // parsed from "N Anglers"
  species: z.string().min(1).transform(s => s.toLowerCase().trim()),  // per D-03
  species_count: z.number().int().nonnegative()      // parsed from "N Species"
});
export type CatchRow = z.infer<typeof CatchRowSchema>;

// src/lib/scraper/parser.ts (excerpt)
const result = CatchRowSchema.safeParse(rawCandidate);
if (!result.success) {
  failures.push({
    row_index: idx,
    raw_html_snippet: $.html(rowEl),                   // for replay
    zod_error: JSON.stringify(result.error.issues)     // serializable per Context7 docs
  });
  continue;  // D-07: quarantine + continue
}
rows.push(result.data);
// Source: Context7 /colinhacks/zod
```

### Pattern 6: SQLite WAL + synchronous=NORMAL (already established)

**What:** Open the DB once with `PRAGMA journal_mode = WAL` and `PRAGMA synchronous = NORMAL`. Both are set in Phase 0's `src/lib/db/smoke.ts` and should be preserved when that file is replaced.

**When to use:** All DB connections in Phase 1.

**Example:** See existing Phase 0 file `src/lib/db/smoke.ts` lines 11–18. Copy verbatim into the new `src/lib/db/client.ts`.

### Anti-Patterns to Avoid

- **Live computation of the SLA baseline per request.** The baseline is computed exactly once per scrape tick, after upsert, by a single `scrape_runs` query. Don't expose a `/api/sla` route — Phase 1 has zero new HTTP routes (per CONTEXT.md `<code_context>`).
- **Calling `today()` more than once per scrape run.** Cache the date string at the top of `scrapeDate()` and pass it down. A scrape that begins at 23:59:55 PT and finishes at 00:00:05 PT must not split itself across two `source_date` values.
- **Booting SvelteKit from the CLI.** `scripts/backfill.ts` runs under tsx and imports DAL + scraper modules directly. Do NOT import from `$app/environment`, `$env/static/private`, or anything that requires the SvelteKit runtime. Use `process.env` directly in the CLI.
- **Re-fetching robots.txt per request.** Cache for 24h; the source-site operator's robots policy doesn't change between fetches in a single scrape session.
- **Parsing rows with regex on the raw HTML.** Use Cheerio. The `<font color="red">Released</font>` qualifier inside `<td>` cells is the kind of edge case that breaks naive regex.
- **Writing the snapshot AFTER parsing succeeds.** Decision D-17/D-19 says one snapshot per successful fetch. Write the snapshot as soon as the HTTP response is fully received and BEFORE attempting to parse, so a parser bug doesn't lose the raw evidence we need to fix it.
- **Running the SLA check from the CLI.** Decision D-23/D-24 frames it as the nightly scheduler's job; the CLI is for backfill (where 7-day baselines mid-history aren't meaningful). Pipeline branches on a `source: 'scheduler' | 'cli'` flag.
- **Storing emails (or any subscriber PII) in `parse_failures`.** This phase has no subscribers, but the redaction discipline from Phase 0 logger applies: parse_failures may contain an HTML snippet — strip nothing for replay value, but never log it through pino at info-level (use debug at most).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML parsing | Regex / string `indexOf` chains over `<td>` | `cheerio` `$('div.panel').each(...)` | The `<font color="red">Released</font>` qualifier inside dock-totals cells, irregular whitespace, and `&` in landing names ("H&M Landing") all break naive regex. Cheerio handles all of these for free. |
| Rate-limited request queue | `setTimeout(fetch, 5000)` loops | `p-queue` with `intervalCap:1, interval:5000` | Hand-rolled timeouts can drift; p-queue tracks queue position + emits `rateLimit` events for observability. Critical given the deal-breaker pitfall #1 in PITFALLS.md ("backfill that hammers the source"). |
| Cross-process file mutex | `fs.openSync(path, 'wx')` + try/catch | `proper-lockfile` | Stale-lock detection (PID died via SIGKILL → lock orphaned). proper-lockfile uses mtime-based stale detection; hand-rolled would leak the lock and require manual cleanup. |
| Cron with overlap protection | `setInterval(fn, 86400000)` | `croner` `protect: true` | `setInterval` is killed by process restart; doesn't survive DST; can't introspect "is the previous tick still running". croner is pinned and proven. |
| Retry with exponential backoff | Recursive `try { fetch() } catch { sleep(2^n) }` | `p-retry` with `AbortError` for 4xx | Hand-rolled retries always end up retrying on permanent 4xx errors, burning the source-site's logs and risking IP block. `AbortError` is the textbook idiom. |
| Schema validation for parsed rows | `if (typeof x !== 'string') throw` | `zod` `safeParse` + `error.issues` | Zod's issues array is already JSON-serializable for the `parse_failures.zod_error` column; hand-rolled validation has to invent the error shape. |
| robots.txt parsing | Read-line regex on `Disallow:` | `robots-parser` | Wildcards, multiple user-agent groups, comments, `Allow:` precedence — all standard; all breaking textbook hand-rolled parsers. The site's robots.txt today is empty `Disallow:` (verified live), but ING-02 mandates compliant parsing for whenever it changes. |
| CLI flag parsing | `process.argv.includes('--from')` | `node:util parseArgs` (built-in) | Already verified: native Node 22 `parseArgs` handles `--from <val>`, `--resume` boolean, etc. exactly per D-10. Zero-dependency vs commander/yargs. |
| gzip | Spawn `gzip` subprocess | `node:zlib` `gzipSync` | ~14KB pages are far below any streaming threshold; `gzipSync` is one line. |
| date math (today/PT) | `new Date().toISOString()` | `src/lib/shared/dates.ts` | CLAUDE.md hard rule + STO-04 — single date producer. Already exists from Phase 0; just import it. |

**Key insight:** Every "deceptively simple" piece of this scraper has a textbook off-the-shelf solution that handles edge cases the locked schema and PITFALLS.md will throw at it. Hand-rolling any one of these is the path to the silent-failure pitfall (PITFALLS.md #2, deal-breaker severity).

## Runtime State Inventory

> Phase 1 is largely greenfield (replacing Phase 0 stub modules with real ones), but it does mutate runtime state in three categories worth surfacing.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | (1) New SQLite tables — `boats`, `landings`, `catch_reports`, `scrape_runs`, `parse_failures`. (2) Phase 0 `smoke_test` table will remain in the DB after Phase 1 ships unless explicitly dropped. | Add `DROP TABLE IF EXISTS smoke_test` to the Phase 1 migration as a one-time cleanup, OR document that smoke_test is harmless and leave it. Planner decides. |
| Live service config | (1) Fly secret `FIRST_SCRAPE_OK` (new) controls whether the scheduler + CLI will hit the live source. Default = unset = refuse-to-scrape. (2) Existing Fly secrets (`SCRAPER_ENABLED`, `HEALTHCHECKS_PING_URL`, `RESEND_API_KEY`, `OPERATOR_EMAIL`) all continue to apply. | Operator sets `FIRST_SCRAPE_OK=true` after TOS-REVIEW.md is filled in and OUTREACH-EMAIL.md has been sent (D-21). Document the gate clearly in `.planning/phases/01-ingest-store/`. |
| OS-registered state | None. The croner scheduler is in-process and dies with the Node process; no systemd/launchd registration. | None. |
| Secrets/env vars | New: `FIRST_SCRAPE_OK` (Fly secret). Existing: kill-switch, ping URL, Resend creds — already in Fly secrets per Phase 0. New optional: `SCRAPE_LOCK_PATH` (defaults to `/data/scrape.lock`); `SNAPSHOT_DIR` (defaults to `/data/snapshots`); `DB_PATH` already wired in Phase 0. | Add `FIRST_SCRAPE_OK` to the Fly app secrets via `fly secrets set FIRST_SCRAPE_OK=false` initially. Document optional env vars in a per-phase README or in the new module's source. |
| Build artifacts / installed packages | New npm dependencies (cheerio, zod, p-queue, p-retry, proper-lockfile, robots-parser, tsx). better-sqlite3 native module rebuild on Docker base image change. | Update `package.json` and run `npm install`; rebuild Docker image. Phase 0's `node:22-bookworm-slim` Docker base already supports better-sqlite3 native compile. |

## Common Pitfalls

(Cross-referenced against PITFALLS.md — adapted with Phase 1-specific verification handles.)

### Pitfall 1: Backfill that hammers the source site (PITFALLS.md #1, deal-breaker)
**What goes wrong:** First backfill run completes in an hour because rate-limiting was bypassed; source-site operator notices spike and IP-blocks FishCount permanently.
**Why it happens:** Decision D-13's two-tier (p-queue + file mutex) gets disabled "just for the backfill" or only one tier ships.
**How to avoid:**
- Both backfill CLI and scheduler tick MUST go through `sourceQueue.add(() => fetcher.fetch(date))` — never call `fetch()` directly.
- The `withScrapeLock()` wrapper is mandatory at the entry of `scrapeDate()` so the CLI cannot bypass it by importing a deeper function.
- Add a Vitest test that registers two `scrapeDate()` calls in parallel via `Promise.all` and asserts the second one waits ≥5s (or that the lock blocks it).
- Add a test that asserts the user-agent string contains `(+http` (a contact link is present per ING-02).

**Warning signs:** Backfill completes in <1 hour for >5,000 historical dates → rate limiter is broken. 429/503 responses in `scrape_runs.error_message`.

### Pitfall 2: Silent scraper failure (PITFALLS.md #2, deal-breaker)
**What goes wrong:** Source site renames a CSS class; cheerio selector matches zero rows; `outcome='success', rows_ingested=0` writes for weeks; SLA never alerts because the baseline (also computed from this trickle of zeros) collapses with it.
**Why it happens:** The SLA baseline-computation logic uses today's row count without sanity-checking the baseline isn't itself near-zero.
**How to avoid:**
- D-25 already excludes `outcome='empty'` from the baseline's denominator. Reinforce: the SLA module MUST also alert if the 7-day baseline itself is < some absolute floor (e.g., baseline < 10 rows for >3 consecutive days = "the alert is broken, alert anyway"). Recommend: include this as a SECONDARY alert path in `lib/scraper/sla.ts`.
- Per-row Zod validation (D-07) catches schema drift on a per-row basis BEFORE rows are written.
- Snapshot-first (write `/data/snapshots/.../html.gz` before parse) means a parser fix can replay against historical HTML.
- Vitest test: feed a fixture that the parser silently turns into 0 rows — assert that the pipeline recognizes "non-empty HTML, zero parsed rows" as `outcome='parse_error'`, not `outcome='empty'`.

**Warning signs:** `parse_failures.row_index` count climbing after a week of zero failures. `scrape_runs.rows_ingested` drops to <30% of historic floor with no obvious off-season signal.

### Pitfall 3: TOS / robots.txt non-compliance leading to legal pressure (PITFALLS.md #6, deal-breaker)
**What goes wrong:** Operator never sends the courtesy email; site owner notices traffic and is hostile when first contacted.
**Why it happens:** ING-10/11 deliverables are templates that require human action; templates can sit unfilled.
**How to avoid:** D-21's `FIRST_SCRAPE_OK=false` default makes this a hard gate. Both the CLI and scheduler MUST check this env var BEFORE the rate-limiter, lock, kill-switch, or fetch — first thing in `scrapeDate()`. Test: with `FIRST_SCRAPE_OK` unset, the pipeline returns `outcome='killed'` (or a new `gated` outcome) and writes a clear log line.

**Warning signs:** Code path that bypasses the gate (e.g., a "test mode" that scrapes the live site without setting the secret).

### Pitfall 4: Data gaps that break downstream forecasts silently (PITFALLS.md #8)
**What goes wrong:** Scraper failed for 3 days; `scrape_runs` has 3 `http_error` rows; the SLA logic that excludes `empty` from baseline DOES include `http_error` (or vice versa) and the math goes wrong.
**Why it happens:** Decision D-23 says "where outcome='success'", so http_error is excluded from baseline by design. Confirm the SQL matches the spec exactly.
**How to avoid:** Vitest test for `computeBaseline(today)`:
- Setup: 7 historical `scrape_runs` rows with mixed outcomes — 4 success, 1 empty, 1 http_error, 1 killed.
- Assertion: baseline = average of the 4 success rows ONLY.

### Pitfall 5: Resume logic skipping dates that should retry (D-12 edge case)
**What goes wrong:** A date errored during yesterday's scheduler tick (`outcome='http_error'`); operator runs `npm run backfill --from=YYYY --to=YYYY` to retry; CLI's resume logic skips it because it interprets "any prior outcome row exists" as "done."
**Why it happens:** D-12 specifies resume INCLUDES retrying `{killed, http_error, parse_error}` — verify the SQL `WHERE outcome IN ('success','empty')` is the SKIP filter, not the RETRY filter.
**How to avoid:** Vitest test for `getDatesToScrape({from, to})`:
- Setup: ledger rows for 5 dates with outcomes `success, empty, http_error, parse_error, killed`.
- Assertion: returned set includes the 3 with `{http_error, parse_error, killed}` and EXCLUDES the 2 with `{success, empty}`.

### Pitfall 6: croner DST shift drops or duplicates the 23:00 PT tick
**What goes wrong:** On the spring-forward / fall-back day, a naive cron interpreter could fire twice or skip. Phase 0's existing scheduler already uses `timezone: 'America/Los_Angeles'` correctly; preserve this.
**How to avoid:** Confirm the new scrape job uses the same `timezone: 'America/Los_Angeles'` option from Phase 0's pattern. croner's docs explicitly handle IANA timezones [VERIFIED: Context7 /hexagon/croner].

### Pitfall 7: better-sqlite3 transaction inside an `await` chain
**What goes wrong:** `db.transaction()` in better-sqlite3 is **synchronous**. Wrapping it in `async`/`await` doesn't break it, but calling `await someAsyncOp()` INSIDE the transaction body would. The whole multi-row upsert must be sync.
**How to avoid:**
- All the data needed for the transaction must be in memory before the transaction starts (CatchRow[] array).
- The transaction body only calls `stmt.run(row)` — never any async work.
- Test: a row whose `species_count` is null (Zod rejected it earlier) shouldn't reach the transaction body; the entire `rows` array passed to `upsertMany` must be pre-validated.

### Pitfall 8: `parseArgs` returns `undefined` for missing `--from`
**What goes wrong:** Operator runs `npm run backfill -- --to 2024-12-31` (no `--from`); `parseArgs` returns `{ to: '2024-12-31', from: undefined }`; CLI silently scrapes nothing.
**How to avoid:** After `parseArgs`, validate via Zod or explicit guards: `if (!values.from || !values.to) { console.error('--from and --to required'); process.exit(2); }`. Test: invoke the CLI without `--from` and assert exit code 2.

## Code Examples

Verified patterns from current sources.

### scrapeDate(date) pipeline orchestration
```typescript
// src/lib/scraper/pipeline.ts
import { sourceQueue } from './rate-limiter';
import { withScrapeLock } from './lock';
import { firstScrapeAllowed } from './gate';
import { fetchPage } from './fetcher';
import { writeSnapshot } from './snapshot';
import { parsePage } from './parser';
import { upsertCatchReports } from '$lib/db/catchReports';
import { recordParseFailures } from '$lib/db/parseFailures';
import { recordScrapeRun } from '$lib/db/scrapeRuns';
import { upsertBoatsAndLandings } from '$lib/db/boats';
import { logger } from '$lib/server/logger';
import { scrapingEnabled } from '$lib/server/kill-switch';
import { today, toIsoDate } from '$lib/shared/dates';
import { randomUUID } from 'node:crypto';

export interface ScrapeResult {
  outcome: 'success' | 'empty' | 'http_error' | 'parse_error' | 'killed';
  rowsIngested: number;
  errorMessage?: string;
}

export async function scrapeDate(date: string, source: 'scheduler' | 'cli'): Promise<ScrapeResult> {
  const runId = randomUUID();
  const log = logger.child({ run_id: runId, source_date: date, source });
  const startedAt = new Date().toISOString();

  // 1. FIRST_SCRAPE_OK gate (D-21) — first thing, no side effects before
  if (!firstScrapeAllowed(process.env)) {
    log.warn('first_scrape_gate_blocked');
    await recordScrapeRun({ runId, runDate: date, startedAt, finishedAt: new Date().toISOString(),
                            outcome: 'killed', rowsIngested: 0, errorMessage: 'FIRST_SCRAPE_OK not set' });
    return { outcome: 'killed', rowsIngested: 0, errorMessage: 'FIRST_SCRAPE_OK not set' };
  }

  // 2. Kill switch (Phase 0)
  if (!scrapingEnabled(process.env)) {
    log.warn('kill_switch_blocked');
    await recordScrapeRun({ runId, runDate: date, startedAt, finishedAt: new Date().toISOString(),
                            outcome: 'killed', rowsIngested: 0, errorMessage: 'SCRAPER_ENABLED=false' });
    return { outcome: 'killed', rowsIngested: 0 };
  }

  // 3. Cross-process lock (D-13) — prevents CLI vs scheduler collision
  return withScrapeLock(async () => {
    // 4. Rate-limited fetch via shared queue
    let html: string;
    try {
      html = await sourceQueue.add(() => fetchPage(date)) as string;
    } catch (err) {
      log.error({ err }, 'fetch_failed');
      await recordScrapeRun({ runId, runDate: date, startedAt, finishedAt: new Date().toISOString(),
                              outcome: 'http_error', rowsIngested: 0, errorMessage: String(err) });
      return { outcome: 'http_error', rowsIngested: 0, errorMessage: String(err) };
    }

    // 5. Snapshot BEFORE parse (D-17) — preserve raw evidence
    await writeSnapshot(date, html);

    // 6. Parse with row-level quarantine (D-07)
    const { rows, failures } = parsePage(html);

    // 7. Detect "non-empty page, zero rows" — that's parse_error, not empty
    const looksLikeStructuredPage = html.includes("class='panel'") && html.includes('Fish Counts');
    if (rows.length === 0 && failures.length === 0 && !looksLikeStructuredPage) {
      log.warn('page_structure_unrecognized');
      await recordScrapeRun({ runId, runDate: date, startedAt, finishedAt: new Date().toISOString(),
                              outcome: 'parse_error', rowsIngested: 0,
                              errorMessage: 'page structure unrecognized — selectors may be stale' });
      return { outcome: 'parse_error', rowsIngested: 0 };
    }

    // 8. Upsert (transaction, sync inside)
    if (rows.length > 0) {
      await upsertBoatsAndLandings(rows);  // populates boats/landings tables, returns row[] with FKs filled
      await upsertCatchReports(rows);      // sync transaction inside the DAL
    }
    if (failures.length > 0) {
      await recordParseFailures(runId, failures);
    }

    const outcome = rows.length > 0 ? 'success' : 'empty';
    await recordScrapeRun({ runId, runDate: date, startedAt, finishedAt: new Date().toISOString(),
                            outcome, rowsIngested: rows.length });
    log.info({ outcome, rows: rows.length, failures: failures.length }, 'scrape_complete');
    return { outcome, rowsIngested: rows.length };
  });
}
```

### Cheerio parser walking the verified HTML structure
```typescript
// src/lib/scraper/parser.ts
import * as cheerio from 'cheerio';
import { CatchRowSchema, type CatchRow } from './schema';

export interface ParseFailure {
  row_index: number;
  raw_html_snippet: string;
  zod_error: string;
}

export function parsePage(html: string): { rows: CatchRow[]; failures: ParseFailure[] } {
  const $ = cheerio.load(html);
  const rows: CatchRow[] = [];
  const failures: ParseFailure[] = [];
  let rowIndex = -1;

  // Each landing is one panel; each panel contains a single table; each tbody > tr is a boat-trip.
  // Verified from live source 2026-04-23.
  $("div.panel").each((_, panelEl) => {
    const $panel = $(panelEl);

    // Skip pager panels (they contain no <table>)
    const $table = $panel.find("table.table-stripped").first();
    if ($table.length === 0) return;

    // Landing name: from the panel's <h2> ("H&M Landing Fish Counts for Today" or "...Fish Counts")
    // Or from first row's landing <a> — use the row anchor as it's more stable.
    $table.find("tbody > tr").each((_, trEl) => {
      rowIndex++;
      const $tr = $(trEl);
      const $tds = $tr.find("> td");
      if ($tds.length !== 3) {
        failures.push({
          row_index: rowIndex,
          raw_html_snippet: $.html($tr),
          zod_error: JSON.stringify([{ code: 'shape', message: `expected 3 <td>, got ${$tds.length}` }])
        });
        return;
      }

      // <td 0>: boat anchor + landing anchor + city
      const $boatCell = $tds.eq(0);
      const source_name = $boatCell.find("a > b").first().text().trim();
      const $landingAnchor = $boatCell.find("a[href*='/landings/']").first();
      const landing_source_name = $landingAnchor.text().trim();

      // <td 1>: "N Anglers<br><a>Trip Type</a>"
      const $tripCell = $tds.eq(1);
      const tripCellText = $tripCell.text();           // "30 Anglers Full Day Coronado Islands"
      const anglerMatch = tripCellText.match(/(\d+)\s+Anglers/i);
      const angler_count = anglerMatch ? parseInt(anglerMatch[1], 10) : NaN;
      const trip_type = $tripCell.find("a").first().text().trim();  // VERBATIM per D-08

      // <td 2>: "N Species, N Species, N Species <font>Released</font>"
      const $dockCell = $tds.eq(2);
      // Strategy: get text() (cheerio drops the <font> tag but keeps "Released"), then split on commas.
      // For each fragment, match leading number + remainder as species (which may end in "Released").
      const dockText = $dockCell.text();              // "4 Sand Bass, 30 Yellowtail, 9 Calico Bass, 3 Bonito"
      const fragments = dockText.split(',').map(s => s.trim()).filter(Boolean);

      for (const frag of fragments) {
        const m = frag.match(/^(\d+)\s+(.+)$/);
        if (!m) continue;  // skip non-conforming fragments (would also be caught by Zod below)
        const candidate = {
          source_name,
          landing_source_name,
          trip_type,
          angler_count,
          species: m[2],          // Zod transform lowercases + trims (D-03)
          species_count: parseInt(m[1], 10)
        };
        const result = CatchRowSchema.safeParse(candidate);
        if (!result.success) {
          failures.push({
            row_index: rowIndex,
            raw_html_snippet: $.html($tr),
            zod_error: JSON.stringify(result.error.issues)
          });
          continue;
        }
        rows.push(result.data);
      }
    });
  });

  return { rows, failures };
}
// Source: Cheerio API per Context7 /cheeriojs/cheerio + live source HTML probed 2026-04-23
```

### CLI entry point with parseArgs + auto-resume
```typescript
// scripts/backfill.ts — invoked as: npm run backfill -- --from YYYY-MM-DD --to YYYY-MM-DD [--resume] [--quiet]
import { parseArgs } from 'node:util';
import { scrapeDate } from '../src/lib/scraper/pipeline';
import { getDatesToScrape } from '../src/lib/db/scrapeRuns';
import { closeDb } from '../src/lib/db/client';

const { values } = parseArgs({
  options: {
    from:   { type: 'string' },
    to:     { type: 'string' },
    resume: { type: 'boolean', default: true },   // D-12: auto-resume is the default
    quiet:  { type: 'boolean', default: false }
  },
  strict: true,
  allowPositionals: false
});

if (!values.from || !values.to) {
  console.error('Usage: npm run backfill -- --from YYYY-MM-DD --to YYYY-MM-DD [--quiet]');
  process.exit(2);
}

const dates = await getDatesToScrape({ from: values.from, to: values.to, resume: values.resume });
let total = 0;
const startTime = Date.now();

for (const date of dates) {
  const result = await scrapeDate(date, 'cli');
  total += result.rowsIngested;
  if (!values.quiet) {
    // D-11: compact one-line per date with running totals
    process.stdout.write(`[${date}] ${result.rowsIngested} rows / ${total} total / ${result.outcome}\n`);
  }
}

const durationMin = ((Date.now() - startTime) / 60000).toFixed(1);
if (!values.quiet) {
  console.log(`\nBackfill complete: ${dates.length} dates, ${total} rows, ${durationMin} min`);
}
await closeDb();
process.exit(0);
// Source: Node 22 parseArgs verified live 2026-04-23
```

### SLA computation per D-23/D-24/D-25
```typescript
// src/lib/db/scrapeRuns.ts (excerpt)
export function computeSlaBaseline(today: string): number | null {
  // D-23: 7-day rolling avg of rows_ingested where outcome='success' AND run_date in [today-7, today-1]
  const row = db.prepare(`
    SELECT AVG(rows_ingested) as baseline
    FROM scrape_runs
    WHERE outcome = 'success'
      AND run_date >= date(?, '-7 days')
      AND run_date < date(?)
  `).get(today, today) as { baseline: number | null };
  return row.baseline;
}

export function totalRowsForDate(date: string): number {
  // D-24: total rows for source_date=today AFTER the scrape completes; not rows-this-run
  const row = db.prepare(`
    SELECT COUNT(*) as c FROM catch_reports WHERE source_date = ?
  `).get(date) as { c: number };
  return row.c;
}

// src/lib/scraper/sla.ts
import { sendOperatorAlert } from '$lib/alerts/operator';

export async function checkSlaAndAlert(date: string, outcome: string): Promise<void> {
  // D-25: only outcome='success' triggers SLA evaluation
  if (outcome !== 'success') return;
  const baseline = computeSlaBaseline(date);
  if (baseline == null || baseline < 5) return;  // not enough history; secondary "alert is broken" path is separate
  const total = totalRowsForDate(date);
  if (total < 0.5 * baseline) {
    await sendOperatorAlert({
      subject: `FishCount: row-count SLA breach for ${date}`,
      body: `Today total: ${total} rows. 7-day baseline: ${baseline.toFixed(1)} rows. Threshold (50%): ${(0.5 * baseline).toFixed(1)} rows.`
    });
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `request` npm package | `undici` / native `fetch` | Node 18+ ships undici (2022); `request` deprecated 2020 | Phase 1 uses native `fetch` exclusively (already established in Phase 0 `heartbeat.ts`) |
| `commander` / `yargs` for CLIs | `node:util parseArgs` (built-in) | Node 18.3+ stabilized parseArgs (2022) | Decision D-10 specifies parseArgs; saves a dependency |
| `node-cron` | `croner` | croner has supported IANA timezones since ~2022; node-cron's TZ story has been weak | Phase 0 already pinned croner; Phase 1 reuses |
| `axios` for HTTP retries | `p-retry` + native `fetch` | p-retry is the standard for retry logic divorced from the HTTP client | Phase 1 adopts p-retry for the source-site fetcher |
| Hand-rolled cheerio + manual Zod glue | `safeParse` returning `result.error.issues` (JSON-serializable) | Zod 4 (2025) stabilized the issue shape | `parse_failures.zod_error` stores `JSON.stringify(result.error.issues)` directly |
| File-based SQLite locks via `O_EXCL` | `proper-lockfile` | proper-lockfile has been the de facto Node solution since ~2018 | Decision D-13's file mutex |
| `request-promise` for HTML scraping | `cheerio` over `fetch` response text | Standard since ~2020 | Phase 1 follows |

**Deprecated/outdated:**
- **Drizzle ORM** in Phase 1 specifically (deferred per CONTEXT.md; not a project-wide rejection — may return in a later phase if read patterns warrant).
- **Smoke-test table** (`smoke_test`) from Phase 0 is replaced by real tables; planner decides whether to drop it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The source HTML structure (`div.panel > table.table-stripped > tbody > tr`, 3 `<td>`s per row) is stable across all historical dates. | Cheerio parser code example | Parser breaks on older HTML revisions. Mitigation: snapshot-first means we can replay; backfill against a wide date range will surface any drift early. Verified directly for 2009, 2015, 2024-01, 2024-08, 2026-04 dates only. |
| A2 | The only `<font>` qualifier in dock totals across all historical dates is `<font color="red">Released</font>`. | Parser strategy | Other qualifiers (e.g., "Tagged", "Bag Limit") would parse as part of the species name. Mitigation: `parse_failures` will catch malformed rows and surface the new qualifier for human review. Verified across 5 sample dates only. |
| A3 | Treating "Spiny Lobster Released" as its own species (lowercased "spiny lobster released") is acceptable for v1. | Parser strategy + D-03 | If operator wants to merge released-vs-kept under a single species, this is a UI-layer concern in Phase 2. CONTEXT.md does not specify; this is the simplest verbatim-storage interpretation per D-03's "lowercased, trimmed verbatim from source". |
| A4 | Source-site historical depth is at least 2009 (verified) but actual full backfill range may extend earlier. | Backfill scope | Backfill `--from` should default to or be advised at "2009-01-01"; planner may research deeper. Verified 2009-06-15 returns boat data; did not test pre-2009. |
| A5 | proper-lockfile's stale-detection (default 10s, recommend 60s for our use) is safe given Fly's SIGTERM-then-SIGKILL grace period. | Lock pattern | If a Node process is SIGKILLed mid-fetch and the next process starts within the stale window, the lock will block briefly then succeed. A 60s stale window matches Fly's 30s SIGTERM grace + 30s buffer. |
| A6 | The Phase 0 `src/lib/db/smoke.ts` file should be replaced (deleted) rather than augmented in Phase 1. | Project Structure | If smoke_test is referenced by any Phase 0 verification we missed, deleting breaks it. Mitigation: planner verifies no remaining references via `grep -r smoke_test`. |
| A7 | Native `fetch`'s timeout/abort semantics are sufficient when wrapped in `p-retry`; no need for `undici.Agent` tuning. | HTTP fetcher | At ≤1 req per 5s, connection pooling is irrelevant. If we ever parallelize (we won't per CONTEXT.md), this would matter. |
| A8 | The source site's `?date=YYYY-MM-DD` query parameter format is the canonical way to fetch historical dates (not `?select=MM-DD-YYYY`). | Fetcher URL construction | Both formats appear in the source's own internal links — the prev/next link uses `?date=YYYY-MM-DD` but the trip-type filter link uses `?select=MM-DD-YYYY`. Verified `?date=YYYY-MM-DD` returns parseable HTML for 2009, 2015, 2024, 2026 dates. |

## Open Questions

1. **How should "Released" qualifier be handled?**
   - What we know: "X Spiny Lobster, Y Spiny Lobster <font color="red">Released</font>" appears in real data. Cheerio's `.text()` will produce "Y Spiny Lobster Released" after stripping the `<font>` tag.
   - What's unclear: Should "Spiny Lobster Released" be its own species row in `catch_reports`, OR should the parser strip "Released" and merge into "Spiny Lobster", OR should it be a third column on `catch_reports` (e.g., `released INTEGER` alongside `species_count INTEGER`)?
   - Recommendation: For v1, store verbatim as separate species rows ("spiny lobster" and "spiny lobster released"). This preserves data; UI can merge in Phase 2 if needed. Document the interpretation in `lib/scraper/parser.ts` comments. Flag for operator decision in `01-DISCUSSION.md` if discuss-phase reopens.

2. **Should the `boats` table store the source-site profile URL (e.g., `/charter_boats/grande.php`)?**
   - What we know: Each `<tr>` includes a link `<a href="/charter_boats/grande.php"><b>Grande</b></a>` that BRW-02 will need for the "link back to source" requirement in Phase 2.
   - What's unclear: D-01 specifies `id, source_name, display_name, landing_id` — no URL column.
   - Recommendation: Add a `source_url TEXT` column to `boats` (planner discretion per CONTEXT.md "exact column types/widths"). Cost is one extra TEXT column; benefit is unblocking BRW-02 without a Phase 2 schema migration. Same applies to `landings.source_url`.

3. **Should the SLA secondary "baseline-too-low" alert fire?**
   - What we know: D-23 defines the baseline; D-25 says only `success` outcomes trigger it. But if 7 consecutive days return `outcome='success', rows_ingested=2` (parser silently breaking), the baseline collapses to 2 and today's 1-row scrape passes the 50% threshold.
   - What's unclear: CONTEXT.md doesn't address this scenario explicitly.
   - Recommendation: Add a SECONDARY alert path: "if baseline < 10 AND date is in fishing season (April–November)" → alert with body "your row-count SLA has likely been blind for N days". This is a defensive backstop. Planner discretion.

4. **What happens if the source site renames "H&M Landing" to "HM Landing" (no ampersand)?**
   - What we know: D-01/D-02 mandate `source_name UNIQUE` with separate `display_name`. A rename in the source would create a NEW landing/boat row (since `source_name` is the unique key).
   - What's unclear: Should we have a manual operator-driven "merge" tool? Or accept that as known data drift?
   - Recommendation: Out of scope for Phase 1. The schema design (D-01) accommodates the future case; operator can SQL-update `display_name` and write a migration script if it happens. Defer.

5. **Is there value in committing more than 3 HTML fixtures?**
   - What we know: D-09 specifies 3 minimum fixtures.
   - What's unclear: Should we also commit a date with ≥1 "Released" row, a date with 50+ boats (large page), and a date from each season?
   - Recommendation: Add at least 5 fixtures: typical, empty, parse-edge (mangled), released-qualifier (real production date with Released rows), and large-day (50+ boats to exercise transaction performance). Planner discretion.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime + tsx CLI | ✓ | 22.22.2 | — |
| npm | Package install | ✓ | (bundled with Node) | — |
| `sandiegofishreports.com` (HTTPS) | Live scrape | ✓ | HTTP 200 verified 2026-04-23 | Fixture replay for tests |
| `/data` Fly volume | DB + snapshots + lockfile | ✓ | Phase 0 provisioned | `process.env.DB_PATH` etc. allow local override for dev |
| `FIRST_SCRAPE_OK` Fly secret | Production scrape gate | ✗ (new) | — | Phase 1 ships set to `false`; operator flips to `true` |
| Litestream sidecar | Snapshot replication | ✓ | Phase 0 provisioned | Snapshots still write locally; replication is bonus |
| Resend API (email) | SLA alerts | ✓ | Phase 0 provisioned via `sendOperatorAlert()` | Alert emits to `parse_failures` log if Resend down |
| healthchecks.io | Heartbeat ping | ✓ | Phase 0 provisioned | Phase 0 already handles missing `HEALTHCHECKS_PING_URL` as no-op |

**Missing dependencies with no fallback:** None. All hard deps exist after Phase 0.

**Missing dependencies with fallback:**
- `FIRST_SCRAPE_OK` is intentionally absent until operator action — that's the gate's purpose.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.x |
| Config file | `/Users/zen/Documents/code/fish-count/vite.config.ts` (vitest config block; resolves `$lib` alias) |
| Quick run command | `npm run test:run -- tests/unit/scraper/parser.test.ts` |
| Full suite command | `npm run test:run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ING-01 | Nightly scrape tick fires at correct schedule | unit | `npm run test:run -- tests/scheduler/scrape-tick.test.ts` | ❌ Wave 0 |
| ING-02 | UA contains `+http` (contact link) and robots.txt is checked | unit | `npm run test:run -- tests/unit/scraper/fetcher.test.ts` | ❌ Wave 0 |
| ING-03 | Two queued fetches are ≥5s apart | unit | `npm run test:run -- tests/unit/scraper/rate-limiter.test.ts` | ❌ Wave 0 |
| ING-04 | Idempotent upsert: same date scraped twice → same row count | unit | `npm run test:run -- tests/unit/db/catchReports.test.ts` | ❌ Wave 0 |
| ING-05 | Successful fetch writes `/data/snapshots/YYYY/MM/DD.html.gz` | unit | `npm run test:run -- tests/unit/scraper/snapshot.test.ts` | ❌ Wave 0 |
| ING-06 | Malformed row writes to `parse_failures`, valid rows still ingest | unit | `npm run test:run -- tests/unit/scraper/parser.test.ts` (with `parse-edge.html` fixture) | ❌ Wave 0 |
| ING-07 | Today total < 50% baseline → `sendOperatorAlert` called once with subject + body | unit | `npm run test:run -- tests/unit/scraper/sla.test.ts` | ❌ Wave 0 |
| ING-08 | Backfill CLI parses args + iterates dates + writes rows | integration | `npm run test:run -- tests/unit/scripts/backfill.test.ts` | ❌ Wave 0 |
| ING-09 | scrape_runs ledger row written for every outcome including `empty` | unit | `npm run test:run -- tests/unit/db/scrapeRuns.test.ts` | ❌ Wave 0 |
| ING-10 | TOS-REVIEW.md template exists | manual | `test -f .planning/research/TOS-REVIEW.md` | ❌ Wave 0 |
| ING-11 | OUTREACH-EMAIL.md draft exists | manual | `test -f .planning/research/OUTREACH-EMAIL.md` | ❌ Wave 0 |
| STO-01 | catch_reports CREATE TABLE matches D-05 column list | unit | `npm run test:run -- tests/unit/db/migrations.test.ts` | ❌ Wave 0 |
| STO-02 | boats + landings tables exist with `source_name UNIQUE` + `display_name` | unit | `npm run test:run -- tests/unit/db/migrations.test.ts` | ❌ Wave 0 |
| STO-03 | DAL boundary: no SQL string literals outside `src/lib/db/` | static | `! grep -rE "(SELECT|INSERT|UPDATE|DELETE)\\b" src/lib/scraper src/lib/server src/lib/alerts src/lib/shared 2>/dev/null` | ✅ (grep is built-in) |
| STO-04 | All `YYYY-MM-DD` strings in scraper come from `dates.ts` | static | `! grep -rE "new Date\\(\\)\\.toISOString" src/lib/scraper src/lib/db scripts/` | ✅ (grep is built-in) |
| STO-05 | A successful-but-empty scrape writes `outcome='empty'` to scrape_runs | unit | `npm run test:run -- tests/unit/scraper/pipeline.test.ts` (with `empty-day.html` fixture) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:run -- <test-file-touched>` (specific test file)
- **Per wave merge:** `npm run test:run` (full vitest suite — typically <5s for this codebase size)
- **Phase gate:** `npm run test:run` green + `npm run check` (svelte-check) green + `npm run lint` green before `/gsd-verify-work`

### Wave 0 Gaps

The vitest framework is already installed and configured (Phase 0). The `tests/fixtures/` directory exists with `.gitkeep`. Wave 0 must add:

- [ ] `tests/fixtures/scraper/2024-08-15-typical.html` — captured live from source-site for replay
- [ ] `tests/fixtures/scraper/2024-08-15-typical.expected.json` — paired expected CatchRow[] output
- [ ] `tests/fixtures/scraper/2026-12-25-empty-day.html` — captured live; all panels present, zero `<tr>` rows
- [ ] `tests/fixtures/scraper/2024-01-15-released-qualifier.html` — date with "Spiny Lobster Released" rows
- [ ] `tests/fixtures/scraper/parse-edge-mangled.html` — synthetic; one malformed row (e.g., missing `<td>`) to exercise quarantine
- [ ] `tests/unit/db/.gitkeep` (directory does not yet exist)
- [ ] `tests/unit/scraper/.gitkeep` (directory does not yet exist)
- [ ] `tests/unit/scripts/.gitkeep` (directory does not yet exist)
- [ ] Test helper: `tests/helpers/in-memory-db.ts` exposing `openTestDb()` that returns a `:memory:` better-sqlite3 instance with the Phase 1 schema applied — enables DB-per-test isolation without disk I/O. The helper must be importable from any test in `tests/unit/db/` and `tests/unit/scraper/`.
- [ ] `tests/helpers/fetch-stub.ts` exposing `stubFetch(html, status?)` that monkey-patches `globalThis.fetch` for the test scope and restores it on teardown — enables `tests/unit/scraper/fetcher.test.ts` and `tests/unit/scraper/pipeline.test.ts`.

**Invariants the test suite MUST verify (the load-bearing list):**

1. **Idempotency invariant (ING-04):** `scrapeDate(D, 'cli')` called twice → exactly the same row count in `catch_reports WHERE source_date = D`. Run a fixture replay twice through the pipeline; assert `COUNT(*)` is identical.
2. **DAL boundary invariant (STO-03):** No SQL keywords in `src/lib/scraper/`, `src/lib/server/`, `src/lib/alerts/`, `src/lib/shared/`, or `scripts/`. Static grep test (no runtime cost).
3. **Single-date-producer invariant (STO-04):** No `new Date().toISOString()` or `Date.now()`-based date string production outside `src/lib/shared/dates.ts`. Static grep test.
4. **Rate-limit invariant (ING-03):** Two consecutive `sourceQueue.add(fn)` calls record at least 5000ms between their start times. `vi.useFakeTimers()` + `await sourceQueue.onIdle()` + assert.
5. **Quarantine invariant (ING-06, D-07):** Parsing a fixture with N valid rows and 1 malformed row produces N entries in `rows` and 1 entry in `failures` — never throws.
6. **Outcome enum invariant (D-04):** Every code path through `scrapeDate()` writes exactly ONE `scrape_runs` row with `outcome ∈ {success, empty, http_error, parse_error, killed}`. No code path is allowed to skip the ledger write.
7. **First-scrape gate invariant (ING-10/11, D-21):** With `FIRST_SCRAPE_OK` unset, no outbound `fetch()` is attempted. Spy on `globalThis.fetch`; assert never called.
8. **Kill-switch ordering invariant (carries over from Phase 0):** With `SCRAPER_ENABLED=false`, no outbound `fetch()` is attempted (gate check happens before fetcher import is even hot). Reuse the Phase 0 ordering test pattern.
9. **SLA threshold invariant (ING-07, D-25):** Given `outcome='success'` AND `total_for_date < 0.5 * baseline`, `sendOperatorAlert` is called exactly once. Given `outcome='empty'`, it is NEVER called regardless of row count.
10. **Resume invariant (D-12):** `getDatesToScrape` returns ONLY dates with no ledger entry OR with outcome ∈ {killed, http_error, parse_error}; never returns dates with outcome ∈ {success, empty}.

**Signals the test suite MUST sample (Nyquist Dimension 8 coverage):**

- **Schema shape signal:** `PRAGMA table_info(catch_reports)` matches D-05 column list exactly. Run after `migrations.run()` in a `:memory:` DB.
- **Index existence signal:** `PRAGMA index_list(catch_reports)` includes the `UNIQUE(source_date, boat_id, trip_type, species)` index from D-06.
- **HTTP request shape signal:** stub fetch records `(url, headers)`; assert `url` matches `https://www.sandiegofishreports.com/dock_totals/boats.php?date=YYYY-MM-DD` and `headers['user-agent']` contains `+http`.
- **Snapshot file signal:** after a successful pipeline run, `fs.existsSync('/tmp/test-snapshots/2024/08/15.html.gz')` is true and gunzipped content matches the input HTML byte-for-byte.
- **Ledger durability signal:** after `outcome='killed'` write, `SELECT COUNT(*) FROM scrape_runs WHERE outcome='killed'` increments by exactly 1.
- **Croner schedule signal:** `new Cron('0 23 * * *', { timezone: 'America/Los_Angeles' }).nextRun()` returns a Date whose hour-in-PT is 23. Use `Intl.DateTimeFormat` to verify.

**Coverage expectations:**
- `src/lib/db/`: 100% line coverage (small surface, easy to cover, load-bearing).
- `src/lib/scraper/parser.ts`: 100% branch coverage on the per-row Zod path (every failure mode has a test).
- `src/lib/scraper/pipeline.ts`: 100% branch coverage on the outcome-determining branches (success / empty / http_error / parse_error / killed).
- `src/lib/scraper/sla.ts`: 100% branch coverage on the alert-fire conditions.
- `scripts/backfill.ts`: integration test exercising end-to-end with stubbed fetch + in-memory DB.

## Project Constraints (from CLAUDE.md)

The following are project-level directives that downstream agents MUST honor. Treat with the same authority as locked CONTEXT.md decisions.

- **Polite scraping (non-negotiable rule 1):** Rate limit ≤ 1 req per 5s shared between backfill + incremental. Custom User-Agent with contact link. Honor `robots.txt`. Review TOS in writing before first production scrape. Email source-site operator proactively. **Phase 1 covers all of these via D-13, D-20, D-21.**
- **Silent-failure detection (non-negotiable rule 2):** Row-count SLA alert (<50% of rolling 7-day average fires). Freshness alert (>36h = dead-man's switch). Zod validation on every record. Gzipped raw-HTML snapshots for replay. **Phase 1 covers row-count + Zod + snapshot; freshness alert is Phase 0 OPS-04 (already shipped).**
- **DAL boundary:** ONLY `src/lib/db/` issues SQL. Verified by static grep test in Validation Architecture above.
- **Idempotent upsert on `(date, boat_id, trip_type, species)`:** Verified by D-06 schema + Pattern 2 code example.
- **Precompute forecasts; serve cheap reads:** Phase 1 has no read paths; this rule applies to Phase 2+. No conflict.
- **All dates `YYYY-MM-DD` America/Los_Angeles via `lib/shared/dates.ts`:** Verified by static grep test (no `new Date().toISOString()` outside that module).
- **Backfill is a CLI, not a cron route:** Verified by D-10 (script under `scripts/`) and the architecture diagram.
- **Domain language verbatim:** Trip types, landings, species stored as source emits them. D-05 + D-08 enforce this for `trip_type`. Species is lowercased+trimmed per D-03 (verbatim text, just normalized whitespace/case).
- **Anti-features:** Phase 1 builds none of them. Confirmed.
- **Hard tech rejections:** Phase 1 uses none of {Puppeteer, Playwright, Prisma, Recharts, Chart.js, SendGrid, Vercel, BullMQ, Redis}. Confirmed.

## Sources

### Primary (HIGH confidence)
- Context7 `/wiselibs/better-sqlite3` — prepared statements, `db.transaction()`, `db.pragma()` patterns
- Context7 `/hexagon/croner` — `protect: true` overlap protection, `timezone` IANA option, `catch` error handling
- Context7 `/sindresorhus/p-queue` — `intervalCap` + `interval` + `concurrency` constructor options, `onRateLimit` event
- Context7 `/sindresorhus/p-retry` — `AbortError` for permanent-failure short-circuit, `onFailedAttempt` callback, `minTimeout/maxTimeout/factor/randomize`
- Context7 `/colinhacks/zod` — `safeParse`, `result.error.issues` array shape (JSON-serializable)
- Context7 `/cheeriojs/cheerio` — `$(selector).each()`, `.find()`, `.text()`, `.attr()` jQuery-style API
- Context7 `/moxystudio/node-proper-lockfile` — `lock()`, `release()`, `stale` option, `realpath` option
- Live source-site probe 2026-04-23: `curl https://www.sandiegofishreports.com/dock_totals/boats.php?date=YYYY-MM-DD` for 2009-06-15, 2015-08-15, 2024-01-15, 2024-08-15, 2026-04-23, 2026-12-25 — verified HTML structure, robots.txt (`Disallow:` empty), HTTP 200 across all dates
- Live npm registry 2026-04-23: `npm view <pkg> version` for cheerio (1.2.0), zod (4.3.6), p-queue (9.1.2), p-retry (8.0.0), proper-lockfile (4.1.2), robots-parser (3.0.1), tsx (4.21.0), better-sqlite3 (12.9.0), croner (10.0.1)
- Existing Phase 0 source files (read directly): `src/lib/db/smoke.ts`, `src/lib/server/scheduler.ts`, `src/lib/server/kill-switch.ts`, `src/lib/server/heartbeat.ts`, `src/lib/server/logger.ts`, `src/lib/alerts/operator.ts`, `src/lib/server/startup.ts`, `src/lib/server/shutdown.ts`, `src/lib/shared/dates.ts`, `src/hooks.server.ts`, `package.json`, `vite.config.ts`, `tests/scheduler/tick-ordering.test.ts`, `tests/ops/operator-alert.test.ts`

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` (verified 2026-04-22) — stack pinning, ethics rules, version compatibility table
- `.planning/research/ARCHITECTURE.md` (verified 2026-04-22) — modular monolith pattern, DAL boundary rationale, idempotent-upsert pattern
- `.planning/research/PITFALLS.md` (verified 2026-04-22) — silent-failure detection, polite scraping, gap-aware aggregation
- Node.js 22 docs (`util.parseArgs`) — verified live via `node -e` test 2026-04-23

### Tertiary (LOW confidence)
- None used. All claims tied to either Context7, live source probe, or live registry/local-file verification.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library pinned by version was verified on npm 2026-04-23 and either has live Context7 docs or is already in `package.json` from Phase 0.
- Architecture: HIGH — patterns are direct adaptations of Phase 0's established conventions (kill-switch ordering, heartbeat bookends, DAL boundary, single date producer); no novel architecture introduced.
- Pitfalls: HIGH — cross-referenced against PITFALLS.md (project research) and verified against the live source HTML structure for parser-specific risks.
- Source HTML structure: HIGH — directly probed via curl across 5 sample dates spanning 2009–2026.
- Source historical depth: MEDIUM — verified back to 2009-06-15; pre-2009 not tested. Backfill `--from` lower bound is an open question for the operator.
- "Released" qualifier handling: MEDIUM (assumption A2/A3) — verified the qualifier exists; correct interpretation (own species vs. merge) is an OPEN QUESTION.

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (30 days; library versions and source HTML structure are stable; re-verify if execution slips beyond this)
