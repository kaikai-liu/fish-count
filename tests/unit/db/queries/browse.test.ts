// tests/unit/db/queries/browse.test.ts
// Unit tests for src/lib/db/queries/browse.ts
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../../helpers/seedTestDb';
import {
  getRowsForDate,
  distinctTripTypes,
  distinctLandings,
  distinctSpecies,
  mostCommonTripType,
  getDateBounds
} from '../../../../src/lib/db/queries/browse';

describe('browse.getRowsForDate', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns rows for a seeded date with correct shape', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-07-15', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 10 });

    const rows = getRowsForDate(db, '2024-07-15');
    expect(rows).toHaveLength(1);
    const row = rows[0];
    // Check all 11 required fields
    expect(row).toHaveProperty('boat_id');
    expect(row).toHaveProperty('boat_name', 'Grande');
    expect(row).toHaveProperty('landing_id');
    expect(row).toHaveProperty('landing_name', 'Point Loma Sportfishing');
    expect(row).toHaveProperty('trip_type', '1/2 Day AM');
    expect(row).toHaveProperty('species', 'yellowtail');
    expect(row).toHaveProperty('species_count', 10);
    expect(row).toHaveProperty('angler_count', 20);
    expect(row).toHaveProperty('boat_source_url');
    expect(row).toHaveProperty('landing_source_url');
    expect(row).toHaveProperty('source_date', '2024-07-15');
  });

  it('returns [] for an unseeded date', () => {
    db = openTestDb();
    const rows = getRowsForDate(db, '2024-07-15');
    expect(rows).toEqual([]);
  });

  it('returns multiple rows for a date with multiple trips, sorted correctly', () => {
    db = openTestDb();
    const { boatId: boatId1, landingId: landingId1 } = seedBoat(db, { boatName: 'Seaforth', landingName: 'Seaforth' });
    const { boatId: boatId2, landingId: landingId2 } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId: boatId1, landingId: landingId1, date: '2024-07-15', tripType: 'Full Day', species: 'rockfish', anglers: 15, count: 30 });
    seedTrip(db, { boatId: boatId2, landingId: landingId2, date: '2024-07-15', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 10 });

    const rows = getRowsForDate(db, '2024-07-15');
    expect(rows).toHaveLength(2);
    // Should be sorted by landing_name, then boat_name
    // "Point Loma Sportfishing" < "Seaforth"
    expect(rows[0].landing_name).toBe('Point Loma Sportfishing');
    expect(rows[1].landing_name).toBe('Seaforth');
  });
});

describe('browse.distinctTripTypes', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns sorted ascending verbatim trip type strings', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-07-01', tripType: 'Long Range', species: 'bluefin', anglers: 20, count: 5 });
    seedTrip(db, { boatId, landingId, date: '2024-07-02', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-07-03', tripType: 'Full Day', species: 'dorado', anglers: 25, count: 8 });

    const types = distinctTripTypes(db);
    expect(types).toEqual(['1/2 Day AM', 'Full Day', 'Long Range']);
  });

  it('returns empty array for empty DB', () => {
    db = openTestDb();
    expect(distinctTripTypes(db)).toEqual([]);
  });
});

describe('browse.distinctLandings', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns landings present in catch_reports with correct shape', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-07-15', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });

    const landings = distinctLandings(db);
    expect(landings).toHaveLength(1);
    expect(landings[0]).toHaveProperty('id');
    expect(landings[0]).toHaveProperty('display_name', 'Point Loma Sportfishing');
    expect(landings[0]).toHaveProperty('source_url');
  });
});

describe('browse.distinctSpecies', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns sorted ascending species strings', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-07-01', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-07-02', tripType: 'Full Day', species: 'dorado', anglers: 20, count: 5 });
    seedTrip(db, { boatId, landingId, date: '2024-07-03', tripType: 'Full Day', species: 'bluefin', anglers: 20, count: 3 });

    const species = distinctSpecies(db);
    expect(species).toEqual(['bluefin', 'dorado', 'yellowtail']);
  });
});

describe('browse.mostCommonTripType', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns the most frequent trip_type', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    // Seed '1/2 Day AM' twice, 'Full Day' once
    seedTrip(db, { boatId, landingId, date: '2024-07-01', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-07-02', tripType: '1/2 Day AM', species: 'dorado', anglers: 20, count: 5 });
    seedTrip(db, { boatId, landingId, date: '2024-07-03', tripType: 'Full Day', species: 'bluefin', anglers: 25, count: 3 });

    expect(mostCommonTripType(db)).toBe('1/2 Day AM');
  });

  it('returns null on empty DB', () => {
    db = openTestDb();
    expect(mostCommonTripType(db)).toBeNull();
  });
});

describe('browse.getDateBounds', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns {min: null, max: null} on empty DB', () => {
    db = openTestDb();
    const bounds = getDateBounds(db);
    expect(bounds).toEqual({ min: null, max: null });
  });

  it('returns correct min/max source_date from seeded data', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    seedTrip(db, { boatId, landingId, date: '2024-07-04', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-01-15', tripType: 'Full Day', species: 'dorado', anglers: 20, count: 5 });
    seedTrip(db, { boatId, landingId, date: '2024-12-31', tripType: 'Full Day', species: 'bluefin', anglers: 20, count: 3 });

    const bounds = getDateBounds(db);
    expect(bounds).toEqual({ min: '2024-01-15', max: '2024-12-31' });
  });
});
