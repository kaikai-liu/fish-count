---
phase: 04-email-alerts
plan: 02
subsystem: alerts (anti-abuse + token primitives)
tags: [phase-4, email-alerts, anti-abuse, tokens, pure-functions, foundation, wave-0-anchor]
dependency-graph:
  requires:
    - "src/lib/shared/dates.ts (daysBetween used by warmup.dailyCap)"
    - "src/lib/components/PerAnglerMetric.svelte (refactored to consume formatPerAngler)"
    - "src/lib/copy/metrics.ts (FORECAST_LABEL/NOT_ENOUGH_HISTORY/PI_LABEL — unchanged, still consumed by PerAnglerMetric)"
    - "Wave-1 sibling: src/lib/db/signupAttempts.ts + signup_attempts table (Plan 04-01) — required at orchestrator merge for rateLimit.check/record real-DAL test path"
  provides:
    - "src/lib/alerts/tokens.ts — signToken/verifyToken across confirm|manage|unsubscribe purposes (HMAC-SHA256, timingSafeEqual, fail-closed PROJECT_SECRET)"
    - "src/lib/alerts/honeypot.ts — pure isFilled() bot-signal check"
    - "src/lib/alerts/disposableEmail.ts — isDisposable() backed by disposable-email-domains-js Set lookup"
    - "src/lib/alerts/rateLimit.ts — exceeded() pure decision + check/record DAL-routed wrappers (MAX_ATTEMPTS=3, WINDOW_SECONDS=3600)"
    - "src/lib/alerts/warmup.ts — dailyCap(today, warmupStartDate) 50/200/Infinity ramp + withinCap exclusivity check"
    - "src/lib/shared/format.ts — formatPerAngler + maskEmail (UI-SPEC FLAG #9 single source of truth for web/email)"
  affects:
    - "src/lib/components/PerAnglerMetric.svelte (historical branch now delegates to formatPerAngler — behavior unchanged)"
    - "Plan 04-03 (email composer) consumes formatPerAngler"
    - "Plan 04-04 (signup form action) composes honeypot + disposableEmail + rateLimit + tokens (confirm)"
    - "Plan 04-05 (confirm/unsubscribe routes) consumes tokens.verifyToken"
    - "Plan 04-06 (manage page) consumes tokens.signToken('manage', ...) + verifyToken"
    - "Plan 04-07 (dispatcher) consumes warmup.dailyCap + tokens.signToken('unsubscribe', ..., null)"
tech-stack:
  added:
    - "disposable-email-domains-js@^1.24.0 (runtime dep, ~106k disposable domain Set, monthly auto-sync from canonical upstream)"
  patterns:
    - "Pure decision + side-effect wrapper split (rateLimit.exceeded + check/record mirrors src/lib/scraper/sla.ts shouldAlert + checkSlaAndAlert)"
    - "HMAC-SHA256 with purpose embedded in signed payload (T-04-A3 wrong-purpose mitigation)"
    - "Constant-time signature compare with explicit length-equal guard (length-mismatch shortcuts to bad_signature; never invokes timingSafeEqual on mismatched buffers, which would itself leak length)"
    - "Random nonce in token payload so identical inputs produce distinct tokens"
    - "Fail-closed env discipline (PROJECT_SECRET <32 chars → throws on first use)"
    - "vi.hoisted DAL mock pattern for cross-wave coupling (rateLimit.test.ts pattern usable by future plans waiting on a sibling wave's DAL repo)"
key-files:
  created:
    - src/lib/alerts/tokens.ts
    - src/lib/alerts/honeypot.ts
    - src/lib/alerts/disposableEmail.ts
    - src/lib/alerts/rateLimit.ts
    - src/lib/alerts/warmup.ts
    - src/lib/shared/format.ts
    - tests/unit/shared/format.test.ts
    - tests/unit/alerts/tokens.test.ts
    - tests/unit/alerts/honeypot.test.ts
    - tests/unit/alerts/disposableEmail.test.ts
    - tests/unit/alerts/rateLimit.test.ts
    - tests/unit/alerts/warmup.test.ts
    - tests/helpers/sveltekit-env-shim.ts
  modified:
    - src/lib/components/PerAnglerMetric.svelte (historical branch consumes formatPerAngler)
    - vitest.config.ts (alias `$env/dynamic/private` → shim)
    - package.json (+ disposable-email-domains-js dep)
    - package-lock.json
decisions:
  - "tokens.ts uses Buffer.from(sig).length === Buffer.from(expected).length pre-check; mismatched-length shortcuts to bad_signature without invoking timingSafeEqual, because timingSafeEqual throws on mismatched-length buffers and the throw itself leaks length info"
  - "rateLimit.test.ts DAL block uses vi.hoisted + vi.mock signupAttempts — Plan 04-01's signup_attempts table + DAL repo lands in the same wave; mock-based test asserts the rateLimit.check signature contract (forwards db/ip/window/asOf to DAL unchanged) so the integration test on real SQLite is purely additive at merge"
  - "disposableEmail.ts imports `disposableEmailBlocklistSet` (named export) aliased as `disposableDomains` because the package has no default export — the plan's `import disposableDomains from 'disposable-email-domains-js'` would have failed compilation. The local-binding name is preserved for grep + ergonomics"
  - "vitest.config.ts adds an alias for $env/dynamic/private → tests/helpers/sveltekit-env-shim.ts (process.env Proxy). The plan's tokens.ts MUST import from `$env/dynamic/private` per acceptance criteria; without the shim, vitest cannot resolve the SvelteKit virtual module. The shim is test-only — production retains the real SvelteKit module"
  - "Added one extra `formatPerAngler` boundary test (value === 10) to satisfy the plan's '≥6 passing tests' acceptance threshold (the prescribed test source produced 5)"
metrics:
  duration_seconds: 642
  duration_human: "~11 minutes"
  tasks_completed: 3
  files_created: 13
  files_modified: 4
  tests_added: 31
  completed_date: "2026-04-29"
---

# Phase 4 Plan 02: Anti-Abuse Foundation Summary

Five pure-function anti-abuse libraries (tokens, honeypot, disposableEmail, rateLimit, warmup) plus the shared `formatPerAngler` helper that prevents web/email drift. All Wave-0 anchors of `04-VALIDATION.md` now present and green.

## What Shipped

### `src/lib/alerts/tokens.ts`

**Public API:**
- `signToken(purpose, subjectId, ttlSec | null) → string` — base64url(payload).base64url(hmac) where payload is `{p, s, e, n}` (purpose, subject id, expires-at-or-null, random nonce)
- `verifyToken(purpose, token) → { ok: true, subjectId } | { ok: false, reason: 'malformed' | 'bad_signature' | 'wrong_purpose' | 'expired' }`

**Constants:** `MIN_SECRET_LEN = 32` (PROJECT_SECRET fail-closed floor).

**Threat coverage:** T-04-A3 (replay/forgery — purpose in signed payload + tampered-signature unit test) + T-04-A12 (PROJECT_SECRET fail-closed throw) + T-04-A13 (timingSafeEqual + length-equal guard).

### `src/lib/alerts/honeypot.ts`

**Public API:** `isFilled(websiteFieldValue: string | undefined | null) → boolean` — true iff non-empty after trim.

### `src/lib/alerts/disposableEmail.ts`

**Public API:** `isDisposable(email: string) → boolean` — case-insensitive domain lookup against `disposableEmailBlocklistSet()` from disposable-email-domains-js (~106k domains, monthly auto-sync).

### `src/lib/alerts/rateLimit.ts`

**Public API:**
- `exceeded(countInWindow: number) → boolean` — pure decision, true at or above MAX_ATTEMPTS
- `check(db, ip, asOfIso) → { exceeded, count }` — reads DAL, returns decision
- `record(db, ip, asOfIso) → void` — appends to DAL

**Constants:** `WINDOW_SECONDS = 3600`, `MAX_ATTEMPTS = 3` (ALT-03).

### `src/lib/alerts/warmup.ts`

**Public API:**
- `dailyCap(today, warmupStartDate | null | undefined) → number` — 50 in week 1, 200 in week 2, Infinity from week 3+, 0 before warm-up start, Infinity when env unset
- `withinCap(sentCountToday, cap) → boolean` — exclusive (`<` not `<=`)

### `src/lib/shared/format.ts`

**Public API:**
- `formatPerAngler(value: number | null, nTrips: number) → string` — '—' for null/NaN/n=0; integer for ≥10; one-decimal with trailing-zero strip below 10
- `maskEmail(email: string) → string` — `f***@d***.tld` shape; '—' on malformed

### `src/lib/components/PerAnglerMetric.svelte` (refactor)

Historical branch lines 31-46 collapsed to `formatPerAngler(value, nTrips)`. Forecast branch unchanged (kept inline because email composer never renders forecast values). Visible behavior byte-identical pre- and post-refactor — verified by 8 passing tests in the existing `PerAnglerMetric-forecast.test.ts`.

## Constants Locked

| Constant            | Value             | Source                                |
| ------------------- | ----------------- | ------------------------------------- |
| `MIN_SECRET_LEN`    | 32                | tokens.ts (PROJECT_SECRET fail-closed) |
| `MAX_ATTEMPTS`      | 3                 | rateLimit.ts (ALT-03 verbatim)        |
| `WINDOW_SECONDS`    | 3600              | rateLimit.ts (1-hour fixed window)    |
| Warm-up cap (wk 1)  | 50/day            | warmup.ts                             |
| Warm-up cap (wk 2)  | 200/day           | warmup.ts                             |
| Warm-up cap (wk 3+) | Infinity          | warmup.ts                             |

## Wave-0 Test Files

| File | Tests |
|------|-------|
| tests/unit/shared/format.test.ts | 6 |
| tests/unit/alerts/tokens.test.ts | 8 |
| tests/unit/alerts/honeypot.test.ts | 2 |
| tests/unit/alerts/disposableEmail.test.ts | 4 |
| tests/unit/alerts/rateLimit.test.ts | 4 (2 pure + 2 DAL-mocked) |
| tests/unit/alerts/warmup.test.ts | 7 |
| **Total** | **31** |

Full project suite: 63 files / 491 tests / all green (no Phase 0/1/2/3 regressions).

## Disposable-Email Package

Installed `disposable-email-domains-js@^1.24.0` (newer than the plan's expected `^1.20.0` — npm resolved to current latest in the 1.x line). Active maintenance, monthly upstream sync, ~106k domains. CC0-1.0 license.

## Refactor Impact on PerAnglerMetric.svelte

- 1 new import line (formatPerAngler from $lib/shared/format)
- Lines 31-46 → 31-43 (5-line block reduction; forecast branch retained)
- Visible output identical — verified by `tests/unit/components/PerAnglerMetric-forecast.test.ts` (8 passes) and downstream `tests/forecast/compute.test.ts` (6 passes)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Generated SvelteKit tsconfig before first vitest run**
- **Found during:** Task 1 (RED gate)
- **Issue:** `tsconfig.json` extends `./.svelte-kit/tsconfig.json`; the generated file was absent in this fresh worktree, so vitest aborted at config load
- **Fix:** Ran `npx svelte-kit sync` to generate `.svelte-kit/tsconfig.json`
- **Files modified:** None tracked (sync output is .gitignored)
- **Commit:** N/A (pre-implementation step)

**2. [Rule 3 - Blocking] disposable-email-domains-js public API differs from plan code**
- **Found during:** Task 2 (writing disposableEmail.ts)
- **Issue:** Plan code assumed `import disposableDomains from 'disposable-email-domains-js'` resolving to a default-export array. The actual 1.24.0 package exposes only named exports (`disposableEmailBlocklist`, `disposableEmailBlocklistSet`, `isDisposableEmailDomain`, `isDisposableEmail`) and no default export
- **Fix:** Used `import { disposableEmailBlocklistSet as disposableDomains } from 'disposable-email-domains-js'` — preserves the local binding name for grep + ergonomics, calls the Set factory once at module load
- **Files modified:** src/lib/alerts/disposableEmail.ts
- **Commit:** 322f1ee

**3. [Rule 3 - Blocking] $env/dynamic/private unresolvable under vitest**
- **Found during:** Task 3 (running tokens.test.ts)
- **Issue:** SvelteKit's `$env/dynamic/private` is a virtual module supplied by the SvelteKit Vite plugin. Vitest doesn't load that plugin, so `import { env } from '$env/dynamic/private'` failed with "Failed to load url"
- **Fix:** Created `tests/helpers/sveltekit-env-shim.ts` (process.env-backed Proxy with the same `{ env: ... }` shape) and aliased `$env/dynamic/private` → shim in `vitest.config.ts`. Production behavior unchanged — only the vitest runtime sees the shim
- **Files modified:** vitest.config.ts, tests/helpers/sveltekit-env-shim.ts (new)
- **Commit:** 49902b6

**4. [Rule 3 - Blocking] rateLimit.test.ts can't reach Plan 01's signupAttempts**
- **Found during:** Task 3
- **Issue:** Plan 02 declares `depends_on: []` and runs in wave 1 alongside Plan 01. The plan's prescribed rateLimit test imports `runMigrations` + `rateLimit` (which transitively imports `$lib/db/signupAttempts`). In this isolated worktree, signupAttempts.ts doesn't exist (it's Plan 01's deliverable)
- **Fix:** Used `vi.hoisted` + `vi.mock('$lib/db/signupAttempts', ...)` to provide a DAL double. The mock asserts the call-signature contract (db/ip/window/asOf forwarded unchanged) — the real-DAL integration test path activates after Plan 01 + 02 merge into the phase branch
- **Files modified:** tests/unit/alerts/rateLimit.test.ts
- **Commit:** 49902b6

### Plan-Inconsistency Adjustments

**5. [Rule 2 - Coverage] Added one extra formatPerAngler test to meet ≥6 acceptance**
- **Found during:** Task 1 (verification)
- **Issue:** Plan acceptance criteria says `≥6 passing tests` but the prescribed test source contained only 5 it() blocks
- **Fix:** Added a boundary test (`value === 10` exact) — covers the `>= 10` branch entry condition without changing the contract
- **Files modified:** tests/unit/shared/format.test.ts
- **Commit:** b1d4536

## Authentication Gates

None encountered — all work is local file creation + npm install (no external auth required).

## Threat Mitigation Status

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| T-04-A3 (token replay/forgery) | mitigated | `verifyToken('manage', signedAsConfirm)` returns `{ok:false, reason:'wrong_purpose'}`; tampered-byte verification returns `{ok:false, reason:'bad_signature'}` (8 tests in tokens.test.ts) |
| T-04-A2 (bot signup flooding) | mitigated | honeypot.isFilled + disposableEmail.isDisposable + rateLimit.exceeded(3) all green; ordering enforced by Plan 04-04 |
| T-04-A12 (PROJECT_SECRET fail-closed) | mitigated | tokens.test.ts asserts throw on missing AND on `<32` char secret |
| T-04-A13 (timing-side-channel) | mitigated | timingSafeEqual + length-equal guard; comment in tokens.ts explains why mismatched-length must not invoke timingSafeEqual directly |
| T-04-A5 (DAL boundary in alerts/) | mitigated | `grep -E "(SELECT\|INSERT\|UPDATE\|DELETE) " src/lib/alerts/*.ts` returns 0 matches |
| T-04-FORMAT-01 (email masking) | mitigated | maskEmail + 2 tests covering `f***@d***.tld` shape and em-dash on malformed input |

No new threat surface flags introduced — all changes stay within scope of existing `<threat_model>` mitigations.

## Commits

- `b1d4536` — feat(04-02): extract formatPerAngler + add disposable-email-domains-js
- `322f1ee` — feat(04-02): add tokens + 4 anti-abuse pure libs (honeypot, disposableEmail, rateLimit, warmup)
- `49902b6` — test(04-02): add 5 anti-abuse + token unit-test files (Wave-0 anchors)

## Self-Check: PASSED

All claimed files exist, all claimed commits are in `git log`, all 31 plan-introduced tests pass, full project suite (491 tests) green, no inline SQL in `src/lib/alerts/`, no behavior change in PerAnglerMetric.svelte historical branch.
