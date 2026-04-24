// src/lib/scraper/fetcher.ts
// ING-02 + ING-03: polite source-site fetcher.
// - User-Agent includes `+http` contact link (ING-02) — enforced by test
// - Wrapped in p-retry with AbortError on 4xx (never retry permanent failures)
// - Caller is responsible for queuing through sourceQueue (D-13 tier 1)
//   and withScrapeLock (D-13 tier 2) — this module is the primitive; the
//   pipeline in Plan 01-05 composes the full polite-fetch chain.
//
// Source: 01-RESEARCH.md §Code Examples + §Don't Hand-Roll row 5 (p-retry).
// Analog: src/lib/server/heartbeat.ts (fetch + AbortSignal.timeout idiom).
//         heartbeat LOG-AND-SWALLOWS errors; fetcher RETHROWS so pipeline.ts
//         can record outcome='http_error' in the scrape_runs ledger.
import pRetry, { AbortError } from 'p-retry';
import { logger } from '$lib/server/logger';
import { isAllowed } from './robots';

export const USER_AGENT =
  'FishCountBot/0.1 (+https://github.com/kaikai/fish-count; contact: liukk1211@gmail.com)';

// Source URL shape (A8 in 01-RESEARCH.md, verified 2026-04-23):
// https://www.sandiegofishreports.com/dock_totals/boats.php?date=YYYY-MM-DD
const SOURCE_URL_PREFIX =
  'https://www.sandiegofishreports.com/dock_totals/boats.php?date=';
const FETCH_TIMEOUT_MS = 30_000;

export async function fetchPage(date: string): Promise<string> {
  const url = `${SOURCE_URL_PREFIX}${encodeURIComponent(date)}`;

  // ING-02: robots.txt check BEFORE fetch. If the source operator ever adds
  // a Disallow rule matching this path, we stop immediately (no retry).
  if (!(await isAllowed(url, USER_AGENT))) {
    throw new AbortError(`robots.txt disallows ${url}`);
  }

  return pRetry(
    async () => {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
      if (res.status >= 400 && res.status < 500) {
        // Permanent — short-circuit retries via AbortError (p-retry convention)
        throw new AbortError(`HTTP ${res.status} for ${url}`);
      }
      if (!res.ok) {
        // 5xx or other — allow retry with exponential backoff
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.text();
    },
    {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 8000,
      randomize: true,
      onFailedAttempt: (err) => {
        logger.warn(
          { attempt: err.attemptNumber, err: err.message, url },
          'fetch_attempt_failed'
        );
      }
    }
  );
}
