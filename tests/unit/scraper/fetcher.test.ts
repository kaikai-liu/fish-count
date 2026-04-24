// tests/unit/scraper/fetcher.test.ts
// Covers ING-02 (UA with contact link) + ING-03 (polite fetch) invariants.
// Mirrors the heartbeat.test.ts env save/restore + fetchMock pattern.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubFetch, restoreFetch } from '../../helpers/fetch-stub';

// Filter helper: robots.txt fetch may happen during fetchPage(), so when
// counting fetch attempts to the page URL we ignore robots.txt requests.
function pageFetchCalls(
  mock: ReturnType<typeof vi.fn>
): Array<[unknown, unknown]> {
  return mock.mock.calls.filter((c) => String(c[0]).includes('boats.php')) as Array<
    [unknown, unknown]
  >;
}

describe('fetcher (ING-02 UA + ING-03 polite fetch)', () => {
  beforeEach(async () => {
    vi.resetModules();
    // Reset robots cache so each test re-fetches (allowing robots assertions).
    try {
      const robots = await import('../../../src/lib/scraper/robots');
      robots._clearRobotsCache();
    } catch {
      // module may not exist yet during RED phase — swallow
    }
  });

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  it('USER_AGENT contains "+http" contact-link substring (ING-02)', async () => {
    const { USER_AGENT } = await import('../../../src/lib/scraper/fetcher');
    expect(USER_AGENT).toContain('+http');
  });

  it('fetchPage issues GET with correct URL + UA header', async () => {
    const mock = stubFetch({ status: 200, body: '<html>ok</html>' });
    const { fetchPage, USER_AGENT } = await import('../../../src/lib/scraper/fetcher');
    const html = await fetchPage('2024-08-15');
    expect(html).toBe('<html>ok</html>');
    const pageCalls = pageFetchCalls(mock);
    expect(pageCalls.length).toBeGreaterThanOrEqual(1);
    const [url, init] = pageCalls[0] as [string | URL, RequestInit];
    expect(String(url)).toContain('?date=2024-08-15');
    expect(String(url)).toContain('boats.php');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const uaHeader =
      headers['user-agent'] ?? headers['User-Agent'] ?? headers['USER-AGENT'];
    expect(uaHeader).toBe(USER_AGENT);
    expect(uaHeader).toContain('+http');
  });

  it('on 404 throws WITHOUT retrying (AbortError short-circuit)', async () => {
    // First response for robots.txt (200 empty), then 404 for page.
    // Since stubFetch is sticky on the last element, we give it a small sequence
    // where after consumed, the fallback also returns 404 — but we'll assert
    // exactly one call to the boats.php URL regardless.
    const mock = stubFetch([
      { status: 200, body: '' }, // robots.txt
      { status: 404, body: 'Not Found' }, // page attempt 1
      { status: 404, body: 'Not Found' } // sticky fallback
    ]);
    const { fetchPage } = await import('../../../src/lib/scraper/fetcher');
    await expect(fetchPage('2024-08-15')).rejects.toThrow();
    const pageCalls = pageFetchCalls(mock);
    expect(pageCalls.length).toBe(1); // no retry on 4xx
  });

  it('on 200 with HTML body returns body text', async () => {
    stubFetch({ status: 200, body: '<html><body>hello</body></html>' });
    const { fetchPage } = await import('../../../src/lib/scraper/fetcher');
    const html = await fetchPage('2024-08-15');
    expect(html).toContain('hello');
  });

  it('on 503 once then 200 retries and returns the body', async () => {
    const mock = stubFetch([
      { status: 200, body: '' }, // robots.txt
      { status: 503, body: 'Service Unavailable' }, // page attempt 1
      { status: 200, body: '<html>ok</html>' } // page attempt 2
    ]);
    const { fetchPage } = await import('../../../src/lib/scraper/fetcher');
    const html = await fetchPage('2024-08-15');
    expect(html).toBe('<html>ok</html>');
    const pageCalls = pageFetchCalls(mock);
    expect(pageCalls.length).toBe(2); // 1 retry after 503
  }, 15_000);
});
