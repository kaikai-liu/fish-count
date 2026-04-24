// src/lib/db/boats.ts — DAL repository for the boats table.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
// D-01: surrogate id + source_name UNIQUE + FK to landings.
import type Database from 'better-sqlite3';
import { upsertByName as upsertLandingByName } from './landings';

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

/**
 * Batch helper — resolves the boat + landing FK ids for a batch of parsed
 * catch rows so pipeline.ts can hand fully-populated rows to
 * catchReports.upsertMany. Preserves DAL boundary: the pipeline never
 * issues SQL; this helper composes only typed DAL calls.
 *
 * Order is load-bearing: landings MUST be inserted first because the boats
 * FK requires a valid landing_id. Unique keys are deduped via Map before
 * any DAL call so repeated parse rows for the same boat/landing are a
 * single upsert.
 *
 * Returns two maps keyed by source_name → id for O(1) lookup when mapping
 * parsed rows to CatchReportRow shape.
 */
export interface BoatLandingKeys {
  source_name: string;
  landing_source_name: string;
  source_url?: string;
  landing_source_url?: string;
}

export interface ResolvedIds {
  boatIds: Map<string, number>; // boat source_name → id
  landingIds: Map<string, number>; // landing source_name → id
}

export function upsertBoatsAndLandings(
  db: Database.Database,
  rows: BoatLandingKeys[]
): ResolvedIds {
  const landingIds = new Map<string, number>();
  const boatIds = new Map<string, number>();

  // Unique landings first (FK dependency)
  const landingsByName = new Map<string, { url?: string }>();
  for (const r of rows) {
    if (!landingsByName.has(r.landing_source_name)) {
      landingsByName.set(r.landing_source_name, { url: r.landing_source_url });
    }
  }
  for (const [name, meta] of landingsByName) {
    const id = upsertLandingByName(db, name, name, meta.url);
    landingIds.set(name, id);
  }

  // Boats next — each needs its landing_id resolved.
  const boatsByName = new Map<string, { landing: string; url?: string }>();
  for (const r of rows) {
    if (!boatsByName.has(r.source_name)) {
      boatsByName.set(r.source_name, {
        landing: r.landing_source_name,
        url: r.source_url
      });
    }
  }
  for (const [name, meta] of boatsByName) {
    const landingId = landingIds.get(meta.landing);
    if (landingId === undefined) continue; // defensive: landing must have been inserted
    const boatId = upsertByName(db, name, landingId, name, meta.url);
    boatIds.set(name, boatId);
  }

  return { boatIds, landingIds };
}
