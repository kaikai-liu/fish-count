// tests/unit/db/queries/boatDetail.test.ts
// Unit tests for src/lib/db/queries/boatDetail.ts
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../../helpers/seedTestDb';
import { getBoatProfile } from '../../../../src/lib/db/queries/boatDetail';
import { addDays, today } from '../../../../src/lib/shared/dates';

describe('boatDetail.getBoatProfile', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns null for non-existent boatId', () => {
    db = openTestDb();
    expect(getBoatProfile(db, 9999)).toBeNull();
  });

  it('returns full profile shape when called with no cutoffDate (default-cutoff path)', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    // Seed a recent trip (within last 90 days)
    const recentDate = addDays(today(), -5);
    seedTrip(db, { boatId, landingId, date: recentDate, tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 10 });

    const profile = getBoatProfile(db, boatId);
    expect(profile).not.toBeNull();

    // Check boat info shape
    expect(profile!.boat).toHaveProperty('id', boatId);
    expect(profile!.boat).toHaveProperty('display_name', 'Grande');
    expect(profile!.boat).toHaveProperty('source_url');
    expect(profile!.boat).toHaveProperty('landing_id');
    expect(profile!.boat).toHaveProperty('landing_display_name', 'Point Loma Sportfishing');
    expect(profile!.boat).toHaveProperty('landing_source_url');

    // Check recentTrips shape
    expect(profile!.recentTrips).toHaveLength(1);
    expect(profile!.recentTrips[0]).toHaveProperty('source_date');
    expect(profile!.recentTrips[0]).toHaveProperty('trip_type', '1/2 Day AM');
    expect(profile!.recentTrips[0]).toHaveProperty('species', 'yellowtail');
    expect(profile!.recentTrips[0]).toHaveProperty('angler_count', 20);
    expect(profile!.recentTrips[0]).toHaveProperty('species_count', 10);

    // Check seasonTotals shape
    expect(profile!.seasonTotals).toHaveProperty('total_trips', 1);
    expect(profile!.seasonTotals).toHaveProperty('total_anglers', 20);
    expect(profile!.seasonTotals.top_species).toHaveLength(1);
    expect(profile!.seasonTotals.top_species[0]).toHaveProperty('species', 'yellowtail');
    expect(profile!.seasonTotals.top_species[0]).toHaveProperty('total_count', 10);

    // Check tripTypes shape
    expect(profile!.tripTypes).toEqual(['1/2 Day AM']);
  });

  it('EXPLICIT cutoffDate: includes trips from cutoff date onward', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    // Seed trips at various dates
    seedTrip(db, { boatId, landingId, date: '2023-06-01', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 5 });
    seedTrip(db, { boatId, landingId, date: '2024-01-15', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 8 });
    seedTrip(db, { boatId, landingId, date: '2024-06-01', tripType: '1/2 Day AM', species: 'dorado', anglers: 25, count: 12 });

    // With cutoffDate = '2024-01-01', should include the 2024 trips but not 2023
    const profile = getBoatProfile(db, boatId, '2024-01-01');
    expect(profile).not.toBeNull();
    expect(profile!.recentTrips).toHaveLength(2);
    expect(profile!.recentTrips.every(t => t.source_date >= '2024-01-01')).toBe(true);
  });

  it('EXPLICIT cutoffDate: narrow window returns only recent trips', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    // Seed trips spanning 2 years
    seedTrip(db, { boatId, landingId, date: '2023-01-01', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 5 });
    seedTrip(db, { boatId, landingId, date: '2024-01-01', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 8 });
    const recentDate = addDays(today(), -3);
    seedTrip(db, { boatId, landingId, date: recentDate, tripType: 'Full Day', species: 'dorado', anglers: 25, count: 12 });

    // Only last 7 days
    const cutoff = addDays(today(), -7);
    const profile = getBoatProfile(db, boatId, cutoff);
    expect(profile).not.toBeNull();
    // Only the recentDate trip should be within the 7-day window
    expect(profile!.recentTrips).toHaveLength(1);
    expect(profile!.recentTrips[0].source_date).toBe(recentDate);
  });

  it('DEFAULT cutoffDate: only includes trips within last 90 days', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    // Seed a trip from 2 years ago (outside 90-day window)
    seedTrip(db, { boatId, landingId, date: '2023-01-01', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 5 });
    // Seed a trip within last 90 days
    const recentDate = addDays(today(), -30);
    seedTrip(db, { boatId, landingId, date: recentDate, tripType: 'Full Day', species: 'dorado', anglers: 25, count: 12 });

    // No explicit cutoffDate — should default to today - 90 days
    const profile = getBoatProfile(db, boatId);
    expect(profile).not.toBeNull();
    // Only the recent trip should be in recentTrips
    expect(profile!.recentTrips).toHaveLength(1);
    expect(profile!.recentTrips[0].source_date).toBe(recentDate);
    // But seasonTotals counts all-time
    expect(profile!.seasonTotals.total_trips).toBe(2);
  });

  it('tripTypes returns distinct verbatim strings', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Independence', landingName: 'Seaforth' });
    seedTrip(db, { boatId, landingId, date: '2024-07-01', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-07-02', tripType: 'Full Day', species: 'dorado', anglers: 25, count: 8 });
    seedTrip(db, { boatId, landingId, date: '2024-07-03', tripType: '1/2 Day AM', species: 'bluefin', anglers: 20, count: 3 }); // duplicate trip_type

    const profile = getBoatProfile(db, boatId, '2000-01-01');
    expect(profile).not.toBeNull();
    // Should have 2 distinct trip types, sorted
    expect(profile!.tripTypes).toEqual(['1/2 Day AM', 'Full Day']);
  });

  it('returns boat with no trips in recentTrips when all trips are outside cutoff', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Spirit', landingName: 'H&M Landing' });
    seedTrip(db, { boatId, landingId, date: '2020-01-01', tripType: '3/4 Day', species: 'rockfish', anglers: 30, count: 50 });

    // Use a future cutoff so no trips qualify for recentTrips
    const profile = getBoatProfile(db, boatId, today());
    expect(profile).not.toBeNull();
    expect(profile!.recentTrips).toHaveLength(0);
    // But boat still exists, season totals still reflect all-time
    expect(profile!.seasonTotals.total_trips).toBe(1);
  });
});
