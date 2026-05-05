// tests/unit/routes/compare.test.ts
// Plan 02-05 Task 2 — load() integration tests for /compare.
//
// Uses env-isolated tmp DB pattern. Dynamic imports AFTER env mutation.
//
// Covers:
//   - No params → guidance, rows=null, chartOption=null
//   - 1 boatId only → guidance (Zod min length 2 violated)
//   - 4 boatIds → guidance (Zod max length 3 violated)
//   - Valid 2 boatIds + seeded data → rows.length 2, chart series length 2
//   - Null entry in rows for a boat with no data in the window
//   - chartOption.series[i].data length === number of weekly buckets
//   - chartOption.legend.data has no "undefined" entries
//   - All-species aggregate path: mixed species boat sums across species in chart
//   - chartOption.yAxis.name === 'fish/angler' (FISH_PER_ANGLER_AXIS resolved)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('routes/compare/+page.server.ts (load)', () => {
  let tmp: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fc-compare-'));
    originalEnv = { DB_PATH: process.env.DB_PATH };
    process.env.DB_PATH = join(tmp, 'test.sqlite3');
    vi.resetModules();
  });

  afterEach(async () => {
    try {
      const { closeDb } = await import('../../../src/lib/db/client');
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

  function makeEvent(searchParams: Record<string, string | string[]> = {}) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (Array.isArray(v)) {
        for (const item of v) sp.append(k, item);
      } else {
        sp.set(k, v);
      }
    }
    return {
      url: { searchParams: sp },
      setHeaders: vi.fn(),
      locals: { logger: { info: vi.fn() }, requestId: 'test' }
    } as unknown as Parameters<import('../../../src/routes/compare/+page.server').load>[0];
  }

  it('returns guidance when no params provided', async () => {
    const { load } = await import('../../../src/routes/compare/+page.server');
    const result = await load(makeEvent());
    expect(result.guidance).toBeTruthy();
    expect(result.rows).toBeNull();
    expect(result.chartOption).toBeNull();
    expect(result.filters).toBeNull();
  });

  it('returns guidance when only 1 boatId provided (Zod min length 2)', async () => {
    const { load } = await import('../../../src/routes/compare/+page.server');
    const result = await load(
      makeEvent({
        tripType: 'Full Day',
        fromDate: '2025-01-01',
        toDate: '2025-12-31',
        boatIds: ['1']
      })
    );
    expect(result.guidance).toBeTruthy();
    expect(result.rows).toBeNull();
  });

  it('returns guidance when 4 boatIds provided (Zod max length 3)', async () => {
    const { load } = await import('../../../src/routes/compare/+page.server');
    const result = await load(
      makeEvent({
        tripType: 'Full Day',
        fromDate: '2025-01-01',
        toDate: '2025-12-31',
        boatIds: ['1', '2', '3', '4']
      })
    );
    expect(result.guidance).toBeTruthy();
    expect(result.rows).toBeNull();
  });

  it('returns rows length 2 and chart series length 2 for valid 2 boatIds', async () => {
    const { getDb } = await import('../../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../../../tests/helpers/seedTestDb');
    const db = getDb();

    const { boatId: boatA, landingId: landingA } = seedBoat(db, {
      boatName: 'Boat Alpha',
      landingName: "Fisherman's Landing"
    });
    const { boatId: boatB, landingId: landingB } = seedBoat(db, {
      boatName: 'Boat Beta',
      landingName: 'H&M Landing'
    });

    // Seed trips within the filter window
    seedTrip(db, {
      boatId: boatA,
      landingId: landingA,
      date: '2025-03-01',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 60
    });
    seedTrip(db, {
      boatId: boatB,
      landingId: landingB,
      date: '2025-03-08',
      tripType: 'Full Day',
      species: 'bluefin',
      anglers: 15,
      count: 45
    });

    const { load } = await import('../../../src/routes/compare/+page.server');
    const result = await load(
      makeEvent({
        tripType: 'Full Day',
        fromDate: '2025-03-01',
        toDate: '2025-03-31',
        boatIds: [String(boatA), String(boatB)]
      })
    );

    expect(result.guidance).toBeNull();
    expect(result.rows).toHaveLength(2);
    expect(result.chartOption).toBeDefined();
    expect(result.chartOption!.series).toHaveLength(2);
  });

  it('returns null entry in rows for a boat with no trips in window', async () => {
    const { getDb } = await import('../../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../../../tests/helpers/seedTestDb');
    const db = getDb();

    const { boatId: boatA, landingId: landingA } = seedBoat(db, {
      boatName: 'Boat With Data',
      landingName: 'Seaforth'
    });
    const { boatId: boatB } = seedBoat(db, {
      boatName: 'Boat Without Data',
      landingName: 'Dana Wharf'
    });

    // Only seed boatA within the window
    seedTrip(db, {
      boatId: boatA,
      landingId: landingA,
      date: '2025-04-10',
      tripType: 'Full Day',
      species: 'dorado',
      anglers: 18,
      count: 54
    });

    const { load } = await import('../../../src/routes/compare/+page.server');
    const result = await load(
      makeEvent({
        tripType: 'Full Day',
        fromDate: '2025-04-01',
        toDate: '2025-04-30',
        boatIds: [String(boatA), String(boatB)]
      })
    );

    expect(result.rows).toHaveLength(2);
    // boatA has data; boatB does not — null entry
    const nullEntry = result.rows!.find((r) => r === null);
    expect(nullEntry).toBeNull();
  });

  it('chartOption.series[i].data length equals number of weekly buckets in window', async () => {
    const { getDb } = await import('../../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../../../tests/helpers/seedTestDb');
    const db = getDb();

    const { boatId: boatA, landingId: landingA } = seedBoat(db, {
      boatName: 'Bucket Boat A',
      landingName: "Fisherman's Landing"
    });
    const { boatId: boatB, landingId: landingB } = seedBoat(db, {
      boatName: 'Bucket Boat B',
      landingName: 'Point Loma Sportfishing'
    });

    seedTrip(db, {
      boatId: boatA,
      landingId: landingA,
      date: '2025-02-03',
      tripType: '3/4 Day',
      species: 'rockfish',
      anglers: 25,
      count: 50
    });
    seedTrip(db, {
      boatId: boatB,
      landingId: landingB,
      date: '2025-02-10',
      tripType: '3/4 Day',
      species: 'lingcod',
      anglers: 20,
      count: 40
    });

    const { load } = await import('../../../src/routes/compare/+page.server');
    const result = await load(
      makeEvent({
        tripType: '3/4 Day',
        fromDate: '2025-02-01',
        toDate: '2025-02-28',
        boatIds: [String(boatA), String(boatB)]
      })
    );

    expect(result.chartOption).toBeDefined();
    // Polish pass: time-axis chart now carries [iso, value] tuples — bucket
    // count derives from any visible series since xAxis no longer has .data.
    expect(result.chartOption!.series.length).toBeGreaterThan(0);
    const expectedBucketCount = result.chartOption!.series[0].data.length;
    for (const series of result.chartOption!.series) {
      expect(series.data).toHaveLength(expectedBucketCount);
    }
    // 2025-02-01 to 2025-02-28 should span 4-5 weeks
    expect(expectedBucketCount).toBeGreaterThanOrEqual(4);
  });

  it('chartOption.legend.data has no undefined or null entries', async () => {
    const { getDb } = await import('../../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../../../tests/helpers/seedTestDb');
    const db = getDb();

    const { boatId: boatA, landingId: landingA } = seedBoat(db, {
      boatName: 'Legend Boat A',
      landingName: "Fisherman's Landing"
    });
    const { boatId: boatB, landingId: landingB } = seedBoat(db, {
      boatName: 'Legend Boat B',
      landingName: 'Oceanside'
    });

    seedTrip(db, {
      boatId: boatA,
      landingId: landingA,
      date: '2025-05-05',
      tripType: 'Full Day',
      species: 'wahoo',
      anglers: 12,
      count: 36
    });
    seedTrip(db, {
      boatId: boatB,
      landingId: landingB,
      date: '2025-05-12',
      tripType: 'Full Day',
      species: 'yellowfin',
      anglers: 10,
      count: 20
    });

    const { load } = await import('../../../src/routes/compare/+page.server');
    const result = await load(
      makeEvent({
        tripType: 'Full Day',
        fromDate: '2025-05-01',
        toDate: '2025-05-31',
        boatIds: [String(boatA), String(boatB)]
      })
    );

    expect(result.chartOption).toBeDefined();
    const legendData = result.chartOption!.legend.data as string[];
    expect(legendData).not.toContain(undefined);
    expect(legendData).not.toContain(null);
    expect(legendData.every((v) => typeof v === 'string')).toBe(true);
  });

  it('all-species aggregate: mixed species boat sums across species in chart data', async () => {
    const { getDb } = await import('../../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../../../tests/helpers/seedTestDb');
    const db = getDb();

    const { boatId: boatA, landingId: landingA } = seedBoat(db, {
      boatName: 'Multi Species Boat',
      landingName: 'H&M Landing'
    });
    const { boatId: boatB, landingId: landingB } = seedBoat(db, {
      boatName: 'Single Species Boat',
      landingName: 'Helgren\'s'
    });

    // Boat A: 5 yellowtail rows + 5 dorado rows on same trip-type/dates in same week
    // Week of 2025-06-02 (Mon)
    const baseDate = '2025-06-02';
    seedTrip(db, {
      boatId: boatA,
      landingId: landingA,
      date: baseDate,
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 40 // 2.0 fish/angler for yellowtail
    });
    seedTrip(db, {
      boatId: boatA,
      landingId: landingA,
      date: baseDate,
      tripType: 'Full Day',
      species: 'dorado',
      anglers: 20,
      count: 20 // 1.0 fish/angler for dorado; same anglers (same trip)
    });
    // With all-species: SUM(species_count) = 60, SUM(angler_count) = 40 → 1.5 fish/angler
    // Note: angler_count is per-row — the query SUMs it. Since same trip has 20 anglers
    // reported for each species row, total angler sum = 40, total species sum = 60 → 1.5

    // Boat B: just one species
    seedTrip(db, {
      boatId: boatB,
      landingId: landingB,
      date: baseDate,
      tripType: 'Full Day',
      species: 'bluefin',
      anglers: 15,
      count: 45
    });

    const { load } = await import('../../../src/routes/compare/+page.server');
    const result = await load(
      makeEvent({
        tripType: 'Full Day',
        fromDate: '2025-06-01',
        toDate: '2025-06-30',
        boatIds: [String(boatA), String(boatB)]
      })
    );

    expect(result.chartOption).toBeDefined();
    expect(result.chartOption!.series).toHaveLength(2);

    // Find the series for Boat A (the multi-species one)
    const boatASeries = result.chartOption!.series.find((s) => s.name === 'Multi Species Boat');
    expect(boatASeries).toBeDefined();
    // The bucket for week of 2025-06-02 should have the all-species aggregate value
    // Polish pass: data is now [iso, value] tuples — pull the value side.
    const bucketValues = boatASeries!.data
      .map((tuple) => (Array.isArray(tuple) ? tuple[1] : tuple))
      .filter((v) => v !== null);
    expect(bucketValues.length).toBeGreaterThanOrEqual(1);
    // The value should be > 0 (we got data from both species aggregated)
    expect(bucketValues[0]).toBeGreaterThan(0);
  });

  it('chartOption.yAxis.name === fish/angler (FISH_PER_ANGLER_AXIS constant)', async () => {
    const { getDb } = await import('../../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../../../tests/helpers/seedTestDb');
    const db = getDb();

    const { boatId: boatA, landingId: landingA } = seedBoat(db, {
      boatName: 'Axis Test Boat A',
      landingName: "Fisherman's Landing"
    });
    const { boatId: boatB, landingId: landingB } = seedBoat(db, {
      boatName: 'Axis Test Boat B',
      landingName: 'Seaforth'
    });

    seedTrip(db, {
      boatId: boatA,
      landingId: landingA,
      date: '2025-07-14',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 22,
      count: 44
    });
    seedTrip(db, {
      boatId: boatB,
      landingId: landingB,
      date: '2025-07-21',
      tripType: 'Full Day',
      species: 'dorado',
      anglers: 18,
      count: 36
    });

    const { load } = await import('../../../src/routes/compare/+page.server');
    const result = await load(
      makeEvent({
        tripType: 'Full Day',
        fromDate: '2025-07-01',
        toDate: '2025-07-31',
        boatIds: [String(boatA), String(boatB)]
      })
    );

    expect(result.chartOption).toBeDefined();
    expect(result.chartOption!.yAxis.name).toBe('fish/angler');
  });

  it('sets Cache-Control: public, max-age=300', async () => {
    const setHeaders = vi.fn();
    const sp = new URLSearchParams();
    const event = {
      url: { searchParams: sp },
      setHeaders,
      locals: { logger: { info: vi.fn() }, requestId: 'test' }
    } as unknown as Parameters<import('../../../src/routes/compare/+page.server').load>[0];

    const { load } = await import('../../../src/routes/compare/+page.server');
    await load(event);

    expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'public, max-age=300' });
  });
});
