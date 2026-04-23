// Placeholder startup hook. Plan 03 (OPS-05 kill switch) replaces this with scheduler init.
// This module is called exactly once from src/hooks.server.ts on first request.
import { logger } from './logger';

let started = false;

export function runStartup(): void {
  if (started) return;
  started = true;
  logger.info({ msg: 'startup:placeholder — scheduler wired in Plan 03' });
}
