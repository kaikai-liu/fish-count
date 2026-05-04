// tests/integration/routes/explorer-moon.test.ts
// Phase 7 integration tests for the moon overlay (MOON-01, MOON-02).
//
// Asserts:
//   - Off-state byte-identity guarantee (UI-SPEC §Off-state Guarantee):
//     `/explorer` (clean URL) and `/explorer?moon=0` produce moonChartOption: null
//   - Garbage rejection: `?moon=garbage` → safeParse rejects → defaults to off
//   - On-state alignment: moonChartOption.series[0].data.length === catch xAxis.data.length
//   - Markers reposition without re-fetch: 1y → 6m recomputes via loader (no client fetch)
//   - moon flag persists across ticker switch
//
// Strategy mirrors tests/integration/explorer-routes.test.ts: in-memory DB seeded with
// realistic data, call load() directly with controlled URLSearchParams, assert PageData.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../helpers/seedTestDb';

// ---------------------------------------------------------------------------
// Mock getDb() to return our per-test in-memory DB (same pattern as explorer-routes)
// ---------------------------------------------------------------------------
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
  const mod = await import('../../../src/routes/explorer/+page.server.js');
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
// Seed: same approach as explorer-routes.test.ts — 3 boats, 4 species, 60 days
// ---------------------------------------------------------------------------
function populateDb(db: Database.Database): {
  boats: Array<{ boatId: number; landingId: number; slug: string; name: string }>;
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
    const slugRow = db
      .prepare('SELECT slug FROM boats WHERE source_name = ?')
      .get(def.name) as { slug: string };
    boats.push({ boatId, landingId, slug: slugRow.slug, name: def.name });
  }

  const species = ['yellowtail', 'bluefin', 'dorado', 'rockfish'];
  const tripTypes = ['1/2 Day AM', 'Full Day'];

  // Recent data: April 2026 (1y default range will see this), and a year of monthly data
  // to ensure 6m / 1y produce different bucket counts.
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
  // Older months so 1y has a wider window than 6m
  const olderMonths = [
    '2025-06',
    '2025-08',
    '2025-10',
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03'
  ];
  for (const ym of olderMonths) {
    for (let day = 1; day <= 28; day += 7) {
      const date = `${ym}-${String(day).padStart(2, '0')}`;
      for (const boat of boats) {
        seedTrip(db, {
          boatId: boat.boatId,
          landingId: boat.landingId,
          date,
          tripType: '1/2 Day AM',
          species: 'yellowtail',
          anglers: 10,
          count: 12
        });
      }
    }
  }

  return { boats };
}

// ---------------------------------------------------------------------------
// Tests — Phase 7 moon overlay
// ---------------------------------------------------------------------------

describe('GET /explorer — moon overlay (Phase 7)', () => {
  it('moonChartOption is null on clean URL (default off)', async () => {
    const db = openTestDb();
    setTestDb(db);
    populateDb(db);

    const data = await load(makeEvent(''));

    expect(data.moonChartOption).toBeNull();
    expect(data.filters.moon).toBe(false);
  });

  it('moonChartOption is null when ?moon=0', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { boats } = populateDb(db);
    const boat = boats[0];

    const data = await load(makeEvent(`ticker=boat&slug=${boat.slug}&range=1y&moon=0`));

    expect(data.moonChartOption).toBeNull();
    expect(data.filters.moon).toBe(false);
  });

  it('falls back to default-off when ?moon=garbage', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { boats } = populateDb(db);
    const boat = boats[0];

    const data = await load(makeEvent(`ticker=boat&slug=${boat.slug}&range=1y&moon=garbage`));

    expect(data.moonChartOption).toBeNull();
    expect(data.filters.moon).toBe(false);
  });

  // Polish pass: moon overlay is now an embedded grid inside chartOption
  // (named series `__moon__` with xAxisIndex=1). moonChartOption is always null.
  function getMoonSeries(data: { chartOption: { series: Array<{ name?: string; data?: unknown[] }> } }) {
    return data.chartOption.series.find((s) => s.name === '__moon__');
  }

  it('moon series is embedded in chartOption when ?moon=1 (daily resolution)', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { boats } = populateDb(db);
    const boat = boats[0];

    const data = await load(makeEvent(`ticker=boat&slug=${boat.slug}&range=1y&moon=1`));

    expect(data.filters.moon).toBe(true);
    const moon = getMoonSeries(data);
    expect(moon).toBeDefined();
    // Polish pass: moon overlay renders at DAILY resolution regardless of
    // the catch chart's bucket granularity. For 1y → ~365-366 daily samples.
    expect(moon!.data!.length).toBeGreaterThanOrEqual(365);
    expect(moon!.data!.length).toBeLessThanOrEqual(367);
  });

  it('moon series is embedded when ?moon=true (alternate literal)', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { boats } = populateDb(db);
    const boat = boats[0];

    const data = await load(makeEvent(`ticker=boat&slug=${boat.slug}&range=1y&moon=true`));

    expect(data.filters.moon).toBe(true);
    expect(getMoonSeries(data)).toBeDefined();
  });

  it('moon series re-samples when range changes (daily resolution)', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { boats } = populateDb(db);
    const boat = boats[0];

    const oneYear = await load(makeEvent(`ticker=boat&slug=${boat.slug}&range=1y&moon=1`));
    const sixMonth = await load(makeEvent(`ticker=boat&slug=${boat.slug}&range=6m&moon=1`));

    const oneYearMoon = getMoonSeries(oneYear)!.data!.length;
    const sixMonthMoon = getMoonSeries(sixMonth)!.data!.length;
    // Polish pass: moon is daily-only, so the day count differs by date range.
    // 1y has ~365 daily samples, 6m has ~180. Strict greater-than holds.
    expect(oneYearMoon).toBeGreaterThan(sixMonthMoon);
    expect(oneYearMoon).toBeGreaterThanOrEqual(365);
    expect(sixMonthMoon).toBeGreaterThanOrEqual(180);
  });

  it('moon flag persists when ticker changes', async () => {
    const db = openTestDb();
    setTestDb(db);
    populateDb(db);

    const boat = await load(makeEvent('ticker=boat&moon=1'));
    expect(boat.filters.moon).toBe(true);

    const species = await load(makeEvent('ticker=species&moon=1'));
    expect(species.filters.moon).toBe(true);
  });
});
