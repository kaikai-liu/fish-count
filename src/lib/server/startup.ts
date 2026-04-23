// src/lib/server/startup.ts
// Called exactly once from src/hooks.server.ts on first request.
// Idempotent: subsequent calls are no-ops (guard flag).
//
// Wires:
//   - Scheduler (OPS-05 stub heartbeat; Phase 1 adds real scrape)
//   - Shutdown handlers (SIGTERM/SIGINT → graceful exit)
//
// Plan 04 (OPS-04 dead-man's switch) and Plan 05 (OPS-01 billing) may add
// further one-time init here; keep this function's concerns as thin wiring only.
import { logger } from './logger';
import { startScheduler } from './scheduler';
import { installShutdownHandlers } from './shutdown';

let started = false;

export function runStartup(): void {
  if (started) return;
  started = true;
  logger.info({ msg: 'startup:start', pid: process.pid, nodeEnv: process.env.NODE_ENV ?? 'production' });
  installShutdownHandlers();
  startScheduler();
  logger.info('startup:complete');
}
