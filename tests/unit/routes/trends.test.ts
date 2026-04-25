// tests/unit/routes/trends.test.ts
// Unit tests for src/routes/trends/+page.server.ts load() function.
//
// Strategy: mock $lib/db/client so getDb() returns a fresh in-memory DB,
// then call the exported load() with a constructed RequestEvent-like object.
//
// Required cases (per Plan 02-06 Task 1):
//   1. load with no params → guidance set, chartOption null
//   2. load with species + no tripType → guidance set
//   3. load with ?species=yellowtail&tripType=Long Range&range=1y → chartOption set,
//      granularity 'monthly' (auto from >6mo)
//   4. load with ?...&range=3mo → granularity 'weekly'
//   5. load with ?granularity=monthly&range=3mo → granularity 'monthly' (explicit overrides)
//   6. load with ?...&boatId=1 (seeded boat) → chartOption.series[0].name includes boat name
//   7. Gap-aware: seed only 2 weeks in a 12-week window → 12 data points with 10 nulls + 2 numbers
//   8. ISO-week boundary: seed catch_report on 2024-12-30; query weekly; "2025-W01" in xAxis.data
//   9. chartOption.yAxis.name === 'fish/angler' (verifies FISH_PER_ANGLER_AXIS constant)
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/lib/db/migrations';
import { openTestDb } from '../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../helpers/seedTestDb';

// ---------------------------------------------------------------------------
// Module mock: intercept $lib/db/client so every call to getDb() returns our
// per-test in-memory DB instance.
// ---------------------------------------------------------------------------

let _testDb: Database.Database | null = null;

vi.mock('../../../src/lib/db/client', () => ({
  getDb: () => {
    if (!_testDb) throw new Error('Test DB not initialized — call setTestDb first');
    return _testDb;
  },
  openDb: () => {
    if (!_testDb) throw new Error('Test DB not initialized');
    return _testDb;
  },
  closeDb: () => {}
}));

// Also mock $lib/server/logger to avoid pino initialization in test environment.
vi.mock('../../../src/lib/server/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis()
  }
}));

function setTestDb(db: Database.Database) {
  _testDb = db;
}

// ---------------------------------------------------------------------------
// Helper: build a minimal RequestEvent-like object for the load() function.
// ---------------------------------------------------------------------------
type LoadEvent = {
  url: URL;
  setHeaders: (h: Record<string, string>) => void;
  locals: { logger?: { info: (...args: unknown[]) => void } };
};

function makeEvent(searchParams: string): LoadEvent {
  return {
    url: new URL(`http://localhost/trends${searchParams ? '?' + searchParams : ''}`),
    setHeaders: vi.fn(),
    locals: { logger: { info: vi.fn() } }
  };
}

// ---------------------------------------------------------------------------
// Import the load function AFTER mocks are set up.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let load: (event: LoadEvent) => Promise<any>;

beforeEach(async () => {
  // Dynamically import after vi.mock is established so the mock is active.
  const mod = await import('../../../src/routes/trends/+page.server.js');
  load = mod.load as typeof load;
});

afterEach(() => {
  if (_testDb) {
    _testDb.close();
    _testDb = null;
  }
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/trends +page.server.ts load()', () => {
  it('1. no params → guidance set, chartOption null', async () => {
    const db = openTestDb();
    setTestDb(db);

    const result = await load(makeEvent(''));

    expect(result.guidance).toBeTruthy();
    expect(result.chartOption).toBeNull();
    expect(result.filters).toBeNull();
  });

  it('2. species only, no tripType → guidance set', async () => {
    const db = openTestDb();
    setTestDb(db);

    const result = await load(makeEvent('species=yellowtail'));

    expect(result.guidance).toBeTruthy();
    expect(result.chartOption).toBeNull();
  });

  it('3. species + tripType + range=1y → chartOption set, granularity monthly (auto >6mo)', async () => {
    const db = openTestDb();
    setTestDb(db);

    const result = await load(
      makeEvent('species=yellowtail&tripType=Long Range&range=1y')
    );

    expect(result.guidance).toBeNull();
    expect(result.chartOption).not.toBeNull();
    expect(result.chartOption.series).toHaveLength(1);
    expect(result.granularity).toBe('monthly');
  });

  it('4. range=3mo → granularity weekly (auto ≤6mo)', async () => {
    const db = openTestDb();
    setTestDb(db);

    const result = await load(
      makeEvent('species=yellowtail&tripType=Long Range&range=3mo')
    );

    expect(result.granularity).toBe('weekly');
  });

  it('5. explicit granularity=monthly with range=3mo → monthly overrides auto', async () => {
    const db = openTestDb();
    setTestDb(db);

    const result = await load(
      makeEvent('species=yellowtail&tripType=Long Range&range=3mo&granularity=monthly')
    );

    expect(result.granularity).toBe('monthly');
  });

  it('6. boatId=1 (seeded boat) → chartOption.series[0].name includes boat display_name', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Pacific Queen',
      landingName: 'Point Loma Sportfishing'
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2025-07-01',
      tripType: 'Long Range',
      species: 'yellowtail',
      anglers: 20,
      count: 40
    });

    const result = await load(
      makeEvent(`species=yellowtail&tripType=Long Range&range=1y&boatId=${boatId}`)
    );

    expect(result.chartOption).not.toBeNull();
    expect(result.chartOption.series[0].name).toContain('Pacific Queen');
    expect(result.boatName).toBe('Pacific Queen');
  });

  it('7. gap-aware: seed 2 weeks in a 12-week window → ≥12 data points, ≥2 non-null + gaps as null not zero', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Intrepid',
      landingName: 'H&M Landing'
    });

    // Seed data in ISO weeks within the last 90 days (range=3mo from today 2026-04-25).
    // 90 days back = ~2026-01-25. Use weeks at ~2026-02-02 and ~2026-03-02 (both well within window).
    seedTrip(db, {
      boatId,
      landingId,
      date: '2026-02-02', // Monday in ISO week 2026-W06
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2026-03-02', // Monday in ISO week 2026-W10
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 18,
      count: 24
    });

    // Use range=3mo (90 days) with explicit weekly granularity.
    // With 90 days = ~13 weeks, we expect ≥12 buckets, of which only 2 have non-null data.
    const result = await load(
      makeEvent('species=yellowtail&tripType=Full Day&range=3mo&granularity=weekly')
    );

    expect(result.chartOption).not.toBeNull();
    const dataPoints: (number | null)[] = result.chartOption.series[0].data;
    expect(dataPoints.length).toBeGreaterThanOrEqual(12);

    const nullCount = dataPoints.filter((v: number | null) => v === null).length;
    const numberCount = dataPoints.filter((v: number | null) => typeof v === 'number').length;

    // At least 2 data points should be non-null (our seeded weeks)
    expect(numberCount).toBeGreaterThanOrEqual(2);
    // The rest should be null gaps (not zeros)
    expect(nullCount).toBeGreaterThan(0);

    // Verify no zeros appear (D-27 gap-aware: missing = null, NOT zero)
    const zeroCount = dataPoints.filter((v: number | null) => v === 0).length;
    expect(zeroCount).toBe(0);
  });

  it('8. ISO-week boundary: 2024-12-30 → "2025-W01" in xAxis.data with non-null value', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Fisherman\'s Landing'
    });

    // 2024-12-30 is in ISO week 2025-W01 (the Thursday rule)
    seedTrip(db, {
      boatId,
      landingId,
      date: '2024-12-30',
      tripType: '3/4 Day',
      species: 'yellowtail',
      anglers: 25,
      count: 50
    });

    // Query weekly over Dec 2024 – Jan 2025 by using range=all with explicit weekly.
    // We only need to check that the bucket key "2025-W01" exists in xAxis.data
    // and has a non-null value in series[0].data.
    const result = await load(
      makeEvent('species=yellowtail&tripType=3/4 Day&range=all&granularity=weekly')
    );

    expect(result.chartOption).not.toBeNull();
    const xAxisData: string[] = result.chartOption.xAxis.data;
    const seriesData: (number | null)[] = result.chartOption.series[0].data;

    const idx = xAxisData.indexOf('2025-W01');
    expect(idx).toBeGreaterThanOrEqual(0);
    // The value at that index should be non-null (50 fish / 25 anglers = 2.0)
    expect(seriesData[idx]).toBeCloseTo(2.0, 2);
  });

  it("9. chartOption.yAxis.name === 'fish/angler' (FISH_PER_ANGLER_AXIS resolved)", async () => {
    const db = openTestDb();
    setTestDb(db);

    const result = await load(
      makeEvent('species=yellowtail&tripType=Long Range&range=3mo')
    );

    expect(result.chartOption).not.toBeNull();
    expect(result.chartOption.yAxis.name).toBe('fish/angler');
  });

  it('filterOptions.tripTypes and speciesList are returned even on guidance state', async () => {
    const db = openTestDb();
    setTestDb(db);

    const result = await load(makeEvent(''));

    expect(result.filterOptions).toBeDefined();
    expect(Array.isArray(result.filterOptions.tripTypes)).toBe(true);
    expect(Array.isArray(result.filterOptions.speciesList)).toBe(true);
  });

  it('connectNulls is false on the series (D-27 gap-aware)', async () => {
    const db = openTestDb();
    setTestDb(db);

    const result = await load(
      makeEvent('species=yellowtail&tripType=Long Range&range=3mo')
    );

    expect(result.chartOption).not.toBeNull();
    expect(result.chartOption.series[0].connectNulls).toBe(false);
  });
});
