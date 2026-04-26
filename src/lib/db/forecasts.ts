// src/lib/db/forecasts.ts — DAL repository for the forecasts table.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// D-11 + FCT-01: idempotent upsert on (forecast_date, species, trip_type).
// D-07: ALL cells written regardless of n; value/pi_low/pi_high are NULL when n_trips<5.
// D-12: baseline_value populated whenever computable; equals value for v1.
// D-16: past forecast rows are NEVER recomputed (pruneBeforeHorizon is a v1 stub).
import type Database from 'better-sqlite3';

export interface ForecastRow {
  forecast_date: string; // YYYY-MM-DD PT (sole producer: src/lib/shared/dates.ts)
  species: string;
  trip_type: string; // verbatim domain language (CLAUDE.md)
  value: number | null; // NULL when n_trips < 5 (D-07)
  pi_low: number | null; // 10th percentile of per-trip ratios; NULL when n_trips<5
  pi_high: number | null; // 90th percentile of per-trip ratios; NULL when n_trips<5
  n_trips: number; // COUNT(DISTINCT source_date, boat_id, trip_type) — D-06
  baseline_value: number | null; // FCT-04 audit column; equals value in v1 per D-12
  gap_days_present: number; // count of input dates with scrape_runs.outcome IN ('success','empty')
  gap_days_expected: number; // count of input dates expected (excludes forecast year per RESEARCH §5)
  computed_at: string; // ISO-8601 timestamp
}

export interface GetCellsArgs {
  fromDate: string;
  toDate: string;
  species: string;
  tripType: string;
}

/**
 * Upsert a batch of forecast rows inside a single transaction.
 * Idempotent: re-running with same input produces identical final state.
 * Pattern: catchReports.ts upsertMany lines 28-47.
 */
export function upsertMany(db: Database.Database, rows: ForecastRow[]): number {
  if (rows.length === 0) return 0;
  const stmt = db.prepare(
    `INSERT INTO forecasts
       (forecast_date, species, trip_type, value, pi_low, pi_high,
        n_trips, baseline_value, gap_days_present, gap_days_expected, computed_at)
     VALUES (@forecast_date, @species, @trip_type, @value, @pi_low, @pi_high,
             @n_trips, @baseline_value, @gap_days_present, @gap_days_expected, @computed_at)
     ON CONFLICT(forecast_date, species, trip_type) DO UPDATE SET
       value             = excluded.value,
       pi_low            = excluded.pi_low,
       pi_high           = excluded.pi_high,
       n_trips           = excluded.n_trips,
       baseline_value    = excluded.baseline_value,
       gap_days_present  = excluded.gap_days_present,
       gap_days_expected = excluded.gap_days_expected,
       computed_at       = excluded.computed_at`
  );
  const tx = db.transaction((items: ForecastRow[]) => {
    for (const r of items) stmt.run(r);
  });
  tx(rows);
  return rows.length;
}

/**
 * Read cells for a (species, trip_type, date-range) — used by forecastHeatmap query
 * and by tests. Returns rows ordered ASC by forecast_date.
 */
export function getCellsInRange(db: Database.Database, args: GetCellsArgs): ForecastRow[] {
  return db
    .prepare(
      `SELECT forecast_date, species, trip_type, value, pi_low, pi_high,
              n_trips, baseline_value, gap_days_present, gap_days_expected, computed_at
         FROM forecasts
        WHERE species = @species
          AND trip_type = @tripType
          AND forecast_date BETWEEN @fromDate AND @toDate
        ORDER BY forecast_date ASC`
    )
    .all(args) as ForecastRow[];
}

/**
 * D-16 stub for v1: past forecast rows are retained indefinitely.
 * Reserved for a future retention policy. v1 implementation: no-op.
 */
export function pruneBeforeHorizon(_db: Database.Database, _cutoffDate: string): number {
  return 0;
}
