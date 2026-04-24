// src/lib/scraper/robots.ts
// ING-02: honor robots.txt. Cached 24h per host (per CLAUDE.md Non-Negotiable
// Rule 1 + 01-RESEARCH.md). robots-parser handles wildcards, multiple UA groups,
// comments, and Allow/Disallow precedence — do NOT hand-roll.
//
// Robustness: if robots.txt fetch fails (timeout, network error, 5xx), we
// default to "allowed" and log a warning. This is the conventional behavior;
// the source-site operator has also been notified via OUTREACH-EMAIL.md
// (D-20) so the polite-scraping contract extends beyond robots.txt alone.
import robotsParser from 'robots-parser';
import { logger } from '$lib/server/logger';

interface CacheEntry {
  parser: ReturnType<typeof robotsParser>;
  fetchedAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const ROBOTS_TIMEOUT_MS = 5000;
const cache = new Map<string, CacheEntry>();

export async function isAllowed(url: string, userAgent: string): Promise<boolean> {
  const u = new URL(url);
  const host = u.origin;
  const robotsUrl = `${host}/robots.txt`;
  const now = Date.now();
  const cached = cache.get(host);

  let parser: ReturnType<typeof robotsParser>;
  if (cached && now - cached.fetchedAt < TTL_MS) {
    parser = cached.parser;
  } else {
    let text = '';
    try {
      const res = await fetch(robotsUrl, {
        headers: { 'user-agent': userAgent },
        signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS)
      });
      text = res.ok ? await res.text() : '';
    } catch (err) {
      logger.warn({ err, robotsUrl }, 'robots_fetch_failed_assume_allowed');
      text = '';
    }
    parser = robotsParser(robotsUrl, text);
    cache.set(host, { parser, fetchedAt: now });
  }
  // robots-parser returns true/false/undefined. undefined = no matching rule
  // → treat as allowed (standard robots.txt semantics).
  const result = parser.isAllowed(url, userAgent);
  return result !== false;
}

// Exported for tests: clear cache between cases so each test re-fetches.
export function _clearRobotsCache(): void {
  cache.clear();
}
