// tests/integration/routes/home.test.ts
// Phase 8 HOME-01..05 integration test: full URL → loader → PageData.
//
// Strategy mirrors tests/integration/explorer-routes.test.ts: vi.mock
// $lib/db/client to use an in-memory DB seeded by the test, call load()
// with various URLSearchParams permutations, assert PageData shape.
//
// Behaviors covered:
//   I1: empty URL → ≥1 section; sections sorted by trip_count DESC.
//   I2: ?foo=bar (any query string) returns the same payload — D-14 no URL state.
//   I3: empty DB → sections = []; loader returns the shape that triggers EmptyState.
//   I4: n=1 cells render — a boat with 1 trip in window appears in its section
//       with trip_count === 1 (D-11 honesty rule).
//   I5: Cache-Control header set to 'public, max-age=300' (D-15).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../helpers/seedTestDb';
import { addDays, today } from '../../../src/lib/shared/dates';

// ---------------------------------------------------------------------------
// Mock getDb() to return our per-test in-memory DB
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

function makeEvent(searchParams: string): LoadEvent & { _capturedHeaders: Record<string, string> } {
  const qs = searchParams ? '?' + searchParams : '';
  const captured: Record<string, string> = {};
  return {
    url: new URL(`http://localhost/${qs}`),
    setHeaders: (h: Record<string, string>) => Object.assign(captured, h),
    locals: { logger: { info: vi.fn() } },
    _capturedHeaders: captured
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let load: (event: LoadEvent) => Promise<any>;

beforeEach(async () => {
  const mod = await import('../../../src/routes/+page.server.js');
  load = mod.load as typeof load;
});

afterEach(() => {
  if (_testDb) {
    _testDb.close();
    _testDb = null;
  }
  vi.resetModules();
});

/**
 * Seed a viable past-7-day window for the home loader. We use today()/addDays()
 * so this works regardless of the calendar date the test is run on.
 */
function populateViableWindow(db: Database.Database) {
  const toDate = today();
  // Day strings: today, today-1, ... today-6 (the home loader uses past-7-days).
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => addDays(toDate, -d));
  const a = seedBoat(db, { boatName: 'Premier', landingName: "Fisherman's Landing" });
  const b = seedBoat(db, { boatName: 'Old Glory', landingName: "Fisherman's Landing" });
  const c = seedBoat(db, { boatName: 'Pacific Voyager', landingName: 'H&M Landing' });

  // Full Day: 5 (date, boat) tuples
  seedTrip(db, { boatId: a.boatId, landingId: a.landingId, date: days[1], tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 100 });
  seedTrip(db, { boatId: a.boatId, landingId: a.landingId, date: days[2], tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 100 });
  seedTrip(db, { boatId: b.boatId, landingId: b.landingId, date: days[1], tripType: 'Full Day', species: 'yellowtail', anglers: 25, count: 50 });
  seedTrip(db, { boatId: b.boatId, landingId: b.landingId, date: days[2], tripType: 'Full Day', species: 'yellowtail', anglers: 25, count: 50 });
  seedTrip(db, { boatId: c.boatId, landingId: c.landingId, date: days[1], tripType: 'Full Day', species: 'yellowtail', anglers: 25, count: 25 });

  // 1/2 Day AM: 6 (date, boat) tuples — should sort first by trip_count DESC
  for (let i = 0; i < 6; i++) {
    seedTrip(db, { boatId: a.boatId, landingId: a.landingId, date: days[i], tripType: '1/2 Day AM', species: 'rockfish', anglers: 15, count: 20 });
  }

  return { a, b, c, days };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/ home integration: full URL → loader → PageData', () => {
  it('I1: empty URL → ≥1 section, sections sorted by trip_count DESC', async () => {
    const db = openTestDb();
    setTestDb(db);
    populateViableWindow(db);

    const result = await load(makeEvent(''));

    expect(Array.isArray(result.sections)).toBe(true);
    expect(result.sections.length).toBeGreaterThanOrEqual(2);
    // 1/2 Day AM (6 trips) > Full Day (5 trips)
    expect(result.sections[0].canonical_trip_type).toBe('1/2 Day AM');
    expect(result.sections[1].canonical_trip_type).toBe('Full Day');
    expect(result.sections[0].trip_count).toBeGreaterThanOrEqual(result.sections[1].trip_count);
  });

  it('I2: D-14 — query string is ignored; same payload as bare /', async () => {
    const db = openTestDb();
    setTestDb(db);
    populateViableWindow(db);

    const bare = await load(makeEvent(''));
    const withParams = await load(makeEvent('foo=bar&baz=quux'));

    expect(withParams.sections.length).toBe(bare.sections.length);
    expect(withParams.fromDate).toBe(bare.fromDate);
    expect(withParams.toDate).toBe(bare.toDate);
    expect(withParams.sections.map((s: { canonical_trip_type: string }) => s.canonical_trip_type)).toEqual(
      bare.sections.map((s: { canonical_trip_type: string }) => s.canonical_trip_type)
    );
  });

  it('I3: empty DB → sections === [] (UI renders EmptyState)', async () => {
    const db = openTestDb();
    setTestDb(db);
    // No seed data — empty catch_reports.

    const result = await load(makeEvent(''));
    expect(result.sections).toEqual([]);
    expect(result.fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.toDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('I4: n=1 cells render — a boat with one trip appears with trip_count=1', async () => {
    const db = openTestDb();
    setTestDb(db);
    const { days } = populateViableWindow(db);
    // Add a one-shot Full Day trip on a brand-new boat in the same section.
    const oneShot = seedBoat(db, { boatName: 'OneShot', landingName: "Fisherman's Landing" });
    seedTrip(db, { boatId: oneShot.boatId, landingId: oneShot.landingId, date: days[0], tripType: 'Full Day', species: 'yellowtail', anglers: 5, count: 50 });

    const result = await load(makeEvent(''));
    const fullDay = result.sections.find((s: { canonical_trip_type: string }) => s.canonical_trip_type === 'Full Day');
    expect(fullDay).toBeDefined();
    const oneShotRow = fullDay.rows.find((r: { boat_display_name: string }) => r.boat_display_name === 'OneShot');
    expect(oneShotRow).toBeDefined();
    expect(oneShotRow.trip_count).toBe(1);
    // 50 / 5 = 10 fpa
    expect(oneShotRow.fpa).toBeCloseTo(10, 3);
  });

  it('I5: Cache-Control header set to public, max-age=300 (D-15)', async () => {
    const db = openTestDb();
    setTestDb(db);
    populateViableWindow(db);

    const event = makeEvent('');
    await load(event);
    expect(event._capturedHeaders['cache-control']).toBe('public, max-age=300');
  });
});
