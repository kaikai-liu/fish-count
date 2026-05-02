// tests/integration/scheduler.test.ts
// Phase 8 Plan 03 (RTR-03 / D-19) — scheduler retirement guard.
//
// Asserts that _scrapeTick no longer hooks the v1 forecast recompute pipeline:
//   - the scheduler module does NOT import from $lib/forecast/* (or any forecast/compute path)
//   - a successful scrape tick does NOT throw a "$lib/forecast/compute" resolution error
//   - the scheduler module imports list is the post-retirement set (kill-switch,
//     pipeline, sla, heartbeat, dates, logger, croner) — no recomputeForecasts symbol
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCHEDULER_PATH = resolve(__dirname, '../../src/lib/server/scheduler.ts');

describe('scheduler — Phase 8 Plan 03 forecast retirement (RTR-03, D-19)', () => {
  it('scheduler.ts does NOT import from $lib/forecast/*', () => {
    const source = readFileSync(SCHEDULER_PATH, 'utf8');
    // Drop comment lines so historical retire-marker comments don't trip the assertion.
    const codeOnly = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(codeOnly).not.toMatch(/from\s+['"]\$lib\/forecast/);
    expect(codeOnly).not.toMatch(/recomputeForecasts/);
  });

  it('scheduler.ts does NOT import from $lib/db/forecasts', () => {
    const source = readFileSync(SCHEDULER_PATH, 'utf8');
    const codeOnly = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(codeOnly).not.toMatch(/from\s+['"]\$lib\/db\/forecasts/);
  });
});

describe('scheduler _scrapeTick — runs without forecast hook (RTR-03 runtime)', () => {
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
    vi.doUnmock('../../src/lib/scraper/sla');
    vi.doUnmock('../../src/lib/server/kill-switch');
  });

  it('outcome="success" tick completes without resolving any $lib/forecast module', async () => {
    process.env.SCRAPER_ENABLED = 'true';
    process.env.FIRST_SCRAPE_OK = 'true';

    const pingHealthcheck = vi.fn().mockResolvedValue(undefined);
    const scrapeDate = vi.fn().mockResolvedValue({
      outcome: 'success',
      rowsIngested: 12,
      runId: 'r-success'
    });
    const checkSlaAndAlert = vi.fn().mockResolvedValue(undefined);

    vi.doMock('../../src/lib/server/heartbeat', () => ({ pingHealthcheck }));
    vi.doMock('../../src/lib/scraper/pipeline', () => ({ scrapeDate }));
    vi.doMock('../../src/lib/scraper/sla', () => ({ checkSlaAndAlert }));
    vi.doMock('../../src/lib/server/kill-switch', () => ({ scrapingEnabled: () => true }));

    // If scheduler.ts still imported $lib/forecast/compute, the import would
    // fail at module-load time (the file no longer exists) — this would throw
    // a MODULE_NOT_FOUND before _scrapeTick ever runs.
    const mod = await import('../../src/lib/server/scheduler');
    await expect(mod._scrapeTick()).resolves.toBeUndefined();

    expect(scrapeDate).toHaveBeenCalledTimes(1);
    expect(checkSlaAndAlert).toHaveBeenCalledTimes(1);
    // pingHealthcheck bookends still fire (start + success); 'success' outcome
    // → ping('success') per scheduler.ts:90.
    const statuses = pingHealthcheck.mock.calls.map((c) => c[0]);
    expect(statuses).toContain('start');
    expect(statuses).toContain('success');
  });

  it('outcome="empty" tick completes without invoking forecast hook (D-14 retired)', async () => {
    // In v1, outcome='empty' triggered recomputeForecasts. After Plan 03 it must not.
    process.env.SCRAPER_ENABLED = 'true';
    process.env.FIRST_SCRAPE_OK = 'true';

    const pingHealthcheck = vi.fn().mockResolvedValue(undefined);
    const scrapeDate = vi.fn().mockResolvedValue({
      outcome: 'empty',
      rowsIngested: 0,
      runId: 'r-empty'
    });

    vi.doMock('../../src/lib/server/heartbeat', () => ({ pingHealthcheck }));
    vi.doMock('../../src/lib/scraper/pipeline', () => ({ scrapeDate }));
    vi.doMock('../../src/lib/scraper/sla', () => ({
      checkSlaAndAlert: vi.fn().mockResolvedValue(undefined)
    }));
    vi.doMock('../../src/lib/server/kill-switch', () => ({ scrapingEnabled: () => true }));

    const mod = await import('../../src/lib/server/scheduler');
    await expect(mod._scrapeTick()).resolves.toBeUndefined();
    expect(scrapeDate).toHaveBeenCalledTimes(1);
  });
});
