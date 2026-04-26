// tests/forecast/year-boundary.test.ts
// January / late-December forecast dates → ±7-day window crosses year boundary.
// RESEARCH §1 + Pitfall 5.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../helpers/seedTestDb';
import { computeCell } from '../../src/lib/forecast/compute';

describe('forecast year-boundary wrap (RESEARCH §1, Pitfall 5)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('forecast_date 2026-01-03 → window 12-27..01-10 includes prior-year December dates', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    // Seed December prior-year trips inside the wrap window.
    seedTrip(db, {
      boatId,
      landingId,
      date: '2024-12-31',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2023-12-30',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2022-12-29',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2021-12-28',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2020-12-27',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    const r = computeCell(db, {
      forecastDate: '2026-01-03',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(r.n_trips).toBe(5);
    expect(r.value).not.toBeNull();
  });

  it('forecast_date 2026-01-03 → window 12-27..01-10 includes prior-year January dates', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    // Seed January prior-year trips.
    seedTrip(db, {
      boatId,
      landingId,
      date: '2024-01-05',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2024-01-08',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2023-01-04',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2023-01-09',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2022-01-10',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    const r = computeCell(db, {
      forecastDate: '2026-01-03',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(r.n_trips).toBe(5);
  });

  it('forecast_date 2026-12-28 → window 12-21..01-04 includes following-year January from prior years', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    // Seed early-January prior-year trips (which the late-December forecast must reach).
    seedTrip(db, {
      boatId,
      landingId,
      date: '2025-01-02',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2024-01-03',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2023-01-04',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2022-12-22',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2021-12-25',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    const r = computeCell(db, {
      forecastDate: '2026-12-28',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(r.n_trips).toBe(5);
  });
});
