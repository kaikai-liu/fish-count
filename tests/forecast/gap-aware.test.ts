// tests/forecast/gap-aware.test.ts
// D-24 gap-day accounting: gap_days_present (success/empty) vs gap_days_expected (M).
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../helpers/seedTestDb';
import { computeCell } from '../../src/lib/forecast/compute';
import { recordOutcome } from '../../src/lib/db/scrapeRuns';

describe('forecast gap-aware aggregation (D-24)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('gap_days_present counts scrape_runs with outcome IN (success, empty)', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    // Seed 5 trips so n>=5 path is exercised.
    for (let i = 0; i < 5; i++) {
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
    // Mark some prior-year window dates as success/empty.
    recordOutcome(db, {
      runId: 'r1',
      runDate: '2024-05-12',
      startedAt: 'x',
      finishedAt: 'x',
      outcome: 'success',
      rowsIngested: 5
    });
    recordOutcome(db, {
      runId: 'r2',
      runDate: '2024-05-13',
      startedAt: 'x',
      finishedAt: 'x',
      outcome: 'empty',
      rowsIngested: 0
    });
    const r = computeCell(db, {
      forecastDate: '2026-05-15',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(r.gap_days_present).toBeGreaterThanOrEqual(2);
    expect(r.gap_days_present).toBeLessThanOrEqual(r.gap_days_expected);
  });

  it('killed/http_error/parse_error outcomes count as gaps (not present)', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    for (let i = 0; i < 5; i++) {
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
    // All non-present outcomes.
    recordOutcome(db, {
      runId: 'r1',
      runDate: '2024-05-12',
      startedAt: 'x',
      finishedAt: 'x',
      outcome: 'killed',
      rowsIngested: 0
    });
    recordOutcome(db, {
      runId: 'r2',
      runDate: '2024-05-13',
      startedAt: 'x',
      finishedAt: 'x',
      outcome: 'http_error',
      rowsIngested: 0
    });
    recordOutcome(db, {
      runId: 'r3',
      runDate: '2024-05-14',
      startedAt: 'x',
      finishedAt: 'x',
      outcome: 'parse_error',
      rowsIngested: 0
    });
    const r = computeCell(db, {
      forecastDate: '2026-05-15',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(r.gap_days_present).toBe(0);
  });

  it('absent scrape_runs row counts as gap (gap_days_present excludes it)', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    for (let i = 0; i < 5; i++) {
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
    // WR-01: enumerateWindowDates is bounded by earliestScrapeRunYear; without
    // any scrape_runs row, gap_days_expected is 0 (we cannot promise coverage
    // we never had). Seed a single unrelated ledger row in a prior year to
    // anchor the expected window, then verify that none of the ±7-day window
    // dates around 05-15 are marked present.
    recordOutcome(db, {
      runId: 'unrelated',
      runDate: '2024-01-01',
      startedAt: 'x',
      finishedAt: 'x',
      outcome: 'success',
      rowsIngested: 1
    });
    const r = computeCell(db, {
      forecastDate: '2026-05-15',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(r.gap_days_present).toBe(0);
    expect(r.gap_days_expected).toBeGreaterThan(0);
  });

  it('gap_days_present <= gap_days_expected always holds (invariant)', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    for (let i = 0; i < 5; i++) {
      seedTrip(db, {
        boatId,
        landingId,
        date: `2024-05-${10 + i}`,
        tripType: 'Full Day',
        species: 'yellowtail',
        anglers: 20,
        count: 30
      });
      recordOutcome(db, {
        runId: `r${i}`,
        runDate: `2024-05-${10 + i}`,
        startedAt: 'x',
        finishedAt: 'x',
        outcome: 'success',
        rowsIngested: 1
      });
    }
    const r = computeCell(db, {
      forecastDate: '2026-05-15',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(r.gap_days_present).toBeLessThanOrEqual(r.gap_days_expected);
  });
});
