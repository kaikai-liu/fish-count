// tests/unit/db/queries/home.test.ts
// Phase 8 HOME-01..05 — homeSections() unit tests.
// Sources:
//   .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-08, D-09, D-10, D-11
//   .planning/phases/08-home-retire-polish/08-RESEARCH.md §"Home-Page Section Query"
//   .planning/phases/08-home-retire-polish/08-PATTERNS.md §"src/lib/db/queries/home.ts"
//
// Behaviors covered:
//   H1: ≥5-trip viable trip type returns one section sorted-fpa rows up to topN.
//   H2: <5-trip trip types do NOT surface (D-08 viability filter).
//   H3: Aliased label merge — "Full Day Coronado Islands" + "Full Day" → ONE section
//       (RESEARCH §Pitfall 1: alias merge happens BEFORE viability filter).
//   H4: Within-section row sort: fpa DESC, then boat_display_name ASC tiebreaker.
//   H5: n=1 cells ship — no minimum-per-boat threshold (D-11 "trust the audience").
//   H6: pending=true when boat's only constituent label has alias status='pending'.
//   H7: Sections sorted by trip_count DESC.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../../helpers/seedTestDb';
import { homeSections } from '../../../../src/lib/db/queries/home';

describe('homeSections — H1: viable trip type returns one section sorted by fpa', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns a Full Day section with at least 5 trips and rows ranked by fpa DESC', () => {
    db = openTestDb();
    const a = seedBoat(db, { boatName: 'Premier', landingName: "Fisherman's Landing" });
    const b = seedBoat(db, { boatName: 'Old Glory', landingName: "Fisherman's Landing" });
    const c = seedBoat(db, { boatName: 'Pacific Voyager', landingName: 'H&M Landing' });

    // 5 distinct (date, boat) tuples on Full Day. Premier highest fpa, then Old Glory, then Pacific Voyager.
    seedTrip(db, { boatId: a.boatId, landingId: a.landingId, date: '2026-04-26', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 100 }); // 5 fpa
    seedTrip(db, { boatId: a.boatId, landingId: a.landingId, date: '2026-04-27', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 100 });
    seedTrip(db, { boatId: b.boatId, landingId: b.landingId, date: '2026-04-26', tripType: 'Full Day', species: 'yellowtail', anglers: 25, count: 50 });  // 2 fpa
    seedTrip(db, { boatId: b.boatId, landingId: b.landingId, date: '2026-04-27', tripType: 'Full Day', species: 'yellowtail', anglers: 25, count: 50 });
    seedTrip(db, { boatId: c.boatId, landingId: c.landingId, date: '2026-04-26', tripType: 'Full Day', species: 'yellowtail', anglers: 25, count: 25 });  // 1 fpa

    const result = homeSections(db, { fromDate: '2026-04-25', toDate: '2026-05-02', minTrips: 5, perSection: 5 });
    expect(result.length).toBe(1);
    expect(result[0].canonical_trip_type).toBe('Full Day');
    expect(result[0].trip_count).toBeGreaterThanOrEqual(5);
    expect(result[0].rows.length).toBeLessThanOrEqual(5);
    expect(result[0].rows.length).toBe(3);
    // Premier (5 fpa) > Old Glory (2 fpa) > Pacific Voyager (1 fpa)
    expect(result[0].rows[0].boat_display_name).toBe('Premier');
    expect(result[0].rows[1].boat_display_name).toBe('Old Glory');
    expect(result[0].rows[2].boat_display_name).toBe('Pacific Voyager');
    expect(result[0].rows[0].fpa).toBeCloseTo(5, 3);
  });
});

describe('homeSections — H2: trip types with <5 trips DO NOT surface', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('drops trip types under the minTrips floor', () => {
    db = openTestDb();
    const a = seedBoat(db, { boatName: 'Premier', landingName: "Fisherman's Landing" });
    // Only 4 (date, boat) tuples on 1.5 Day — under the 5-trip viability floor.
    for (const day of ['2026-04-26', '2026-04-27', '2026-04-28', '2026-04-29']) {
      seedTrip(db, { boatId: a.boatId, landingId: a.landingId, date: day, tripType: '1.5 Day', species: 'yellowtail', anglers: 20, count: 30 });
    }
    const result = homeSections(db, { fromDate: '2026-04-25', toDate: '2026-05-02', minTrips: 5, perSection: 5 });
    expect(result.length).toBe(0);
  });
});

describe('homeSections — H3: aliased labels merge before viability filter', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('"Full Day Coronado Islands" + "Full Day" coalesce into ONE Full Day section', () => {
    db = openTestDb();
    const a = seedBoat(db, { boatName: 'Premier', landingName: "Fisherman's Landing" });
    const b = seedBoat(db, { boatName: 'Old Glory', landingName: "Fisherman's Landing" });
    // 3 trips on raw 'Full Day Coronado Islands' (seeded as aliased → 'Full Day') + 3 on raw 'Full Day' = 6 distinct (date, boat) tuples.
    seedTrip(db, { boatId: a.boatId, landingId: a.landingId, date: '2026-04-26', tripType: 'Full Day Coronado Islands', species: 'yellowtail', anglers: 20, count: 40 });
    seedTrip(db, { boatId: a.boatId, landingId: a.landingId, date: '2026-04-27', tripType: 'Full Day Coronado Islands', species: 'yellowtail', anglers: 20, count: 40 });
    seedTrip(db, { boatId: b.boatId, landingId: b.landingId, date: '2026-04-26', tripType: 'Full Day Coronado Islands', species: 'yellowtail', anglers: 20, count: 40 });
    seedTrip(db, { boatId: a.boatId, landingId: a.landingId, date: '2026-04-28', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 40 });
    seedTrip(db, { boatId: b.boatId, landingId: b.landingId, date: '2026-04-27', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 40 });
    seedTrip(db, { boatId: b.boatId, landingId: b.landingId, date: '2026-04-28', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 40 });

    const result = homeSections(db, { fromDate: '2026-04-25', toDate: '2026-05-02', minTrips: 5, perSection: 5 });
    // Exactly one section, called "Full Day", with 6 trips (the merged group).
    expect(result.length).toBe(1);
    expect(result[0].canonical_trip_type).toBe('Full Day');
    expect(result[0].trip_count).toBe(6);
  });
});

describe('homeSections — H4: rows sort by fpa DESC, then boat_display_name ASC', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('alphabetical tiebreaker on equal fpa', () => {
    db = openTestDb();
    const z = seedBoat(db, { boatName: 'Zenith', landingName: "Fisherman's Landing" });
    const a = seedBoat(db, { boatName: 'Apex', landingName: "Fisherman's Landing" });
    const m = seedBoat(db, { boatName: 'Marlin', landingName: "Fisherman's Landing" });
    // Apex / Marlin / Zenith all 1.0 fpa. Plus 2 lower-fpa trips on a 4th boat to hit ≥5 trips.
    const x = seedBoat(db, { boatName: 'Xeno', landingName: "Fisherman's Landing" });
    seedTrip(db, { boatId: z.boatId, landingId: z.landingId, date: '2026-04-26', tripType: 'Full Day', species: 'yellowtail', anglers: 10, count: 10 });
    seedTrip(db, { boatId: a.boatId, landingId: a.landingId, date: '2026-04-26', tripType: 'Full Day', species: 'yellowtail', anglers: 10, count: 10 });
    seedTrip(db, { boatId: m.boatId, landingId: m.landingId, date: '2026-04-26', tripType: 'Full Day', species: 'yellowtail', anglers: 10, count: 10 });
    seedTrip(db, { boatId: x.boatId, landingId: x.landingId, date: '2026-04-26', tripType: 'Full Day', species: 'yellowtail', anglers: 10, count: 1 });
    seedTrip(db, { boatId: x.boatId, landingId: x.landingId, date: '2026-04-27', tripType: 'Full Day', species: 'yellowtail', anglers: 10, count: 1 });

    const result = homeSections(db, { fromDate: '2026-04-25', toDate: '2026-05-02', minTrips: 5, perSection: 5 });
    expect(result.length).toBe(1);
    // First three rows have fpa=1.0 and sort alphabetically: Apex, Marlin, Zenith. Xeno (0.1) trails.
    expect(result[0].rows[0].boat_display_name).toBe('Apex');
    expect(result[0].rows[1].boat_display_name).toBe('Marlin');
    expect(result[0].rows[2].boat_display_name).toBe('Zenith');
    expect(result[0].rows[3].boat_display_name).toBe('Xeno');
  });
});

describe('homeSections — H5: n=1 cells ship (no per-boat minimum)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('a boat with one trip in window still renders as a row, with trip_count=1', () => {
    db = openTestDb();
    // 5 distinct (date, boat) tuples to satisfy section viability — boat A runs 4 trips, boat B runs 1.
    const a = seedBoat(db, { boatName: 'Premier', landingName: "Fisherman's Landing" });
    const b = seedBoat(db, { boatName: 'OneShot', landingName: "Fisherman's Landing" });
    for (const day of ['2026-04-26', '2026-04-27', '2026-04-28', '2026-04-29']) {
      seedTrip(db, { boatId: a.boatId, landingId: a.landingId, date: day, tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 50 });
    }
    seedTrip(db, { boatId: b.boatId, landingId: b.landingId, date: '2026-04-30', tripType: 'Full Day', species: 'yellowtail', anglers: 10, count: 30 }); // 3 fpa, n=1

    const result = homeSections(db, { fromDate: '2026-04-25', toDate: '2026-05-02', minTrips: 5, perSection: 5 });
    expect(result.length).toBe(1);
    const oneShot = result[0].rows.find((r) => r.boat_display_name === 'OneShot');
    expect(oneShot).toBeDefined();
    expect(oneShot!.trip_count).toBe(1);
    expect(oneShot!.fpa).toBeCloseTo(3, 3);
  });
});

describe('homeSections — H6: pending=true when constituent label is status="pending"', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it("flags pending=true for a boat whose only constituent label is the seed's pending '5 Day'", () => {
    db = openTestDb();
    // Need 5+ trips on the canonical '5 Day' to make it viable. Seed status='pending'.
    const a = seedBoat(db, { boatName: 'LongRanger', landingName: "Fisherman's Landing" });
    for (const day of ['2026-04-26', '2026-04-27', '2026-04-28', '2026-04-29', '2026-04-30']) {
      seedTrip(db, { boatId: a.boatId, landingId: a.landingId, date: day, tripType: '5 Day', species: 'yellowfin', anglers: 20, count: 50 });
    }
    const result = homeSections(db, { fromDate: '2026-04-25', toDate: '2026-05-02', minTrips: 5, perSection: 5 });
    expect(result.length).toBe(1);
    expect(result[0].canonical_trip_type).toBe('5 Day');
    expect(result[0].rows[0].pending).toBe(true);
  });
});

describe('homeSections — H7: sections sorted by trip_count DESC', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('most-active trip type appears first', () => {
    db = openTestDb();
    const a = seedBoat(db, { boatName: 'Premier', landingName: "Fisherman's Landing" });
    const b = seedBoat(db, { boatName: 'Old Glory', landingName: "Fisherman's Landing" });
    // 1/2 Day AM: 7 trips. Full Day: 5 trips. Both viable; AM should sort first.
    for (let day = 24; day <= 30; day++) {
      const dateStr = `2026-04-${String(day).padStart(2, '0')}`;
      seedTrip(db, { boatId: a.boatId, landingId: a.landingId, date: dateStr, tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 30 });
    }
    for (let day = 26; day <= 30; day++) {
      const dateStr = `2026-04-${String(day).padStart(2, '0')}`;
      seedTrip(db, { boatId: b.boatId, landingId: b.landingId, date: dateStr, tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 30 });
    }
    const result = homeSections(db, { fromDate: '2026-04-23', toDate: '2026-05-02', minTrips: 5, perSection: 5 });
    expect(result.length).toBe(2);
    expect(result[0].canonical_trip_type).toBe('1/2 Day AM');
    expect(result[0].trip_count).toBe(7);
    expect(result[1].canonical_trip_type).toBe('Full Day');
    expect(result[1].trip_count).toBe(5);
  });
});
