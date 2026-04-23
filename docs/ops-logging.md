# Logging Runbook (OPS-06)

FishCount emits structured JSON logs via pino 10.3 to stdout. Fly's Log Shipper forwards them to Better Stack, which retains 30 days of logs on the free tier.

## Log shape

Every line is a JSON object with at minimum:

- `level` — `10` (trace) to `60` (fatal); `30` = info
- `time` — ISO 8601 timestamp
- `app` — always `fishcount`
- `env` — `development` / `production`
- `msg` — the human-readable message
- `requestId` — present on every HTTP request line (forwarded from Fly's `fly-request-id` header when available, otherwise `crypto.randomUUID()`)
- `path` — request URL path
- `method` — HTTP method (on `request:start` lines)
- `status` / `durationMs` — response status + elapsed ms (on `request:end` lines)
- Plus any ad-hoc fields from the call site

Sensitive fields are redacted as `[REDACTED]` per the redact paths in `src/lib/server/logger.ts`:

- `req.headers.authorization`, `req.headers.cookie`, `request.headers.*`, `headers.*`
- `*.email`, `*.password`, `*.token` (wildcards match at any single depth)
- Top-level keys: `password`, `token`, `apiKey`, `access_token`, `refresh_token`, `secret`

## Query examples (Better Stack)

Find a specific request by ID (correlates with `x-request-id` response header the client sees):

```
requestId:"abc-def-123"
```

Find all 5xx responses in the last 24h:

```
status:>=500 msg:"request:end"
```

Find all scheduler tick errors (Plan 03):

```
job:"heartbeat" level:>=40
```

Verify OPS-06 Success Criterion 5 end-to-end (marker-UUID technique, from 00-RESEARCH.md §Q5 lines 562–565):

```bash
# 1. Hit the app with a unique marker:
curl "https://fishcount.fly.dev/healthz?marker=TEST-$(uuidgen)"
# 2. Wait 60s for Log Shipper flush.
# 3. Query Better Stack with: path:"/healthz" AND <your marker>
# 4. Exactly one request:start and one request:end line must return with the matching requestId.
```

## Retention

- Better Stack free tier: 3 GB / 30 days rolling. At Phase 0 volume (one nightly scrape + dozens of daily visitors) this is ~100x more than needed.
- If volume grows (Phase 1 backfill week + Phase 2 public traffic), monitor the Better Stack dashboard. The graceful-degradation plan is to switch to Axiom (500 GB/mo ingest free) — no code change, just swap the Fly Log Shipper sink.

## Development mode

`NODE_ENV=development` triggers pino-pretty transport so logs are human-readable colored output. In prod (`NODE_ENV=production`), logs are raw JSON for the shipper.

## Deploy-time setup (done in Plan 06)

Log Shipper is a separate Fly app per Fly's recommended pattern:

```bash
fly launch --from https://github.com/superfly/fly-log-shipper --name fishcount-logshipper
fly secrets set -a fishcount-logshipper \
  BETTER_STACK_SOURCE_TOKEN=<token from Better Stack> \
  ORG=<fly org> \
  ACCESS_TOKEN=<fly access token>
fly deploy -a fishcount-logshipper
```

Reference: https://fly.io/docs/monitoring/exporting-logs/

### Prerequisites (gather before running Plan 06)

| Value | Source | Notes |
|-------|--------|-------|
| `BETTER_STACK_SOURCE_TOKEN` | Better Stack → Sources → (your source) → Source token | Create the source as platform: `Fly.io`; free tier |
| `ORG` | `fly orgs list` | Usually `personal` |
| `ACCESS_TOKEN` | `fly tokens create readonly` | Scope-limited token (read-only on log stream is sufficient) |

## Round-trip correlation check (local)

```bash
# Production mode locally — stdout is raw JSON.
NODE_ENV=production PORT=3099 node build/index.js &
sleep 1
# Hit it and capture the x-request-id response header.
curl -sI http://localhost:3099/healthz?marker=TEST | grep -i x-request-id
# The value matches the requestId field in the request:start and request:end lines in stdout.
kill %1
```

## Known risk (documented, not mitigated in Phase 0)

Fly's `fly-request-id` header is assumed present on inbound requests. If Fly drops it in a future update, correlation degrades to per-request `crypto.randomUUID()` — still functional, just less traceable through the edge. Monitor for absent requestId values in logs as a canary.
