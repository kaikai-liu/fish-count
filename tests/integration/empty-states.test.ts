// tests/integration/empty-states.test.ts
// Phase 8 Plan 04 — POL-03 / D-33. Verifies the explorer loader picks the
// right empty-state variant based on the new `noHistoryEver` signal.
//
// Two scenarios on the same in-memory DB:
//   1. Boat that has NEVER been scraped (slug points to nothing) → loader
//      returns the "no scraped trips yet" copy and noHistoryEver=true.
//   2. Boat that exists with old data, queried in a fresh-only range →
//      loader returns the "no trips in this range" copy and
//      noHistoryEver=false.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { openTestDb } from '../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../helpers/seedTestDb';
import { today } from '../../src/lib/shared/dates';

let _testDb: Database.Database | null = null;

vi.mock('../../src/lib/db/client', () => ({
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

vi.mock('../../src/lib/server/logger', () => ({
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
  const mod = await import('../../src/routes/explorer/+page.server.js');
  load = mod.load as typeof load;
});

afterEach(() => {
  if (_testDb) {
    _testDb.close();
    _testDb = null;
  }
});

describe('Explorer empty-state variants (POL-03 / D-33)', () => {
  it('boat slug with no DB row → "Boat not found" + noHistoryEver=true', async () => {
    // Seed unrelated data so the loader has SOME default boat to populate
    // selectorOptions with, but the requested slug doesn't exist.
    const { boatId, landingId } = seedBoat(_testDb!, {
      boatName: 'Premier',
      landingName: "Fisherman's Landing"
    });
    seedTrip(_testDb!, {
      boatId,
      landingId,
      date: '2026-04-01',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });

    const data = await load(makeEvent('ticker=boat&slug=no-such-boat'));
    expect(data.empty).not.toBeNull();
    expect(data.empty.heading).toBe('Boat not found');
    expect(data.noHistoryEver).toBe(true);
  });

  it('boat with ever-history but no rows in the requested range → "no history in range" copy', async () => {
    // Seed Premier with a single old trip.
    const { boatId, landingId } = seedBoat(_testDb!, {
      boatName: 'Premier',
      landingName: "Fisherman's Landing"
    });
    seedTrip(_testDb!, {
      boatId,
      landingId,
      // Way before any plausible default range — guarantees zero in-range rows.
      date: '2020-01-15',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });

    // Query last-1m range — will have zero rows since the only seeded trip is
    // from 2020. The "no history in range" variant should fire.
    const data = await load(makeEvent('ticker=boat&slug=premier&range=1m'));
    expect(data.empty).not.toBeNull();
    expect(data.empty.heading).toMatch(/^No Premier trips in this range$/);
    expect(data.noHistoryEver).toBe(false);
  });

  it('boat with current-range data → no empty state', async () => {
    const { boatId, landingId } = seedBoat(_testDb!, {
      boatName: 'Premier',
      landingName: "Fisherman's Landing"
    });
    // Trip from "today" — should be in the 1m range. Use the PT-canonical
    // today() so this passes regardless of UTC rollover state.
    seedTrip(_testDb!, {
      boatId,
      landingId,
      date: today(),
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });

    const data = await load(makeEvent('ticker=boat&slug=premier&range=1m'));
    expect(data.empty).toBeNull();
    expect(data.noHistoryEver).toBe(false);
    expect(data.chartOption).not.toBeNull();
  });
});
