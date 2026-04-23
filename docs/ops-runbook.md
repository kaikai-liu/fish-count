# Ops Runbook — FishCount

Operator reference for the Phase 0 guardrails. For Litestream see `docs/ops-litestream.md`; for logging see `docs/ops-logging.md`.

## Kill switch (OPS-05)

The scraper is gated by the `SCRAPER_ENABLED` environment variable. Setting it to `false` halts scraping on the next tick without a redeploy.

### Flipping the switch OFF (stop scraping)

```bash
fly secrets set -a fishcount SCRAPER_ENABLED=false
```

This triggers a machine restart (~10–30 seconds). After the restart, the next heartbeat tick logs:
```json
{"level":30,"msg":"heartbeat skipped","job":"heartbeat","reason":"kill_switch_set",...}
```

### Flipping the switch ON (resume scraping)

```bash
fly secrets unset -a fishcount SCRAPER_ENABLED
# or explicitly:
fly secrets set -a fishcount SCRAPER_ENABLED=true
```

After the restart, heartbeat ticks resume with:
```json
{"level":30,"msg":"heartbeat tick","job":"heartbeat","status":"ok",...}
```

### When to use the kill switch

- The source site operator (sandiegofishreports.com) emails asking us to stop. **Act immediately.**
- Scraper is producing anomalous errors and you need to stop ingestion while investigating.
- You are about to do something destructive (volume reset, schema migration) and don't want concurrent writes.

### What the kill switch does NOT affect

- The SvelteKit web server keeps serving (read-only is still safe — no scraping happens via user requests).
- Litestream keeps replicating whatever writes DO happen (including the smoke_test table from Plan 01).
- Dead-man's switch (Plan 04) stops pinging healthchecks.io, so the operator email fires after grace. **This is intentional** — it's a visible signal that scraping is halted.

## Why `fly secrets`, not `fly.toml [env]`?

**Do NOT put `SCRAPER_ENABLED` in `fly.toml` under `[env]`.** That would require `fly deploy` (30–90s redeploy, new image) to change. `fly secrets set` only restarts the running machine and reuses the existing image. This is why the kill-switch gate reads `process.env.SCRAPER_ENABLED` at TICK TIME, not at boot time — so the new value from the restart is picked up on the very next tick.

See 00-RESEARCH.md §Q1 "Why secret, not [env]" and §Pitfall 2 for the full rationale.

## Log lines to expect (in Better Stack or `fly logs`)

| Log line | What it means |
|----------|---------------|
| `startup:start` + `startup:complete` | Process boot |
| `scheduler started` + `jobs: ["heartbeat"]` | Scheduler is running |
| `heartbeat tick` with `status:"ok"` | Normal tick, kill switch off |
| `heartbeat skipped` with `reason:"kill_switch_set"` | Kill switch active |
| `shutdown:start` + `shutdown:complete` | SIGTERM received (from `fly deploy` or `fly secrets set`) |

## Restarting the app

```bash
fly machine restart -a fishcount       # single-machine (current Phase 0 setup)
fly apps restart fishcount              # all machines in app
```

A restart loses the current heartbeat cycle but the next minute's tick picks up immediately. No data is lost (Litestream handles any in-flight writes on SIGTERM shutdown).

## Full shutdown (maintenance)

```bash
fly scale count 0 -a fishcount   # stop all machines
# do work...
fly scale count 1 -a fishcount   # bring back up
```

Note: `min_machines_running = 1` in `fly.toml` means Fly will try to keep the machine alive. Scale to 0 explicitly if you need a cold stop.
