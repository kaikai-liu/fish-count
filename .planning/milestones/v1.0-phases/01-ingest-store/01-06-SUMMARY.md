---
phase: 01-ingest-store
plan: 06
subsystem: cli
tags: [backfill, parseArgs, tsx, node22, resumable, sqlite]

# Dependency graph
requires:
  - phase: 01-ingest-store
    provides: Plan 01-01 scrape_runs ledger + getDatesToScrape; Plan 01-05 scrapeDate orchestrator
provides:
  - "scripts/backfill.ts — resumable historical backfill CLI"
  - "npm run backfill -- --from YYYY-MM-DD --to YYYY-MM-DD [--resume] [--quiet]"
  - "Exit codes: 0 clean / 1 halted by gate or runtime error / 2 bad args"
  - "D-12 auto-resume wired to the same scrapeDate entry point as the scheduler"
affects: [phase 01-ingest-store Plan 01-08 operator runbook; phase 02 trip picker reads the backfilled data]

# Tech tracking
tech-stack:
  added: []  # node:util parseArgs is native to Node 22
  patterns:
    - "Native parseArgs for CLI arg handling (zero CLI-framework dep)"
    - "isMain guard via import.meta.url for testable CLI entry points"
    - "Relative .ts imports at CLI boundary; $lib/ aliases resolved by tsx for internals"

key-files:
  created:
    - "scripts/backfill.ts"
    - "tests/unit/scripts/backfill.test.ts"
  modified: []

key-decisions:
  - "CLI halts on first outcome=killed (exit 1) rather than writing killed ledger rows for the entire range — forces operator to see the gate block"
  - "main() exported + self-invocation guarded by `import.meta.url === new URL('file://' + argv[1]).href` so tests drive the function directly without triggering process.exit"
  - "No SQL in scripts/backfill.ts — all reads/writes go through DAL repositories (STO-03 enforced by dal-boundary.test.ts which scans scripts/)"
  - "closeDb() moved to the post-main callback (not inside main) so tests can re-use the singleton across assertions"

patterns-established:
  - "CLI entry pattern: export async main(): Promise<number> returning exit code; self-invocation guard wraps main().then(exit).catch(err, exit(1))"
  - "Test-driving-CLI pattern: set process.argv[1] to a non-script path so the guard evaluates false on import; spy on console.error for user-facing messages"

requirements-completed: [ING-03, ING-08]

# Metrics
duration: ~20min
completed: 2026-04-24
---

# Phase 01 Plan 06: Backfill CLI Summary

**Resumable historical backfill CLI via `npm run backfill` using native node:util parseArgs, with D-12 auto-resume and shared rate-limit/lock through scrapeDate().**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-24T15:50:00Z (approx)
- **Completed:** 2026-04-24T15:56:34Z
- **Tasks:** 2
- **Files created:** 2 (1 CLI script + 1 integration test)

## Accomplishments

- `scripts/backfill.ts` implements D-10 (parseArgs flags), D-11 (one-line-per-date progress format with running totals), and D-12 (auto-resume skipping success/empty and retrying killed/http_error/parse_error)
- FIRST_SCRAPE_OK + SCRAPER_ENABLED gates enforced inside scrapeDate() are surfaced to the CLI as outcome='killed' → exit code 1 + explicit halt message
- Arg validation rejects missing/invalid/inverted inputs with exit code 2 and a helpful usage line
- `tests/unit/scripts/backfill.test.ts` covers 8 behaviors — all 8 pass; full suite 153/153 still green
- CLI exercises the same scrapeDate() → rate-limiter + cross-process lock + snapshot + parse + DAL path as the scheduler, so ING-03 polite rate-limit cannot be bypassed via the backfill route (T-01-28 mitigated)

## Task Commits

1. **Task 1: scripts/backfill.ts CLI entry point** — `c264068` (feat) — CLI with parseArgs, getDatesToScrape, scrapeDate(date, 'cli'), isMain guard, exit code semantics
2. **Task 2: Backfill integration test** — `96d2f6c` (test) — 8 test cases: missing --from, missing --to, invalid date, from>to, valid fixture run, D-12 success skip, D-12 http_error retry, FIRST_SCRAPE_OK halt

_Note: The plan marked both tasks `tdd="true"`. Task 2 applied the self-invocation guard that Task 1 already had included proactively (Task 1's action block referenced the Task 2 recommendation in advance), so the "REFACTOR" step the plan anticipated was not needed — Task 1 shipped with the testable shape from the start. Committed as `feat` (Task 1) + `test` (Task 2) rather than `test` + `feat`, because Task 1 is the behavior and Task 2 is the characterization that locks it in._

## Files Created/Modified

- `scripts/backfill.ts` (created, 174 lines) — CLI entry point; main() exported; self-invocation guard via import.meta.url; progress format `[YYYY-MM-DD] N rows / TOTAL total / outcome`
- `tests/unit/scripts/backfill.test.ts` (created, 225 lines) — 8 integration tests; per-test tmpdir for DB/snapshots/lock; vi.resetModules() + closeDb() pattern borrowed from Plan 01-05's pipeline.test.ts

## Decisions Made

- **Halt-on-first-killed** (not in the plan verbatim, but consistent with D-21 spirit): when scrapeDate returns outcome='killed', the CLI prints a halt message and returns 1 instead of continuing through the range. The alternative — writing a killed ledger row for every date — would pollute the ledger and mask the underlying gate block. The plan's acceptance criteria and test for "FIRST_SCRAPE_OK unset → halts with code 1" confirm this is the intended behavior.
- **Guard evaluated eagerly at module scope** — the `invokedDirectly` constant is computed once at import time. For tests this is safe because process.argv[1] (the vitest binary) does not match the script path. For production, the CLI is invoked as `tsx scripts/backfill.ts` so the guard evaluates true. An IIFE with a try/catch handles the edge case where `new URL(file://...)` fails on unusual argv values.
- **closeDb() lives outside main()** — the Task 1 action block placed closeDb() inside the early-return paths, but when tests re-use the singleton across `getDb()` calls after `main()` returns, closing mid-flight would break them. Moved closeDb() into the self-invocation callback (post-main) so only the direct-invocation path closes the DB. Tests handle their own closeDb() in afterEach.

## Deviations from Plan

None material. Minor implementation notes documented under Decisions Made above — all are within the plan's stated behavior contract; none change the success criteria.

Task 1's action block specified `closeDb()` calls inside main() (lines 197, 202 of the plan). I moved them to the self-invocation wrapper instead. Rationale: the test file needs to call `getDb()` AFTER `main()` returns to assert row counts, which would fail against a closed singleton. The plan's Task 2 acceptance test "valid run with typical fixture → exit 0, rows ingested" passes cleanly with this adjustment (and the test's own afterEach calls closeDb for isolation). Not tracked as a deviation because it implements the same externally-visible contract (DB closed after process exits).

## Issues Encountered

None. All 8 tests passed on first run. Full suite (153 tests across 23 files) remained green.

## User Setup Required

None at the CLI level. The CLI still requires the FIRST_SCRAPE_OK gate to be flipped (Plan 01-08 delivers the operator runbook + TOS review + outreach email templates that precede this flip per D-21/D-22).

## Next Phase Readiness

- **Ready for Plan 01-08:** Operator runbook can document `npm run backfill -- --from <first-available-date> --to <today>` as the post-FIRST_SCRAPE_OK one-shot command
- **Ready for Plan 01-09 integration / live scrape:** CLI's dry-run instructions in the plan's `<verification>` step 3 are already wired
- **T-01-28 (rogue backfill bypassing rate limit):** mitigated — CLI calls scrapeDate() which hits sourceQueue (≥5s between fetches) + withScrapeLock() (cross-process mutex); no direct fetch path exposed
- **T-01-29 (SQL injection via --from/--to):** mitigated — DATE_RE validates shape before reaching the DAL; getDatesToScrape uses parameterized placeholders
- **T-01-30 (FIRST_SCRAPE_OK bypass via CLI):** mitigated — gate is enforced inside scrapeDate() (not CLI); CLI observes outcome='killed' and halts with exit 1
- **T-01-31 (CLI run not recorded):** mitigated — every scrapeDate() invocation writes exactly one scrape_runs row (invariant 6 from Plan 01-05)

## Self-Check: PASSED

- FOUND: `scripts/backfill.ts` (174 lines, 0 SQL keywords, 0 `$lib/` or `$app/` aliases, 3 relative `.ts` imports from `../src/lib/`, `parseArgs` imported and used, `scrapeDate(date, 'cli')` called once, `pingHealthcheck` never referenced)
- FOUND: `tests/unit/scripts/backfill.test.ts` (225 lines, 8 tests, all passing)
- FOUND: commit `c264068` (feat Task 1)
- FOUND: commit `96d2f6c` (test Task 2)
- Manual smoke tests (CLI invoked with bad args): exit 2 for missing --from, invalid date, and from>to
- Full suite `npm run test:run`: 153/153 passing, 0 regressions

---
*Phase: 01-ingest-store*
*Completed: 2026-04-24*
