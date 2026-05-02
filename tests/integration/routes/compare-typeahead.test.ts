// tests/integration/routes/compare-typeahead.test.ts
// Phase 8 Plan 04 — CMP-01 / D-24. Verifies the /compare loader returns the
// allBoats list (id + slug + display_name) needed for the <datalist>
// typeahead, and the page source uses datalist + list= attribute.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    url: new URL(`http://localhost/compare${qs ? '?' + qs : ''}`),
    setHeaders: vi.fn(),
    locals: { logger: { info: vi.fn() } }
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let load: (event: LoadEvent) => Promise<any>;

beforeEach(async () => {
  vi.resetModules();
  _testDb = openTestDb();
  // Seed several boats
  for (const name of ['Premier', 'Pacific Voyager', 'Pacific Queen', 'San Diego']) {
    const { boatId, landingId } = seedBoat(_testDb!, {
      boatName: name,
      landingName: "Fisherman's Landing"
    });
    seedTrip(_testDb!, {
      boatId,
      landingId,
      date: '2026-04-15',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
  }
  const mod = await import('../../../src/routes/compare/+page.server.js');
  load = mod.load as typeof load;
});

afterEach(() => {
  if (_testDb) {
    _testDb.close();
    _testDb = null;
  }
});

describe('Compare typeahead loader (CMP-01 / D-24)', () => {
  it('returns allBoats with id + slug + display_name', async () => {
    const data = await load(makeEvent(''));
    expect(Array.isArray(data.allBoats)).toBe(true);
    expect(data.allBoats.length).toBe(4);
    for (const b of data.allBoats) {
      expect(typeof b.id).toBe('number');
      expect(typeof b.slug).toBe('string');
      expect(typeof b.display_name).toBe('string');
    }
  });

  it('allBoats included on default state (no filters)', async () => {
    const data = await load(makeEvent(''));
    expect(data.allBoats.length).toBeGreaterThan(0);
    expect(data.guidance).toMatch(/Pick/);
  });

  it('allBoats included on resolved filters', async () => {
    const data = await load(
      makeEvent('tripType=Full Day&fromDate=2026-04-01&toDate=2026-04-30&boatIds=1&boatIds=2')
    );
    expect(data.allBoats.length).toBeGreaterThan(0);
  });
});

describe('Compare /compare page uses <datalist> typeahead pattern', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/routes/compare/+page.svelte'),
    'utf8'
  );

  it('emits a single <datalist id="boats-list">', () => {
    expect(source).toMatch(/<datalist\s+id="boats-list"/);
  });

  it('inputs reference list="boats-list"', () => {
    const matches = source.match(/list="boats-list"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('does NOT use the old comma-separated boat-IDs text input', () => {
    expect(source).not.toMatch(/Boat IDs \(comma-separated/);
    expect(source).not.toMatch(/formBoatIdsRaw/);
  });
});
