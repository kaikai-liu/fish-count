---
phase: 04-email-alerts
plan: 04
subsystem: ui
tags: [phase-4, email-alerts, signup, form-actions, anti-abuse, anti-enumeration, sveltekit, zod, ui]

# Dependency graph
requires:
  - phase: 04-email-alerts/01
    provides: subscribers DAL (createPending, findActive, findRecentPending), suppressionList.has, signupAttempts ledger
  - phase: 04-email-alerts/02
    provides: honeypot.isFilled, rateLimit.check/record, disposableEmail.isDisposable, signToken, dailyCap, maskEmail
  - phase: 04-email-alerts/03
    provides: renderConfirmationEmail, buildEmail, sendUserEmail (Resend wrapper with RFC 8058 headers + tracking off)
provides:
  - SignupForm.svelte component (honeypot-first, no-JS-fallback, multi-select boats/species, accessible inline errors)
  - /alerts route with the full 7-step anti-abuse pipeline (Zod → honeypot → rate-limit-check → rate-limit-record → disposable → suppression → already-pending → already-active → happy)
  - /alerts/pending generic-success page (shape-identical for all 3 silent-success branches)
  - DAL helper boats.listForSelect (preserves CLAUDE.md DAL boundary)
  - 7 integration tests covering pipeline behavior + T-04-A1 anti-enumeration parity
affects: [04-05 (consumes /alerts/confirm endpoint stub + uses signed confirm tokens), 04-06 (uses ?boat=ID + ?species=NAME pre-fill contracts), 04-07 dispatcher (depends on subscribers in pending → active state machine)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pipeline ordering as a single linear actions.default: cheap guards (honeypot) before expensive ones (DB reads, Resend send) — declared explicitly in source comments numbered 1..8"
    - "Anti-enumeration via shape-identical responses: every silent-success branch redirect(303, /alerts/pending?m={masked}) — bot probing yields zero discriminating signal"
    - "Resend send wrapped in try/catch inside happy path — outage logs + operator-alert but still 303s the user; pending row remains so re-signup silent-succeeds via already-pending (no confirm-spam, Pitfall 1)"
    - "vi.mock('$lib/db/client') with module-scoped in-memory SQLite singleton + __reset hook in beforeEach for integration tests of route actions that use getDb() at call time"

key-files:
  created:
    - src/lib/components/SignupForm.svelte
    - src/routes/alerts/+page.server.ts
    - src/routes/alerts/+page.svelte
    - src/routes/alerts/pending/+page.server.ts
    - src/routes/alerts/pending/+page.svelte
    - tests/integration/alerts/signup.test.ts
    - tests/integration/alerts/anti-enumeration.test.ts
  modified:
    - src/lib/db/boats.ts (added listForSelect helper for /alerts multi-select)

key-decisions:
  - "Pipeline ordering: rate-limit RECORD fires at step 3.5 (immediately after rate-limit CHECK passes, before disposable + suppression checks) so disposable-blocked attempts also consume rate-limit budget. Blocks the 'burn N disposable attempts then submit a real one' attack pattern (T-04-A2 mitigation)."
  - "All three silent-success branches redirect(303, /alerts/pending?m={masked}) instead of returning ActionResult { ok: true } — this guarantees no-JS form submitters complete a full HTTP cycle AND makes anti-enumeration parity provable via Location-header equality (T-04-A1 mitigation)."
  - "Resend send failure inside happy path is non-fatal: try/catch logs + fires sendOperatorAlert but the user still receives the same 303 redirect. Pending row remains; next signup attempt silent-succeeds via already-pending so no confirm-spam (Pitfall 1)."
  - "DAL helper listForSelect added to src/lib/db/boats.ts rather than inlining SQL in +page.server.ts — preserves CLAUDE.md DAL boundary; dal-boundary.test.ts still green."
  - "Pre-selection from ?boat=ID + ?species=NAME query strings parsed defensively in load(): boat ids coerced to numbers + filtered for finite > 0; species filtered for non-empty. Plan 06's inline CTAs from /boats/[id] + /picker round-trip cleanly."

patterns-established:
  - "7-step anti-abuse pipeline as a single ordered actions.default body — declared verbatim in numbered comments + enforced by an awk-based ordering invariant in the plan's acceptance criteria"
  - "Generic-success page shape contract — /alerts/pending validates ?m= via /^[^@]+\\*\\*\\*@[^@]+\\*\\*\\*\\.[a-zA-Z]{2,}$/ regex so a crafted querystring cannot smuggle markup or a real email"
  - "Integration-test mock of $lib/db/client returning a per-test in-memory SQLite singleton with a __reset hook called in beforeEach"

requirements-completed: [ALT-01, ALT-02, ALT-03, ALT-04, ALT-06]

# Metrics
duration: 10min
completed: 2026-04-29
---

# Phase 4 Plan 4: Public Signup Write-Path Summary

**SvelteKit /alerts route with the full 7-step anti-abuse pipeline (honeypot → rate-limit → disposable → suppression → already-pending → already-active → confirm-send), shape-identical anti-enumeration response on three silent-success branches, and 7 passing integration tests covering ALT-01/02/03/04/06.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-29T23:30:10Z
- **Completed:** 2026-04-29T23:42:00Z
- **Tasks:** 3
- **Files created:** 7
- **Files modified:** 1

## Accomplishments

- Public signup form ships with honeypot-first DOM order and a native `<form method="POST">` no-JS fallback. Submission completes a full HTTP cycle without any JavaScript on the page.
- /alerts +page.server.ts implements the full 7-step ordered anti-abuse pipeline (CLAUDE.md non-negotiable #5 — every guard from rule #5 lands here in the right order, with the load-bearing rate-limit-record-at-step-3.5 placement).
- T-04-A1 anti-enumeration mitigated and proven: honeypot-triggered, suppressed-email, and already-pending submissions all 303-redirect to `/alerts/pending?m={masked}` with the same masked-email shape. A bot cannot distinguish them by status code, redirect target, or response body.
- Confirmation send wrapped in try/catch — Resend outage does NOT 500 the user; the operator gets an alert and the pending row remains so the user's next signup silent-succeeds via already-pending (no confirm-spam, Pitfall 1).
- 7 integration tests pass (6 happy/sad-path + 1 anti-enumeration parity); full prior suite (592 tests) still green.

## Task Commits

Each task was committed atomically:

1. **Task 1: SignupForm.svelte component** — `6deb1c3` (feat)
2. **Task 2: /alerts route + 7-step pipeline + /alerts/pending + DAL helper** — `ece4a19` (feat)
3. **Task 3: Integration tests (signup + anti-enumeration)** — `98883db` (test)

## Files Created/Modified

- `src/lib/components/SignupForm.svelte` — Signup form component. Honeypot is the first input in the DOM (visually hidden via absolute positioning + tabindex=-1 + aria-hidden); native `<form method="POST">` works without JS; multi-select boats + species inputs preselected from props; `min-h-11` on every interactive control for 44px touch targets; inline email validation error + page-level rate-limit error + warm-up banner all conditional on action result / load data.
- `src/routes/alerts/+page.server.ts` — Load returns `{ boats, species, preselectedBoats, preselectedSpecies, showWarmupBanner }`. `actions.default` runs the ordered pipeline: Zod parse (400 with fieldErrors) → honeypot (silent 303) → rate-limit check (page-level 429) → rate-limit record (step 3.5) → disposable-email (inline 400) → suppression (silent 303) → already-pending (silent 303) → already-active (303 to /alerts/confirmed) → happy path (createPending + signToken + try/catch sendUserEmail + 303 to /alerts/pending). Sets `Referrer-Policy: same-origin` (T-04-A4).
- `src/routes/alerts/+page.svelte` — Renders `<PageHeader>`, `<SignupForm>`, and a `<details>` expander explaining the two alert types and linking to `/about#email`.
- `src/routes/alerts/pending/+page.server.ts` — Validates the `?m=` querystring via a masked-email regex so a crafted value cannot smuggle markup or a real email; sets `Cache-Control: no-store` + `Referrer-Policy: same-origin`.
- `src/routes/alerts/pending/+page.svelte` — Generic-success page rendering verbatim UI-SPEC copy ("Check your email" / "You're not subscribed to anything yet…").
- `src/lib/db/boats.ts` — Added `listForSelect(db)` returning `{ id, display_name }` ordered by display_name; preserves CLAUDE.md DAL boundary so the route never inlines SQL.
- `tests/integration/alerts/signup.test.ts` — 6 tests: happy path + missing email + bad email + no follows + disposable-email + 4th-attempt-rate-limit.
- `tests/integration/alerts/anti-enumeration.test.ts` — 1 test: T-04-A1 parity check across honeypot/suppression/already-pending/happy-path branches; sendMock fires only on happy path.

## Decisions Made

- **Pipeline ordering is the same as the plan's declared 1..8 steps.** No reordering. The rate-limit-record-at-step-3.5 placement is load-bearing per T-04-A2 and is asserted by both an awk ordering invariant in the plan's acceptance criteria and the rate-limit integration test (4th attempt → 429).
- **All silent-success branches redirect 303 instead of returning ActionResult.** Lets the no-JS form submitter complete a full HTTP cycle, AND makes anti-enumeration parity provable via Location-header equality. This is exactly what the anti-enumeration test asserts.
- **Resend send failure is non-fatal in the happy path.** try/catch around sendUserEmail logs + fires sendOperatorAlert but still 303s the user. Pending row remains; user can re-signup which silent-succeeds via already-pending (Pitfall 1 anti-confirm-spam).
- **`listForSelect` lives in src/lib/db/boats.ts.** The route imports it. Keeps the dal-boundary.test.ts grep green (no SELECT/INSERT/UPDATE/DELETE in route files).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Lint violation triggered by new file] Replaced inline `fish/angler` literal with FISH_PER_ANGLER_AXIS constant**
- **Found during:** Task 3 (full-suite run after writing integration tests)
- **Issue:** The `<details>` expander on `/alerts/+page.svelte` (added in Task 2) contained the verbatim phrase "avg fish/angler more than 2× its trailing 30-day same-trip-type average". `tests/unit/lint/per-angler-discipline.test.ts` enforces CLAUDE.md non-negotiable #4 by failing any literal "fish/angler" or "per angler" outside the 3 allowlisted files (PerAnglerMetric.svelte, /about/+page.svelte, src/lib/copy/metrics.ts). My new route violated the lint.
- **Fix:** Imported `FISH_PER_ANGLER_AXIS` from `$lib/copy/metrics` (the constants module that is the single source of truth for this string per Plan 02-02) and interpolated it in place of the inline literal. The user-visible copy is identical; the discipline lint passes.
- **Files modified:** `src/routes/alerts/+page.svelte`
- **Verification:** `npm test -- --run tests/unit/lint/per-angler-discipline.test.ts` — 2/2 pass.
- **Committed in:** `98883db` (folded into Task 3 commit since it was discovered during Task 3 verification).

**2. [Rule 1 - Bug in test regex] Anti-enumeration regex mis-matched percent-encoded `@`**
- **Found during:** Task 3 (first test run)
- **Issue:** The plan's literal regex `/^\/alerts\/pending\?m=h[^@]*\*\*\*@b\*\*\*\.com$/` expects a literal `@` in the redirect Location, but the route action calls `encodeURIComponent(masked)` which encodes `@` → `%40`. All four sub-assertions failed with "expected '/alerts/pending?m=h***%40b***.com' to match …".
- **Fix:** Replaced the literal `@` with `%40` in all four regex assertions in `anti-enumeration.test.ts`. The actual production behavior is correct (URL-safe encoding via encodeURIComponent is the right call); only the test regex needed to match the encoded form.
- **Files modified:** `tests/integration/alerts/anti-enumeration.test.ts`
- **Verification:** `npm test -- --run tests/integration/alerts/anti-enumeration.test.ts` — 1/1 pass.
- **Committed in:** `98883db` (Task 3 commit).

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs introduced during the task)
**Impact on plan:** Both auto-fixes were trivial in scope and necessary for correctness. No scope creep, no architectural changes. The pipeline ordering, response shapes, copy, and security mitigations all match the plan exactly.

## Threat Coverage

| Threat ID | Mitigation as shipped |
|-----------|------------------------|
| T-04-A1 (enumeration via response shape) | Honeypot, suppression, and already-pending all `redirect(303, /alerts/pending?m={masked})` — Location-header parity asserted in `anti-enumeration.test.ts`; `sendMock` fires only on happy path. |
| T-04-A2 (burn-disposable-then-real attack) | `rateLimit.record` fires at step 3.5 (after rate-limit pass, before disposable check) — disposable-blocked attempts consume budget. 4th-attempt-429 test verifies the cumulative cap. |
| T-04-A3 (token forgery / replay) | Confirm token signed by Plan 02 `signToken('confirm', id, 86400)` with HMAC-SHA256 + 24h TTL + purpose binding. Plan 05 verifies on click. |
| T-04-A4 (referrer leak of manage tokens) | `Referrer-Policy: same-origin` set on both `/alerts` and `/alerts/pending`. |
| T-04-A5 (route-layer SQL injection / DAL bypass) | All DB access via DAL functions; new `listForSelect` added to `boats.ts`; `dal-boundary.test.ts` still green (no SQL outside `src/lib/db/`). |
| T-04-A7 (reputation poisoning via suppressed sends) | Step 5 silent-success short-circuits BEFORE `sendUserEmail`; anti-enumeration test asserts `sendMock not called` for the suppressed branch. |
| T-04-A02-CONFIRM-FAIL (Resend outage UX) | try/catch around `sendUserEmail` in happy path — operator alert fires, pending row remains, user still sees 303. Re-signup silent-succeeds via already-pending. |
| T-04-A02-PARSE (malformed FormData) | Zod `SignupSchema` coerces boats to positive integers, trims species, validates email shape; bad input → 400 with structured `fieldErrors`. |
| T-04-PII-LOG (raw email in logs) | All log lines use structured fields; raw email never passed; `logger` redact paths cover `*.email` and `*.token`. |

## Issues Encountered

None — both deviations were trivial and resolved inline within Task 3. The full prior suite (592 tests) stayed green throughout.

## User Setup Required

None — no external service configuration introduced by this plan. (The plan composes Plan 03's existing Resend wrapper, which itself depends on env vars `RESEND_API_KEY`, `SUBSCRIBER_FROM_EMAIL`, `POSTAL_ADDRESS` already documented in Plan 03's USER-SETUP.md.)

## Self-Check: PASSED

Verified:
- `src/lib/components/SignupForm.svelte` — FOUND
- `src/routes/alerts/+page.server.ts` — FOUND
- `src/routes/alerts/+page.svelte` — FOUND
- `src/routes/alerts/pending/+page.server.ts` — FOUND
- `src/routes/alerts/pending/+page.svelte` — FOUND
- `src/lib/db/boats.ts` listForSelect helper — FOUND (`grep -c "export function listForSelect"` returns 1)
- `tests/integration/alerts/signup.test.ts` — FOUND, 6/6 pass
- `tests/integration/alerts/anti-enumeration.test.ts` — FOUND, 1/1 pass
- Commit `6deb1c3` (Task 1) — FOUND in git log
- Commit `ece4a19` (Task 2) — FOUND in git log
- Commit `98883db` (Task 3) — FOUND in git log
- Full suite `npm test -- --run` — 592/592 pass

## Next Phase Readiness

Plan 04-04 hands off cleanly to Plan 04-05 (confirm/manage/unsubscribe routes):
- Pending subscriber rows + 24h confirm tokens are written; Plan 05 reads `verifyToken('confirm', token)` and calls `subscribers.activate(id)`.
- Suppression list, anti-enumeration discipline, and DAL boundary are all preserved — Plan 05's manage/unsubscribe routes can compose them directly.
- `/alerts/confirmed?already=1` route stub is referenced by step 7 of the pipeline; Plan 05 owns building it.

---
*Phase: 04-email-alerts*
*Plan: 04*
*Completed: 2026-04-29*
