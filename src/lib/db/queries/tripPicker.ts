// src/lib/db/queries/tripPicker.ts — Trip picker ranking + heatmap data.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Sources:
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-06, D-07, D-08, D-09, D-13, D-15
//
// Responsibilities:
//   TRP-02/03: rankBoatsForQuery — weighted per-angler yield ranking
//   TRP-08/09: heatmapForQuery — 30-cell heatmap data (Phase 3 swap contract preserved)
//
// Critical invariants:
//   D-08: weighted yield = SUM(species_count) * 1.0 / NULLIF(SUM(angler_count), 0)
//         NOT mean-of-ratios. Acceptance: trip A (5/5) + trip B (5/1) -> 10/6 ≈ 1.667
//   D-09: n_trips = COUNT(DISTINCT source_date || '|' || trip_type) — not row count.
//         Two species rows on the same (date, trip_type) = 1 trip.
//   TRP-07: Never HAVING n_trips >= 5 — low-n boats must remain in results.
//   T-02-05: NULLIF(SUM(angler_count), 0) guards divide-by-zero.
import type Database from 'better-sqlite3';

export interface RankedBoat {
  boat_id: number;
  boat_name: string;
  landing_name: string;
  avg_per_angler: number | null;
  n_trips: number;
  last_trip_date: string;
  trip_type: string;
}

export interface RankArgs {
  fromDate: string;
  toDate: string;
  species: string;
  tripType: string;
}

/**
 * TRP-02/03: Rank all boats by weighted per-angler yield for the given
 * (species, tripType, date window). Returns all boats in the window,
 * sorted DESC by avg_per_angler (NULLs last), then DESC by n_trips.
 *
 * Per TRP-07, boats with low n_trips are NOT filtered — the caller
 * (route loader + PerAnglerMetric component) renders the "low data" flag.
 */
export function rankBoatsForQuery(db: Database.Database, args: RankArgs): RankedBoat[] {
  return db
    .prepare(
      `SELECT cr.boat_id,
              b.display_name AS boat_name,
              l.display_name AS landing_name,
              SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS avg_per_angler,
              COUNT(DISTINCT cr.source_date || '|' || cr.trip_type)           AS n_trips,
              MAX(cr.source_date)                                               AS last_trip_date,
              cr.trip_type
         FROM catch_reports cr
         JOIN boats         b ON b.id = cr.boat_id
         JOIN landings      l ON l.id = cr.landing_id
        WHERE cr.species    = @species
          AND cr.trip_type  = @tripType
          AND cr.source_date BETWEEN @fromDate AND @toDate
        GROUP BY cr.boat_id
        ORDER BY avg_per_angler DESC NULLS LAST, n_trips DESC`
    )
    .all({
      species: args.species,
      tripType: args.tripType,
      fromDate: args.fromDate,
      toDate: args.toDate
    }) as RankedBoat[];
}

export interface HeatmapCell {
  date: string;
  value: number | null;
  n: number;
}

export interface HeatmapArgs {
  fromDate: string;
  toDate: string;
  species: string;
  tripType: string;
}

/**
 * TRP-08/09: Return per-date aggregate for the heatmap, preserving the
 * Phase 3 swap contract (D-15): shape is always {date, value, n} tuples.
 *
 * Only dates WITH matching rows are returned. The route loader is responsible
 * for gap-filling the full 30-cell array (using addDays from dates.ts) and
 * rendering gray cells where value=null or n<5.
 *
 * Phase 3 will swap this from "historical average" to precomputed forecast
 * without changing the {date, value, n} shape contract.
 */
export function heatmapForQuery(db: Database.Database, args: HeatmapArgs): HeatmapCell[] {
  return db
    .prepare(
      `SELECT cr.source_date                                                     AS date,
              SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0)    AS value,
              COUNT(DISTINCT cr.source_date || '|' || cr.trip_type)             AS n
         FROM catch_reports cr
        WHERE cr.species    = @species
          AND cr.trip_type  = @tripType
          AND cr.source_date BETWEEN @fromDate AND @toDate
        GROUP BY cr.source_date
        ORDER BY cr.source_date ASC`
    )
    .all({
      species: args.species,
      tripType: args.tripType,
      fromDate: args.fromDate,
      toDate: args.toDate
    }) as HeatmapCell[];
}
