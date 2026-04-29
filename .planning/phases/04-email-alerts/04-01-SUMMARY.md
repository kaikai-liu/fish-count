---
phase: 04-email-alerts
plan: 01
subsystem: database
tags: [phase-4, email-alerts, dal, schema, sqlite, better-sqlite3, vitest]

# Dependency graph
requires:
  - phase: 01-ingestion
    provides: boats + landings tables that subscriber_boats FKs to
  - phase: 03-forecasts
    provides: SCHEMA_SQL append pattern (forecasts table) — extended verbatim
provides:
  - 6 new SQLite tables (subscribers, subscriber_boats, subscriber_species, suppression_list, signup_attempts, alerts_sent)
  - 4 new indexes (idx_subscribers_status, idx_signup_attempts_ip_time, idx_alerts_sent_unique, idx_alerts_sent_sent_at)
  - 4 new DAL repositories (subscribers, suppressionList, signupAttempts, alertsSent)
  - Extended seedTestDb helper with seedSubscriber + seedSuppressed
  - Vitest scaffolds (4 test files, 36 tests) — Wave 0 anchors for downstream Phase 4 plans
affects: [04-02-rate-limit, 04-03-signup-confirm, 04-04-manage-prefs, 04-05-evaluators, 04-06-dispatcher, 04-07-routes]

# Tech tracking
tech-stack:
  added: []  # No new libraries — schema + DAL only
  patterns:
    - "Email canonicalization at DAL write/read boundary (lowercase + trim) — sole producer pattern, mirrors STO-04 dates discipline"
    - "ALT-11 dedup enforced at TWO layers — UNIQUE schema index + recordSent throws on conflict — fail-loud not silent"
    - "Caller-supplied timestamp on signupAttempts.recordAttempt — STO-04 sole-date-producer extended to ledger writes"
    - "Numeric-only dynamic placeholder construction in markExpired (T-04-A5 mitigation) — values pass through .run(...ids)"

key-files:
  created:
    - src/lib/db/subscribers.ts
    - src/lib/db/suppressionList.ts
    - src/lib/db/signupAttempts.ts
    - src/lib/db/alertsSent.ts
    - tests/unit/db/subscribers.test.ts
    - tests/unit/db/suppressionList.test.ts
    - tests/unit/db/signupAttempts.test.ts
    - tests/unit/db/alertsSent.test.ts
  modified:
    - src/lib/db/migrations.ts
    - tests/unit/db/migrations.test.ts
    - tests/helpers/seedTestDb.ts

key-decisions:
  - "createPending re-signup of an active subscriber demotes status back to pending and clears confirmed_at — by design, since the user clicked Sign Up again with new preferences. v1 keeps DAL semantics simple; route layer (Plan 04-03) is expected to handle the rare 'demote already-active subscriber' edge case if it matters."
  - "Email canonicalization (lowercase + trim) lives ONLY in subscribers.ts and suppressionList.ts — call sites in later plans pass raw input. Single source of normalization defends against case-mixed duplicate signups (T-04-DAL-01) and ensures suppression-list lookups match writes."
  - "listActive uses N+1 follow-loop (one prepared statement per subscriber to load boats/species). At v1 scale (~hundreds of subscribers) this is fine; if scale demands, swap for a single JOIN query — public shape does not change."
  - "alertsSent.exists() returns true even on queued rows (B1 contract) — prevents the evaluator from queueing the SAME (subscriber, kind, trigger_key, trigger_date) twice. Dispatcher's drain path bypasses exists() by design via listQueued()/markSent(id)."
  - "signupAttempts.recordAttempt takes a caller-supplied ISO timestamp (not derived inside the DAL) so unit tests can inject deterministic instants and the route handler stamps with the same instant it logged for the request — STO-04 sole-date-producer principle extended to ledger writes."

patterns-established:
  - "TDD on schema additions: failing migration tests committed first (RED), then DDL append (GREEN). Schema invariants — column lists, CHECK constraints, UNIQUE indexes, ON DELETE CASCADE — are all locked at the test layer before any DDL ships."
  - "DAL boundary header comment '// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.' is the canonical first non-import line of every src/lib/db/*.ts file. dal-boundary.test.ts continues to enforce no-SQL outside src/lib/db/."
  - "createPending wraps multi-table writes (subscribers + subscriber_boats + subscriber_species) in db.transaction() so partial failures cannot corrupt follow-state. Transactional batch-upsert mirrors catchReports.ts upsertMany pattern."

requirements-completed: [ALT-01, ALT-02, ALT-03, ALT-06, ALT-11]

# Metrics
duration: 8min
completed: 2026-04-29
---

# Phase 04 Plan 01: Email-Alerts DAL Foundation Summary

**6 SQLite tables + 4 typed DAL repositories establishing the schema and read/write primitives every later Phase 4 plan (anti-abuse, evaluators, dispatcher, routes) builds on, with email canonicalization and ALT-11 dedup enforced at both schema and DAL layers.**

## Performance

- **Duration:** ~8 minutes
- **Started:** 2026-04-29T19:07:00Z
- **Completed:** 2026-04-29T19:15:00Z
- **Tasks:** 3
- **Commits:** 4 (TDD RED + GREEN for Task 1, single commit each for Tasks 2 and 3)
- **Files created:** 8 (4 DAL + 4 test files)
- **Files modified:** 3 (migrations.ts, migrations.test.ts, seedTestDb.ts)

## Accomplishments

- Phase 4 schema (6 tables, 4 indexes) appended to canonical SCHEMA_SQL — `runMigrations()` is still idempotent and bootstraps the entire schema in a single `db.exec`.
- ALT-11 dedup enforced at the schema layer via `UNIQUE(subscriber_id, kind, trigger_key, trigger_date)` AND at the DAL layer via `recordSent` throwing on UNIQUE conflict — fail-loud, not silent.
- Email canonicalization (`lowercase + trim`) confined to two files (`subscribers.ts`, `suppressionList.ts`) — every call site in later plans passes raw user input and gets normalization automatically.
- Sliding-window signup-attempt counter (`countWithinWindow`) implemented via SQLite `datetime('-N seconds')` arithmetic — algorithmic core of the ALT-03 rate-limit gate Plan 04-02 will wire up.
- Vitest scaffolds (36 tests across 4 files) anchor every downstream Phase 4 plan's `<verify>` block. Total DAL test count: 161 (was 125; +36 from this plan).
- Full test suite remains green: 507/507 across 61 files.

## Task Commits

Each task was committed atomically (TDD-strict for Task 1):

1. **Task 1 RED: Failing migration tests for Phase 4 schema** — `fa1ce38` (`test(04-01): add failing tests for Phase 4 schema...`)
2. **Task 1 GREEN: Append Phase 4 DDL to SCHEMA_SQL** — `eaf6954` (`feat(04-01): add Phase 4 email-alerts schema (6 tables, 4 indexes)`)
3. **Task 2: Four DAL repositories** — `3f2bbb0` (`feat(04-01): add 4 DAL repositories for Phase 4 email-alerts`)
4. **Task 3: Test scaffolds + seedTestDb extensions** — `0689544` (`test(04-01): add 4 DAL test files + extend seedTestDb with Phase 4 seeders`)

## Files Created/Modified

### Created

- `src/lib/db/subscribers.ts` — 9 exports: `createPending` (transactional upsert + follow lists), `activate`, `findActive`, `findRecentPending`, `findById`, `listActive` (paused_until filter), `deleteForUnsubscribe` (CASCADE), `getSummary`, `updatePreferences`. Email canonicalization at every read/write boundary.
- `src/lib/db/suppressionList.ts` — 3 exports: `add` (idempotent INSERT OR IGNORE), `has` (anti-enumeration single indexed lookup), `list` (operator helper).
- `src/lib/db/signupAttempts.ts` — 2 exports: `recordAttempt` (caller-supplied timestamp), `countWithinWindow` (sliding-window via SQLite datetime arithmetic).
- `src/lib/db/alertsSent.ts` — 7 exports: `exists` (ALT-11 dedup gate, true on queued too), `recordSent`, `recordQueued`, `countSentSince` (ALT-12 warm-up cap), `listQueued`, `markExpired` (Pitfall-7 TTL flip), `markSent` (queued → sent transition).
- `tests/unit/db/subscribers.test.ts` — 17 tests covering full state-machine, canonicalization, paused_until, CASCADE, updatePreferences three-mode pause semantics.
- `tests/unit/db/suppressionList.test.ts` — 5 tests covering canonicalization, idempotency, CHECK constraint, ordering.
- `tests/unit/db/signupAttempts.test.ts` — 5 tests covering windowed-count math (4 attempts at t=0; window=3600 → 4 at +30min, 0 at +61min), inclusive lower bound, IP scoping.
- `tests/unit/db/alertsSent.test.ts` — 9 tests covering ALT-11 dedup, B1 contract, countSentSince filter, listQueued ordering, markExpired no-op on already-sent, markSent promote.

### Modified

- `src/lib/db/migrations.ts` — Appended 6 `CREATE TABLE IF NOT EXISTS` statements + 4 indexes inside the existing `SCHEMA_SQL` template literal (no separate `db.exec` call — preserves transactional DDL semantics).
- `tests/unit/db/migrations.test.ts` — Added a second `describe` block (`migrations — Phase 4 email-alerts schema`) with 9 tests + extended the idempotency test's expected-tables list.
- `tests/helpers/seedTestDb.ts` — Added `seedSubscriber` and `seedSuppressed` helpers; preserved existing `seedBoat`/`seedTrip`/`seedTripsBatch` exports.

### Schema (column lists for downstream plans)

**subscribers** — `id INTEGER PK AUTOINCREMENT, email TEXT NOT NULL UNIQUE, status TEXT CHECK IN (pending, active), created_at TEXT DEFAULT now, confirmed_at TEXT, signup_ip TEXT, paused_until TEXT`

**subscriber_boats** — `subscriber_id INTEGER, boat_id INTEGER, PK (subscriber_id, boat_id), FK ON DELETE CASCADE → subscribers, FK → boats`

**subscriber_species** — `subscriber_id INTEGER, species TEXT, PK (subscriber_id, species), FK ON DELETE CASCADE → subscribers`

**suppression_list** — `email TEXT PRIMARY KEY, suppressed_at TEXT DEFAULT now, reason TEXT CHECK IN (user_unsub, operator_remove)`

**signup_attempts** — `id INTEGER PK AUTOINCREMENT, ip TEXT, attempted_at TEXT DEFAULT now`

**alerts_sent** — `id INTEGER PK AUTOINCREMENT, subscriber_id INTEGER, kind TEXT CHECK IN (hot_day, starting_to_run), trigger_key TEXT, trigger_date TEXT, status TEXT CHECK IN (queued, sent, expired), queued_at TEXT DEFAULT now, sent_at TEXT, resend_message_id TEXT, FK ON DELETE CASCADE → subscribers`

## Decisions Made

See frontmatter `key-decisions` section. The five decisions all relate to subtle design choices the plan left implicit; all are documented in DAL file comments at the relevant call sites.

## Deviations from Plan

**One environment fix during Task 1 RED phase:**

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebuilt better-sqlite3 native module for current Node version**

- **Found during:** Task 1 RED (running migrations test for first time after worktree branch reset)
- **Issue:** better-sqlite3 had been compiled against `NODE_MODULE_VERSION 127` but the current Node runtime expected `NODE_MODULE_VERSION 141`. All DB-touching tests crashed at `new Database(':memory:')` before any test logic ran.
- **Fix:** Ran `npm rebuild better-sqlite3` to recompile the native binding for the current Node runtime.
- **Files modified:** None (only `node_modules/better-sqlite3/build/` regenerated, which is git-ignored).
- **Verification:** All 20 migrations tests progressed past the binding error; the 9 new Phase 4 tests then failed for the expected RED-phase reason (tables don't exist yet), confirming the rebuild fixed only the environment issue.
- **Committed in:** N/A — node_modules is git-ignored, so no commit.

---

**Total deviations:** 1 auto-fixed (1 environment-blocking)
**Impact on plan:** Pure environment correction. No scope creep, no schema changes, no DAL behavior changes.

**No deviations from the planned schema, exports, or test contracts.** The plan was implementation-ready: every DDL statement, function signature, and test assertion shipped verbatim or in the documented spirit.

## Issues Encountered

- **better-sqlite3 binding mismatch** — handled as the deviation above. Resolved on first attempt; no further occurrence after rebuild.
- **Pre-existing typecheck noise:** `npx tsc --noEmit` reports 272 errors across the repo, but `npx tsc --noEmit | grep "^src/lib/db/"` returns 0 — the new DAL files contribute zero new type errors. Pre-existing errors are in `tests/unit/routes/home.test.ts`, `vite.config.ts`, etc., and are out of scope per the executor's scope-boundary rule. Logged here so a future plan can address the test-config drift.

## TDD Gate Compliance

Task 1 followed strict TDD: RED commit (`fa1ce38`, `test(04-01): ...`) precedes GREEN commit (`eaf6954`, `feat(04-01): ...`). Tasks 2 and 3 are non-TDD (Task 2 is DAL implementation prep for Task 3's tests; Task 3 IS the test-creation task) — pure-test commit (`0689544`, `test(04-01): ...`) follows the impl commit, which is the correct sequence for this Wave-0 scaffold pattern.

## Self-Check

- [x] `src/lib/db/subscribers.ts` exists (496 bytes header + 9 exports — verified via `head -3` grep)
- [x] `src/lib/db/suppressionList.ts` exists (3 exports + canonicalization)
- [x] `src/lib/db/signupAttempts.ts` exists (2 exports)
- [x] `src/lib/db/alertsSent.ts` exists (7 exports including markSent)
- [x] All 4 test files exist (`tests/unit/db/{subscribers,suppressionList,signupAttempts,alertsSent}.test.ts`)
- [x] Migrations.ts contains 6 new CREATE TABLE statements (verified via grep)
- [x] alerts_sent UNIQUE index present (`grep "CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_sent_unique"` → 1 match)
- [x] All 4 commits exist in `git log 18a2d27..HEAD`: fa1ce38, eaf6954, 3f2bbb0, 0689544
- [x] Full DAL suite passes: 161/161
- [x] Full test suite passes: 507/507

## Self-Check: PASSED

## Next Phase Readiness

**Plan 04-02 (rate-limit) is unblocked:** `signupAttempts.countWithinWindow` is the only DAL primitive that plan needs — wire `src/lib/alerts/rateLimit.ts` to it.

**Plan 04-03 (signup/confirm) is unblocked:** `subscribers.createPending` + `subscribers.findRecentPending` + `subscribers.activate` + `suppressionList.has` cover the entire signup → email-confirm → activate happy path.

**Plan 04-04 (manage-prefs) is unblocked:** `subscribers.getSummary` + `subscribers.updatePreferences` + `subscribers.deleteForUnsubscribe` cover the manage page CRUD.

**Plan 04-05 (evaluators) is unblocked:** `alertsSent.exists` (dedup gate) + `alertsSent.recordQueued` (queue write) — pure-fn evaluator imports remain clean per RESEARCH §pattern-3.

**Plan 04-06 (dispatcher) is unblocked:** `alertsSent.listQueued` + `alertsSent.markSent` + `alertsSent.markExpired` + `alertsSent.countSentSince` cover queue-drain + warm-up cap + 24h TTL.

**Plan 04-07 (routes) is unblocked:** All read paths (`subscribers.findById`, `subscribers.findActive`, `subscribers.getSummary`) ship today.

No blockers. No concerns.

---
*Phase: 04-email-alerts*
*Completed: 2026-04-29*
