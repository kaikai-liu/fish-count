# Phase 1: Ingest + Store - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-23
**Phase:** 01-ingest-store
**Areas discussed:** Schema design · Parser robustness · Backfill CLI UX · Scheduled scrape timing · Raw HTML snapshot storage · TOS review + courtesy email · Row-count SLA details

---

## Schema design

### Q1: Boats + landings normalization

| Option | Description | Selected |
|--------|-------------|----------|
| Surrogate int PK + verbatim source_name + canonical display_name | boats(id, source_name UNIQUE, display_name, landing_id). FK by boat_id. Stable IDs on rename. | ✓ |
| Natural-key slug PK (source_name slugified) | Simpler; source rename breaks historical FKs. | |
| Denormalized — store boat/landing strings directly on catch_reports | Violates STO-02. | |

**Selected:** Surrogate int PK + verbatim source_name + canonical display_name.

### Q2: Species representation

| Option | Description | Selected |
|--------|-------------|----------|
| Column on catch_reports, verbatim from source | No species table; CLAUDE.md canon is display-layer knowledge. | ✓ |
| Species table with FK | Allows per-species metadata later; heavier now. | |

**Selected:** Column on catch_reports, verbatim.

### Q3: scrape_runs vs scrape_attempts

| Option | Description | Selected |
|--------|-------------|----------|
| Single scrape_runs table with outcome enum | 'empty' outcome IS the STO-05 tried-but-no-rows record. | ✓ |
| Two tables: scrape_runs (operational) + scrape_attempts (semantic) | Cleaner separation but duplicate data. | |

**Selected:** Single scrape_runs table with outcome enum `{success, empty, http_error, parse_error, killed}`.

### Q4: catch_reports indexes

| Option | Description | Selected |
|--------|-------------|----------|
| UNIQUE(date, boat_id, trip_type, species) + (date, species) + (boat_id, date) | Unique doubles as upsert key; others cover trip picker + boat history. | ✓ |
| Just UNIQUE, add others when slow | Premature-indexing avoidance. | |

**Selected:** Full index set.

---

## Parser robustness

### Q5: Row-level Zod failure behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Quarantine the bad row, log it, continue the rest of the page | Partial data beats no data; parse_failures table. | ✓ |
| Reject the entire page — mark scrape_run outcome as parse_error | Single bad row kills day's ingest. | |
| Quarantine AND alert operator if >N rows fail per scrape | Option 1 + threshold alert. | |

**Selected:** Quarantine + continue.

### Q6: Unknown trip_type handling

| Option | Description | Selected |
|--------|-------------|----------|
| Accept verbatim — CLAUDE.md never-normalize rule | No allow-list; novelty is data. | ✓ |
| Strict allow-list from CLAUDE.md | Rejects new trip types until code change. | |
| Accept verbatim + log WARN when outside CLAUDE.md list | Middle ground. | |

**Selected:** Accept verbatim.

### Q7: HTML fixture strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Commit real scraped HTML to tests/fixtures/scraper/ | Regression tests catch markup drift. | ✓ |
| Generate synthetic HTML from templates | More portable; doesn't catch real regressions. | |
| Mix — real + synthetic | Real for typical/empty/edge; synthetic for unicode/mangled. | |

**Selected:** Commit real scraped HTML.

---

## Backfill CLI UX

### Q8: Invocation shape

| Option | Description | Selected |
|--------|-------------|----------|
| npm script with flags (native parseArgs, tsx) | Zero dep; ships as package.json script. | ✓ |
| Dedicated bin via commander/yargs | Nicer help, extra dependency. | |
| Interactive prompts | Friendlier; blocks CI. | |

**Selected:** npm script with flags.

### Q9: Progress reporting

| Option | Description | Selected |
|--------|-------------|----------|
| Compact one-line-per-date with running totals | Pipe-safe, grep-friendly, `--quiet` for CI. | ✓ |
| Rich progress bar | Fails in CI/pipes. | |
| Structured JSON logs | Composable; needs pino-pretty for humans. | |

**Selected:** Compact one-line-per-date.

### Q10: Resume semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect from scrape_runs | Skip success/empty, retry killed/http_error/parse_error. No flag needed. | ✓ |
| Explicit --resume flag required | Safety-first; annoying for routine use. | |
| Default re-scrape, --skip-completed | Simple but wastes hours + violates politeness. | |

**Selected:** Auto-detect.

### Q11: Rate-limit coordination (backfill + nightly scheduled)

| Option | Description | Selected |
|--------|-------------|----------|
| Shared p-queue + file-based mutex at /data/scrape.lock | Enforces ≤1 req/5s across both invokers. | ✓ |
| In-app only; assume nightly won't overlap | Minimalism vs defense. | |
| Scheduler bails if backfill is running | Tomorrow's run makes it up (idempotent). | |

**Selected:** Shared p-queue + file-based mutex.

---

## Scheduled scrape timing

### Q12: Nightly run time

| Option | Description | Selected |
|--------|-------------|----------|
| 11:00 PM America/Los_Angeles | 2–3h buffer after dock return; polite off-hours. | ✓ |
| 8:00 PM PT | Fresher data; some boats not in yet. | |
| 2:00 AM PT | Quiet source; next-morning availability only. | |

**Selected:** 23:00 America/Los_Angeles.

### Q13: Date scope per run

| Option | Description | Selected |
|--------|-------------|----------|
| Today only | Single fetch; tomorrow picks up late-reporters via its own run. | ✓ |
| Today + yesterday | Two fetches; defensive against late-reporting boats. | |
| Today + last 7 days | Most defensive; 7 fetches. | |

**Selected:** Today only.

### Q14: Missed-run catch-up

| Option | Description | Selected |
|--------|-------------|----------|
| Scheduler runs current date only; operator uses CLI to fill gaps | Dead-man's switch alerts operator; keep scheduler simple. | ✓ |
| Scheduler auto-backfills missed 7 days | Automated recovery, capped. | |
| Scheduler auto-backfills all missing | Violates politeness during recovery. | |

**Selected:** Operator-driven CLI catch-up.

---

## Raw HTML snapshot storage

### Q15: Storage location

| Option | Description | Selected |
|--------|-------------|----------|
| Local /data/snapshots/YYYY/MM/DD.html.gz | Shared with Litestream; free B2 replication. | ✓ |
| Direct to B2 (bypass local disk) | Adds upload-failure mode. | |
| SQLite BLOB in scrape_runs.raw_html_gz | Replication churn. | |

**Selected:** Local volume + Litestream.

### Q16: Retention policy

| Option | Description | Selected |
|--------|-------------|----------|
| Forever | ~36MB/year on 1GB volume; 28-year runway. | ✓ |
| 1 year rolling | Adds retention cron. | |
| 90 days rolling | Too aggressive — replay is ING-05's main value. | |

**Selected:** Forever.

### Q17: Filename convention

| Option | Description | Selected |
|--------|-------------|----------|
| /data/snapshots/YYYY/MM/DD.html.gz | Date-partitioned; idempotent re-scrape overwrites. | ✓ |
| /data/snapshots/YYYY-MM-DD__{run_id}.html.gz | Preserves history of each attempt. | |
| /data/snapshots/YYYY-MM-DD__{sha256}.html.gz | Content-hash dedupe; over-engineered. | |

**Selected:** Date-only hierarchical.

---

## TOS review + courtesy outreach

### Q18: What phase delivers vs operator action

| Option | Description | Selected |
|--------|-------------|----------|
| Phase delivers artifact + draft; operator reviews + sends; gated by FIRST_SCRAPE_OK Fly secret | TOS-REVIEW.md + OUTREACH-EMAIL.md templates; secret gate prevents premature scrape. | ✓ |
| Artifact templates only; no hard gate | Honor-system; violates spirit. | |
| Gate by file-exists check with reviewed_on frontmatter | In-repo gate (no env var). | |

**Selected:** Artifact + draft + Fly secret gate.

### Q19: Timing relative to code landing

| Option | Description | Selected |
|--------|-------------|----------|
| Code lands → TOS review + email → wait for reply or 1 week silence → flip gate → first scrape | Phase verification doesn't need live prod scrape. | ✓ |
| Code lands → first scrape immediately → concurrent email | Violates CLAUDE.md "proactively". | |
| Code lands → staging copy → operator OK → prod | Overkill; needs staging fixture. | |

**Selected:** Email-and-wait pattern, phase verification without live prod scrape.

---

## Row-count SLA

### Q20: Baseline window

| Option | Description | Selected |
|--------|-------------|----------|
| 7-day rolling avg excluding dead-zeros | outcome='success' only; off-season doesn't poison baseline. | ✓ |
| Plain 7-day rolling including zeros | Simpler but off-season false alarms. | |
| Day-of-week-adjusted (4-week lookback) | More accurate; needs history. | |

**Selected:** 7-day rolling, exclude dead-zeros.

### Q21: Numerator (today's rows)

| Option | Description | Selected |
|--------|-------------|----------|
| Total rows for source_date=today after scrape | Stable: idempotent re-scrape doesn't false-alarm. | ✓ |
| Rows inserted by this run only | Noisy; re-scrapes correctly insert 0. | |

**Selected:** Total-for-date.

### Q22: Empty-day handling

| Option | Description | Selected |
|--------|-------------|----------|
| 'empty' outcome does NOT trigger SLA alert | Only success-but-suspiciously-low fires; OPS-04 catches no-run. | ✓ |
| 'empty' triggers if N consecutive days | Adds dimension; more complex. | |
| 'empty' always triggers | Off-season fatigue. | |

**Selected:** Empty does not trigger; only low-success-row does.

---

## Claude's Discretion

(Captured in CONTEXT.md `<decisions>` → Claude's Discretion)

- DAL repository module naming
- Parser module structure (single file vs split)
- Drizzle ORM timing (now vs Phase 2 refactor)
- Column type widths
- Location of p-queue instance

## Deferred Ideas

(Captured in CONTEXT.md `<deferred>` — 6 items)
- Snapshot retention cron (revisit at volume 80%)
- Day-of-week-adjusted SLA baseline (revisit in Phase 4)
- Drizzle ORM migration (revisit in Phase 2)
- Snapshot content-hash dedupe
- Separate `scrape_attempts` table
- Multi-date scheduled scrape (today + yesterday)
