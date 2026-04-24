// src/lib/server/heartbeat.ts
// OPS-04 dead-man's switch ping wrapper.
// Source: 00-RESEARCH.md §Q2 "Exact integration pattern" lines 152–183.
//
// Semantics:
//   - status 'start'   → POST ${PING_URL}/start
//   - status 'success' → POST ${PING_URL}          (default action for a success ping)
//   - status 'fail'    → POST ${PING_URL}/fail
//
// If HEALTHCHECKS_PING_URL is unset (local dev), pingHealthcheck() is a no-op
// and does NOT throw. A failed fetch (timeout, network error) logs a warning
// but does NOT throw — absence of pings is what fires the alert, not ping errors.
import { logger } from './logger';

export type HeartbeatStatus = 'start' | 'success' | 'fail';

const PING_TIMEOUT_MS = 5000;

export async function pingHealthcheck(
  status: HeartbeatStatus = 'success',
  exitCode = 0
): Promise<void> {
  const baseUrl = process.env.HEALTHCHECKS_PING_URL;
  if (!baseUrl) {
    // Local dev / pre-Plan-06 — no check registered yet. Silent no-op.
    return;
  }

  const url =
    status === 'start' ? `${baseUrl}/start`
    : status === 'fail' ? `${baseUrl}/fail`
    : baseUrl;

  try {
    await fetch(url, {
      method: 'POST',
      body: exitCode !== 0 ? `exit code: ${exitCode}` : undefined,
      signal: AbortSignal.timeout(PING_TIMEOUT_MS)
    });
    logger.info({ status, url: redactPingUrl(url) }, 'healthcheck ping sent');
  } catch (err) {
    // Do NOT rethrow — a ping failure must not crash the scrape.
    // The dead-man's switch will still fire if pings stop (that's the whole point).
    logger.warn({ err, status, url: redactPingUrl(url) }, 'healthcheck ping failed — non-fatal');
  }
}

/**
 * Redact the entire path of a ping URL for log output.
 *
 * WR-04: the previous implementation only matched UUID-4 shapes; healthchecks.io
 * also supports slug ping URLs (e.g. https://hc-ping.com/my-project/scrape-nightly)
 * which the old regex let through verbatim. Treating the full path as a secret
 * ("opaque token") avoids the migration-silent bypass and keeps the log line
 * useful (protocol + host remain visible for connectivity debugging).
 *
 * Exported only for the unit test in tests/scheduler/heartbeat.test.ts.
 */
export function redactPingUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/[REDACTED]`;
  } catch {
    return '[REDACTED]';
  }
}
