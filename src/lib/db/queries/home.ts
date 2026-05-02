// src/lib/db/queries/home.ts — Home-page section query (Phase 8 HOME-01..05).
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Sources:
//   .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-07..D-15 (home page shape)
//   .planning/phases/08-home-retire-polish/08-RESEARCH.md §"Home-Page Section Query"
//   .planning/phases/08-home-retire-polish/08-PATTERNS.md §"src/lib/db/queries/home.ts"
//
// Responsibilities:
//   HOME-01: per-canonical-trip-type sections, ≥minTrips trips/window AFTER alias
//            merge (RESEARCH §Pitfall 1: GROUP BY canonical, never raw cr.trip_type).
//   HOME-02: top-N boats per section, ranked by fish-per-angler DESC.
//   HOME-04: row.pending flag = any constituent raw label is status='pending';
//            consumed by the NewLabelBadge in the home-page UI.
//   HOME-05: no URL state. Loader passes fixed (fromDate, toDate) for past 7d.
//
// Discipline:
//   - Two-pass aggregation mirrors src/lib/db/queries/explorer.ts::speciesAcrossBoats
//     (Pitfall 9 — the cap is by window total, not per-bucket).
//   - Pass 1: viable canonical trip types (≥ minTrips after alias merge). Returns
//     a section row + status (the status is the most-common alias status across
//     constituent labels — used to colour the section heading, not the per-row
//     pending flag).
//   - Pass 2: top-N boats per Pass-1 trip type, restricted to that canonical via
//     CANONICAL_TRIP_TYPE_EXPR = @canonical. Computes fpa, trip_count, totals,
//     and the row-level pending flag.
//   - SQL conventions match trends.ts / explorer.ts:
//     * fpa = SUM(species_count) * 1.0 / NULLIF(SUM(angler_count), 0)
//     * trip_count = COUNT(DISTINCT cr.source_date || '|' || cr.boat_id)
//     * GROUP BY <canonical expr>; never GROUP BY cr.trip_type (Pitfall 1).
import type Database from 'better-sqlite3';
import { ALIAS_JOIN_SQL, CANONICAL_TRIP_TYPE_EXPR, type AliasRow } from '$lib/db/aliases';

export interface HomeArgs {
  fromDate: string; // PT YYYY-MM-DD; loader passes today() - 7
  toDate: string;   // PT YYYY-MM-DD; loader passes today()
  minTrips?: number;   // D-08 viability floor; default 5
  perSection?: number; // D-09 top-N per section; default 5
}

export interface HomeRow {
  boat_id: number;
  boat_slug: string;
  boat_display_name: string;
  trip_count: number;     // distinct (date) tuples for this boat × canonical in window
  total_caught: number;
  total_anglers: number;
  fpa: number;            // SUM(species_count) / NULLIF(SUM(angler_count), 0)
  pending: boolean;       // any constituent raw label has alias status='pending'
}

export interface HomeSection {
  canonical_trip_type: string;
  status: AliasRow['status']; // 'aliased' | 'accepted' | 'pending'
  trip_count: number;        // section-level (after alias merge)
  rows: HomeRow[];
}

interface Pass1Row {
  canonical_trip_type: string;
  status: AliasRow['status'] | null;
  trip_count: number;
}

interface Pass2Row {
  boat_id: number;
  boat_slug: string;
  boat_display_name: string;
  trip_count: number;
  total_caught: number;
  total_anglers: number;
  fpa: number | null;
  pending: number; // 0 or 1 from MAX(CASE ...)
}

/**
 * HOME-01..04: viable canonical trip types in [fromDate, toDate] (Pass 1) and
 * top-N boats by fpa per section (Pass 2). Alias-aware via ALIAS_JOIN_SQL +
 * CANONICAL_TRIP_TYPE_EXPR — raw labels are merged into their canonical at
 * read time (no rewrite of catch_reports.trip_type, ever).
 *
 * Defaults: minTrips=5 (D-08), perSection=5 (D-09).
 *
 * The section-level `status` is the alias status of the canonical's primary
 * accepted/aliased row when available, else 'pending'. Most canonicals (Full
 * Day, 1/2 Day AM, etc.) are seeded as 'accepted'; rare ones (5 Day, Lobster)
 * are 'pending'. The per-row `pending` flag carries finer-grained signal: it
 * trips when ANY constituent raw label for that boat in this canonical is
 * status='pending', so the "NEW" badge surfaces against actual unmerged data.
 */
export function homeSections(db: Database.Database, args: HomeArgs): HomeSection[] {
  const minTrips = args.minTrips ?? 5;
  const perSection = args.perSection ?? 5;

  // Pass 1: viable canonical trip types after alias merge.
  // Section status is the *most common* status among the canonical's
  // constituent rows in window — derived in JS below from a tally so the
  // SQL stays a single GROUP BY.
  const pass1 = db
    .prepare(
      `SELECT ${CANONICAL_TRIP_TYPE_EXPR} AS canonical_trip_type,
              COUNT(DISTINCT cr.source_date || '|' || cr.boat_id) AS trip_count
         FROM catch_reports cr
         ${ALIAS_JOIN_SQL}
        WHERE cr.source_date BETWEEN @fromDate AND @toDate
        GROUP BY canonical_trip_type
       HAVING trip_count >= @minTrips
        ORDER BY trip_count DESC, canonical_trip_type ASC`
    )
    .all({ fromDate: args.fromDate, toDate: args.toDate, minTrips }) as Pass1Row[];

  if (pass1.length === 0) return [];

  // Per-section status resolution: the canonical's primary alias-table row
  // when present (e.g. status='accepted' for 'Full Day'), else 'pending'
  // (a brand-new label scraped after the seed; D-05 NEW-badge flow).
  const statusByCanonical = db
    .prepare(
      `SELECT canonical_label, status
         FROM trip_type_aliases
        WHERE canonical_label = source_label`
    )
    .all() as Array<{ canonical_label: string; status: AliasRow['status'] }>;
  const statusMap = new Map(statusByCanonical.map((r) => [r.canonical_label, r.status]));

  // Pass 2 — one prepared statement, run once per Pass-1 canonical.
  const pass2Stmt = db.prepare(
    `SELECT b.id AS boat_id, b.slug AS boat_slug, b.display_name AS boat_display_name,
            COUNT(DISTINCT cr.source_date) AS trip_count,
            SUM(cr.species_count) AS total_caught,
            SUM(cr.angler_count) AS total_anglers,
            SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS fpa,
            MAX(CASE WHEN tta.status = 'pending' THEN 1 ELSE 0 END) AS pending
       FROM catch_reports cr
       ${ALIAS_JOIN_SQL}
       JOIN boats b ON b.id = cr.boat_id
      WHERE cr.source_date BETWEEN @fromDate AND @toDate
        AND ${CANONICAL_TRIP_TYPE_EXPR} = @canonical
      GROUP BY cr.boat_id
      ORDER BY fpa DESC, b.display_name ASC
      LIMIT @topN`
  );

  const sections: HomeSection[] = pass1.map((p1) => {
    const rows = pass2Stmt.all({
      fromDate: args.fromDate,
      toDate: args.toDate,
      canonical: p1.canonical_trip_type,
      topN: perSection
    }) as Pass2Row[];

    return {
      canonical_trip_type: p1.canonical_trip_type,
      status: statusMap.get(p1.canonical_trip_type) ?? 'pending',
      trip_count: p1.trip_count,
      rows: rows.map((r) => ({
        boat_id: r.boat_id,
        boat_slug: r.boat_slug,
        boat_display_name: r.boat_display_name,
        trip_count: r.trip_count,
        total_caught: r.total_caught,
        total_anglers: r.total_anglers,
        fpa: r.fpa ?? 0,
        pending: r.pending === 1
      }))
    };
  });

  return sections;
}
