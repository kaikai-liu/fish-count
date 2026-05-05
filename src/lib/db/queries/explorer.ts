// src/lib/db/queries/explorer.ts
// Explorer aggregations: boat/species/landing tickers + cross-axis defaults + auto-widen check.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
// Gap-filling is the route loader's job — this module returns only buckets with rows.
//
// Granularity is a typed enum, never user input — bucketExpr is safe to branch in code (T-02-01).
//
// Sources:
//   .planning/phases/06-explorer-foundation/06-CONTEXT.md §D-01, D-03, D-08, D-15, D-20
//   .planning/phases/06-explorer-foundation/06-RESEARCH.md §"Pitfall 9: Top-6 cap"
//   .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-03 (alias-aware grouping)
//   .planning/phases/08-home-retire-polish/08-RESEARCH.md §Pattern 1, §Pitfall 1
//
// Key contracts:
//   - All queries parameterized (named @param or positional ?); no string interpolation of user input
//   - speciesAcrossBoats + landingAcrossSpecies use two-pass aggregation (Pitfall 9 mitigation):
//     Pass 1: window-total ORDER BY total DESC LIMIT N → select the top-N entities
//     Pass 2: bucketed series restricted to those N entity IDs via IN (?,?,?,...) — bounded
//   - boatExplorerSeries returns (bucket_key, trip_type) pairs for trip-type overlay (D-15)
//   - Phase 8 D-03: every query that surfaces or groups by trip_type joins via
//     ALIAS_JOIN_SQL and groups by CANONICAL_TRIP_TYPE_EXPR. NEVER `GROUP BY cr.trip_type`
//     directly (Phase 8 RESEARCH §Pitfall 1) — the merged-history canonical is the truth.
//   - Gap-filling (null-value buckets between present ones) is the route loader's responsibility
import type Database from 'better-sqlite3';
import type { BoatRow } from '$lib/db/boats';
import { ALIAS_JOIN_SQL, CANONICAL_TRIP_TYPE_EXPR } from '$lib/db/aliases';
import { CANONICAL_SPECIES_EXPR } from '$lib/db/speciesCanonical';

export type Granularity = 'daily' | 'weekly' | 'monthly';

function bucketExpr(g: Granularity): string {
  // Note: prefixed with `cr.` because the alias-aware queries qualify
  // catch_reports as `cr` for the LEFT JOIN trip_type_aliases tta.
  return g === 'daily'
    ? "strftime('%Y-%m-%d', cr.source_date)"
    : g === 'weekly'
      ? "strftime('%G-W%V', cr.source_date)"
      : "strftime('%Y-%m', cr.source_date)";
}

// ============ Boat ticker — series-by-trip-type ============

export interface BoatExplorerArgs {
  boatId: number;
  fromDate: string;
  toDate: string;
  granularity: Granularity;
}

export interface BoatExplorerBucket {
  bucket_key: string;
  trip_type: string;
  value: number | null;
  n_trips: number;
}

/**
 * D-15 (boat ticker): Bucketed per-angler yield grouped by (bucket_key, trip_type).
 * One series per trip type the boat ran in the window — e.g. "1/2 Day AM", "Full Day".
 * Trip-type labels rendered verbatim from DB (CLAUDE.md domain-language rule).
 *
 * Phase 8 D-03 / Pitfall 1: trip_type is the canonical-merged label (e.g. raw
 * 'Full Day Coronado Islands' surfaces as 'Full Day' when status='aliased').
 * NEVER GROUP BY cr.trip_type directly — always the canonical expression.
 */
export function boatExplorerSeries(db: Database.Database, args: BoatExplorerArgs): BoatExplorerBucket[] {
  const expr = bucketExpr(args.granularity);
  return db.prepare(
    `SELECT ${expr} AS bucket_key,
            ${CANONICAL_TRIP_TYPE_EXPR} AS trip_type,
            SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS value,
            COUNT(DISTINCT cr.source_date) AS n_trips
       FROM catch_reports cr
       ${ALIAS_JOIN_SQL}
      WHERE cr.boat_id = @boatId
        AND cr.source_date BETWEEN @fromDate AND @toDate
      GROUP BY bucket_key, ${CANONICAL_TRIP_TYPE_EXPR}
      ORDER BY bucket_key ASC, trip_type ASC`
  ).all(args) as BoatExplorerBucket[];
}

// ============ Species ticker — top-6 boats series ============

export interface SpeciesAcrossBoatsArgs {
  species: string;
  fromDate: string;
  toDate: string;
  granularity: Granularity;
  topN?: number; // default 6 per D-15; widened only via legend toggle UX
}

export interface SpeciesAcrossBoatsBucket {
  boat_id: number;
  bucket_key: string;
  value: number | null;
  n_trips: number;
}

export interface SpeciesAcrossBoatsResult {
  topBoats: Array<Pick<BoatRow, 'id' | 'display_name' | 'slug'>>;
  series: SpeciesAcrossBoatsBucket[];
}

/**
 * D-15 (species ticker): Two-pass aggregation to avoid Pitfall 9 (top-N by bucket vs window).
 *
 * Pass 1: SELECT top-N boats by total species_count in the full window — ensures
 *   the cap is based on overall performance, not any single bucket's count.
 * Pass 2: Bucketed series restricted to those N boat IDs via IN (?,?,?,...).
 *
 * T-06-17 (DoS): topN default 6 caps result-set size; second pass is bounded by 6 IDs.
 *
 * Phase 8 D-03: this query does not group by trip_type (so no CANONICAL_TRIP_TYPE_EXPR
 * needed) but the ALIAS_JOIN_SQL is included for symmetry — the LEFT JOIN against
 * trip_type_aliases is a no-op on row count (source_label is PRIMARY KEY, 1:1 with
 * catch_reports.trip_type) and keeps the file pattern uniform.
 */
export function speciesAcrossBoats(db: Database.Database, args: SpeciesAcrossBoatsArgs): SpeciesAcrossBoatsResult {
  const topN = args.topN ?? 6;

  // Pass 1: top-N boats by total species_count in window (Pitfall 9 — window totals, not per-bucket).
  // Polish pass: filter on canonical species so size-class variants
  // ("bluefin tuna (up to 100 pounds)") roll into "bluefin tuna".
  const topRows = db.prepare(
    `SELECT b.id, b.display_name, b.slug, SUM(cr.species_count) AS total
       FROM catch_reports cr
       ${ALIAS_JOIN_SQL}
       JOIN boats b ON b.id = cr.boat_id
      WHERE ${CANONICAL_SPECIES_EXPR} = @species
        AND cr.source_date BETWEEN @fromDate AND @toDate
      GROUP BY cr.boat_id
      ORDER BY total DESC, b.display_name ASC
      LIMIT @topN`
  ).all({ species: args.species, fromDate: args.fromDate, toDate: args.toDate, topN }) as Array<{
    id: number;
    display_name: string;
    slug: string;
    total: number;
  }>;

  if (topRows.length === 0) return { topBoats: [], series: [] };

  // Pass 2: bucketed series for those boats. Build IN (?,?,?,...) parameterized.
  const ids = topRows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const expr = bucketExpr(args.granularity);
  const series = db.prepare(
    `SELECT cr.boat_id, ${expr} AS bucket_key,
            SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS value,
            COUNT(DISTINCT cr.source_date) AS n_trips
       FROM catch_reports cr
       ${ALIAS_JOIN_SQL}
      WHERE ${CANONICAL_SPECIES_EXPR} = ?
        AND cr.source_date BETWEEN ? AND ?
        AND cr.boat_id IN (${placeholders})
      GROUP BY cr.boat_id, bucket_key
      ORDER BY bucket_key ASC, cr.boat_id ASC`
  ).all(args.species, args.fromDate, args.toDate, ...ids) as SpeciesAcrossBoatsBucket[];

  return {
    topBoats: topRows.map((r) => ({ id: r.id, display_name: r.display_name, slug: r.slug })),
    series
  };
}

// ============ Landing ticker — top-6 species series ============

export interface LandingAcrossSpeciesArgs {
  landingId: number;
  fromDate: string;
  toDate: string;
  granularity: Granularity;
  topN?: number; // default 6 per D-15
}

export interface LandingAcrossSpeciesBucket {
  species: string;
  bucket_key: string;
  value: number | null;
  n_trips: number;
}

export interface LandingAcrossSpeciesResult {
  topSpecies: string[];
  series: LandingAcrossSpeciesBucket[];
}

/**
 * D-15 (landing ticker): Two-pass aggregation.
 *
 * Pass 1: SELECT top-N species by total catch at the landing in the window.
 * Pass 2: Bucketed series restricted to those species via IN (?,?,?,...).
 *
 * Species names returned verbatim from DB — no normalization (CLAUDE.md rule).
 *
 * Phase 8 D-03: this query does not group by trip_type (so no CANONICAL_TRIP_TYPE_EXPR
 * needed) but the ALIAS_JOIN_SQL is included for symmetry with the rest of this file's
 * alias-aware queries (no-op on row count — source_label is PRIMARY KEY).
 */
export function landingAcrossSpecies(db: Database.Database, args: LandingAcrossSpeciesArgs): LandingAcrossSpeciesResult {
  const topN = args.topN ?? 6;

  // Polish pass: roll up size-class species variants in the GROUP BY so
  // bluefin tuna's 100+ weight bins surface as a single "bluefin tuna" row.
  const topRows = db.prepare(
    `SELECT ${CANONICAL_SPECIES_EXPR} AS species, SUM(cr.species_count) AS total
       FROM catch_reports cr
       ${ALIAS_JOIN_SQL}
      WHERE cr.landing_id = @landingId
        AND cr.source_date BETWEEN @fromDate AND @toDate
      GROUP BY ${CANONICAL_SPECIES_EXPR}
      ORDER BY total DESC, species ASC
      LIMIT @topN`
  ).all({ landingId: args.landingId, fromDate: args.fromDate, toDate: args.toDate, topN }) as Array<{
    species: string;
    total: number;
  }>;

  if (topRows.length === 0) return { topSpecies: [], series: [] };

  const speciesList = topRows.map((r) => r.species);
  const placeholders = speciesList.map(() => '?').join(',');
  const expr = bucketExpr(args.granularity);
  const series = db.prepare(
    `SELECT ${CANONICAL_SPECIES_EXPR} AS species, ${expr} AS bucket_key,
            SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS value,
            COUNT(DISTINCT cr.source_date) AS n_trips
       FROM catch_reports cr
       ${ALIAS_JOIN_SQL}
      WHERE cr.landing_id = ?
        AND cr.source_date BETWEEN ? AND ?
        AND ${CANONICAL_SPECIES_EXPR} IN (${placeholders})
      GROUP BY ${CANONICAL_SPECIES_EXPR}, bucket_key
      ORDER BY bucket_key ASC, species ASC`
  ).all(args.landingId, args.fromDate, args.toDate, ...speciesList) as LandingAcrossSpeciesBucket[];

  return { topSpecies: speciesList, series };
}

// ============ Boat species breakdown table (boat ticker only) ============

export interface SpeciesBreakdownArgs {
  boatId: number;
  fromDate: string;
  toDate: string;
}

export interface SpeciesBreakdownRow {
  species: string;
  fish_per_angler: number | null;
  total_catch: number;
  n_trips: number;
}

/**
 * D-15 secondary (boat ticker): Species breakdown table below the chart.
 * Returns fish/angler + total catch + n_trips per species for the window,
 * ordered by total_catch DESC. No bucketing — this feeds the breakdown
 * table, not the chart.
 */
export function speciesBreakdownForBoat(db: Database.Database, args: SpeciesBreakdownArgs): SpeciesBreakdownRow[] {
  // Polish pass: roll up size-class variants so the breakdown table shows
  // one "bluefin tuna" row instead of 100+ weight bins.
  return db.prepare(
    `SELECT ${CANONICAL_SPECIES_EXPR} AS species,
            SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS fish_per_angler,
            SUM(cr.species_count) AS total_catch,
            COUNT(DISTINCT cr.source_date) AS n_trips
       FROM catch_reports cr
      WHERE cr.boat_id = @boatId
        AND cr.source_date BETWEEN @fromDate AND @toDate
      GROUP BY ${CANONICAL_SPECIES_EXPR}
      ORDER BY total_catch DESC, species ASC`
  ).all(args) as SpeciesBreakdownRow[];
}

// ============ Boats-at-landing breakdown (landing ticker) ============

export interface BoatsAtLandingArgs {
  landingId: number;
  fromDate: string;
  toDate: string;
}

export interface BoatBreakdownRow {
  boat_slug: string;
  boat_name: string;
  fish_per_angler: number | null;
  total_catch: number;
  n_trips: number;
}

/**
 * Landing ticker supporting list: top boats at this landing in the
 * window — fish/angler + total catch + trip count, ordered by total_catch DESC.
 */
export function boatsForLandingInRange(
  db: Database.Database,
  args: BoatsAtLandingArgs
): BoatBreakdownRow[] {
  return db.prepare(
    `SELECT b.slug AS boat_slug,
            b.display_name AS boat_name,
            SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS fish_per_angler,
            SUM(cr.species_count) AS total_catch,
            COUNT(DISTINCT cr.source_date) AS n_trips
       FROM catch_reports cr
       JOIN boats b ON b.id = cr.boat_id
      WHERE b.landing_id = @landingId
        AND cr.source_date BETWEEN @fromDate AND @toDate
      GROUP BY b.id
      ORDER BY total_catch DESC, b.display_name ASC`
  ).all(args) as BoatBreakdownRow[];
}

// ============ Boats-catching-species breakdown (species ticker) ============

export interface BoatsForSpeciesArgs {
  species: string;
  fromDate: string;
  toDate: string;
}

/**
 * Species ticker supporting list: top boats catching this species in the
 * window — fish/angler + total catch + trip count, ordered by total_catch DESC.
 * Filters on canonical species so size-class and released variants roll
 * into one row per parent species.
 */
export function boatsForSpeciesInRange(
  db: Database.Database,
  args: BoatsForSpeciesArgs
): BoatBreakdownRow[] {
  return db.prepare(
    `SELECT b.slug AS boat_slug,
            b.display_name AS boat_name,
            SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS fish_per_angler,
            SUM(cr.species_count) AS total_catch,
            COUNT(DISTINCT cr.source_date) AS n_trips
       FROM catch_reports cr
       JOIN boats b ON b.id = cr.boat_id
      WHERE ${CANONICAL_SPECIES_EXPR} = @species
        AND cr.source_date BETWEEN @fromDate AND @toDate
      GROUP BY b.id
      ORDER BY total_catch DESC, b.display_name ASC`
  ).all(args) as BoatBreakdownRow[];
}

// ============ Auto-widen check (D-03) ============

/**
 * D-03: Existence check for the auto-widen fallback.
 * Returns 1 if the boat has any catch rows in [fromDate, toDate], 0 otherwise.
 * Uses LIMIT 1 for speed — we only need presence, not count.
 */
export function countCatchRowsForBoatInRange(
  db: Database.Database,
  args: { boatId: number; fromDate: string; toDate: string }
): number {
  const row = db.prepare(
    `SELECT 1 AS x FROM catch_reports
      WHERE boat_id = @boatId AND source_date BETWEEN @fromDate AND @toDate
      LIMIT 1`
  ).get(args) as { x?: number } | undefined;
  return row ? 1 : 0;
}

/**
 * Phase 8 Plan 04 (POL-03 / D-33): does this boat have ANY catch rows ever?
 * Used by the empty-state branch to distinguish "no history at all" from
 * "no history in this range" — the first invites patience, the second
 * invites widening the range.
 */
export function countCatchRowsForBoatEver(
  db: Database.Database,
  args: { boatId: number }
): number {
  const row = db.prepare(
    `SELECT 1 AS x FROM catch_reports WHERE boat_id = @boatId LIMIT 1`
  ).get(args) as { x?: number } | undefined;
  return row ? 1 : 0;
}

/**
 * Phase 8 Plan 04 (POL-03 / D-33): does this species name appear in catch
 * rows EVER? Returns 1 if any row exists, else 0. Same exists-style probe
 * for cheapness — we don't need an actual count.
 */
export function countCatchRowsForSpeciesEver(
  db: Database.Database,
  args: { species: string }
): number {
  // Polish pass: canonical match so dropdown values like "bluefin tuna" find
  // rows even when only "bluefin tuna (up to 100 pounds)" exists in the DB.
  const row = db.prepare(
    `SELECT 1 AS x FROM catch_reports cr WHERE ${CANONICAL_SPECIES_EXPR} = @species LIMIT 1`
  ).get(args) as { x?: number } | undefined;
  return row ? 1 : 0;
}

/**
 * Phase 8 Plan 04 (POL-03 / D-33): does this landing have ANY catch rows
 * ever? Joined via the boats.landing_id foreign key.
 */
export function countCatchRowsForLandingEver(
  db: Database.Database,
  args: { landingId: number }
): number {
  const row = db.prepare(
    `SELECT 1 AS x FROM catch_reports cr
       JOIN boats b ON b.id = cr.boat_id
      WHERE b.landing_id = @landingId
      LIMIT 1`
  ).get(args) as { x?: number } | undefined;
  return row ? 1 : 0;
}

// ============ Earliest scrape date (custom range clamp) ============

/**
 * Returns the minimum source_date across all catch_reports.
 * Used by the loader to clamp custom date ranges to available data.
 * Returns null when catch_reports is empty.
 */
export function earliestScrapeDate(db: Database.Database): string | null {
  const row = db
    .prepare(`SELECT MIN(source_date) AS d FROM catch_reports`)
    .get() as { d?: string } | undefined;
  return row?.d ?? null;
}

// ============ Cross-axis defaults (D-08) ============

/**
 * D-08: boat → species default.
 * Returns the species this boat catches most (highest SUM(species_count)) in the window.
 * Alpha tie-break. Returns null when boat has no data in window.
 */
export function mostCaughtSpeciesForBoatInRange(
  db: Database.Database,
  args: { boatId: number; fromDate: string; toDate: string }
): string | null {
  // Polish pass: pick the canonical species so the cross-axis default
  // sends users to "bluefin tuna" — a value present in the trimmed top-20
  // dropdown — not a size-class variant that's been canonicalized away.
  const row = db.prepare(
    `SELECT ${CANONICAL_SPECIES_EXPR} AS species, SUM(cr.species_count) AS total
       FROM catch_reports cr
      WHERE cr.boat_id = @boatId AND cr.source_date BETWEEN @fromDate AND @toDate
      GROUP BY ${CANONICAL_SPECIES_EXPR}
      ORDER BY total DESC, species ASC
      LIMIT 1`
  ).get(args) as { species?: string } | undefined;
  return row?.species ?? null;
}

/**
 * D-08: species → boat default.
 * Returns the boat that catches this species most (highest SUM(species_count)) in the window.
 * Alpha tie-break. Returns null when species has no data in window.
 * Result includes slug for URL construction.
 */
export function topBoatForSpeciesInRange(
  db: Database.Database,
  args: { species: string; fromDate: string; toDate: string }
): Pick<BoatRow, 'id' | 'display_name' | 'slug'> | null {
  // Polish pass: canonical species so the size-class variants count toward
  // the same fish; anglers don't think of "bluefin tuna 100lb" as separate.
  const row = db.prepare(
    `SELECT b.id, b.display_name, b.slug, SUM(cr.species_count) AS total
       FROM catch_reports cr
       JOIN boats b ON b.id = cr.boat_id
      WHERE ${CANONICAL_SPECIES_EXPR} = @species AND cr.source_date BETWEEN @fromDate AND @toDate
      GROUP BY cr.boat_id
      ORDER BY total DESC, b.display_name ASC
      LIMIT 1`
  ).get(args) as { id?: number; display_name?: string; slug?: string } | undefined;
  return row?.id ? { id: row.id, display_name: row.display_name!, slug: row.slug! } : null;
}
