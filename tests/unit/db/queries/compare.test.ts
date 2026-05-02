// tests/unit/db/queries/compare.test.ts
// Unit tests for src/lib/db/queries/compare.ts
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../../helpers/seedTestDb';
import { compareBoats } from '../../../../src/lib/db/queries/compare';

describe('compare.compareBoats', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('T-02-38 defense-in-depth: throws when boatIds.length > 3', () => {
    db = openTestDb();
    expect(() =>
      compareBoats(db!, {
        boatIds: [1, 2, 3, 4],
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        tripType: '1/2 Day AM'
      })
    ).toThrow('compareBoats: max 3 boats');
  });

  it('throws when 5 boatIds provided', () => {
    db = openTestDb();
    expect(() =>
      compareBoats(db!, {
        boatIds: [1, 2, 3, 4, 5],
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        tripType: '1/2 Day AM'
      })
    ).toThrow('compareBoats: max 3 boats');
  });

  it('does NOT throw when exactly 3 boatIds provided (boundary inclusive)', () => {
    db = openTestDb();
    const { boatId: b1, landingId: l1 } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    const { boatId: b2, landingId: l2 } = seedBoat(db, { boatName: 'Seaforth One', landingName: 'Seaforth' });
    const { boatId: b3, landingId: l3 } = seedBoat(db, { boatName: 'Medalist', landingName: 'H&M Landing' });
    seedTrip(db, { boatId: b1, landingId: l1, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId: b2, landingId: l2, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 8 });
    seedTrip(db, { boatId: b3, landingId: l3, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 6 });

    expect(() =>
      compareBoats(db!, {
        boatIds: [b1, b2, b3],
        fromDate: '2024-06-01',
        toDate: '2024-06-30',
        tripType: 'Full Day'
      })
    ).not.toThrow();
  });

  it('with 2 boatIds returns at most 2 rows', () => {
    db = openTestDb();
    const { boatId: b1, landingId: l1 } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    const { boatId: b2, landingId: l2 } = seedBoat(db, { boatName: 'Seaforth One', landingName: 'Seaforth' });
    seedTrip(db, { boatId: b1, landingId: l1, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId: b2, landingId: l2, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 8 });

    const results = compareBoats(db, {
      boatIds: [b1, b2],
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      tripType: 'Full Day'
    });

    expect(results).toHaveLength(2);
  });

  it('top_species: boat with 30 yellowtail + 5 calicos -> top_species = "yellowtail"', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 30 });
    seedTrip(db, { boatId, landingId, date: '2024-06-16', tripType: 'Full Day', species: 'calico bass', anglers: 20, count: 5 });

    const results = compareBoats(db, {
      boatIds: [boatId],
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      tripType: 'Full Day'
    });

    expect(results).toHaveLength(1);
    expect(results[0]).not.toBeNull();
    expect(results[0]!.top_species).toBe('yellowtail');
  });

  it('boat with no trips in window returns null entry', () => {
    db = openTestDb();
    const { boatId: b1, landingId: l1 } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    const { boatId: b2 } = seedBoat(db, { boatName: 'Seaforth One', landingName: 'Seaforth' });
    // Only b1 has trips in the window
    seedTrip(db, { boatId: b1, landingId: l1, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });

    const results = compareBoats(db, {
      boatIds: [b1, b2],
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      tripType: 'Full Day'
    });

    expect(results).toHaveLength(2);
    expect(results[0]).not.toBeNull(); // b1 has data
    expect(results[1]).toBeNull();     // b2 has no data
  });

  it('result order matches boatIds order', () => {
    db = openTestDb();
    const { boatId: b1, landingId: l1 } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    const { boatId: b2, landingId: l2 } = seedBoat(db, { boatName: 'Seaforth One', landingName: 'Seaforth' });
    seedTrip(db, { boatId: b1, landingId: l1, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId: b2, landingId: l2, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 5 });

    // Request b2 first, b1 second
    const results = compareBoats(db, {
      boatIds: [b2, b1],
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      tripType: 'Full Day'
    });

    expect(results[0]!.boat_id).toBe(b2);
    expect(results[1]!.boat_id).toBe(b1);
  });

  it('result rows have required fields', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });

    const results = compareBoats(db, {
      boatIds: [boatId],
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      tripType: 'Full Day'
    });

    expect(results[0]).toHaveProperty('boat_id');
    expect(results[0]).toHaveProperty('boat_name');
    expect(results[0]).toHaveProperty('landing_name');
    expect(results[0]).toHaveProperty('total_trips');
    expect(results[0]).toHaveProperty('avg_per_angler');
    expect(results[0]).toHaveProperty('top_species');
    expect(results[0]).toHaveProperty('last_trip_date');
  });

  it('NULLIF guard: avg_per_angler is null when all angler_count is 0', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 0, count: 10 });

    const results = compareBoats(db, {
      boatIds: [boatId],
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      tripType: 'Full Day'
    });

    expect(results[0]!.avg_per_angler).toBeNull();
  });

  // Phase 8 D-03: passing a canonical trip_type filter folds aliased source_label
  // rows into the result (e.g. raw 'Full Day Coronado Islands' is included when
  // tripType='Full Day' because status='aliased' → 'Full Day').
  it("includes aliased 'Full Day Coronado Islands' rows when filtering tripType='Full Day'", () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Pacific Voyager',
      landingName: 'H&M Landing'
    });
    // Two raw labels — one canonical 'Full Day', one aliased.
    seedTrip(db, { boatId, landingId, date: '2024-06-10', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-06-12', tripType: 'Full Day Coronado Islands', species: 'yellowtail', anglers: 15, count: 8 });

    const [result] = compareBoats(db, {
      boatIds: [boatId],
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      tripType: 'Full Day'
    });

    expect(result).not.toBeNull();
    expect(result!.total_trips).toBe(2); // both rows folded in
    // Weighted: (10 + 8) / (20 + 15) = 18/35
    expect(result!.avg_per_angler).toBeCloseTo(18 / 35, 3);
  });
});
