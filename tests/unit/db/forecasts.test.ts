// tests/unit/db/forecasts.test.ts
// Unit tests for src/lib/db/forecasts.ts DAL repository.
// Verifies: idempotent UPSERT (D-11), n<5 NULL semantics (D-07), range read (D-20).
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import {
  upsertMany,
  getCellsInRange,
  pruneBeforeHorizon,
  type ForecastRow
} from '../../../src/lib/db/forecasts';

const FIXED_AT = '2026-04-26T12:00:00Z';

function row(overrides: Partial<ForecastRow> = {}): ForecastRow {
  return {
    forecast_date: '2026-05-15',
    species: 'yellowtail',
    trip_type: 'Full Day',
    value: 8.5,
    pi_low: 4.0,
    pi_high: 12.0,
    n_trips: 12,
    baseline_value: 8.5,
    gap_days_present: 50,
    gap_days_expected: 56,
    computed_at: FIXED_AT,
    ...overrides
  };
}

describe('forecasts DAL', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('schema: forecasts table exists with the 12 expected columns', () => {
    db = openTestDb();
    const cols = db
      .prepare("SELECT name FROM pragma_table_info('forecasts')")
      .all() as { name: string }[];
    const names = cols.map((c) => c.name);
    for (const c of [
      'id',
      'forecast_date',
      'species',
      'trip_type',
      'value',
      'pi_low',
      'pi_high',
      'n_trips',
      'baseline_value',
      'gap_days_present',
      'gap_days_expected',
      'computed_at'
    ]) {
      expect(names).toContain(c);
    }
  });

  it('upsertMany([]) is a no-op and returns 0', () => {
    db = openTestDb();
    expect(upsertMany(db, [])).toBe(0);
  });

  it('upsertMany is idempotent on (forecast_date, species, trip_type)', () => {
    db = openTestDb();
    const r = row();
    upsertMany(db, [r]);
    upsertMany(db, [r]);
    const count = db.prepare('SELECT COUNT(*) AS c FROM forecasts').get() as { c: number };
    expect(count.c).toBe(1);
  });

  it('upsertMany overwrites value, pi_low, pi_high, n_trips on conflict', () => {
    db = openTestDb();
    upsertMany(db, [row({ value: 5.0, n_trips: 6 })]);
    upsertMany(db, [row({ value: 9.0, n_trips: 15 })]);
    const cells = getCellsInRange(db, {
      fromDate: '2026-05-15',
      toDate: '2026-05-15',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(cells).toHaveLength(1);
    expect(cells[0].value).toBe(9.0);
    expect(cells[0].n_trips).toBe(15);
  });

  it('persists NULL value/pi_low/pi_high (D-07 n<5 semantics)', () => {
    db = openTestDb();
    upsertMany(db, [row({ value: null, pi_low: null, pi_high: null, n_trips: 3 })]);
    const cells = getCellsInRange(db, {
      fromDate: '2026-05-15',
      toDate: '2026-05-15',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(cells[0].value).toBeNull();
    expect(cells[0].pi_low).toBeNull();
    expect(cells[0].pi_high).toBeNull();
    expect(cells[0].n_trips).toBe(3);
  });

  it('getCellsInRange filters by date range and returns ASC order', () => {
    db = openTestDb();
    upsertMany(db, [
      row({ forecast_date: '2026-05-13' }),
      row({ forecast_date: '2026-05-15' }),
      row({ forecast_date: '2026-05-17' })
    ]);
    const cells = getCellsInRange(db, {
      fromDate: '2026-05-14',
      toDate: '2026-05-16',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(cells).toHaveLength(1);
    expect(cells[0].forecast_date).toBe('2026-05-15');
  });

  it('getCellsInRange returns multiple matches in ASC order by forecast_date', () => {
    db = openTestDb();
    upsertMany(db, [
      row({ forecast_date: '2026-05-17' }),
      row({ forecast_date: '2026-05-13' }),
      row({ forecast_date: '2026-05-15' })
    ]);
    const cells = getCellsInRange(db, {
      fromDate: '2026-05-12',
      toDate: '2026-05-18',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(cells.map((c) => c.forecast_date)).toEqual(['2026-05-13', '2026-05-15', '2026-05-17']);
  });

  it('getCellsInRange returns empty array when no rows match', () => {
    db = openTestDb();
    const cells = getCellsInRange(db, {
      fromDate: '2026-05-01',
      toDate: '2026-05-31',
      species: 'bluefin',
      tripType: 'Overnight'
    });
    expect(cells).toEqual([]);
  });

  it('pruneBeforeHorizon is a v1 no-op (D-16 retains all past rows)', () => {
    db = openTestDb();
    upsertMany(db, [row({ forecast_date: '2025-01-01' })]);
    expect(pruneBeforeHorizon(db, '2026-01-01')).toBe(0);
    const count = db.prepare('SELECT COUNT(*) AS c FROM forecasts').get() as { c: number };
    expect(count.c).toBe(1);
  });
});
