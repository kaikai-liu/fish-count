// src/lib/server/scheduler.ts
// OPS-05 + Phase 1 nightly scrape scheduler. Uses croner 10.0.1.
//
// D-14: runs at 0 23 * * * America/Los_Angeles = 23:00 PT daily.
// D-15: scrapes "today" only (one fetch per tick); idempotent upsert handles re-runs.
// D-16: no auto-backfill here — operator uses scripts/backfill.ts for catch-up.
//
// Sources:
//   00-RESEARCH.md §Q1 (kill-switch gate at tick time, not boot time)
//   00-RESEARCH.md §Q4 (pitfall: DST — croner with tz string handles this)
//   01-RESEARCH.md §Code Examples (pipeline composition)
//   01-PATTERNS.md §Shared Patterns §Authentication (gate ordering)
//   CLAUDE.md Architecture Rules (timezone = America/Los_Angeles)
//
// Replaces Phase 0's stub _heartbeatTick. The tick body now orchestrates the
// real scrape pipeline from src/lib/scraper/pipeline.ts. OPS-04 dead-man's
// switch bookends (pingHealthcheck 'start'/'success'/'fail') are preserved
// around the scrape call so absence of pings still surfaces to the operator.

import { Cron } from 'croner';
import { logger } from './logger';
import { scrapingEnabled } from './kill-switch';
import { pingHealthcheck } from './heartbeat';
import { scrapeDate } from '$lib/scraper/pipeline';
import { today } from '$lib/shared/dates';
import { checkSlaAndAlert } from '$lib/scraper/sla';
import { recomputeForecasts } from '$lib/forecast/compute';
import { getDb } from '$lib/db/client';

const jobs: Cron[] = [];

/**
 * Nightly scrape tick body. Replaces Phase 0's stub _heartbeatTick.
 *
 * Gate ordering (LOAD-BEARING — Phase 0 invariant + D-21 extension):
 *   1. SCRAPER_ENABLED kill switch (OPS-05) — checked FIRST, before any
 *      side effect. Kill switch does NOT ping: when ingestion is halted,
 *      we WANT the dead-man's switch to fire after grace (surfaces to the
 *      operator that ingestion is off). See 00-RESEARCH.md §Q2.
 *   2. pingHealthcheck('start') — OPS-04 bookend, AFTER kill-switch clears.
 *   3. scrapeDate(today(), 'scheduler') — runs the full Phase 1 pipeline.
 *      The FIRST_SCRAPE_OK gate (D-21) is enforced INSIDE scrapeDate, not
 *      here, so this layer only covers the SCRAPER_ENABLED ordering.
 *   4. pingHealthcheck('success') | ('fail', 1) — close the bookend.
 *      outcome='killed' (from inside scrapeDate) is treated as fail so
 *      the dead-man's switch surfaces gate-blocked days too.
 */
export async function _scrapeTick(): Promise<void> {
  const tickLogger = logger.child({
    job: 'nightly-scrape',
    jobId: crypto.randomUUID()
  });

  // OPS-05 FIRST, before any side effect. NO ping when kill-switch active —
  // see 00-RESEARCH.md §Q2 "dead-man's switch is an absence-detector".
  if (!scrapingEnabled(process.env)) {
    tickLogger.warn({ reason: 'kill_switch_set' }, 'scrape skipped');
    return;
  }

  await pingHealthcheck('start');
  try {
    const date = today();
    tickLogger.info({ msg: 'scrape_tick_start', date });
    const result = await scrapeDate(date, 'scheduler');
    tickLogger.info({
      msg: 'scrape_tick_complete',
      outcome: result.outcome,
      rows: result.rowsIngested
    });

    // ING-07: row-count SLA check (D-23/D-24/D-25). Scheduler-only entry point;
    // checkSlaAndAlert short-circuits internally on non-success outcomes. Wrap
    // in a non-fatal try/catch so a Resend outage (or any SLA-side error) never
    // blocks pingHealthcheck('success') — OPS-04 dead-man's switch owns the
    // higher-level "is ingestion alive" signal; SLA is a secondary tripwire.
    try {
      await checkSlaAndAlert(date, result.outcome);
    } catch (err) {
      tickLogger.error({ err, msg: 'sla_check_failed_non_fatal' });
    }

    // Phase 3 D-13/D-14 (FCT-06): recompute forecasts after a successful or empty scrape.
    // Outcome gate: only run when the data state may have changed. Skipped on
    // killed/http_error/parse_error since the previous forecast remains valid.
    //
    // Non-fatal: a recompute failure must never block pingHealthcheck('success').
    // OPS-04 dead-man's switch owns "is ingestion alive"; forecast recompute is a
    // secondary tripwire. Same try/catch discipline as the SLA check above.
    if (result.outcome === 'success' || result.outcome === 'empty') {
      try {
        recomputeForecasts(getDb());
        tickLogger.info({ msg: 'forecast_recompute_complete' });
      } catch (err) {
        tickLogger.error({ err, msg: 'forecast_recompute_failed_non_fatal' });
      }
    }

    // 'killed' outcome (FIRST_SCRAPE_OK gated or kill-switch flipped mid-run)
    // → treat as failure so OPS-04 fires after grace. Any other outcome,
    // including 'empty' (off-season) and 'parse_error' (drift-detected),
    // is reported as 'success' to the healthcheck since the tick ran.
    // Parse errors surface via the row-count SLA alert in Plan 01-07.
    await pingHealthcheck(result.outcome === 'killed' ? 'fail' : 'success');
  } catch (err) {
    tickLogger.error({ err }, 'scrape tick failed');
    await pingHealthcheck('fail', 1);
    throw err;
  }
}

/**
 * Backwards-compat alias for tests/scheduler/tick-ordering.test.ts (Phase 0).
 *
 * The Phase 0 ordering test asserts the kill-switch-first invariant, which
 * _scrapeTick preserves. The alias lets that regression test continue to
 * exercise the new tick without modification; Plan 01-09 (cleanup) will
 * retire the alias and migrate the old test's import.
 */
export const _heartbeatTick = _scrapeTick;

/** Starts all scheduled jobs. Safe to call multiple times — guarded by the jobs[] check. */
export function startScheduler(): void {
  if (jobs.length > 0) {
    logger.warn('startScheduler called but scheduler already running — ignoring');
    return;
  }

  // D-14: 0 23 * * * in America/Los_Angeles = 23:00 PT daily. croner's
  // timezone string handles DST transitions without our arithmetic.
  // protect: true prevents a second tick from starting if the previous
  // one is still running (belt-and-suspenders around withScrapeLock).
  const nightlyScrape = new Cron(
    '0 23 * * *',
    {
      name: 'nightly-scrape',
      timezone: 'America/Los_Angeles',
      protect: true
    },
    _scrapeTick
  );
  jobs.push(nightlyScrape);

  logger.info(
    { jobs: jobs.map((j) => j.name), timezone: 'America/Los_Angeles' },
    'scheduler started'
  );
}

/** Stops all scheduled jobs. Called by shutdown.ts on SIGTERM/SIGINT. */
export function stopScheduler(): void {
  for (const job of jobs) {
    job.stop();
  }
  const count = jobs.length;
  jobs.length = 0;
  logger.info({ stopped: count }, 'scheduler stopped');
}
