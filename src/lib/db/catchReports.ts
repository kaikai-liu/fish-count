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
