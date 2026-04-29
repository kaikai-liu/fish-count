// src/lib/db/queries/alertEval.ts
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Phase 4 ALT-09/10 cross-table reads for the evaluator math. Evaluators
// (src/lib/alerts/evaluators/*.ts) call THESE functions; they never inline SQL.
//
// Per-angler discipline (CLAUDE.md non-negotiable #4 + Phase 3 D-08 SUM/SUM):
//   per_angler = SUM(species_count) / SUM(angler_count)   -- never AVG of per-trip ratios.
//
// Sample-size honesty (CLAUDE.md non-negotiable #3 extended to alerts):
//   Trailing windows surface n_days; year-ago windows surface n_trips.
//   Evaluators refuse to fire when n < 5 (Pitfall 5 spirit).
import type Database from 'better-sqlite3';

export interface TodayBoatTripStat {
  boat_id: number;
  boat_display_name: string;
  trip_type: string;
  today_value: number; // SUM(species_count) / SUM(angler_count) for the (boat, trip_type) today
  today_anglers: number; // SUM(angler_count) for the (boat, trip_type) today
  species_list: string[]; // distinct species reported today on this (boat, trip_type)
}

/**
 * Fleet-wide rows for `today`, grouped by (boat, trip_type), with
 * per-angler value (SUM/SUM, NOT mean-of-ratios) + total angler count +
 * sorted species list.
 *
 * Two prepared statements: aggregate stats + species roll-up. Avoids
 * JSON_GROUP_ARRAY portability concerns (Phase 1 D-06 pattern).
 */
export function getTodayPerBoatTripStats(
  db: Database.Database,
  today: string
): TodayBoatTripStat[] {
  const stats = db
    .prepare(
      `SELECT cr.boat_id AS boat_id,
              b.display_name AS boat_display_name,
              cr.trip_type AS trip_type,
              CAST(SUM(cr.species_count) AS REAL) / NULLIF(SUM(cr.angler_count), 0) AS today_value,
              SUM(cr.angler_count) AS today_anglers
         FROM catch_reports cr
         JOIN boats b ON b.id = cr.boat_id
        WHERE cr.source_date = ?
        GROUP BY cr.boat_id, cr.trip_type`
    )
    .all(today) as Array<{
    boat_id: number;
    boat_display_name: string;
    trip_type: string;
    today_value: number | null;
    today_anglers: number;
  }>;

  const speciesStmt = db.prepare(
    `SELECT DISTINCT species FROM catch_reports
      WHERE source_date = ? AND boat_id = ? AND trip_type = ?
      ORDER BY species ASC`
  );

  return stats
    .filter((r) => r.today_value !== null && Number.isFinite(r.today_value))
    .map((r) => ({
      boat_id: r.boat_id,
      boat_display_name: r.boat_display_name,
      trip_type: r.trip_type,
      today_value: r.today_value as number,
      today_anglers: r.today_anglers,
      species_list: (
        speciesStmt.all(today, r.boat_id, r.trip_type) as Array<{ species: string }>
      ).map((x) => x.species)
    }));
}

export interface TrailingBoatTripStat {
  boat_id: number;
  trip_type: string;
  trailing_avg: number;
  n_days: number; // distinct source_date count in window — sample-size floor input
}

/**
 * Trailing same-(boat, trip_type) per-angler average over the
 * strict-exclusive (today - dayCount, today) window.
 *
 * Returns one row per (boat, trip_type) that has any data in the window.
 * Caller (evaluateHotDay) filters out rows with n_days < 5 (CLAUDE.md
 * non-negotiable #3 honesty floor).
 *
 * W6 fix: inclusive `>=` lower bound combined with strict `<` upper bound
 * so the window is exactly `dayCount` calendar days, not `dayCount + 1`.
 * Example: dayCount=30, today=2026-04-15 -> date(today, '-30 days') =
 * 2026-03-16; window = 2026-03-16 .. 2026-04-14 inclusive (30 distinct
 * dates). Using strict `>` would clip to 29 days; using `<=` on the upper
 * bound would include `today` itself (incorrect — `today` is the comparison
 * cell, not part of the baseline).
 *
 * SECURITY (T-04-A5): the dayCount fragment `'-' || ? || ' days'` builds a
 * SQLite date-modifier from a numeric parameter, not from caller-supplied
 * strings; numeric coercion via the prepared-statement layer prevents
 * injection.
 */
export function getTrailingBoatTripStats(
  db: Database.Database,
  today: string,
  dayCount = 30
): Map<string, TrailingBoatTripStat> {
  const rows = db
    .prepare(
      `SELECT cr.boat_id AS boat_id,
              cr.trip_type AS trip_type,
              CAST(SUM(cr.species_count) AS REAL) / NULLIF(SUM(cr.angler_count), 0) AS trailing_avg,
              COUNT(DISTINCT cr.source_date) AS n_days
         FROM catch_reports cr
        WHERE cr.source_date >= date(?, '-' || ? || ' days')
          AND cr.source_date < ?
        GROUP BY cr.boat_id, cr.trip_type`
    )
    .all(today, dayCount, today) as Array<{
    boat_id: number;
    trip_type: string;
    trailing_avg: number | null;
    n_days: number;
  }>;
  const map = new Map<string, TrailingBoatTripStat>();
  for (const r of rows) {
    if (r.trailing_avg === null || !Number.isFinite(r.trailing_avg)) continue;
    map.set(`${r.boat_id}:${r.trip_type}`, {
      boat_id: r.boat_id,
      trip_type: r.trip_type,
      trailing_avg: r.trailing_avg,
      n_days: r.n_days
    });
  }
  return map;
}

// ---------- Phase 4 ALT-10 species queries (Task 2 — appended below for single-file DAL) ----------

export interface Rolling7SpeciesStat {
  rolling7_avg: number;
  n_boats: number;
  n_trips: number;
}

/**
 * Fleet-wide rolling 7-day SUM/SUM for (species, trip_type) over [today-6, today].
 * Returns null when no rows match (caller refuses to fire on null).
 */
export function getRolling7SpeciesStats(
  db: Database.Database,
  today: string,
  tripType: string,
  species: string
): Rolling7SpeciesStat | null {
  const row = db
    .prepare(
      `SELECT CAST(SUM(species_count) AS REAL) / NULLIF(SUM(angler_count), 0) AS rolling7_avg,
              COUNT(DISTINCT boat_id) AS n_boats,
              COUNT(*) AS n_trips
         FROM catch_reports
        WHERE source_date >= date(?, '-6 days')
          AND source_date <= ?
          AND trip_type = ?
          AND species = ?`
    )
    .get(today, today, tripType, species) as
    | { rolling7_avg: number | null; n_boats: number; n_trips: number }
    | undefined;
  if (!row || row.rolling7_avg === null || !Number.isFinite(row.rolling7_avg)) return null;
  return { rolling7_avg: row.rolling7_avg, n_boats: row.n_boats, n_trips: row.n_trips };
}

export interface YearAgoSpeciesStat {
  year_ago_avg: number;
  n_trips: number;
}

/**
 * Fleet-wide same-week-last-year SUM/SUM for (species, trip_type) over
 * [today - 1y - 3d, today - 1y + 3d]. Returns null when no rows match.
 */
export function getYearAgoSpeciesStats(
  db: Database.Database,
  today: string,
  tripType: string,
  species: string
): YearAgoSpeciesStat | null {
  const row = db
    .prepare(
      `SELECT CAST(SUM(species_count) AS REAL) / NULLIF(SUM(angler_count), 0) AS year_ago_avg,
              COUNT(*) AS n_trips
         FROM catch_reports
        WHERE source_date >= date(?, '-1 year', '-3 days')
          AND source_date <= date(?, '-1 year', '+3 days')
          AND trip_type = ?
          AND species = ?`
    )
    .get(today, today, tripType, species) as
    | { year_ago_avg: number | null; n_trips: number }
    | undefined;
  if (!row || row.year_ago_avg === null || !Number.isFinite(row.year_ago_avg)) return null;
  return { year_ago_avg: row.year_ago_avg, n_trips: row.n_trips };
}

/**
 * Returns the species' modal trip_type over [today - lookbackDays, today],
 * or null when no rows exist for that species in the lookback window.
 *
 * Anchor for the starting-to-run comparison (research §A3): the species' most
 * commonly reported trip_type in recent days defines the comparison anchor —
 * a single boat going on a tear is not "the run" because we always compare
 * within the modal trip_type's fleet-wide rolling window.
 */
export function getModalTripTypeForSpecies(
  db: Database.Database,
  today: string,
  species: string,
  lookbackDays = 30
): string | null {
  const row = db
    .prepare(
      `SELECT trip_type, SUM(species_count) AS total
         FROM catch_reports
        WHERE source_date >= date(?, '-' || ? || ' days')
          AND source_date <= ?
          AND species = ?
        GROUP BY trip_type
        ORDER BY total DESC
        LIMIT 1`
    )
    .get(today, lookbackDays, today, species) as
    | { trip_type: string; total: number }
    | undefined;
  return row?.trip_type ?? null;
}
