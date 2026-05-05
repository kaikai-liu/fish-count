// src/lib/scraper/rate-limiter.ts
// ING-03: shared rate limiter enforcing ≤1 req per 5s between any two outbound
// source-site fetches. Decision D-13 (two-tier: this + proper-lockfile mutex in lock.ts).
// Source: 01-RESEARCH.md Pattern 4 + Context7 /sindresorhus/p-queue.
//
// Invariant (enforced by tests/unit/scraper/rate-limiter.test.ts):
//   Two consecutive `sourceQueue.add(fn)` calls record start-time delta ≥ 5000ms.
//
// Callers MUST queue every outbound source-site fetch through this singleton.
// NEVER call the source-site fetch directly; the in-process rate limit is
// tier-1 of D-13's two-tier polite-scraping mechanism.
import PQueue from 'p-queue';

// Default 5000ms (5s) for production politeness. Override via env var for
// trusted, attended bulk backfills only — never lower this in production.
// The unit-test invariant (tests/unit/scraper/rate-limiter.test.ts) asserts
// ≥ 5000ms between fetches when no override is set.
const intervalMs = (() => {
  const raw = process.env.SOURCE_FETCH_INTERVAL_MS;
  if (!raw) return 5000;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 5000;
})();

export const sourceQueue = new PQueue({
  concurrency: 1, // only one in-flight request at a time
  intervalCap: 1, // at most 1 request per interval...
  interval: intervalMs // floor between start times (default 5000ms)
});
