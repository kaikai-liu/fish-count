// src/lib/server/kill-switch.ts
// OPS-05: environment-variable kill switch.
// Source: 00-RESEARCH.md §Q1; CLAUDE.md Non-Negotiable Rule 1 bullet 9.
//
// Semantics:
//   SCRAPER_ENABLED === 'false'   → halt (case-sensitive)
//   anything else (incl. unset)   → allow
//
// Fail-open is intentional: the scraper IS the product; a typo must not
// silently stop all ingestion. An explicit 'false' is the only halt signal.
// See 00-RESEARCH.md §Q1 "Default behavior" lines 114–116 for rationale.

export function scrapingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SCRAPER_ENABLED !== 'false';
}
