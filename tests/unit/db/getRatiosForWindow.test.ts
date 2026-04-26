// tests/unit/db/getRatiosForWindow.test.ts
// Phase 3 (FCT-01 / D-01): per-trip per-angler ratios for a seasonal window.
// Verifies year-boundary OR-branch + sum_species/sum_anglers extension that compute.ts depends on.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../helpers/seedTestDb';
import { getRatiosForWindow } from '../../../src/lib/db/catchReports';

describe('catchReports.getRatiosForWindow (FCT-01 / D-01)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('returns one row per (source_date, boat_id, trip_type) trip with ratio', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2024-05-15',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    const rows = getRatiosForWindow(db, {
      forecastYear: 2026,
      species: 'yellowtail',
      tripType: 'Full Day',
      windowStart: '05-08',
      windowEnd: '05-22',
      windowWraps: 0
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].source_date).toBe('2024-05-15');
    expect(rows[0].boat_id).toBe(boatId);
    expect(rows[0].trip_type).toBe('Full Day');
    expect(rows[0].ratio).toBeCloseTo(30 / 20, 5);
  });

  it('returns sum_species and sum_anglers per trip (compute.ts SUM/SUM dependency)', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    // Two species rows on the same trip — sum_species = 30+5, sum_anglers = 20+20 (yellowtail only filtered).
    seedTrip(db, {
      boatId,
      landingId,
      date: '2024-05-15',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    const rows = getRatiosForWindow(db, {
      forecastYear: 2026,
      species: 'yellowtail',
      tripType: 'Full Day',
      windowStart: '05-08',
      windowEnd: '05-22',
      windowWraps: 0
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].sum_species).toBe(30);
    expect(rows[0].sum_anglers).toBe(20);
  });

  it('filters by species and trip_type', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2024-05-15',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2024-05-15',
      tripType: 'Overnight',
      species: 'yellowtail',
      anglers: 15,
      count: 10
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2024-05-16',
      tripType: 'Full Day',
      species: 'bluefin',
      anglers: 20,
      count: 5
    });
    const rows = getRatiosForWindow(db, {
      forecastYear: 2026,
      species: 'yellowtail',
      tripType: 'Full Day',
      windowStart: '05-08',
      windowEnd: '05-22',
      windowWraps: 0
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].source_date).toBe('2024-05-15');
  });

  it('excludes rows from forecastYear itself (only prior years contribute)', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    // Same calendar slot but in the forecast year — must be excluded.
    seedTrip(db, {
      boatId,
      landingId,
      date: '2026-05-15',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2024-05-15',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    const rows = getRatiosForWindow(db, {
      forecastYear: 2026,
      species: 'yellowtail',
      tripType: 'Full Day',
      windowStart: '05-08',
      windowEnd: '05-22',
      windowWraps: 0
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].source_date).toBe('2024-05-15');
  });

  it('year-wrap (windowWraps=1): includes both Dec and Jan dates from prior years', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2024-12-30',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2024-01-05',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    // Outside window — should be excluded
    seedTrip(db, {
      boatId,
      landingId,
      date: '2024-06-15',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    const rows = getRatiosForWindow(db, {
      forecastYear: 2026,
      species: 'yellowtail',
      tripType: 'Full Day',
      windowStart: '12-27',
      windowEnd: '01-10',
      windowWraps: 1
    });
    expect(rows).toHaveLength(2);
    const dates = rows.map((r) => r.source_date).sort();
    expect(dates).toEqual(['2024-01-05', '2024-12-30']);
  });

  it('returns empty array when no rows match', () => {
    db = openTestDb();
    const rows = getRatiosForWindow(db, {
      forecastYear: 2026,
      species: 'yellowtail',
      tripType: 'Full Day',
      windowStart: '05-08',
      windowEnd: '05-22',
      windowWraps: 0
    });
    expect(rows).toEqual([]);
  });
});
