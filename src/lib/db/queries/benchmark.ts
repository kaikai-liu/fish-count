// src/lib/db/queries/benchmark.ts — Read queries for the FCT-04 benchmark script.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL — these
// helpers exist so scripts/forecast-benchmark.ts can stay SQL-free.
//
// All four helpers are pure read-only queries with parameterized `?` placeholders
// (T-03-22 mitigation: no string interpolation of caller-supplied values).
import type Database from 'better-sqlite3';

/**
 * Actual outcome for a held-out (date, species, trip_type) cell.
 * Returns the fleet-wide weighted yield (SUM/SUM) for that calendar slot, or
 * null when no rows exist or all anglers are zero.
 */
export function actualForCell(
  db: Database.Database,
  date: string,
  species: string,
  tripType: string
): number | null {
  const row = db
    .prepare(
      `SELECT SUM(species_count) * 1.0 / NULLIF(SUM(angler_count), 0) AS value
         FROM catch_reports
        WHERE species = ?
          AND trip_type = ?
          AND source_date = ?`
    )
    .get(species, tripType, date) as { value: number | null } | undefined;
  return row?.value ?? null;
}

/**
 * Fleet-mean baseline: single weighted-yield mean across ALL prior-year trips
 * for (species, trip_type), with no seasonal window. Variant 2 in D-19.
 *
 * Returns null when no prior-year rows exist or all anglers are zero.
 */
export function fleetMeanForecast(
  db: Database.Database,
  species: string,
  tripType: string,
  heldOutYear: number
): number | null {
  const row = db
    .prepare(
      `SELECT SUM(species_count) * 1.0 / NULLIF(SUM(angler_count), 0) AS value
         FROM catch_reports
        WHERE species = ?
          AND trip_type = ?
          AND CAST(strftime('%Y', source_date) AS INTEGER) < ?`
    )
    .get(species, tripType, heldOutYear) as { value: number | null } | undefined;
  return row?.value ?? null;
}

/**
 * Determine the held-out year. When override is provided, returns it directly;
 * otherwise returns the most recent year with catch_reports data, or null when
 * the dataset is empty.
 */
export function determineHeldOutYear(
  db: Database.Database,
  override?: number
): number | null {
  if (override !== undefined) return override;
  const row = db
    .prepare(
      `SELECT MAX(CAST(strftime('%Y', source_date) AS INTEGER)) AS y
         FROM catch_reports`
    )
    .get() as { y: number | null } | undefined;
  return row?.y ?? null;
}

/**
 * Enumerate distinct source_date values present in the held-out year, sorted
 * ascending. Empty array when the year has no data.
 */
export function enumerateHeldOutDates(
  db: Database.Database,
  year: number
): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT source_date FROM catch_reports
        WHERE CAST(strftime('%Y', source_date) AS INTEGER) = ?
        ORDER BY source_date ASC`
    )
    .all(year) as { source_date: string }[];
  return rows.map((r) => r.source_date);
}
