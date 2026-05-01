// src/lib/db/boats.ts — DAL repository for the boats table.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
// D-01: surrogate id + source_name UNIQUE + FK to landings.
// Phase 6: boats.slug column — frozen-at-first-seen per D-13.
import type Database from 'better-sqlite3';
import { upsertByName as upsertLandingByName } from './landings';
import { slugify, uniqueSlug } from '$lib/shared/slug';

export interface BoatRow {
  id: number;
  source_name: string;
  display_name: string;
  landing_id: number | null;
  source_url: string | null;
  slug: string;
}

/**
 * Insert-or-update a boat by source_name and return its surrogate id.
 * On conflict: landing_id is overwritten (boats do move between landings);
 * source_url is preserved when the new value is null (COALESCE) so an upsert
 * without URL doesn't wipe a previously-captured URL.
 * D-13: slug is set on INSERT only; NOT included in the ON CONFLICT UPDATE clause.
 */
export function upsertByName(
  db: Database.Database,
  source_name: string,
  landing_id: number,
  display_name?: string,
  source_url?: string | null,
  slug?: string
): number {
  const display = display_name ?? source_name;
  const row = db
    .prepare(
      `INSERT INTO boats (source_name, display_name, landing_id, source_url, slug)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(source_name) DO UPDATE SET
         display_name = excluded.display_name,
         landing_id   = excluded.landing_id,
         source_url   = COALESCE(excluded.source_url, boats.source_url)
       RETURNING id`
    )
    .get(source_name, display, landing_id, source_url ?? null, slug ?? null) as { id: number };
  return row.id;
}

export function getById(db: Database.Database, id: number): BoatRow | undefined {
  return db
    .prepare(
      `SELECT id, source_name, display_name, landing_id, source_url, slug
       FROM boats WHERE id = ?`
    )
    .get(id) as BoatRow | undefined;
}

export interface BoatWithLanding {
  boat: {
    id: number;
    display_name: string;
    source_url: string | null;
    slug: string;
  };
  landing: {
    id: number;
    display_name: string;
    source_url: string | null;
  };
}

/**
 * Phase 2 (BOAT-01/02, D-23): Fetch a boat joined with its landing for
 * the /boats/[id] detail page. Returns null when the boat does not exist
 * or has no landing FK (which should not happen in a well-formed DB).
 */
export function getByIdWithLanding(
  db: Database.Database,
  id: number
): BoatWithLanding | null {
  const row = db
    .prepare(
      `SELECT b.id           AS boat_id,
              b.display_name AS boat_display_name,
              b.source_url   AS boat_source_url,
              b.slug         AS boat_slug,
              l.id           AS landing_id,
              l.display_name AS landing_display_name,
              l.source_url   AS landing_source_url
         FROM boats    b
         JOIN landings l ON l.id = b.landing_id
        WHERE b.id = ?`
    )
    .get(id) as {
    boat_id: number;
    boat_display_name: string;
    boat_source_url: string | null;
    boat_slug: string;
    landing_id: number;
    landing_display_name: string;
    landing_source_url: string | null;
  } | undefined;

  if (!row) return null;

  return {
    boat: {
      id: row.boat_id,
      display_name: row.boat_display_name,
      source_url: row.boat_source_url,
      slug: row.boat_slug
    },
    landing: {
      id: row.landing_id,
      display_name: row.landing_display_name,
      source_url: row.landing_source_url
    }
  };
}

/**
 * Phase 6 (D-12): Look up a boat by its frozen URL slug.
 * Returns undefined if no matching slug exists.
 */
export function findBySlug(db: Database.Database, slug: string): BoatRow | undefined {
  return db
    .prepare(
      `SELECT id, source_name, display_name, landing_id, source_url, slug
         FROM boats WHERE slug = ?`
    )
    .get(slug) as BoatRow | undefined;
}

/**
 * Phase 6 (D-09, D-11): Returns all boats ordered by activity (COUNT DISTINCT trip-days)
 * over the last `days` days, descending. Tie-break: display_name ASC.
 * Includes boats with zero activity in the window (LEFT JOIN) — "all boats ever."
 */
export function listBoatsByActivity(db: Database.Database, days = 90): BoatRow[] {
  return db
    .prepare(
      `SELECT b.id, b.source_name, b.display_name, b.landing_id, b.source_url, b.slug,
              COUNT(DISTINCT cr.source_date) AS activity
         FROM boats b
         LEFT JOIN catch_reports cr
           ON cr.boat_id = b.id
          AND cr.source_date >= date('now', '-' || ? || ' days')
        GROUP BY b.id
        ORDER BY activity DESC, b.display_name ASC`
    )
    .all(days) as BoatRow[];
}

/**
 * Phase 6 (D-01): Returns the boat with the most distinct trip-days in the last 30 days.
 * Tie-break: display_name ASC. Returns null when catch_reports is completely empty.
 */
export function mostActiveBoatLast30Days(db: Database.Database): BoatRow | null {
  return (
    (db
      .prepare(
        `SELECT b.id, b.source_name, b.display_name, b.landing_id, b.source_url, b.slug
           FROM boats b
           JOIN catch_reports cr ON cr.boat_id = b.id
          WHERE cr.source_date >= date('now', '-30 days')
          GROUP BY b.id
          ORDER BY COUNT(DISTINCT cr.source_date) DESC, b.display_name ASC
          LIMIT 1`
      )
      .get() as BoatRow | undefined) ?? null
  );
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
 * Phase 6 (D-13): slug is generated here for new boats and frozen; existing
 * boats retain their slug even if display_name changes.
 *
 * Returns two maps keyed by source_name → id for O(1) lookup when mapping
 * parsed rows to CatchReportRow shape.
 */
export interface BoatLandingKeys {
  source_name: string;
  landing_source_name: string;
  source_url?: string;
  landing_source_url?: string;
  displayName?: string;
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

  // Phase 6 (D-13, Pitfall 10): pre-load all existing slugs to avoid collisions
  // within this batch and against DB state.
  const taken = new Set<string>(
    (
      db.prepare(`SELECT slug FROM boats WHERE slug IS NOT NULL`).all() as Array<{ slug: string }>
    ).map((r) => r.slug)
  );

  // Boats next — each needs its landing_id resolved.
  const boatsByName = new Map<string, { landing: string; url?: string; displayName?: string }>();
  for (const r of rows) {
    if (!boatsByName.has(r.source_name)) {
      boatsByName.set(r.source_name, {
        landing: r.landing_source_name,
        url: r.source_url,
        displayName: r.displayName
      });
    }
  }
  for (const [name, meta] of boatsByName) {
    const landingId = landingIds.get(meta.landing);
    if (landingId === undefined) continue; // defensive: landing must have been inserted

    // D-13: look up existing slug — if present, freeze it; otherwise generate new.
    const existing = db
      .prepare(`SELECT slug FROM boats WHERE source_name = ?`)
      .get(name) as { slug?: string } | undefined;
    let slug = existing?.slug;
    if (!slug) {
      slug = uniqueSlug(slugify(meta.displayName ?? name), taken);
      taken.add(slug);
    }

    const boatId = upsertByName(db, name, landingId, meta.displayName ?? name, meta.url, slug);
    boatIds.set(name, boatId);
  }

  return { boatIds, landingIds };
}
