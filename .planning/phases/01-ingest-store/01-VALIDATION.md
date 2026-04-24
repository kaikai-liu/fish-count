---
phase: 1
slug: ingest-store
status: ready-for-execution
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-23
---

# Phase 1 — Validation Strategy

> Per-phase validation contract. Populated at plan time by Plan 01-09 revision.
> `wave_0_complete` flips to `true` and Sign-Off checkboxes tick after Plan 01-09 Task 3 runs post-execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.1.x (Phase 0) |
| **Config file** | `vite.config.ts` (vitest section) |
| **Quick run command** | `npm run test:run -- <file>` |
| **Full suite command** | `npm run test:run` |
| **Estimated runtime** | ~30-60 seconds (pipeline + end-to-end tests dominate) |

---

## Sampling Rate

- **After every task commit:** `npm run test:run -- <touched-file>`
- **After every plan wave:** `npm run test:run`
- **Before `/gsd-verify-work`:** full suite + `npm run check` + `npm run lint` all green
- **Max feedback latency:** ~60 seconds (rate-limiter + end-to-end tests slow the full suite; individual tests <5s)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement(s) | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|----------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01-01 | 1 | STO-01, STO-02, STO-05, ING-09 | T-01-03 | DDL idempotent across reruns; `scrape_runs.outcome` CHECK constraint blocks unknown values | unit | `npm run test:run -- tests/unit/db/migrations.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01-01 | 1 | STO-01, STO-02, ING-04, ING-06 | T-01-01, T-01-17 | Parameterized upsert on `(date, boat_id, trip_type, species)`; sync transaction body (better-sqlite3 invariant) | unit | `npm run test:run -- tests/unit/db/` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01-01 | 1 | STO-03, STO-04, STO-05, ING-09 | T-01-04, T-01-05 | DAL-boundary static grep enforces SQL keywords only in `src/lib/db/`; parameterized date-range query | unit + static | `npm run test:run -- tests/unit/db/scrapeRuns.test.ts tests/unit/db/dal-boundary.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 01-02 | 2 | ING-01, ING-03, ING-10 | T-01-07, T-01-10 | Fail-closed gate (`FIRST_SCRAPE_OK=true` required); proper-lockfile single-writer mutex; 5s queue spacing | unit | `npm run test:run -- tests/unit/scraper/gate.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-02 | 01-02 | 2 | ING-02 | T-01-08 | User-Agent contains `+http` contact URL; AbortError on 4xx; robots.txt cache check | unit | `npm run test:run -- tests/unit/scraper/fetcher.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-03 | 01-02 | 2 | ING-03 | T-01-07 | Rate limiter enforces ≥5s between queued fetches (real-time assertion) | unit | `npm run test:run -- tests/unit/scraper/rate-limiter.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-01 | 01-03 | 2 | ING-06 | T-01-13 | 4 fixtures committed (typical, empty-day, parse-edge, released-qualifier) + expected.json + Zod schema with D-03 species transform | static | `test -f src/lib/scraper/schema.ts && test -f tests/fixtures/scraper/2024-08-15-typical.expected.json` | ❌ W0 | ⬜ pending |
| 01-03-02 | 01-03 | 2 | ING-06 | T-01-13, T-01-17 | Parser never throws on malformed rows; per-row Zod `safeParse` + quarantine to `parse_failures` | unit | `npm run test:run -- tests/unit/scraper/parser.test.ts` | ❌ W0 | ⬜ pending |
| 01-04-01 | 01-04 | 1 | ING-05 | T-01-18, T-01-21 | gzip round-trip byte-identical; `/^\d{4}-\d{2}-\d{2}$/` regex rejects traversal; idempotent overwrite | unit | `npm run test:run -- tests/unit/scraper/snapshot.test.ts` | ❌ W0 | ⬜ pending |
| 01-05-01 | 01-05 | 3 | ING-01, ING-02, ING-04, ING-06 | T-01-22, T-01-23 | Gate order (FIRST_SCRAPE_OK → SCRAPER_ENABLED → lock) enforced in pipeline; exactly one `scrape_runs` row per date | unit + grep | `grep -nE "firstScrapeAllowed\|scrapingEnabled\|withScrapeLock" src/lib/scraper/pipeline.ts` (monotonic line numbers) | ❌ W0 | ⬜ pending |
| 01-05-02 | 01-05 | 3 | ING-01 | T-01-22 | Scheduler tick at 23:00 PT with croner `protect:true`; kill-switch ordering ahead of work | unit | `npm run test:run -- tests/scheduler/` | ❌ W0 | ⬜ pending |
| 01-05-03 | 01-05 | 3 | ING-04, ING-05, ING-06, ING-09 | T-01-22, T-01-23, T-01-24 | End-to-end pipeline covers 7 validation invariants (idempotency, ledger, snapshot-before-parse, etc.) | unit | `npm run test:run -- tests/unit/scraper/pipeline.test.ts` | ❌ W0 | ⬜ pending |
| 01-06-01 | 01-06 | 4 | ING-03, ING-08 | T-01-28, T-01-29 | CLI uses relative imports only (no `$lib` / `$app`); no SvelteKit boot; Zod arg validation | static + grep | `grep -cE "from '\\$lib\|from '\\$app" scripts/backfill.ts` returns 0 | ❌ W0 | ⬜ pending |
| 01-06-02 | 01-06 | 4 | ING-08 | T-01-29, T-01-30, T-01-31 | Arg validation + D-12 resume semantics + `FIRST_SCRAPE_OK=false` halts the CLI | unit | `npm run test:run -- tests/unit/scripts/backfill.test.ts` | ❌ W0 | ⬜ pending |
| 01-07-01 | 01-07 | 4 | ING-07 | T-01-33, T-01-37 | Pure `shouldAlert` + async `checkSlaAndAlert`; scheduler wired with non-fatal try/catch | unit + grep | `grep -c "checkSlaAndAlert" src/lib/server/scheduler.ts` returns ≥2 | ❌ W0 | ⬜ pending |
| 01-07-02 | 01-07 | 4 | ING-07 | T-01-34 | D-25 denominator excludes `http_error`/`parse_failure`; <50% baseline threshold fires | unit | `npm run test:run -- tests/unit/scraper/sla.test.ts` | ❌ W0 | ⬜ pending |
| 01-08-01 | 01-08 | 1 | ING-10 | T-01-40 | TOS review template with 7 required sections incl. sign-off block | static | `grep -c "## Sign-off" .planning/research/TOS-REVIEW.md` returns 1 | ❌ W0 | ⬜ pending |
| 01-08-02 | 01-08 | 1 | ING-11 | T-01-38 | Outreach email draft with opt-out wait period + halt-on-reply clause | static | `grep -c "reply.*halt" .planning/research/OUTREACH-EMAIL.md` returns ≥1 | ❌ W0 | ⬜ pending |
| 01-08-03 | 01-08 | 1 | ING-10, ING-11 | T-01-39, T-01-42 | Runbook with pre-flight + `FIRST_SCRAPE_OK=true` flip + rollback procedure | static | `grep -c "fly secrets set FIRST_SCRAPE_OK=true" .planning/research/FIRST-SCRAPE-RUNBOOK.md` returns 1 | ❌ W0 | ⬜ pending |
| 01-09-01 | 01-09 | 5 | STO-04 | T-01-43 | Static grep forbids `.toISOString().slice(0,10)` / `.split('T')[0]` outside `src/lib/shared/dates.ts` | unit + static | `npm run test:run -- tests/unit/shared/dates-boundary.test.ts` | ❌ W0 | ⬜ pending |
| 01-09-02 | 01-09 | 5 | ING-01, ING-04, ING-05, ING-08, ING-09 | T-01-22, T-01-23 | End-to-end 3-date backfill + D-12 resume (zero refetches) + mixed success/http_error outcome | unit | `npm run test:run -- tests/unit/scraper/end-to-end.test.ts` | ❌ W0 | ⬜ pending |
| 01-09-03 | 01-09 | 5 | — | T-01-44 | Post-execution: flip `wave_0_complete: true` + tick Sign-Off checkboxes | static | `grep -c "wave_0_complete: true" .planning/phases/01-ingest-store/01-VALIDATION.md` returns 1 | N/A | ⬜ pending |
| 01-09-04 | 01-09 | 5 | — | T-01-43, T-01-44, T-01-45 | Full test suite + `npm run check` + `npm run lint` all exit 0 (phase gate) | integration | `npm run test:run && npm run check && npm run lint` | N/A | ⬜ pending |

*Status values:* `⬜ pending` (not yet executed) → `🟡 running` → `🟢 green` → `🔴 red`. Executors update to `🟢 green` when their task's automated command exits 0, after commit.

*File Exists legend:* `✅` = file/fixture checked in; `❌ W0` = will be created in Wave 0 of that plan's execution; `N/A` = verification-only task (no file output).

---

## Wave 0 Requirements

Wave 0 stubs are produced by the earliest-wave plans and consumed by later plans. At plan time none of these files exist yet; execution of Waves 1-2 creates them before any Wave 3+ task runs.

Derived from RESEARCH.md Validation Architecture invariants + the DAL-boundary / date-producer negative-grep tests introduced in Plan 01-09:

**Test helpers (Plan 01-01 + 01-02 Wave 1-2 outputs):**
- [ ] `tests/helpers/in-memory-db.ts` — Plan 01-01 Task 1 (shared in-memory SQLite factory for unit tests)
- [ ] `tests/helpers/fetch-stub.ts` — Plan 01-02 Task 2 (global `fetch` stub returning queued responses)

**HTML fixtures + expected JSON (Plan 01-03 Task 1):**
- [ ] `tests/fixtures/scraper/2024-08-15-typical.html`
- [ ] `tests/fixtures/scraper/2024-08-15-typical.expected.json`
- [ ] `tests/fixtures/scraper/2026-12-25-empty-day.html`
- [ ] `tests/fixtures/scraper/parse-edge-mangled.html`
- [ ] `tests/fixtures/scraper/released-qualifier.html` (real production date with `<font color="red">Released</font>` rows — exercises D-03 verbatim-storage rule)

**Negative-grep boundary tests (introduced here + in Plan 01-01):**
- [ ] `tests/unit/db/dal-boundary.test.ts` — Plan 01-01 Task 3 (STO-03: no SQL outside `src/lib/db/`)
- [ ] `tests/unit/shared/dates-boundary.test.ts` — Plan 01-09 Task 1 (STO-04: no YYYY-MM-DD production outside `src/lib/shared/dates.ts`)

**Test directories expected to exist after Wave 2:**
- [ ] `tests/unit/db/` — Plan 01-01
- [ ] `tests/unit/scraper/` — Plans 01-02, 01-03, 01-04, 01-05, 01-07, 01-09
- [ ] `tests/unit/scripts/` — Plan 01-06
- [ ] `tests/unit/shared/` — Plan 01-09
- [ ] `tests/scheduler/` — Plan 01-05

Wave 0 is **complete** when all items above are checked in and referenced by at least one green test in Waves 1-5. Plan 01-09 Task 3 flips `wave_0_complete: true` at that point.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TOS review artifact completed | ING-10 | Requires operator to read live source-site TOS | Operator fills `.planning/research/TOS-REVIEW.md` — reviewer + date + verbatim excerpts |
| Courtesy outreach email sent | ING-11 | Requires operator to send from personal email | Operator customizes placeholders in `.planning/research/OUTREACH-EMAIL.md` and sends; records send date + reply state |
| `FIRST_SCRAPE_OK=true` flipped | D-21 | Deliberately gated on human judgment + 7-day wait | Operator runs `fly secrets set FIRST_SCRAPE_OK=true --app fishcount` AFTER ING-10 + ING-11 complete AND 7+ days have elapsed (or reply received) |
| Live production scrape proves polite rate | ING-01, ING-03 (observed) | Requires running against live source over multiple days | Operator runs `npm run backfill` for a small range first; reviews `scrape_runs` outcomes; confirms no source-site operator complaints; observes healthchecks.io green status |
| Litestream replicates Phase 1 tables + snapshots | OPS-03 (Phase 0 gate, verified here) | Requires observing object-storage bucket contents | After first successful scheduled scrape, verify `b2` bucket has fresh timestamps for both DB chunks AND `/data/snapshots/YYYY/MM/` — Phase 0 runbook covers the verification procedure |

---

## Validation Sign-Off

*(Checkboxes ticked by Plan 01-09 Task 3 after the full suite runs green. All remain `[ ]` at plan time.)*

- [ ] All tasks have `<automated>` verify commands or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (helpers + fixtures + boundary tests)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (full suite)
- [ ] Per-task grep commands concrete (no "looks correct" language)
- [ ] `nyquist_compliant: true` set in frontmatter
- [ ] `wave_0_complete: true` set in frontmatter (after Wave 0 artifacts exist + reference green tests)

**Approval:** pending Plan 01-09 execution
