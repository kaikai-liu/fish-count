---
phase: 03-forecast-layer
plan: 05
subsystem: scheduler-recompute-wiring
tags: [scheduler, backfill, cli, recompute, fct-06, tdd]

# Dependency graph
requires:
  - phase: 03-forecast-layer
    plan: 02
    provides: "src/lib/forecast/compute.ts recomputeForecasts(db) entry point"
  - phase: 01-ingest-store
    provides: "_scrapeTick body, scrape_runs outcome enum, backfill.ts skeleton"
provides:
  - "Inline recomputeForecasts call in _scrapeTick body, gated on outcome ∈ {success, empty}"
  - "Final-step recomputeForecasts call in scripts/backfill.ts (operator gets forecasts on initial backfill)"
  - "scripts/forecasts-rebuild.ts — operator CLI for ad-hoc full-window rebuild"
  - "npm script 'forecasts:rebuild' for tsx invocation"
affects:
  - 03-06-benchmark (next plan — consumes recomputeForecasts via the same compute.ts entry)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Non-fatal try/catch around recomputeForecasts mirrors the SLA non-fatal pattern in _scrapeTick — neither secondary tripwire blocks pingHealthcheck('success'), preserving the OPS-04 dead-man's-switch invariant"
    - "Outcome gate (success | empty only) for recompute trigger matches D-14: data state may have changed only on those outcomes; killed/http_error/parse_error preserve the previous forecast"
    - "Backfill final-step recompute happens AFTER the date loop and BEFORE the completion log; halted backfills (outcome=killed) skip recompute via early return 1"
    - "forecasts-rebuild.ts mirrors backfill.ts skeleton verbatim: tsx shebang, parseArgs strict mode, exported main(argv?) returning exit code, self-invocation guard"
    - "$lib alias paths in vi.doMock — when consumer imports via $lib/foo, the mock specifier must match the consumer's specifier (vi.doMock('$lib/foo'), not the relative-path equivalent)"

key-files:
  created:
    - scripts/forecasts-rebuild.ts
    - tests/unit/scripts/forecasts-rebuild.test.ts
  modified:
    - src/lib/server/scheduler.ts
    - scripts/backfill.ts
    - tests/scheduler/scrape-tick.test.ts
    - package.json

key-decisions:
  - "Mocked $lib/forecast/compute and $lib/db/client via the alias specifier in vi.doMock — not the equivalent relative path. Vitest 2.1 resolves doMock keys per the importer's specifier, so '$lib/...' must match '$lib/...'. Burned ~2 min discovering this; relative-path mocks for $lib aliases silently fall through to the real module instead of failing loudly."
  - "Kept the existing 'both gates open / outcome=empty' Phase 1 test unchanged. After the GREEN change it now invokes the REAL recomputeForecasts which throws (DB_PATH dir missing); the new non-fatal try/catch swallows it, pingHealthcheck('success') still fires, and the test continues to pass on the same ping-sequence assertion. This is semantically correct — it proves the non-fatal contract on a non-mock path."
  - "Preserved the early-exit-on-killed branch in backfill.ts unchanged — a halted backfill returns 1 BEFORE reaching the recompute block, which is correct: forecasting on partially-populated data would lie about the gap-day denominator."
  - "forecasts-rebuild.ts deliberately omits --from / --to range flags per RESEARCH §9. Operator use case is 'fix it now,' and the full window is bounded (~3,720 cells) and idempotent (UPSERT). Range mode would be a YAGNI flag."

patterns-established:
  - "Phase 3 secondary-tripwire pattern: inline non-fatal try/catch wraps recompute, mirrors the SLA wrap two lines above. Future secondary tripwires (e.g., backup-replication health) follow the same wrap to keep OPS-04 healthcheck signal pure."
  - "Operator-CLI skeleton: shebang + header + parseArgs strict + exported main(argv?) returning exit code + self-invocation guard. Both backfill.ts and forecasts-rebuild.ts share this skeleton; future scripts/forecast-benchmark.ts (Plan 03-06) will inherit it."

requirements-completed: [FCT-06]

# Metrics
duration: 7min
completed: 2026-04-26
---

# Phase 3 Plan 05: Scheduler Recompute Wiring Summary

**FCT-06 wired in three places: _scrapeTick now calls recomputeForecasts inline (success/empty only, non-fatal try/catch); scripts/backfill.ts gets a final-step recompute before its completion log; new scripts/forecasts-rebuild.ts gives operators an ad-hoc full-window rebuild CLI.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-26T20:20:35Z
- **Completed:** 2026-04-26T20:27:21Z
- **Tasks:** 3 (all completed)
- **Files modified:** 6 (2 created, 4 modified)
- **Commits:** 4 (1 RED test, 3 GREEN feat)

## Accomplishments

- **Scheduler tick wired (D-13/D-14).** `src/lib/server/scheduler.ts` now imports `recomputeForecasts` and `getDb`, and calls `recomputeForecasts(getDb())` inline in the `_scrapeTick` body. The call sits AFTER the SLA non-fatal try/catch and BEFORE `pingHealthcheck(...)` so the existing gate-ordering discipline is preserved. Outcome gate per D-14: only fires when `result.outcome === 'success' || result.outcome === 'empty'`; `killed` / `http_error` / `parse_error` skip the recompute (no new data; previous forecast stays valid).
- **Recompute is non-fatal (D-13).** Wrapped in the same `try { … } catch (err) { tickLogger.error(...) }` discipline as the SLA check two lines above. `pingHealthcheck('success')` always fires on success/empty even if recompute throws — OPS-04 dead-man's-switch retains its "is ingestion alive" semantics; the forecast pipeline is a secondary tripwire that surfaces via the `forecast_recompute_failed_non_fatal` log entry but cannot block the healthcheck.
- **Backfill final-step recompute (D-17).** `scripts/backfill.ts` now imports `recomputeForecasts` and calls it once after the date loop, before the completion log. An operator running an initial historical backfill thus gets forecasts populated immediately rather than waiting for the next nightly tick. The recompute block is itself non-fatal — failure logs to stderr but does NOT change the backfill exit code. The early-exit-on-killed branch (Phase 1 lines 126-131) is preserved unchanged: a halted backfill returns 1 before the recompute block.
- **Operator rebuild CLI (D-18).** New `scripts/forecasts-rebuild.ts` is a tsx-runnable file with shebang + parseArgs (`--quiet`, `--help`) + exported `main(argv?)` + self-invocation guard, mirroring `scripts/backfill.ts` verbatim. Exit codes: 0 clean / 1 runtime error / 2 bad args. Always rebuilds the full `today..today+30 × distinctSpecies × distinctTripTypes` window per RESEARCH §9 (no `--from` / `--to` flags). Added `npm run forecasts:rebuild` script.
- **DAL boundary preserved.** Zero `db.prepare(` and zero raw SQL in `forecasts-rebuild.ts` — all DB access flows through `recomputeForecasts(db)`, which itself calls only DAL functions per Plan 03-02. Same boundary held in scheduler.ts (only new SQL surface change is the `getDb()` import, which is the standard DAL singleton accessor).
- **Test coverage complete.** Added 7 new test cases in `tests/scheduler/scrape-tick.test.ts` (success, empty, killed, http_error, parse_error, non-fatal failure, kill-switch invariant). 4 smoke tests in `tests/unit/scripts/forecasts-rebuild.test.ts` (--help, bad arg, empty DB, seeded DB writes rows). Full vitest suite green: 56 files / 455 tests passing (up from 451).

## Task Commits

Each task committed atomically; Task 1 followed RED → GREEN cycle:

1. **Task 1 RED — failing scheduler tests** — `823d6a7` (test): 7 new test cases asserting D-13/D-14 outcome gate + non-fatal contract. Failed with `expected spy to be called 1 times, got 0` on success/empty cases.
2. **Task 1 GREEN — wire recomputeForecasts into _scrapeTick** — `5c28a1a` (feat): scheduler.ts gains 2 imports + 9-line non-fatal try/catch block in `_scrapeTick`. All 10 scrape-tick tests green.
3. **Task 2 — append recomputeForecasts to backfill.ts** — `7566092` (feat): final-step recompute call before the completion log. All 8 backfill tests still green.
4. **Task 3 — add forecasts-rebuild.ts CLI + smoke tests** — `a0d6d49` (feat): new operator script + 4 smoke tests + npm script entry. All 4 new tests green.

## Files Created/Modified

**Created:**
- `scripts/forecasts-rebuild.ts` — operator-facing ad-hoc full-window rebuild CLI (shebang + parseArgs + main export + self-invocation guard).
- `tests/unit/scripts/forecasts-rebuild.test.ts` — 4 smoke tests (--help, bad-arg, empty-DB, seeded-DB write path).

**Modified:**
- `src/lib/server/scheduler.ts` — added 2 imports (`recomputeForecasts`, `getDb`), inserted 11-line non-fatal recompute block in `_scrapeTick` body. Existing kill-switch gate, ping-bookend ordering, and SLA try/catch preserved verbatim.
- `scripts/backfill.ts` — added 1 import (`recomputeForecasts`), inserted 11-line non-fatal recompute block before the completion log. Existing arg validation, date loop, early-exit-on-killed, and exit code semantics preserved verbatim.
- `tests/scheduler/scrape-tick.test.ts` — appended new describe block with 7 test cases covering Phase 3 forecast recompute hook semantics. Existing 3 Phase 1 tests preserved unchanged.
- `package.json` — added `"forecasts:rebuild": "tsx scripts/forecasts-rebuild.ts"` script entry alongside the existing `backfill` script.

## Test Coverage by Outcome Gate

| Outcome       | Recompute called? | Test name                                                                  | Status |
| ------------- | ----------------- | -------------------------------------------------------------------------- | ------ |
| `success`     | Yes (1×)          | `outcome="success" → recomputeForecasts is called once`                    | green  |
| `empty`       | Yes (1×)          | `outcome="empty" → recomputeForecasts is called once (D-14)`               | green  |
| `killed`      | No                | `outcome="killed" → recomputeForecasts is NOT called (D-14)`               | green  |
| `http_error`  | No                | `outcome="http_error" → recomputeForecasts is NOT called (D-14)`           | green  |
| `parse_error` | No                | `outcome="parse_error" → recomputeForecasts is NOT called (D-14)`          | green  |
| any (throw)   | Yes, but swallowed | `recompute failure is NON-FATAL — pingHealthcheck("success") still fires` | green  |
| kill-switch   | No (early return) | `kill switch active → recomputeForecasts is NOT called (OPS-05 invariant)` | green  |

## Phase 1 Invariants Preserved

- **Kill-switch FIRST** — `if (!scrapingEnabled(process.env)) return;` still runs before any side effect, before any ping, before any work. Verified by the existing `SCRAPER_ENABLED=false → fetch never called, pingHealthcheck never called` test plus the new `kill switch active → recomputeForecasts is NOT called` test.
- **Ping bookend ordering** — `pingHealthcheck('start')` precedes `scrapeDate`; `pingHealthcheck('success' | 'fail')` follows. The recompute block is sandwiched between SLA and the success ping, preserving the bookend; recompute failure does NOT skip or change the success ping (verified by the non-fatal test).
- **SLA non-fatal contract** — the `try { await checkSlaAndAlert(...) } catch (err) { tickLogger.error(...) }` block is unchanged. The recompute block uses the SAME pattern (sla_check_failed_non_fatal vs forecast_recompute_failed_non_fatal log keys).
- **Backfill exit codes** — 0 (clean), 1 (gate halt or runtime error), 2 (bad args). Recompute failure inside backfill.ts logs to stderr but does NOT change the exit code.

## Decisions Made

- **vi.doMock alias resolution.** The first GREEN attempt mocked `$lib/forecast/compute` via the relative path `'../../src/lib/forecast/compute'` (matching the pattern used for `$lib/scraper/pipeline` mocks elsewhere in the same file). The recomputeForecasts spy was not intercepted; the real function ran and threw on `getDb()` (DB_PATH dir missing). Switching to `vi.doMock('$lib/forecast/compute', ...)` (alias specifier matching the consumer's import specifier) fixed it. Lesson recorded as a pattern for future $lib alias mocks. The pre-existing relative-path mocks for `pipeline` / `heartbeat` / `kill-switch` still work — likely because vitest module-graph resolution had already cached those by file path during a prior test, but $lib/forecast/compute was first encountered with the new test. Out of scope to debug deeper; the alias-path fix is the simpler universally-correct choice.
- **Mocked $lib/db/client alongside $lib/forecast/compute.** Even though `recomputeForecasts` is fully spied, the scheduler line is `recomputeForecasts(getDb())` — `getDb()` evaluates first. Mocking `getDb` to return `{}` keeps the test hermetic (no DB_PATH dir, no file-handle leak) and matches the spirit of "this test is about the call gate, not the DB."
- **Did NOT modify the existing Phase 1 'both gates open / outcome=empty' test.** After GREEN, that test invokes the REAL `recomputeForecasts` which throws because the test doesn't set up a DB. The new non-fatal try/catch in scheduler.ts swallows the throw, the test continues to pass on its `pingHealthcheck('success')` assertion. Result: a free integration-style assertion that the non-fatal contract holds end-to-end without any mocking. Documented here so a future reader sees the noisy `forecast_recompute_failed_non_fatal` log line in that test's output and recognizes it as expected.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Plan-specified mock path did not intercept**
- **Found during:** Task 1 GREEN verification (initial test run after wiring scheduler.ts)
- **Issue:** The plan's test code used `vi.doMock('$lib/forecast/compute', ...)` which I initially typed as `'../../src/lib/forecast/compute'` to match neighboring relative-path mocks in the same file. The real `recomputeForecasts` ran, hit `getDb()`, and threw — non-fatal try/catch swallowed it, test failed because spy was never called.
- **Fix:** Switched both `vi.doMock` and `vi.doUnmock` calls to use the `$lib/forecast/compute` and `$lib/db/client` alias specifiers (matching the scheduler's import specifiers). Also added a `vi.doMock('$lib/db/client', () => ({ getDb: () => ({} as never) }))` so the spy isolates the gate logic completely.
- **Files modified:** tests/scheduler/scrape-tick.test.ts (afterEach + each new it())
- **Commit:** Folded into 5c28a1a (Task 1 GREEN) — done before commit.

**2. [Rule 1 - Bug] Header comment violated forecasts-rebuild.ts acceptance criterion**
- **Found during:** Task 3 verification (`grep '--from' scripts/forecasts-rebuild.ts` should return 0)
- **Issue:** The plan's prescribed header comment reads "no --from / --to range" — which contains the literal `--from` flag name. The acceptance check `s.includes('--from') === false` failed against the file.
- **Fix:** Rewrote the header sentence to "no date range flags — operator use case is 'fix it now'" — same meaning, no flag-name literal.
- **Files modified:** scripts/forecasts-rebuild.ts
- **Commit:** Folded into a0d6d49 (Task 3) — done before commit.

### Implementation notes

- Added `npm run forecasts:rebuild` script entry in package.json (the script's own header comment references this invocation; it would have been incomplete to ship the file without the entry).
- The seeded-DB test writes 5 trips at `2024-05-{10..14}` for `(yellowtail, Full Day)`. With today=2026-04-26 the forecast window is 2026-04-26..2026-05-26 — none of those dates land on the same MM-DD as a seeded trip, but the seeded data does contribute to gap-day accounting and to *some* cells via the ±7-day window around prior years' MM-DD anchors. The test asserts `forecasts COUNT(*) > 0`, which holds because the engine emits a row per (forecast_date, species, trip_type) cell regardless of n_trips per D-07 — even cells with `value=NULL` are written, populating the table. Stronger assertions (specific cell value) would require fixture dates within ±7 of today's MM-DD across prior years and would be fragile against a wall-clock-dependent test.

## Issues Encountered

- The plan's verify command for Task 1 uses `pnpm vitest run`; this environment uses `npx vitest run` (pnpm not installed). Same workaround as Plans 03-01..03-04. Functional outcome identical.
- The `$lib` alias mock issue (described above as auto-fix #1) consumed roughly 2 minutes of debugging including diagnostic test runs and reading vitest config / heatmap-composer test patterns. Worth documenting because the relative-path pattern works for some imports but not all, and the failure mode is silent (test fails with a confusing "spy not called" rather than "module not mocked").

## DAL Boundary Verification

| Check                                                              | Result      |
| ------------------------------------------------------------------ | ----------- |
| `grep -c "db.prepare(" scripts/forecasts-rebuild.ts`               | 0           |
| `grep -c "db.prepare(" src/lib/server/scheduler.ts`                | 0           |
| `grep -c "recomputeForecasts" src/lib/server/scheduler.ts`         | 2 (import + 1 call) |
| `grep -c "recomputeForecasts" scripts/backfill.ts`                 | 2 (import + 1 call) |
| `grep -c "recomputeForecasts" scripts/forecasts-rebuild.ts`        | 2 (import + 1 call) |
| `grep -c "import.*recomputeForecasts" scripts/forecasts-rebuild.ts`| 1           |

All three trigger points import `recomputeForecasts` from `$lib/forecast/compute` (scheduler) or `../src/lib/forecast/compute.ts` (CLI scripts) and call it with a DB handle parameter — no SQL leaks into the trigger layer.

## User Setup Required

None. Operator can now run:

- **Nightly automatic:** runs as part of `_scrapeTick` at 23:00 PT (no operator action — preserved Phase 1 behavior).
- **Initial backfill:** `npm run backfill -- --from 2010-01-01 --to 2026-04-23` will now write forecasts at the end of the run.
- **Ad-hoc rebuild:** `npm run forecasts:rebuild` (or `tsx scripts/forecasts-rebuild.ts`) for repair/testing.

## Next Phase Readiness

Wave 2 of Phase 3 is complete. The next plan (03-06) is the FCT-04 honesty benchmark — a one-time `scripts/forecast-benchmark.ts` that runs `computeCell` over a held-out year and produces `.planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md`. It will inherit the same operator-CLI skeleton this plan crystallized in `forecasts-rebuild.ts` (parseArgs strict, main export, self-invocation guard).

No blockers. The non-fatal contract is end-to-end testable (mocked + integration-style). The DAL boundary holds across all three trigger points.

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: scripts/forecasts-rebuild.ts
- FOUND: tests/unit/scripts/forecasts-rebuild.test.ts
- FOUND: src/lib/server/scheduler.ts (modified)
- FOUND: scripts/backfill.ts (modified)
- FOUND: tests/scheduler/scrape-tick.test.ts (modified)
- FOUND: package.json (modified — forecasts:rebuild script entry)

**Commits verified:**
- FOUND: 823d6a7 (Task 1 RED)
- FOUND: 5c28a1a (Task 1 GREEN)
- FOUND: 7566092 (Task 2)
- FOUND: a0d6d49 (Task 3)

**Verification checks (from plan):**
- PASS: `grep -c "recomputeForecasts" src/lib/server/scheduler.ts` = 2 (≥ 2)
- PASS: `grep -c "recomputeForecasts" scripts/backfill.ts` = 2 (≥ 2)
- PASS: `grep -c "recomputeForecasts" scripts/forecasts-rebuild.ts` = 2 (≥ 2)
- PASS: `grep -c "db.prepare(" scripts/forecasts-rebuild.ts` = 0
- PASS: vitest full suite — 56 files / 455 tests green (up from 55 / 451)

---
*Phase: 03-forecast-layer*
*Completed: 2026-04-26*
