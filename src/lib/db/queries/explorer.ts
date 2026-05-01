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
//
// Key contracts:
//   - All queries parameterized (named @param or positional ?); no string interpolation of user input
//   - speciesAcrossBoats + landingAcrossSpecies use two-pass aggregation (Pitfall 9 mitigation):
//     Pass 1: window-total ORDER BY total DESC LIMIT N → select the top-N entities
//     Pass 2: bucketed series restricted to those N entity IDs via IN (?,?,?,...) — bounded
//   - boatExplorerSeries returns (bucket_key, trip_type) pairs for trip-type overlay (D-15)
//   - Gap-filling (null-value buckets between present ones) is the route loader's responsibility
import type Database from 'better-sqlite3';
import type { BoatRow } from '$lib/db/boats';

export type Granularity = 'daily' | 'weekly' | 'monthly';

function bucketExpr(g: Granularity): string {
  return g === 'daily'
    ? "strftime('%Y-%m-%d', source_date)"
    : g === 'weekly'
      ? "strftime('%G-W%V', source_date)"
      : "strftime('%Y-%m', source_date)";
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
 */
export function boatExplorerSeries(db: Database.Database, args: BoatExplorerArgs): BoatExplorerBucket[] {
  const expr = bucketExpr(args.granularity);
  return db.prepare(
    `SELECT ${expr} AS bucket_key,
            trip_type,
            SUM(species_count) * 1.0 / NULLIF(SUM(angler_count), 0) AS value,
            COUNT(DISTINCT source_date) AS n_trips
       FROM catch_reports
      WHERE boat_id = @boatId
        AND source_date BETWEEN @fromDate AND @toDate
      GROUP BY bucket_key, trip_type
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
 */
export function speciesAcrossBoats(db: Database.Database, args: SpeciesAcrossBoatsArgs): SpeciesAcrossBoatsResult {
  const topN = args.topN ?? 6;

  // Pass 1: top-N boats by total species_count in window (Pitfall 9 — window totals, not per-bucket).
  const topRows = db.prepare(
    `SELECT b.id, b.display_name, b.slug, SUM(cr.species_count) AS total
       FROM catch_reports cr
       JOIN boats b ON b.id = cr.boat_id
      WHERE cr.species = @species
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
    `SELECT boat_id, ${expr} AS bucket_key,
            SUM(species_count) * 1.0 / NULLIF(SUM(angler_count), 0) AS value,
            COUNT(DISTINCT source_date) AS n_trips
       FROM catch_reports
      WHERE species = ?
        AND source_date BETWEEN ? AND ?
        AND boat_id IN (${placeholders})
      GROUP BY boat_id, bucket_key
      ORDER BY bucket_key ASC, boat_id ASC`
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
 */
export function landingAcrossSpecies(db: Database.Database, args: LandingAcrossSpeciesArgs): LandingAcrossSpeciesResult {
  const topN = args.topN ?? 6;

  const topRows = db.prepare(
    `SELECT species, SUM(species_count) AS total
       FROM catch_reports
      WHERE landing_id = @landingId
        AND source_date BETWEEN @fromDate AND @toDate
      GROUP BY species
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
    `SELECT species, ${expr} AS bucket_key,
            SUM(species_count) * 1.0 / NULLIF(SUM(angler_count), 0) AS value,
            COUNT(DISTINCT source_date) AS n_trips
       FROM catch_reports
      WHERE landing_id = ?
        AND source_date BETWEEN ? AND ?
        AND species IN (${placeholders})
      GROUP BY species, bucket_key
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
  total_catch: number;
  n_trips: number;
}

/**
 * D-15 secondary (boat ticker): Species breakdown table below the chart.
 * Returns total catch + n_trips per species for the window, ordered by total_catch DESC.
 * No bucketing — this feeds the breakdown table, not the chart.
 */
export function speciesBreakdownForBoat(db: Database.Database, args: SpeciesBreakdownArgs): SpeciesBreakdownRow[] {
  return db.prepare(
    `SELECT species,
            SUM(species_count) AS total_catch,
            COUNT(DISTINCT source_date) AS n_trips
       FROM catch_reports
      WHERE boat_id = @boatId
        AND source_date BETWEEN @fromDate AND @toDate
      GROUP BY species
      ORDER BY total_catch DESC, species ASC`
  ).all(args) as SpeciesBreakdownRow[];
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
  const row = db.prepare(
    `SELECT species, SUM(species_count) AS total
       FROM catch_reports
      WHERE boat_id = @boatId AND source_date BETWEEN @fromDate AND @toDate
      GROUP BY species
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
  const row = db.prepare(
    `SELECT b.id, b.display_name, b.slug, SUM(cr.species_count) AS total
       FROM catch_reports cr
       JOIN boats b ON b.id = cr.boat_id
      WHERE cr.species = @species AND cr.source_date BETWEEN @fromDate AND @toDate
      GROUP BY cr.boat_id
      ORDER BY total DESC, b.display_name ASC
      LIMIT 1`
  ).get(args) as { id?: number; display_name?: string; slug?: string } | undefined;
  return row?.id ? { id: row.id, display_name: row.display_name!, slug: row.slug! } : null;
}
