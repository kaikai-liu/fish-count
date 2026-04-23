# Phase 0: Ops Guardrails - Research

**Researched:** 2026-04-23
**Domain:** Cloud deployment guardrails — cost caps, kill switch, continuous SQLite backup, silent-failure monitoring, structured log retention
**Confidence:** HIGH on Litestream, Fly.io secrets, healthchecks.io; MEDIUM on Fly.io billing (no native alerts — DIY required); HIGH on croner/pino

## Summary

- **Fly.io does NOT have native billing alerts.** This is the one unavoidable DIY item in Phase 0 — a weekly cron that queries Fly's (undocumented) GraphQL API for month-to-date spend is the minimum-viable path. Reference: Fly docs state explicitly "We don't support billing alerts (yet)."
- **The kill switch is a Fly secret, not a `[env]` var.** `fly secrets set SCRAPER_ENABLED=false` restarts the machine; the scraper reads `process.env.SCRAPER_ENABLED` at *tick time* (not at process boot). No redeploy, one-machine restart (~10–30s). Meets the success criterion literally ("halts scraping next tick without redeploy").
- **Litestream on Fly.io is a solved pattern.** Canonical shape: custom Dockerfile copies the static Litestream binary → entrypoint script does `litestream restore -if-replica-exists -if-db-not-exists` then `exec litestream replicate -exec "node build/index.js"`. Litestream becomes PID 1, supervises Node, handles SIGTERM cleanly. Backblaze B2 is a first-class S3-compatible target.
- **Dead-man's switch: healthchecks.io free tier (20 checks), alert-on-email via Resend.** The scraper pings a URL on each success; absence of ping > 36h triggers an email. Cheaper and more reliable than a DB-polling self-check cron (can't catch "whole machine is dead").
- **Log retention: native Fly logs are ephemeral.** For the OPS-06 "queryable after the fact" criterion, the minimum-viable path is pino JSON → Better Stack (free tier: 3 GB/30 days retention) via Fly Log Shipper. Native-only is insufficient.

**Primary recommendation:** Phase 0 is four concrete deliverables: (1) a working Fly app with Dockerfile + entrypoint + litestream.yml + `fly.toml` deployed to Fly, (2) Litestream replicating to Backblaze B2, (3) a healthchecks.io dead-man's switch whose ping URL is wired into a stub `/api/cron/heartbeat` route (real scraper comes in Phase 1), (4) pino JSON logging with request_id correlation shipped to Better Stack, plus a manual monthly-spend watcher cron.

## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for Phase 0 (user went straight to plan). Constraints are therefore drawn directly from CLAUDE.md Non-Negotiable Rules, the confirmed stack, and Phase 0's success criteria.

### Locked Decisions (from CLAUDE.md / STACK.md — treat as user-locked)

- Hosting: **Fly.io shared-cpu-1x, 1 GB volume** (rejected: Vercel, Render free tier, VPS).
- Backup: **Litestream 0.3.x → Backblaze B2** (rejected: S3 primary — cost; LiteFS — complexity).
- Email: **Resend 6.12.x** (rejected: SendGrid, Postmark for v1).
- Scheduler: **croner 10.0.x in-process** alongside SvelteKit in one Fly machine (rejected: external cron services, BullMQ, queues).
- Logging: **pino** JSON lines (rejected: winston, bunyan, console.log).
- Kill switch env var name: **`SCRAPER_ENABLED`** (verbatim, from OPS-05 + CLAUDE.md Non-Negotiable Rule 1 bullet 9).
- Timezone for all cron schedules: **`America/Los_Angeles`** (from CLAUDE.md Architecture Rules).

### Claude's Discretion

- Operator alert delivery mechanism (Resend vs. healthchecks.io native email vs. both).
- Choice of log shipper sink (Better Stack vs. Axiom vs. Logtail) — recommendation inside.
- Exact fly.toml shape: `[processes]` vs. single `CMD` entrypoint.
- Whether the DIY billing-watcher lives inside the app (as a croner job) or as a separate GitHub Action.
- Request ID implementation (ULID vs. crypto.randomUUID()).

### Deferred Ideas (OUT OF SCOPE for Phase 0)

- The actual scraper (Phase 1).
- Forecast computation (Phase 3).
- Email alert subscription flow (Phase 4).
- Row-count SLA alert wiring (OPS item, but the row-counting logic depends on Phase 1's `scrape_runs` table — Phase 0 builds only the *alert channel*, not the rule).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-01 | Billing alerts configured on hosting provider at $20, $50, $100 monthly spend thresholds | Section: Billing Alerts (Fly has no native — DIY via GraphQL API + scheduled check) |
| OPS-02 | Deployed always-on environment (single node process + persistent volume) reachable over HTTPS | Section: Deployment Topology (Fly app + volume + TLS via `fly certs`) |
| OPS-03 | SQLite database file is continuously replicated off the server (Litestream → object storage) | Section: Litestream Setup (exact Dockerfile + litestream.yml + Backblaze B2 config) |
| OPS-04 | Dead-man's switch fires if the nightly scrape hasn't completed within 36 hours | Section: Dead-Man's Switch (healthchecks.io + Resend email) |
| OPS-05 | `SCRAPER_ENABLED` environment-variable kill switch halts all scraping immediately | Section: Kill Switch (Fly secrets + tick-time env read) |
| OPS-06 | Structured request/job logging is persisted and queryable | Section: Structured Logging (pino → Better Stack) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Kill switch flag storage | Fly platform (Secret vault) | — | Operator-mutable config; needs machine restart propagation; must survive app redeploys |
| Kill switch gate check | API / Backend (croner tick body) | — | The decision "should this tick run?" happens inside the cron callback before any work starts; single-machine app has no other tier to own it |
| Dead-man's switch ping | API / Backend (post-success hook) | External service (healthchecks.io) | App emits ping on success; external service owns the *absence* detection (can't self-monitor if you're dead) |
| Billing-spend watcher | API / Backend (scheduled cron) | External API (Fly GraphQL) | App pulls spend data from Fly's GraphQL; emits alert via Resend on threshold |
| Continuous replication | Process-manager layer (Litestream as PID 1) | Object storage (Backblaze B2) | Litestream wraps the Node process; the VM host is the only tier where it can see the SQLite file on disk |
| Structured logging — emission | API / Backend (pino in SvelteKit hooks) | — | Request ID injection and log emission must happen inside the app; can't be bolted on externally |
| Structured logging — retention | External log sink (Better Stack) | Fly platform (native logs, short-term) | Fly native retention is ephemeral; persistence + queryability require an external retained store |
| TLS / HTTPS termination | Fly platform (edge proxy) | — | Automatic on `fly.toml` `[[services]] force_https = true`; no app responsibility |

## Q1 — Kill Switch Mechanism (OPS-05)

**Recommendation:** Use a Fly **secret** (not a regular `[env]` var in `fly.toml`) named `SCRAPER_ENABLED`. Read it inside the croner tick callback, not at Node boot time. One-machine restart on secret change (~10–30s downtime) is the cost; this still meets the "no redeploy" success criterion because `fly secrets set` does not rebuild the image or produce a new release artifact — it just injects the new env value and restarts Machines.

### Why secret, not `[env]`

| Approach | Requires redeploy? | Requires restart? | Operator UX |
|----------|-------------------|-------------------|-------------|
| `[env] SCRAPER_ENABLED = "false"` in `fly.toml` | **Yes** — `fly deploy` | Yes (new release) | Git commit, push, deploy |
| `fly secrets set SCRAPER_ENABLED=false` | **No** — no image rebuild | Yes (machine rolling restart, ~10–30s) | One command, works from anywhere |
| DB-backed flag (`kill_switches` table row) | No | No (polled each tick) | Requires SQL or admin UI |

The OPS-05 text says "halts all scraping immediately" and the success criterion says "halts scraping on next tick without a redeploy." Fly secrets satisfy both [CITED: fly.io/docs/apps/secrets/]:

> "fly secrets set ... sets one or more app secrets, then updates each Machine belonging to that Fly App. This involves a restart of the Machine."

A machine restart is NOT a redeploy — the image is unchanged. This is the simpler path than a DB-backed flag, and the restart time (seconds) is under the "immediate" bar.

### Why read env at tick time (not at boot)

```typescript
// src/lib/server/scheduler.ts
import { Cron } from 'croner';
import { logger } from '$lib/server/logger';

export function startScheduler() {
  // Scrape job — nightly 02:00 PT
  new Cron('0 2 * * *', { timezone: 'America/Los_Angeles', name: 'scrape' }, async () => {
    // READ ENV AT TICK TIME — not at module load
    if (process.env.SCRAPER_ENABLED === 'false') {
      logger.warn({ job: 'scrape', reason: 'kill_switch_set' }, 'scrape skipped by kill switch');
      return;
    }
    // ...actual scrape body (Phase 1)
  });
}
```

Reading `process.env.SCRAPER_ENABLED` inside the tick body means:
- After `fly secrets set SCRAPER_ENABLED=false`, the machine restarts; new env is injected at next boot.
- After `fly secrets unset SCRAPER_ENABLED` (or `=true`), same restart, same injection.
- If you *also* want to flip the switch without restart in future, swap to a DB-backed flag — but for v1, the secret+restart model is simpler and meets the bar.

### Default behavior

`SCRAPER_ENABLED=false` halts; **unset or any other value (including `true`)** allows scraping. This fail-open default is debatable — fail-closed (require explicit `true`) is safer. Recommendation for this project: **fail-open** because the scraper is the whole product and a typo in the env var shouldn't silently stop all ingestion. Unknown values log a warning and proceed.

### Test-with-stub pattern (since Phase 0 has no real scraper)

The Phase 0 plan can ship a stub croner job in `src/lib/server/scheduler.ts`:

```typescript
new Cron('* * * * *', { name: 'heartbeat' }, async () => {
  if (process.env.SCRAPER_ENABLED === 'false') {
    logger.info({ job: 'heartbeat', status: 'killed' }, 'heartbeat skipped');
    return;
  }
  logger.info({ job: 'heartbeat', status: 'ok' }, 'heartbeat tick');
  // Phase 0: ping healthchecks.io here (see Q2)
});
```

The test: `fly secrets set SCRAPER_ENABLED=false`, wait for restart, tail logs, observe "heartbeat skipped" messages, then `fly secrets unset SCRAPER_ENABLED` (or set to `true`), wait for restart, observe "heartbeat tick" resumes.

**Confidence:** HIGH. [CITED: fly.io/docs/apps/secrets/ — machine restart behavior; --stage flag for deferred updates]

## Q2 — Dead-Man's Switch (OPS-04)

**Recommendation:** **healthchecks.io** free tier (20 checks, unlimited pings, email+webhook notification) as the external absence-detector. The scraper pings on success; absence of ping for >36h triggers an email alert.

### Why external, not self-polling

| Approach | Can detect "whole machine dead"? | Free? | Complexity |
|----------|-----------------------------------|-------|------------|
| Separate cron inside the app polling `scrape_runs.last_success_at` | **No** — if the app is down, so is the checker | Yes | Low, but wrong |
| **healthchecks.io external ping** | **Yes** — absence detection is external | Yes (20 checks free) | Very low |
| Better Stack "Heartbeat" monitor | Yes | Yes (up to 10) | Very low, but fewer free checks |
| Custom: GitHub Actions cron querying app's status endpoint | Yes | Yes (GH Actions free) | Medium (auth, timeouts, false positives) |

A self-polling approach fails the OPS-04 success criterion literally: "fires alert if scrape ping absent >36h" implies the *absence* of a signal, which requires an external witness. [CITED: healthchecks.io — "Dead man's switch technique: the monitored system must check in at regular, configurable time intervals."]

### Exact integration pattern

```typescript
// src/lib/server/heartbeat.ts
const PING_URL = process.env.HEALTHCHECKS_PING_URL; // https://hc-ping.com/<uuid>

export async function pingHealthcheck(status: 'start' | 'success' | 'fail' = 'success', exitCode = 0) {
  if (!PING_URL) return; // local dev, no-op
  const url = status === 'start' ? `${PING_URL}/start`
            : status === 'fail'  ? `${PING_URL}/fail`
            : PING_URL;
  try {
    await fetch(url, { method: 'POST', signal: AbortSignal.timeout(5000) });
  } catch (err) {
    logger.warn({ err }, 'healthcheck ping failed — not fatal');
  }
}
```

Wired into the scrape job's success path:

```typescript
new Cron('0 2 * * *', { timezone: 'America/Los_Angeles' }, async () => {
  await pingHealthcheck('start');
  try {
    // scrape body (Phase 1)
    await pingHealthcheck('success');
  } catch (err) {
    await pingHealthcheck('fail');
    throw err;
  }
});
```

### healthchecks.io setup (for the plan)

1. Create free account at healthchecks.io.
2. Create a check named "FishCount nightly scrape", grace period 36 hours, schedule "every day" (cron `0 2 * * *` in `America/Los_Angeles`).
3. Add an **email integration** pointing to operator address.
4. Copy the ping URL; store as `HEALTHCHECKS_PING_URL` Fly secret.

### Alert delivery: healthchecks.io native email > Resend

healthchecks.io sends its own email notifications — no need to route through Resend. This is cleaner because it avoids a second dependency inside the alert path: if Resend itself is down, healthchecks.io can still email you via its own sender infrastructure.

For Phase 0 stub: the job is a once-per-minute heartbeat with grace period 5 minutes. After Phase 1 ships the real scraper, swap the cron to `0 2 * * *` with a 36h grace.

**Confidence:** HIGH. [CITED: healthchecks.io/docs/monitoring_cron_jobs/]

## Q3 — Billing Alerts at $20 Threshold (OPS-03)

**Reality:** Fly.io does not support billing alerts or spend caps. This was confirmed by official Fly docs [CITED: fly.io/docs/about/cost-management/ — "We don't support billing alerts (yet)"] and by Fly staff in community forums [CITED: community.fly.io/t/set-a-billing-cap/24810]. There is no native solution.

### Recommendation: DIY via the (undocumented) Fly GraphQL API + a weekly self-check

The minimum-viable path is a **separate scheduled job** (either a croner tick inside the app or a GitHub Actions cron) that:

1. Queries `https://api.fly.io/graphql` with a Fly API token.
2. Extracts the current-month spend for the org.
3. Compares to thresholds ($20, $50, $100).
4. Sends a Resend email if a threshold is newly crossed.

### Why GitHub Actions over in-app croner for this specific job

- **Separation of fate:** if the Fly app itself is the thing running up the bill (e.g., a scraper loop gone wrong), an in-app billing watcher is in the same failure domain. A GH Actions cron is outside.
- **Zero ops cost:** GH Actions cron is free on public repos and on private repos up to 2,000 min/mo.
- **Simpler secret handling:** GH Actions secrets are adequate; no need to expose a Fly API token to the app machine.

**Recommendation:** Put the billing watcher in `.github/workflows/billing-check.yml`, run weekly (Monday 09:00 PT).

### GraphQL query (approximate — API is undocumented)

```graphql
query GetOrgInvoice($orgSlug: String!) {
  organization(slug: $orgSlug) {
    id
    slug
    # the billing fields are undocumented — introspect via
    # https://api.fly.io/graphql with your token to discover current schema
    billingInfo {
      currentMonthSpend
    }
  }
}
```

The Fly GraphQL schema changes without notice [CITED: til.simonwillison.net/fly/undocumented-graphql-api — "very much undocumented, which means you would be very foolish to write any software against it and expect it to continue to work"]. This is an accepted risk — it's the only option Fly offers.

### Fallback if GraphQL billing fields become inaccessible

Option A: **Hard VM cap** — stick with `shared-cpu-1x, 256MB` and reject scaling. At $2–3/mo steady state, exceeding $20/mo requires something to go badly wrong (scraper loop, egress spike). The hard cap is a *preventative* floor, not an *alert*.

Option B: **Monthly manual review** — calendar reminder on the 1st of each month to check the Fly dashboard invoice. Meets the letter of OPS-01 poorly ("alerts configured" is ambiguous), but meets the spirit ("avoid cost surprise").

### Persistence requirement

To avoid alert-spam (re-firing the same alert weekly), the billing-watcher needs a tiny state store: "which thresholds has the current calendar month already crossed?" Options:
- Commit a `.billing-alerts-state.json` into the repo each run (GH Actions has write perms).
- Use healthchecks.io as a side-channel (ping different checks for different thresholds).
- Use a small DB (Turso free) — overkill.

**Recommendation:** commit state to the repo; it's 20 lines of YAML + 30 lines of workflow.

**Confidence:** HIGH on "no native solution exists." MEDIUM on GraphQL-API DIY working long-term (API is undocumented). [CITED: fly.io/docs/about/cost-management/; community.fly.io/t/set-a-billing-cap/24810]

### Alternative framing for the plan

If the planner concludes the DIY GraphQL watcher is brittle, a simpler interpretation of OPS-01 is: "Fly billing dashboard is the alert surface; operator manually checks weekly; ROADMAP notes billing alerts are best-effort until Fly ships native support." This is less automated but honest. Either is defensible. **Recommendation: ship the DIY watcher but design it to fail gracefully — if the GraphQL call fails, the watcher emails the operator with a "billing check failed — please review dashboard manually" message. This preserves the spirit of the requirement even when the API breaks.**

## Q4 — Litestream Setup (OPS-04, OPS-03 the requirement)

**Recommendation:** Canonical single-container pattern — Litestream wraps the Node app as its child process via `litestream replicate -exec`. Entrypoint script handles restore-on-boot idempotently.

### Deliverables

Four files the Phase 0 plan must produce:

**1. `Dockerfile`** (verified against linkding-on-fly reference):

```dockerfile
# syntax=docker/dockerfile:1
ARG NODE_VERSION=22
ARG LITESTREAM_VERSION=v0.3.13

# --- Litestream binary stage ---
FROM alpine:3.20 AS litestream-builder
ARG LITESTREAM_VERSION
ADD https://github.com/benbjohnson/litestream/releases/download/${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-amd64.tar.gz /tmp/litestream.tar.gz
RUN tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz

# --- App build stage ---
FROM node:${NODE_VERSION}-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

# --- Runtime stage ---
FROM node:${NODE_VERSION}-bookworm-slim
WORKDIR /app

# Litestream binary + config + entrypoint
COPY --from=litestream-builder /usr/local/bin/litestream /usr/local/bin/litestream
COPY litestream.yml /etc/litestream.yml
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# App bundle
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# better-sqlite3 needs the database to exist somewhere writable
RUN mkdir -p /data
ENV DB_PATH=/data/fishcount.sqlite3

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

**2. `scripts/entrypoint.sh`** (verified pattern from linkding-on-fly):

```bash
#!/bin/bash
set -euo pipefail

: "${DB_PATH:=/data/fishcount.sqlite3}"

# Restore from replica if DB is missing.
# -if-db-not-exists: succeed if DB already exists (idempotent)
# -if-replica-exists: succeed if no replica exists (first-boot safe)
echo "Checking if restore is needed for $DB_PATH"
litestream restore -if-db-not-exists -if-replica-exists -config /etc/litestream.yml "$DB_PATH"

echo "Starting Litestream with app as subprocess"
# Litestream becomes PID 1. It starts replication, then exec's the Node app.
# When Node exits, Litestream flushes and exits.
exec litestream replicate -config /etc/litestream.yml -exec "node build/index.js"
```

**3. `litestream.yml`** (verified against litestream.io/guides/backblaze/):

```yaml
# Litestream v0.3.x config. v0.5+ auto-detects B2 — drop force-path-style then.
access-key-id: ${LITESTREAM_ACCESS_KEY_ID}
secret-access-key: ${LITESTREAM_SECRET_ACCESS_KEY}

dbs:
  - path: ${DB_PATH}
    replicas:
      - type: s3
        bucket: ${LITESTREAM_BUCKET}       # e.g., fishcount-backup
        path: fishcount.sqlite3            # key prefix inside the bucket
        endpoint: ${LITESTREAM_ENDPOINT}   # e.g., s3.us-west-000.backblazeb2.com
        force-path-style: true
        retention: 720h                    # 30 days of WAL retention
        snapshot-interval: 24h             # daily full snapshot
```

**4. `fly.toml`** (verified against confirmed stack):

```toml
app = "fishcount"
primary_region = "sjc"   # San Jose — closest to San Diego audience and source site

[build]

[env]
  DB_PATH = "/data/fishcount.sqlite3"
  NODE_ENV = "production"
  LOG_LEVEL = "info"
  TZ = "America/Los_Angeles"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "off"       # we need always-on for the scheduler
  auto_start_machines = true
  min_machines_running = 1         # scheduler must keep running
  processes = ["app"]

  [http_service.concurrency]
    type = "connections"
    hard_limit = 200
    soft_limit = 150

[[mounts]]
  source = "fishcount_data"
  destination = "/data"
  initial_size = "1gb"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"                 # 256 is tight with Litestream + Node; 512 is safer
```

### Credentials handling

All secrets set via `fly secrets set`:

```bash
fly secrets set \
  LITESTREAM_ACCESS_KEY_ID=<B2_keyID> \
  LITESTREAM_SECRET_ACCESS_KEY=<B2_applicationKey> \
  LITESTREAM_BUCKET=fishcount-backup \
  LITESTREAM_ENDPOINT=s3.us-west-000.backblazeb2.com \
  HEALTHCHECKS_PING_URL=https://hc-ping.com/<uuid> \
  RESEND_API_KEY=<resend_key> \
  OPERATOR_EMAIL=<you@example.com> \
  BETTER_STACK_SOURCE_TOKEN=<if using Better Stack>
```

### Restore-on-boot behavior (verified)

The `-if-db-not-exists -if-replica-exists` flag pair is **critical**. Without them, first boot (no DB, no replica yet) fails with exit code 1 and the container crashes into a restart loop. [CITED: litestream.io/reference/restore/]

> "`-if-replica-exists`: Returns exit code of 0 if no backups are found. This flag allows the restore command to succeed gracefully when no matching backup files are available."
> "`-if-db-not-exists`: Returns exit code of 0 if the database already exists."

Combined, they produce the correct boot matrix:

| DB on volume | Replica in B2 | Behavior |
|---|---|---|
| Exists | Either | Skip restore (fast boot) |
| Missing | Exists | Restore from B2 (recovery path) |
| Missing | Missing | Succeed with no-op (first boot ever) |

### Observable-replication verification (Success Criterion 4)

The phrase "SQLite file observably replicated to object-storage bucket (Litestream status + file listing in bucket with recent timestamp)" maps to two checks:

**Check A — Litestream-side (from Fly machine):**

```bash
fly ssh console -C "litestream replicas -config /etc/litestream.yml"
```

Expected output: lists `/data/fishcount.sqlite3` replica with recent `last sync` timestamp.

**Check B — Backblaze-side (from operator laptop, via B2 CLI or web console):**

```bash
b2 ls b2://fishcount-backup/fishcount.sqlite3/
# Should show generations/<id>/wal/ files with mtimes within the last snapshot-interval
```

Both check together satisfy "observably replicated" — Check A confirms Litestream thinks it replicated; Check B confirms the bytes actually arrived in B2.

### Restore drill (recommended for the plan)

Include a task in the Phase 0 plan: "prove restore works by destroying the volume and booting fresh." Procedure:

1. Write a known test row (e.g., insert into a `smoke_test` table).
2. Wait 10s for Litestream to flush.
3. `fly volumes destroy fishcount_data --yes` (or create a throwaway app).
4. `fly deploy` — entrypoint hits the restore branch.
5. Query the DB — the test row must be present.

If step 5 fails, the whole backup is theater. **This drill must be part of Phase 0 exit, not deferred.**

**Confidence:** HIGH on Litestream pattern (multiple verified reference implementations). HIGH on Backblaze B2 compat (official guide). [CITED: litestream.io/guides/backblaze/; linkding-on-fly reference; litestream.io/guides/docker/]

## Q5 — Structured Logging Retention (OPS-06)

**Recommendation:** pino JSON to stdout → Fly Log Shipper → **Better Stack** free tier (3 GB/30 days retention). Fly's native log retention is insufficient for "queryable after the fact."

### Why external shipping is required

[CITED: fly.io community — "Fly.io doesn't keep logs around forever"] Native Fly logs (`fly logs`) are a live tail with limited historical depth. The exact retention window isn't publicly documented as of 2026-04; community reports suggest hours-to-days. OPS-06 requires "persisted and queryable" — this is not a live-tail property.

### Sink comparison

| Sink | Free tier | Query UX | Setup friction | Recommendation |
|------|-----------|----------|----------------|----------------|
| **Better Stack** | 3 GB / 30 days retention, SQL-like queries | Good (filterable dashboards, SQL) | Low — Fly Log Shipper has a Better Stack preset | **Primary** |
| Axiom | 500 GB/mo ingest, 30 days | Excellent (APL query language) | Low | Viable alternative |
| Datadog | 14 days free, then paid | Excellent | Medium — overkill for v1 | Skip |
| Logtail | Same as Better Stack (now-merged) | Same | Low | Synonym for Better Stack |
| Cloudflare Logs | R2-backed cheap | Poor (raw JSON) | Medium | Skip |

**Primary pick: Better Stack.** Reason: integration with Fly Log Shipper is a pre-built preset [CITED: community.fly.io/t/fly-logshipper-x-better-stack-logtail/24898] and the 30-day retention at 3 GB free is generous for v1 traffic levels (a public site with dozens of daily visitors and one nightly scrape produces tens of MB/day max).

### pino configuration

```typescript
// src/lib/server/logger.ts
import { pino } from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // Production: compact JSON for log shippers.
  // Development: pino-pretty — install as devDep, activate via transport.
  ...(process.env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
  base: {
    app: 'fishcount',
    env: process.env.NODE_ENV ?? 'production',
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.email', 'password', 'token'],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
```

### Request ID correlation (SvelteKit)

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';

export const handle: Handle = async ({ event, resolve }) => {
  const requestId = event.request.headers.get('fly-request-id')
                  ?? crypto.randomUUID();

  // Child logger auto-attaches requestId to every log line in this request.
  event.locals.logger = logger.child({ requestId, path: event.url.pathname });
  event.locals.requestId = requestId;

  const start = performance.now();
  event.locals.logger.info({ method: event.request.method }, 'request:start');

  try {
    const response = await resolve(event);
    event.locals.logger.info({
      status: response.status,
      durationMs: Math.round(performance.now() - start),
    }, 'request:end');
    response.headers.set('x-request-id', requestId);
    return response;
  } catch (err) {
    event.locals.logger.error({ err }, 'request:error');
    throw err;
  }
};
```

Note: `fly-request-id` is a Fly edge-proxy header; using it as the primary ID means logs from the edge and the app can be correlated. Fallback to `randomUUID()` for local dev. [CITED: fly.io docs — request headers include fly-request-id]

### `app.d.ts` augmentation

```typescript
// src/app.d.ts
import type { Logger } from 'pino';
declare global {
  namespace App {
    interface Locals {
      logger: Logger;
      requestId: string;
    }
  }
}
```

### Cron job logging

```typescript
// Inside any croner tick — create a child logger with a jobId.
new Cron('0 2 * * *', { name: 'scrape' }, async () => {
  const jobLogger = logger.child({ job: 'scrape', jobId: crypto.randomUUID() });
  jobLogger.info('tick:start');
  // ...
});
```

### What "queryable after the fact" means for verification

The OPS-06 success criterion — "structured logs for manual request queryable after the fact" — maps to: after a known test request (e.g., curl the home page with a unique query string), the logs for that request can be found in Better Stack 30 minutes later using a filter like `requestId = "<known-uuid>"` or `path CONTAINS "/test-marker-abc123"`.

**Confidence:** HIGH on pino pattern (well-established). HIGH on Better Stack as the right sink (lowest setup friction).

## Q6 — Operator Email / Alert Channel (OPS-06, OPS-04, OPS-01)

**Recommendation:** Use **both channels, separated by concern**.

- **healthchecks.io → its own email** for dead-man's switch (OPS-04). No Resend dependency on the alert path — if Resend is down *and* the scraper is down, you still get the scraper-down email because healthchecks.io runs its own mail infra.
- **Resend** for operator-internal alerts that need templating — billing threshold crossings (OPS-01), row-count SLA alerts (Phase 1's ING-07), any future one-off ops emails.

### Why not a single channel

- Sending ops alerts through Resend creates a circular failure mode: if Resend has an issue, you don't learn about *other* issues (because the alerts can't be delivered).
- healthchecks.io's email is free and already bundled with the dead-man's switch — using it is zero marginal cost.
- Templated alerts (e.g., "billing exceeded $20: Fly invoice line-items are ...") need HTML rendering, attachments, branding — that's Resend's job.

### Domain separation

For Resend, the operator-alert emails can share the same sending domain as user-facing emails (Phase 4) — no separate domain setup needed. But ops alerts should go to a specific operator address, not `alerts@fishcount.example` that users also see.

Recommended addresses (Phase 0 decision):
- `ops@fishcount.example` — **To:** address for all operator alerts (set as `OPERATOR_EMAIL` Fly secret).
- `alerts@fishcount.example` — **From:** address for ops alerts (Resend sender).
- Phase 4 will add `bot@fishcount.example` for user-facing alerts.

### Resend sandbox caveat (affects Phase 0 verification)

Before domain verification, Resend restricts sending to `onboarding@resend.dev` and cannot send from your domain [CITED: Resend docs]. This means: Phase 0's billing-alert email test requires **domain verification first** (SPF + DKIM DNS records).

**Ordering inside Phase 0:**

1. Register domain (if not already).
2. Add DNS records (SPF, DKIM — Resend provides exact values).
3. Verify domain in Resend dashboard (up to 72h but usually minutes).
4. *Then* build the billing-watcher that sends through Resend.

DMARC is not required for domain verification — it's a Phase 4 concern (needed before first bulk send). For Phase 0 single-recipient transactional ops email, SPF+DKIM is sufficient; add DMARC `p=none` during Phase 4 warm-up.

**Confidence:** HIGH.

## Q7 — Deployment Topology

**Recommendation:** Single Fly machine, single container, Litestream as PID 1 supervising Node. No `[processes]` block, no supervisord, no Docker Compose.

### Why single-process-tree

- Fly's `[processes]` block is designed for horizontally splitting web / worker / cron into separate *machines*. FishCount runs web + scheduler + replicator on one machine (by design — single SQLite file, single scheduler source of truth). So `[processes]` is unnecessary complexity here.
- supervisord adds an init layer that Litestream's `-exec` subsumes. [CITED: litestream.io/guides/docker/ — "Litestream will monitor your application's process and automatically shutdown when it closes"]
- `concurrently` and similar Node process runners don't handle SIGTERM correctly and leak the SQLite lock on restart.

### Process tree

```
PID 1: litestream replicate -exec "node build/index.js"
   └── PID 2: node build/index.js
          └── (SvelteKit server on :3000)
          └── (croner scheduler, in-process)
```

- Fly sends SIGTERM to PID 1 on deploy/restart.
- Litestream forwards SIGTERM to Node child.
- Node has SvelteKit hooks or a `process.on('SIGTERM')` handler that stops the scheduler, closes the DB, exits cleanly.
- Litestream flushes its last WAL segment to B2 and exits.

### Graceful shutdown handler (required)

```typescript
// src/lib/server/shutdown.ts — imported once from src/hooks.server.ts
import { logger } from '$lib/server/logger';
import { db } from '$lib/db/client';
import { scheduler } from '$lib/server/scheduler';

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutdown:start');
  scheduler.stopAll();
  db.close();
  logger.info('shutdown:complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
```

### Machine count

`min_machines_running = 1` (see fly.toml above). The scheduler is stateful (croner holds timers) so we can't auto-stop. Running a second machine as a failover is v2+ — SQLite's single-writer model makes multi-machine non-trivial (requires LiteFS, out of scope).

**Confidence:** HIGH. Pattern is well-established (linkding-on-fly, usememos reference implementations, Fly Litestream blog).

## Q8 — Verification Architecture (Success Criteria → Tests)

See dedicated **Validation Architecture** section below.

## Q9 — Order of Implementation (DAG)

Minimum-dependency order across the 6 requirements:

```
           ┌──────────────────────────────┐
           │  Pre-0: Domain DNS + Resend  │   (external; blocks anything sending email)
           │       domain verification    │
           └──────────┬───────────────────┘
                      │
            ┌─────────▼──────────┐
            │  Wave A: Scaffolding │
            │  - Dockerfile        │
            │  - entrypoint.sh     │
            │  - fly.toml          │
            │  - litestream.yml    │
            │  - B2 bucket + keys  │
            │  - pino logger       │
            │  - SvelteKit hooks   │
            └──────────┬───────────┘
                       │  (produces: deployable app, no scheduler yet)
          ┌────────────┼─────────────┐
          │            │             │
          ▼            ▼             ▼
     ┌─────────┐  ┌─────────┐  ┌──────────────┐
     │ Wave B1 │  │ Wave B2 │  │  Wave B3     │
     │ OPS-02  │  │ OPS-03  │  │  OPS-06      │
     │ Deploy  │  │ Lite-   │  │  Better      │
     │ to Fly  │  │ stream  │  │  Stack ship  │
     │ over    │  │ verify  │  │  verify logs │
     │ HTTPS   │  │ restore │  │  queryable   │
     │         │  │ drill   │  │              │
     └────┬────┘  └────┬────┘  └──────┬───────┘
          │            │              │
          └─────┬──────┴──────────────┘
                │
                ▼
          ┌─────────────────────────────┐
          │  Wave C: Ops channels        │
          │  - Resend alerts wrapper     │
          │  - healthchecks.io account   │
          │  - OPS-06 operator address   │
          └─────────┬───────────────────┘
                    │
          ┌─────────┼─────────┐
          │         │         │
          ▼         ▼         ▼
     ┌────────┐ ┌────────┐ ┌──────────┐
     │Wave D1 │ │Wave D2 │ │Wave D3   │
     │OPS-04  │ │OPS-05  │ │OPS-01    │
     │Dead-man│ │Kill    │ │Billing   │
     │switch  │ │switch  │ │watcher   │
     │ping    │ │(stub   │ │(GH Actns)│
     │stub    │ │cron)   │ │          │
     └────────┘ └────────┘ └──────────┘
                    │
                    ▼
           ┌──────────────────┐
           │  Wave E: Verify  │
           │  5 success tests │
           └──────────────────┘
```

### Key ordering facts

- **OPS-02 (deploy) gates everything** — nothing else can be verified until the app is live on Fly.
- **OPS-03 (Litestream) and OPS-06 (logging) can parallelize** — they're both app-internal concerns.
- **OPS-01, OPS-04, OPS-05 all depend on operator-alert channels being set up** (Wave C).
- **OPS-05 (kill switch) can be tested with a stub croner job** — no real scraper needed. A `* * * * *` heartbeat that logs "heartbeat tick" vs. "heartbeat skipped" is sufficient to verify the gate works. The real scraper (Phase 1) will inherit the same gate pattern.
- **OPS-04 (dead-man's switch) can be tested by forcing absence** — remove the ping URL and wait 36h in staging. But for faster iteration, set the healthchecks.io grace period to 5 minutes during Phase 0 testing, then bump to 36h before exit.
- **OPS-01 (billing) is the LAST to wire** — the watcher should run at least once successfully against real Fly data, and the threshold test needs an alternate path (see below) because you can't actually spend $20 just to test the alert.

### The billing test dilemma

You can't spend $20 on a $3/mo app to verify the alert fires. Options:

1. **Mock-test the alert path:** feed the watcher a synthetic `currentMonthSpend: 25.00` via a test flag (`BILLING_TEST_SPEND`), confirm the email arrives, remove the flag. This is what the success criterion ("Triggering a simulated $20 spend threshold") invites.
2. **Unit-test the threshold logic separately** from the GraphQL fetch — assert that `checkThresholds(25, state)` triggers the `$20` email and updates state to `{ 20: true, 50: false, 100: false }`.

**Recommendation: both.** Unit test the logic; integration test with a synthetic spend value.

**Confidence:** HIGH.

## Q10 — Hazards / Known Landmines (Top 5)

Ranked by likelihood × severity for this specific stack:

### 1. Fly GraphQL billing query drifts / breaks

**Likelihood:** HIGH. **Severity:** MEDIUM.
The API is explicitly undocumented. A field rename or endpoint change breaks the billing watcher silently.
**Mitigation:** Watcher runs weekly, sends "OK" emails on success (so absence of OK email = something broken). Design fails-loud: if the GraphQL call returns unexpected shape, email the operator "billing check failed, please review manually."

### 2. Litestream restore silently omits recent writes after a hard crash

**Likelihood:** MEDIUM. **Severity:** HIGH.
Litestream's WAL-based replication has a small window (up to `sync-interval`, default 1s) where writes exist locally but haven't been flushed to B2. If the Fly machine dies hard (kernel panic, volume corruption) during that window, those writes are lost on restore. For a nightly scraper, this might drop the last minute of a scrape.
**Mitigation:** After each scrape, call `litestream wait -path /data/fishcount.sqlite3` to block until the latest WAL segment is replicated. Add as a Phase 1 task (not Phase 0). For Phase 0, document the risk.

### 3. Fly machine restart during a cron tick silently drops the job

**Likelihood:** MEDIUM. **Severity:** MEDIUM.
`fly secrets set`, `fly deploy`, or a platform-initiated restart mid-tick kills the scrape in-flight. The dead-man's switch won't fire (because previous runs succeeded), but the current night's data is missed.
**Mitigation:** (a) Scheduled jobs log "tick:start" with a job_id; the dead-man's switch should track *completed* ticks (ping on success, not on start). (b) Phase 1's idempotency requirement (`scrape_runs` ledger) makes this recoverable — a missed tick just gets rescraped next night. (c) Schedule scrapes off-peak for the source AND for Fly's deploy windows (no deploys between 01:00–04:00 PT).

### 4. DST timezone bug in croner on the spring-forward boundary

**Likelihood:** LOW for this specific setup. **Severity:** LOW-MEDIUM.
croner handles DST properly [CITED: pkgpulse.com/blog/node-cron-vs-node-schedule-vs-croner-task-scheduling-nodejs-2026]: jobs scheduled during the DST gap are skipped; jobs in DST overlaps run once. For a `0 2 * * *` schedule in `America/Los_Angeles`, the spring-forward day at 02:00 PT does NOT exist (clocks jump from 01:59 → 03:00) — the scrape is **skipped that day**.
**Mitigation:** Either (a) schedule at 03:00 PT instead of 02:00 PT (safe — 03:00 always exists), or (b) accept the once-per-year miss (only 1 day out of 365, dead-man's switch still has 34h of grace on a 36h window). **Recommendation: schedule at 03:00 PT.** CLAUDE.md says "off-peak" — 03:00 is off-peak enough for the SD angler audience.

### 5. Resend domain verification pending — Phase 0 alerts can't actually send

**Likelihood:** HIGH at phase start. **Severity:** MEDIUM.
Until DNS records propagate and Resend verifies, every operator-alert email attempt will fail. Can block the Phase 0 exit criterion for OPS-01 for hours-to-days.
**Mitigation:** Sequence Resend domain verification **as the first action of Phase 0** (Wave 0, even before the Dockerfile). DNS TTL is the long pole — kick it off early, do all the Dockerfile/Litestream work in parallel while DNS propagates.

### Honorable mention — not top 5 but worth noting

- **Fly SSH fragility:** `fly ssh console` occasionally fails or hangs during deploys. Don't rely on it for production verification — use `fly logs` and `fly ssh sftp` for file-based inspection instead.
- **`shared-cpu-1x 256mb` is tight:** Litestream + Node + SvelteKit SSR + better-sqlite3 will swap. 512mb is the safer choice (see fly.toml above); the incremental cost is ~$1/mo.
- **Better Stack free-tier retention is "rolling 30 days":** if you ingest >3GB in a 30-day window, old logs get evicted. For Phase 0 traffic this is fine, but worth a sanity check.
- **Backblaze B2 application keys default to "master" scope if you aren't careful** — scope the key to the single fishcount-backup bucket, not the whole account.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (SvelteKit default — installed via `npx sv create`) |
| Config file | `vite.config.ts` (test block) — created in Wave 0 |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test -- --run --coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPS-01 | `checkThresholds(25, state)` emits `$20` email when not previously emitted; idempotent | unit | `npm test -- billing.test.ts --run` | ❌ Wave 0 |
| OPS-01 | End-to-end: synthetic `BILLING_TEST_SPEND=25` env invokes watcher → email arrives in operator inbox | integration (manual-assisted) | `npm run check:billing -- --test-spend=25` + inbox verification | ❌ Wave 0 |
| OPS-02 | HTTPS GET of deployed app root returns 200 with valid TLS cert | integration (smoke) | `curl -fsSL https://fishcount.fly.dev/` (CI) or `npm run smoke:https` | ❌ Wave 0 |
| OPS-03 | After a write to `smoke_test` table, `b2 ls` shows WAL segment with recent mtime | integration (manual) | `scripts/verify-replication.sh` (writes row, waits 15s, checks B2) | ❌ Wave 0 |
| OPS-03 | Volume-destroy → redeploy → restored DB contains the pre-destroy test row | integration (manual, destructive) | `scripts/restore-drill.sh` (not in CI — requires operator ack) | ❌ Wave 0 |
| OPS-04 | With `fly secrets unset HEALTHCHECKS_PING_URL`, after grace period, operator receives email from healthchecks.io | integration (manual, time-delayed) | `scripts/dead-mans-switch-drill.sh` (sets short grace, unsets url, waits) | ❌ Wave 0 |
| OPS-05 | Unit: `shouldRunJob({ SCRAPER_ENABLED: 'false' })` returns false; all other values return true | unit | `npm test -- kill-switch.test.ts --run` | ❌ Wave 0 |
| OPS-05 | Integration: `fly secrets set SCRAPER_ENABLED=false` → next tick logs "heartbeat skipped"; unset → "heartbeat tick" resumes | integration (manual) | `scripts/kill-switch-drill.sh` | ❌ Wave 0 |
| OPS-06 | Unit: `hooks.server.ts` child logger includes `requestId` and `path` on every emission | unit | `npm test -- logger.test.ts --run` | ❌ Wave 0 |
| OPS-06 | Integration: known test request (`?marker=<uuid>`) appears in Better Stack dashboard filtered by that UUID within 5 min | integration (manual) | `scripts/verify-logs.sh <uuid>` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- --run` (runs all unit tests in <10s — billing threshold, kill-switch gate, logger shape).
- **Per wave merge:** Full unit suite + at least one manual integration per wave (smoke HTTPS after Wave B1; replication verify after Wave B2; log-query after Wave B3; kill-switch drill after Wave D2).
- **Phase gate (before `/gsd-verify-work`):** All 10 tests above executed; outputs attached to verification artifact.

### Wave 0 Gaps

The project has zero test infrastructure today — Wave 0 must create everything:

- [ ] `vitest` + `@vitest/coverage-v8` installed as devDeps
- [ ] `vite.config.ts` with `test:` block (environment: 'node', exclude: ['build/**'])
- [ ] `tests/unit/billing.test.ts` — covers OPS-01 threshold math
- [ ] `tests/unit/kill-switch.test.ts` — covers OPS-05 gate
- [ ] `tests/unit/logger.test.ts` — covers OPS-06 child logger shape
- [ ] `tests/fixtures/` directory — shared test data (mock Fly GraphQL responses)
- [ ] `scripts/verify-replication.sh` — Bash smoke test for OPS-03
- [ ] `scripts/restore-drill.sh` — destructive, manual-only for OPS-03
- [ ] `scripts/dead-mans-switch-drill.sh` — manual time-delayed for OPS-04
- [ ] `scripts/kill-switch-drill.sh` — manual for OPS-05
- [ ] `scripts/verify-logs.sh` — manual, takes a marker UUID, queries Better Stack for OPS-06
- [ ] Framework install: `npm install -D vitest @vitest/coverage-v8`

### Per-criterion detection / signal / trigger table (explicit)

| Success Criterion | Detection | Expected Signal | Force-Trigger in Test |
|---|---|---|---|
| 1. `SCRAPER_ENABLED=false` halts scraping next tick without redeploy | Tail `fly logs` for message `"heartbeat skipped"` with `reason: "kill_switch_set"` | JSON log line within one tick interval (60s for stub; 24h for real) | `fly secrets set SCRAPER_ENABLED=false`; wait 1 tick |
| 2. Dead-man's switch fires >36h | healthchecks.io dashboard shows "down"; operator email arrives | Email from healthchecks.io with subject `"FishCount nightly scrape is DOWN"` | Temporarily set grace to 5 min; stop sending pings; wait 5 min |
| 3. Simulated $20 spend triggers billing alert | Resend logs show outbound to `OPERATOR_EMAIL`; operator inbox receives | Email from `alerts@fishcount.example` with subject `"[FishCount ops] Fly.io spend crossed $20"` | `BILLING_TEST_SPEND=25 npm run check:billing` (one-off, non-CI) |
| 4. SQLite file observably replicated | `litestream replicas` lists the db; `b2 ls` shows WAL files with recent mtime | Both outputs show timestamp within `snapshot-interval` (24h) | `scripts/verify-replication.sh` after writing a known row |
| 5. Structured logs queryable after the fact | Better Stack query filtered by `requestId="<uuid>"` returns matching log lines | ≥1 log line showing `request:start` and `request:end` with the UUID | `curl https://fishcount.fly.dev/?marker=<uuid>`; wait 5 min; query |

## Standard Stack (Phase 0 subset)

### Core (verified against STACK.md and npm registry 2026-04-23)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 22 LTS | Runtime | STACK.md locked |
| SvelteKit | 2.57.x | Framework (adapter-node) | STACK.md locked |
| better-sqlite3 | 12.9.x | SQLite driver | STACK.md locked |
| croner | 10.0.1 | Scheduler | STACK.md locked (verified 10.0.1 on npm) |
| pino | 10.3.1 | Structured logging | Latest stable (STACK.md said 9.x — 10.3 released, drop-in compatible) |
| resend | 6.12.2 | Transactional email | STACK.md locked (verified) |
| Litestream | 0.3.13 (binary, not npm) | SQLite→B2 replication | STACK.md locked; v0.5.0 exists but 0.3.x is production-stable |

### Supporting (Phase 0-specific additions)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pino-pretty | 13.x | Dev-mode log formatter | Only in dev; transport target in logger config |
| vitest | 2.x | Test runner | Validation Architecture requires it |
| @vitest/coverage-v8 | 2.x | Coverage | For Phase 0 exit verification |

### External Services

| Service | Tier | Purpose |
|---------|------|---------|
| Fly.io | Pay-as-you-go (no free tier 2024+) | Hosting — ~$3/mo for shared-cpu-1x + 512mb + 1gb volume |
| Backblaze B2 | Free under 10GB | Litestream replica target |
| healthchecks.io | Free (20 checks) | Dead-man's switch |
| Better Stack | Free (3 GB / 30 days) | Log retention |
| Resend | Free (3,000/mo) | Operator alert emails |

**Installation:**

```bash
# Production deps (Phase 0)
npm install pino resend croner

# Dev deps
npm install -D pino-pretty vitest @vitest/coverage-v8

# No npm for Litestream — installed via Dockerfile as static binary
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite → S3 replication | Custom rsync cron or nightly `sqlite3 .backup` | Litestream | Only Litestream does WAL-level continuous replication with point-in-time restore |
| Cron scheduling with DST | `setInterval` or `setTimeout` loops | croner | DST handling, timezone, cron syntax all solved; 0 deps |
| Dead-man's switch | Custom external checker | healthchecks.io | Battle-tested, free, sends email out of the box |
| Structured logging | `console.log(JSON.stringify(...))` | pino | Redaction, child loggers, async writes, pretty dev mode |
| Request ID correlation | Random headers, manual propagation | SvelteKit `event.locals` + pino `child()` | Idiomatic, automatic propagation |
| TLS termination | Caddy / nginx / Let's Encrypt client | Fly edge proxy + `force_https = true` | Automatic cert provisioning on Fly |
| Billing alerts | Custom cost-tracking system | Fly GraphQL + threshold script (DIY by necessity) | No native alternative; DIY is the minimum |

**Key insight:** Everything in Phase 0 is a solved problem except Fly billing alerts. Spend the Phase 0 budget on integrating the solutions, not reinventing them.

## Common Pitfalls

### Pitfall 1: Forgetting `-if-replica-exists` on first boot

**What goes wrong:** First deploy, empty volume, empty B2 bucket. `litestream restore` without `-if-replica-exists` exits 1 → entrypoint script errors → container restart loop → Fly eventually gives up.
**Why it happens:** Copying the restore command from single-page docs that assume an existing replica.
**How to avoid:** Always include both `-if-db-not-exists -if-replica-exists`. See entrypoint.sh above.
**Warning signs:** `fly logs` shows "no matching backups found" followed by exit, container restart counter climbing.

### Pitfall 2: Setting `SCRAPER_ENABLED` in `[env]` instead of secrets

**What goes wrong:** Flipping the kill switch requires editing fly.toml, committing, running `fly deploy` — a full redeploy (30–90s), which the success criterion explicitly forbids ("without a redeploy").
**Why it happens:** `[env]` is a more familiar pattern from other platforms.
**How to avoid:** `fly secrets set SCRAPER_ENABLED=false`. Documented in ops runbook.
**Warning signs:** The operator thinks "I need to redeploy to toggle this."

### Pitfall 3: Litestream flushing lost during hard machine crash

**What goes wrong:** A write hits SQLite, the machine is killed before Litestream's next sync, the write is absent from B2. On restore-from-B2, that write is gone.
**Why it happens:** Default sync-interval is 1s — a narrow window but nonzero.
**How to avoid:** For critical writes (scrape-run completions in Phase 1), call `litestream wait` after the write. For Phase 0, document the risk and accept <1s of potential loss.
**Warning signs:** Discrepancy between local DB and restored DB after an unclean shutdown.

### Pitfall 4: Committing Fly API token or B2 application key to the repo

**What goes wrong:** Repo is public (or later becomes public); credentials leak; abuse follows.
**Why it happens:** Testing locally by putting `FLY_API_TOKEN=...` in a file.
**How to avoid:** `.gitignore` covers `.env*`; use `gitleaks` pre-commit hook; all runtime secrets via `fly secrets` not files in the image.
**Warning signs:** `git log -p` shows a token-shaped string.

### Pitfall 5: Fly machine memory OOM from Litestream + Node + SQLite

**What goes wrong:** `shared-cpu-1x 256mb` fills up during a big scrape; OS kills Node; Litestream follows; container restarts in a loop.
**Why it happens:** STACK.md originally specced 256mb; Litestream + better-sqlite3 + SvelteKit SSR is closer to 300–400mb under load.
**How to avoid:** Start with `memory_mb = 512`. Monitor `fly metrics` for memory after launch.
**Warning signs:** `dmesg` shows `Killed process ... (node)`; Fly dashboard shows memory climbing toward 100%.

### Pitfall 6: Dead-man's switch grace period too tight

**What goes wrong:** 36h grace is the requirement. If Fly has a 10-min platform event during the 2am scrape window, the scrape runs at 2:10am instead. If the grace were set to 24h, the next day's 2am tick is >24h since last success → false alert.
**Why it happens:** Conflating "scrape interval" (24h) with "grace period" (how long without a ping is alarming).
**How to avoid:** Grace = 1.5× scrape interval, minimum. 36h for a daily scrape is correct (as OPS-04 specifies).

## Code Examples

### Kill-switch gate function (unit-testable)

```typescript
// src/lib/server/kill-switch.ts
// Source: Fly secrets docs, CLAUDE.md Non-Negotiable Rule 1 bullet 9
export function scrapingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SCRAPER_ENABLED !== 'false';
}
```

### Billing threshold checker (unit-testable)

```typescript
// src/lib/ops/billing.ts
// Source: OPS-01 requirement + Fly billing API notes
export type ThresholdState = { 20: boolean; 50: boolean; 100: boolean };

export function checkThresholds(
  spendUsd: number,
  state: ThresholdState,
): { crossed: Array<20 | 50 | 100>; newState: ThresholdState } {
  const crossed: Array<20 | 50 | 100> = [];
  const newState = { ...state };
  for (const t of [20, 50, 100] as const) {
    if (spendUsd >= t && !state[t]) {
      crossed.push(t);
      newState[t] = true;
    }
  }
  return { crossed, newState };
}
```

### SvelteKit hook with request ID + pino

```typescript
// src/hooks.server.ts
// Source: stolthq.com/blog/structured-logging-sveltekit; pino docs
import type { Handle } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';

export const handle: Handle = async ({ event, resolve }) => {
  const requestId = event.request.headers.get('fly-request-id') ?? crypto.randomUUID();
  event.locals.logger = logger.child({ requestId, path: event.url.pathname });
  event.locals.requestId = requestId;
  const start = performance.now();
  event.locals.logger.info({ method: event.request.method }, 'request:start');
  const response = await resolve(event);
  event.locals.logger.info({
    status: response.status,
    durationMs: Math.round(performance.now() - start),
  }, 'request:end');
  response.headers.set('x-request-id', requestId);
  return response;
};
```

### Entrypoint script (verified against linkding-on-fly)

```bash
#!/bin/bash
# scripts/entrypoint.sh
# Source: https://github.com/fspoettel/linkding-on-fly/blob/master/scripts/run.sh
set -euo pipefail

: "${DB_PATH:=/data/fishcount.sqlite3}"

echo "[boot] checking restore path"
litestream restore -if-db-not-exists -if-replica-exists -config /etc/litestream.yml "$DB_PATH"

echo "[boot] starting Litestream supervising Node"
exec litestream replicate -config /etc/litestream.yml -exec "node build/index.js"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LiteFS (Fly's SQLite replication) | Litestream | 2024 — Fly de-prioritized LiteFS for non-distributed use cases | Single-node apps use Litestream; multi-node needs different tool |
| Fly free tier (3 machines, 3 GB volume) | Pay-as-you-go (~$3/mo) | 2024 cut | Budget accordingly; no $0 path on Fly |
| single opt-in email | double opt-in (Phase 4 concern, noted here for ordering) | 2024 Gmail/Yahoo bulk-sender rules | Every domain needs SPF+DKIM+DMARC |
| Sentry Crons | healthchecks.io for dead-man's switch | Sentry Crons exists but adds weight | healthchecks.io is lighter for single-job projects |
| winston / bunyan for logging | pino | ~2022 | pino is 5–10x faster and the de facto 2026 choice |

**Deprecated/outdated:**
- `request` npm package (security-deprecated)
- `node-cron` (use croner instead — DST, TZ, sub-second support)
- `@sveltejs/adapter-auto` in production (use adapter-node explicitly)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Fly.io charges roughly $2–3/mo steady for `shared-cpu-1x 512mb + 1gb volume` | Q7 deployment topology | Budget overshoot; switch to `shared-cpu-1x 256mb` or a Render free tier |
| A2 | Backblaze B2 free tier (10 GB storage, 1 GB daily egress) covers Phase 0 traffic and Phase 1 backfill | Q4 Litestream | Unexpected charges on B2; cap `retention` to 168h if it becomes an issue |
| A3 | `fly secrets set` machine restart is <30s in practice | Q1 kill switch | If restart takes minutes, the "immediate" halting bar is harder to argue; pivot to DB-backed flag |
| A4 | The Fly GraphQL API exposes a queryable `currentMonthSpend`-like field as of 2026-04 | Q3 billing | Billing watcher unbuildable; fall back to monthly manual check |
| A5 | Better Stack free tier (3 GB / 30 days) is sufficient for Phase 0 + Phase 1 traffic | Q5 logging | Need to swap sink (Axiom) or degrade to 7-day retention |
| A6 | Resend domain verification completes in <48h for a new domain with correct DNS | Q6 operator email + Hazard 5 | Billing-alert integration test blocked; descope or defer |
| A7 | `fishcount.fly.dev` (or a user-selected custom domain) is acceptable for Phase 0 | Q7 deployment | Custom domain adds DNS + cert steps; budget another day |
| A8 | The `fly-request-id` header is set by Fly edge on all requests reaching the app | Q5 logging | Fallback to `crypto.randomUUID()` works — no failure, just less correlation-friendly |
| A9 | `litestream wait` exists as a command in v0.3.x | Pitfall 3 mitigation | Check `litestream --help` on target binary; Phase 1 concern, not Phase 0 |

**If any A1–A6 are wrong, the Phase 0 plan needs adjustment. A7–A9 are lower-stakes.**

## Open Questions

1. **Is the operator email address already owned?**
   - What we know: CLAUDE.md doesn't specify; STATE.md has nothing.
   - What's unclear: Do we have `ops@fishcount.example` or do we need to register a domain?
   - Recommendation: **Planner must confirm with user before Wave 0** — domain registration is a prerequisite for Resend domain verification, which blocks OPS-01 testing.

2. **Custom domain or `fishcount.fly.dev` for Phase 0?**
   - What we know: CLAUDE.md scope is "shareable with friends" — a `.fly.dev` subdomain is probably fine for v1.
   - What's unclear: Do we want the domain set up now so it doesn't move later?
   - Recommendation: Ship on `fishcount.fly.dev` for Phase 0; custom domain is a Phase 5 polish item.

3. **Should the billing-watcher live in the app or in GitHub Actions?**
   - What we know: GH Actions is better isolated (not same failure domain).
   - What's unclear: Does the project have a GitHub repo accessible to Actions? (Probably yes.)
   - Recommendation: GH Actions. Planner should confirm repo is suitable.

4. **Backblaze B2 or S3 for the Litestream replica?**
   - What we know: STACK.md says "Backblaze B2 / S3".
   - What's unclear: B2 is ~4x cheaper at this scale; S3 has better tooling.
   - Recommendation: **B2**. At <1 GB the $/mo is rounding error and B2 free tier covers it.

5. **What's the exact "row-count SLA alert" wiring for Phase 1?**
   - Not a Phase 0 question — but Phase 0 builds the email *channel* that Phase 1 will use. Good for the planner to note that OPS-06 logging + Resend operator channel = the substrate for ING-07.

## Environment Availability

Phase 0 has several external dependencies that need to be provisioned *before* deployment:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 | Local dev + Fly build | ✓ (assumed) | 22.x | nvm install 22 |
| Docker | Fly deploy | Maybe (Fly deploys without local Docker, uses remote builder) | — | Use Fly remote builder (`fly deploy --remote-only`) |
| flyctl CLI | All Fly operations | ✗ (must install) | latest | `curl -L https://fly.io/install.sh \| sh` |
| Fly.io account | OPS-02 | ✗ (must create, requires credit card) | — | **Blocking — no alternative in this stack** |
| Backblaze B2 account | OPS-03 | ✗ (must create) | — | S3 (costs more but works) |
| healthchecks.io account | OPS-04 | ✗ (must create) | — | Better Stack heartbeat, cronitor |
| Better Stack account | OPS-06 | ✗ (must create) | — | Axiom, Logtail |
| Resend account | OPS-01 alert channel | ✗ (must create) | — | Postmark, AWS SES |
| Custom domain | Resend verification | Open question (see above) | — | Use `onboarding@resend.dev` (sandbox only — can't alert operator) |
| GitHub repo with Actions enabled | OPS-01 watcher | Assumed yes | — | In-app croner tick |

**Missing dependencies with no fallback:**
- Fly.io account + credit card (hosting is locked to Fly).

**Missing dependencies with fallback:**
- Every other SaaS account has alternatives; B2 / healthchecks.io / Better Stack / Resend are preferred for cost but not mandatory.

**Critical ordering:**
1. Fly.io account + CLI → unblocks everything else.
2. Domain + Resend verification → long pole (DNS TTL).
3. B2 + healthchecks.io + Better Stack accounts → quick, parallelizable.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no auth in Phase 0 — public site) | — |
| V3 Session Management | no | — |
| V4 Access Control | partial — cron routes need auth (deferred to Phase 1) | Shared-secret bearer token on `/api/cron/*` |
| V5 Input Validation | partial — billing watcher takes env input only | Zod schema around Fly GraphQL response |
| V6 Cryptography | yes | Fly secrets vault (not DIY); `crypto.randomUUID()` for requestId; no hand-rolled crypto |
| V7 Error Handling & Logging | yes | pino `redact` paths include authorization headers, cookies, emails |
| V8 Data Protection | partial | Litestream replica uses B2 bucket with key scoped to that bucket only |
| V10 Malicious Code | partial | `npm audit` in CI; no runtime code fetching |
| V14 Configuration | yes | No secrets in `fly.toml [env]`; all sensitive config via `fly secrets` |

### Known Threat Patterns for Fly + SvelteKit + SQLite

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Leaked B2 application key (repo commit) | Information Disclosure | Scoped key (single bucket); `.gitignore` + gitleaks pre-commit |
| Leaked Fly API token | Elevation of Privilege | Token in GH Actions secret (not committed); revoke+rotate annually |
| Sensitive data in logs (email addresses) | Information Disclosure | pino `redact` paths |
| SQLite database file accessible via misconfigured volume | Information Disclosure | Volume is private to the Fly machine; no public read |
| Cron endpoint triggered by outsider (Phase 1 concern) | Tampering | Bearer-token auth on `/api/cron/*` routes |
| Log injection (user-controlled input in logs breaking JSON) | Tampering | pino handles escaping (verified); never string-concat user input into log messages |
| DoS via very large request bodies | DoS | SvelteKit defaults + Fly edge limits |

### Project Constraints (from CLAUDE.md)

- **Kill switch env var name is `SCRAPER_ENABLED`** (verbatim from CLAUDE.md Non-Negotiable Rule 1 bullet 9). Not `ENABLE_SCRAPER`, not `SCRAPING_ENABLED`.
- **DAL is the only module that issues SQL** — Phase 0 has no DAL yet (that's Phase 1). Any SQL Phase 0 writes (e.g., a one-row `smoke_test` table for the restore drill) must be in a single centralized place (`src/lib/db/smoke.ts`) so the Phase 1 refactor is clean.
- **All dates are `YYYY-MM-DD` in `America/Los_Angeles`** — relevant to the billing watcher's "which month did we cross the threshold" state tracking. Use `date-fns-tz` or `Intl.DateTimeFormat` with the PT zone, not UTC.
- **Backfill is a CLI, not a cron route** — Phase 0 doesn't build backfill, but the Fly deployment topology must not preclude a long-running local script connecting to B2 (it doesn't — local dev can run against the same B2 bucket via Litestream).
- **Non-Negotiable Rule 5 (email compliance)** — Phase 0's operator-alert Resend sends are *transactional* (not bulk), so the List-Unsubscribe / suppression-list / double-opt-in rules don't apply until Phase 4. But SPF+DKIM *do* apply from day one (needed for domain verification anyway).

## Sources

### Primary (HIGH confidence)

- [Fly.io Secrets Docs](https://fly.io/docs/apps/secrets/) — machine restart behavior on `fly secrets set`, --stage flag
- [Fly.io Cost Management Docs](https://fly.io/docs/about/cost-management/) — explicit confirmation that billing alerts are not supported
- [Litestream — Backblaze B2 Guide](https://litestream.io/guides/backblaze/) — exact litestream.yml format
- [Litestream — Docker Guide](https://litestream.io/guides/docker/) — `replicate -exec` pattern
- [Litestream — replicate command reference](https://litestream.io/reference/replicate/) — `-exec` flag behavior
- [Litestream — restore command reference](https://litestream.io/reference/restore/) — `-if-db-not-exists -if-replica-exists` semantics
- [linkding-on-fly reference repo](https://github.com/fspoettel/linkding-on-fly) — verified entrypoint.sh + Dockerfile pattern
- [usememos-litestream-fly.io reference repo](https://github.com/nalakawula/usememos-litestream-fly.io) — verified alternative minimal pattern
- [healthchecks.io homepage + docs](https://healthchecks.io/) — dead-man's switch free tier (20 checks)
- [pino docs (STACK.md Context7 references)](https://github.com/pinojs/pino) — redact, child loggers, isoTime

### Secondary (MEDIUM confidence)

- [Fly.io community: "Set a billing cap?"](https://community.fly.io/t/set-a-billing-cap/24810) — Fly staff confirming DIY required
- [Simon Willison TIL — undocumented Fly GraphQL API](https://til.simonwillison.net/fly/undocumented-graphql-api) — endpoint + auth; no billing-specific examples
- [Fly.io — Shipping Logs blog](https://fly.io/blog/shipping-logs/) — Fly Log Shipper pattern
- [Fly.io — Export Logs docs](https://fly.io/docs/monitoring/exporting-logs/) — Better Stack integration
- [stolthq.com — Structured logging with SvelteKit and pino](https://stolthq.com/blog/structured-logging-sveltekit) — requestId correlation pattern
- [PkgPulse — node-cron vs croner 2026](https://www.pkgpulse.com/blog/node-cron-vs-node-schedule-vs-croner-task-scheduling-nodejs-2026) — croner DST handling
- [Resend — Managing Domains docs](https://resend.com/docs/dashboard/domains/introduction) — verification requirements

### Tertiary (LOW confidence — marked for validation)

- Fly.io native log retention duration — searched, not publicly documented; community reports "hours-to-days." **Flag: verify by experiment before asserting.**
- Exact Fly GraphQL billing field name — API is undocumented; must introspect at build time.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all verified against npm / STACK.md / Context7 references.
- Architecture (Litestream + SvelteKit + Fly topology): HIGH — multiple working reference implementations confirmed.
- Kill switch mechanism: HIGH — Fly docs explicit.
- Dead-man's switch: HIGH — healthchecks.io is a canonical tool.
- Billing alerts: MEDIUM — no native solution; DIY path depends on undocumented API.
- Log retention: MEDIUM — Fly native retention duration not publicly documented; Better Stack external ship is the known-good path.
- Pitfalls: HIGH — synthesized from confirmed references + PITFALLS.md.

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (30 days — stable stack; Fly billing API might drift sooner)

## RESEARCH COMPLETE
