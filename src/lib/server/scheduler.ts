// src/lib/server/scheduler.ts
// OPS-05 + (Phase 1) scraper scheduler. Uses croner 10.0.1.
// Sources:
//   00-RESEARCH.md §Q1 (kill-switch gate at tick time, not boot time)
//   00-RESEARCH.md §Q4 (pitfall: DST — use 03:00 PT not 02:00 PT)
//   CLAUDE.md Architecture Rules (timezone = America/Los_Angeles)
//
// Phase 0 scope: a stub "heartbeat" cron that ticks every minute. It exists
// so OPS-05 (kill switch) and OPS-04 (dead-man's switch, Plan 04) can be
// verified end-to-end before Phase 1's real scraper ships.
//
// Phase 1 will add the real scrape tick ('0 3 * * *') alongside this
// heartbeat or replace it — TBD by Phase 1 planning.

import { Cron } from 'croner';
import { logger } from './logger';
import { scrapingEnabled } from './kill-switch';

const jobs: Cron[] = [];

/** Heartbeat tick body — exported so Plan 04 can wrap it with a healthcheck ping. */
export async function _heartbeatTick(): Promise<void> {
  const tickLogger = logger.child({ job: 'heartbeat', jobId: crypto.randomUUID() });

  if (!scrapingEnabled(process.env)) {
    tickLogger.warn({ reason: 'kill_switch_set' }, 'heartbeat skipped');
    return;
  }

  tickLogger.info({ status: 'ok' }, 'heartbeat tick');
  // Plan 04 wraps this body with pingHealthcheck('start') / ('success') / ('fail').
}

/** Starts all scheduled jobs. Safe to call multiple times — guarded by the jobs[] check. */
export function startScheduler(): void {
  if (jobs.length > 0) {
    logger.warn('startScheduler called but scheduler already running — ignoring');
    return;
  }

  // Heartbeat: every minute, in Pacific time. Gated by SCRAPER_ENABLED.
  // Grace period for Plan 04's healthchecks.io will be 5 min during Phase 0 testing,
  // bumped to 36h once Phase 1's daily scrape ships.
  const heartbeat = new Cron(
    '* * * * *',
    {
      name: 'heartbeat',
      timezone: 'America/Los_Angeles',
      protect: true // skip tick if previous one still running
    },
    _heartbeatTick
  );
  jobs.push(heartbeat);

  logger.info({ jobs: jobs.map((j) => j.name), timezone: 'America/Los_Angeles' }, 'scheduler started');
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
