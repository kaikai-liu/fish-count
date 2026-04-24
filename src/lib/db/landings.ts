// src/lib/db/landings.ts — DAL repository for the landings table.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
// D-02: first-class table, surrogate id + source_name UNIQUE.
import type Database from 'better-sqlite3';

export interface LandingRow {
  id: number;
  source_name: string;
  display_name: string;
  source_url: string | null;
}

/**
 * Insert-or-update a landing by source_name and return its surrogate id.
 * Stable: repeated calls with the same source_name return the same id.
 * Preserves existing source_url when new arg is undefined/null (COALESCE).
 */
export function upsertByName(
  db: Database.Database,
  source_name: string,
  display_name?: string,
  source_url?: string
): number {
  const display = display_name ?? source_name;
  const row = db
    .prepare(
      `INSERT INTO landings (source_name, display_name, source_url)
       VALUES (?, ?, ?)
       ON CONFLICT(source_name) DO UPDATE SET
         display_name = excluded.display_name,
         source_url   = COALESCE(excluded.source_url, landings.source_url)
       RETURNING id`
    )
    .get(source_name, display, source_url ?? null) as { id: number };
  return row.id;
}

export function getById(db: Database.Database, id: number): LandingRow | undefined {
  return db
    .prepare(
      `SELECT id, source_name, display_name, source_url
       FROM landings WHERE id = ?`
    )
    .get(id) as LandingRow | undefined;
}
