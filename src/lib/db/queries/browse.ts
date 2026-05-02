// src/lib/db/queries/browse.ts — Cross-table reads for /, /date/[d].
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Sources:
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-06, D-07, D-22, D-23
//
// Responsibilities:
//   BRW-01: getRowsForDate — JOIN catch_reports × boats × landings
//   BRW-05: getDateBounds — dataset min/max source_date for /date/[d] clamp
//   BRW-06: distinctTripTypes / distinctLandings / distinctSpecies (filter-bar options)
//   D-10:   mostCommonTripType (Phase 2 helper; consumer retired in Phase 8 Plan 03 with /picker)
import type Database from 'better-sqlite3';

export interface BrowseRow {
  boat_id: number;
  boat_name: string;
  landing_id: number;
  landing_name: string;
  trip_type: string;
  species: string;
  species_count: number;
  angler_count: number;
  boat_source_url: string | null;
  landing_source_url: string | null;
  source_date: string;
}

/**
 * BRW-01: Return all catch rows for a specific source_date,
 * joined with boat and landing display names + source URLs.
 * Returns [] (not null, not throw) when no rows exist for the date.
 */
export function getRowsForDate(db: Database.Database, date: string): BrowseRow[] {
  return db
    .prepare(
      `SELECT cr.source_date,
              cr.boat_id,
              b.display_name  AS boat_name,
              cr.landing_id,
              l.display_name  AS landing_name,
              b.source_url    AS boat_source_url,
              l.source_url    AS landing_source_url,
              cr.trip_type,
              cr.species,
              cr.angler_count,
              cr.species_count
         FROM catch_reports cr
         JOIN boats         b ON b.id = cr.boat_id
         JOIN landings      l ON l.id = cr.landing_id
        WHERE cr.source_date = ?
        ORDER BY l.display_name, b.display_name, cr.trip_type, cr.species`
    )
    .all(date) as BrowseRow[];
}

/**
 * BRW-06: Sorted ascending list of verbatim trip_type strings
 * present in catch_reports. Used for filter-bar options.
 */
export function distinctTripTypes(db: Database.Database): string[] {
  const rows = db
    .prepare(`SELECT DISTINCT trip_type FROM catch_reports ORDER BY trip_type`)
    .all() as { trip_type: string }[];
  return rows.map((r) => r.trip_type);
}

export interface LandingOption {
  id: number;
  display_name: string;
  source_url: string | null;
}

/**
 * BRW-06: Distinct landings that have at least one catch_report row,
 * joined with landing metadata. Used for filter-bar options.
 */
export function distinctLandings(db: Database.Database): LandingOption[] {
  return db
    .prepare(
      `SELECT DISTINCT l.id, l.display_name, l.source_url
         FROM catch_reports cr
         JOIN landings l ON l.id = cr.landing_id
        ORDER BY l.display_name`
    )
    .all() as LandingOption[];
}

/**
 * BRW-06: Sorted ascending list of verbatim species strings
 * present in catch_reports. Used for filter-bar options.
 */
export function distinctSpecies(db: Database.Database): string[] {
  const rows = db
    .prepare(`SELECT DISTINCT species FROM catch_reports ORDER BY species`)
    .all() as { species: string }[];
  return rows.map((r) => r.species);
}

/**
 * D-10: The trip_type with the highest row count across catch_reports.
 * Phase 2 helper; the /picker filter that consumed this default retired
 * in Phase 8 Plan 03. Function preserved as a reusable cross-table query.
 * Returns null when catch_reports is empty.
 */
export function mostCommonTripType(db: Database.Database): string | null {
  const row = db
    .prepare(
      `SELECT trip_type
         FROM catch_reports
        GROUP BY trip_type
        ORDER BY COUNT(*) DESC
        LIMIT 1`
    )
    .get() as { trip_type: string } | undefined;
  return row?.trip_type ?? null;
}

export interface DateBounds {
  min: string | null;
  max: string | null;
}

/**
 * BRW-05: Dataset bounds for /date/[d] navigation clamp.
 * Returns the min/max source_date across all catch_reports.
 * Both fields are null when catch_reports is empty.
 */
export function getDateBounds(db: Database.Database): DateBounds {
  const row = db
    .prepare(
      `SELECT MIN(source_date) AS min, MAX(source_date) AS max
         FROM catch_reports`
    )
    .get() as { min: string | null; max: string | null } | undefined;
  return { min: row?.min ?? null, max: row?.max ?? null };
}
