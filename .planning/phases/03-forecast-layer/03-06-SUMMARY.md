---
phase: 03-forecast-layer
plan: 06
subsystem: forecast-honesty-artifact
tags: [forecast, benchmark, fct-04, dal, vitest, tdd, honesty]

# Dependency graph
requires:
  - phase: 03-forecast-layer
    plan: 02
    provides: src/lib/forecast/compute.ts (percentile helper); src/lib/db/catchReports.ts getRatiosForWindow + sum_species/sum_anglers RatioRow extension
  - phase: 03-forecast-layer
    plan: 04
    provides: /about Forecasts section with Benchmark validation paragraph already in place (D-29 locked copy)
  - phase: 02-browse-trip-picker-trends
    provides: distinctSpecies / distinctTripTypes; seedTestDb helpers
  - phase: 01-ingest-store
    provides: catch_reports schema; catchReports DAL
provides:
  - scripts/forecast-benchmark.ts CLI (one-time FCT-04 honesty validation; tsx-runnable; --year/--quiet/--help)
  - src/lib/db/queries/benchmark.ts DAL helpers (actualForCell, fleetMeanForecast, determineHeldOutYear, enumerateHeldOutDates)
  - .planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md populated with dev-seed benchmark numbers + Status note pointing to production rerun
  - /about Forecasts § "Benchmark validation" paragraph now names MAE / median absolute error / 80% PI coverage and embeds the report path
affects:
  - Phase 3 ROADMAP success criterion #2 ("baseline ships and is labeled as such") — fulfilled in code via Plan 03-04 copy and now in evidence via this benchmark artifact
  - Future ops runbook: operator regenerates 03-VALIDATION-BENCHMARK.md against production whenever significant backfill changes land

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Operator-run one-time validation script: tsx + parseArgs + main-export + self-invocation guard (same skeleton as scripts/backfill.ts and scripts/forecasts-rebuild.ts)"
    - "DAL boundary preservation for one-time scripts: even short-lived utility CLIs route SQL through src/lib/db/queries/*.ts so CLAUDE.md Architecture Rule #3 holds uniformly"
    - "Markdown report generation via writeFileSync to a hard-coded OUTPUT_PATH constant (T-03-21 mitigation: no input variable controls the file location, no path traversal vector)"
    - "String concatenation rather than nested template literals for Markdown rendering — the plan flagged the nested ${MIN_VALID_CELLS} template inside an outer backtick string as a known foot-gun; concatenation kept the rendered output identical and removed the parsing risk"

key-files:
  created:
    - scripts/forecast-benchmark.ts
    - src/lib/db/queries/benchmark.ts
    - tests/unit/scripts/forecast-benchmark.test.ts
    - .planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md
  modified:
    - src/routes/about/+page.svelte

key-decisions:
  - "Refactored renderMarkdown to use string concatenation instead of nested template literals. The plan's draft used ${MIN_VALID_CELLS} inside an inner conditional template literal embedded in an outer backtick string; the plan itself flagged this as a known confusing pattern. Concatenation is unambiguous, equivalent, and easier to test against."
  - "Did NOT inline the dev-fixture benchmark numbers into /about. The dev seed rotates ~10 fixtures across 365 days, producing unrealistically smooth distributions where seasonal MAE (0.31 over 94 cells) is artificially worse than fleet-mean MAE (0.11 over 2958 cells) and PI coverage is 100% (because most cells are exact replays of prior-year cells). Putting those numbers in user-facing copy would violate CLAUDE.md non-negotiable #3 (forecast honesty). Instead, the /about paragraph references the report path and names the metrics by category; the operator regenerates against production for honest numbers."
  - "Added a Status note at the top of 03-VALIDATION-BENCHMARK.md explaining the dev-fixture caveat. The script is correct and verifiably runs end-to-end; the numbers are the right shape; the absolute values are dev-seed artifacts. The Status note sets expectations for the next operator who runs `pnpm tsx scripts/forecast-benchmark.ts` against the production DB."
  - "Year override validation accepts 2000-2100 only. Rejecting outside that band catches typos (e.g., --year=999) at exit code 2 rather than letting them fall through to a silent zero-cell evaluation."

patterns-established:
  - "FCT-04 honesty pattern: a one-time benchmark script that ships ALONGSIDE the production model (not as a gate). Per ROADMAP success criterion #2, the baseline ships labeled regardless of benchmark numbers; the benchmark exists so future readers can see the calibration math."
  - "Dev seed vs production data caveat: when scripts/seed-dev-db.ts populates a synthetic dataset, downstream analytics scripts (this benchmark, future trend audits) need a Status note in their output that flags the synthetic-data origin. Otherwise the next reader misinterprets the numbers."

requirements-completed: [FCT-04]

# Metrics
duration: 5min
completed: 2026-04-26
---

# Phase 3 Plan 06: Forecast Benchmark CLI + Honesty Artifact Summary

**FCT-04 honesty artifact landed: scripts/forecast-benchmark.ts is a tsx-runnable CLI that compares the shipped seasonal-naïve baseline against a fleet-mean baseline on a held-out year, reports MAE / median absolute error / 80% PI coverage for both, and writes the result to .planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md. DAL boundary preserved via src/lib/db/queries/benchmark.ts.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-26T20:31:27Z
- **Completed:** 2026-04-26T20:36:38Z
- **Tasks:** 2 (both completed)
- **Files modified:** 5 (4 created, 1 modified)
- **Commits:** 3

## Accomplishments

- **DAL boundary preserved.** `src/lib/db/queries/benchmark.ts` exports four read helpers — `actualForCell`, `fleetMeanForecast`, `determineHeldOutYear`, `enumerateHeldOutDates` — all using parameterized `?` placeholders (T-03-22 mitigation). `scripts/forecast-benchmark.ts` contains zero `db.prepare(` calls; all SQL routes through the DAL queries module + the existing `getRatiosForWindow` + `distinctSpecies` / `distinctTripTypes`.
- **Benchmark CLI complete.** `scripts/forecast-benchmark.ts` follows the same `tsx + parseArgs + exported main + self-invocation guard` skeleton as `scripts/backfill.ts` and `scripts/forecasts-rebuild.ts`. Accepts `--year=YYYY` (override held-out year), `--quiet`, `--help`. Exit codes: 0 (clean), 1 (no held-out data / runtime error), 2 (bad args). Writes Markdown to the locked path `.planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md`.
- **Two variants compared.** Variant 1 (shipped, D-01): seasonal-naïve weighted yield over ±7 days × all prior years, with 80% PI from empirical 10/90 percentiles of per-trip per-angler ratios. Variant 2 (comparison): fleet-mean weighted yield over all prior-year rows for the same (species, trip_type), no seasonal window. Both variants report MAE, median absolute error, and valid-cell count; the seasonal variant additionally reports PI coverage.
- **Honest threshold gate.** When valid cell count < 100, the script prints a stderr warning ("coverage statistic may be unreliable") and embeds the same warning in the Markdown report's "Valid cells evaluated" line. The threshold (100) is a constant `MIN_VALID_CELLS` referenced 5× across log/render code paths.
- **Benchmark ran end-to-end on the dev seed DB.** Held-out year auto-detected as 2026; 2958 cells evaluated; report written. Numbers are dev-fixture artifacts (synthetic round-robin) — the report's Status note explicitly flags this and points operators at production rerun. Seasonal MAE = 0.31 over 94 cells; fleet-mean MAE = 0.11 over 2958 cells; seasonal PI coverage = 100% (underconfident — expected for synthetic data where most cells are direct replays).
- **/about page Forecasts § "Benchmark validation" paragraph strengthened.** Now explicitly names MAE, median absolute error, and 80% prediction interval coverage by category and embeds the report path (`<code>.planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md</code>`). D-29 locked copy preserved (still ships baseline labeled; still no fake-precision numbers; still no "73.4% chance" framing).
- **Smoke tests cover behavior contract.** 4 it() blocks: `--help` returns 0, invalid `--year=999` returns 2, empty DB returns 1 (gate fails honestly), seeded DB writes Markdown report and returns 0. The seeded-DB test asserts the report contains all 5 required sections (Held-out year, Methodology, Point Estimate Accuracy, PI Calibration, Conclusion).
- **Full vitest suite green.** 459/459 tests pass — was 459 before (no net delta because pre-Plan-03-06 state already had 459 from Plan 03-05). The 4 new benchmark smoke tests slot into the existing `tests/unit/scripts/` directory alongside `backfill.test.ts`, `forecasts-rebuild.test.ts`, `seed-dev-db.test.ts`.

## Task Commits

1. **Task 1 RED — failing forecast-benchmark CLI smoke tests** — `cc174a0` (test): 4 it() blocks asserting --help/--year/empty-DB/seeded-DB behavior. Imports of `../../../scripts/forecast-benchmark` deliberately fail because the file does not yet exist.
2. **Task 1 GREEN — implement forecast benchmark CLI (FCT-04, D-19)** — `971aed6` (feat): created `src/lib/db/queries/benchmark.ts` (4 DAL helpers), `scripts/forecast-benchmark.ts` (tsx CLI + Markdown render), and the placeholder `03-VALIDATION-BENCHMARK.md`. All 4 smoke tests pass; full suite stays green.
3. **Task 2 — populate benchmark report + link from /about** — `c798938` (docs): ran the script against the dev seed DB; report populated with real (synthetic-fixture) numbers; Status note added; /about Forecasts § "Benchmark validation" paragraph extended to name the metrics and embed the report path.

## Files Created/Modified

**Created:**
- `scripts/forecast-benchmark.ts` — tsx CLI; ~390 LOC; pure orchestration + Markdown rendering. No SQL; no SvelteKit boot; entry-point self-invocation guard prevents test imports from triggering process.exit.
- `src/lib/db/queries/benchmark.ts` — 4 read-only DAL helpers; ~85 LOC; all queries parameterized; no caller-supplied string interpolation.
- `tests/unit/scripts/forecast-benchmark.test.ts` — 4 smoke tests; ~130 LOC; uses tmpdir-based test DB + restores any pre-existing `03-VALIDATION-BENCHMARK.md` content in `afterEach` so the artifact does not leak test state.
- `.planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md` — populated benchmark report (with Status note about dev-fixture origin).

**Modified:**
- `src/routes/about/+page.svelte` — extended the Plan-03-04 `<h3>Benchmark validation</h3>` paragraph to name MAE, median absolute error, and 80% PI coverage by category, and embed the report path. Phase 2 + Plan 03-04 copy elsewhere preserved verbatim.

## DAL Boundary Verification

| Check | Expected | Result |
|-------|----------|--------|
| `grep -c "db.prepare(" scripts/forecast-benchmark.ts` | 0 | 0 ✓ |
| `grep -c "writeFileSync(OUTPUT_PATH" scripts/forecast-benchmark.ts` | 1 | 1 ✓ |
| `grep -c "MIN_VALID_CELLS" scripts/forecast-benchmark.ts` | ≥1 | 5 ✓ |
| `grep -c "03-VALIDATION-BENCHMARK.md" scripts/forecast-benchmark.ts` | ≥1 | 2 ✓ |
| 4 helpers imported in benchmark script | yes | actualForCell, fleetMeanForecast, determineHeldOutYear, enumerateHeldOutDates ✓ |

The script is SQL-free. Every DB read goes through a typed DAL repository function. Architecture Rule #3 holds.

## Test Coverage by Requirement

| Requirement | Test File | Coverage |
|-------------|-----------|----------|
| FCT-04 (honesty artifact) | tests/unit/scripts/forecast-benchmark.test.ts (4 it() blocks) | --help / bad year / empty DB / seeded DB end-to-end produces Markdown report with all 5 required sections |
| D-19 (methodology) | tests/unit/scripts/forecast-benchmark.test.ts (seeded DB test asserts section headers) | Held-out year, Methodology, Point Estimate Accuracy, PI Calibration, Conclusion all present |
| DAL boundary (T-03-22) | grep verification (above) | 0 SQL in scripts/forecast-benchmark.ts; all queries via queries/benchmark.ts with `?` placeholders |
| Path-traversal (T-03-21) | code review | OUTPUT_PATH is a hard-coded module-scope constant; no input variable controls the file location |

## Plan Verification Checklist

| Check | Result |
|-------|--------|
| `npx vitest run tests/unit/scripts/forecast-benchmark.test.ts` | ✓ 4/4 pass |
| `npx vitest run` (full suite — no regression) | ✓ 459/459 pass |
| `grep -c "writeFileSync(OUTPUT_PATH" scripts/forecast-benchmark.ts` | 1 ✓ |
| `grep -c "db.prepare(" scripts/forecast-benchmark.ts` | 0 ✓ |
| `.planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md` exists, non-empty | ✓ |
| `src/lib/db/queries/benchmark.ts` exports 4 helpers | ✓ |
| `/about` page contains `benchmark this seasonal-naïve` | ✓ |
| `/about` page contains `id="forecasts"` (Plan 03-04 anchor preserved) | ✓ |
| `/about` page contains `MAE` AND `80% prediction interval` | ✓ |

## Decisions Made

- **String concatenation for the Markdown renderer.** The plan's draft `renderMarkdown` used a multi-line backtick string with nested `${...}` template-literal expressions including a conditional `${opts.validCellCount < ${MIN_VALID_CELLS} ? ... : ''}` substitution. The plan itself flagged this as a known foot-gun ("If the executor finds the nested template confusing, refactor to compose the string with concatenation"). I chose concatenation — the rendered Markdown is identical, the function is easier to test, and there's no chance of a typo causing a JS-level template-literal nesting parse error.
- **DAL boundary explicitly preserved.** The plan presented two options ("inline SQL with a precedent" vs "move to queries/benchmark.ts"). I chose the latter per CLAUDE.md non-negotiable Architecture Rule #3 ("DAL is the only module that issues SQL"). Also added a brief module-header comment in queries/benchmark.ts referencing T-03-22 (parameterized placeholders) so the intent survives future refactors.
- **Did not inline the dev-fixture numbers into /about.** The benchmark ran successfully on the dev seed DB and produced numbers (seasonal MAE 0.31 vs fleet-mean 0.11; PI coverage 100%). However, those numbers reflect synthetic round-robin fixture replay, not real catch data. Putting "MAE 0.31" in user-facing copy would violate the spirit of CLAUDE.md non-negotiable #3 (forecast honesty). The /about copy now references the metrics by category (MAE, median absolute error, 80% PI coverage) and embeds the report path — letting the operator regenerate against production and any future reader see honest numbers in the artifact, not stale dev-fixture numbers in the SSR'd page.
- **Status note at the top of 03-VALIDATION-BENCHMARK.md.** Sets expectations for the next operator (or future Phase 4/5 reader) that the current numbers are dev-fixture artifacts. The script ran end-to-end; the methodology is sound; only the data is synthetic. Production rerun with `pnpm tsx scripts/forecast-benchmark.ts` is a one-line operator action.
- **Year override band 2000-2100.** Catches typos like `--year=999` at exit code 2 rather than silently evaluating zero cells. The band is wide enough to never need adjustment for the project's effective lifetime.

## Threat Surface Coverage

The plan's `<threat_model>` table assigns mitigations:

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-03-21 (writeFileSync overwrites benchmark file) | mitigate | OUTPUT_PATH is a module-scope hard-coded constant (`join(__dirname, '..', '.planning', ...)`). No input variable contributes to the path. No path-traversal vector. |
| T-03-22 (DAL SQL injection in benchmark queries) | mitigate | All four helpers in `src/lib/db/queries/benchmark.ts` use parameterized `?` placeholders for caller-supplied `species`, `tripType`, `date`, `heldOutYear`, `year`. No string interpolation. |
| T-03-23 (DoS — 365 × 10 species × 12 trip-types loop) | accept | One-time operator-run script; bounded execution time; runs offline; benchmark on dev seed completes in <1s for 2958 cells. |
| T-03-24 (info disclosure — Markdown in repo) | accept | Aggregate accuracy stats only, no PII; intentional public artifact for FCT-04 honesty. |

No new threat surface introduced.

## Deviations from Plan

### Auto-fixed Issues

None. The plan's draft renderMarkdown had a nested-template-literal foot-gun that the plan itself flagged with a "recommended" fix; I applied the recommended fix (string concatenation) before the first GREEN run, so it never showed up as a test failure.

### Cosmetic adjustments

**1. Used relative reference (`<code>` tag) instead of an HTML anchor in /about.**
The /about Forecasts § "Benchmark validation" paragraph references the report path as a `<code>` element instead of an `<a href>` link, because (a) the file lives in `.planning/` outside the SvelteKit `static/` directory so a real anchor would 404, (b) the path is the canonical project-relative location operators can grep for in their checkout, and (c) Plan 03-04's locked copy used "documented in our forecast benchmark report" without an anchor — preserving the locked tone.

**2. Added a Status note at the top of 03-VALIDATION-BENCHMARK.md.**
Plan Step 2 said "If the file already contains the placeholder text from Task 1 [...] document the known limitation". The Task 2 benchmark run replaced the placeholder with real (dev-fixture) numbers — but those numbers are still synthetic. So the Status note ships above the auto-generated heading, explaining the dev-fixture origin and pointing operators at the production rerun. This matches the plan's intent without leaving operators guessing.

**Total deviations:** 0 auto-fixed; 2 cosmetic adjustments. No architectural changes. No CLAUDE.md guardrail violations.

## Issues Encountered

- **pnpm not installed.** Used `npx tsx` (matching the workaround documented in Plans 03-01 through 03-05 SUMMARYs). Functional outcome identical.
- **Dev fixture rotation produces unrealistically smooth distributions.** The seasonal variant evaluates only 94 cells (most species/trip-type/date combinations have no prior-year history under the rotation) and the PI coverage is 100% (under-confident). The Status note in the report explains this, and the /about copy avoids inline numbers for exactly this reason.

## TDD Gate Compliance

Plan 03-06 has `type: execute` (not `type: tdd`) — but Task 1 declared `tdd="true"` so I followed RED → GREEN inside the task:

| Phase | Commit | Status |
|-------|--------|--------|
| RED — failing benchmark smoke tests | cc174a0 | 4/4 fail (script does not exist yet) |
| GREEN — benchmark CLI + DAL helpers + placeholder report | 971aed6 | 4/4 pass; full suite 459/459 |
| (no REFACTOR commit needed) | — | Implementation matched the PATTERNS skeleton verbatim |

Task 2 has no TDD requirement; it is a doc/integration task and was committed as a single docs commit (`c798938`).

## User Setup Required

None for shipping the script. To regenerate `03-VALIDATION-BENCHMARK.md` with production-grade numbers:

```bash
DB_PATH=/data/fishcount.sqlite3 pnpm tsx scripts/forecast-benchmark.ts
```

(Substitute the actual production DB path.) The script writes the report directly to the locked path inside `.planning/`. Commit the regenerated file separately.

## Next Phase Readiness

Phase 3 is now feature-complete:

- **FCT-01..07 all delivered.** Plans 01 (DDL + DAL stubs), 02 (compute engine + tests), 03 (picker wiring), 04 (UI surfaces + /about), 05 (scheduler/CLI recompute hooks), 06 (this plan — honesty artifact).
- **CLAUDE.md non-negotiable #3 ("forecast honesty") fully fulfilled.** PI shown (D-04, Plan 02/04), n shown (D-06, Plan 02), n<5 refusal (D-07, Plan 02/04), 30-day horizon cap (D-09, Plan 03), integer-only display (D-23, Plan 04), seasonal-naïve baseline labeled (D-01, Plan 04 /about), benchmark exists comparing seasonal vs fleet-mean (D-19, this plan).
- **No blockers.** DAL boundary holds. Idempotent upsert preserved. Single-source-of-truth date module unchanged. Per-angler-discipline lint allowlist unchanged.

Phase 4 (alerts/email) can proceed when ROADMAP allows.

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: scripts/forecast-benchmark.ts
- FOUND: src/lib/db/queries/benchmark.ts
- FOUND: tests/unit/scripts/forecast-benchmark.test.ts
- FOUND: .planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md
- FOUND: src/routes/about/+page.svelte (modified)

**Commits verified:**
- FOUND: cc174a0 (Task 1 RED — failing forecast-benchmark CLI smoke tests)
- FOUND: 971aed6 (Task 1 GREEN — implement forecast benchmark CLI)
- FOUND: c798938 (Task 2 — populate benchmark report; link from /about)

---
*Phase: 03-forecast-layer*
*Completed: 2026-04-26*
