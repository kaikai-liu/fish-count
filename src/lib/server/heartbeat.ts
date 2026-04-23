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
    logger.info({ status, url: redactUuid(url) }, 'healthcheck ping sent');
  } catch (err) {
    // Do NOT rethrow — a ping failure must not crash the scrape.
    // The dead-man's switch will still fire if pings stop (that's the whole point).
    logger.warn({ err, status, url: redactUuid(url) }, 'healthcheck ping failed — non-fatal');
  }
}

/** Redact the UUID portion of the ping URL for log output — prevents accidental leakage into Better Stack. */
function redactUuid(url: string): string {
  return url.replace(/\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/, '/[REDACTED]');
}
