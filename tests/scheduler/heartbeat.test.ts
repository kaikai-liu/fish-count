// tests/scheduler/heartbeat.test.ts
// Covers OPS-04 ping shape: URL suffixes, no-op when env unset, non-fatal on fetch failure.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('pingHealthcheck (OPS-04 dead-man ping)', () => {
  const BASE = 'https://hc-ping.com/abcd1234-5678-90ab-cdef-111122223333';
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env.HEALTHCHECKS_PING_URL;
    fetchMock = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    vi.resetModules(); // so the module picks up the current env on each import
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env.HEALTHCHECKS_PING_URL;
    else process.env.HEALTHCHECKS_PING_URL = originalEnv;
    vi.restoreAllMocks();
  });

  it('posts to base URL on success status (default)', async () => {
    process.env.HEALTHCHECKS_PING_URL = BASE;
    const mod = await import('../../src/lib/server/heartbeat');
    await mod.pingHealthcheck('success');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(BASE);
    expect(init.method).toBe('POST');
  });

  it('posts to /start when status is "start"', async () => {
    process.env.HEALTHCHECKS_PING_URL = BASE;
    const mod = await import('../../src/lib/server/heartbeat');
    await mod.pingHealthcheck('start');
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/start`);
  });

  it('posts to /fail when status is "fail"', async () => {
    process.env.HEALTHCHECKS_PING_URL = BASE;
    const mod = await import('../../src/lib/server/heartbeat');
    await mod.pingHealthcheck('fail');
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/fail`);
  });

  it('is a no-op when HEALTHCHECKS_PING_URL is unset', async () => {
    delete process.env.HEALTHCHECKS_PING_URL;
    const mod = await import('../../src/lib/server/heartbeat');
    await mod.pingHealthcheck('success');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not throw when fetch rejects (non-fatal)', async () => {
    process.env.HEALTHCHECKS_PING_URL = BASE;
    fetchMock.mockRejectedValue(new Error('network error'));
    const mod = await import('../../src/lib/server/heartbeat');
    await expect(mod.pingHealthcheck('success')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not throw when fetch times out', async () => {
    process.env.HEALTHCHECKS_PING_URL = BASE;
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    fetchMock.mockRejectedValue(abortErr);
    const mod = await import('../../src/lib/server/heartbeat');
    await expect(mod.pingHealthcheck('success')).resolves.toBeUndefined();
  });

  it('includes exitCode in body when nonzero and status is "fail"', async () => {
    process.env.HEALTHCHECKS_PING_URL = BASE;
    const mod = await import('../../src/lib/server/heartbeat');
    await mod.pingHealthcheck('fail', 42);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe('exit code: 42');
  });
});
