---
phase: 01-ingest-store
plan: 05
subsystem: pipeline-composition
tags: [scraper, scheduler, pipeline, orchestrator, phase-1]
dependency_graph:
  requires:
    - 01-01 (DAL repositories — client.ts, boats.ts, landings.ts, catchReports.ts, scrapeRuns.ts, parseFailures.ts, migrations.ts)
    - 01-02 (polite fetch primitives — gate.ts, rate-limiter.ts, lock.ts, fetcher.ts, robots.ts)
    - 01-03 (parser + schema — parser.ts, schema.ts, fixtures)
    - 01-04 (snapshot — snapshot.ts)
    - Phase 0 (scheduler.ts, kill-switch.ts, heartbeat.ts, logger.ts, dates.ts)
  provides:
    - scrapeDate(date, source) orchestrator — the single composition point for Phase 1 gates
    - upsertBoatsAndLandings(db, rows) DAL helper — resolves FK ids in dependency order
    - _scrapeTick scheduler body — replaces Phase 0 stub at cron '0 23 * * *' America/Los_Angeles
  affects:
    - Plan 01-06 (backfill CLI) — imports scrapeDate and getDatesToScrape; calls with source='cli'
    - Plan 01-07 (row-count SLA) — wires checkSlaAndAlert into _scrapeTick at the commented TODO
    - Plan 01-09 (cleanup) — retires the _heartbeatTick alias once the Phase 0 regression test migrates
tech-stack:
  added: []
  patterns:
    - locked-gate-ordering (firstScrapeAllowed → scrapingEnabled → withScrapeLock → sourceQueue)
    - single-ledger-row-per-invocation (recordAndReturn helper)
    - snapshot-before-parse (D-17 raw evidence preservation)
    - parse_error-vs-empty discriminator (positive 'Fish Counts' heading as data-page marker)
key-files:
  created:
    - src/lib/scraper/pipeline.ts
    - tests/scheduler/scrape-tick.test.ts
    - tests/unit/scraper/pipeline.test.ts
    - tests/unit/db/boats-batch.test.ts
  modified:
    - src/lib/db/boats.ts (added upsertBoatsAndLandings batch helper)
    - src/lib/server/scheduler.ts (replaced _heartbeatTick body with _scrapeTick; added _heartbeatTick compat alias)
    - tests/scheduler/tick-ordering.test.ts (stubs $lib/scraper/pipeline so Phase 0 ordering test doesn't touch DAL)
decisions:
  - scrapeDate does NOT call pingHealthcheck — heartbeat bookends live in _scrapeTick only; CLI path (Plan 01-06) skips pings
  - outcome='killed' pings 'fail' so OPS-04 surfaces gate-blocked days after grace period
  - 'Fish Counts' heading is the positive marker of a data panel (vs nav/pager panels) — aligns with 01-RESEARCH.md §Code Examples line 646
  - _heartbeatTick kept as an alias of _scrapeTick for Phase 0 regression test compatibility; retired in Plan 01-09
  - recordAndReturn helper centralizes ledger writes so every early-return path satisfies invariant 6 (exactly one scrape_runs row per invocation)
metrics:
  duration_seconds: 544
  completed_date: 2026-04-24
  tasks: 3
  commits: 5
  files_created: 4
  files_modified: 3
  tests_added: 14
  tests_total_after_plan: 144
---

# Phase 01 Plan 05: Pipeline Composition + Scheduler Integration Summary

Composed `scrapeDate(date, source)` — the single orchestrator that chains every Phase 1 gate (D-13, D-21, OPS-05) through fetch → snapshot → parse → upsert → ledger — and wired it into a nightly 23:00 PT scheduler tick (D-14) that replaces Phase 0's heartbeat stub while preserving the OPS-04 dead-man's-switch bookends.

## Scope

This is the central composition point where every rule from Plans 01-01 through 01-04 lands:

- **Gate ordering** (Pitfall 3 / PATTERNS §Authentication): firstScrapeAllowed → scrapingEnabled → withScrapeLock → sourceQueue.add(fetchPage) → writeSnapshot → parsePage → DAL writes → recordOutcome. Order is load-bearing; swapping any two gates opens a vulnerability (e.g., rate-limit-before-kill-switch would leak an outbound fetch when operator is halting ingestion).
- **Ledger invariant 6** (exactly one `scrape_runs` row per `scrapeDate()` invocation): enforced via the `recordAndReturn` helper; every code path — killed, http_error, parse_error, empty, success — funnels through it.
- **Snapshot-before-parse** (D-17): raw HTML persisted to `/data/snapshots/YYYY/MM/DD.html.gz` before any parse attempt, so selector drift can be replayed against original evidence.
- **Parse-error vs empty discriminator** (Pitfall 2): the `'Fish Counts'` heading is the positive marker of a data panel; a page with `class='panel'` but NO Fish Counts heading (the source's empty-day pager markup) correctly returns `empty`. A data panel with zero rows returns `parse_error` (selector drift).
- **Scheduler integration**: `_scrapeTick` at `0 23 * * *` America/Los_Angeles with `protect: true` (DST-safe + overlap-safe), wrapped in `pingHealthcheck('start')` and `pingHealthcheck('success'|'fail')` bookends. Kill-switch checks FIRST, before any ping or work, preserving the Phase 0 invariant.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | upsertBoatsAndLandings helper + pipeline.ts orchestrator | `6fad0b5` (GREEN) after `45f7482` (RED) | `src/lib/db/boats.ts`, `src/lib/scraper/pipeline.ts`, `tests/unit/db/boats-batch.test.ts` |
| 2 | Replace _heartbeatTick with _scrapeTick at 23:00 PT | `16c2366` (GREEN) after `47e3dce` (RED) | `src/lib/server/scheduler.ts`, `tests/scheduler/scrape-tick.test.ts`, `tests/scheduler/tick-ordering.test.ts` |
| 3 | Pipeline fixture-replay integration test (7 invariants) | `c96d95f` (fix-and-test combined) | `tests/unit/scraper/pipeline.test.ts`, `src/lib/scraper/pipeline.ts` (parse_error discriminator fix) |

## Decisions Made

### recordAndReturn helper centralizes ledger writes
Every `scrapeDate()` code path — gate failure, fetch failure, parse failure, success, empty — returns through a single helper that writes the `scrape_runs` row and constructs the `ScrapeResult`. This is a structural enforcement of invariant 6 (exactly one ledger row per invocation). The alternative (inline `recordOutcome` calls at every return) was rejected because any future early-return refactor could silently violate the invariant.

### 'Fish Counts' heading as positive data-panel marker
The empty-day fixture (`2026-12-25-empty-day.html`) has a `class='panel'` for its navigation/pager panel but NO `'Fish Counts'` text. The original plan text said "non-empty HTML + structured + zero rows = parse_error" using only `class='panel'` as the structure marker — but that produced a false positive for legitimate empty-day markup. The implementation aligns with `01-RESEARCH.md §Code Examples` line 646 (`html.includes('Fish Counts')`) which uses the landing-specific heading as the positive marker of a data panel. Empty-day markup (pager without a data table, no "Fish Counts" text) correctly classifies as `empty`. Selector drift (data panel present, zero rows) correctly classifies as `parse_error`.

### killed outcome → pingHealthcheck('fail')
When `scrapeDate` returns `outcome='killed'` (FIRST_SCRAPE_OK gated or kill-switch flipped during run), the scheduler pings `fail` rather than `success`. Rationale: OPS-04 dead-man's switch fires on absence-of-success-pings. If the operator has FIRST_SCRAPE_OK unset but the kill switch is allowed, the tick runs, calls scrapeDate, records a `killed` ledger row — and the operator needs to know ingestion didn't actually scrape. Pinging `fail` ensures the alert surfaces after grace, vs pinging `success` which would mask the gate block.

### `_heartbeatTick` compat alias (retire in Plan 01-09)
`tests/scheduler/tick-ordering.test.ts` (Phase 0) imports `_heartbeatTick` and asserts the kill-switch-first ordering invariant. Rather than modifying that test in this plan, `_scrapeTick` is aliased: `export const _heartbeatTick = _scrapeTick;`. The Phase 0 ordering assertion still exercises the exact same gate. Phase 0 test was also patched to stub `$lib/scraper/pipeline` so the post-gate path doesn't open a real DAL connection in unit runs. The alias will be retired in Plan 01-09 (cleanup) after the test import migrates.

### scrapeDate does NOT call pingHealthcheck (CLI/scheduler split)
The `source: 'scheduler' | 'cli'` parameter is informational — it's attached to the correlation logger but does not change control flow inside scrapeDate. Heartbeat bookends live exclusively in `_scrapeTick`; the CLI (Plan 01-06) will call `scrapeDate(date, 'cli')` directly without pings. Only the scheduler owns the dead-man's switch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] parse_error vs empty discriminator used wrong positive marker**
- **Found during:** Task 3 integration test (empty-day fixture case failed with `expected 'empty' received 'parse_error'`).
- **Issue:** The plan's initial pipeline code used `html.includes("class='panel'")` as the structure marker. The empty-day fixture legitimately contains `class='panel'` (its pager panel) but no `Fish Counts` data-panel heading, causing it to misclassify as selector drift.
- **Fix:** Switched to `html.includes('Fish Counts') && html.includes("class='panel'")` — matches `01-RESEARCH.md §Code Examples` line 646. The 'Fish Counts' heading is the source-site's data-panel marker ("{Landing} Fish Counts for {date}"), distinguishing real data panels from pager/nav panels.
- **Files modified:** `src/lib/scraper/pipeline.ts`
- **Commit:** `c96d95f`

### Auto-added Items

**2. [Rule 2 - Critical functionality] Outer try/catch wrapping withScrapeLock**
- **Found during:** Task 1 implementation.
- **Issue:** `withScrapeLock` can throw if the lock is busy or if the inner function throws unexpectedly. The plan's pseudocode used `.catch()` but that doesn't guarantee a ledger row for lock-busy errors.
- **Fix:** Wrapped the `withScrapeLock` call in an explicit `try/catch` that calls `recordAndReturn` with `outcome='http_error'` for any uncaught error. Invariant 6 (exactly one ledger row per invocation) now holds even for lock contention.
- **Files modified:** `src/lib/scraper/pipeline.ts` (outer try/catch)
- **Commit:** `6fad0b5`

**3. [Rule 3 - Test isolation] Test timeout bump for idempotency case**
- **Found during:** Task 3 first run (timeout at 5000ms).
- **Issue:** The idempotency test calls `scrapeDate` twice back-to-back; the shared `sourceQueue` enforces ≥5s between outbound fetches (ING-03 polite-scraping floor). At the default 5000ms vitest timeout, the second fetch races the timeout.
- **Fix:** Bumped only the idempotency test's timeout to 15s. Other tests pass sub-second because they only make one outbound fetch per test (the rate limiter is not in the hot path).
- **Files modified:** `tests/unit/scraper/pipeline.test.ts`
- **Commit:** `c96d95f`

### Also-fixed: Phase 0 tick-ordering test needed pipeline stub
Patched `tests/scheduler/tick-ordering.test.ts` to `vi.doMock('$lib/scraper/pipeline')` in each `it` block so the post-gate path doesn't instantiate a real DAL connection. The test's assertion (ping-call ordering) is unchanged; only the side-effect isolation improved.

## Verification

All Phase 1 success criteria met:

- [x] `scrapeDate` orchestrates the full pipeline in locked gate order — verified by line-order grep (`firstScrapeAllowed:89 < scrapingEnabled:104 < withScrapeLock:119 < sourceQueue.add:123 < writeSnapshot:139 < parsePage:146`).
- [x] Every code path writes exactly one `scrape_runs` row (invariant 6) — verified by test "invariant 6: every invocation writes exactly ONE scrape_runs row" AND "invariant 6 (gated path): killed outcome also writes exactly ONE scrape_runs row".
- [x] Snapshot-before-parse enforced — verified by test "typical fixture → outcome=success, rows ingested, snapshot written" which asserts `existsSync(snapshotPathFor('2024-08-15'))`.
- [x] Non-empty + zero-rows + structured-page → `parse_error` — encoded in pipeline.ts `looksLikeDataPage` check; empty-day fixture test exercises the false-positive-prevention path.
- [x] Scheduler tick at 23:00 PT replaces Phase 0 heartbeat tick — `grep '0 23 \* \* \*' src/lib/server/scheduler.ts` → 1 match at line 109.
- [x] Phase 0 kill-switch ordering invariant preserved — `tests/scheduler/tick-ordering.test.ts` all 3 cases still green.
- [x] Idempotency proven — same date scraped twice → identical `catch_reports` row count (74 rows both times for the typical fixture).

**Test suite:** 144 tests passed (up from 130 before Plan 01-05). 14 new tests: 3 for `upsertBoatsAndLandings` batch helper, 3 for `_scrapeTick` ordering + bookends, 8 for pipeline integration (covering 7 invariants + gated-killed ledger row).

**TypeScript:** `npm run check` reports 3 pre-existing errors (vite.config.ts test key, `.ts` extension imports in billing.ts + parser.ts — tracked in earlier plans). Zero new errors introduced by this plan.

## Downstream Consumer Notes

### Plan 01-06 (backfill CLI)
- Import `scrapeDate` from `src/lib/scraper/pipeline.ts` and call with `source='cli'`.
- `getDatesToScrape` lives in `src/lib/db/scrapeRuns.ts` (already shipped in Plan 01-01).
- CLI must NOT call `pingHealthcheck` — only the scheduler owns the dead-man's switch. `scrapeDate` itself is ping-free so the CLI just imports and calls.
- CLI must NOT boot SvelteKit (no `import '$app/...'`). Use `openDb()` from `src/lib/db/client.ts` directly; but note: pipeline.ts currently imports `$lib/db/client` which uses `$lib/server/logger` (SvelteKit-aliased). Plan 01-06 may need a small refactor to route pipeline.ts away from `$lib/server/logger` if running via `tsx` — or add a shim.

### Plan 01-07 (row-count SLA)
- Wire `await checkSlaAndAlert(date, result.outcome)` into `_scrapeTick` at the existing TODO comment (line ~68 of `src/lib/server/scheduler.ts`).
- D-25: only call when `outcome === 'success'` (empty outcomes don't trigger SLA).
- Import stub already commented: `import { checkSlaAndAlert } from '$lib/scraper/sla'` — uncomment when module lands.

### Plan 01-09 (cleanup)
- Migrate `tests/scheduler/tick-ordering.test.ts` to import `_scrapeTick` directly.
- Remove `_heartbeatTick` compat alias from `src/lib/server/scheduler.ts`.

## Known Stubs

None. The only future-plan hook is a commented-out import for `checkSlaAndAlert` (Plan 01-07). It's not a stub because the feature is not accessible to the user and no UI/data depends on it — it's a placement marker.

## Performance Notes

Pipeline integration test runs 8 cases with real SQLite I/O in tmpdir + real gzip snapshot writes. Total runtime: ~5.4s (dominated by the 5.0s idempotency test, which waits on the ING-03 rate-limiter's 5s floor between fetches). All other tests are sub-100ms.

## Self-Check: PASSED

Verified existence of created files:
- FOUND: `src/lib/scraper/pipeline.ts`
- FOUND: `tests/scheduler/scrape-tick.test.ts`
- FOUND: `tests/unit/scraper/pipeline.test.ts`
- FOUND: `tests/unit/db/boats-batch.test.ts`

Verified modifications to:
- FOUND: `src/lib/db/boats.ts` (added upsertBoatsAndLandings)
- FOUND: `src/lib/server/scheduler.ts` (replaced tick body; added cron '0 23 * * *')
- FOUND: `tests/scheduler/tick-ordering.test.ts` (added pipeline stubs)

Verified commits exist:
- FOUND: `45f7482` test(01-05): add failing test for upsertBoatsAndLandings
- FOUND: `6fad0b5` feat(01-05): add scrapeDate pipeline orchestrator + batch FK helper
- FOUND: `47e3dce` test(01-05): add failing test for _scrapeTick ordering
- FOUND: `16c2366` feat(01-05): replace Phase 0 heartbeat tick with nightly scrape tick
- FOUND: `c96d95f` test(01-05): add pipeline fixture-replay integration test

TDD gate compliance:
- Task 1: RED (`45f7482`) → GREEN (`6fad0b5`) — `test` before `feat` ✓
- Task 2: RED (`47e3dce`) → GREEN (`16c2366`) — `test` before `feat` ✓
- Task 3: Combined test+fix (`c96d95f`) — test and corresponding pipeline.ts fix in one commit. The "fix" is a correction to the parse_error/empty discriminator that the new test exposed (Rule 1 auto-fix); pipeline.ts was already implemented in Task 1. Standard RED/GREEN does not apply cleanly because the test was written after the implementation of Task 1, and the failing case surfaced a bug that the test was designed to catch. Documented in Deviations section.
