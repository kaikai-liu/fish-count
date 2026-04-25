// tests/unit/db/queries/trends.test.ts
// Unit tests for src/lib/db/queries/trends.ts
// Critical: verify ISO-week boundary (T-02-06) and boatTrend species-optional path.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../../helpers/seedTestDb';
import { speciesTrend, boatTrend } from '../../../../src/lib/db/queries/trends';
import { isoWeekKey } from '../../../../src/lib/shared/dates';

describe('trends.speciesTrend', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('weekly: bucket_key matches /^\\d{4}-W\\d{2}$/', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });

    const buckets = speciesTrend(db, {
      species: 'yellowtail',
      tripType: 'Full Day',
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'weekly'
    });

    expect(buckets).toHaveLength(1);
    expect(buckets[0].bucket_key).toMatch(/^\d{4}-W\d{2}$/);
    expect(buckets[0]).toHaveProperty('n_trips', 1);
    expect(buckets[0].value).toBeCloseTo(10 / 20, 3);
  });

  it('monthly: bucket_key matches /^\\d{4}-\\d{2}$/', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });

    const buckets = speciesTrend(db, {
      species: 'yellowtail',
      tripType: 'Full Day',
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'monthly'
    });

    expect(buckets).toHaveLength(1);
    expect(buckets[0].bucket_key).toMatch(/^\d{4}-\d{2}$/);
    expect(buckets[0].bucket_key).toBe('2024-06');
  });

  it('T-02-06 ISO-week boundary: 2024-12-30 -> 2025-W01 (NOT 2024-W52)', () => {
    // 2024-12-30 is a Monday in ISO week 2025-W01
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-12-30', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });

    const buckets = speciesTrend(db, {
      species: 'yellowtail',
      tripType: 'Full Day',
      fromDate: '2024-12-28',
      toDate: '2025-01-05',
      granularity: 'weekly'
    });

    expect(buckets).toHaveLength(1);
    // SQL strftime('%G-W%V') must agree with isoWeekKey from dates.ts
    expect(buckets[0].bucket_key).toBe('2025-W01');
    expect(isoWeekKey('2024-12-30')).toBe('2025-W01');
    expect(buckets[0].bucket_key).toBe(isoWeekKey('2024-12-30'));
  });

  it('weekly: two trips in same week aggregate to one bucket', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    // Both 2024-06-10 and 2024-06-11 are in ISO week 2024-W24
    seedTrip(db, { boatId, landingId, date: '2024-06-10', tripType: 'Full Day', species: 'yellowtail', anglers: 10, count: 5 });
    seedTrip(db, { boatId, landingId, date: '2024-06-11', tripType: 'Full Day', species: 'yellowtail', anglers: 10, count: 5 });

    const buckets = speciesTrend(db, {
      species: 'yellowtail',
      tripType: 'Full Day',
      fromDate: '2024-06-10',
      toDate: '2024-06-16',
      granularity: 'weekly'
    });

    expect(buckets).toHaveLength(1);
    expect(buckets[0].n_trips).toBe(2); // distinct (date, trip_type) pairs
    expect(buckets[0].value).toBeCloseTo(10 / 20, 3); // weighted yield
  });

  it('returns empty array when no matching data', () => {
    db = openTestDb();
    const buckets = speciesTrend(db, {
      species: 'yellowtail',
      tripType: 'Full Day',
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'weekly'
    });
    expect(buckets).toEqual([]);
  });

  it('buckets sorted ascending by bucket_key', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-06-30', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-06-01', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 5 });

    const buckets = speciesTrend(db, {
      species: 'yellowtail',
      tripType: 'Full Day',
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'monthly'
    });

    // All in same month, one bucket
    expect(buckets).toHaveLength(1);
    expect(buckets[0].bucket_key).toBe('2024-06');
  });
});

describe('trends.boatTrend WITH species', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('filters by species when provided', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    // Seed both yellowtail and dorado on same date+trip
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'dorado', anglers: 20, count: 5 });

    // Query only for yellowtail
    const buckets = boatTrend(db, {
      boatId,
      species: 'yellowtail',
      tripType: 'Full Day',
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'monthly'
    });

    expect(buckets).toHaveLength(1);
    // Only yellowtail counts feed the value (10 fish / 20 anglers = 0.5)
    expect(buckets[0].value).toBeCloseTo(10 / 20, 3);
  });

  it('filters by boat_id', () => {
    db = openTestDb();
    const { boatId: boat1, landingId: land1 } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    const { boatId: boat2, landingId: land2 } = seedBoat(db, { boatName: 'Seaforth One', landingName: 'Seaforth' });
    seedTrip(db, { boatId: boat1, landingId: land1, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 20 });
    seedTrip(db, { boatId: boat2, landingId: land2, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 5 });

    const bucketsBoat1 = boatTrend(db, {
      boatId: boat1,
      species: 'yellowtail',
      tripType: 'Full Day',
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'monthly'
    });

    expect(bucketsBoat1).toHaveLength(1);
    expect(bucketsBoat1[0].value).toBeCloseTo(20 / 20, 3); // boat1 only
  });
});

describe('trends.boatTrend WITHOUT species (all-species aggregate)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('aggregates across ALL species when species is undefined', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    // 5 yellowtail + 5 dorado on same trip (20 anglers)
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 5 });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'dorado', anglers: 20, count: 5 });

    const buckets = boatTrend(db, {
      boatId,
      species: undefined, // all-species
      tripType: 'Full Day',
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'monthly'
    });

    expect(buckets).toHaveLength(1);
    // Aggregate: (5+5) fish / (20+20) anglers = 10/40 = 0.25
    expect(buckets[0].value).toBeCloseTo(10 / 40, 3);
  });

  it('returns empty array when boat has no trips in window', () => {
    db = openTestDb();
    const { boatId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });

    const buckets = boatTrend(db, {
      boatId,
      species: undefined,
      tripType: 'Full Day',
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      granularity: 'weekly'
    });

    expect(buckets).toEqual([]);
  });
});
