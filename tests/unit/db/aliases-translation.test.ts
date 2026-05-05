// tests/unit/db/aliases-translation.test.ts
// Phase 8 ALI-02 — proves the read-time alias translation pattern (LEFT JOIN
// trip_type_aliases + COALESCE/CASE on status='aliased') merges aliased
// labels into their canonical label without mutating raw catch_reports data.
//
// Sources:
//   .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-01..D-03
//   .planning/phases/08-home-retire-polish/08-RESEARCH.md §Pattern 1
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../helpers/seedTestDb';
import {
  ALIAS_JOIN_SQL,
  CANONICAL_TRIP_TYPE_EXPR
} from '../../../src/lib/db/aliases';

interface CanonicalRow {
  trip_type: string;
  total_caught: number;
  total_anglers: number;
  n_trips: number;
}

/**
 * Ad-hoc query used by the translation tests. Mirrors the shape that the
 * production explorer/compare/trends queries will adopt — LEFT JOIN tta,
 * GROUP BY canonical expression. If this works, those queries will too.
 */
function selectCanonicalTotals(db: Database.Database, fromDate: string, toDate: string): CanonicalRow[] {
  return db
    .prepare(
      `SELECT ${CANONICAL_TRIP_TYPE_EXPR} AS trip_type,
              SUM(cr.species_count) AS total_caught,
              SUM(cr.angler_count) AS total_anglers,
              COUNT(DISTINCT cr.source_date || '|' || cr.boat_id) AS n_trips
         FROM catch_reports cr
         ${ALIAS_JOIN_SQL}
        WHERE cr.source_date BETWEEN @fromDate AND @toDate
        GROUP BY ${CANONICAL_TRIP_TYPE_EXPR}
        ORDER BY trip_type ASC`
    )
    .all({ fromDate, toDate }) as CanonicalRow[];
}

describe('alias translation — read-time merge of aliased labels', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it("merges 'Full Day Coronado Islands' into 'Full Day' under the aliased seed", () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Pacific Voyager',
      landingName: 'H&M Landing'
    });
    // Same date for both to keep the trip-count math simple.
    seedTrip(db, { boatId, landingId, date: '2024-06-01', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-06-02', tripType: 'Full Day Coronado Islands', species: 'yellowtail', anglers: 15, count: 8 });

    const rows = selectCanonicalTotals(db, '2024-06-01', '2024-06-30');
    // Expect ONE merged 'Full Day' group, total_caught = 18, total_anglers = 35.
    const fullDay = rows.find((r) => r.trip_type === 'Full Day');
    expect(fullDay).toBeDefined();
    expect(fullDay!.total_caught).toBe(18);
    expect(fullDay!.total_anglers).toBe(35);
    expect(fullDay!.n_trips).toBe(2);

    // 'Full Day Coronado Islands' must NOT surface as a separate group —
    // it was merged into 'Full Day' at read time.
    expect(rows.find((r) => r.trip_type === 'Full Day Coronado Islands')).toBeUndefined();
  });

  it("surfaces a status='pending' label as its raw label (COALESCE falls through)", () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Pacific Voyager',
      landingName: 'H&M Landing'
    });
    // 'Lobster' is in the seed as status='pending', canonical='Lobster'.
    // The COALESCE expression returns cr.trip_type since status != 'aliased'.
    seedTrip(db, { boatId, landingId, date: '2024-06-01', tripType: 'Lobster', species: 'lobster', anglers: 5, count: 3 });

    const rows = selectCanonicalTotals(db, '2024-06-01', '2024-06-30');
    const lobster = rows.find((r) => r.trip_type === 'Lobster');
    expect(lobster).toBeDefined();
    expect(lobster!.total_caught).toBe(3);
  });

  it('surfaces an unseeded label unchanged (LEFT JOIN nulls fall through COALESCE)', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Pacific Voyager',
      landingName: 'H&M Landing'
    });
    // 'Brand New Trip Type' is not in the seed at all.
    seedTrip(db, { boatId, landingId, date: '2024-06-01', tripType: 'Brand New Trip Type', species: 'yellowtail', anglers: 10, count: 4 });

    const rows = selectCanonicalTotals(db, '2024-06-01', '2024-06-30');
    const newLabel = rows.find((r) => r.trip_type === 'Brand New Trip Type');
    expect(newLabel).toBeDefined();
    expect(newLabel!.total_caught).toBe(4);
  });
});
