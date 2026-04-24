// src/lib/scraper/gate.ts
// D-21 FIRST_SCRAPE_OK gate — the pre-production scrape gate.
// Source: 01-RESEARCH.md §User Constraints D-21; CLAUDE.md Non-Negotiable Rule 1.
//
// Semantics (INVERTED vs kill-switch.ts):
//   FIRST_SCRAPE_OK === 'true'    → allow (explicit operator opt-in)
//   anything else (incl. unset)   → block (default is refuse)
//
// Fail-CLOSED is intentional: the operator MUST have (a) filled in TOS-REVIEW.md
// and (b) sent OUTREACH-EMAIL.md BEFORE flipping this to 'true'. Never defaults
// to true — neither scheduler nor backfill CLI may hit the live source without it.
// Compare to kill-switch.ts (fail-open): the scraper IS the product, so a typo
// in SCRAPER_ENABLED must not silently stop ingestion. FIRST_SCRAPE_OK is the
// opposite — a typo must not silently permit first-time scraping of a source
// whose TOS hasn't been reviewed.

export function firstScrapeAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FIRST_SCRAPE_OK === 'true';
}
