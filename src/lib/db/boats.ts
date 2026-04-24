// src/lib/db/boats.ts — DAL repository for the boats table.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
// D-01: surrogate id + source_name UNIQUE + FK to landings.
import type Database from 'better-sqlite3';

export interface BoatRow {
  id: number;
  source_name: string;
  display_name: string;
  landing_id: number | null;
  source_url: string | null;
}

/**
 * Insert-or-update a boat by source_name and return its surrogate id.
 * On conflict: landing_id is overwritten (boats do move between landings);
 * source_url is preserved when the new value is null (COALESCE) so an upsert
 * without URL doesn't wipe a previously-captured URL.
 */
export function upsertByName(
  db: Database.Database,
  source_name: string,
  landing_id: number,
  display_name?: string,
  source_url?: string
): number {
  const display = display_name ?? source_name;
  const row = db
    .prepare(
      `INSERT INTO boats (source_name, display_name, landing_id, source_url)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(source_name) DO UPDATE SET
         display_name = excluded.display_name,
         landing_id   = excluded.landing_id,
         source_url   = COALESCE(excluded.source_url, boats.source_url)
       RETURNING id`
    )
    .get(source_name, display, landing_id, source_url ?? null) as { id: number };
  return row.id;
}

export function getById(db: Database.Database, id: number): BoatRow | undefined {
  return db
    .prepare(
      `SELECT id, source_name, display_name, landing_id, source_url
       FROM boats WHERE id = ?`
    )
    .get(id) as BoatRow | undefined;
}
