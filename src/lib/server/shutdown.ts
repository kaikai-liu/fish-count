// src/lib/server/shutdown.ts
// Source: 00-RESEARCH.md §Q7 "Graceful shutdown handler" lines 629–649.
// Litestream forwards SIGTERM from Fly to Node; Node stops scheduler and exits.
// Litestream then flushes the last WAL segment before exiting itself.
import { logger } from './logger';
import { stopScheduler } from './scheduler';

let shuttingDown = false;
let installed = false;

// WR-06: max wait for pino to drain its transport buffer before exit.
// Fly's hard-kill after SIGTERM is 30s; 2s leaves plenty of room for the
// SIGTERM → (scheduler stop) → (final log lines drain) sequence while still
// unblocking if Better Stack / a pino transport worker is wedged.
const FLUSH_TIMEOUT_MS = 2000;

export function installShutdownHandlers(): void {
  if (installed) return;
  installed = true;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutdown:start');
    try {
      stopScheduler();
      // Phase 1 will add: await closeDb();
    } catch (err) {
      logger.error({ err }, 'error stopping scheduler during shutdown');
    }
    logger.info('shutdown:complete');
    // WR-06: await pino flush rather than a fixed 100ms timeout. Once a Better
    // Stack transport is wired (`pino.transport({ target: '@logtail/pino' })`
    // runs log writes on a worker thread with its own network buffer) a short
    // fixed timeout can lose the shutdown:start / shutdown:complete lines —
    // exactly the lines an operator needs during an incident. We still cap the
    // wait so a wedged transport can't block SIGTERM indefinitely.
    await Promise.race([
      new Promise<void>((resolve) => {
        // pino.flush accepts an optional callback; typed loosely here because
        // pino 8/10 flush type differs across transport targets.
        const maybeFlush = (logger as unknown as { flush?: (cb?: () => void) => void }).flush;
        if (typeof maybeFlush === 'function') {
          maybeFlush.call(logger, () => resolve());
        } else {
          resolve();
        }
      }),
      new Promise<void>((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS).unref())
    ]);
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}
