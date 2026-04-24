---
phase: 00-ops-guardrails
fixed_at: 2026-04-23T20:24:00-07:00
review_path: .planning/phases/00-ops-guardrails/00-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 0: Code Review Fix Report

**Fixed at:** 2026-04-23T20:24:00-07:00
**Source review:** .planning/phases/00-ops-guardrails/00-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (1 Critical + 6 Warnings; Info findings IN-01..IN-07 out of scope for this iteration)
- Fixed: 7
- Skipped: 0

**Regression checks (post-all-fixes):**
- `npm run build` → exit 0 ✅
- `npm run test:run` → 46/46 passing ✅ (baseline was 42/42; +4 new tests for WR-04 redactPingUrl)

## Fixed Issues

### CR-01: Litestream YAML does not expand `${VAR}` references — replication will silently fail

**Files modified:** `litestream.yml`, `scripts/verify-replication.sh`
**Commit:** c8d57d5 (pre-existing, resolved before this fixer run)
**Status:** `fixed_pre_run`
**Applied fix:** Converted all `${VAR}` interpolations to Litestream's Go-template syntax `{{ env "VAR" }}`. Added a regression guard in `verify-replication.sh` that greps the output of `litestream replicas` for literal `${` / `{{` substrings and fails the check if either is present (catches a future revert).

**Acceptance verification (this run):**
- `grep -vE '^\s*#' litestream.yml | grep -E '\$\{'` → empty (no shell-style interpolation in non-comment lines) ✅
- `grep -n '{{ env' litestream.yml` → 5 hits (access-key-id, secret-access-key, DB path, bucket, endpoint) ✅
- `scripts/verify-replication.sh` still contains the `\$\{|\{\{` regression-detector guard ✅

Per the pre_resolved_findings directive, CR-01 was fixed by the orchestrator in commit `c8d57d5` before this fixer run. No additional work required; acceptance criterion still passes.

---

### WR-01: Dockerfile runs Node and Litestream as root

**Files modified:** `Dockerfile`
**Commit:** 01c50e7
**Status:** `fixed`
**Applied fix:**
- Added `USER node` directive in the runtime stage (drops to the pre-created UID 1000 from `node:22-bookworm-slim`).
- `COPY --from=builder --chown=node:node` on `/app/build`, `/app/node_modules`, `/app/package.json` so the runtime user owns what it executes.
- `RUN mkdir -p /data && chown node:node /data` so the Fly volume mount point is writable by UID 1000 (Fly chowns the volume to the image's USER on first mount).
- Litestream binary, `/etc/litestream.yml`, and entrypoint remain root-owned (read-only from node's perspective) which is the intended posture — RCE in the Node app can't clobber the supervisor.

**Verification:** Build succeeds, 46/46 tests pass (Dockerfile change is purely image-layout; no runtime code change).

---

### WR-02: Billing watcher emits silent zero-spend on API shape drift

**Files modified:** `scripts/billing-watcher.ts`
**Commit:** 547eccd
**Status:** `fixed`
**Applied fix:** Replaced the `??`-chain (which collapses all four candidate fields into a single anonymous value) with an explicit `if/else if` chain that records WHICH field was found as `spendSource`. A new `console.log` breadcrumb emits `spend_source=<field>` along with the top-level keys of `org` and `billingStatus` before the watcher exits. Operators reviewing GH Actions logs can now distinguish:
- `spend=$0 spend_source=billingStatus.currentMonthSpend` → genuine $0 month, API healthy
- `spend=$0 spend_source=organization.currentMonthSpend` → schema drift, investigate

The throw-on-missing-field path is unchanged (still the loud-fail route for total shape drift).

**Verification:** Build succeeds, 46/46 tests pass. No unit tests for billing-watcher existed (it's a script + imports the unit-tested `src/lib/ops/billing.ts`); the change is additive logging only.

---

### WR-03: `operator.ts` logs `alert.subject` unredacted — future PII leak

**Files modified:** `src/lib/alerts/operator.ts`
**Commit:** a2513d7
**Status:** `fixed`
**Applied fix:**
- Added exported `safeSubject(s)` helper that strips email-looking substrings via `/[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g → '[email]'` and truncates to 60 chars.
- Both `logger.error(...)` and `logger.info(...)` now pass `subjectTemplate: safeSubject(alert.subject)` instead of the raw `subject: alert.subject`. Field renamed to `subjectTemplate` to signal "sanitized; not raw."
- The `subject` sent to Resend (via `resend.emails.send`) is still the raw alert subject — sanitization only affects the log line.

**Verification:** Build succeeds, all 5 existing `operator-alert.test.ts` tests pass with the new log-field name (the tests assert `args.subject` on Resend, not the log shape).

---

### WR-04: `heartbeat.ts` redactUuid regex misses slug ping URLs

**Files modified:** `src/lib/server/heartbeat.ts`, `tests/scheduler/heartbeat.test.ts`
**Commit:** 1064807
**Status:** `fixed`
**Applied fix:**
- Replaced the UUID-only regex with a URL-parser-based `redactPingUrl(url)` that returns `${protocol}//${host}/[REDACTED]` for any valid URL and `[REDACTED]` on parse failure. This captures slugs (`/my-project/scrape-nightly`), UUIDs, trailing `/start`/`/fail` suffixes, and any future healthchecks.io URL shape.
- Function exported (not just internal) so the unit test can target it directly.
- Added 4 new unit tests in `tests/scheduler/heartbeat.test.ts` asserting: UUID redaction, slug redaction (the WR-04-specific case), status-suffix redaction, and invalid-URL safe fallback.

**Verification:** Build succeeds, 46/46 tests pass (+4 new tests).

---

### WR-05: `restore-drill.sh` uses double-escaped quotes inside nested SSH command

**Files modified:** `scripts/restore-drill.sh`
**Commit:** 16342d1
**Status:** `fixed`
**Applied fix:**
- Removed all `\\\\'` / `\\\\"` nested escapes. The JS helper is now uploaded once via `fly ssh console <<'REMOTE_SH'` + a nested `cat > /tmp/drill.js <<'DRILL_JS'` heredoc. Single-quoted heredoc tags prevent any local or remote shell expansion of `$` inside the JS body.
- The marker is passed as `process.argv[3]` (plain argv), not interpolated into a JS string literal. Injection surface collapses to a single `echo $MARKER` in bash, which is safe for the `date +%s` input.
- The helper accepts two modes (`write`, `verify`) driven by `process.argv[2]`, reducing duplication of the schema `CREATE TABLE IF NOT EXISTS` between the pre- and post-restart invocations.
- Added a retry path: if `/tmp/drill.js` is missing after machine restart (rare but possible if Fly replaces the machine rather than restarting), the script re-uploads the helper and retries the verify call.

**Known follow-up (documented in the file header):** IN-01 recommended shipping `drill-helper.mjs` in the Docker image itself so the schema can't drift from `src/lib/db/smoke.ts`. That's an IN-level finding out of scope for this iteration; the comment in the script points future maintainers to that improvement.

**Status note:** This fix changes operational tooling (a drill script that is only run by an operator with `fly ssh` access). The bash syntax passes `bash -n`; actual end-to-end behavior against a real Fly machine cannot be tested in this run and requires human verification on the next drill execution.

**Classification:** `fixed: requires human verification` — the bash syntax and heredoc logic are sound by inspection, but the SSH + heredoc + Fly command chain has no unit-test coverage.

**Verification:** `bash -n scripts/restore-drill.sh` passes; build + tests still green (46/46).

---

### WR-06: `shutdown.ts` exits after fixed 100ms — SIGTERM-on-a-slow-flush race

**Files modified:** `src/lib/server/shutdown.ts`
**Commit:** 07c6d21
**Status:** `fixed`
**Applied fix:**
- Promoted the shutdown handler to `async` (wrapped in `void shutdown(signal)` at the `process.on` sites so the unhandled-promise lint doesn't fire).
- Replaced `setTimeout(() => process.exit(0), 100)` with `await Promise.race([flushPromise, timeoutPromise])` where:
  - `flushPromise` resolves when `logger.flush()` calls its callback (drains the pino worker-thread buffer — relevant once Phase 2 wires `@logtail/pino`).
  - `timeoutPromise` resolves after `FLUSH_TIMEOUT_MS = 2000` and is `.unref()`'d so it doesn't hold the event loop open.
- If the pino version lacks `.flush()` (defensive typing via `logger as unknown as { flush?: (cb?: () => void) => void }`), the flush promise resolves immediately and only the scheduler-stop + log-write timing gates shutdown.
- Added TODO comment for Phase 1 `await closeDb()`.

**Verification:** Build succeeds. No direct unit test of the shutdown sequence exists (hard to test without either forking a process or heavily mocking pino); the fix preserves the existing public behavior (`installShutdownHandlers()` installs SIGTERM/SIGINT once, idempotent) and is verified at Tier-1 (re-read) + Tier-2 (TypeScript/build) level. 46/46 tests still pass.

**Classification:** `fixed: requires human verification` — shutdown timing is inherently hard to unit-test; the 2s cap is an operator-level config choice that should be validated against the real Better Stack transport latency once Phase 2 wires it.

## Skipped Issues

None — all 7 in-scope findings were successfully fixed.

---

_Fixed: 2026-04-23T20:24:00-07:00_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
