// src/lib/scraper/sla.ts
// ING-07 row-count SLA alert. Fires when today's total rows for a date drops
// below 50% of the 7-day rolling baseline (success outcomes only in baseline,
// per D-23 / D-25).
//
// Decision split per 01-PATTERNS.md §SLA (mirrors Phase 0's billing.ts +
// billing-watcher.ts split):
//   - `shouldAlert` is PURE — no I/O, trivially testable without DB or Resend.
//   - `checkSlaAndAlert` is the side-effect wrapper — reads DB, dispatches email.
//
// Outcome gating (D-25): only `outcome='success'` can trigger the SLA. Other
// outcomes have their own signals (http_error / parse_error / killed surface
// via the OPS-04 dead-man's switch after grace; empty is legitimate off-season).
//
// Sources:
//   .planning/phases/01-ingest-store/01-CONTEXT.md §D-23, D-24, D-25
//   .planning/phases/01-ingest-store/01-RESEARCH.md §SLA lines 812-849
//   .planning/phases/01-ingest-store/01-PATTERNS.md §SLA pure + reuse
import { getDb } from '$lib/db/client';
import { computeSlaBaseline, type ScrapeOutcome } from '$lib/db/scrapeRuns';
import { totalRowsForDate } from '$lib/db/catchReports';
import { sendOperatorAlert } from '$lib/alerts/operator';
import { logger } from '$lib/server/logger';

/** Secondary safeguard: don't alert when baseline is a trickle (insufficient history). */
const MIN_BASELINE_FOR_ALERT = 5;

/** SLA threshold: alert when today total is strictly less than this fraction of baseline. */
const SLA_THRESHOLD = 0.5;

/**
 * Pure decision function. Returns true iff the row-count SLA should fire.
 *
 * Rules (D-23/D-24/D-25):
 *   - Only `outcome='success'` can trigger — non-success has its own signals.
 *   - `baseline` must be non-null and ≥ `MIN_BASELINE_FOR_ALERT` (avoids alerting
 *     on fresh installs / extended off-season where history is too thin to
 *     meaningfully compare against).
 *   - Alert when `todayTotal < SLA_THRESHOLD * baseline` (strict `<`).
 */
export function shouldAlert(
  outcome: ScrapeOutcome,
  baseline: number | null,
  todayTotal: number
): boolean {
  if (outcome !== 'success') return false;
  if (baseline === null || baseline < MIN_BASELINE_FOR_ALERT) return false;
  return todayTotal < SLA_THRESHOLD * baseline;
}

/**
 * Side-effect wrapper: query DB, decide, dispatch operator email if needed.
 *
 * Scheduler-only: called exclusively from the scheduler tick after
 * `scrapeDate` returns. The backfill CLI MUST NOT call this — mid-history
 * baselines are meaningless (you'd be comparing 2014 row counts against a
 * 2014 baseline, which races the same backfill you're doing).
 *
 * Never throws on Resend errors — the scheduler tick wraps this call in its
 * own try/catch to keep SLA failures non-fatal (a broken alert channel must
 * not prevent pingHealthcheck('success') from firing; OPS-04 is the
 * higher-level dead-man's switch).
 */
export async function checkSlaAndAlert(date: string, outcome: ScrapeOutcome): Promise<void> {
  // Fast path: short-circuit BEFORE any DB read if outcome is not success.
  // This keeps non-success ticks (empty / http_error / parse_error / killed)
  // purely free of SLA side effects.
  if (outcome !== 'success') return;

  const db = getDb();
  const baseline = computeSlaBaseline(db, date);
  const total = totalRowsForDate(db, date);

  if (!shouldAlert(outcome, baseline, total)) {
    logger.info({ msg: 'sla_ok', date, total, baseline });
    return;
  }

  const thresholdRows = SLA_THRESHOLD * (baseline ?? 0);
  const baselineStr = (baseline ?? 0).toFixed(1);
  const thresholdStr = thresholdRows.toFixed(1);
  const subject = `FishCount: row-count SLA breach for ${date}`;
  const body =
    `Row-count SLA alert\n\n` +
    `Date: ${date}\n` +
    `Today total: ${total} rows\n` +
    `7-day baseline (success outcomes only): ${baselineStr} rows\n` +
    `Threshold (50% of baseline): ${thresholdStr} rows\n\n` +
    `Today total (${total}) is below threshold (${thresholdStr}). ` +
    `Investigate parser/schema drift.`;

  logger.warn({ msg: 'sla_breach', date, total, baseline, threshold: thresholdRows });
  await sendOperatorAlert({ subject, body });
}
