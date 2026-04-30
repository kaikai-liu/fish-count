---
phase: 01-ingest-store
plan: 07
subsystem: scraper
tags: [sla, alerts, silent-failure-detection, ing-07, resend]
requires:
  - computeSlaBaseline (Plan 01-01, src/lib/db/scrapeRuns.ts)
  - totalRowsForDate (Plan 01-01, src/lib/db/catchReports.ts)
  - sendOperatorAlert (Phase 0, src/lib/alerts/operator.ts)
  - scrapeDate (Plan 01-05, src/lib/scraper/pipeline.ts — scheduler caller)
provides:
  - shouldAlert (pure decision)
  - checkSlaAndAlert (side-effect wrapper)
  - scheduler wire-up in _scrapeTick with non-fatal try/catch
affects:
  - src/lib/server/scheduler.ts (uncomments import + adds guarded call)
tech-stack:
  added: []
  patterns:
    - "pure-decision + side-effect split (mirrors billing.ts + billing-watcher.ts)"
    - "non-fatal secondary tripwire (OPS-04 remains primary dead-man's switch)"
key-files:
  created:
    - src/lib/scraper/sla.ts
    - tests/unit/scraper/sla.test.ts
  modified:
    - src/lib/server/scheduler.ts
decisions:
  - "D-23/D-25 baseline is success-only in denominator — verified by dedicated test asserting computeSlaBaseline=100 across a mixed 4-success/3-non-success window"
  - "Strict < threshold (today exactly at 50% of baseline does NOT alert) — explicit unit-test coverage"
  - "MIN_BASELINE_FOR_ALERT = 5 guards against fresh-install / extended-off-season false alarms"
  - "SLA failures are non-fatal in the scheduler tick — try/catch logs and swallows so OPS-04 ping chain is unaffected"
metrics:
  tasks-completed: 2
  tests-added: 14
  files-created: 2
  files-modified: 1
  completed: 2026-04-23
---

# Phase 01 Plan 07: Row-Count SLA Alert (ING-07) Summary

**One-liner:** Implements the row-count SLA silent-failure detector (ING-07) with a pure `shouldAlert` decision + async `checkSlaAndAlert` side-effect wrapper, reusing the existing Phase 0 Resend wrapper and wiring non-fatally into the nightly scheduler tick.

## Exported Signatures

```typescript
// src/lib/scraper/sla.ts
export function shouldAlert(
  outcome: ScrapeOutcome,
  baseline: number | null,
  todayTotal: number
): boolean;

export async function checkSlaAndAlert(
  date: string,
  outcome: ScrapeOutcome
): Promise<void>;
```

## SLA Formula (D-23/D-24/D-25)

| Rule | Source | Behavior |
|------|--------|----------|
| Outcome gating | D-25 | `outcome === 'success'` is required; every other outcome short-circuits before any DB read |
| Denominator | D-23 | `AVG(rows_ingested)` over `scrape_runs WHERE outcome='success' AND run_date IN [today-7, today-1]` (non-success outcomes excluded to prevent off-season / error-day poisoning) |
| Numerator | D-24 | `COUNT(*) FROM catch_reports WHERE source_date=today` after the scrape completes (stable across idempotent re-runs) |
| Threshold | plan | `todayTotal < 0.5 × baseline` (strict `<`; exact 50% is NOT a breach) |
| Minimum history | plan + RESEARCH.md OQ3 | `baseline !== null && baseline >= 5` — safeguards against single-row baselines triggering alerts during cold-start |

## Scheduler Integration

`src/lib/server/scheduler.ts::_scrapeTick` now imports `checkSlaAndAlert` and calls it AFTER `scrapeDate` returns, wrapped in its own try/catch:

```typescript
try {
  await checkSlaAndAlert(date, result.outcome);
} catch (err) {
  tickLogger.error({ err, msg: 'sla_check_failed_non_fatal' });
}
```

**Non-fatal-by-design rationale:**
- OPS-04 (healthchecks.io dead-man's switch) is the PRIMARY signal that "ingestion is alive." Losing the SLA alert channel is less severe than losing the heartbeat, so a Resend outage must not escalate to a healthcheck `fail` ping.
- `checkSlaAndAlert` itself short-circuits on non-success outcomes before touching the DB, keeping the tick fast when ingestion is intentionally quiet (off-season, gate blocks).

## Silent-Failure Detection Coverage (CLAUDE.md Non-Negotiable #2)

| Silent-failure mode | Detector | Channel |
|---------------------|----------|---------|
| Scraper silently ingests 0 rows | Row-count SLA (this plan) | Resend operator email |
| Scheduler tick stops firing | OPS-04 dead-man's switch | healthchecks.io grace alert |
| Per-row schema drift | Zod `safeParse` + `parse_failures` quarantine (Plan 01-03) | row appears in ledger; recorded in scrape_runs |
| HTTP failure | `outcome='http_error'` ledger row (Plan 01-05) | visible via ledger query; OPS-04 fires on repeated failures |

ING-07 closes the "scrape runs fine but produces far less data than expected" gap — the most dangerous silent-failure mode because the scheduler stays green and no exception surfaces.

## Test Coverage

`tests/unit/scraper/sla.test.ts` — 14 tests, all passing:

**`shouldAlert` truth table (6 tests):**
- non-success outcomes (empty / http_error / parse_error / killed) → false
- `baseline === null` → false
- `baseline < 5` (insufficient history) → false
- today strictly below 50% with baseline ≥ 5 → true (multiple values)
- today exactly at 50% threshold → false (strict-< boundary)
- today ≥ 50% of baseline → false

**`checkSlaAndAlert` side effect (8 tests):**
- outcome=empty → no alert (short-circuit before DB)
- outcome=http_error → no alert
- outcome=parse_error → no alert
- outcome=killed → no alert
- outcome=success + today<50% baseline → exactly one `sendMock` call with date + counts in subject/body
- outcome=success + today≥50% baseline → no alert
- outcome=success + baseline<5 (only 1 prior success) → no alert
- **D-25 denominator test** — seeds 4 success@100 + 3 non-success@0 in the 7-day window; asserts `computeSlaBaseline === 100` (not the `~57` a mixed average would produce). This is the key anti-poisoning invariant.

## Deviations from Plan

None — plan executed as written. The only minor adjustments:

1. **TDD RED scope narrowed to one test.** Task 1's RED gate was satisfied with a single minimal failing assertion (`shouldAlert('success', 100, 40) === true`) before creating sla.ts. The full truth-table suite landed in Task 2 as planned. This matches the plan's split (Task 1 = implementation, Task 2 = comprehensive tests) while preserving the RED-before-GREEN TDD discipline at the file level.
2. **D-25 test cleaned up the verbose `any`-casts from the plan snippet.** The plan had a typo-ridden inline `mk` helper with leftover broken invocation (`recordOutcome(db, { runId: 's1', ..., startedAt:'','','',outcome:'success'... })`). Written as a typed helper that uses `ScrapeOutcome` and properly constructs each input; behavior preserved (same seed data, same expected `baseline === 100`). No semantic change.

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| `src/lib/scraper/sla.ts` exists | ✓ |
| `export function shouldAlert` (1 occurrence) | ✓ |
| `export async function checkSlaAndAlert` (1 occurrence) | ✓ |
| `SLA_THRESHOLD = 0.5` constant | ✓ |
| `MIN_BASELINE_FOR_ALERT = 5` constant | ✓ |
| `sendOperatorAlert` reused from `$lib/alerts/operator` | ✓ (2 occurrences — import + call) |
| Scheduler wired (import + call) | ✓ (3 occurrences including inline call) |
| Zero SQL literals in sla.ts (STO-03 DAL boundary) | ✓ |
| `tests/unit/scraper/sla.test.ts` exists with ≥10 tests | ✓ (14 tests) |
| D-25 denominator test asserts `baseline === 100` | ✓ |
| `vi.mock('resend', ...)` module-scope | ✓ |
| `npm run test:run -- tests/unit/scraper/sla.test.ts` exits 0 | ✓ |
| Full suite (`npm run test:run`) green | ✓ (166/166 passing across 23 files) |

## Known Issues / Deferred

- **`npm run check` still reports 3 pre-existing errors** (`vite.config.ts`, `src/lib/ops/billing.ts:11`, `src/lib/scraper/parser.ts:40`) — all documented in `.planning/phases/01-ingest-store/deferred-items.md`, all pre-existing before this plan, all unrelated to the new SLA code. This plan's own files produce zero new typecheck errors.
- **Secondary "alert is broken" path is deferred** — per RESEARCH.md OQ3, the case where baseline is chronically `null` (the alerter itself has gone silent) is not handled in Phase 1. OPS-04 dead-man's switch already covers the "scrape stopped running at all" slice; the narrower "scrape runs but baseline query always returns null" variant is a Phase 5 polish item.

## Commits

| Commit | Task | Description |
|--------|------|-------------|
| `ef6d68e` | 1 (RED) | test(01-07): add failing test for shouldAlert pure decision (RED) |
| `d80555e` | 1 (GREEN) | feat(01-07): implement ING-07 row-count SLA alert |
| `a4e3857` | 2 | test(01-07): full SLA coverage — truth table, side effects, D-25 denominator |

## Self-Check

- [x] `src/lib/scraper/sla.ts` exists
- [x] `tests/unit/scraper/sla.test.ts` exists (14 tests passing)
- [x] `src/lib/server/scheduler.ts` imports + calls `checkSlaAndAlert` inside non-fatal try/catch
- [x] Commit `ef6d68e` present in `git log`
- [x] Commit `d80555e` present in `git log`
- [x] Commit `a4e3857` present in `git log`
- [x] Full test suite `npm run test:run` → 166/166 passing
