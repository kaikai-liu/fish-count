import type { Handle } from '@sveltejs/kit';
import { runStartup } from '$lib/server/startup';
import { logger } from '$lib/server/logger';

// Run startup exactly once on module load (first request warms this up).
runStartup();

export const handle: Handle = async ({ event, resolve }) => {
  logger.info({ msg: 'request', method: event.request.method, path: event.url.pathname });
  return resolve(event);
};
