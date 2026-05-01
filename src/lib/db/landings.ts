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

/**
 * D-14 (Phase 6): Lookup a landing by exact display_name match.
 * Case-sensitive — landings use plain URL-encoded names, not slugs.
 * Returns undefined when no landing with that display_name exists.
 */
export function getByName(db: Database.Database, name: string): LandingRow | undefined {
  return db
    .prepare(`SELECT id, source_name, display_name, source_url FROM landings WHERE display_name = ?`)
    .get(name) as LandingRow | undefined;
}

/**
 * D-08 (Phase 6): Cross-axis default for the landing ticker.
 * Returns the landing with the most-recent source_date across all boats at that landing.
 * Tie-break: alphabetical by display_name ASC.
 * Returns null when catch_reports is empty.
 */
export function mostRecentlyActiveLanding(db: Database.Database): LandingRow | null {
  return (db.prepare(`
    SELECT l.id, l.source_name, l.display_name, l.source_url
      FROM landings l
      JOIN catch_reports cr ON cr.landing_id = l.id
     GROUP BY l.id
     ORDER BY MAX(cr.source_date) DESC, l.display_name ASC
     LIMIT 1
  `).get() as LandingRow | undefined) ?? null;
}
