// src/lib/db/catchReports.ts — DAL repository for the catch_reports table.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// D-06 + ING-04: idempotent upsert on (source_date, boat_id, trip_type, species).
// This is THE load-bearing invariant — re-running a scrape produces identical
// final state. The UNIQUE index on those four columns (from migrations.ts) is
// enforced here by ON CONFLICT DO UPDATE.
import type Database from 'better-sqlite3';

export interface CatchReportRow {
  source_date: string; // YYYY-MM-DD (produced by src/lib/shared/dates.ts)
  boat_id: number;
  landing_id: number;
  trip_type: string; // verbatim from source (D-05, D-08)
  species: string; // lowercased + trimmed at the Zod boundary (D-03)
  angler_count: number;
  species_count: number;
  scraped_at: string; // ISO-8601 timestamp
}

/**
 * Upsert a batch of catch rows inside a single transaction. Returns the number
 * of rows the caller handed in (not the number actually modified). Running
 * with the same rows twice is a no-op at the data-content level.
 *
 * P7: the transaction body is SYNCHRONOUS — never await inside it.
 */
export function upsertMany(db: Database.Database, rows: CatchReportRow[]): number {
  if (rows.length === 0) return 0;
  const stmt = db.prepare(
    `INSERT INTO catch_reports
       (source_date, boat_id, landing_id, trip_type, species,
        angler_count, species_count, scraped_at)
     VALUES (@source_date, @boat_id, @landing_id, @trip_type, @species,
             @angler_count, @species_count, @scraped_at)
     ON CONFLICT(source_date, boat_id, trip_type, species) DO UPDATE SET
       landing_id    = excluded.landing_id,
       angler_count  = excluded.angler_count,
       species_count = excluded.species_count,
       scraped_at    = excluded.scraped_at`
  );
  const tx = db.transaction((items: CatchReportRow[]) => {
    for (const r of items) stmt.run(r);
  });
  tx(rows);
  return rows.length;
}

/**
 * Count rows for a given source_date. Used by SLA computation (D-24).
 */
export function totalRowsForDate(db: Database.Database, date: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM catch_reports WHERE source_date = ?`)
    .get(date) as { c: number };
  return row.c;
}

/**
 * Fetch all rows for a given source_date, ordered deterministically.
 */
export function getByDate(db: Database.Database, date: string): CatchReportRow[] {
  return db
    .prepare(
      `SELECT source_date, boat_id, landing_id, trip_type, species,
              angler_count, species_count, scraped_at
         FROM catch_reports WHERE source_date = ?
         ORDER BY boat_id, trip_type, species`
    )
    .all(date) as CatchReportRow[];
}

/**
 * Phase 3 (FCT-01 / D-01): per-trip per-angler ratios for a seasonal window.
 *
 * Returns one row per (source_date, boat_id, trip_type) — fleet-wide trip-level
 * granularity matching D-06 / Phase 2 D-09 trip definition. ratio = SUM/SUM
 * over species rows of the same trip (a trip with two species rows still gets
 * one ratio derived from total counts ÷ total anglers).
 *
 * sum_species and sum_anglers are returned alongside ratio so the caller can
 * recompute the fleet-wide weighted yield (D-01) as
 *   value = SUM(sum_species) / SUM(sum_anglers)
 * which is exact SUM/SUM, NOT the (incorrect) mean-of-ratios.
 *
 * Year-boundary wrap (RESEARCH §1, Pitfall 5): when forecast_date is in early
 * January or late December, the ±7-day window can span the year boundary.
 * The caller passes windowWraps=1 in that case and the OR branch fires.
 *
 * Excludes the year of forecastDate itself (only prior years contribute) per
 * D-01 ("all prior years in the dataset") and RESEARCH §5 (gap-year exclusion).
 */
export interface RatioRow {
  source_date: string;
  boat_id: number;
  trip_type: string;
  ratio: number | null;
  sum_species: number;
  sum_anglers: number;
}

export interface RatioWindowArgs {
  forecastYear: number; // e.g. 2026 — rows with strftime('%Y', source_date) < this are eligible
  species: string;
  tripType: string;
  windowStart: string; // 'MM-DD' — inclusive lower bound (e.g. '05-08')
  windowEnd: string; // 'MM-DD' — inclusive upper bound (e.g. '05-22')
  windowWraps: 0 | 1; // 1 when windowStart > windowEnd lexicographically (year-boundary wrap)
}

export function getRatiosForWindow(
  db: Database.Database,
  args: RatioWindowArgs
): RatioRow[] {
  return db
    .prepare(
      `SELECT cr.source_date,
              cr.boat_id,
              cr.trip_type,
              SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS ratio,
              SUM(cr.species_count) AS sum_species,
              SUM(cr.angler_count)  AS sum_anglers
         FROM catch_reports cr
        WHERE cr.species   = @species
          AND cr.trip_type = @tripType
          AND CAST(strftime('%Y', cr.source_date) AS INTEGER) < @forecastYear
          AND (
            (@windowWraps = 0
              AND strftime('%m-%d', cr.source_date) >= @windowStart
              AND strftime('%m-%d', cr.source_date) <= @windowEnd)
            OR
            (@windowWraps = 1
              AND (strftime('%m-%d', cr.source_date) >= @windowStart
                OR strftime('%m-%d', cr.source_date) <= @windowEnd))
          )
        GROUP BY cr.source_date, cr.boat_id, cr.trip_type`
    )
    .all(args) as RatioRow[];
}
