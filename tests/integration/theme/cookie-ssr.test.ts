// tests/integration/theme/cookie-ssr.test.ts
// Phase 8 Plan 04 — THM-02 / D-28. Verifies the SSR roundtrip from cookie →
// transformPageChunk → emitted HTML. Confirms NO flash-prone state can leak:
// the data-theme attribute is always one of {auto, light, dark} after the
// hook runs, even with malformed cookies.
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
  '<!doctype html>\n<html lang="en" data-theme="%fc_theme%">\n  <head>\n    <meta charset="utf-8" />\n    <title>FishCount</title>\n  </head>\n  <body>\n    <div></div>\n  </body>\n</html>';

function makeEvent(cookieValue: string | undefined) {
  const url = new URL('http://localhost/');
  return {
    url,
    request: new Request(url.toString()),
    cookies: {
      get: (name: string) => (name === 'fc_theme' ? cookieValue : undefined),
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

async function runWithCookie(cookieValue: string | undefined): Promise<string> {
  const event = makeEvent(cookieValue);
  const resolve = vi.fn(async (_evt: unknown, opts?: unknown) => {
    const transformPageChunk = (opts as
      | { transformPageChunk?: (c: { html: string; done: boolean }) => string | undefined }
      | undefined)?.transformPageChunk;
    const transformed = transformPageChunk
      ? (transformPageChunk({ html: RAW_HTML, done: true }) ?? RAW_HTML)
      : RAW_HTML;
    return new Response(transformed, { status: 200 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  const response = await handle({ event, resolve });
  return await response.text();
}

describe('theme cookie SSR roundtrip', () => {
  it('emits <html ... data-theme="auto"> when no cookie present', async () => {
    const html = await runWithCookie(undefined);
    expect(html).toContain('<html lang="en" data-theme="auto">');
  });

  it('emits data-theme="dark" when fc_theme=dark', async () => {
    const html = await runWithCookie('dark');
    expect(html).toContain('data-theme="dark"');
  });

  it('emits data-theme="light" when fc_theme=light', async () => {
    const html = await runWithCookie('light');
    expect(html).toContain('data-theme="light"');
  });

  it('falls back to data-theme="auto" on garbage value', async () => {
    const html = await runWithCookie('garbage');
    expect(html).toContain('data-theme="auto"');
  });

  it('never leaves the placeholder unsubstituted', async () => {
    const html = await runWithCookie(undefined);
    expect(html).not.toContain('%fc_theme%');
  });

  it('rejects HTML attribute injection', async () => {
    const html = await runWithCookie('" onload="alert(1)');
    expect(html).toContain('data-theme="auto"');
    expect(html).not.toContain('onload');
    expect(html).not.toContain('alert(1)');
  });
});
