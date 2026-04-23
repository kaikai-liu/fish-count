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

*Plan files will populate this table with concrete task IDs. Below is the skeleton of required validation points derived from RESEARCH.md `## Validation Architecture`.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | — | — | vitest installed, test dir exists | infra | `test -f vitest.config.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | OPS-06 | — | Resend domain verified; SPF/DKIM/DMARC green | manual | see manual table | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | OPS-01 | — | croner tick reads `process.env.SCRAPER_ENABLED` at fire time | unit | `npm run test -- --run tests/scheduler/kill-switch.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | OPS-01 | — | Setting `fly secrets set SCRAPER_ENABLED=false` halts next tick without redeploy | manual | see manual table | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | OPS-02 | — | Each successful scrape tick pings healthchecks.io URL | unit | `npm run test -- --run tests/scheduler/heartbeat.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | OPS-02 | — | 36h absence fires email alert (force by pausing heartbeat in staging) | manual | see manual table | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | OPS-03 | — | Weekly GH Actions workflow queries Fly GraphQL monthly cost | infra | `test -f .github/workflows/billing-watcher.yml` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | OPS-03 | — | Cost > $20 sends alert email (simulate with mocked response) | unit | `npm run test -- --run tests/ops/billing-threshold.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | OPS-04 | — | `litestream.yml` valid and references Fly volume + B2 bucket | infra | `litestream validate litestream.yml` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | OPS-04 | — | Live replication observable (Litestream status + B2 bucket has recent WAL file) | manual | see manual table | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | OPS-04 | — | Restore-on-boot verified (delete local DB, boot app, data returns) | manual | see manual table | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | OPS-05 | — | pino logger emits JSON with `request_id` correlation id on every request | unit | `npm run test -- --run tests/lib/logger.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | OPS-05 | — | Fly Log Shipper → Better Stack configured; a manual request is queryable within 60s | manual | see manual table | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Install vitest: `npm i -D vitest @vitest/coverage-v8`
- [ ] Create `vitest.config.ts` with Node environment config
- [ ] Create `tests/` directory with `scheduler/`, `ops/`, `lib/` subfolders
- [ ] Stub test files listed in the verification map above (even if tests fail — structure exists)
- [ ] `package.json` `test` script pointing at vitest
- [ ] Resend domain verification DNS records added (blocks OPS-06 → blocks OPS-02/OPS-03 alerting)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Kill switch halts scraper without redeploy | OPS-01 (SC 1) | Requires real Fly.io deployment + wall-clock wait for next tick | 1. Deploy app with scraper enabled + 5-min scrape cron. 2. Observe a successful tick in logs. 3. Run `fly secrets set SCRAPER_ENABLED=false`. 4. Wait for machine auto-restart (~30s). 5. Observe that the next scheduled tick logs "scraper disabled, skipping" and performs no HTTP request. No redeploy occurred. |
| Dead-man's switch fires after 36h silence | OPS-02 (SC 2) | Requires real healthchecks.io account + 36h wall-clock (can simulate by setting grace period to 2min in staging check) | 1. Create a secondary healthchecks.io check with `grace=2min`. 2. Point a staging scraper at it. 3. Stop the scraper process. 4. Verify operator email arrives within 3min of silence. |
| $20 billing threshold alert | OPS-03 (SC 3) | Requires real Fly GraphQL endpoint + monkey-patching the returned number | 1. Run billing-watcher locally with `FLY_BILLING_OVERRIDE_USD=20.01 node scripts/billing-watcher.js`. 2. Verify a "fly.io monthly spend exceeded $20" email is received from Resend. |
| Litestream observably replicating | OPS-04 (SC 4) | Verifying real B2 bucket contents after a deploy | 1. After first deploy, run `fly ssh console -C "litestream snapshots /data/fishcount.db"` — must show ≥1 snapshot. 2. In B2 bucket console, confirm a `_litestream/` prefix exists with WAL files and a timestamp within the last 10min. |
| Litestream restores on boot | OPS-04 (SC 4) | Requires destructive action on the real volume | 1. Take a logical snapshot (record row counts from a key table). 2. `fly ssh console -C "rm /data/fishcount.db"`. 3. `fly machine restart`. 4. Observe entrypoint logs show "restored from replica". 5. Confirm row counts match the pre-delete snapshot. |
| Structured logs retained + queryable | OPS-05 (SC 5) | Requires real Fly Log Shipper + Better Stack (or equivalent) endpoint | 1. Issue a manual `curl https://<app>/healthz` with a unique query string `?probe=<uuid>`. 2. Wait 60s. 3. Query Better Stack with `probe=<uuid>`. 4. Exactly one structured log line with `request_id` and `probe=<uuid>` must return. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify OR an entry in the Manual-Only table with a concrete procedure
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (vitest install, Resend domain, test dir skeleton)
- [ ] No watch-mode flags (always `--run`)
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter (gated by planner populating concrete task IDs)

**Approval:** pending
