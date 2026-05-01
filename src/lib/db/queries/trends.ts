// src/lib/db/queries/trends.ts — Weekly/monthly trend time-series queries.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Sources:
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-06, D-07, D-27
//
// Responsibilities:
//   TRN-01/02: speciesTrend — per-species bucket aggregate across all boats
//   TRN-01/02/03: boatTrend — per-boat bucket aggregate; species is OPTIONAL
//                  (species: undefined => all-species aggregate, used by /compare)
//
// Key contracts:
//   - Weekly bucket: strftime('%G-W%V', source_date) — ISO week + ISO year.
//     This handles the 2024-12-30 → "2025-W01" year-boundary correctly.
//     Must NOT use %W (US week) or %U (US week starting Sunday).
//   - Monthly bucket: strftime('%Y-%m', source_date)
//   - Weighted yield: SUM(species_count) * 1.0 / NULLIF(SUM(angler_count), 0)
//   - Gap-filling: this module returns ONLY buckets with rows. Gap-filling
//     (inserting null-value buckets between present ones) is the ROUTE LOADER's
//     responsibility — keeps the DAL pure.
//   - T-02-06: strftime('%G-W%V', ...) — verified ISO week, NOT %W.
//   - boatTrend template: two prepared statements (per-species vs all-species)
//     to avoid user-input concatenation (T-02-01 SQL injection discipline).
import type Database from 'better-sqlite3';

export interface TrendBucket {
  bucket_key: string;
  value: number | null;
  n_trips: number;
}

export interface SpeciesTrendArgs {
  species: string;
  tripType: string;
  fromDate: string;
  toDate: string;
  granularity: 'daily' | 'weekly' | 'monthly';
}

/**
 * TRN-01/02: Per-species trend buckets across all boats.
 * Returns only buckets with matching rows (gap-fill is loader responsibility).
 */
export function speciesTrend(db: Database.Database, args: SpeciesTrendArgs): TrendBucket[] {
  const bucketExpr =
    args.granularity === 'daily'
      ? "strftime('%Y-%m-%d', source_date)"
      : args.granularity === 'weekly'
        ? "strftime('%G-W%V', source_date)"
        : "strftime('%Y-%m', source_date)";

  return db
    .prepare(
      `SELECT ${bucketExpr} AS bucket_key,
              SUM(species_count) * 1.0 / NULLIF(SUM(angler_count), 0) AS value,
              COUNT(DISTINCT source_date || '|' || trip_type)           AS n_trips
         FROM catch_reports
        WHERE species    = @species
          AND trip_type  = @tripType
          AND source_date BETWEEN @fromDate AND @toDate
        GROUP BY bucket_key
        ORDER BY bucket_key ASC`
    )
    .all({
      species: args.species,
      tripType: args.tripType,
      fromDate: args.fromDate,
      toDate: args.toDate
    }) as TrendBucket[];
}

export interface BoatTrendArgs {
  boatId: number;
  species?: string; // OPTIONAL — undefined => all-species aggregate (used by /compare)
  tripType: string;
  fromDate: string;
  toDate: string;
  granularity: 'daily' | 'weekly' | 'monthly';
}

/**
 * TRN-01/02/03: Per-boat trend buckets.
 *
 * When species is provided, filters to that species.
 * When species is undefined, aggregates across ALL species for the boat
 * (this is the /compare use case — each boat's total per-angler yield
 * across all species within the selected trip type).
 *
 * Two prepared statements (NOT string concatenation) to preserve SQL
 * discipline (T-02-01). The bucketExpr substitution is safe: it resolves
 * to one of two HARD-CODED literals from the typed-enum granularity value.
 *
 * Returns only buckets with rows — gap-fill is loader responsibility.
 */
export function boatTrend(db: Database.Database, args: BoatTrendArgs): TrendBucket[] {
  const bucketExpr =
    args.granularity === 'daily'
      ? "strftime('%Y-%m-%d', source_date)"
      : args.granularity === 'weekly'
        ? "strftime('%G-W%V', source_date)"
        : "strftime('%Y-%m', source_date)";

  if (args.species !== undefined) {
    // Per-species bucket
    return db
      .prepare(
        `SELECT ${bucketExpr} AS bucket_key,
                SUM(species_count) * 1.0 / NULLIF(SUM(angler_count), 0) AS value,
                COUNT(DISTINCT source_date || '|' || trip_type)           AS n_trips
           FROM catch_reports
          WHERE boat_id    = @boatId
            AND trip_type  = @tripType
            AND species    = @species
            AND source_date BETWEEN @fromDate AND @toDate
          GROUP BY bucket_key
          ORDER BY bucket_key ASC`
      )
      .all({
        boatId: args.boatId,
        tripType: args.tripType,
        species: args.species,
        fromDate: args.fromDate,
        toDate: args.toDate
      }) as TrendBucket[];
  }

  // All-species bucket aggregate (species filter omitted)
  return db
    .prepare(
      `SELECT ${bucketExpr} AS bucket_key,
              SUM(species_count) * 1.0 / NULLIF(SUM(angler_count), 0) AS value,
              COUNT(DISTINCT source_date || '|' || trip_type)           AS n_trips
         FROM catch_reports
        WHERE boat_id    = @boatId
          AND trip_type  = @tripType
          AND source_date BETWEEN @fromDate AND @toDate
        GROUP BY bucket_key
        ORDER BY bucket_key ASC`
    )
    .all({
      boatId: args.boatId,
      tripType: args.tripType,
      fromDate: args.fromDate,
      toDate: args.toDate
    }) as TrendBucket[];
}
