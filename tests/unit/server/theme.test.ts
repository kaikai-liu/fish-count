// tests/unit/server/theme.test.ts
// Phase 8 Plan 04 — THM-02. Verifies the hook substitutes the VALIDATED theme
// value into the data-theme placeholder, not the raw cookie (T-08-04-01 /
// Pitfall 2 cookie-injection guard).
import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/startup', () => ({ runStartup: vi.fn() }));
vi.mock('$lib/server/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis()
  }
}));

import { handle } from '../../../src/hooks.server';

const RAW_HTML =
  '<!doctype html><html lang="en" data-theme="%fc_theme%"><head></head><body></body></html>';

type CookieGet = (name: string) => string | undefined;

function makeEvent(cookieValue: string | undefined) {
  const url = new URL('http://localhost/');
  const get: CookieGet = (name) => (name === 'fc_theme' ? cookieValue : undefined);
  return {
    url,
    request: new Request(url.toString()),
    cookies: { get, getAll: () => [], set: () => {}, delete: () => {}, serialize: () => '' },
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

async function runHandle(cookieValue: string | undefined): Promise<string> {
  const event = makeEvent(cookieValue);
  const resolve = vi.fn(async (_evt: unknown, opts?: unknown) => {
    const transformPageChunk = (opts as
      | { transformPageChunk?: (c: { html: string; done: boolean }) => string | undefined }
      | undefined)?.transformPageChunk;
    const transformed = transformPageChunk
      ? (transformPageChunk({ html: RAW_HTML, done: true }) ?? RAW_HTML)
      : RAW_HTML;
    return new Response(transformed, { status: 200, headers: { 'content-type': 'text/html' } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  const response = await handle({ event, resolve });
  return await response.text();
}

describe('hooks.server.ts — fc_theme cookie → data-theme attribute', () => {
  it('no cookie → data-theme="auto"', async () => {
    const html = await runHandle(undefined);
    expect(html).toContain('data-theme="auto"');
    expect(html).not.toContain('%fc_theme%');
  });

  it('cookie=light → data-theme="light"', async () => {
    const html = await runHandle('light');
    expect(html).toContain('data-theme="light"');
  });

  it('cookie=dark → data-theme="dark"', async () => {
    const html = await runHandle('dark');
    expect(html).toContain('data-theme="dark"');
  });

  it('cookie=garbage → data-theme="auto" (fallback)', async () => {
    const html = await runHandle('garbage');
    expect(html).toContain('data-theme="auto"');
  });

  it('Pitfall 2: HTML-injection cookie value → data-theme="auto" (no injection)', async () => {
    const html = await runHandle('" onerror="alert(1)');
    expect(html).toContain('data-theme="auto"');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('alert(1)');
  });

  it('Pitfall 2: another injection attempt → data-theme="auto"', async () => {
    const html = await runHandle('"><script>alert(1)</script>');
    expect(html).toContain('data-theme="auto"');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
