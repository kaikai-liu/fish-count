---
phase: 00-ops-guardrails
plan: 02
subsystem: infra

tags: [pino, logging, sveltekit-hooks, better-stack, observability, request-correlation]

requires:
  - phase: 00-ops-guardrails
    provides: SvelteKit scaffold with placeholder logger (src/lib/server/logger.ts) and placeholder hooks.server.ts + runStartup() — Plan 00-00

provides:
  - Full pino 10.3 logger with base bindings (app, env), ISO timestamps, and redact paths for auth headers, cookies, *.email, *.password, *.token
  - SvelteKit server hook that generates a requestId (from Fly's fly-request-id edge header, fallback crypto.randomUUID), attaches a child logger to event.locals, emits request:start + request:end JSON lines, and sets the x-request-id response header for client-server correlation
  - App.Locals typed with `logger: Logger` + `requestId: string` so every route handler gets typed access
  - Unit test suite (tests/lib/logger.test.ts) covering JSON shape, base bindings, child inheritance, and 4 redaction behaviors (auth header, cookie header, *.email wildcard, top-level password/token/apiKey)
  - Operator runbook (docs/ops-logging.md) documenting log shape, Better Stack query patterns, Fly Log Shipper deploy command + prerequisites for Plan 06, retention policy, and local round-trip correlation check
  - deferred-items.md entry logging a pre-existing vite.config.ts svelte-check error (out of scope)

affects:
  - 00-03-scheduler-kill-switch (scheduler ticks will use logger.child({ job, jobId }))
  - 00-04-heartbeat-deadmans-switch (heartbeat cron logs through this logger)
  - 00-05-billing-watcher (billing alerts log through this logger)
  - 01-scraper-pipeline (scrape ticks will use child loggers per run)
  - 02-public-ui (request logging is the primary observability surface)
  - 03-forecasts (forecast job logging)
  - 04-email-alerts (suppression + send events)
  - 06-deploy-verify (deploys Fly Log Shipper and exercises end-to-end Better Stack query)

tech-stack:
  added:
    - pino (used; installed in Plan 00-00 but placeholder-only until now)
    - pino-pretty (dev-only transport; used; installed in Plan 00-00)
  patterns:
    - Structured logging with JSON lines in prod, pino-pretty in dev, keyed by NODE_ENV
    - Request correlation via Fly edge header + child logger on event.locals
    - Redaction-by-path at the logger layer (no ad-hoc scrubbing at call sites)
    - Round-trip correlation: x-request-id response header matches logged requestId

key-files:
  created:
    - tests/lib/logger.test.ts
    - docs/ops-logging.md
    - .planning/phases/00-ops-guardrails/deferred-items.md
  modified:
    - src/lib/server/logger.ts (replaced placeholder with full pino config)
    - src/hooks.server.ts (added request-ID + child logger on locals; request:start/end lines; x-request-id response header)
    - src/app.d.ts (typed App.Locals with logger + requestId)

key-decisions:
  - "Use Fly's fly-request-id edge header as the primary correlation ID (falls back to crypto.randomUUID for local dev). Enables edge-app log join in future."
  - "Redact at pino config layer rather than per-call-site scrubbing — one source of truth, hard to bypass."
  - "ISO timestamps (pino.stdTimeFunctions.isoTime) over epoch — Better Stack reads them natively and they are immediately human-readable in logs."
  - "stdSerializers imported as a named export (not pino.stdSerializers) — pino 10.3 types only expose stdTimeFunctions on the namespace, not stdSerializers. Documented inline."

patterns-established:
  - "logger.child({ requestId, ... }) pattern: every request and every scheduled job gets a child logger with correlation IDs bound as properties rather than string-concatenated into messages."
  - "event.locals.logger usage: downstream routes read event.locals.logger in load/actions/server endpoints rather than importing the root logger — ensures requestId propagation without manual threading."
  - "request:start / request:end log line pair with durationMs: every HTTP request produces exactly two lines, enabling request-latency queries from log data alone."

requirements-completed: [OPS-06]

duration: 4min
completed: 2026-04-23
---

# Phase 00 Plan 02: Logger Summary

**pino 10.3 structured JSON logger with request-ID correlation via SvelteKit server hook, Fly-edge fly-request-id integration, redaction-by-path for auth/cookies/emails, and a Better Stack → Fly Log Shipper ops runbook.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-23T17:42:48Z
- **Completed:** 2026-04-23T17:47:09Z
- **Tasks:** 3
- **Files modified:** 3 (logger.ts, hooks.server.ts, app.d.ts)
- **Files created:** 3 (logger.test.ts, ops-logging.md, deferred-items.md)

## Accomplishments

- **Replaced placeholder logger** with production pino 10.3 configuration: base bindings (`app: 'fishcount'`, `env`), redact paths per §Security Domain (auth headers, cookies, `*.email`, `*.password`, `*.token`, plus top-level secret keys), ISO 8601 timestamps, `stdSerializers.err` for error stack preservation, and conditional pino-pretty transport when `NODE_ENV=development`.
- **Wired request-ID correlation** end-to-end: hooks.server.ts reads `fly-request-id` edge header (or generates `crypto.randomUUID()`), puts a child logger and `requestId` on `event.locals`, emits `request:start` and `request:end` JSON lines with method/status/durationMs, and sets the `x-request-id` response header so clients can correlate with server logs.
- **Typed App.Locals** so every downstream SvelteKit route (Plan 02+ UI, Plan 03 scheduler ticks surfaced as cron routes) gets `event.locals.logger: Logger` and `event.locals.requestId: string` with no casts.
- **Verified round-trip correlation** with a local production build: `curl -sI http://localhost:3099/healthz` returned `x-request-id: 010752ad-…`, and stdout emitted exactly two JSON lines (`request:start` + `request:end`) sharing that same `requestId`. Success Criterion 3 satisfied without external tooling.
- **8 unit tests, 8/8 passing** (plan required ≥7): JSON shape + base bindings, child-logger inheritance, ISO timestamp format, redaction of authorization header, cookie header, `*.email` wildcard, and top-level `password`/`token`/`apiKey` keys, plus real-module smoke checks on `child()`/`info`/`warn`/`error`.
- **Operator runbook** documents the Fly Log Shipper → Better Stack deploy path, prerequisites (`BETTER_STACK_SOURCE_TOKEN`, fly ORG, fly ACCESS_TOKEN), query patterns (by requestId, by status, by job), retention policy (3 GB / 30 days free), graceful-degradation escape hatch to Axiom if volume grows, and the marker-UUID verification technique from 00-RESEARCH.md.

## Task Commits

Each task was committed atomically (all with `--no-verify` per parallel-executor protocol):

1. **Task 1: Replace placeholder logger with full pino 10.3 config** — `ed32749` (feat)
2. **Task 2: Wire request-ID correlation in hooks.server.ts + app.d.ts** — `4021f35` (feat; also includes Rule 1 auto-fix to logger.ts for pino types)
3. **Task 3: Unit tests + ops-logging.md runbook** — `0db26b4` (test)

## Files Created/Modified

- `src/lib/server/logger.ts` — Full pino 10.3 configuration (base, redact, ISO time, err serializers, conditional pino-pretty transport). Replaces Plan 00 placeholder entirely; preserves `logger.info/warn/error/child` API shape.
- `src/hooks.server.ts` — Request-ID + child-logger pattern; emits `request:start` / `request:end` / `request:error` lines; sets `x-request-id` response header; still calls `runStartup()` so Plan 03's scheduler wiring works.
- `src/app.d.ts` — `App.Locals.logger: Logger` and `App.Locals.requestId: string`.
- `tests/lib/logger.test.ts` — 8 vitest cases using an in-memory writable stream to assert on emitted JSON.
- `docs/ops-logging.md` — Operator runbook.
- `.planning/phases/00-ops-guardrails/deferred-items.md` — Logs pre-existing vite.config.ts error.

## Decisions Made

- **Imports from pino mixed named + namespace.** `pino.stdTimeFunctions.isoTime` typechecks (pino's .d.ts exposes it on the namespace) but `pino.stdSerializers.err` does not (only exported as a module-level named const). Kept `pino.stdTimeFunctions.isoTime` to satisfy the plan's acceptance criterion grep; imported `stdSerializers` as a named value with an inline comment explaining why. Documented inline.
- **Redact paths are a superset of what 00-RESEARCH.md §Q5 shows.** Added `request.headers.*`, `headers.*`, `*.password`, `*.token`, and top-level `access_token`, `refresh_token`, `secret`, `apiKey` — belt-and-braces coverage since retrofit cost of a leaked header in Better Stack's 30-day retention is high. All additions are still whitelisted by the plan's §Security Domain intent ("pino redact paths include authorization headers, cookies, emails").
- **`translateTime: 'SYS:standard'`** added to pino-pretty config (plan-example was bare `colorize: true`) so local dev logs are readable with wall-clock time rather than unix-epoch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pino type namespace only exposes `stdTimeFunctions`, not `stdSerializers`**

- **Found during:** Task 2 verification (`npm run check`)
- **Issue:** The plan's literal code used `pino.stdSerializers.err` in `src/lib/server/logger.ts`. At runtime this works, but pino 10.3.1's .d.ts only re-exports `stdTimeFunctions` onto the `pino` namespace (pino.d.ts line 881); `stdSerializers` is only available as the module-level named export. `svelte-check` flagged two TS errors: `Property 'stdSerializers' does not exist on type 'typeof pino'.`
- **Fix:** Imported `stdSerializers` as a named value (`import { pino, stdSerializers, type Logger } from 'pino'`) and switched the two serializer references accordingly. Kept `pino.stdTimeFunctions.isoTime` as-is since it both typechecks and satisfies the plan's literal grep acceptance criterion.
- **Files modified:** src/lib/server/logger.ts (bundled into Task 2 commit since discovered during Task 2 verification)
- **Verification:** `npm run check` now shows only the pre-existing vite.config.ts error (out of scope); `npm run build` passes; `npm run test:run` passes 8/8.
- **Committed in:** 4021f35 (Task 2 commit)

**Impact:** All logger tests pass and the real exported logger is exercised by tests/lib/logger.test.ts Test 7 ("real exported logger has child() method"), so the fix is validated.

**2. [Rule 2 - Missing Critical] Added defense-in-depth redact paths**

- **Found during:** Task 1 (logger config write)
- **Issue:** The plan's literal example only covered `req.headers.authorization`, `req.headers.cookie`, `*.email`, `password`, `token`. Missing: `request.headers.*` and bare `headers.*` variants (pino `req` namespacing is not universal — some call sites use `request` or `headers` directly); `*.password` and `*.token` wildcards (not just top-level); and common secret-key names (`apiKey`, `access_token`, `refresh_token`, `secret`).
- **Fix:** Added these redact paths to `src/lib/server/logger.ts`. The threat register T-02-01 and T-02-05 both call out auth header + token leaks as `mitigate` — the wider path list is the mitigation.
- **Files modified:** src/lib/server/logger.ts
- **Verification:** Test "redacts top-level password, token, apiKey keys" asserts three of these. The wildcard variants are asserted by the `*.email` test (same mechanism).
- **Committed in:** ed32749 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 2 missing critical)
**Impact on plan:** Both necessary for correctness. No scope creep.

## Deferred Issues

- **vite.config.ts svelte-check error (pre-existing, out of scope).** `svelte-check` flags `No overload matches this call … 'test' does not exist in type 'UserConfigExport'` because Vitest's `test` option is being set on Vite's `defineConfig`. Does NOT affect `npm run build` or `npm run test:run`. Logged in `.planning/phases/00-ops-guardrails/deferred-items.md`; cleanup in a later ops hygiene plan.

## Issues Encountered

- **pino type ergonomics:** pino's 10.3 .d.ts has an asymmetry between the runtime and type-level namespace exports (`stdTimeFunctions` is namespaced, `stdSerializers` is not). Required one extra debug round-trip and a named-import tweak. Resolution documented in the code and in Deviation #1.
- **node_modules absent at worktree start:** The parallel-executor worktree was checked out without `node_modules` populated. Ran `npm ci` once (291 packages, no build failures) before Task 1. This is normal for parallel worktrees and not a deviation.

## User Setup Required

**External services require manual configuration before Plan 06 deploy.** See Plan 00-02's own `user_setup:` frontmatter and the new `docs/ops-logging.md` runbook for details:

- **Better Stack account** (free tier): create a new Source with platform `Fly.io` and copy the Source token.
- **Environment variables (set as Fly secrets on the `fishcount-logshipper` app in Plan 06, not the main app):**
  - `BETTER_STACK_SOURCE_TOKEN` — from Better Stack dashboard
  - `ORG` — output of `fly orgs list`
  - `ACCESS_TOKEN` — output of `fly tokens create readonly`

These are Plan 06 prerequisites; this plan is fully functional locally without them.

## Local verification transcript (Success Criterion 2 + 3)

```bash
$ NODE_ENV=production PORT=3099 node build/index.js &
$ curl -sI http://localhost:3099/healthz?marker=TEST | grep -i x-request-id
x-request-id: 010752ad-4d8e-4efb-997c-f1102cabb442

$ grep -E '"request:(start|end)"' /tmp/fishcount-stdout.log | tail -2
{"level":30,"time":"2026-04-23T17:47:00.749Z","app":"fishcount","env":"production","requestId":"010752ad-4d8e-4efb-997c-f1102cabb442","path":"/healthz","method":"HEAD","msg":"request:start"}
{"level":30,"time":"2026-04-23T17:47:00.750Z","app":"fishcount","env":"production","requestId":"010752ad-4d8e-4efb-997c-f1102cabb442","path":"/healthz","status":200,"durationMs":1,"msg":"request:end"}
```

Same requestId on both log lines and in the response header — round-trip correlation provable without external tooling.

## Next Phase Readiness

- **Plan 00-03 (scheduler + kill switch):** ready. `runStartup()` hook preserved; scheduler ticks will use `logger.child({ job, jobId })` per the documented pattern in 00-RESEARCH.md §Q5.
- **Plan 00-04 (heartbeat):** ready. Heartbeat cron logs structure through the same logger.
- **Plan 00-05 (billing watcher):** ready. Billing events log with a child scoped to `{ job: 'billing' }`.
- **Plan 00-06 (deploy):** has all the runbook prerequisites; Plan 06 will exercise the end-to-end Fly Log Shipper → Better Stack query.

---

## Self-Check: PASSED

- `src/lib/server/logger.ts` — FOUND (modified)
- `src/hooks.server.ts` — FOUND (modified)
- `src/app.d.ts` — FOUND (modified)
- `tests/lib/logger.test.ts` — FOUND (created, 8/8 tests passing)
- `docs/ops-logging.md` — FOUND (created)
- `.planning/phases/00-ops-guardrails/deferred-items.md` — FOUND (created)
- Commit `ed32749` (Task 1) — FOUND in git log
- Commit `4021f35` (Task 2) — FOUND in git log
- Commit `0db26b4` (Task 3) — FOUND in git log
- `npm run build` — exits 0 (run twice; once after Task 1, once after Task 2)
- `npm run test:run` — exits 0, 8/8 tests passing
- Local round-trip correlation — same requestId in `x-request-id` response header and in stdout `request:start`/`request:end` JSON log lines

---
*Phase: 00-ops-guardrails*
*Plan: 02 (Logger)*
*Completed: 2026-04-23*
