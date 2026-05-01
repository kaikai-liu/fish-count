// tests/unit/db/landings.test.ts
// Unit tests for src/lib/db/landings.ts — Phase 6 additions: getByName, mostRecentlyActiveLanding.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../helpers/seedTestDb';
import * as landings from '../../../src/lib/db/landings';

describe('landings.getByName (Phase 6 — D-14)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns the LandingRow for a known display_name', () => {
    db = openTestDb();
    landings.upsertByName(db, 'Fishermans Landing', "Fisherman's Landing");
    const row = landings.getByName(db, "Fisherman's Landing");
    expect(row).toBeDefined();
    expect(row!.display_name).toBe("Fisherman's Landing");
    expect(row!.source_name).toBe('Fishermans Landing');
  });

  it('returns undefined for an unknown display_name', () => {
    db = openTestDb();
    landings.upsertByName(db, 'Fishermans Landing', "Fisherman's Landing");
    const row = landings.getByName(db, 'Nonexistent Landing');
    expect(row).toBeUndefined();
  });

  it('is case-sensitive (exact match)', () => {
    db = openTestDb();
    landings.upsertByName(db, 'H&M Landing', 'H&M Landing');
    const upper = landings.getByName(db, 'h&m landing');
    expect(upper).toBeUndefined();
    const exact = landings.getByName(db, 'H&M Landing');
    expect(exact).toBeDefined();
  });
});

describe('landings.mostRecentlyActiveLanding (Phase 6 — D-08)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns null when catch_reports is empty', () => {
    db = openTestDb();
    // Insert landings but no catch data
    landings.upsertByName(db, 'Point Loma Sportfishing', 'Point Loma Sportfishing');
    const result = landings.mostRecentlyActiveLanding(db);
    expect(result).toBeNull();
  });

  it('returns the landing with the most recent source_date', () => {
    db = openTestDb();
    // Landing 1: last trip 2024-06-10
    const { boatId: boat1, landingId: landing1 } = seedBoat(db, {
      boatName: 'Pacific Voyager',
      landingName: 'H&M Landing'
    });
    seedTrip(db, { boatId: boat1, landingId: landing1, date: '2024-06-01', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId: boat1, landingId: landing1, date: '2024-06-10', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 8 });

    // Landing 2: last trip 2024-07-15 (more recent — should win)
    const { boatId: boat2, landingId: landing2 } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    seedTrip(db, { boatId: boat2, landingId: landing2, date: '2024-07-15', tripType: 'Full Day', species: 'bluefin', anglers: 30, count: 20 });

    const result = landings.mostRecentlyActiveLanding(db);
    expect(result).not.toBeNull();
    expect(result!.display_name).toBe('Point Loma Sportfishing');
  });

  it('returns a valid LandingRow shape (id, source_name, display_name)', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Pacific Voyager',
      landingName: 'H&M Landing'
    });
    seedTrip(db, { boatId, landingId, date: '2024-06-15', tripType: 'Full Day', species: 'bluefin', anglers: 20, count: 10 });

    const result = landings.mostRecentlyActiveLanding(db);
    expect(result).not.toBeNull();
    expect(typeof result!.id).toBe('number');
    expect(typeof result!.source_name).toBe('string');
    expect(typeof result!.display_name).toBe('string');
  });
});
