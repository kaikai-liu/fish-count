---
phase: 04-email-alerts
plan: 07
subsystem: email-alerts
tags: [phase-4, email-alerts, evaluators, dispatch, scheduler, alt-09, alt-10, alt-11, alt-12, hot-day, starting-to-run, dedup, warmup, dal-boundary, non-fatal-hook]

# Dependency graph
requires:
  - phase: 04-email-alerts/01
    provides: subscribers + alertsSent DAL (createPending, listActive, findById, exists, recordSent, recordQueued, countSentSince, listQueued, markExpired, markSent), subscribers/alerts_sent schema
  - phase: 04-email-alerts/02
    provides: warmup pure-fn (dailyCap, withinCap), tokens.signToken
  - phase: 04-email-alerts/03
    provides: buildEmail + escapeHtml + BuildEmailArgs interface, sendUserEmail (RFC 8058 List-Unsubscribe), renderHotDayEmail/renderRunStartEmail/renderConfirmationEmail templates
  - phase: 01
    provides: catch_reports table + boats/landings joins, scheduler _scrapeTick
  - phase: 03
    provides: pure-function purity contract (no module-scope getDb; db handle injected); per-cell try/catch non-fatal pattern
provides:
  - dispatchAlerts orchestrator wired into the only code path that sends subscriber emails
  - hot-day evaluator (ALT-09) — pure function, four honesty floors enforced
  - starting-to-run evaluator (ALT-10) — pure function, four honesty floors + ISO-week trigger date
  - alertEval DAL queries (cross-table reads for evaluator math, DAL boundary preserved)
  - hotDayEmail / startingToRunEmail dispatcher-facing template aliases
  - non-fatal scheduler hook (step 5.5 between forecast recompute and pingHealthcheck close)
affects: [phase-4 plan 08 (warm-up drill, anti-abuse e2e), phase-5 polish, future operator analytics]

# Tech tracking
tech-stack:
  added: []  # No new libraries — pure composition over Wave 1 + Wave 2 outputs.
  patterns:
    - "Pattern: Evaluator (rules) -> Dispatch (orchestration) -> Templates (composition) -> Send (transport) — four single-responsibility seams. Anti-pattern avoided: embedding email rendering inside the dispatcher."
    - "Pattern: per-candidate try/catch inside dispatch + wrapper try/catch at scheduler boundary — analog to Phase 3 per-cell forecast recompute discipline. One bad candidate cannot abort the whole batch; one bad batch cannot block pingHealthcheck."
    - "Pattern: drainQueued runs BEFORE evaluators so cap budget reflects drained sends (UI-SPEC promise: queue-not-drop). 24h TTL sweep on stale queued rows (Pitfall 7 mitigation)."
    - "Pattern: per-species DAL-read cache in evaluateStartingToRun — multiple subscribers following the same species pay only one round of queries."

key-files:
  created:
    - src/lib/db/queries/alertEval.ts (DAL — 5 cross-table queries for evaluator math)
    - src/lib/alerts/evaluators/hotDay.ts (pure-fn evaluator)
    - src/lib/alerts/evaluators/startingToRun.ts (pure-fn evaluator + isoWeekMonday helper)
    - src/lib/alerts/dispatch.ts (orchestrator + drainQueued)
    - tests/unit/alerts/evaluators/hotDay.test.ts (9 tests)
    - tests/unit/alerts/evaluators/startingToRun.test.ts (10 tests)
    - tests/unit/alerts/dispatch.test.ts (6 tests)
    - tests/integration/alerts/dispatch.test.ts (1 e2e test)
  modified:
    - src/lib/email/templates.ts (EXTENDED — added hotDayEmail + startingToRunEmail dispatcher aliases; renderConfirmationEmail/renderHotDayEmail/renderRunStartEmail untouched)
    - src/lib/server/scheduler.ts (MODIFIED — added step 5.5 dispatchAlerts hook between recomputeForecasts and pingHealthcheck close, non-fatal try/catch)
    - tests/unit/email/templates.test.ts (EXTENDED — 5 new tests for the alias surface; Plan 03 confirmation/hotDay/runStart tests preserved)

key-decisions:
  - "Templates aliasing over rewrite: Plan 03 had already shipped renderHotDayEmail/renderRunStartEmail with a caller-friendly arg shape. Plan 07 adds thin hotDayEmail/startingToRunEmail aliases that map the dispatcher's HotDayCandidate/RunCandidate shape (boatDisplayName, subscriberEmail) to the existing renderers. Single escape-hardened body per template — no T-04-A9 surface drift."
  - "Trailing-window arithmetic: changed from the plan-prescribed strict-> lower bound (which clipped to 29 days) to '>=' lower + '<' upper bounds, yielding exactly dayCount calendar days. Auto-fix per Rule 1 — the original plan SQL produced n_days=29 for dayCount=30, contradicting the W6 acceptance test."
  - "isoWeekMonday string production routed through addDays() from \$lib/shared/dates instead of toISOString().slice(0,10). The latter trips the dates-boundary static-grep enforcement (STO-04 single-producer rule). addDays does the calendar-arithmetic in UTC and returns a YYYY-MM-DD string directly."
  - "drainQueued re-renders email body from trigger_key parse — minimal-info safety net for the warm-up window only. v1 hot path keeps richer state by not queueing in the first place; the queue is the exception, not the rule."
  - "Per-candidate try/catch in dispatchAlerts mirrors Phase 3's per-cell try/catch in recomputeForecasts. Non-fatal at scheduler boundary mirrors checkSlaAndAlert + recomputeForecasts discipline."

patterns-established:
  - "Evaluator -> Dispatch -> Templates -> Send four-seam separation enforced by import boundaries (evaluators import only from \$lib/db/queries/alertEval; dispatch is the only consumer of evaluators)"
  - "DAL boundary preservation: 0 SQL fragments in src/lib/alerts/* — every query is a typed function in src/lib/db/queries/alertEval.ts (CLAUDE.md Architecture Rule)"
  - "Sample-size honesty floors codified as exported constants: HOT_DAY_RATIO=2.0, HOT_DAY_DEFAULT_MIN_ANGLERS=8, HOT_DAY_BASELINE_MIN_DAYS=5, RUN_RATIO=1.5, RUN_BASELINE_MIN_TRIPS=5, RUN_MIN_REPORTING_BOATS=3 — single source of truth for callers + tests"
  - "Non-fatal scheduler hook ordering: SLA -> forecasts -> alerts -> close. Each layer wrapped in try/catch; OPS-04 dead-man's switch always pings 'success' on a successful scrape."

requirements-completed: [ALT-09, ALT-10, ALT-11, ALT-12]

# Metrics
duration: 18min
completed: 2026-04-30
---

# Phase 04 Plan 07: Alert Dispatch Engine Summary

**Hot-day + starting-to-run evaluators wired through a non-fatal scheduler hook with dedup + warmup queue-not-drop — ALT-09/10/11/12 functional end-to-end.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-29T23:54:00Z (worktree base reset)
- **Completed:** 2026-04-30T00:11:14Z
- **Tasks:** 3 (each TDD: RED → GREEN)
- **Files created:** 8 (4 src, 4 test)
- **Files modified:** 3 (templates.ts, scheduler.ts, templates.test.ts)
- **Tests added:** 26 (9 hotDay + 10 startingToRun + 6 dispatch unit + 1 dispatch e2e). All 643 tests in the full suite pass.

## Accomplishments

- **ALT-09 hot-day** functional end-to-end. Evaluator emits one HotDayCandidate per (subscriber, followed boat, trip type) where today's avg/angler exceeds 2.0× the trailing-30-day baseline AND today's anglers ≥ 8 (env-overridable), refusing on n_days<5, trailing_avg≤0, and below-MIN-anglers gates.
- **ALT-10 starting-to-run** functional end-to-end. Evaluator emits one RunCandidate per (subscriber, followed species) where rolling 7-day fleet-wide avg/angler exceeds 1.5× same-week-last-year baseline, scoped to the species' modal trip type. Refuses on n_trips<5, year_ago_avg≤0, n_boats<3, no-modal-trip-type gates. trigger_date = ISO-week Monday for at-most-one alert per (subscriber, species) per week.
- **ALT-11 dedup** FULLY satisfied. Schema (Plan 01) + DAL primitives (Plan 01) + dispatcher integration (Plan 07): alertsSent.exists short-circuits second-tick sends — proven by integration test asserting one send across two consecutive dispatchAlerts calls on the same fixture.
- **ALT-12 warmup** FULLY satisfied. Pure-fn (Plan 02) + dispatcher integration with B1 queue-not-drop semantics: when cap is consumed, candidates land in alerts_sent with status='queued'; the next tick's drainQueued promotes them to status='sent' (or markExpired after 24h TTL). UI-SPEC promise "we never silently drop alerts" enforced.
- **Scheduler tick** retains the 6-step kill-switch-first invariant. Step 5.5 is the new dispatchAlerts hook between forecast recompute (step 5) and pingHealthcheck close (step 6), gated on the same outcome filter (success | empty), wrapped in non-fatal try/catch so a Resend outage cannot block pingHealthcheck('success'). Scheduler ordering test still passes.
- **DAL boundary** preserved: 0 SQL fragments in src/lib/alerts/* (verified by grep). All evaluator math routes through 5 typed functions in src/lib/db/queries/alertEval.ts.
- **T-04-A9 escape coverage** maintained via the hotDayEmail/startingToRunEmail aliases that route through Plan 03's escape-hardened render functions. New tests prove `<script>alert("xss")</script>`, `"><img onerror=1>`, and `tuna&shark` payloads are escaped in the rendered HTML body.

## Task Commits

Each task followed RED → GREEN TDD with separate commits:

1. **Task 1 RED: hot-day failing tests** — `b581ae5` (test)
2. **Task 1 GREEN: hot-day evaluator + alertEval DAL** — `784fd7d` (feat)
3. **Task 2 RED: starting-to-run + template alias failing tests** — `d673260` (test)
4. **Task 2 GREEN: starting-to-run evaluator + dispatcher template aliases** — `2ab9d61` (feat)
5. **Task 3 RED: dispatch + e2e failing tests** — `17dfba7` (test)
6. **Task 3 GREEN: dispatchAlerts orchestrator + scheduler hook** — `788ec64` (feat)

## Files Created/Modified

- `src/lib/db/queries/alertEval.ts` — DAL for evaluator math: getTodayPerBoatTripStats, getTrailingBoatTripStats (W6-fixed inclusive-exclusive 30-day window), getRolling7SpeciesStats, getYearAgoSpeciesStats, getModalTripTypeForSpecies. Per-angler discipline (SUM/SUM, never mean-of-ratios) + n_days/n_trips/n_boats surfaced for sample-size honesty floors.
- `src/lib/alerts/evaluators/hotDay.ts` — Pure-fn evaluator. HOT_DAY_RATIO=2.0, HOT_DAY_DEFAULT_MIN_ANGLERS=8, HOT_DAY_BASELINE_MIN_DAYS=5. trigger_key=`boat:${boatId}:${tripType}` so same boat × two trip types = two distinct candidates (Open Question 5). HOT_DAY_MIN_ANGLERS env override.
- `src/lib/alerts/evaluators/startingToRun.ts` — Pure-fn evaluator. RUN_RATIO=1.5, RUN_BASELINE_MIN_TRIPS=5, RUN_MIN_REPORTING_BOATS=3. trigger_key=`species:${species}:${modal-trip-type}`. trigger_date=isoWeekMonday(today) (one alert per (subscriber, species) per ISO week). Per-species DAL-read cache.
- `src/lib/alerts/dispatch.ts` — Orchestrator. drainQueued runs FIRST (24h TTL sweep + markSent promotion), then listActive → evaluators → per-candidate (exists → cap check → recordQueued | sign tokens → buildEmail → sendUserEmail → recordSent). Non-fatal at per-candidate AND scheduler-boundary layers.
- `src/lib/email/templates.ts` (EXTENDED) — Added hotDayEmail + startingToRunEmail aliases that map HotDayCandidate/RunCandidate shape to renderHotDayEmail/renderRunStartEmail. Plan 03 renderers untouched.
- `src/lib/server/scheduler.ts` (MODIFIED) — Imported dispatchAlerts; appended step 5.5 hook between recomputeForecasts (step 5) and pingHealthcheck close (step 6). Non-fatal try/catch with `alerts_dispatch_failed_non_fatal` log key. 6-step kill-switch-first ordering preserved.
- `tests/unit/alerts/evaluators/hotDay.test.ts` — 9 tests covering all 4 floors + env override + Open-Question-5 dual-trip-type case + W6 30-day window invariant.
- `tests/unit/alerts/evaluators/startingToRun.test.ts` — 10 tests: 4 isoWeekMonday cases (Mon/Thu/Sun/year-boundary) + 6 evaluator scenarios covering all 4 honesty floors.
- `tests/unit/email/templates.test.ts` (EXTENDED) — 5 new tests for hotDayEmail + startingToRunEmail aliases (subject/H1 verbatim + n=X disclosure + boat/trends URL + 2 escape tests).
- `tests/unit/alerts/dispatch.test.ts` — 6 tests: happy path + ALT-11 dedup + ALT-12 cap-queue + non-fatal Resend throw + B1 drain (queued→sent) + B1 TTL (queued>24h→expired).
- `tests/integration/alerts/dispatch.test.ts` — 1 e2e test through the Resend mock asserting RFC 8058 List-Unsubscribe headers + `Hot day: Pacific Dawn` subject + dedup on second tick.

## Decisions Made

- **Templates aliasing decision** (key-decisions §1): Plan 03 already shipped renderHotDayEmail/renderRunStartEmail with a caller-friendly arg shape (boatName, species). Plan 07 adds thin `hotDayEmail` / `startingToRunEmail` aliases that map the dispatcher's HotDayCandidate/RunCandidate shape to those renderers. Single source of UI-SPEC verbatim copy + escape-hardened body per template — no T-04-A9 surface drift.
- **Trailing-window arithmetic** (Deviation §1, key-decisions §2): switched from strict-> lower bound (plan SQL clipped to 29 days) to '>=' lower + '<' upper bounds, yielding exactly 30 calendar days. Required by the W6 acceptance test.
- **STO-04 single-producer compliance** (Deviation §2, key-decisions §3): isoWeekMonday's final string production routes through addDays() from $lib/shared/dates instead of toISOString().slice(0,10). The dates-boundary static-grep test enforces this rule across src/lib/alerts/.
- **drainQueued minimal-info re-render** (key-decisions §4): on warm-up drain, the dispatcher re-renders email body from trigger_key parse. Hot path keeps richer state by not queueing in the first place; the queue is the exception, not the rule.
- **Per-candidate try/catch + scheduler-boundary wrap** (key-decisions §5): mirrors Phase 3's per-cell forecast recompute discipline. One bad candidate cannot abort the batch; one bad batch cannot block pingHealthcheck.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] W6 trailing-window arithmetic produced n_days=29 instead of 30**
- **Found during:** Task 1 GREEN — the W6 acceptance test asserted `n_days === 30` after seeding exactly 30 dates inside the (today-30, today) window.
- **Issue:** The plan-prescribed SQL used `cr.source_date > date(?, '-30 days')` (strict `>` lower bound). With today='2026-04-15', date(today,'-30 days')='2026-03-16'; `>` excludes 2026-03-16, yielding 29 included dates instead of the asserted 30. The plan's comment claimed `>=` would yield (dayCount+1) inclusive days — incorrect when paired with the strict `<` upper bound.
- **Fix:** Changed to `cr.source_date >= date(?, '-' || ? || ' days') AND cr.source_date < ?` — inclusive lower bound + strict upper bound = exactly dayCount calendar days. Updated docstring to explain the asymmetric bounds.
- **Files modified:** src/lib/db/queries/alertEval.ts
- **Verification:** All 9 hotDay tests pass including the W6 invariant assertion `result.n_days === 30`.
- **Committed in:** `784fd7d` (Task 1 GREEN commit)

**2. [Rule 1 - Bug] isoWeekMonday violated STO-04 single-producer-of-date-strings rule**
- **Found during:** Task 3 GREEN — running the full suite. tests/unit/shared/dates-boundary.test.ts (static-grep enforcement of CLAUDE.md Architecture Rule "All dates are YYYY-MM-DD ... a single lib/shared/dates.ts module is the sole producer of date strings") flagged a violation.
- **Issue:** The plan-prescribed isoWeekMonday implementation called `d.toISOString().slice(0, 10)` directly. This bypasses the dates.ts producer and trips the STO-04 boundary test.
- **Fix:** Refactored to compute `isoDow` via `getUTCDay`, then defer YYYY-MM-DD production to `addDays(today, -(isoDow - 1))` from `$lib/shared/dates`. addDays handles the calendar arithmetic in UTC and returns a YYYY-MM-DD string directly. (Initially attempted `toIsoDate(d)` but that converts to Pacific time and shifted the date by a day; addDays is the correct primitive.)
- **Files modified:** src/lib/alerts/evaluators/startingToRun.ts
- **Verification:** All 10 startingToRun tests pass; dates-boundary test passes; 643 tests total pass.
- **Committed in:** `788ec64` (Task 3 GREEN commit, alongside the dispatch + scheduler-hook changes)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both deviations were correctness fixes against the plan's literal SQL/code. No scope creep, no architectural change. The plan's behavioral specification (exactly 30-day window; ISO-week Monday) was preserved — only the implementation details were corrected to satisfy the asserted invariants.

## Issues Encountered

- **Worktree mkdir leak (Rule 3 — fixed in flight):** First mkdir command for new directories accidentally targeted absolute paths under the main repo (`/Users/zen/Documents/code/fish-count/`) instead of the worktree (`/Users/zen/Documents/code/fish-count/.claude/worktrees/agent-a551dbee33ff2957f/`). Detected when vitest reported "No test files found" — the test had landed in the main repo. Cleaned up the leaked directories from the main repo with `rm -rf`, then re-created in the worktree path. No commits hit the wrong tree because the leak was in untracked files only. Subsequent operations all stayed in worktree.

## TDD Gate Compliance

This plan executed three TDD cycles, each with a distinct RED test commit followed by a GREEN implementation commit. Verifiable in `git log`:

```
Task 1: b581ae5 (test, RED) -> 784fd7d (feat, GREEN)
Task 2: d673260 (test, RED) -> 2ab9d61 (feat, GREEN)
Task 3: 17dfba7 (test, RED) -> 788ec64 (feat, GREEN)
```

No REFACTOR-only commits — the GREEN implementations were small enough that no separate refactor pass was warranted.

## User Setup Required

None — no new external services. Reuses Plan 03's RESEND_API_KEY + SUBSCRIBER_FROM_EMAIL + PUBLIC_BASE_URL + POSTAL_ADDRESS env vars and Plan 02's PROJECT_SECRET. New optional env: `HOT_DAY_MIN_ANGLERS` (defaults to 8 when unset/non-numeric).

## Next Phase Readiness

Plan 04-08 (warm-up drill + anti-abuse e2e) can now exercise:
- The full dispatchAlerts pipeline (evaluators → dedup → warmup → send → record) end-to-end against a real Resend sandbox key.
- The B1 drainQueued path (pre-seed a queued row at 23h59m and assert it sends; pre-seed at 24h01m and assert it markExpired).
- The non-fatal scheduler-boundary contract (fault-inject Resend 503 and assert pingHealthcheck still receives 'success').

No blockers. ALT-09/10/11/12 fully wired; the only ALT-* requirements not yet shipped (per plan tracking) belong to Plan 04-08.

## Self-Check: PASSED

Verified:
- All 6 commits exist in `git log --oneline`: b581ae5, 784fd7d, d673260, 2ab9d61, 17dfba7, 788ec64.
- All created files exist on disk under the worktree.
- Full suite green: 80 test files, 643 tests, 0 failures.
- DAL boundary preserved: `grep -E '(SELECT|INSERT|UPDATE|DELETE) ' src/lib/alerts/` returns 0 matches across dispatch.ts + evaluators/.
- Scheduler ordering test still passes (kill-switch-first invariant unchanged).
- Plan 03 templates preserved (renderConfirmationEmail / renderHotDayEmail / renderRunStartEmail untouched; aliases added below them).

---
*Phase: 04-email-alerts*
*Plan: 07*
*Completed: 2026-04-30*
