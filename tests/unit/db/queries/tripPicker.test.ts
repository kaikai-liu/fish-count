// tests/unit/db/queries/tripPicker.test.ts
// Unit tests for src/lib/db/queries/tripPicker.ts
// Critical: verify weighted-yield math (D-08) and n_trips semantics (D-09).
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../../helpers/seedTestDb';
import { rankBoatsForQuery, heatmapForQuery } from '../../../../src/lib/db/queries/tripPicker';

describe('tripPicker.rankBoatsForQuery', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('D-08 weighted-yield: SUM/SUM not mean-of-ratios', () => {
    // Trip A: 5 fish / 5 anglers = 1.0 per angler
    // Trip B: 5 fish / 1 angler  = 5.0 per angler
    // Weighted yield = (5+5) / (5+1) = 10/6 ≈ 1.667
    // Mean-of-ratios (wrong) = (1.0 + 5.0) / 2 = 3.0
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-07-01', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 5, count: 5 });
    seedTrip(db, { boatId, landingId, date: '2024-07-02', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 1, count: 5 });

    const results = rankBoatsForQuery(db, {
      fromDate: '2024-07-01',
      toDate: '2024-07-02',
      species: 'yellowtail',
      tripType: '1/2 Day AM'
    });

    expect(results).toHaveLength(1);
    expect(results[0].avg_per_angler).toBeCloseTo(10 / 6, 3); // ≈ 1.667
    expect(results[0].avg_per_angler).not.toBeCloseTo(3.0, 1); // NOT mean-of-ratios
    expect(results[0].n_trips).toBe(2);
  });

  it('TRP-07: boats with low n_trips (n=1, n=2) remain in results', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Medalist', landingName: 'H&M Landing' });
    seedTrip(db, { boatId, landingId, date: '2024-07-01', tripType: 'Full Day', species: 'dorado', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-07-02', tripType: 'Full Day', species: 'dorado', anglers: 15, count: 8 });

    const results = rankBoatsForQuery(db, {
      fromDate: '2024-07-01',
      toDate: '2024-07-02',
      species: 'dorado',
      tripType: 'Full Day'
    });

    // n_trips = 2 — must NOT be filtered out by HAVING n_trips >= 5
    expect(results).toHaveLength(1);
    expect(results[0].n_trips).toBe(2);
  });

  it('D-09 n_trips: two species rows on same (date, trip_type) = 1 trip', () => {
    // Same date + trip_type but two different species → n_trips should = 1
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Independence', landingName: 'Seaforth' });
    seedTrip(db, { boatId, landingId, date: '2024-07-01', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 5 });
    seedTrip(db, { boatId, landingId, date: '2024-07-01', tripType: '1/2 Day AM', species: 'dorado', anglers: 20, count: 3 });

    const results = rankBoatsForQuery(db, {
      fromDate: '2024-07-01',
      toDate: '2024-07-01',
      species: 'yellowtail',
      tripType: '1/2 Day AM'
    });

    expect(results).toHaveLength(1);
    // Only yellowtail rows match the species filter → n_trips = 1
    expect(results[0].n_trips).toBe(1);
  });

  it('returns empty array when no matching rows exist', () => {
    db = openTestDb();
    const results = rankBoatsForQuery(db, {
      fromDate: '2024-07-01',
      toDate: '2024-07-31',
      species: 'yellowtail',
      tripType: '1/2 Day AM'
    });
    expect(results).toEqual([]);
  });

  it('sorts by avg_per_angler DESC when multiple boats', () => {
    db = openTestDb();
    const { boatId: boat1, landingId: land1 } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    const { boatId: boat2, landingId: land2 } = seedBoat(db, { boatName: 'Seaforth One', landingName: 'Seaforth' });
    // Grande: 20 fish / 10 anglers = 2.0
    seedTrip(db, { boatId: boat1, landingId: land1, date: '2024-07-01', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 10, count: 20 });
    // Seaforth One: 5 fish / 10 anglers = 0.5
    seedTrip(db, { boatId: boat2, landingId: land2, date: '2024-07-01', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 10, count: 5 });

    const results = rankBoatsForQuery(db, {
      fromDate: '2024-07-01',
      toDate: '2024-07-01',
      species: 'yellowtail',
      tripType: '1/2 Day AM'
    });

    expect(results).toHaveLength(2);
    expect(results[0].boat_name).toBe('Grande');
    expect(results[1].boat_name).toBe('Seaforth One');
  });

  it('result rows have required fields: boat_id, boat_name, landing_name, avg_per_angler, n_trips, last_trip_date, trip_type', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-07-01', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 10 });

    const results = rankBoatsForQuery(db, {
      fromDate: '2024-07-01',
      toDate: '2024-07-31',
      species: 'yellowtail',
      tripType: '1/2 Day AM'
    });

    expect(results[0]).toHaveProperty('boat_id');
    expect(results[0]).toHaveProperty('boat_name');
    expect(results[0]).toHaveProperty('landing_name');
    expect(results[0]).toHaveProperty('avg_per_angler');
    expect(results[0]).toHaveProperty('n_trips');
    expect(results[0]).toHaveProperty('last_trip_date');
    expect(results[0]).toHaveProperty('trip_type');
  });
});

describe('tripPicker.heatmapForQuery', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns rows ordered ascending by date with n field', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-07-03', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-07-01', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 5 });

    const cells = heatmapForQuery(db, {
      fromDate: '2024-07-01',
      toDate: '2024-07-31',
      species: 'yellowtail',
      tripType: '1/2 Day AM'
    });

    expect(cells).toHaveLength(2);
    expect(cells[0].date).toBe('2024-07-01');
    expect(cells[1].date).toBe('2024-07-03');
    expect(cells[0]).toHaveProperty('n');
    expect(cells[0]).toHaveProperty('value');
  });

  it('Phase 3 swap contract: shape is {date, value, n}', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-07-01', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 10 });

    const cells = heatmapForQuery(db, {
      fromDate: '2024-07-01',
      toDate: '2024-07-01',
      species: 'yellowtail',
      tripType: '1/2 Day AM'
    });

    expect(cells[0]).toHaveProperty('date');
    expect(cells[0]).toHaveProperty('value');
    expect(cells[0]).toHaveProperty('n');
  });

  it('NULLIF safety: zero angler_count returns null value (no divide-by-zero)', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    // angler_count = 0 should produce NULL value via NULLIF(SUM(angler_count), 0)
    seedTrip(db, { boatId, landingId, date: '2024-07-01', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 0, count: 5 });

    const cells = heatmapForQuery(db, {
      fromDate: '2024-07-01',
      toDate: '2024-07-01',
      species: 'yellowtail',
      tripType: '1/2 Day AM'
    });

    expect(cells).toHaveLength(1);
    expect(cells[0].value).toBeNull(); // NULLIF prevents divide-by-zero
    expect(cells[0].n).toBe(1);
  });

  it('only returns dates with matching rows (gap-filling is caller responsibility)', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    // Seed only 2 dates out of a 31-day window
    seedTrip(db, { boatId, landingId, date: '2024-07-01', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-07-15', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 8 });

    const cells = heatmapForQuery(db, {
      fromDate: '2024-07-01',
      toDate: '2024-07-31',
      species: 'yellowtail',
      tripType: '1/2 Day AM'
    });

    // Only 2 dates have rows; gap-filling is the route loader's job
    expect(cells).toHaveLength(2);
  });
});
