// src/lib/db/queries/forecastHeatmap.ts — Read query for the /picker hybrid heatmap.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// D-20: returns the same {date, value, n} shape as Phase 2's heatmapForQuery so the
// /picker loader can merge the two sources into a single unified 30-cell array, and
// buildHeatmapOption only needs a tooltip-formatter branch (Plan 03-04) — no
// rendering changes.
//
// Additive fields (pi_low, pi_high, gap_present, gap_expected) carry the forecast
// metadata for the tooltip enrichment in Plan 03-04. Phase 2 actual cells lack
// these fields; the tooltip formatter discriminates by `'pi_low' in cell`.
//
// Sources:
//   .planning/phases/03-forecast-layer/03-CONTEXT.md D-20, D-21, D-07
//   .planning/phases/03-forecast-layer/03-PATTERNS.md §forecastHeatmap.ts
import type Database from 'better-sqlite3';

export interface ForecastHeatmapCell {
  date: string;             // YYYY-MM-DD (from forecast_date)
  value: number | null;     // weighted-yield mean; NULL when n_trips < 5 (D-07)
  n: number;                // = n_trips (Phase 2 D-15 contract field name)
  pi_low: number | null;    // 10th percentile; NULL when n_trips < 5
  pi_high: number | null;   // 90th percentile; NULL when n_trips < 5
  gap_present: number;      // gap_days_present (D-24)
  gap_expected: number;     // gap_days_expected (D-24)
}

export interface ForecastHeatmapArgs {
  fromDate: string;
  toDate: string;
  species: string;
  tripType: string;
}

/**
 * D-20: Return per-date forecast cells in the same {date, value, n} shape as
 * Phase 2's heatmapForQuery, plus optional forecast metadata fields.
 *
 * Returns only dates WITH a row in `forecasts`. The /picker loader is
 * responsible for gap-filling the full 30-cell array (using addDays from
 * dates.ts) and rendering gray cells where value=null or n<5 — same pattern
 * as Phase 2.
 */
export function forecastHeatmapForQuery(
  db: Database.Database,
  args: ForecastHeatmapArgs
): ForecastHeatmapCell[] {
  return db
    .prepare(
      `SELECT forecast_date     AS date,
              value,
              n_trips           AS n,
              pi_low,
              pi_high,
              gap_days_present  AS gap_present,
              gap_days_expected AS gap_expected
         FROM forecasts
        WHERE species   = @species
          AND trip_type = @tripType
          AND forecast_date BETWEEN @fromDate AND @toDate
        ORDER BY forecast_date ASC`
    )
    .all({
      species: args.species,
      tripType: args.tripType,
      fromDate: args.fromDate,
      toDate: args.toDate
    }) as ForecastHeatmapCell[];
}
