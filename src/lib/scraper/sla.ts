// src/lib/scraper/sla.ts
// Scraper-failure-only operator alerting (RTR-06 / D-21).
//
// Phase 8 Plan 03 retired the row-count <50%-of-baseline rule (D-21): off-season
// zero-row days are normal and the row-count rule false-positived every winter.
// New behavior:
//   - Alert ONLY when outcome IN ('http_error', 'parse_error').
//   - Alert NEVER on outcome IN ('success', 'empty', 'killed').
//   - No DB read needed (decision is purely on outcome).
//
// Decision split (preserved from Phase 1):
//   - `shouldAlert` is PURE — no I/O, trivially testable.
//   - `checkSlaAndAlert` is the side-effect wrapper — dispatches the email.
//
// Sources:
//   .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-21
//   .planning/phases/08-home-retire-polish/08-RESEARCH.md §"SLA Alert Simplification"
import type { ScrapeOutcome } from '$lib/db/scrapeRuns';
import { sendOperatorAlert } from '$lib/alerts/operator';
import { logger } from '$lib/server/logger';

/**
 * Pure decision function. Returns true iff the operator should be alerted
 * for this scrape outcome.
 *
 * Phase 8 D-21 / RTR-06 contract:
 *   - http_error  → alert (network / transport failure)
 *   - parse_error → alert (parser / schema drift)
 *   - success     → no alert (regardless of row count — off-season zero days are real)
 *   - empty       → no alert (legitimate off-season day)
 *   - killed      → no alert (kill switch / FIRST_SCRAPE_OK gate; surfaces via dead-man's switch)
 */
export function shouldAlert(outcome: ScrapeOutcome): boolean {
  return outcome === 'http_error' || outcome === 'parse_error';
}

/**
 * Side-effect wrapper: decide based on outcome, dispatch operator email if needed.
 *
 * Scheduler-only: called exclusively from the scheduler tick after `scrapeDate`
 * returns. Backfill CLI MUST NOT call this — backfill operates on historical
 * dates where parse/http errors are recorded but not actionable in real-time.
 *
 * Never throws on Resend errors — the scheduler tick wraps this call in its own
 * try/catch to keep alert failures non-fatal (a broken alert channel must not
 * prevent pingHealthcheck('success') from firing; OPS-04 is the higher-level
 * dead-man's switch).
 */
export async function checkSlaAndAlert(date: string, outcome: ScrapeOutcome): Promise<void> {
  if (!shouldAlert(outcome)) {
    logger.info({ msg: 'sla_ok', date, outcome });
    return;
  }

  const subject = `FishCount: scrape ${outcome} for ${date}`;
  const body =
    `Scrape failure alert\n\n` +
    `Date: ${date}\n` +
    `Outcome: ${outcome}\n\n` +
    (outcome === 'http_error'
      ? `The scraper could not reach the source site. Check network and source-site availability.`
      : `The parser rejected the source-site HTML. Likely schema drift — inspect the snapshot for this date and update the parser.`);

  logger.warn({ msg: 'sla_breach', date, outcome });
  await sendOperatorAlert({ subject, body });
}
