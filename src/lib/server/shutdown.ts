// src/lib/server/shutdown.ts
// Source: 00-RESEARCH.md §Q7 "Graceful shutdown handler" lines 629–649.
// Litestream forwards SIGTERM from Fly to Node; Node stops scheduler and exits.
// Litestream then flushes the last WAL segment before exiting itself.
import { logger } from './logger';
import { stopScheduler } from './scheduler';

let shuttingDown = false;
let installed = false;

export function installShutdownHandlers(): void {
  if (installed) return;
  installed = true;

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutdown:start');
    try {
      stopScheduler();
    } catch (err) {
      logger.error({ err }, 'error stopping scheduler during shutdown');
    }
    // Phase 1 will add: closeDb() here before the final log line.
    logger.info('shutdown:complete');
    // Allow pino's async flush to drain before exiting.
    setTimeout(() => process.exit(0), 100).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
