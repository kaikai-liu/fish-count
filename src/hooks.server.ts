// src/hooks.server.ts
// Source: 00-RESEARCH.md §Q5 "Request ID correlation (SvelteKit)" lines 502–548.
// Uses Fly's edge-proxy `fly-request-id` header when available so edge + app
// logs can be correlated; falls back to crypto.randomUUID() for local dev.
//
// Phase 8 Plan 03 (RDR-01, RDR-02 / D-17, D-18): added the v1 retirement 301
// redirects below. /picker* and /trends* both permanent-redirect to bare
// /explorer; query strings dropped silently (no param translation per D-17).
// Pitfall: 301s are aggressive — browsers cache them hard. If the destination
// ever needs to change during dev iteration, clear the browser cache (or use
// an incognito window) so stale 301s don't pin the wrong target.
import { redirect, type Handle } from '@sveltejs/kit';
import { runStartup } from '$lib/server/startup';
import { logger } from '$lib/server/logger';

// Run startup hooks exactly once on module load (first request warms this up).
// Plan 03 fills runStartup() to start the croner scheduler.
runStartup();

export const handle: Handle = async ({ event, resolve }) => {
  // Phase 8 Plan 03 — RDR-01, RDR-02 (D-17, D-18). Hardcoded /explorer destination;
  // no user-controlled path component flows into the Location header (T-08-03-01).
  // Query strings dropped silently per D-17 (T-08-03-02).
  const path = event.url.pathname;
  if (
    path === '/picker' ||
    path.startsWith('/picker/') ||
    path === '/trends' ||
    path.startsWith('/trends/')
  ) {
    throw redirect(301, '/explorer');
  }

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
