// tests/forecast/horizon.test.ts
// FCT-07 / D-10: >30-day target_date → "horizon too far — historical data only".
// Rankings still computed (historical data is unaffected by the horizon cap).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeEvent(search: string) {
  return {
    url: new URL(`http://localhost/picker?${search}`),
    params: {} as Record<string, string>,
    setHeaders: vi.fn(),
    locals: {
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
      requestId: 'horizon-test'
    }
  } as any;
}

describe('picker horizon cap (FCT-07, D-10)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fc-forecast-horizon-'));
    process.env.DB_PATH = join(tmp, 'test.sqlite3');
    process.env.NODE_ENV = 'test';
    vi.resetModules();
  });

  afterEach(async () => {
    try {
      const { closeDb } = await import('../../src/lib/db/client');
      closeDb();
    } catch {
      /* ignore */
    }
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    delete process.env.DB_PATH;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  async function setupDb() {
    vi.doMock('$lib/shared/dates', async () => {
      const actual = await vi.importActual<typeof import('../../src/lib/shared/dates')>(
        '../../src/lib/shared/dates'
      );
      return { ...actual, today: () => '2026-05-15' };
    });
    const { getDb } = await import('../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../helpers/seedTestDb');
    const db = getDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: "Point Loma Sportfishing"
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2026-05-13',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
  }

  it('target_date > today + 30 → loader returns horizonTooFar: true and heatmap: null', async () => {
    await setupDb();
    const { load } = await import('../../src/routes/picker/+page.server');
    // 2026-05-15 + 31 days = 2026-06-15
    const event = makeEvent('species=yellowtail&tripType=Full+Day&date=2026-06-15');
    const result = await load(event);
    expect(result.horizonTooFar).toBe(true);
    expect(result.heatmap).toBeNull();
  });

  it('heatmap area copy is "horizon too far — historical data only" (verbatim, D-10)', async () => {
    await setupDb();
    const { load } = await import('../../src/routes/picker/+page.server');
    const event = makeEvent('species=yellowtail&tripType=Full+Day&date=2026-06-30');
    const result = await load(event);
    expect(result.heatmapHorizonMessage).toBe('horizon too far — historical data only');
  });

  it('target_date == today + 30 → normal heatmap path renders (NOT horizonTooFar)', async () => {
    await setupDb();
    const { load } = await import('../../src/routes/picker/+page.server');
    // 2026-05-15 + 30 days = 2026-06-14 (boundary case — daysBetween = 30, not > 30)
    const event = makeEvent('species=yellowtail&tripType=Full+Day&date=2026-06-14');
    const result = await load(event);
    expect(result.horizonTooFar).toBe(false);
    expect(result.heatmap).not.toBeNull();
    expect((result.heatmap as any[]).length).toBe(30);
    expect(result.heatmapHorizonMessage).toBeNull();
  });

  it('horizonTooFar response still includes rankings (historical data is unaffected)', async () => {
    await setupDb();
    const { load } = await import('../../src/routes/picker/+page.server');
    const event = makeEvent('species=yellowtail&tripType=Full+Day&date=2026-07-01');
    const result = await load(event);
    expect(result.horizonTooFar).toBe(true);
    // Rankings are computed from historical actuals; they must still be present.
    expect(result.rankings).not.toBeNull();
    expect(Array.isArray(result.rankings)).toBe(true);
  });
});
