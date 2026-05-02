// src/lib/db/aliases.ts — Trip-type alias DAL (Phase 8 D-01..D-06).
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
// Read-time translation only — raw catch_reports.trip_type is never mutated (D-01).
//
// Sources:
//   .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-01..D-06
//   .planning/phases/08-home-retire-polish/08-RESEARCH.md §Pattern 1
//
// Responsibilities:
//   ALI-01: trip_type_aliases schema constraints (FK-free; status enum)
//   ALI-02: alias-aware SQL fragments (ALIAS_JOIN_SQL, CANONICAL_TRIP_TYPE_EXPR)
//           consumed by every read query that surfaces trip_type
//   ALI-03: list-all-distinct-source-labels for /admin/trip-types
//   ALI-04: upsert / delete / get for admin CRUD
//
// Discipline (D-03): this module is the SOLE legitimate consumer/producer of
// trip-type alias logic. ALIAS_JOIN_SQL and CANONICAL_TRIP_TYPE_EXPR are the
// ONLY alias-aware SQL primitives in the codebase — never inline alias logic
// elsewhere. All mutations go through upsertAlias/deleteAlias (no SQL in
// route loaders or actions).
import type Database from 'better-sqlite3';

// ============================================================================
// SQL fragments (pure constant strings — no user input flows in)
// ============================================================================

/**
 * SQL fragment to LEFT JOIN trip_type_aliases against catch_reports `cr` alias.
 * Caller MUST alias their catch_reports table as `cr` for this to compose.
 * Pure constant — interpolated into prepared statements at module-load time.
 */
export const ALIAS_JOIN_SQL = `
  LEFT JOIN trip_type_aliases tta ON tta.source_label = cr.trip_type
`;

/**
 * SQL expression that resolves to the canonical trip-type label.
 * - When the alias status is 'aliased', returns the canonical_label (read-time
 *   translation: e.g. 'Full Day Coronado Islands' surfaces as 'Full Day').
 * - Otherwise (status='accepted', 'pending', or no alias row) returns the raw
 *   cr.trip_type unchanged. CLAUDE.md domain-language rule: never normalize
 *   labels except via an explicit operator-confirmed merge.
 *
 * Use as a SELECT/GROUP BY/WHERE expression. Pair with ALIAS_JOIN_SQL.
 */
export const CANONICAL_TRIP_TYPE_EXPR = `
  COALESCE(
    CASE WHEN tta.status = 'aliased' THEN tta.canonical_label ELSE NULL END,
    cr.trip_type
  )
`;

// ============================================================================
// Types
// ============================================================================

export interface AliasRow {
  source_label: string;
  canonical_label: string;
  status: 'aliased' | 'accepted' | 'pending';
  accepted_at: string | null;
  notes: string | null;
}

export interface UpsertAliasArgs {
  source_label: string;
  canonical_label: string;
  status: AliasRow['status'];
  notes?: string | null;
}

export interface LabelWithStatusRow {
  source_label: string;
  canonical_label: string | null;
  status: AliasRow['status'] | null;
  first_seen: string;
  last_seen: string;
  trip_count: number;
}

// ============================================================================
// CRUD
// ============================================================================

/**
 * ALI-04: Insert or update an alias row (admin CRUD entry point).
 *
 * accepted_at semantics (D-04):
 *   - status='pending'                 → accepted_at = NULL
 *   - status='aliased' or 'accepted'   → accepted_at = datetime('now')
 * Last-write-wins on canonical_label and notes.
 *
 * Parameterized via better-sqlite3 named bindings — no concatenation
 * (T-08-01-01 mitigation; SQL-injection-safe by construction).
 */
export function upsertAlias(db: Database.Database, args: UpsertAliasArgs): void {
  db.prepare(
    `INSERT INTO trip_type_aliases (source_label, canonical_label, status, accepted_at, notes)
     VALUES (
       @source_label,
       @canonical_label,
       @status,
       CASE WHEN @status = 'pending' THEN NULL ELSE datetime('now') END,
       @notes
     )
     ON CONFLICT(source_label) DO UPDATE SET
       canonical_label = excluded.canonical_label,
       status          = excluded.status,
       accepted_at     = CASE WHEN excluded.status = 'pending' THEN NULL ELSE datetime('now') END,
       notes           = excluded.notes`
  ).run({
    source_label: args.source_label,
    canonical_label: args.canonical_label,
    status: args.status,
    notes: args.notes ?? null
  });
}

/** Lookup a single alias row by its source_label. Returns undefined when absent. */
export function getAlias(db: Database.Database, source_label: string): AliasRow | undefined {
  return db
    .prepare(
      `SELECT source_label, canonical_label, status, accepted_at, notes
         FROM trip_type_aliases
        WHERE source_label = @source_label`
    )
    .get({ source_label }) as AliasRow | undefined;
}

/**
 * Remove an alias row by source_label. No-op (no throw) when the row does
 * not exist — admin "reset to unaliased" flow uses this to clear seed rows.
 */
export function deleteAlias(db: Database.Database, source_label: string): void {
  db.prepare(`DELETE FROM trip_type_aliases WHERE source_label = @source_label`).run({
    source_label
  });
}

/**
 * ALI-03: List every distinct source_label ever scraped, joined with current
 * alias state. Used by /admin/trip-types as the master list.
 *
 * status / canonical_label are NULL when the source_label has no alias row
 * yet (i.e. was scraped after the seed was applied — caught by the admin
 * "NEW" badge flow, D-05).
 *
 * Sort: trip_count DESC so high-traffic labels surface first.
 */
export function listAllLabelsWithStatus(db: Database.Database): LabelWithStatusRow[] {
  return db
    .prepare(
      `SELECT cr.trip_type AS source_label,
              tta.canonical_label,
              tta.status,
              MIN(cr.source_date) AS first_seen,
              MAX(cr.source_date) AS last_seen,
              COUNT(DISTINCT cr.source_date || '|' || cr.boat_id) AS trip_count
         FROM catch_reports cr
         LEFT JOIN trip_type_aliases tta ON tta.source_label = cr.trip_type
        GROUP BY cr.trip_type
        ORDER BY trip_count DESC, cr.trip_type ASC`
    )
    .all() as LabelWithStatusRow[];
}
