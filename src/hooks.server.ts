// src/hooks.server.ts
// Source: 00-RESEARCH.md §Q5 "Request ID correlation (SvelteKit)" lines 502–548.
// Uses Fly's edge-proxy `fly-request-id` header when available so edge + app
// logs can be correlated; falls back to crypto.randomUUID() for local dev.
import type { Handle } from '@sveltejs/kit';
import { runStartup } from '$lib/server/startup';
import { logger } from '$lib/server/logger';

// Run startup hooks exactly once on module load (first request warms this up).
// Plan 03 fills runStartup() to start the croner scheduler.
runStartup();

export const handle: Handle = async ({ event, resolve }) => {
  const requestId = event.request.headers.get('fly-request-id') ?? crypto.randomUUID();

  // Child logger auto-attaches requestId + path to every log line this request emits.
  const reqLogger = logger.child({ requestId, path: event.url.pathname });
  event.locals.logger = reqLogger;
  event.locals.requestId = requestId;

  const start = performance.now();
  reqLogger.info({ method: event.request.method }, 'request:start');

  try {
    const response = await resolve(event);
    reqLogger.info(
      { status: response.status, durationMs: Math.round(performance.now() - start) },
      'request:end'
    );
    // Round-trip: client can see the id we logged against.
    response.headers.set('x-request-id', requestId);
    return response;
  } catch (err) {
    reqLogger.error({ err, durationMs: Math.round(performance.now() - start) }, 'request:error');
    throw err;
  }
};
