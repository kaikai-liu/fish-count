// tests/scheduler/scrape-tick.test.ts
// Plan 01-05 Task 2 RED/GREEN — verifies _scrapeTick (replacement for Phase 0
// _heartbeatTick) preserves the kill-switch ordering invariant and wires
// pingHealthcheck bookends around scrapeDate.
//
// Analog: tests/scheduler/tick-ordering.test.ts (exact match — same
// vi.doMock + dynamic import pattern, new tick function).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('scheduler _scrapeTick — kill-switch + FIRST_SCRAPE_OK ordering (OPS-04 ∩ OPS-05 + D-21)', () => {
  const originalEnabled = process.env.SCRAPER_ENABLED;
  const originalGate = process.env.FIRST_SCRAPE_OK;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnabled === undefined) delete process.env.SCRAPER_ENABLED;
    else process.env.SCRAPER_ENABLED = originalEnabled;
    if (originalGate === undefined) delete process.env.FIRST_SCRAPE_OK;
    else process.env.FIRST_SCRAPE_OK = originalGate;
    vi.restoreAllMocks();
    vi.doUnmock('../../src/lib/server/heartbeat');
    vi.doUnmock('../../src/lib/scraper/pipeline');
  });

  it('SCRAPER_ENABLED=false → fetch never called, pingHealthcheck never called (kill switch is FIRST)', async () => {
    process.env.SCRAPER_ENABLED = 'false';
    process.env.FIRST_SCRAPE_OK = 'true';

    const fetchMock = vi.fn().mockResolvedValue(new Response('should never run', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const pingHealthcheck = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../../src/lib/server/heartbeat', () => ({ pingHealthcheck }));

    const scrapeDate = vi.fn().mockResolvedValue({
      outcome: 'success',
      rowsIngested: 0,
      runId: 'unused'
    });
    vi.doMock('../../src/lib/scraper/pipeline', () => ({ scrapeDate }));

    const mod = await import('../../src/lib/server/scheduler');
    await mod._scrapeTick();

    // Hard assertion: kill switch gated BEFORE any ping and BEFORE any work.
    expect(pingHealthcheck).not.toHaveBeenCalled();
    expect(scrapeDate).not.toHaveBeenCalled();
    const sourceFetches = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('boats.php')
    );
    expect(sourceFetches).toHaveLength(0);
  });

  it('FIRST_SCRAPE_OK unset → ping("start") IS called (kill-switch passed), scrapeDate returns killed, outbound fetch never happens', async () => {
    // Kill switch allows; FIRST_SCRAPE_OK gate (inside scrapeDate) blocks.
    process.env.SCRAPER_ENABLED = 'true';
    delete process.env.FIRST_SCRAPE_OK;

    const fetchMock = vi.fn().mockResolvedValue(new Response('should never run', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const pingHealthcheck = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../../src/lib/server/heartbeat', () => ({ pingHealthcheck }));

    // Stub pipeline — simulate the FIRST_SCRAPE_OK short-circuit inside scrapeDate.
    const scrapeDate = vi.fn().mockResolvedValue({
      outcome: 'killed',
      rowsIngested: 0,
      runId: 'gated',
      errorMessage: 'FIRST_SCRAPE_OK not set'
    });
    vi.doMock('../../src/lib/scraper/pipeline', () => ({ scrapeDate }));

    const mod = await import('../../src/lib/server/scheduler');
    await mod._scrapeTick();

    // Scheduler called pingHealthcheck('start') after the kill-switch passed;
    // scrapeDate then short-circuited internally via gate 1 (D-21) so outbound
    // fetch was never attempted.
    expect(pingHealthcheck).toHaveBeenCalled();
    expect(pingHealthcheck.mock.calls[0]?.[0]).toBe('start');
    expect(scrapeDate).toHaveBeenCalledTimes(1);
    const sourceFetches = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('boats.php')
    );
    expect(sourceFetches).toHaveLength(0);

    // outcome='killed' → pingHealthcheck('fail') per D-21 semantics.
    const statuses = pingHealthcheck.mock.calls.map((c) => c[0]);
    expect(statuses).toContain('fail');
  });

  it('both gates open → scrapeDate invoked with today + scheduler source, ping(start)→ping(success) sequence', async () => {
    process.env.SCRAPER_ENABLED = 'true';
    process.env.FIRST_SCRAPE_OK = 'true';

    const fetchMock = vi.fn().mockResolvedValue(new Response('<html></html>', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const pingHealthcheck = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../../src/lib/server/heartbeat', () => ({ pingHealthcheck }));

    const scrapeDate = vi.fn().mockResolvedValue({
      outcome: 'empty',
      rowsIngested: 0,
      runId: 'test-run'
    });
    vi.doMock('../../src/lib/scraper/pipeline', () => ({ scrapeDate }));

    const mod = await import('../../src/lib/server/scheduler');
    await mod._scrapeTick();

    expect(scrapeDate).toHaveBeenCalledTimes(1);
    // First arg should be today's YYYY-MM-DD in PT; second arg 'scheduler'.
    const [dateArg, sourceArg] = scrapeDate.mock.calls[0];
    expect(typeof dateArg).toBe('string');
    expect(dateArg).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sourceArg).toBe('scheduler');

    // Ping sequence: start → success (outcome was 'empty', which is not 'killed').
    const statuses = pingHealthcheck.mock.calls.map((c) => c[0]);
    expect(statuses[0]).toBe('start');
    expect(statuses).toContain('success');
  });
});

describe('_scrapeTick — Phase 3 forecast recompute hook (D-13, D-14, FCT-06)', () => {
  const originalEnabled = process.env.SCRAPER_ENABLED;
  const originalGate = process.env.FIRST_SCRAPE_OK;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.SCRAPER_ENABLED;
    else process.env.SCRAPER_ENABLED = originalEnabled;
    if (originalGate === undefined) delete process.env.FIRST_SCRAPE_OK;
    else process.env.FIRST_SCRAPE_OK = originalGate;
    vi.restoreAllMocks();
    vi.doUnmock('../../src/lib/server/heartbeat');
    vi.doUnmock('../../src/lib/scraper/pipeline');
    vi.doUnmock('../../src/lib/scraper/sla');
    vi.doUnmock('$lib/forecast/compute');
    vi.doUnmock('$lib/db/client');
    vi.doUnmock('../../src/lib/server/kill-switch');
  });

  it('outcome="success" → recomputeForecasts is called once', async () => {
    process.env.SCRAPER_ENABLED = 'true';
    process.env.FIRST_SCRAPE_OK = 'true';
    const recomputeSpy = vi.fn();
    vi.doMock('$lib/forecast/compute', () => ({ recomputeForecasts: recomputeSpy }));
    vi.doMock('$lib/db/client', () => ({ getDb: () => ({} as never) }));
    vi.doMock('../../src/lib/scraper/pipeline', () => ({
      scrapeDate: vi.fn().mockResolvedValue({ outcome: 'success', rowsIngested: 12, runId: 'r1' })
    }));
    vi.doMock('../../src/lib/scraper/sla', () => ({
      checkSlaAndAlert: vi.fn().mockResolvedValue(undefined)
    }));
    vi.doMock('../../src/lib/server/heartbeat', () => ({
      pingHealthcheck: vi.fn().mockResolvedValue(undefined)
    }));
    vi.doMock('../../src/lib/server/kill-switch', () => ({ scrapingEnabled: () => true }));

    const { _scrapeTick } = await import('../../src/lib/server/scheduler');
    await _scrapeTick();
    expect(recomputeSpy).toHaveBeenCalledTimes(1);
  });

  it('outcome="empty" → recomputeForecasts is called once (D-14)', async () => {
    process.env.SCRAPER_ENABLED = 'true';
    process.env.FIRST_SCRAPE_OK = 'true';
    const recomputeSpy = vi.fn();
    vi.doMock('$lib/forecast/compute', () => ({ recomputeForecasts: recomputeSpy }));
    vi.doMock('$lib/db/client', () => ({ getDb: () => ({} as never) }));
    vi.doMock('../../src/lib/scraper/pipeline', () => ({
      scrapeDate: vi.fn().mockResolvedValue({ outcome: 'empty', rowsIngested: 0, runId: 'r2' })
    }));
    vi.doMock('../../src/lib/scraper/sla', () => ({
      checkSlaAndAlert: vi.fn().mockResolvedValue(undefined)
    }));
    vi.doMock('../../src/lib/server/heartbeat', () => ({
      pingHealthcheck: vi.fn().mockResolvedValue(undefined)
    }));
    vi.doMock('../../src/lib/server/kill-switch', () => ({ scrapingEnabled: () => true }));

    const { _scrapeTick } = await import('../../src/lib/server/scheduler');
    await _scrapeTick();
    expect(recomputeSpy).toHaveBeenCalledTimes(1);
  });

  it.each(['killed', 'http_error', 'parse_error'] as const)(
    'outcome="%s" → recomputeForecasts is NOT called (D-14)',
    async (outcome) => {
      process.env.SCRAPER_ENABLED = 'true';
      process.env.FIRST_SCRAPE_OK = 'true';
      const recomputeSpy = vi.fn();
      vi.doMock('$lib/forecast/compute', () => ({ recomputeForecasts: recomputeSpy }));
    vi.doMock('$lib/db/client', () => ({ getDb: () => ({} as never) }));
      vi.doMock('../../src/lib/scraper/pipeline', () => ({
        scrapeDate: vi.fn().mockResolvedValue({ outcome, rowsIngested: 0, runId: 'r-' + outcome })
      }));
      vi.doMock('../../src/lib/scraper/sla', () => ({
        checkSlaAndAlert: vi.fn().mockResolvedValue(undefined)
      }));
      vi.doMock('../../src/lib/server/heartbeat', () => ({
        pingHealthcheck: vi.fn().mockResolvedValue(undefined)
      }));
      vi.doMock('../../src/lib/server/kill-switch', () => ({ scrapingEnabled: () => true }));

      const { _scrapeTick } = await import('../../src/lib/server/scheduler');
      await _scrapeTick();
      expect(recomputeSpy).not.toHaveBeenCalled();
    }
  );

  it('recompute failure is NON-FATAL — pingHealthcheck("success") still fires', async () => {
    process.env.SCRAPER_ENABLED = 'true';
    process.env.FIRST_SCRAPE_OK = 'true';
    const recomputeSpy = vi.fn(() => {
      throw new Error('forecast recompute boom');
    });
    const pingSpy = vi.fn().mockResolvedValue(undefined);
    vi.doMock('$lib/forecast/compute', () => ({ recomputeForecasts: recomputeSpy }));
    vi.doMock('$lib/db/client', () => ({ getDb: () => ({} as never) }));
    vi.doMock('../../src/lib/scraper/pipeline', () => ({
      scrapeDate: vi.fn().mockResolvedValue({ outcome: 'success', rowsIngested: 5, runId: 'r-fail' })
    }));
    vi.doMock('../../src/lib/scraper/sla', () => ({
      checkSlaAndAlert: vi.fn().mockResolvedValue(undefined)
    }));
    vi.doMock('../../src/lib/server/heartbeat', () => ({ pingHealthcheck: pingSpy }));
    vi.doMock('../../src/lib/server/kill-switch', () => ({ scrapingEnabled: () => true }));

    const { _scrapeTick } = await import('../../src/lib/server/scheduler');
    await expect(_scrapeTick()).resolves.toBeUndefined();
    const calls = pingSpy.mock.calls.map((c) => c[0]);
    expect(calls).toContain('start');
    expect(calls).toContain('success');
    expect(calls).not.toContain('fail');
  });

  it('kill switch active → recomputeForecasts is NOT called (existing OPS-05 invariant)', async () => {
    process.env.SCRAPER_ENABLED = 'false';
    const recomputeSpy = vi.fn();
    vi.doMock('$lib/forecast/compute', () => ({ recomputeForecasts: recomputeSpy }));
    vi.doMock('$lib/db/client', () => ({ getDb: () => ({} as never) }));
    vi.doMock('../../src/lib/server/kill-switch', () => ({ scrapingEnabled: () => false }));
    vi.doMock('../../src/lib/scraper/pipeline', () => ({ scrapeDate: vi.fn() }));
    vi.doMock('../../src/lib/scraper/sla', () => ({
      checkSlaAndAlert: vi.fn().mockResolvedValue(undefined)
    }));
    vi.doMock('../../src/lib/server/heartbeat', () => ({
      pingHealthcheck: vi.fn().mockResolvedValue(undefined)
    }));

    const { _scrapeTick } = await import('../../src/lib/server/scheduler');
    await _scrapeTick();
    expect(recomputeSpy).not.toHaveBeenCalled();
  });
});
