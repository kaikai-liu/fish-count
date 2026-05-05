// tests/integration/routes/explorer-granularity.test.ts
// Phase 8 Plan 04 — GRN-01 / GRN-02. End-to-end loader assertions for
// granularity URL parameter, default-per-range resolution, and the
// showGranularitySelector flag (D-37 hide rule).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../helpers/seedTestDb';

let _testDb: Database.Database | null = null;

vi.mock('../../../src/lib/db/client', () => ({
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

vi.mock('../../../src/lib/server/logger', () => ({
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
  const { boatId, landingId } = seedBoat(_testDb!, {
    boatName: 'Premier',
    landingName: "Fisherman's Landing"
  });
  const today = new Date();
  for (let daysAgo = 0; daysAgo < 90; daysAgo += 5) {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    seedTrip(_testDb!, {
      boatId,
      landingId,
      date: d.toISOString().slice(0, 10),
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
  }
  const mod = await import('../../../src/routes/explorer/+page.server.js');
  load = mod.load as typeof load;
});

afterEach(() => {
  if (_testDb) {
    _testDb.close();
    _testDb = null;
  }
});

describe('Explorer granularity (GRN-01)', () => {
  it('URL granularity=weekly → loader returns weekly buckets', async () => {
    const data = await load(makeEvent('ticker=boat&slug=premier&range=3m&granularity=weekly'));
    expect(data.granularity).toBe('weekly');
    // Polish pass: xAxis is now an array (multi-grid for embedded moon overlay).
    expect(data.chartOption.xAxis[0].type).toBe('time');
  });

  it('range=3m without granularity → default Daily', async () => {
    const data = await load(makeEvent('ticker=boat&slug=premier&range=3m'));
    expect(data.granularity).toBe('daily');
  });

  it('range=1y without granularity → default Weekly', async () => {
    const data = await load(makeEvent('ticker=boat&slug=premier&range=1y'));
    expect(data.granularity).toBe('weekly');
  });

  it('range=all without granularity → default Weekly', async () => {
    const data = await load(makeEvent('ticker=boat&slug=premier&range=all'));
    expect(data.granularity).toBe('weekly');
  });

  it('explicit granularity=monthly overrides default', async () => {
    const data = await load(makeEvent('ticker=boat&slug=premier&range=1y&granularity=monthly'));
    expect(data.granularity).toBe('monthly');
  });
});

describe('Explorer showGranularitySelector hide rule (D-37)', () => {
  it('range=1m → showGranularitySelector === false', async () => {
    const data = await load(makeEvent('ticker=boat&slug=premier&range=1m'));
    expect(data.showGranularitySelector).toBe(false);
  });

  it('range=3m → showGranularitySelector === true', async () => {
    const data = await load(makeEvent('ticker=boat&slug=premier&range=3m'));
    expect(data.showGranularitySelector).toBe(true);
  });

  it('range=1y → showGranularitySelector === true', async () => {
    const data = await load(makeEvent('ticker=boat&slug=premier&range=1y'));
    expect(data.showGranularitySelector).toBe(true);
  });

  it('range=all → showGranularitySelector === true', async () => {
    const data = await load(makeEvent('ticker=boat&slug=premier&range=all'));
    expect(data.showGranularitySelector).toBe(true);
  });
});
