---
phase: 00-ops-guardrails
plan: 05
subsystem: ops
tags: [ops, billing, alerts, resend, github-actions, OPS-01]
requires:
  - resend@^6.12.2 (already installed in Plan 00)
  - src/lib/shared/dates.ts (Plan 00 scaffold — sole date producer)
  - src/lib/server/logger.ts (placeholder logger shipped in scaffold; replaced in Plan 02)
provides:
  - sendOperatorAlert — Resend wrapper reused by Phase 1 ING-07 row-count SLA and Phase 4 ops alerts
  - checkThresholds / loadOrResetState / emptyState / currentMonthKey — pure idempotent state machine
  - scripts/billing-watcher.ts — node --experimental-strip-types entry point
  - .github/workflows/billing-check.yml — weekly cron invoking the watcher
  - .billing-alerts-state.json — persisted-in-repo cross-run state
affects:
  - vitest.config.ts (added $lib alias so tests can load src/lib/alerts/operator.ts)
  - src/lib/ops/billing.ts (.ts extension on relative imports for Node 22 strip-types compat)
tech-stack:
  added: []  # resend, node 22 strip-types already in stack
  patterns:
    - "GitHub Actions cron for separation-of-fate billing watcher (outside Fly)"
    - "Pure idempotent threshold state machine with explicit ThresholdState type"
    - "State persisted in repo via contents:write and [skip ci] commit"
    - "Fly GraphQL field-name probing (billingStatus.currentMonthSpend → monthToDateSpend → billingInfo fallback) with loud-fail on shape drift"
key-files:
  created:
    - src/lib/alerts/operator.ts
    - src/lib/ops/billing.ts
    - scripts/billing-watcher.ts
    - .github/workflows/billing-check.yml
    - .billing-alerts-state.json
    - tests/ops/billing.test.ts
    - tests/ops/operator-alert.test.ts
    - docs/ops-billing.md
  modified:
    - vitest.config.ts
decisions:
  - Import checkThresholds directly from src/lib/ops/billing.ts in the watcher instead of duplicating the function body (Option A from plan — eliminates drift class entirely).
  - Relative import `../shared/dates.ts` (not `$lib/shared/dates`) in billing.ts so the watcher can load it via `node --experimental-strip-types` without a Vite alias resolver.
  - Use explicit `.ts` extension on all relative TS imports in the watcher chain (billing.ts → dates.ts) — required by Node 22's ESM strip-types loader.
  - Inline Resend send in watcher (not reusing sendOperatorAlert) because operator.ts imports `$lib/server/logger` which needs the SvelteKit alias resolver — watcher runs outside SvelteKit, so keeping the wrapper for in-app callers and inlining a minimal send for the script is cleaner than bundling or aliasing.
  - Add `$lib -> src/lib` alias to vitest.config.ts so unit tests of modules that import from `$lib/...` work. SvelteKit's own plugin sets this during `vite dev/build`, but vitest bypasses it.
metrics:
  duration_minutes: 12
  start: 2026-04-23T17:40:00Z
  end: 2026-04-23T17:53:00Z
  tasks_completed: 3
  files_created: 8
  files_modified: 2
  tests_added: 17
  tests_passing: 17
---

# Phase 0 Plan 5: Billing watcher Summary

OPS-01 billing alerts for Fly.io — a DIY GitHub Actions cron that queries Fly's undocumented GraphQL billing API and emails the operator via Resend when monthly spend crosses $20, $50, or $100. Idempotent via a repo-committed state file; auto-resets at month boundary; fails loud when the GraphQL schema drifts.

## One-liner

GitHub Actions weekly billing watcher with idempotent per-month threshold state, wired to Resend via a shared `sendOperatorAlert` wrapper that Phase 1 ING-07 and Phase 4 ops emails will reuse.

## What shipped

**Modules (pure / unit-testable)**

| File | Exports | Purpose |
|---|---|---|
| `src/lib/alerts/operator.ts` | `sendOperatorAlert({subject, body, html?})` | Thin Resend wrapper; throws typed errors on missing `RESEND_API_KEY` / `OPERATOR_EMAIL`; logs success/failure via shared logger. |
| `src/lib/ops/billing.ts` | `checkThresholds`, `loadOrResetState`, `emptyState`, `currentMonthKey`, types | Pure idempotent threshold state machine — crosses each threshold at most once per calendar month; auto-resets on month rollover. |

**Executable**

| File | Mode | Invocation |
|---|---|---|
| `scripts/billing-watcher.ts` | 0755 | `node --experimental-strip-types scripts/billing-watcher.ts` (Node 22.6+). |
| `.billing-alerts-state.json` | — | Initial `month: 1970-01` so the first real run resets to the current month. |

**Infrastructure**

| File | Purpose |
|---|---|
| `.github/workflows/billing-check.yml` | Monday 16:00 UTC cron (`0 16 * * MON`) + manual `workflow_dispatch(test_spend)`. `contents: write` permission to commit updated state with `[skip ci]`. |
| `docs/ops-billing.md` | Runbook covering rationale, schedule, state persistence, test procedure via `BILLING_TEST_SPEND`, required repo secrets, GraphQL schema-drift recovery, and degrade-path option. |

**Tests** — 17 new (12 billing + 5 operator-alert)

| File | Tests |
|---|---|
| `tests/ops/billing.test.ts` | 12 — threshold below/at/above smallest, multi-crossings, idempotency on re-runs, idempotency across states, advance from 20→50, no-downgrade on spend decrease, fresh-state bootstrap, month rollover, preserve-same-month. |
| `tests/ops/operator-alert.test.ts` | 5 — throws on missing `RESEND_API_KEY`, throws on missing `OPERATOR_EMAIL`, calls `Resend.emails.send` with correct args, includes HTML when provided, throws when Resend returns an error. |

All 17 pass (`npm run test:run` exit 0). `npm run build` exit 0.

**Cumulative test count note:** The plan called for cumulative ~38 tests (logger 7 + kill-switch 7 + heartbeat 7 + billing 12 + operator-alert 5). My worktree branched from d59da75, which predates the wave-1 commits adding logger/kill-switch/heartbeat tests (those land in their own worktree branches and will merge separately). My worktree shows only the 17 tests this plan adds. The cumulative count will be ~38 after all wave-1 and wave-2 branches merge.

## Task-by-task commits

| Task | Name | Commit | Files |
|---|---|---|---|
| 1 | sendOperatorAlert wrapper + billing threshold checker + unit tests | `c9a36d9` | `src/lib/alerts/operator.ts`, `src/lib/ops/billing.ts`, `tests/ops/billing.test.ts`, `tests/ops/operator-alert.test.ts`, `vitest.config.ts` |
| 2 | billing-watcher.ts (canonical-module import; no duplication) + initial state file | `cb7cd86` | `scripts/billing-watcher.ts`, `.billing-alerts-state.json`, `src/lib/ops/billing.ts` (`.ts` extension fix) |
| 3 | GitHub Actions workflow + runbook | `4daa77a` | `.github/workflows/billing-check.yml`, `docs/ops-billing.md` |

## Verification

| Criterion | Status | Evidence |
|---|---|---|
| 17 unit tests passing (12 billing + 5 operator-alert) | PASS | `npm run test:run` → `Test Files 2 passed (2); Tests 17 passed (17)` |
| `src/lib/ops/billing.ts` uses `import { today } from '../shared/dates.ts'` | PASS | grep confirms; `.ts` extension required for Node 22 strip-types (see Deviations). |
| Watcher imports from canonical `../src/lib/ops/billing.ts` (no local redefinition) | PASS | `grep -v 'export ' scripts/billing-watcher.ts \| grep -c 'function checkThresholds'` = 0 |
| Watcher has no local `DateTimeFormat` | PASS | `grep -c 'DateTimeFormat' scripts/billing-watcher.ts` = 0 |
| Local smoke: `BILLING_TEST_SPEND=5` with fake creds prints `[watcher] month=…` | PASS | `[watcher] using test spend 5 (BILLING_TEST_SPEND override)` → `[watcher] month=2026-04 spend=$5 ... crossed=[]` → `state written` (exit 0) |
| Local smoke: `BILLING_TEST_SPEND=25` with fake creds attempts send then exits 1 | PASS | State machine logs `crossed=[20]` before Resend fails with "API key is invalid"; watcher exits 1 |
| Workflow YAML parses (5 steps, 2 triggers) | PASS | js-yaml load → `jobs.check-billing.steps = [Checkout, Setup Node, Install Resend SDK, Run watcher, Commit updated state]` |
| `npm run build` exits 0 | PASS | Final adapter-node build completes with no warnings |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Added `$lib` alias to `vitest.config.ts`**
- **Found during:** Task 1 — running `npm run test:run -- tests/ops/` against `tests/ops/operator-alert.test.ts`
- **Issue:** vitest could not resolve `$lib/server/logger` from `src/lib/alerts/operator.ts` because the SvelteKit Vite plugin (which normally injects the `$lib → src/lib` alias) is not active under vitest's standalone `vitest.config.ts`. 5/5 operator-alert tests failed with `Failed to load url $lib/server/logger`.
- **Fix:** Added `resolve.alias.$lib = fileURLToPath(new URL('./src/lib', import.meta.url))` to `vitest.config.ts`. Mirrors SvelteKit's built-in alias for unit-test context only.
- **Impact:** Makes any unit-tested module that imports from `$lib/...` resolvable under vitest. Zero runtime effect — vitest-only.
- **Files modified:** `vitest.config.ts`
- **Commit:** `c9a36d9`

**2. [Rule 3 - Blocker] Added `.ts` extension to relative TS imports in the watcher chain**
- **Found during:** Task 2 — running local smoke `node --experimental-strip-types scripts/billing-watcher.ts`
- **Issue:** Node 22's `--experimental-strip-types` ESM loader does NOT auto-resolve extensionless specifiers. The watcher imported `../src/lib/ops/billing` which in turn imported `../shared/dates`; both failed with `ERR_MODULE_NOT_FOUND` at the resolver (before type stripping).
- **Fix:** Use `'../src/lib/ops/billing.ts'` in the watcher and `'../shared/dates.ts'` inside `billing.ts`. Verified locally: `BILLING_TEST_SPEND=5 node --experimental-strip-types scripts/billing-watcher.ts` prints the `[watcher] month=…` forensic line and exits 0 with zero crossings. SvelteKit/Vite strip the `.ts` extension at bundle time, so this does NOT affect the SvelteKit app build (`npm run build` still exits 0).
- **Acceptance-grep note:** The plan's acceptance grep `from '../src/lib/ops/billing'` with a trailing quote was slightly too strict for a file using `.ts` extension. A substring-match grep (`from '../src/lib/ops/billing`) passes and satisfies the contract's intent (imports from canonical module, no duplication). Documented in the file's comment so future contributors understand why the extension is explicit.
- **Files modified:** `scripts/billing-watcher.ts`, `src/lib/ops/billing.ts`
- **Commit:** `cb7cd86`

**3. [Rule 1 - Bug] Paragraph opening "separation of fate" in runbook**
- **Found during:** Task 3 — acceptance grep `grep -q "separation of fate" docs/ops-billing.md`
- **Issue:** Plan acceptance expects case-sensitive match; I originally wrote it capitalized ("Separation of fate"). Either rewording to start the sentence differently or lowercasing mid-sentence satisfies the grep.
- **Fix:** Rephrased the sentence so "separation of fate" appears in lowercase mid-sentence twice — reads naturally.
- **Files modified:** `docs/ops-billing.md`
- **Commit:** `4daa77a`

### No architectural changes (Rule 4)

None needed.

### Authentication gates

None — Task 3 sets up GH secrets that Plan 06 will populate and test; no auth interaction required during Task 1–3 execution.

## Required operator setup (before Plan 06)

Copied from plan `user_setup.env_vars`:

### GitHub repo secrets (Settings → Secrets and variables → Actions)

| Secret | Source |
|---|---|
| `FLY_API_TOKEN` | `fly tokens create deploy` locally. Store the opaque token. Rotate annually. |
| `FLY_ORG_SLUG` | `personal` for personal accounts; `fly orgs list` confirms. |
| `RESEND_API_KEY` | Resend dashboard → API Keys (scope: "Sending access" only). |
| `OPERATOR_EMAIL` | Your personal inbox — alert recipient. |
| `OPERATOR_FROM_EMAIL` | Verified-domain sender on Resend, e.g., `alerts@fishcount.example`. |

### Fly secrets (`fly secrets set KEY=value` — for future Phase 1 in-app use; Phase 0 watcher does NOT read these)

| Secret | Source |
|---|---|
| `RESEND_API_KEY` | Same as above. |
| `OPERATOR_EMAIL` | Same as above. |
| `OPERATOR_FROM_EMAIL` | Same as above. |

## Plan 06 end-to-end test procedure

1. Populate all five GH repo secrets above.
2. Resend: verify your sending domain (SPF + DKIM), create API key, confirm `OPERATOR_FROM_EMAIL` is verified.
3. GitHub repo → Actions → **Billing Check** → **Run workflow** → `test_spend: 20.01` → Run.
4. Observe within ~30 s: operator email arrives with subject `[FishCount ops] Fly.io spend crossed $20`.
5. `git pull` — confirm `.billing-alerts-state.json` advanced to `{"month":"<current>","thresholds":{"20":true,"50":false,"100":false}}` via a `[skip ci]` commit from `github-actions[bot]`.
6. Re-run workflow with `test_spend: 20.01` — confirm **no second email** (idempotency).
7. Optionally re-run with `test_spend: 60` to simulate a $20→$50 advance (one new email for `$50`).

## Architecture notes

- **Sole-date-producer rule** preserved: the watcher delegates month-key computation to `currentMonthKey()` imported from `src/lib/ops/billing.ts`, which delegates to `today()` in `src/lib/shared/dates.ts`. No parallel `DateTimeFormat` call anywhere in the watcher. Verified: `grep -c DateTimeFormat scripts/billing-watcher.ts` = 0.
- **No DAL violations** — this plan doesn't touch SQL at all (billing state lives in a JSON file the GH Actions job commits).
- **Separation of fate** — watcher runs in GH Actions, not in the Fly app. If the Fly app is what's running up the bill (scraper loop gone wrong, egress spike), the in-app watcher would share the failure domain; GH Actions cron does not.
- **Threat mitigations** from the plan's `<threat_model>` are all implemented:
  - T-05-01 (compromised Fly token): secret-scoped `deploy`-only token stored in GH Actions (not in Fly env).
  - T-05-02 (Resend key leak): separate copies in GH Actions and (future) Fly; Phase 0 scope is GH Actions only.
  - T-05-03 (state file tampering): main-branch protection is the operator's responsibility; noted in runbook. Monthly auto-reset limits blast radius.
  - T-05-04 (Resend rate limit / outage): accepted — GH Actions exit 1 surfaces failure via GitHub's own notification.
  - T-05-05 (spend in GH Actions logs): accepted — values are not PII/secret.
  - T-05-06 (email spoofing): SPF + DKIM required by Resend domain verification; DMARC deferred to Phase 4.
  - T-05-07 (silent failure on schema drift): `fetchFlySpend()` throws when no probed field yields a number; main catches and sends `Billing check FAILED` email rather than silently zeroing.

## Known stubs

None. Every code path is wired to real behavior. The `sendOperatorAlert` wrapper is shipped without a caller in this plan (caller is the watcher, which inlines its own send); future Phase 1 ING-07 will be the first in-app consumer — documented in `src/lib/alerts/operator.ts` header comment.

## Self-Check: PASSED

Created files verified:

```
FOUND: src/lib/alerts/operator.ts
FOUND: src/lib/ops/billing.ts
FOUND: scripts/billing-watcher.ts
FOUND: .github/workflows/billing-check.yml
FOUND: .billing-alerts-state.json
FOUND: tests/ops/billing.test.ts
FOUND: tests/ops/operator-alert.test.ts
FOUND: docs/ops-billing.md
```

Commits verified:

```
FOUND: c9a36d9 feat(00-05): add Resend operator alert wrapper and billing threshold checker
FOUND: cb7cd86 feat(00-05): add billing-watcher.ts importing canonical billing module
FOUND: 4daa77a feat(00-05): add billing-check workflow and ops-billing runbook
```
