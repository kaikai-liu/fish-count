// tests/integration/explorer-routes.test.ts
// Integration tests for the /explorer route: full URL → DAL → option JSON path.
//
// Strategy: Use an in-memory DB populated with realistic test data,
// call the loader with various URLSearchParams permutations, and assert
// the full PageData return shape is correct.
//
// Test cases:
//   1. Empty URL → default boat resolved, chartOption with series, breakdownRows populated
//   2. ?ticker=boat&slug=<known>&range=3m → chartOption series count matches trip-type count
//   3. ?ticker=species&name=bluefin&range=1y → chartOption series count <= 6 (top-N cap)
//   4. ?ticker=landing&name=<known>&range=all → chartOption series count <= 6
//   5. ?ticker=boat&slug=<known>&range=custom&fromDate=2026-04-01&toDate=2026-04-30 → granularity=daily, expectedKeys length = 30
//   6. ?ticker=boat&slug=<known>&range=custom&fromDate=2030-01-01&toDate=2030-12-31 (future) → clamped, clampNote
//   7. ?ticker=boat&slug=does-not-exist → empty branch with heading "Boat not found"
//   8. Soft-assert performance: All-range loader call < 300ms (log only)
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { openTestDb } from '../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../helpers/seedTestDb';

// ---------------------------------------------------------------------------
// Mock getDb() to return our per-test in-memory DB
// ---------------------------------------------------------------------------
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

function setTestDb(db: Database.Database) {
  _testDb = db;
}

type LoadEvent = {
  url: URL;
  setHeaders: (h: Record<string, string>) => void;
  locals: { logger?: { info: (...args: unknown[]) => void } };
};

function makeEvent(searchParams: string): LoadEvent {
  const qs = searchParams ? '?' + searchParams : '';
  return {
    url: new URL(`http://localhost/explorer${qs}`),
    setHeaders: vi.fn(),
    locals: { logger: { info: vi.fn() } }
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let load: (event: LoadEvent) => Promise<any>;

beforeEach(async () => {
  const mod = await import('../../src/routes/explorer/+page.server.js');
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
// Populate a realistic DB: 3 boats, 2 landings, 4 species, 60 days of data
// ---------------------------------------------------------------------------
function populateDb(db: Database.Database): {
  boats: Array<{ boatId: number; landingId: number; slug: string; name: string }>;
  landingName: string;
  secondLandingName: string;
} {
  const landingName = "Fisherman's Landing";
  const secondLandingName = 'Point Loma Sportfishing';
  const boats: Array<{ boatId: number; landingId: number; slug: string; name: string }> = [];

  const boatDefs = [
    { name: 'Pacific Voyager', landing: landingName },
    { name: 'Old Glory', landing: landingName },
    { name: 'Prowler', landing: secondLandingName }
  ];

  for (const def of boatDefs) {
    const { boatId, landingId } = seedBoat(db, { boatName: def.name, landingName: def.landing });
    const slugRow = db.prepare('SELECT slug FROM boats WHERE source_name = ?').get(def.name) as { slug: string };
    boats.push({ boatId, landingId, slug: slugRow.slug, name: def.name });
  }

  const species = ['yellowtail', 'bluefin', 'dorado', 'rockfish'];
  const tripTypes = ['1/2 Day AM', 'Full Day'];

  // Seed 60 days of recent data (Mar-Apr 2026) across all boats
  for (let day = 1; day <= 30; day++) {
    const date = `2026-04-${String(day).padStart(2, '0')}`;
    for (const boat of boats) {
      for (const tripType of tripTypes) {
        for (const sp of species) {
          seedTrip(db, {
            boatId: boat.boatId,
            landingId: boat.landingId,
            date,
            tripType,
            species: sp,
            anglers: 10 + day,
            count: 5 + day
          });
        }
      }
    }
  }
  // March data for the 3m range
  for (let day = 1; day <= 30; day++) {
    const date = `2026-03-${String(day).padStart(2, '0')}`;
    for (const boat of boats) {
      seedTrip(db, {
        boatId: boat.boatId,
        landingId: boat.landingId,
        date,
        tripType: '1/2 Day AM',
        species: 'yellowtail',
        anglers: 10,
        count: 15
      });
    }
  }

  return { boats, landingName, secondLandingName };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/explorer integration: full URL → DAL → PageData', () => {

  it('1. empty URL → default boat resolved, chartOption with series, breakdownRows populated', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { boats } = populateDb(db);

    const result = await load(makeEvent(''));

    expect(result.empty).toBeNull();
    expect(result.chartOption).not.toBeNull();
    expect(result.chartOption.series.length).toBeGreaterThan(0);
    // Boat ticker → breakdownRows present
    expect(Array.isArray(result.breakdownRows)).toBe(true);
    expect((result.breakdownRows as unknown[]).length).toBeGreaterThan(0);
    // selectorOptions should list boats
    expect(result.selectorOptions.length).toBeGreaterThan(0);
    // filters.ticker should be 'boat'
    expect(result.filters.ticker).toBe('boat');
    // caption should mention trips
    expect(result.caption).toMatch(/Based on \d+ trips/);
  });

  it('2. ?ticker=boat&slug=<known>&range=3m → chartOption series matches trip-types', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { boats } = populateDb(db);
    const boat = boats[0];

    const result = await load(makeEvent(`ticker=boat&slug=${boat.slug}&range=3m`));

    expect(result.empty).toBeNull();
    expect(result.chartOption).not.toBeNull();
    // We seeded 2 trip types (1/2 Day AM, Full Day) → 2 series
    expect(result.chartOption.series.length).toBe(2);
    // Series names should contain verbatim trip type names
    const names = result.chartOption.series.map((s: { name: string }) => s.name.replace(/ · [\d,]+ trips?$/, ''));
    expect(names).toContain('1/2 Day AM');
    expect(names).toContain('Full Day');

    // EXPL-10 / D-16 / D-22: per-bucket n must be populated, not always 0
    expect(result.nByBucketBySeries).toBeDefined();
    const nMaps = Object.values(result.nByBucketBySeries) as Record<string, number>[];
    expect(nMaps.length).toBe(2);
    const allCounts = nMaps.flatMap((m) => Object.values(m));
    expect(allCounts.length).toBeGreaterThan(0);
    expect(allCounts.every((n) => Number.isInteger(n) && n >= 1)).toBe(true);
  });

  it('3. ?ticker=species&name=bluefin&range=1y → chartOption series count <= 6', async () => {
    const db = openTestDb();
    setTestDb(db);
    populateDb(db);

    const result = await load(makeEvent('ticker=species&name=bluefin&range=1y'));

    expect(result.empty).toBeNull();
    expect(result.chartOption).not.toBeNull();
    // At most 6 series (3 boats in our test data)
    expect(result.chartOption.series.length).toBeLessThanOrEqual(6);
    expect(result.chartOption.series.length).toBeGreaterThan(0);
    // No breakdown table for species ticker
    expect(result.breakdownRows).toBeNull();
  });

  it('4. ?ticker=landing&name=<known>&range=all → chartOption series count <= 6', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { landingName } = populateDb(db);

    const encodedName = encodeURIComponent(landingName);
    const result = await load(makeEvent(`ticker=landing&name=${encodedName}&range=all`));

    expect(result.empty).toBeNull();
    expect(result.chartOption).not.toBeNull();
    expect(result.chartOption.series.length).toBeLessThanOrEqual(6);
    expect(result.chartOption.series.length).toBeGreaterThan(0);
    // No breakdown table for landing ticker
    expect(result.breakdownRows).toBeNull();
  });

  it('5. custom range 30 days → granularity=daily, xAxis.data.length = 30', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { boats } = populateDb(db);
    const boat = boats[0];

    const result = await load(makeEvent(
      `ticker=boat&slug=${boat.slug}&range=custom&fromDate=2026-04-01&toDate=2026-04-30`
    ));

    expect(result.empty).toBeNull();
    expect(result.chartOption).not.toBeNull();
    // Phase 8 Plan 04 (AXS-01 / D-35): time-mode axis. Bucket count is now
    // exposed via bucketStartIsos (the loader's per-bucket ISO array).
    expect(result.chartOption.xAxis.type).toBe('time');
    expect(result.bucketStartIsos.length).toBe(30);
    expect(result.bucketStartIsos[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('6. future custom range → clamped to today, clampNote populated', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { boats } = populateDb(db);
    const boat = boats[0];

    const result = await load(makeEvent(
      `ticker=boat&slug=${boat.slug}&range=custom&fromDate=2030-01-01&toDate=2030-12-31`
    ));

    // Should have been clamped to available data window
    // clampNote should be set
    expect(result.clampNote).not.toBeNull();
    expect(result.clampNote).toBeTruthy();
  });

  it('7. unknown slug → empty state with "Boat not found" heading', async () => {
    const db = openTestDb();
    setTestDb(db);
    populateDb(db);

    const result = await load(makeEvent('ticker=boat&slug=does-not-exist&range=1y'));

    expect(result.empty).not.toBeNull();
    expect(result.empty.heading).toContain('Boat not found');
    expect(result.chartOption).toBeNull();
  });

  it('8. all-range loader call finishes in < 1000ms (soft performance assert)', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { boats } = populateDb(db);
    const boat = boats[0];

    const start = Date.now();
    const result = await load(makeEvent(`ticker=boat&slug=${boat.slug}&range=all`));
    const elapsed = Date.now() - start;

    // Soft assert: log warning if > 300ms, but don't fail
    if (elapsed > 300) {
      console.warn(`[perf] /explorer loader with range=all took ${elapsed}ms (target <300ms)`);
    }
    // Hard assert: must finish in < 1000ms
    expect(elapsed).toBeLessThan(1000);
    expect(result).toBeDefined();
  });

  it('chartOption has connectNulls:false and tooltip.axisPointer.type="cross"', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { boats } = populateDb(db);
    const boat = boats[0];

    const result = await load(makeEvent(`ticker=boat&slug=${boat.slug}&range=1y`));

    expect(result.empty).toBeNull();
    for (const s of result.chartOption.series) {
      expect(s.connectNulls).toBe(false);
    }
    expect(result.chartOption.tooltip.axisPointer.type).toBe('cross');
  });

  it('yAxis.name uses FISH_PER_ANGLER_AXIS constant value "fish/angler"', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { boats } = populateDb(db);
    const boat = boats[0];

    const result = await load(makeEvent(`ticker=boat&slug=${boat.slug}&range=1y`));

    expect(result.chartOption.yAxis.name).toBe('fish/angler');
  });
});
