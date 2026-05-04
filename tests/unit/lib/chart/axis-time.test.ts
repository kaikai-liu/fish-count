// tests/unit/lib/chart/axis-time.test.ts
// Phase 8 Plan 04 — AXS-01 / D-35. Verifies the loader emits time-axis
// chart options: xAxis.type='time', series data as [iso, value] pairs,
// bucketStartIsos array, no expectedKeys leak in the chart option.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { openTestDb } from '../../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../../helpers/seedTestDb';

let _testDb: Database.Database | null = null;

vi.mock('../../../../src/lib/db/client', () => ({
  getDb: () => {
    if (!_testDb) throw new Error('Test DB not initialized');
    return _testDb;
  },
  openDb: () => {
    if (!_testDb) throw new Error('Test DB not initialized');
    return _testDb;
  },
  closeDb: () => {}
}));

vi.mock('../../../../src/lib/server/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis()
  }
}));

type LoadEvent = {
  url: URL;
  setHeaders: (h: Record<string, string>) => void;
  locals: { logger?: { info: (...args: unknown[]) => void } };
};

function makeEvent(qs: string): LoadEvent {
  return {
    url: new URL(`http://localhost/explorer${qs ? '?' + qs : ''}`),
    setHeaders: vi.fn(),
    locals: { logger: { info: vi.fn() } }
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let load: (event: LoadEvent) => Promise<any>;

beforeEach(async () => {
  vi.resetModules();
  _testDb = openTestDb();
  // Seed enough data so the loader builds a non-empty chartOption.
  const { boatId, landingId } = seedBoat(_testDb!, {
    boatName: 'Premier',
    landingName: "Fisherman's Landing"
  });
  // Seed daily trips across a 1y window
  const today = new Date();
  for (let daysAgo = 0; daysAgo < 100; daysAgo += 7) {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    const iso = d.toISOString().slice(0, 10);
    seedTrip(_testDb!, {
      boatId,
      landingId,
      date: iso,
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
  }
  const mod = await import('../../../../src/routes/explorer/+page.server.js');
  load = mod.load as typeof load;
});

afterEach(() => {
  if (_testDb) {
    _testDb.close();
    _testDb = null;
  }
});

describe('Explorer chart x-axis migration (AXS-01 / D-35)', () => {
  it('emits xAxis.type === "time" (not "category")', async () => {
    const data = await load(makeEvent('ticker=boat&slug=premier&range=1y'));
    expect(data.chartOption).not.toBeNull();
    // Polish pass: xAxis is now an array (multi-grid layout supports the
    // embedded moon overlay). Catch axis is index 0.
    expect(data.chartOption.xAxis[0].type).toBe('time');
    expect('data' in data.chartOption.xAxis[0]).toBe(false);
  });

  it('emits series data as [iso, value] pairs', async () => {
    const data = await load(makeEvent('ticker=boat&slug=premier&range=1y'));
    const series = data.chartOption.series as Array<{ data: Array<[string, number | null]> }>;
    expect(series.length).toBeGreaterThan(0);
    const firstPoint = series[0].data[0];
    expect(Array.isArray(firstPoint)).toBe(true);
    expect(firstPoint.length).toBe(2);
    // Element 0 is an ISO date string YYYY-MM-DD
    expect(typeof firstPoint[0]).toBe('string');
    expect(firstPoint[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('emits bucketStartIsos array (one per bucket)', async () => {
    const data = await load(makeEvent('ticker=boat&slug=premier&range=1y'));
    expect(Array.isArray(data.bucketStartIsos)).toBe(true);
    expect(data.bucketStartIsos.length).toBeGreaterThan(0);
    for (const iso of data.bucketStartIsos) {
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('weekly granularity → bucket starts on Mondays (PT)', async () => {
    const data = await load(makeEvent('ticker=boat&slug=premier&range=1y&granularity=weekly'));
    expect(data.granularity).toBe('weekly');
    // Each ISO should land on a Monday — verify with Date.getUTCDay() === 1.
    for (const iso of data.bucketStartIsos as string[]) {
      const d = new Date(iso + 'T00:00:00Z');
      expect(d.getUTCDay()).toBe(1);
    }
  });

  it('monthly granularity → bucket starts on day 01', async () => {
    const data = await load(makeEvent('ticker=boat&slug=premier&range=1y&granularity=monthly'));
    expect(data.granularity).toBe('monthly');
    for (const iso of data.bucketStartIsos as string[]) {
      expect(iso).toMatch(/^\d{4}-\d{2}-01$/);
    }
  });

  it('moon overlay also uses xAxis.type = "time"', async () => {
    const data = await load(makeEvent('ticker=boat&slug=premier&range=1y&moon=1'));
    // Polish pass: moon is now an embedded grid (xAxis index 1) inside the
    // single chartOption. moonChartOption is no longer used.
    expect(data.chartOption.xAxis[1].type).toBe('time');
    // Moon series is the last series, with its own axis indices.
    const moonSeries = data.chartOption.series.find((s: { name?: string }) => s.name === '__moon__');
    expect(moonSeries).toBeDefined();
    expect(moonSeries.xAxisIndex).toBe(1);
    expect(moonSeries.yAxisIndex).toBe(1);
  });
});
