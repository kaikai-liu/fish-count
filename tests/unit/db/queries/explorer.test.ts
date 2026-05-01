// tests/unit/db/queries/explorer.test.ts
// Unit tests for src/lib/db/queries/explorer.ts
// Covers all 7 exported DAL functions with TDD-style scenario coverage.
//
// Seeding uses the shared helpers (openTestDb + seedBoat + seedTrip) to stay
// consistent with the rest of the test suite.  In-memory DB runs migrations
// including the Phase 6 slug column + covering indexes.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../../helpers/seedTestDb';
import * as catchReports from '../../../../src/lib/db/catchReports';
import {
  boatExplorerSeries,
  speciesAcrossBoats,
  landingAcrossSpecies,
  speciesBreakdownForBoat,
  countCatchRowsForBoatInRange,
  mostCaughtSpeciesForBoatInRange,
  topBoatForSpeciesInRange
} from '../../../../src/lib/db/queries/explorer';

// ---------------------------------------------------------------------------
// boatExplorerSeries
// ---------------------------------------------------------------------------
describe('boatExplorerSeries', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns one row per (bucket_key, trip_type) combination', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Pacific Voyager', landingName: 'H&M Landing' });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 30, count: 15 });
    // Second month
    seedTrip(db, { boatId, landingId, date: '2024-07-10', tripType: '1/2 Day AM', species: 'dorado', anglers: 20, count: 8 });

    const rows = boatExplorerSeries(db, {
      boatId,
      fromDate: '2024-06-01',
      toDate: '2024-07-31',
      granularity: 'monthly'
    });

    // 2 trip types × 2 months (but July only has 1/2 Day AM) = 3 rows
    expect(rows.length).toBe(3);
    // All should have expected keys
    rows.forEach(r => {
      expect(r).toHaveProperty('bucket_key');
      expect(r).toHaveProperty('trip_type');
      expect(r).toHaveProperty('value');
      expect(r).toHaveProperty('n_trips');
    });
  });

  it('weighted value matches manual calculation', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Pacific Voyager', landingName: 'H&M Landing' });
    // June: 2 trips same trip_type (will aggregate into one monthly bucket)
    seedTrip(db, { boatId, landingId, date: '2024-06-10', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-06-20', tripType: 'Full Day', species: 'dorado', anglers: 10, count: 5 });

    const rows = boatExplorerSeries(db, {
      boatId,
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'monthly'
    });

    // One bucket: June, Full Day. Aggregate: (10+5)/(20+10) = 15/30 = 0.5
    expect(rows).toHaveLength(1);
    expect(rows[0].bucket_key).toBe('2024-06');
    expect(rows[0].trip_type).toBe('Full Day');
    expect(rows[0].value).toBeCloseTo(15 / 30, 3);
    expect(rows[0].n_trips).toBe(2); // 2 distinct dates
  });

  it('excludes rows outside [fromDate, toDate]', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Pacific Voyager', landingName: 'H&M Landing' });
    seedTrip(db, { boatId, landingId, date: '2024-05-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-07-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });

    const rows = boatExplorerSeries(db, {
      boatId,
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'monthly'
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].bucket_key).toBe('2024-06');
  });

  it('daily granularity uses YYYY-MM-DD bucket keys', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Pacific Voyager', landingName: 'H&M Landing' });
    seedTrip(db, { boatId, landingId, date: '2024-06-12', tripType: '1/2 Day AM', species: 'bluefin', anglers: 25, count: 12 });
    seedTrip(db, { boatId, landingId, date: '2024-06-18', tripType: '1/2 Day AM', species: 'bluefin', anglers: 20, count: 10 });

    const rows = boatExplorerSeries(db, {
      boatId,
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'daily'
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].bucket_key).toBe('2024-06-12');
    expect(rows[1].bucket_key).toBe('2024-06-18');
    rows.forEach(r => expect(r.bucket_key).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('soft perf check: All-range monthly query on 15-year synthetic dataset returns quickly', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Test Boat', landingName: 'H&M Landing' });

    // Seed ~1000 rows: one trip per month across 15 years, 3 trip types, 3 species
    const tripTypes = ['Full Day', '1/2 Day AM', '3/4 Day'];
    const speciesList = ['yellowtail', 'bluefin', 'dorado'];
    const batchRows: import('../../../../src/lib/db/catchReports').CatchReportRow[] = [];
    for (let year = 2009; year <= 2024; year++) {
      for (let month = 1; month <= 12; month++) {
        for (const tt of tripTypes) {
          for (const sp of speciesList) {
            batchRows.push({
              source_date: `${year}-${String(month).padStart(2, '0')}-15`,
              boat_id: boatId,
              landing_id: landingId,
              trip_type: tt,
              species: sp,
              angler_count: 20,
              species_count: Math.floor(Math.random() * 20),
              scraped_at: '2026-01-01T00:00:00Z'
            });
          }
        }
      }
    }
    catchReports.upsertMany(db, batchRows);

    console.time('boatExplorerSeries all-range 15yr monthly');
    const result = boatExplorerSeries(db, {
      boatId,
      fromDate: '2009-01-01',
      toDate: '2024-12-31',
      granularity: 'monthly'
    });
    console.timeEnd('boatExplorerSeries all-range 15yr monthly');

    // Soft check: at least some data comes back
    expect(result.length).toBeGreaterThan(0);
    // Note: 300ms budget is logged not asserted (per plan spec)
  });
});

// ---------------------------------------------------------------------------
// speciesAcrossBoats
// ---------------------------------------------------------------------------
describe('speciesAcrossBoats', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('with 8 boats catching species → returns top 6 by window total', () => {
    db = openTestDb();
    // Create 8 boats, seed different total catches for species 'yellowtail'
    const catches = [100, 80, 70, 60, 50, 40, 30, 20]; // boat 0 catches the most
    const boatIds: number[] = [];
    for (let i = 0; i < 8; i++) {
      const { boatId, landingId } = seedBoat(db, { boatName: `Boat${i}`, landingName: 'H&M Landing' });
      boatIds.push(boatId);
      seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 100, count: catches[i] });
    }

    const result = speciesAcrossBoats(db, {
      species: 'yellowtail',
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'monthly'
    });

    expect(result.topBoats).toHaveLength(6);
    expect(result.series.length).toBeGreaterThan(0);
    // Top boat should be Boat0 (100 catch)
    expect(result.topBoats[0].display_name).toBe('Boat0');
    // All series rows should only be for top-6 boats
    const topBoatIds = new Set(result.topBoats.map(b => b.id));
    result.series.forEach(s => {
      expect(topBoatIds.has(s.boat_id)).toBe(true);
    });
  });

  it('empty result when no rows match species in window', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Pacific Voyager', landingName: 'H&M Landing' });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });

    const result = speciesAcrossBoats(db, {
      species: 'bluefin', // no bluefin data
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'monthly'
    });

    expect(result.topBoats).toEqual([]);
    expect(result.series).toEqual([]);
  });

  it('series only includes top-6 boat_ids (no pollution from other boats)', () => {
    db = openTestDb();
    // 7 boats: top 6 + one that should be excluded
    const catches = [100, 90, 80, 70, 60, 50, 10]; // 7th boat has 10, should not appear in series
    for (let i = 0; i < 7; i++) {
      const { boatId, landingId } = seedBoat(db, { boatName: `Vessel${i}`, landingName: 'H&M Landing' });
      seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'dorado', anglers: 50, count: catches[i] });
    }

    const result = speciesAcrossBoats(db, {
      species: 'dorado',
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'monthly'
    });

    expect(result.topBoats).toHaveLength(6); // top 6 only
    const topBoatIds = new Set(result.topBoats.map(b => b.id));
    // Series should only have boat_ids in topBoats
    result.series.forEach(s => {
      expect(topBoatIds.has(s.boat_id)).toBe(true);
    });
    // Series should have no more boat IDs than 6
    const seriesBoatIds = new Set(result.series.map(s => s.boat_id));
    expect(seriesBoatIds.size).toBeLessThanOrEqual(6);
  });

  it('ties broken alphabetically by display_name', () => {
    db = openTestDb();
    // Two boats with same catch total
    for (const name of ['Zephyr', 'Angler']) {
      const { boatId, landingId } = seedBoat(db, { boatName: name, landingName: 'H&M Landing' });
      seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'wahoo', anglers: 20, count: 10 });
    }

    const result = speciesAcrossBoats(db, {
      species: 'wahoo',
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'monthly'
    });

    // Both should appear; Angler before Zephyr (alpha)
    expect(result.topBoats[0].display_name).toBe('Angler');
    expect(result.topBoats[1].display_name).toBe('Zephyr');
  });

  it('result includes slug on topBoats entries', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Pacific Star', landingName: 'H&M Landing' });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'bluefin', anglers: 20, count: 15 });

    const result = speciesAcrossBoats(db, {
      species: 'bluefin',
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'monthly'
    });

    expect(result.topBoats).toHaveLength(1);
    expect(typeof result.topBoats[0].slug).toBe('string');
    expect(result.topBoats[0].slug.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// landingAcrossSpecies
// ---------------------------------------------------------------------------
describe('landingAcrossSpecies', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('with 8 species at landing → returns top 6 by window total', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Pacific Voyager', landingName: 'H&M Landing' });
    const speciesList = ['yellowtail', 'bluefin', 'dorado', 'wahoo', 'rockfish', 'lingcod', 'calico bass', 'yellowfin'];
    const catches =     [100,          90,        80,       70,      60,         50,         30,             20];

    for (let i = 0; i < 8; i++) {
      seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: speciesList[i], anglers: 100, count: catches[i] });
    }

    const result = landingAcrossSpecies(db, {
      landingId,
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'monthly'
    });

    expect(result.topSpecies).toHaveLength(6);
    // Top species should be yellowtail (100 catch)
    expect(result.topSpecies[0]).toBe('yellowtail');
    // All series rows should only be for top-6 species
    const topSet = new Set(result.topSpecies);
    result.series.forEach(s => {
      expect(topSet.has(s.species)).toBe(true);
    });
  });

  it('returns empty result when landing has no catch data in window', () => {
    db = openTestDb();
    const { landingId } = seedBoat(db, { boatName: 'Pacific Voyager', landingName: 'H&M Landing' });

    const result = landingAcrossSpecies(db, {
      landingId,
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'monthly'
    });

    expect(result.topSpecies).toEqual([]);
    expect(result.series).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// speciesBreakdownForBoat
// ---------------------------------------------------------------------------
describe('speciesBreakdownForBoat', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns species rows ordered by total_catch DESC', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'dorado', anglers: 20, count: 5 });
    seedTrip(db, { boatId, landingId, date: '2024-06-20', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 15 });
    seedTrip(db, { boatId, landingId, date: '2024-06-25', tripType: 'Full Day', species: 'bluefin', anglers: 20, count: 10 });

    const rows = speciesBreakdownForBoat(db, {
      boatId,
      fromDate: '2024-06-01',
      toDate: '2024-06-30'
    });

    expect(rows).toHaveLength(3);
    // Should be ordered by total_catch DESC
    expect(rows[0].species).toBe('yellowtail'); // 15
    expect(rows[1].species).toBe('bluefin');    // 10
    expect(rows[2].species).toBe('dorado');     // 5
    expect(rows[0].total_catch).toBe(15);
  });

  it('alpha tie-break on equal total_catch', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    // Same count for both
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'wahoo', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-06-20', tripType: 'Full Day', species: 'dorado', anglers: 20, count: 10 });

    const rows = speciesBreakdownForBoat(db, {
      boatId,
      fromDate: '2024-06-01',
      toDate: '2024-06-30'
    });

    expect(rows).toHaveLength(2);
    // dorado < wahoo alphabetically
    expect(rows[0].species).toBe('dorado');
    expect(rows[1].species).toBe('wahoo');
  });

  it('includes n_trips field', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-06-20', tripType: 'Full Day', species: 'yellowtail', anglers: 15, count: 5 });

    const rows = speciesBreakdownForBoat(db, {
      boatId,
      fromDate: '2024-06-01',
      toDate: '2024-06-30'
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].n_trips).toBe(2); // 2 distinct dates
    expect(rows[0].total_catch).toBe(15); // 10 + 5
  });
});

// ---------------------------------------------------------------------------
// countCatchRowsForBoatInRange
// ---------------------------------------------------------------------------
describe('countCatchRowsForBoatInRange', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns 0 when boat has no rows in range', () => {
    db = openTestDb();
    const { boatId } = seedBoat(db, { boatName: 'Pacific Voyager', landingName: 'H&M Landing' });

    const count = countCatchRowsForBoatInRange(db, {
      boatId,
      fromDate: '2024-06-01',
      toDate: '2024-06-30'
    });

    expect(count).toBe(0);
  });

  it('returns 1 when at least one row exists', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Pacific Voyager', landingName: 'H&M Landing' });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });
    // Multiple rows exist but we only need 0/1+
    seedTrip(db, { boatId, landingId, date: '2024-06-20', tripType: 'Full Day', species: 'dorado', anglers: 20, count: 5 });

    const count = countCatchRowsForBoatInRange(db, {
      boatId,
      fromDate: '2024-06-01',
      toDate: '2024-06-30'
    });

    expect(count).toBe(1);
  });

  it('returns 0 when rows exist outside range but none inside', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Pacific Voyager', landingName: 'H&M Landing' });
    seedTrip(db, { boatId, landingId, date: '2024-05-10', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });

    const count = countCatchRowsForBoatInRange(db, {
      boatId,
      fromDate: '2024-06-01',
      toDate: '2024-06-30'
    });

    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mostCaughtSpeciesForBoatInRange
// ---------------------------------------------------------------------------
describe('mostCaughtSpeciesForBoatInRange', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns the most-caught species', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 20 });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'dorado', anglers: 20, count: 5 });

    const species = mostCaughtSpeciesForBoatInRange(db, {
      boatId,
      fromDate: '2024-06-01',
      toDate: '2024-06-30'
    });

    expect(species).toBe('yellowtail');
  });

  it('returns null when boat has no rows in range', () => {
    db = openTestDb();
    const { boatId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });

    const species = mostCaughtSpeciesForBoatInRange(db, {
      boatId,
      fromDate: '2024-06-01',
      toDate: '2024-06-30'
    });

    expect(species).toBeNull();
  });

  it('alpha tie-break on equal SUM(species_count)', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'wahoo', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-06-16', tripType: 'Full Day', species: 'dorado', anglers: 20, count: 10 });

    const species = mostCaughtSpeciesForBoatInRange(db, {
      boatId,
      fromDate: '2024-06-01',
      toDate: '2024-06-30'
    });

    // dorado < wahoo alphabetically
    expect(species).toBe('dorado');
  });
});

// ---------------------------------------------------------------------------
// topBoatForSpeciesInRange
// ---------------------------------------------------------------------------
describe('topBoatForSpeciesInRange', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns the top boat record with slug populated', () => {
    db = openTestDb();
    const { boatId: b1, landingId: l1 } = seedBoat(db, { boatName: 'Pacific Voyager', landingName: 'H&M Landing' });
    const { boatId: b2, landingId: l2 } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId: b1, landingId: l1, date: '2024-06-15', tripType: 'Full Day', species: 'bluefin', anglers: 20, count: 30 });
    seedTrip(db, { boatId: b2, landingId: l2, date: '2024-06-15', tripType: 'Full Day', species: 'bluefin', anglers: 20, count: 10 });

    const result = topBoatForSpeciesInRange(db, {
      species: 'bluefin',
      fromDate: '2024-06-01',
      toDate: '2024-06-30'
    });

    expect(result).not.toBeNull();
    expect(result!.display_name).toBe('Pacific Voyager');
    expect(typeof result!.slug).toBe('string');
    expect(result!.slug.length).toBeGreaterThan(0);
    expect(typeof result!.id).toBe('number');
  });

  it('returns null when species has no rows in range', () => {
    db = openTestDb();
    seedBoat(db, { boatName: 'Pacific Voyager', landingName: 'H&M Landing' });

    const result = topBoatForSpeciesInRange(db, {
      species: 'wahoo',
      fromDate: '2024-06-01',
      toDate: '2024-06-30'
    });

    expect(result).toBeNull();
  });

  it('alpha tie-break on equal SUM(species_count)', () => {
    db = openTestDb();
    for (const name of ['Zephyr', 'Albatross']) {
      const { boatId, landingId } = seedBoat(db, { boatName: name, landingName: 'H&M Landing' });
      seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'wahoo', anglers: 20, count: 10 });
    }

    const result = topBoatForSpeciesInRange(db, {
      species: 'wahoo',
      fromDate: '2024-06-01',
      toDate: '2024-06-30'
    });

    // Albatross < Zephyr alphabetically
    expect(result!.display_name).toBe('Albatross');
  });
});
