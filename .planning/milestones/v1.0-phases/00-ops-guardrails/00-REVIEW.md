---
phase: 00-ops-guardrails
reviewed: 2026-04-23T12:15:00Z
depth: standard
files_reviewed: 40
files_reviewed_list:
  - .billing-alerts-state.json
  - .dockerignore
  - .env.example
  - .github/workflows/billing-check.yml
  - .gitignore
  - Dockerfile
  - fly.toml
  - litestream.yml
  - package.json
  - postcss.config.js
  - scripts/billing-watcher.ts
  - scripts/dead-mans-switch-drill.sh
  - scripts/entrypoint.sh
  - scripts/restore-drill.sh
  - scripts/verify-replication.sh
  - src/app.css
  - src/app.d.ts
  - src/app.html
  - src/hooks.server.ts
  - src/lib/alerts/operator.ts
  - src/lib/db/smoke.ts
  - src/lib/ops/billing.ts
  - src/lib/server/heartbeat.ts
  - src/lib/server/kill-switch.ts
  - src/lib/server/logger.ts
  - src/lib/server/scheduler.ts
  - src/lib/server/shutdown.ts
  - src/lib/server/startup.ts
  - src/lib/shared/dates.ts
  - src/routes/+page.svelte
  - src/routes/healthz/+server.ts
  - svelte.config.js
  - tailwind.config.ts
  - tests/lib/logger.test.ts
  - tests/ops/billing.test.ts
  - tests/ops/operator-alert.test.ts
  - tests/scheduler/heartbeat.test.ts
  - tests/scheduler/kill-switch.test.ts
  - tests/scheduler/tick-ordering.test.ts
  - tsconfig.json
  - vite.config.ts
  - vitest.config.ts
findings:
  critical: 1
  warning: 6
  info: 7
  total: 14
status: issues_found
---

# Phase 0: Code Review Report

**Reviewed:** 2026-04-23T12:15:00Z
**Depth:** standard
**Files Reviewed:** 40
**Status:** issues_found

## Summary

The Phase 0 Ops Guardrails implementation is broadly sound and faithfully implements the design intent in `00-RESEARCH.md`. Non-negotiables are largely enforced:

- **Kill switch (OPS-05):** `scrapingEnabled()` reads `process.env.SCRAPER_ENABLED` at call time (not module load). Verified by `tests/scheduler/tick-ordering.test.ts`.
- **Single date producer:** `src/lib/shared/dates.ts` is the only module that formats `YYYY-MM-DD`/`YYYY-MM` in PT. `billing.ts` correctly calls `today().slice(0,7)` instead of duplicating `Intl.DateTimeFormat` logic.
- **DAL boundary:** Only `src/lib/db/smoke.ts` issues SQL or imports `better-sqlite3`. No SQL leaks found in routes, ops, alerts, or server modules.
- **Heartbeat non-fatal:** `pingHealthcheck()` swallows all fetch errors — the dead-man's-switch fires on absence, which the implementation respects.
- **Logger redaction:** Paths cover authorization, cookie, email (wildcard), password, token, apiKey, access_token, refresh_token, secret — a superset of the documented security baseline.

Key concerns that must be addressed before Phase 1 ships:

1. **CRITICAL — `litestream.yml` uses shell-style `${VAR}` interpolation, but Litestream 0.3.x does NOT expand env vars in its YAML config.** This is silently undocumented failure: Litestream will treat `${LITESTREAM_ACCESS_KEY_ID}` as a literal access key string. Replication will never authenticate, but the restore-on-boot step uses `-if-replica-exists` and will succeed vacuously on first boot — so the failure is silent. This is the #1 silent-failure hazard in this phase.
2. **WARNING — Dockerfile runs Node as root** inside the runtime stage. The plan's threat model (`00-RESEARCH.md` §Security Domain) explicitly calls for a non-root user; it was dropped somewhere.
3. **WARNING — Billing watcher can still emit silent zero-spend** in one edge case: if the Fly GraphQL schema returns `spend: 0` (legitimate on a brand-new account), the state gets persisted and no alert is sent — indistinguishable from "API working, genuinely zero spend." Recommend logging the raw response for an operator audit trail.
4. **WARNING — `operator.ts` logs `alert.subject` but email subjects can contain PII** (e.g., when Phase 4 alerts include boat names, operator emails). This is not a redaction gap today but will become one.

Detailed findings follow.

## Critical Issues

### CR-01: Litestream YAML does not expand `${VAR}` references by default — replication will silently fail

**File:** `litestream.yml:3-13`

**Issue:** The config file uses shell-style environment interpolation:

```yaml
access-key-id: ${LITESTREAM_ACCESS_KEY_ID}
secret-access-key: ${LITESTREAM_SECRET_ACCESS_KEY}
dbs:
  - path: ${DB_PATH}
    replicas:
      - type: s3
        bucket: ${LITESTREAM_BUCKET}
        ...
        endpoint: ${LITESTREAM_ENDPOINT}
```

Litestream v0.3.x does NOT perform shell-style env expansion on its YAML config file. In recent releases (0.3.12+) Litestream added limited Go-template expansion (`{{ env "VAR" }}`) but `${VAR}` is treated as a literal string. Result:

- `access-key-id` becomes the 24-character literal string `${LITESTREAM_ACCESS_KEY_ID}`.
- S3 auth fails every replicate operation.
- Entrypoint's `litestream restore -if-db-not-exists -if-replica-exists` returns success on first boot (no replica exists yet), so the app starts normally.
- `litestream replicate -exec node build/index.js` tries to replicate, auth fails, Litestream logs warnings but keeps supervising Node.
- Node starts, serves traffic, writes to SQLite — **nothing is backed up.**
- `scripts/restore-drill.sh` would catch this (marker would be missing after delete+restart), but that's a post-deploy check, not a build-time check.

This is the single most dangerous silent-failure hazard in Phase 0 because it's phrased as "working replication" in every test that doesn't actually wait 10+ minutes and check B2.

**Fix:**

Option A — switch to Go-template syntax (minimal change):

```yaml
access-key-id: {{ env "LITESTREAM_ACCESS_KEY_ID" }}
secret-access-key: {{ env "LITESTREAM_SECRET_ACCESS_KEY" }}

dbs:
  - path: {{ env "DB_PATH" }}
    replicas:
      - type: s3
        bucket: {{ env "LITESTREAM_BUCKET" }}
        path: fishcount.sqlite3
        endpoint: {{ env "LITESTREAM_ENDPOINT" }}
        force-path-style: true
        retention: 720h
        snapshot-interval: 24h
```

Option B — drop the YAML env vars entirely and render config at boot from the entrypoint:

```bash
# scripts/entrypoint.sh
envsubst < /etc/litestream.template.yml > /etc/litestream.yml
litestream restore ...
exec litestream replicate ...
```

Option B requires adding `gettext-base` to the Docker image but is unambiguous across Litestream versions.

Either way: add an acceptance step to `scripts/verify-replication.sh` that parses the rendered config or greps `litestream replicas -config /etc/litestream.yml` output for a non-empty `access-key-id` field.

**Severity rationale:** Replication is OPS-03 — the most load-bearing requirement in Phase 0. A silent miss here means the first hardware failure on Fly (which is rare but not hypothetical) loses every byte of data the scraper has accumulated. Worth calling out loudly.

## Warnings

### WR-01: Dockerfile runs Node and Litestream as root

**File:** `Dockerfile:20-41`

**Issue:** The runtime stage never creates a non-root user or runs `USER node`. Both Litestream (PID 1) and the Node process inherit UID 0. If an attacker gains RCE in the Node app (e.g., via a malicious scraper target), they can write anywhere in the container, including `/etc/litestream.yml` and `/usr/local/bin/litestream`.

The `node:22-bookworm-slim` base image ships with a pre-created `node` user (UID 1000). Using it requires two lines.

**Fix:**

```dockerfile
# --- Runtime stage ---
FROM node:${NODE_VERSION}-bookworm-slim
WORKDIR /app

COPY --from=litestream-builder /usr/local/bin/litestream /usr/local/bin/litestream
COPY litestream.yml /etc/litestream.yml
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

COPY --from=builder --chown=node:node /app/build ./build
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json

RUN mkdir -p /data && chown node:node /data
ENV DB_PATH=/data/fishcount.sqlite3
ENV NODE_ENV=production

USER node
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

Verify the Fly volume mount to `/data` is owned by UID 1000 on first boot — Fly honors the image's USER directive and the volume is chowned on the first write. If Fly doesn't chown, adjust the entrypoint to `chown node:node /data` before execing litestream (requires starting the entrypoint as root and dropping with `gosu` or `su-exec`).

### WR-02: Billing watcher treats `spend: 0` as identical to "API working" — residual silent-failure hazard

**File:** `scripts/billing-watcher.ts:101-124`

**Issue:** The watcher probes several candidate field names (`currentMonthSpend`, `monthToDateSpend`) and throws if none are present. Good — that's the loud-fail path. But if Fly returns a valid response with `currentMonthSpend: 0` (e.g., brand-new account, credit balance, or a subtle schema where `spend` is reported in cents and Fly changes to dollars mid-deploy), the watcher logs `spend=$0` and exits zero. No alert fires.

This is technically correct behavior for a genuinely-zero month, but it gives the operator no independent confirmation that the GraphQL path is still exercised. Combined with "Fly GraphQL is undocumented" (`00-RESEARCH.md` §Q3), this is a known residual risk.

**Fix:** Emit a structured log line that preserves the raw API response shape (sans credentials) so operators can spot drift in GH Actions logs:

```typescript
const candidate =
  billingStatus?.currentMonthSpend ??
  billingStatus?.monthToDateSpend ??
  billingInfo?.currentMonthSpend ??
  org?.currentMonthSpend;

if (typeof candidate !== 'number') {
  throw new Error(
    `Fly GraphQL response missing spend field (shape drifted). Received: ${JSON.stringify(org).slice(0, 300)}`
  );
}

// NEW: breadcrumb so a genuine $0 month is distinguishable from a shape drift
// in future GH Actions logs.
console.log(
  `[watcher] raw org shape: keys=${Object.keys(org ?? {}).join(',')} ` +
  `billingStatus.keys=${Object.keys(billingStatus ?? {}).join(',')} ` +
  `spend_source=${billingStatus?.currentMonthSpend !== undefined ? 'billingStatus.currentMonthSpend' : 'other'}`
);
return candidate;
```

Additionally: consider adding a "heartbeat" assertion — e.g., if `spend === 0` AND `state.month` hasn't changed AND this is not the first week of the month, emit a warning to stderr. Defer to Phase 5 if too noisy.

### WR-03: `operator.ts` logs `alert.subject` unredacted — future PII leak

**File:** `src/lib/alerts/operator.ts:40, 44`

**Issue:** Both log lines include `subject: alert.subject` as a plain field:

```typescript
logger.error({ err: result.error, subject: alert.subject }, 'operator alert send failed');
// ...
logger.info({ id: result.data?.id, subject: alert.subject }, 'operator alert sent');
```

In Phase 0, subjects are generic ("Billing spend crossed $20"). In Phase 4, email alerts to subscribers will have subjects like "Daily bluefin report for {user@example.com}" — the `subject` field becomes PII-carrying and Better Stack retains it for 30 days.

The logger's redact paths (`*.email`, `password`, `token`) do NOT cover free-form subject text.

**Fix:** Rename the field to make it clearly non-PII today AND add a Phase 4 TODO:

```typescript
// Phase 0: subjects are static ops templates — safe to log.
// Phase 4: if subjects start containing subscriber emails/names, redact or hash here.
logger.info({ id: result.data?.id, subjectTemplate: alert.subject }, 'operator alert sent');
```

Or, more defensively, only log the first 40 chars and strip anything that looks like an email:

```typescript
function safeSubject(s: string): string {
  return s.replace(/[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+/g, '[email]').slice(0, 60);
}
```

### WR-04: `heartbeat.ts` redactUuid regex misses ping-URL variants; base URL host is logged

**File:** `src/lib/server/heartbeat.ts:40, 44, 50`

**Issue:** Two sub-problems:

1. The regex `/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/` only matches the full UUID-4 shape. Healthchecks.io also supports *slug-based* ping URLs (e.g., `https://hc-ping.com/your-project/scrape-nightly`) which leak verbatim into logs. If the operator ever migrates to a named-check URL, the redaction is bypassed silently.

2. The surrounding domain `hc-ping.com` is preserved in the log line. That alone is not a secret, but combined with the check name logged elsewhere it provides attackers enough signal to DoS the healthchecks.io endpoint. Low risk, but the review focus (3) explicitly called this out as "treat as secret."

**Fix:** Redact the entire path after the host, and handle non-UUID slugs:

```typescript
function redactPingUrl(url: string): string {
  try {
    const u = new URL(url);
    // Keep host only; strip path entirely to prevent slug/uuid leaks.
    return `${u.protocol}//${u.host}/[REDACTED]`;
  } catch {
    return '[REDACTED]';
  }
}
```

Also update the log calls to pass only a coarse status token:

```typescript
logger.info({ status, host: new URL(url).host }, 'healthcheck ping sent');
logger.warn({ err, status, host: new URL(url).host }, 'healthcheck ping failed — non-fatal');
```

Add a unit test: feed `https://hc-ping.com/my-project/abc123` and assert the log doesn't contain `abc123`.

### WR-05: `restore-drill.sh` uses double-escaped single quotes inside double-escaped double-quoted SSH command — fragile and potentially injectable

**File:** `scripts/restore-drill.sh:21, 34`

**Issue:** The marker is injected into a multi-layer nested shell+JS string:

```bash
MARKER="restore-drill-$(date +%s)"
fly ssh console -a "$APP_NAME" -C "node -e \"... db.prepare('INSERT INTO smoke_test(marker) VALUES(?)').run('$MARKER'); ...\""
```

Three concerns:

1. **Injection surface:** `$MARKER` is interpolated into a JS string literal inside a double-quoted bash string inside `fly ssh console -C`. If an operator ever customizes `MARKER` to contain a single quote, backslash, or newline, the remote JS breaks at best and executes attacker-controlled code at worst. Today the input is `date +%s` (digits only) — safe — but the pattern is brittle.
2. **Escape hell:** The line contains `\\\\` (four-backslash sequences) to inject a single backslash into the remote shell's JS literal. This is near-impossible to maintain correctly and one of the most common sources of subtle drill-script bugs.
3. **`datetime('now')` in step 1:** The `CREATE TABLE IF NOT EXISTS` in step 1 duplicates the schema from `src/lib/db/smoke.ts`. If `smoke.ts` ever adds a column, the drill silently misses it. Better to invoke the app's own export or delete this schema entirely and rely on the app having already created the table.

**Fix:** Use a heredoc file-transfer pattern. Write the JS to a temp file on the Fly machine, then run it:

```bash
cat > /tmp/drill.js <<EOF
const { openSmokeDb, writeSmokeRow, countSmokeRows } = await import('./build/server/...');
const db = openSmokeDb();
writeSmokeRow(db, process.argv[2]);
console.log('count_before=' + countSmokeRows(db));
EOF

fly sftp shell -a "$APP_NAME" <<SFTP
put /tmp/drill.js /tmp/drill.js
SFTP

fly ssh console -a "$APP_NAME" -C "node /tmp/drill.js '$MARKER'"
```

Better still: add a real `scripts/drill-helper.mjs` to the image at build time and call `node /app/scripts/drill-helper.mjs <marker>` from the drill script. That kills all escaping and uses the real DAL paths.

### WR-06: `shutdown.ts` exits after a fixed 100ms — SIGTERM-on-a-slow-flush race

**File:** `src/lib/server/shutdown.ts:27`

**Issue:** The final line of the shutdown handler is:

```typescript
setTimeout(() => process.exit(0), 100).unref();
```

100ms is the budget for pino to flush async transports (pino-pretty in dev, raw stdout in prod — prod is effectively sync). This works today, but:

1. Once Plan 02 wires `pino.transport({ target: '@logtail/pino' })` to Better Stack, logs travel via a worker thread with its own network buffer. 100ms is tight — a slow network to Better Stack can lose the last few `shutdown:start` / `shutdown:complete` lines, which are the exact lines an operator needs during an incident.
2. The hard `process.exit(0)` bypasses any pending `await` in scheduler stop hooks. `stopScheduler()` is synchronous today, but `closeDb()` (promised for Phase 1) probably isn't.

**Fix:** Use `pino.final()` or explicitly `await logger.flush()`:

```typescript
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutdown:start');
  try {
    stopScheduler();
    // Phase 1: await closeDb();
  } catch (err) {
    logger.error({ err }, 'error stopping scheduler during shutdown');
  }
  logger.info('shutdown:complete');
  // pino 8+ has a `.flush(cb)` method on the root logger.
  // For pino.transport() it drains the worker-thread buffer.
  await new Promise<void>((resolve) =>
    logger.flush(() => resolve())
  );
  process.exit(0);
};
```

Cap the flush wait with a fallback timeout (e.g., `Promise.race`) so a stuck transport doesn't block SIGTERM indefinitely — Fly's hard kill is 30s.

## Info

### IN-01: `startup.ts` logs a malformed line — `msg` as a field name

**File:** `src/lib/server/startup.ts:20`

**Issue:**

```typescript
logger.info({ msg: 'startup:start', pid: process.pid, nodeEnv: process.env.NODE_ENV ?? 'production' });
```

Pino reserves `msg` as the message field. Passing `msg: 'startup:start'` as a property duplicates the key — the actual emitted line is the message `undefined` with a body field `msg=startup:start`, because the second argument (the message string) is missing. The next line `logger.info('startup:complete')` uses the correct shape.

**Fix:** Move the literal to the message arg:

```typescript
logger.info(
  { pid: process.pid, nodeEnv: process.env.NODE_ENV ?? 'production' },
  'startup:start'
);
```

Apply the same fix in `src/lib/db/smoke.ts:22` (`logger.info({ msg: 'smoke_db_opened', dbPath });`).

### IN-02: `currentPtMonth()` in dates.ts has no callers

**File:** `src/lib/shared/dates.ts:26-29`

**Issue:** Exported `currentPtMonth()` is documented "used by billing-watcher state tracking" but `billing.ts` uses `today().slice(0,7)` instead. Dead export — or the billing module was refactored and the comment wasn't updated.

**Fix:** Either delete `currentPtMonth()` (preferred — YAGNI) or refactor `billing.ts` to call it:

```typescript
// Option: delete it.
// Option: use it.
export function currentMonthKey(): string {
  const month = currentPtMonth().toString().padStart(2, '0');
  const year = today().slice(0, 4);
  return `${year}-${month}`;
}
```

Deleting is safer since it removes a surface where two modules could independently format a month number.

### IN-03: `.billing-alerts-state.json` shipped with `month: "1970-01"` — trips `loadOrResetState` reset on first run (intentional, but unclear)

**File:** `.billing-alerts-state.json:2`

**Issue:** The committed state starts at month `1970-01`, which guarantees `loadOrResetState` resets it on first run. That's actually the right behavior — the intent is "no thresholds ever crossed yet" — but the epoch-zero month reads as a bug. Any contributor seeing `1970-01` will reasonably assume a Date bug somewhere.

**Fix:** Add a comment in the GH Actions workflow or a README note explaining the sentinel:

```json
{
  "_comment": "month=1970-01 is a sentinel that forces loadOrResetState() to reset on first run; GitHub Actions overwrites this after the first successful check",
  "month": "1970-01",
  "thresholds": { "20": false, "50": false, "100": false }
}
```

(JSON doesn't support comments natively, but prefixing a key with `_` is a widely-understood convention. Watcher ignores unknown keys.)

### IN-04: `healthz/+server.ts` emits `new Date().toISOString()` — not Pacific-time, not via `dates.ts`

**File:** `src/routes/healthz/+server.ts:2`

**Issue:** The healthz endpoint returns `ts: new Date().toISOString()` — a UTC ISO-8601 string. This technically doesn't violate the "all date STRINGS are `YYYY-MM-DD` in PT" rule (it's not a date string, it's a full timestamp for monitoring), but it's the only place in the codebase that produces a user-facing time string without going through `dates.ts`.

Operators diffing healthz output against pino log lines (ISO with Z) vs. scraper output (`YYYY-MM-DD` PT) will see mixed TZs.

**Fix:** Add a `nowIso()` helper to `dates.ts` and use it here. Returns UTC-Z (standard for healthchecks) but goes through the single date module for audit compliance:

```typescript
// src/lib/shared/dates.ts
export function nowIso(): string {
  return new Date().toISOString();
}

// src/routes/healthz/+server.ts
import { nowIso } from '$lib/shared/dates';
export const GET = () => json({ ok: true, service: 'fishcount', ts: nowIso() });
```

Low priority — healthz output is a monitoring probe, not user-facing data.

### IN-05: `scheduler.ts` uses `protect: true` — silently drops ticks under back-pressure

**File:** `src/lib/server/scheduler.ts:63`

**Issue:** `protect: true` tells croner to skip a scheduled tick if the previous one is still running. Since the Phase 0 heartbeat is `* * * * *` (every minute) and the body is near-instant, this never fires today. In Phase 1, when `protect: true` is inherited by the real scrape cron (`0 2 * * *`), an accidental long-running scrape (>24h) would silently skip the next day's scrape without logging the drop.

**Fix:** Wrap croner's protect handler or register a `catch` on the returned object. croner 10.x exposes a protected-tick callback:

```typescript
new Cron('0 2 * * *', {
  name: 'scrape',
  timezone: 'America/Los_Angeles',
  protect: (job) => {
    logger.warn({ job: job.name }, 'tick skipped — previous tick still running');
  }
}, scrapeTick);
```

Phase 0 can accept the current behavior; just flag it for the Phase 1 scheduler handoff.

### IN-06: `kill-switch.ts` default arg `= process.env` binds at call site — correct, but subtle

**File:** `src/lib/server/kill-switch.ts:13`

**Issue:** This is correct (default args in TS/JS are evaluated per call, so `process.env` reads fresh state each call). It matches `tests/scheduler/kill-switch.test.ts:37` which asserts zero-arg behavior. No code change needed — flagging only so the reviewer doesn't regret not flagging it.

One tiny readability nit: add a `@see` in the JSDoc that points at the tick-ordering test, making the contract traceable from the code:

```typescript
/**
 * @returns true if scraping is permitted, false if SCRAPER_ENABLED === 'false'.
 * Reads env per-call; do NOT cache at module load. See tests/scheduler/tick-ordering.test.ts.
 */
export function scrapingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SCRAPER_ENABLED !== 'false';
}
```

### IN-07: `dead-mans-switch-drill.sh` leaks the restored ping URL to terminal history

**File:** `scripts/dead-mans-switch-drill.sh:54-57`

**Issue:** The drill prompts the operator to paste the ping URL interactively:

```bash
read -r -p "   URL: " RESTORE_URL
if [[ "$RESTORE_URL" == https://hc-ping.com/* ]]; then
  fly secrets set -a "$APP_NAME" HEALTHCHECKS_PING_URL="$RESTORE_URL"
```

`read -r` does not suppress echo (no `-s` flag). The URL prints in the terminal. Worse, if the operator uses shell history (which is default in bash/zsh), the URL lands in `~/.bash_history` or `~/.zsh_history` on the prompting workstation.

`fly secrets set` itself has the same leak if a naive operator runs it directly with the URL on the command line — but this script makes it trivially easy to leak.

**Fix:**

```bash
read -r -s -p "   URL (hidden): " RESTORE_URL
echo  # read -s eats the newline
```

Or use `fly secrets set` with a file:

```bash
read -r -s -p "   URL (hidden): " RESTORE_URL
echo
tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT
echo "HEALTHCHECKS_PING_URL=$RESTORE_URL" > "$tmpfile"
fly secrets import -a "$APP_NAME" < "$tmpfile"
```

---

_Reviewed: 2026-04-23T12:15:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
