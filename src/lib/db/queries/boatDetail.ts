// src/lib/db/queries/boatDetail.ts — Boat detail page data composition.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Sources:
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-07, D-23
//
// Responsibilities:
//   BOAT-01/02: getBoatProfile — recent trips + season totals + trip types + landing link
//
// Key contract:
//   cutoffDate is OPTIONAL. When omitted, defaults to addDays(today(), -90).
//   This makes the function testable (pass an explicit cutoffDate in tests) while
//   giving the /boats/[id] route a sensible default without extra plumbing.
//   Per D-23: boat.source_url and landing.source_url are included for source-site links.
import type Database from 'better-sqlite3';
import { addDays, today } from '../../shared/dates';

export interface BoatInfo {
  id: number;
  display_name: string;
  source_url: string | null;
  landing_id: number;
  landing_display_name: string;
  landing_source_url: string | null;
}

export interface RecentTrip {
  source_date: string;
  trip_type: string;
  species: string;
  angler_count: number;
  species_count: number;
}

export interface SpeciesTotalRow {
  species: string;
  total_count: number;
}

export interface SeasonTotals {
  total_trips: number;
  total_anglers: number;
  top_species: SpeciesTotalRow[];
}

export interface BoatProfile {
  boat: BoatInfo;
  recentTrips: RecentTrip[];
  seasonTotals: SeasonTotals;
  tripTypes: string[];
}

/**
 * BOAT-01/02: Compose the full boat detail profile from 4 sub-queries.
 * Returns null if boatId does not exist in the boats table.
 *
 * @param cutoffDate - Optional YYYY-MM-DD lower bound for recentTrips.
 *   Defaults to addDays(today(), -90) (last 90 days in PT).
 *   Pass an explicit value in tests or when the route needs a different window.
 */
export function getBoatProfile(
  db: Database.Database,
  boatId: number,
  cutoffDate?: string
): BoatProfile | null {
  const effectiveCutoff = cutoffDate ?? addDays(today(), -90);

  // 1. Boat + landing join — returns null if boat does not exist.
  const boatRow = db
    .prepare(
      `SELECT b.id,
              b.display_name,
              b.source_url,
              l.id           AS landing_id,
              l.display_name AS landing_display_name,
              l.source_url   AS landing_source_url
         FROM boats    b
         JOIN landings l ON l.id = b.landing_id
        WHERE b.id = ?`
    )
    .get(boatId) as (BoatInfo & { landing_id: number }) | undefined;

  if (!boatRow) return null;

  // 2. Recent trips since cutoff (max 200 rows to bound response size).
  const recentTrips = db
    .prepare(
      `SELECT source_date, trip_type, species, angler_count, species_count
         FROM catch_reports
        WHERE boat_id    = ?
          AND source_date >= ?
        ORDER BY source_date DESC, trip_type, species
        LIMIT 200`
    )
    .all(boatId, effectiveCutoff) as RecentTrip[];

  // 3. Season totals (all-time, not cutoff-bounded — gives full picture).
  const totalsRow = db
    .prepare(
      `SELECT COUNT(DISTINCT source_date || '|' || trip_type) AS total_trips,
              SUM(angler_count)                                AS total_anglers
         FROM catch_reports
        WHERE boat_id = ?`
    )
    .get(boatId) as { total_trips: number; total_anglers: number } | undefined;

  // 4. Top species by total catch (all-time, top 5).
  const topSpecies = db
    .prepare(
      `SELECT species, SUM(species_count) AS total_count
         FROM catch_reports
        WHERE boat_id = ?
        GROUP BY species
        ORDER BY total_count DESC
        LIMIT 5`
    )
    .all(boatId) as SpeciesTotalRow[];

  // 5. Distinct trip types this boat runs (all-time).
  const tripTypeRows = db
    .prepare(
      `SELECT DISTINCT trip_type
         FROM catch_reports
        WHERE boat_id = ?
        ORDER BY trip_type`
    )
    .all(boatId) as { trip_type: string }[];

  return {
    boat: {
      id: boatRow.id,
      display_name: boatRow.display_name,
      source_url: boatRow.source_url,
      landing_id: boatRow.landing_id,
      landing_display_name: boatRow.landing_display_name,
      landing_source_url: boatRow.landing_source_url
    },
    recentTrips,
    seasonTotals: {
      total_trips: totalsRow?.total_trips ?? 0,
      total_anglers: totalsRow?.total_anglers ?? 0,
      top_species: topSpecies
    },
    tripTypes: tripTypeRows.map((r) => r.trip_type)
  };
}
