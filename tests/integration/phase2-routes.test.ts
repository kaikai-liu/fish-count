// tests/integration/phase2-routes.test.ts
// Plan 02-07 Task 2 — cross-route smoke test against seed-fixture data.
//
// Seeds a tmp DB once via seed-dev-db.ts main(), then dynamically imports each
// route's load() function and asserts it returns the expected shape against
// realistic data.
//
// Isolation pattern from PATTERNS.md §tests/unit/routes/*.test.ts:
//   - mkdtempSync + process.env.DB_PATH = tmp path
//   - vi.resetModules() in beforeAll so the DB singleton rebinds
//   - closeDb() in afterAll
//
// Tested routes (all Phase 2 data-showing pages):
//   / (home)   /date/[d]   /picker   /boats/[id]   /compare   /trends   /about
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Use a fixed seed range so the tests are deterministic.
// 90 days of data gives enough for picker, trends, compare to have non-empty results.
const SEED_FROM = '2024-01-01';
const SEED_TO = '2024-04-01';

// A known past date well within the seed range.
const KNOWN_PAST_DATE = '2024-02-15';

let tmp: string;
let originalEnv: Record<string, string | undefined>;

// Resolved after seeding: actual boat ids and trip types from the seeded DB.
let firstBoatId: number;
let secondBoatId: number;
let firstTripType: string;
let firstSpecies: string;

function makeEvent(pathname = '/', search = '') {
  return {
    url: new URL(`http://localhost${pathname}${search ? '?' + search : ''}`),
    params: {} as Record<string, string>,
    setHeaders: vi.fn(),
    locals: {
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
      requestId: 'integration-test'
    }
  } as any;
}

describe('Phase 2 routes — integration smoke (seed-fixture data)', () => {
  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'fc-intg-'));
    originalEnv = { DB_PATH: process.env.DB_PATH, NODE_ENV: process.env.NODE_ENV };
    process.env.DB_PATH = join(tmp, 'intg.sqlite3');
    process.env.NODE_ENV = 'test';
    vi.resetModules();

    // Seed the DB with 90 days of fixture replay.
    const { main: seed } = await import('../../scripts/seed-dev-db');
    const code = await seed(['--from', SEED_FROM, '--to', SEED_TO, '--quiet']);
    expect(code, 'seed-dev-db should exit 0').toBe(0);

    // Resolve boat ids and trip types for later assertions.
    const { getDb } = await import('../../src/lib/db/client');
    const db = getDb();

    const boatRows = db
      .prepare(`SELECT id FROM boats ORDER BY id ASC LIMIT 2`)
      .all() as Array<{ id: number }>;
    expect(boatRows.length, 'should have seeded at least 2 boats').toBeGreaterThanOrEqual(2);
    firstBoatId = boatRows[0].id;
    secondBoatId = boatRows[1].id;

    const tripTypeRow = db
      .prepare(`SELECT trip_type FROM catch_reports GROUP BY trip_type ORDER BY COUNT(*) DESC LIMIT 1`)
      .get() as { trip_type: string } | undefined;
    firstTripType = tripTypeRow?.trip_type ?? '1/2 Day AM';

    const speciesRow = db
      .prepare(`SELECT species FROM catch_reports GROUP BY species ORDER BY COUNT(*) DESC LIMIT 1`)
      .get() as { species: string } | undefined;
    firstSpecies = speciesRow?.species ?? 'yellowtail';
  });

  afterAll(async () => {
    try {
      const { closeDb } = await import('../../src/lib/db/client');
      closeDb();
    } catch {
      // ignore
    }
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(tmp, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // ── / (home) ──────────────────────────────────────────────────────────────

  it('/ — load() returns required shape keys', async () => {
    const { load } = await import('../../src/routes/+page.server');
    const event = makeEvent('/');
    const result = await load(event);
    expect(result).toHaveProperty('rows');
    expect(result).toHaveProperty('date');
    expect(result).toHaveProperty('isProvisional');
    expect(result).toHaveProperty('lastScrapedLabel');
    expect(result).toHaveProperty('filters');
    expect(result).toHaveProperty('filterOptions');
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.isProvisional).toBe(true); // today is always provisional
  });

  it('/ — setHeaders called with cache-control: public, max-age=60', async () => {
    const { load } = await import('../../src/routes/+page.server');
    const event = makeEvent('/');
    await load(event);
    expect(event.setHeaders).toHaveBeenCalledWith({ 'cache-control': 'public, max-age=60' });
  });

  it('/ — filterOptions contains tripTypes, landings, speciesList arrays', async () => {
    const { load } = await import('../../src/routes/+page.server');
    const event = makeEvent('/');
    const result = await load(event);
    expect(Array.isArray(result.filterOptions.tripTypes)).toBe(true);
    expect(Array.isArray(result.filterOptions.landings)).toBe(true);
    expect(Array.isArray(result.filterOptions.speciesList)).toBe(true);
    // Seeded DB should have real data
    expect(result.filterOptions.tripTypes.length).toBeGreaterThan(0);
  });

  // ── /date/[date] ──────────────────────────────────────────────────────────

  it('/date/[date] — load() returns rows shape for a known past date', async () => {
    const { load } = await import('../../src/routes/date/[date]/+page.server');
    const event = makeEvent(`/date/${KNOWN_PAST_DATE}`);
    event.params = { date: KNOWN_PAST_DATE };
    const result = await load(event);
    expect(result).toHaveProperty('rows');
    expect(result).toHaveProperty('date');
    expect(result).toHaveProperty('nav');
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('/date/[date] — throws 404 for invalid date format "abc"', async () => {
    const { load } = await import('../../src/routes/date/[date]/+page.server');
    const event = makeEvent('/date/abc');
    event.params = { date: 'abc' };
    await expect(load(event)).rejects.toMatchObject({ status: 404 });
  });

  it('/date/[date] — past date sets cache-control: public, max-age=86400', async () => {
    const { load } = await import('../../src/routes/date/[date]/+page.server');
    const event = makeEvent(`/date/${KNOWN_PAST_DATE}`);
    event.params = { date: KNOWN_PAST_DATE };
    await load(event);
    expect(event.setHeaders).toHaveBeenCalledWith({ 'cache-control': 'public, max-age=86400' });
  });

  // ── /picker ───────────────────────────────────────────────────────────────

  it('/picker — without filters returns guidance (no rankings)', async () => {
    const { load } = await import('../../src/routes/picker/+page.server');
    const event = makeEvent('/picker');
    const result = await load(event);
    expect(result.guidance).toBeTruthy();
    expect(result.rankings).toBeNull();
    expect(result.heatmap).toBeNull();
  });

  it('/picker — with valid species + tripType + date returns rankings + 30-cell heatmap', async () => {
    const { load } = await import('../../src/routes/picker/+page.server');
    const params = new URLSearchParams({
      date: KNOWN_PAST_DATE,
      species: firstSpecies,
      tripType: firstTripType,
      windowDays: '7' // capped at 14 by Zod schema
    });
    const event = makeEvent('/picker', params.toString());
    const result = await load(event);
    expect(result.rankings).not.toBeNull();
    expect(Array.isArray(result.rankings)).toBe(true);
    expect(result.heatmap).not.toBeNull();
    expect(result.heatmap?.length).toBe(30); // D-13: always 30 cells
    expect(result.rankings!.length).toBeGreaterThan(0);
  });

  it('/picker — rankings sorted by avg_per_angler desc (or null last)', async () => {
    const { load } = await import('../../src/routes/picker/+page.server');
    const params = new URLSearchParams({
      date: KNOWN_PAST_DATE,
      species: firstSpecies,
      tripType: firstTripType,
      windowDays: '7'
    });
    const event = makeEvent('/picker', params.toString());
    const result = await load(event);
    const rankings = result.rankings ?? [];
    if (rankings.length >= 2) {
      // Non-null values should be in descending order
      const nonNull = rankings
        .map((r: any) => r.avg_per_angler)
        .filter((v: any) => v !== null);
      for (let i = 0; i < nonNull.length - 1; i++) {
        expect(nonNull[i]).toBeGreaterThanOrEqual(nonNull[i + 1]);
      }
    }
  });

  // ── /boats/[id] ───────────────────────────────────────────────────────────

  it('/boats/[id] — valid id returns profile shape with recentTrips', async () => {
    const { load } = await import('../../src/routes/boats/[id]/+page.server');
    const event = makeEvent(`/boats/${firstBoatId}`);
    event.params = { id: String(firstBoatId) };
    const result = await load(event);
    expect(result).toHaveProperty('profile');
    expect(result.profile).not.toBeNull();
    expect(result.profile).toHaveProperty('boat');
    expect(result.profile).toHaveProperty('recentTrips');
    expect(Array.isArray(result.profile.recentTrips)).toBe(true);
  });

  it('/boats/[id] — non-numeric id throws 404', async () => {
    const { load } = await import('../../src/routes/boats/[id]/+page.server');
    const event = makeEvent('/boats/abc');
    event.params = { id: 'abc' };
    await expect(load(event)).rejects.toMatchObject({ status: 404 });
  });

  it('/boats/[id] — non-existent id throws 404', async () => {
    const { load } = await import('../../src/routes/boats/[id]/+page.server');
    const event = makeEvent('/boats/999999');
    event.params = { id: '999999' };
    await expect(load(event)).rejects.toMatchObject({ status: 404 });
  });

  // ── /compare ──────────────────────────────────────────────────────────────

  it('/compare — without filters returns guidance (no rows)', async () => {
    const { load } = await import('../../src/routes/compare/+page.server');
    const event = makeEvent('/compare');
    const result = await load(event);
    expect(result.guidance).toBeTruthy();
    expect(result.rows).toBeNull();
    expect(result.chartOption).toBeNull();
  });

  it('/compare — with 2 boatIds + tripType + date range returns rows (length ≥ 0) + chartOption', async () => {
    const { load } = await import('../../src/routes/compare/+page.server');
    // boatIds must be passed as repeated keys (sp.getAll('boatIds') in parseCompareFilters)
    const params = new URLSearchParams();
    params.append('boatIds', String(firstBoatId));
    params.append('boatIds', String(secondBoatId));
    params.set('tripType', firstTripType);
    params.set('fromDate', SEED_FROM);
    params.set('toDate', SEED_TO);
    const event = makeEvent('/compare', params.toString());
    const result = await load(event);
    expect(result.guidance).toBeNull();
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.chartOption).not.toBeNull();
    expect(Array.isArray(result.chartOption?.series)).toBe(true);
  });

  // ── /trends ───────────────────────────────────────────────────────────────

  it('/trends — without filters returns guidance', async () => {
    const { load } = await import('../../src/routes/trends/+page.server');
    const event = makeEvent('/trends');
    const result = await load(event);
    expect(result.guidance).toBeTruthy();
    expect(result.chartOption).toBeNull();
  });

  it('/trends — with species + tripType + range covering seed returns chartOption with bucket data', async () => {
    // The seed runs 2024-01-01 → 2024-04-01. /trends defaults its date window
    // off today() (rangeToDates uses today() − range), so range=1y from a
    // current system date will not overlap the seed. Use range='all' (10-year
    // sentinel per T-02-31) to guarantee the seeded 2024 data is in window.
    const { load } = await import('../../src/routes/trends/+page.server');
    const params = new URLSearchParams({
      species: firstSpecies,
      tripType: firstTripType,
      range: 'all'
    });
    const event = makeEvent('/trends', params.toString());
    const result = await load(event);
    expect(result.guidance).toBeNull();
    expect(result.noData).toBe(false);
    expect(result.chartOption).not.toBeNull();
    expect(Array.isArray(result.chartOption?.series)).toBe(true);
    expect(result.chartOption?.series?.length).toBeGreaterThan(0);
    // The xAxis data should have bucket keys
    expect(Array.isArray(result.chartOption?.xAxis?.data)).toBe(true);
    expect((result.chartOption?.xAxis?.data as any[]).length).toBeGreaterThan(0);
  });

  it('/trends — with species + tripType but query window outside seed → noData branch', async () => {
    // Inverse of the above: range='1y' from today() does NOT overlap 2024 seed,
    // so the loader takes its noData branch and returns chartOption: null.
    const { load } = await import('../../src/routes/trends/+page.server');
    const params = new URLSearchParams({
      species: firstSpecies,
      tripType: firstTripType,
      range: '1y'
    });
    const event = makeEvent('/trends', params.toString());
    const result = await load(event);
    expect(result.guidance).toBeNull();
    expect(result.noData).toBe(true);
    expect(result.chartOption).toBeNull();
  });

  // ── /about ────────────────────────────────────────────────────────────────

  it('/about — load() returns {} (static page with no data)', async () => {
    const { load } = await import('../../src/routes/about/+page.server');
    const event = makeEvent('/about');
    const result = await load(event);
    expect(result).toEqual({});
  });

  it('/about — sets cache-control: public, max-age=3600', async () => {
    const { load } = await import('../../src/routes/about/+page.server');
    const event = makeEvent('/about');
    await load(event);
    expect(event.setHeaders).toHaveBeenCalledWith({ 'cache-control': 'public, max-age=3600' });
  });
});
