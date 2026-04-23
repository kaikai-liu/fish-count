---
phase: 0
slug: ops-guardrails
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-23
---

# Phase 0 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x (to be installed in Wave 0) |
| **Config file** | `vitest.config.ts` — Wave 0 installs |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test -- --run` |
| **Estimated runtime** | ~30 seconds (Phase 0 scope only) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run <changed-file>`
- **After every plan wave:** Run `npm run test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green AND manual verifications (below) executed
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

*Derived from RESEARCH.md `## Validation Architecture` and the 7 authored PLAN files. Task IDs use `{plan}-{task}` shape (e.g., `00-03-01` = Plan 00-03, Task 1).*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 00-00-01 | 00-00-PLAN.md | 1 | — | T-00-03 | vitest + @vitest/coverage-v8 installed; `npm run build` green | infra | `npm run build && npm run test:run` | ❌ W0 | ⬜ pending |
| 00-00-02 | 00-00-PLAN.md | 1 | — | T-00-02, T-00-04 | Dockerfile + fly.toml + entrypoint.sh scaffolded; `tests/` tree exists | infra | `test -f vitest.config.ts && test -d tests/unit` | ❌ W0 | ⬜ pending |
| 00-02-03 | 00-02-PLAN.md | 1 | OPS-06 | T-02-01 | pino logger emits JSON with `request_id` correlation on every request | unit | `npm run test -- --run tests/lib/logger.test.ts` | ❌ W0 | ⬜ pending |
| 00-06-04 | 00-06-PLAN.md | 4 | OPS-06 | T-06-02 | Fly Log Shipper → Better Stack configured; a manual request queryable within 60s | manual | see manual table | ❌ W0 | ⬜ pending |
| 00-03-01 | 00-03-PLAN.md | 2 | OPS-05 | T-03-01 | `scrapingEnabled()` reads `process.env.SCRAPER_ENABLED` at call time, defaults fail-open | unit | `npm run test -- --run tests/scheduler/kill-switch.test.ts` | ❌ W0 | ⬜ pending |
| 00-03-02 | 00-03-PLAN.md | 2 | OPS-05 | T-03-02 | croner tick body reads env at tick fire time (not module boot) | unit | `npm run test -- --run tests/scheduler/` | ❌ W0 | ⬜ pending |
| 00-06-04 | 00-06-PLAN.md | 4 | OPS-05 | T-06-03 | `fly secrets set SCRAPER_ENABLED=false` halts next tick without redeploy | manual | see manual table | ❌ W0 | ⬜ pending |
| 00-04-01 | 00-04-PLAN.md | 3 | OPS-04 | T-04-01, T-04-02 | `pingHealthcheck()` posts correct URL shape; no-op when env unset; non-fatal on fetch error | unit | `npm run test -- --run tests/scheduler/heartbeat.test.ts` | ❌ W0 | ⬜ pending |
| 00-04-02 | 00-04-PLAN.md | 3 | OPS-04 | T-04-05 | Tick body: kill-switch checked BEFORE any ping; `pingHealthcheck` called 0 times when disabled | unit | `npm run test -- --run tests/scheduler/` | ❌ W0 | ⬜ pending |
| 00-06-03 | 00-06-PLAN.md | 4 | OPS-04 | T-04-03 | 36h absence fires email alert (force by pausing heartbeat in staging — grace=5min drill) | manual | see manual table | ❌ W0 | ⬜ pending |
| 00-05-01 | 00-05-PLAN.md | 2 | OPS-01 | T-05-07 | `checkThresholds()` idempotent; `$20`/`$50`/`$100` state machine; month rollover resets | unit | `npm run test -- --run tests/ops/billing.test.ts` | ❌ W0 | ⬜ pending |
| 00-05-01 | 00-05-PLAN.md | 2 | OPS-01 | T-05-02 | `sendOperatorAlert()` calls Resend SDK with correct args; missing env throws | unit | `npm run test -- --run tests/ops/operator-alert.test.ts` | ❌ W0 | ⬜ pending |
| 00-05-03 | 00-05-PLAN.md | 2 | OPS-01 | T-05-01, T-05-03 | Weekly GH Actions workflow queries Fly GraphQL; commits state back to repo | infra | `test -f .github/workflows/billing-check.yml` | ❌ W0 | ⬜ pending |
| 00-06-04 | 00-06-PLAN.md | 4 | OPS-01 | — | Simulated $20.01 spend via `workflow_dispatch` sends alert email; re-run idempotent | manual | see manual table | ❌ W0 | ⬜ pending |
| 00-01-01 | 00-01-PLAN.md | 2 | OPS-03 | T-01-04 | Dockerfile builds Litestream stage; entrypoint runs `litestream restore -if-db-not-exists -if-replica-exists` before Node | infra | `grep -q "litestream restore -if-db-not-exists -if-replica-exists" scripts/entrypoint.sh` | ❌ W0 | ⬜ pending |
| 00-01-02 | 00-01-PLAN.md | 2 | OPS-03 | T-01-01 | `litestream.yml` valid; references Fly volume + B2 bucket via env vars | infra | `grep -q "type: s3" litestream.yml && grep -q "force-path-style: true" litestream.yml` | ❌ W0 | ⬜ pending |
| 00-06-03 | 00-06-PLAN.md | 4 | OPS-03 | T-01-01 | Live replication observable (Litestream status + B2 bucket has recent WAL file) | manual | see manual table | ❌ W0 | ⬜ pending |
| 00-06-03 | 00-06-PLAN.md | 4 | OPS-03 | T-01-05 | Restore-on-boot verified (delete local DB, boot app, data returns) | manual | see manual table | ❌ W0 | ⬜ pending |
| 00-06-02 | 00-06-PLAN.md | 4 | OPS-02 | — | App deployed to Fly; `https://fishcount.fly.dev/healthz` returns 200 with `{"ok":true}` | manual | see manual table | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Install vitest: `npm i -D vitest @vitest/coverage-v8` (handled in Plan 00-00 Task 1)
- [ ] Create `vitest.config.ts` with Node environment config (Plan 00-00 Task 2)
- [ ] Create `tests/` directory with `scheduler/`, `ops/`, `lib/`, `unit/`, `fixtures/` subfolders (Plan 00-00 Task 2)
- [ ] Stub test files listed in the verification map above (even if tests fail — structure exists)
- [ ] `package.json` `test` script pointing at vitest (Plan 00-00 Task 1)
- [ ] Resend domain verification DNS records added (blocks OPS-01 billing alerts and OPS-04 dead-man's-switch email delivery — both depend on Resend domain verification)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Kill switch halts scraper without redeploy | OPS-05 | Requires real Fly.io deployment + wall-clock wait for next tick | 1. Deploy app with scraper enabled + 5-min scrape cron. 2. Observe a successful tick in logs. 3. Run `fly secrets set SCRAPER_ENABLED=false`. 4. Wait for machine auto-restart (~30s). 5. Observe that the next scheduled tick logs "scraper disabled, skipping" and performs no HTTP request. No redeploy occurred. |
| Dead-man's switch fires after 36h silence | OPS-04 | Requires real healthchecks.io account + 36h wall-clock (can simulate by setting grace period to 2min in staging check) | 1. Create a secondary healthchecks.io check with `grace=2min`. 2. Point a staging scraper at it. 3. Stop the scraper process. 4. Verify operator email arrives within 3min of silence. |
| $20 billing threshold alert | OPS-01 | Requires real Fly GraphQL endpoint + simulated spend override | 1. GitHub → Actions → Billing Check → Run workflow → `test_spend: 20.01`. 2. Verify a "fly.io monthly spend crossed $20" email is received from Resend. 3. Re-run with same value — verify NO second email (idempotent). |
| Litestream observably replicating | OPS-03 | Verifying real B2 bucket contents after a deploy | 1. After first deploy, run `fly ssh console -C "litestream snapshots /data/fishcount.db"` — must show ≥1 snapshot. 2. In B2 bucket console, confirm a `_litestream/` prefix exists with WAL files and a timestamp within the last 10min. |
| Litestream restores on boot | OPS-03 | Requires destructive action on the real volume | 1. Take a logical snapshot (record row counts from a key table). 2. `fly ssh console -C "rm /data/fishcount.db"`. 3. `fly machine restart`. 4. Observe entrypoint logs show "restored from replica". 5. Confirm row counts match the pre-delete snapshot. |
| Structured logs retained + queryable | OPS-06 | Requires real Fly Log Shipper + Better Stack (or equivalent) endpoint | 1. Issue a manual `curl https://<app>/healthz` with a unique query string `?probe=<uuid>`. 2. Wait 60s. 3. Query Better Stack with `probe=<uuid>`. 4. Exactly one structured log line with `request_id` and `probe=<uuid>` must return. |
| Deployed always-on HTTPS | OPS-02 | Requires real Fly deploy + certificate issuance | 1. `fly deploy`. 2. `curl -fsSL https://fishcount.fly.dev/healthz` returns HTTP 200 with `{"ok":true}`. 3. `curl -I http://fishcount.fly.dev/healthz` returns a 301/308 redirect to HTTPS (force_https honored). |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify OR an entry in the Manual-Only table with a concrete procedure
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (vitest install, Resend domain, test dir skeleton)
- [ ] No watch-mode flags (always `--run`)
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter (gated by execution populating real status columns)

**Approval:** pending
