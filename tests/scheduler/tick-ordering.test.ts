// tests/scheduler/tick-ordering.test.ts
// WARNING-4 hard test: guarantees the kill-switch gate short-circuits the
// heartbeat tick BEFORE any pingHealthcheck() call. Complements the Task-2
// awk-based file-order smoke (which only verifies source text ordering).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('scheduler _heartbeatTick — kill-switch ordering (OPS-04 ∩ OPS-05)', () => {
  const originalEnv = process.env.SCRAPER_ENABLED;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SCRAPER_ENABLED;
    else process.env.SCRAPER_ENABLED = originalEnv;
    vi.restoreAllMocks();
    vi.doUnmock('../../src/lib/server/heartbeat');
  });

  it('does NOT call pingHealthcheck when SCRAPER_ENABLED=false', async () => {
    process.env.SCRAPER_ENABLED = 'false';

    // Mock the heartbeat module so we can assert on the spy. Must be mocked
    // BEFORE importing scheduler (which imports heartbeat at module load).
    const pingHealthcheck = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../../src/lib/server/heartbeat', () => ({
      pingHealthcheck
    }));

    const mod = await import('../../src/lib/server/scheduler');
    await mod._heartbeatTick();

    // Hard assertion: zero pings fired — not "not called with 'start'",
    // but never called at all. The gate ran first and returned.
    expect(pingHealthcheck).not.toHaveBeenCalled();
    expect(pingHealthcheck).toHaveBeenCalledTimes(0);
  });

  it('DOES call pingHealthcheck("start") when SCRAPER_ENABLED is unset (fail-open default)', async () => {
    delete process.env.SCRAPER_ENABLED;

    const pingHealthcheck = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../../src/lib/server/heartbeat', () => ({
      pingHealthcheck
    }));

    const mod = await import('../../src/lib/server/scheduler');
    await mod._heartbeatTick();

    // At least one ping fired, and the first ping was 'start' (proves the
    // start/success/fail sequence started correctly post-gate).
    expect(pingHealthcheck).toHaveBeenCalled();
    const firstCallArg = pingHealthcheck.mock.calls[0]?.[0];
    expect(firstCallArg).toBe('start');
  });

  it('DOES call pingHealthcheck when SCRAPER_ENABLED="true" (explicit enable)', async () => {
    process.env.SCRAPER_ENABLED = 'true';

    const pingHealthcheck = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../../src/lib/server/heartbeat', () => ({
      pingHealthcheck
    }));

    const mod = await import('../../src/lib/server/scheduler');
    await mod._heartbeatTick();

    expect(pingHealthcheck).toHaveBeenCalled();
  });
});
