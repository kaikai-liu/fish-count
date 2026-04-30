---
phase: 01-ingest-store
plan: 09
subsystem: testing
tags: [vitest, static-grep, end-to-end, sto-03, sto-04, ing-08, d-12-resume, phase-gate]

# Dependency graph
requires:
  - phase: 01-ingest-store
    provides: "DAL (Plan 01-01), scraper pipeline (Plans 01-02..01-05), backfill CLI (Plan 01-06), SLA (Plan 01-07), operator docs (Plan 01-08)"
provides:
  - "STO-04 date-producer boundary static-grep test locks single-date-producer rule"
  - "End-to-end integration test proves CLI → pipeline → DAL chain works with real D-12 resume semantics"
  - "Phase 1 validation sign-off — wave_0_complete=true, status=ready-for-verify"
  - "Full test suite green (171 tests across 25 files) — Phase 1 ingestion complete"
affects: [phase-02-browse, phase-03-trends, phase-04-forecast, any-phase-touching-src-lib-db, any-phase-touching-scraper]

# Tech tracking
tech-stack:
  added: []  # No new libraries — this is a validation-sign-off plan
  patterns:
    - "Static grep boundary tests as CI-enforced architecture invariants (parallel to tests/unit/db/dal-boundary.test.ts from Plan 01-01)"
    - "End-to-end integration via CLI main() export + fetch stub + fixtures — no internal mocks"

key-files:
  created:
    - "tests/unit/shared/dates-boundary.test.ts"
    - "tests/unit/scraper/end-to-end.test.ts"
  modified:
    - "src/lib/db/scrapeRuns.ts (enumerateDates rewritten to pure string arithmetic for STO-04 compliance)"
    - ".planning/phases/01-ingest-store/01-VALIDATION.md (sign-off + frontmatter)"
    - ".planning/phases/01-ingest-store/deferred-items.md (pre-existing check/lint issues)"

key-decisions:
  - "enumerateDates refactored to pure string addOneDay() helper — the boundary test caught a real violation (scrapeRuns.ts:121) and the fix is load-bearing for STO-04 enforcement"
  - "Scenario 3 stub queue explicitly accounts for the robots.txt fetch as the first call — documents the behavior rather than resetting the robots cache"
  - "npm run check + npm run lint failures are pre-existing from Phase 0 and do NOT block Phase 1 sign-off — deferred to a dedicated housekeeping plan (repo has no .prettierrc; svelte-check flags the .ts-extension imports used deliberately for CLI compatibility)"

patterns-established:
  - "Static grep boundary tests: per-architecture-rule .test.ts file under tests/unit/{subsystem}/ greps a whitelist of scope directories for a forbidden pattern, filters pure-comment hits, asserts zero violations. Parallel pair with tests/unit/db/dal-boundary.test.ts"
  - "End-to-end integration test recipe: per-test tmpdir for DB/snapshots/lock; vi.resetModules() + re-import in beforeEach and between runs within the same test; closeDb() in afterEach; stub only globalThis.fetch via tests/helpers/fetch-stub.ts; everything else (argv parsing, getDatesToScrape, scrapeDate, gates, queue, fetcher, parser, DAL) runs live"
  - "Explicit robots.txt fetch accounting in stub queues — first response slot is consumed by src/lib/scraper/robots.ts when the module graph is freshly reset"

requirements-completed: [STO-03, STO-04]

# Metrics
duration: 12min
completed: 2026-04-23
---

# Phase 1 Plan 09: Validation Sign-Off Summary

**STO-04 date-producer boundary locked by grep test, 3-scenario end-to-end backfill test proves CLI → pipeline → DAL chain + D-12 resume, VALIDATION.md flipped to ready-for-verify with 171-test full suite green.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-23T16:01:00Z
- **Completed:** 2026-04-23T16:13:00Z
- **Tasks:** 4 (1 TDD with RED+GREEN split, 1 integration test, 1 docs sign-off, 1 phase gate)
- **Files modified:** 5 (2 created, 3 updated)

## Accomplishments

- **STO-04 enforcement test:** `tests/unit/shared/dates-boundary.test.ts` greps `src/lib/{scraper,db,server,alerts,ops}` + `scripts` for `.toISOString().slice(0,...)` and `.split("T")[0]` patterns. Caught a real violation in `src/lib/db/scrapeRuns.ts:121` on first run (RED).
- **Real fix applied:** `enumerateDates()` rewritten to use a pure `addOneDay()` string-arithmetic helper (zero-padded `Date.UTC` getters) — test now GREEN, all 13 existing `scrapeRuns.test.ts` tests still pass, no behavior change.
- **End-to-end integration test:** `tests/unit/scraper/end-to-end.test.ts` covers 3 scenarios — (1) 3-date backfill produces 3 success rows + catch_reports populated for each date; (2) re-running the same range makes zero boats.php fetches (D-12 zero-refetch proven); (3) middle date's 4 HTTP 503s exhaust p-retry → outcome=http_error while flanking dates succeed → outcomes={success:2, http_error:1}. All three pass.
- **VALIDATION.md sign-off:** frontmatter flipped (`status: ready-for-verify`, `wave_0_complete: true`, added `finalized: 2026-04-23`). All 22 Per-Task Verification Map rows moved from `⬜ pending` to `🟢 green`. All 14 Wave 0 checkboxes ticked. All 8 Validation Sign-Off checkboxes ticked. Approval line flipped from "pending Plan 01-09 execution" to "ready for /gsd-verify-work".
- **Full suite GREEN:** `npm run test:run` reports 25 files / 171 tests / 0 failures in ~36s — Phase 1 ingestion is complete.

## Task Commits

Each task was committed atomically (per-task-commit protocol + TDD split for Task 1):

1. **Task 1 RED: Static grep test for STO-04** — `d9e961a` (test)
2. **Task 1 GREEN: Refactor enumerateDates to pure string arithmetic** — `4dfcfe9` (refactor)
3. **Task 2: End-to-end 3-date backfill integration test** — `b14f02d` (test)
4. **Task 3: VALIDATION.md sign-off** — `f137bdf` (docs)
5. **Task 4: Phase-gate results + deferred items** — `902344f` (docs)

## Files Created/Modified

- `tests/unit/shared/dates-boundary.test.ts` (NEW) — Static grep enforcement for STO-04. Two tests: `.toISOString().slice(0,N)` and `.split("T")[0]`. Scans `src/lib/scraper`, `src/lib/db`, `src/lib/server`, `src/lib/alerts`, `src/lib/ops`, `scripts`.
- `tests/unit/scraper/end-to-end.test.ts` (NEW) — 3 scenarios driving `scripts/backfill.ts` main() through the full pipeline. Timeouts 20s/30s/60s accommodate the real 5s rate-limit floor and p-retry backoff.
- `src/lib/db/scrapeRuns.ts` (MODIFIED) — `enumerateDates()` replaced with while-loop over `addOneDay()` helper (new internal function). Removes the `d.toISOString().slice(0, 10)` extraction idiom that triggered the STO-04 test.
- `.planning/phases/01-ingest-store/01-VALIDATION.md` (MODIFIED) — Frontmatter + 22 status cells + 22 file-exists cells + 14 Wave 0 checkboxes + 8 sign-off checkboxes + approval line + one filename correction (`released-qualifier.html` → `2024-01-15-released-qualifier.html`, matching disk).
- `.planning/phases/01-ingest-store/deferred-items.md` (MODIFIED) — Added two new entries for pre-existing check/lint issues surfaced at the phase gate.

## Decisions Made

- **Rewrite enumerateDates instead of whitelisting it.** The plan's Task 1 action block suggested this exact fix if the test caught a violation. The new `addOneDay()` is pure string arithmetic over zero-padded `Date.UTC` getters — it does NOT use `.toISOString().slice(0, 10)`, it does NOT produce a "now" date (inputs are parameterized), and month/year/leap-year rollover is preserved by Date.UTC. This keeps the grep test strict (no whitelist exceptions) and is semantically cleaner than whitelisting a banned idiom.
- **Account for robots.txt fetch explicitly in Scenario 3.** The `src/lib/scraper/robots.ts` module fetches `/robots.txt` on first call per host (24h cached). Since `vi.resetModules()` rebinds the module each test, the cache is empty → the first fetch in any scrape is `/robots.txt`, which consumes the first stub response. Scenarios 1 and 2 work by coincidence (all stub responses are `TYPICAL`, so the robots fetch consuming one is harmless). Scenario 3 explicitly adds a `{ status: 200, body: "" }` entry at the front of the queue so robots-parser allows-all and the subsequent 503s land on the correct date. This is documented inline.
- **Full-suite gate reports check/lint errors but does not fix them.** Per SCOPE BOUNDARY + FIX ATTEMPT LIMIT: the 3 svelte-check errors and ~250 prettier warnings are ALL pre-existing from Phase 0. None are introduced by Plan 01-09 commits (verified via `git log --oneline -1 -- <path>`). Fixing them is a dedicated housekeeping plan — adding a `.prettierrc` + `format` run would touch ~250 files repo-wide and is outside Phase 1's validation-sign-off scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] STO-04 boundary test caught a real violation — enumerateDates refactor**
- **Found during:** Task 1 (RED phase — first test run)
- **Issue:** `src/lib/db/scrapeRuns.ts:121` used `d.toISOString().slice(0, 10)` inside `enumerateDates()`. This is precisely the idiom the new STO-04 boundary test forbids, and the plan's Task 1 action block anticipated it ("If the test fails on first run ... the fix is: rewrite enumerateDates to increment day numerically...").
- **Fix:** Rewrote `enumerateDates` to a while-loop over a new `addOneDay()` helper that formats year/month/day via zero-padded `Date.UTC` getters. No `.toISOString().slice(0, 10)` anywhere.
- **Files modified:** `src/lib/db/scrapeRuns.ts`
- **Verification:** dates-boundary test GREEN; scrapeRuns.test.ts 13/13 still GREEN (no behavior regression).
- **Committed in:** `4dfcfe9` (refactor, separate GREEN commit after `d9e961a` RED)

**2. [Rule 3 - Blocking] Filename correction in VALIDATION.md Wave 0 artifact list**
- **Found during:** Task 3 (validating Wave 0 fixtures exist on disk before ticking checkboxes)
- **Issue:** VALIDATION.md listed `tests/fixtures/scraper/released-qualifier.html` but the on-disk file is `2024-01-15-released-qualifier.html` (date-prefix convention). Ticking `[x]` without fixing the path would have left a stale reference.
- **Fix:** Updated the checkbox line to match on-disk filename.
- **Files modified:** `.planning/phases/01-ingest-store/01-VALIDATION.md`
- **Verification:** `test -f tests/fixtures/scraper/2024-01-15-released-qualifier.html` returns 0 exit.
- **Committed in:** `f137bdf` (bundled with the sign-off commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 3 blocking)
**Impact on plan:** Both anticipated or trivial. The enumerateDates refactor was explicitly foreseen in the plan's Task 1 action block; the filename correction was a 1-line fix. No scope creep.

## Issues Encountered

- **Scenario 3 initial assertion was wrong about which date errored.** First run of the e2e test asserted the errored date was `2024-08-14` but actual behavior had `2024-08-13` consuming the 503s. Root cause: `src/lib/scraper/robots.ts` fetches `/robots.txt` on the first call per host (empty cache after `vi.resetModules()`), consuming the first stub-queue response. Diagnosed via pino logs in test output. Fixed by prepending a `{status:200, body:""}` entry to the stub queue so robots-parser allows-all and the subsequent date fetches land on the correct indices. Resolved inside Task 2 (no separate commit; the test went GREEN on the second run after the stub-queue fix).
- **npm run lint has ~250 pre-existing prettier warnings.** The repo has no `.prettierrc` file; prettier defaults to double-quotes but the codebase uses single-quotes. This is pre-existing from Phase 0 scaffolding. I initially ran `npx prettier --write` on my 3 touched files (Task 4 fix attempt), which flipped them to double-quotes — then reverted via targeted `git checkout -- <file>` so my code matches the surrounding single-quote convention. The full prettier-config fix is out of scope and deferred.

## Full-Suite Gate Status (Task 4)

| Check | Result | Notes |
|-------|--------|-------|
| `npm run test:run` | **GREEN** (25 files / 171 tests / ~36s) | Phase 1 complete |
| `npm run check` | **3 pre-existing errors** | `vite.config.ts`, `src/lib/ops/billing.ts`, `src/lib/scraper/parser.ts` — all predate Plan 01-09. Tracked in `deferred-items.md`. |
| `npm run lint` | **~250 pre-existing warnings** | Repo has no `.prettierrc`. Codebase is single-quote, prettier default is double. Plan 01-09 files match codebase convention. Deferred to housekeeping plan. |

None of the check/lint failures were introduced by this plan. `git log --oneline -1 -- <each path>` confirms the offending lines predate Plan 01-09's commits.

## Handoff Notes: Operator Flow for Phase 1 Production Rollout

Phase 1 ships green code — but live production scraping deliberately waits on operator action (D-21, D-22):

1. **Read `.planning/research/TOS-REVIEW.md`** — operator fills in verbatim excerpts + reviewer sign-off after reading live `sandiegofishreports.com` TOS + `/robots.txt`.
2. **Send `.planning/research/OUTREACH-EMAIL.md`** — customize the draft (operator name + contact), send to source-site operator, record send date.
3. **Wait 7 days OR until reply received** — reply that asks us to stop → HALT permanently. No reply → proceed.
4. **Flip FIRST_SCRAPE_OK secret:** `fly secrets set FIRST_SCRAPE_OK=true --app fishcount`. This is the only path to a live production scrape — `gate.ts::firstScrapeAllowed()` is fail-closed.
5. **Backfill via CLI, not UI:** `fly ssh console --app fishcount` then `npm run backfill -- --from 2010-01-01 --to $(date +%F)`. Expect hours of polite-rate-limited runtime. `--resume` (default) lets you restart after disconnect. Progress prints one line per date; `/data/scrape.lock` prevents overlap with the nightly scheduler.
6. **Verify Litestream:** After the first successful scheduled scrape, check the B2 bucket has fresh timestamps for both `/data/fishcount.sqlite3` chunks AND `/data/snapshots/YYYY/MM/*.html.gz`. Phase 0 runbook at `.planning/research/FIRST-SCRAPE-RUNBOOK.md` covers the exact verification procedure.

## Next Phase Readiness

- **Phase 2 (Browse + Trip Picker + Trends) can begin planning immediately in parallel.** The DAL + schema are Phase 2's read layer — they are stable and fully green. Phase 2 will consume `boats`, `landings`, `catch_reports`, `scrape_runs` via the typed repositories in `src/lib/db/` and must NEVER issue SQL from routes/components (STO-03 enforced by `tests/unit/db/dal-boundary.test.ts`).
- **Phase 2 should NOT start execution until the operator has flipped FIRST_SCRAPE_OK and 30+ days of ledger data exist.** The trip picker / trends / heatmaps all need live data to be meaningful. Planning can proceed using fixture data; execution waits on the operator.
- **Blockers:** None inside the code. The only blocker is the 7-day TOS + outreach wait, which is procedural.

## TDD Gate Compliance

Task 1 followed strict RED → GREEN per `tdd="true"` frontmatter:
- **RED gate commit:** `d9e961a test(01-09): add STO-04 date-producer boundary grep test (RED)` — test failed on the real violation in `scrapeRuns.ts:121`
- **GREEN gate commit:** `4dfcfe9 refactor(01-09): rewrite enumerateDates to pure string arithmetic (GREEN)` — test passes after the refactor
- No REFACTOR commit needed — the GREEN change already left the code clean (replaced one idiom with another, no further cleanup).

Task 2 (end-to-end) is integration-style and did not require a separate RED commit — it was green on first intended run of each scenario (Scenario 3 needed a stub-queue fix iterated inline during development, not a separate failing commit).

## Self-Check: PASSED

- `tests/unit/shared/dates-boundary.test.ts` — **FOUND**
- `tests/unit/scraper/end-to-end.test.ts` — **FOUND**
- Commit `d9e961a` (RED test) — **FOUND** in git log
- Commit `4dfcfe9` (GREEN refactor) — **FOUND** in git log
- Commit `b14f02d` (end-to-end test) — **FOUND** in git log
- Commit `f137bdf` (VALIDATION sign-off) — **FOUND** in git log
- Commit `902344f` (deferred items) — **FOUND** in git log
- `grep -c "^wave_0_complete: true"` — **1** (as required)
- `grep -c "^status: ready-for-verify"` — **1** (as required)
- `grep -c "^nyquist_compliant: true"` — **1** (unchanged)
- Unchecked `- [ ]` boxes in VALIDATION.md — **0**
- `grep -c "ready for /gsd-verify-work"` — **1**

---
*Phase: 01-ingest-store*
*Completed: 2026-04-23*
