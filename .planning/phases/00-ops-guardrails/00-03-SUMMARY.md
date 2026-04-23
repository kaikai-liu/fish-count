---
phase: 00-ops-guardrails
plan: 03
subsystem: ops/kill-switch
tags: [ops, scheduler, kill-switch, croner, OPS-05]
requires: [00-00]  # startup.ts placeholder, hooks.server.ts wiring, package.json deps
provides:
  - "scrapingEnabled(env) pure env gate"
  - "startScheduler() / stopScheduler() croner lifecycle"
  - "_heartbeatTick() stub tick body for Plan 04 to extend"
  - "installShutdownHandlers() SIGTERM/SIGINT → graceful exit"
  - "runStartup() idempotent boot (replaces Plan 00 placeholder)"
  - "docs/ops-runbook.md operator reference for flipping the switch"
affects:
  - "src/hooks.server.ts (unchanged; still imports runStartup — the contract held)"
  - "Plan 04 (OPS-04 dead-man's switch) wraps _heartbeatTick with healthcheck pings"
  - "Phase 1 scraper will inherit the same gate pattern for its real tick body"
tech_stack:
  added: [croner@10.0.1]
  patterns:
    - "Tick-time env read (not module-load-time) for zero-redeploy kill switch"
    - "Idempotent module-scoped guard flags for startup/shutdown handlers"
    - "Named croner jobs with timezone=America/Los_Angeles and protect:true"
key_files:
  created:
    - src/lib/server/kill-switch.ts
    - src/lib/server/scheduler.ts
    - src/lib/server/shutdown.ts
    - tests/scheduler/kill-switch.test.ts
    - docs/ops-runbook.md
  modified:
    - src/lib/server/startup.ts
decisions:
  - "Fail-open semantics (unset/typo allows; only exact 'false' halts) — scraper is the product, a typo must not silently halt ingestion"
  - "Case-sensitive 'false' match — unknown values ('FALSE', '0', 'off') are treated as allow, documented in runbook"
  - "Read env INSIDE the tick callback, not at module load — machine restart after fly secrets set is picked up on the very next tick"
  - "process.exit(0) gated behind setTimeout(100).unref() so pino's async flush drains before exit"
  - "Heartbeat ticks every minute (Phase 0) — Phase 1 will decide whether to keep it alongside the real 03:00 PT scrape or replace it"
metrics:
  duration_minutes: 5
  tasks_completed: 3
  files_changed: 6
  commits: 3
  tests_added: 7
  tests_passing: 7
  completed_date: 2026-04-23
---

# Phase 00 Plan 03: Kill Switch Summary

## One-liner

Ship the `SCRAPER_ENABLED` env-var kill switch, a croner stub heartbeat gated by it, SIGTERM-aware shutdown, and the operator runbook — with 7 passing unit tests and a local smoke test proving both halt-path and run-path behave as specified.

## Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Pure `scrapingEnabled` gate + exhaustive unit tests | `6e9022f` | `src/lib/server/kill-switch.ts`, `tests/scheduler/kill-switch.test.ts` |
| 2 | Croner scheduler with heartbeat tick + SIGTERM/SIGINT shutdown | `e8ec58f` | `src/lib/server/scheduler.ts`, `src/lib/server/shutdown.ts` |
| 3 | Replace startup placeholder + write ops runbook | `9596ea0` | `src/lib/server/startup.ts`, `docs/ops-runbook.md` |

## Verification Results

### Unit tests (Task 1)

```
$ npm run test:run -- tests/scheduler/kill-switch.test.ts

 RUN  v2.1.9 /Users/zen/Documents/code/fish-count

 ✓ tests/scheduler/kill-switch.test.ts (7 tests) 1ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
```

All 7 cases green:

1. `SCRAPER_ENABLED === 'false'` → halt
2. unset → allow
3. `'true'` → allow
4. `''` → allow
5. `'FALSE'` (uppercase) → allow (case-sensitive)
6. `'0'` / `'off'` / `'no'` → allow
7. zero-arg smoke (uses `process.env`) → returns a boolean

**Note on cumulative test count.** The plan's verification_criteria #7 anticipates "logger 7/7 + kill-switch 7/7 = 14/14" but Plan 02's logger tests haven't landed in this worktree base (Plan 02 ships in a separate parallel lane). Against the base this plan was built on, the kill-switch 7/7 is the full test delta.

### Build (all tasks)

```
$ npm run build
...
Run npm run preview to preview your production build locally.

> Using @sveltejs/adapter-node
  ✔ done
```

### Local smoke test (success criterion 2 + 3 + 4)

**Path A — kill switch ON (halt):**

```
$ NODE_ENV=production SCRAPER_ENABLED=false PORT=38715 node build/index.js

{"level":"info","msg":[{"msg":"startup:start","pid":74957,"nodeEnv":"production"}]}
{"level":"info","msg":[{"jobs":["heartbeat"],"timezone":"America/Los_Angeles"},"scheduler started"]}
{"level":"info","msg":["startup:complete"]}
Listening on http://0.0.0.0:38715
{"level":"info","msg":[{"msg":"request","method":"GET","path":"/"}]}
{"level":"warn","msg":[{"reason":"kill_switch_set"},"heartbeat skipped"]}   ← within 60s of boot
{"level":"info","msg":[{"signal":"SIGTERM"},"shutdown:start"]}              ← after kill -TERM
{"level":"info","msg":[{"stopped":1},"scheduler stopped"]}
{"level":"info","msg":["shutdown:complete"]}
(process exited cleanly)
```

**Path B — kill switch OFF (run):**

```
$ NODE_ENV=production PORT=38716 node build/index.js

{"level":"info","msg":[{"msg":"startup:start","pid":75717,"nodeEnv":"production"}]}
{"level":"info","msg":[{"jobs":["heartbeat"],"timezone":"America/Los_Angeles"},"scheduler started"]}
{"level":"info","msg":["startup:complete"]}
Listening on http://0.0.0.0:38716
{"level":"info","msg":[{"msg":"request","method":"GET","path":"/"}]}
{"level":"info","msg":[{"status":"ok"},"heartbeat tick"]}                   ← within 60s of boot
```

Both paths hit their expected log line within the one-minute heartbeat window. The SIGTERM path produces `shutdown:start` → `scheduler stopped` → `shutdown:complete` in order and the process exits cleanly.

### Plan success criteria

| Criterion | Result |
|-----------|--------|
| 1. Unit tests for kill switch 7/7 passing | ✅ |
| 2. `SCRAPER_ENABLED=false` smoke produces `heartbeat skipped` + `kill_switch_set` within 60s | ✅ (transcript above) |
| 3. Unset-env smoke produces `heartbeat tick` + `status:ok` within 60s | ✅ (transcript above) |
| 4. `SIGTERM` produces `shutdown:start` → `shutdown:complete` before exit | ✅ (transcript above) |
| 5. `fly secrets set SCRAPER_ENABLED=false` real-deployment round-trip | Deferred to Plan 06 (deployment verification) |

### Threat mitigations (from plan `<threat_model>`)

| Threat ID | Mitigation applied |
|-----------|-------------------|
| T-03-01 (tick-time env read) | `_heartbeatTick` reads `process.env.SCRAPER_ENABLED` inside the callback; no module-scope `const enabled = scrapingEnabled()` anywhere in scheduler.ts |
| T-03-04 ([env] footgun) | `docs/ops-runbook.md` has an explicit "Do NOT put SCRAPER_ENABLED in fly.toml [env]" section with rationale |

## Named contracts (downstream consumers)

- `scrapingEnabled(env?: NodeJS.ProcessEnv): boolean` — consumed by `_heartbeatTick` today; Phase 1's real scrape tick body will consume it too.
- `startScheduler(): void` / `stopScheduler(): void` — consumed by `runStartup` and `installShutdownHandlers`.
- `_heartbeatTick(): Promise<void>` — **Plan 04 (dead-man's switch) will wrap this body** with `pingHealthcheck('start')` → work → `pingHealthcheck('success')` / `('fail')`.
- `installShutdownHandlers(): void` — idempotent; Plan 04/05/Phase 1 should call it at most once via `runStartup`.
- `runStartup(): void` — unchanged signature; `src/hooks.server.ts` imports it verbatim. The Plan 00 placeholder contract held.

## Deviations from Plan

None — plan executed exactly as written. The runbook, code, and test contents are byte-for-byte the specified implementations from the plan's `<action>` blocks.

## Note to Plan 04 (dead-man's switch)

Wrap `_heartbeatTick` (from `src/lib/server/scheduler.ts`) so the body becomes:

```ts
export async function _heartbeatTick(): Promise<void> {
  const tickLogger = logger.child({ job: 'heartbeat', jobId: crypto.randomUUID() });
  if (!scrapingEnabled(process.env)) {
    tickLogger.warn({ reason: 'kill_switch_set' }, 'heartbeat skipped');
    return; // do NOT ping healthchecks.io — silence is the alert signal
  }
  await pingHealthcheck('start');
  try {
    tickLogger.info({ status: 'ok' }, 'heartbeat tick');
    await pingHealthcheck('success');
  } catch (err) {
    tickLogger.error({ err }, 'heartbeat failed');
    await pingHealthcheck('fail');
  }
}
```

The "silence when halted" semantics are deliberate per threat T-03-02: a halted scraper SHOULD cause the dead-man's switch to fire, because that's the operator-visible signal that scraping is stopped (CLAUDE.md rule 2).

## Self-Check: PASSED

- `src/lib/server/kill-switch.ts` — FOUND
- `src/lib/server/scheduler.ts` — FOUND
- `src/lib/server/shutdown.ts` — FOUND
- `src/lib/server/startup.ts` (modified) — FOUND
- `tests/scheduler/kill-switch.test.ts` — FOUND
- `docs/ops-runbook.md` — FOUND
- Commit `6e9022f` (Task 1) — FOUND in `git log`
- Commit `e8ec58f` (Task 2) — FOUND in `git log`
- Commit `9596ea0` (Task 3) — FOUND in `git log`
