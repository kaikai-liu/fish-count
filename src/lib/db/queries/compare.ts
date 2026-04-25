// src/lib/db/queries/compare.ts — Multi-boat side-by-side comparison.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Sources:
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-07, D-24, D-25
//
// Responsibilities:
//   TRN-03: compareBoats — aggregate stats per boat in a shared window + trip type
//
// Key contracts:
//   - Defense-in-depth: boatIds.length > 3 throws at function entry (T-02-38).
//     Zod in urlState.ts enforces max 3 at the URL boundary; this is a second layer.
//   - Weighted yield: SUM(species_count) * 1.0 / NULLIF(SUM(angler_count), 0) (T-02-05).
//   - Trip type enforced as a required filter (CLAUDE.md non-negotiable #4 —
//     cross-trip-type comparison must be impossible in the UI).
//   - Returns rows in the order requested; null-substituted for boats with no
//     matching data in the window.
import type Database from 'better-sqlite3';

export interface CompareRow {
  boat_id: number;
  boat_name: string;
  landing_name: string;
  total_trips: number;
  avg_per_angler: number | null;
  top_species: string | null;
  last_trip_date: string | null;
}

export interface CompareArgs {
  boatIds: number[];
  fromDate: string;
  toDate: string;
  tripType: string;
}

/**
 * TRN-03: Return per-boat comparison stats for up to 3 boats in the given window.
 *
 * Throws Error('compareBoats: max 3 boats') if boatIds.length > 3 — this is a
 * defense-in-depth guard on top of the Zod schema at the urlState boundary (T-02-38).
 *
 * Result order matches the order of boatIds. Boats with no matching rows
 * in the window receive a null entry in the returned array.
 */
export function compareBoats(db: Database.Database, args: CompareArgs): (CompareRow | null)[] {
  if (args.boatIds.length > 3) {
    throw new Error('compareBoats: max 3 boats');
  }

  if (args.boatIds.length === 0) return [];

  // Build parameterized IN list — NOT user-input; boatIds are integer IDs
  // already validated by Zod at the URL boundary (T-02-01 discipline).
  const placeholders = args.boatIds.map(() => '?').join(', ');

  // Aggregate stats per boat in window
  const aggregateRows = db
    .prepare(
      `SELECT b.id           AS boat_id,
              b.display_name AS boat_name,
              l.display_name AS landing_name,
              COUNT(DISTINCT cr.source_date || '|' || cr.trip_type) AS total_trips,
              SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS avg_per_angler,
              MAX(cr.source_date) AS last_trip_date
         FROM catch_reports cr
         JOIN boats    b ON b.id = cr.boat_id
         JOIN landings l ON l.id = cr.landing_id
        WHERE cr.boat_id IN (${placeholders})
          AND cr.trip_type   = ?
          AND cr.source_date BETWEEN ? AND ?
        GROUP BY b.id`
    )
    .all(...args.boatIds, args.tripType, args.fromDate, args.toDate) as Omit<
    CompareRow,
    'top_species'
  >[];

  // Build a map for O(1) lookup
  const byBoatId = new Map(aggregateRows.map((r) => [r.boat_id, r]));

  // Per-boat top species (separate query per boat — bounded by max 3)
  const topSpeciesMap = new Map<number, string | null>();
  for (const boatId of args.boatIds) {
    const row = db
      .prepare(
        `SELECT species, SUM(species_count) AS total
           FROM catch_reports
          WHERE boat_id    = ?
            AND trip_type  = ?
            AND source_date BETWEEN ? AND ?
          GROUP BY species
          ORDER BY total DESC
          LIMIT 1`
      )
      .get(boatId, args.tripType, args.fromDate, args.toDate) as
      | { species: string; total: number }
      | undefined;
    topSpeciesMap.set(boatId, row?.species ?? null);
  }

  // Assemble result in requested order; null for boats with no data
  return args.boatIds.map((id) => {
    const agg = byBoatId.get(id);
    if (!agg) return null;
    return {
      ...agg,
      top_species: topSpeciesMap.get(id) ?? null
    };
  });
}
