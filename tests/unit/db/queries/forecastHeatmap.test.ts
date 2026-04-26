// tests/unit/db/queries/forecastHeatmap.test.ts
// Shape-contract tests for forecastHeatmapForQuery (FCT-05, D-20).
//
// The first three fields {date, value, n} preserve the Phase 2 D-15 contract
// so the picker loader can merge actuals + forecasts into a single 30-cell
// heatmap and buildHeatmapOption only needs a tooltip-formatter branch.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../../helpers/in-memory-db';
import { upsertMany, type ForecastRow } from '../../../../src/lib/db/forecasts';
import { forecastHeatmapForQuery } from '../../../../src/lib/db/queries/forecastHeatmap';

const NOW = '2026-04-26T12:00:00Z';
function fr(over: Partial<ForecastRow> = {}): ForecastRow {
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
    computed_at: NOW,
    ...over
  };
}

describe('forecastHeatmapForQuery (D-20)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('returns shape {date, value, n, pi_low, pi_high, gap_present, gap_expected}', () => {
    db = openTestDb();
    upsertMany(db, [fr()]);
    const cells = forecastHeatmapForQuery(db, {
      fromDate: '2026-05-15',
      toDate: '2026-05-15',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(cells).toHaveLength(1);
    const c = cells[0];
    expect(c.date).toBe('2026-05-15');
    expect(c.value).toBe(8.5);
    expect(c.n).toBe(12);
    expect(c.pi_low).toBe(4.0);
    expect(c.pi_high).toBe(12.0);
    expect(c.gap_present).toBe(50);
    expect(c.gap_expected).toBe(56);
  });

  it('preserves Phase 2 D-15 shape — date/value/n keys are present', () => {
    db = openTestDb();
    upsertMany(db, [fr()]);
    const cells = forecastHeatmapForQuery(db, {
      fromDate: '2026-05-15',
      toDate: '2026-05-15',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    const keys = Object.keys(cells[0]);
    // The contract: 'date', 'value', 'n' MUST be present (additive fields are extra).
    expect(keys).toContain('date');
    expect(keys).toContain('value');
    expect(keys).toContain('n');
  });

  it('n<5 cell: value/pi_low/pi_high are null (D-07 flows through)', () => {
    db = openTestDb();
    upsertMany(db, [fr({ value: null, pi_low: null, pi_high: null, n_trips: 3 })]);
    const cells = forecastHeatmapForQuery(db, {
      fromDate: '2026-05-15',
      toDate: '2026-05-15',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(cells[0].value).toBeNull();
    expect(cells[0].pi_low).toBeNull();
    expect(cells[0].pi_high).toBeNull();
    expect(cells[0].n).toBe(3);
  });

  it('filters by date range (BETWEEN inclusive) and returns ASC order', () => {
    db = openTestDb();
    upsertMany(db, [
      fr({ forecast_date: '2026-05-13' }),
      fr({ forecast_date: '2026-05-15' }),
      fr({ forecast_date: '2026-05-17' })
    ]);
    const cells = forecastHeatmapForQuery(db, {
      fromDate: '2026-05-14',
      toDate: '2026-05-16',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(cells.map((c) => c.date)).toEqual(['2026-05-15']);
  });

  it('multiple in-range rows return ASC by forecast_date', () => {
    db = openTestDb();
    upsertMany(db, [
      fr({ forecast_date: '2026-05-17' }),
      fr({ forecast_date: '2026-05-13' }),
      fr({ forecast_date: '2026-05-15' })
    ]);
    const cells = forecastHeatmapForQuery(db, {
      fromDate: '2026-05-13',
      toDate: '2026-05-17',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(cells.map((c) => c.date)).toEqual(['2026-05-13', '2026-05-15', '2026-05-17']);
  });

  it('filters by species + trip_type independently', () => {
    db = openTestDb();
    upsertMany(db, [
      fr({ species: 'yellowtail', trip_type: 'Full Day' }),
      fr({ species: 'bluefin', trip_type: 'Full Day' }),
      fr({ species: 'yellowtail', trip_type: 'Overnight' })
    ]);
    const cells = forecastHeatmapForQuery(db, {
      fromDate: '2026-05-15',
      toDate: '2026-05-15',
      species: 'yellowtail',
      tripType: 'Full Day'
    });
    expect(cells).toHaveLength(1);
  });

  it('returns empty array (not null/undefined) when no rows match', () => {
    db = openTestDb();
    const cells = forecastHeatmapForQuery(db, {
      fromDate: '2026-05-01',
      toDate: '2026-05-31',
      species: 'bluefin',
      tripType: 'Overnight'
    });
    expect(cells).toEqual([]);
    expect(Array.isArray(cells)).toBe(true);
  });
});
