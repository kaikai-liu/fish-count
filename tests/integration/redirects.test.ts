// tests/integration/redirects.test.ts
// Phase 8 Plan 03 — RDR-01, RDR-02 (D-17, D-18) integration tests.
//
// Asserts the v1 retirement redirects in src/hooks.server.ts:
//   - /picker, /picker/*, /picker?... → 301 → /explorer
//   - /trends, /trends/*, /trends?... → 301 → /explorer
//   - /explorer is NOT redirected (passes through to its loader)
//
// Strategy: import the `handle` hook directly and call it with a fake event +
// fake `resolve`. The redirect throws a SvelteKit Redirect object; we catch
// and assert its status + location. This avoids spinning up the full Vite dev
// server while still exercising the production code path.
import { describe, it, expect, vi } from 'vitest';

// Mock the startup module so importing hooks.server doesn't try to start the
// real scheduler / DB during tests.
vi.mock('$lib/server/startup', () => ({
  runStartup: vi.fn()
}));

// Mock logger to keep test output clean.
vi.mock('$lib/server/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis()
  }
}));

import { handle } from '../../src/hooks.server';

type RedirectThrown = { status: number; location: string };

function makeEvent(pathname: string, search = ''): Parameters<typeof handle>[0]['event'] {
  const url = new URL(`http://localhost${pathname}${search}`);
  return {
    url,
    request: new Request(url.toString()),
    cookies: {
      get: () => undefined,
      getAll: () => [],
      set: () => {},
      delete: () => {},
      serialize: () => ''
    },
    setHeaders: () => {},
    locals: {} as Record<string, unknown>,
    platform: undefined,
    params: {},
    fetch: globalThis.fetch,
    getClientAddress: () => '127.0.0.1',
    isDataRequest: false,
    isSubRequest: false,
    route: { id: null }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

async function callHandle(
  pathname: string,
  search = ''
): Promise<{ redirect: RedirectThrown | null; response: Response | null }> {
  const event = makeEvent(pathname, search);
  // Resolve is only called for non-redirect paths.
  const resolve = vi.fn(async () => new Response('ok', { status: 200 }));
  try {
    const response = await handle({ event, resolve });
    return { redirect: null, response };
  } catch (err) {
    // SvelteKit's redirect() throws a plain object: { status, location }.
    const e = err as RedirectThrown;
    if (typeof e?.status === 'number' && typeof e?.location === 'string') {
      return { redirect: e, response: null };
    }
    throw err;
  }
}

describe('hooks.server.ts — v1 retirement 301 redirects', () => {
  it('GET /picker → 301 → /explorer', async () => {
    const { redirect } = await callHandle('/picker');
    expect(redirect).not.toBeNull();
    expect(redirect!.status).toBe(301);
    expect(redirect!.location).toBe('/explorer');
  });

  it('GET /picker?ticker=boat&id=42 → 301 → /explorer (query dropped)', async () => {
    const { redirect } = await callHandle('/picker', '?ticker=boat&id=42');
    expect(redirect).not.toBeNull();
    expect(redirect!.status).toBe(301);
    // D-17 query strings dropped silently — Location is bare /explorer.
    expect(redirect!.location).toBe('/explorer');
  });

  it('GET /picker/anything → 301 → /explorer', async () => {
    const { redirect } = await callHandle('/picker/anything');
    expect(redirect).not.toBeNull();
    expect(redirect!.status).toBe(301);
    expect(redirect!.location).toBe('/explorer');
  });

  it('GET /trends → 301 → /explorer', async () => {
    const { redirect } = await callHandle('/trends');
    expect(redirect).not.toBeNull();
    expect(redirect!.status).toBe(301);
    expect(redirect!.location).toBe('/explorer');
  });

  it('GET /trends?range=1y → 301 → /explorer (query dropped)', async () => {
    const { redirect } = await callHandle('/trends', '?range=1y');
    expect(redirect).not.toBeNull();
    expect(redirect!.status).toBe(301);
    expect(redirect!.location).toBe('/explorer');
  });

  it('GET /trends/sub → 301 → /explorer', async () => {
    const { redirect } = await callHandle('/trends/sub');
    expect(redirect).not.toBeNull();
    expect(redirect!.status).toBe(301);
    expect(redirect!.location).toBe('/explorer');
  });

  it('GET /explorer → NOT redirected (passes through)', async () => {
    const { redirect, response } = await callHandle('/explorer');
    expect(redirect).toBeNull();
    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
  });

  it('GET /pickerextra → NOT redirected (boundary check — only /picker and /picker/* match)', async () => {
    // Defends against a too-loose startsWith('/picker') (without trailing slash).
    // Any future route literally beginning with the string "/picker" but not
    // matching /picker or /picker/* should pass through.
    const { redirect, response } = await callHandle('/pickerextra');
    expect(redirect).toBeNull();
    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
  });

  it('GET /trendsextra → NOT redirected (boundary check)', async () => {
    const { redirect, response } = await callHandle('/trendsextra');
    expect(redirect).toBeNull();
    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
  });

  it('GET / (home) → NOT redirected', async () => {
    const { redirect, response } = await callHandle('/');
    expect(redirect).toBeNull();
    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
  });
});
