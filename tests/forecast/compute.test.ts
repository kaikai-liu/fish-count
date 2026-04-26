// tests/forecast/compute.test.ts
// FCT-01 (statistical projection), FCT-02 (n shown), FCT-03 (n<5 refusal), FCT-06 (idempotence).
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../helpers/seedTestDb';
import { computeCell, recomputeForecasts } from '../../src/lib/forecast/compute';
import { getCellsInRange } from '../../src/lib/db/forecasts';

describe('forecast compute (FCT-01/02/03/06)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('D-07 n<5: returns value=NULL, pi_low=NULL, pi_high=NULL, n_trips populated', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    // Seed 4 prior-year trips on the same calendar slot (n=4, below the n=5 floor).
    for (let i = 0; i < 4; i++) {
      seedTrip(db, {
        boatId,
        landingId,
        date: `202${i + 1}-05-15`,
        tripType: 'Full Day',
        species: 'yellowtail',
        anglers: 20,
        count: 30
      });
    }
    const r = computeCell(db, {
      forecastDate: '2026-05-15',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(r.n_trips).toBe(4);
    expect(r.value).toBeNull();
    expect(r.pi_low).toBeNull();
    expect(r.pi_high).toBeNull();
    expect(r.baseline_value).toBeNull();
  });

  it('D-01 weighted yield = SUM(species_count) / SUM(angler_count) when n>=5', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    // 5 trips, two with high yields, three with low — SUM/SUM ≠ mean-of-ratios.
    // Trip 1: 5 fish / 1 angler = ratio 5.0; sums (5, 1)
    // Trip 2: 5 fish / 1 angler = ratio 5.0; sums (5, 1)
    // Trip 3: 1 fish / 5 anglers = ratio 0.2; sums (1, 5)
    // Trip 4: 1 fish / 5 anglers = ratio 0.2; sums (1, 5)
    // Trip 5: 1 fish / 5 anglers = ratio 0.2; sums (1, 5)
    // SUM/SUM = (5+5+1+1+1) / (1+1+5+5+5) = 13/17 ≈ 0.7647
    // mean-of-ratios = (5+5+0.2+0.2+0.2) / 5 = 2.12  ← would be wrong
    const trips = [
      { date: '2024-05-12', anglers: 1, count: 5 },
      { date: '2024-05-13', anglers: 1, count: 5 },
      { date: '2024-05-14', anglers: 5, count: 1 },
      { date: '2024-05-15', anglers: 5, count: 1 },
      { date: '2024-05-16', anglers: 5, count: 1 }
    ];
    for (const t of trips) {
      seedTrip(db, {
        boatId,
        landingId,
        date: t.date,
        tripType: 'Full Day',
        species: 'yellowtail',
        anglers: t.anglers,
        count: t.count
      });
    }
    const r = computeCell(db, {
      forecastDate: '2026-05-15',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(r.n_trips).toBe(5);
    expect(r.value).toBeCloseTo(13 / 17, 4);
    expect(r.baseline_value).toBeCloseTo(13 / 17, 4); // D-12: equals value for v1
  });

  it('D-04 prediction interval: pi_low <= pi_high (empirical 80% PI)', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    // 10 trips with varied ratios → empirical 10/90 percentiles are well-defined.
    for (let i = 1; i <= 10; i++) {
      seedTrip(db, {
        boatId,
        landingId,
        date: `2024-05-${10 + i}`,
        tripType: 'Full Day',
        species: 'yellowtail',
        anglers: 10,
        count: i * 5
      });
    }
    const r = computeCell(db, {
      forecastDate: '2026-05-15',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(r.pi_low).not.toBeNull();
    expect(r.pi_high).not.toBeNull();
    expect(r.pi_low!).toBeLessThanOrEqual(r.pi_high!);
  });

  it('D-06 n_trips: COUNT(DISTINCT source_date, boat_id, trip_type) — two species rows on same trip = 1 trip', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    // Single trip with two species — yellowtail + bluefin on same date+boat+trip_type.
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
      tripType: 'Full Day',
      species: 'bluefin',
      anglers: 20,
      count: 5
    });
    // Plus 4 more yellowtail trips on different dates so n_trips for yellowtail is 5.
    for (let i = 0; i < 4; i++) {
      seedTrip(db, {
        boatId,
        landingId,
        date: `2023-05-${10 + i}`,
        tripType: 'Full Day',
        species: 'yellowtail',
        anglers: 20,
        count: 30
      });
    }
    const r = computeCell(db, {
      forecastDate: '2026-05-15',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(r.n_trips).toBe(5);
  });

  it('FCT-06 idempotence: recomputeForecasts twice produces identical state', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    for (let i = 0; i < 10; i++) {
      seedTrip(db, {
        boatId,
        landingId,
        date: `2024-05-${10 + i}`,
        tripType: 'Full Day',
        species: 'yellowtail',
        anglers: 20,
        count: 30
      });
    }
    recomputeForecasts(db, { today: '2026-05-15' });
    const before = getCellsInRange(db, {
      fromDate: '2026-05-15',
      toDate: '2026-06-14',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    recomputeForecasts(db, { today: '2026-05-15' });
    const after = getCellsInRange(db, {
      fromDate: '2026-05-15',
      toDate: '2026-06-14',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(after.length).toBe(before.length);
    expect(after.length).toBeGreaterThan(0);
    // value/n_trips unchanged on idempotent re-run
    for (let i = 0; i < before.length; i++) {
      expect(after[i].value).toBe(before[i].value);
      expect(after[i].n_trips).toBe(before[i].n_trips);
    }
  });

  it('D-15 full rebuild scope: writes a row for every today..today+30 × species × trip_type cell', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    // Two species, two trip-types in dataset.
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
      species: 'bluefin',
      anglers: 15,
      count: 10
    });
    recomputeForecasts(db, { today: '2026-05-15' });
    const total = db.prepare('SELECT COUNT(*) AS c FROM forecasts').get() as { c: number };
    // 31 days × 2 species × 2 trip_types = 124 cells
    expect(total.c).toBe(31 * 2 * 2);
  });
});
