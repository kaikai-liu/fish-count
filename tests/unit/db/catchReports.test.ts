// tests/unit/db/catchReports.test.ts
// D-06 + ING-04: idempotent upsert on (source_date, boat_id, trip_type, species).
// The invariant: running the same scrape twice produces identical final state.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import * as boats from '../../../src/lib/db/boats';
import * as landings from '../../../src/lib/db/landings';
import * as catchReports from '../../../src/lib/db/catchReports';
import type { CatchReportRow } from '../../../src/lib/db/catchReports';

function seedBoat(db: Database.Database): { boatId: number; landingId: number } {
  const landingId = landings.upsertByName(db, 'Point Loma Sportfishing', 'Point Loma Sportfishing');
  const boatId = boats.upsertByName(db, 'Grande', landingId, 'Grande');
  return { boatId, landingId };
}

describe('catchReports.upsertMany (D-06 idempotent upsert, ING-04)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('inserts rows on first call', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db);
    const rows: CatchReportRow[] = [
      {
        source_date: '2026-04-23',
        boat_id: boatId,
        landing_id: landingId,
        trip_type: 'Full Day',
        species: 'yellowtail',
        angler_count: 25,
        species_count: 50,
        scraped_at: '2026-04-24T06:00:00Z'
      },
      {
        source_date: '2026-04-23',
        boat_id: boatId,
        landing_id: landingId,
        trip_type: 'Full Day',
        species: 'bluefin',
        angler_count: 25,
        species_count: 3,
        scraped_at: '2026-04-24T06:00:00Z'
      }
    ];
    const inserted = catchReports.upsertMany(db, rows);
    expect(inserted).toBe(2);
    expect(catchReports.totalRowsForDate(db, '2026-04-23')).toBe(2);
  });

  it('is idempotent: running same rows twice produces same row count', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db);
    const row: CatchReportRow = {
      source_date: '2026-04-23',
      boat_id: boatId,
      landing_id: landingId,
      trip_type: '1/2 Day AM',
      species: 'calico bass',
      angler_count: 18,
      species_count: 90,
      scraped_at: '2026-04-24T06:00:00Z'
    };
    catchReports.upsertMany(db, [row]);
    const countFirst = catchReports.totalRowsForDate(db, '2026-04-23');
    catchReports.upsertMany(db, [row]);
    const countSecond = catchReports.totalRowsForDate(db, '2026-04-23');
    expect(countFirst).toBe(1);
    expect(countSecond).toBe(1);
  });

  it('ON CONFLICT DO UPDATE overwrites angler_count / species_count on re-upsert', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db);
    const v1: CatchReportRow = {
      source_date: '2026-04-23',
      boat_id: boatId,
      landing_id: landingId,
      trip_type: 'Overnight',
      species: 'yellowfin',
      angler_count: 20,
      species_count: 10,
      scraped_at: '2026-04-24T06:00:00Z'
    };
    catchReports.upsertMany(db, [v1]);
    const v2 = { ...v1, angler_count: 22, species_count: 35, scraped_at: '2026-04-25T06:00:00Z' };
    catchReports.upsertMany(db, [v2]);
    expect(catchReports.totalRowsForDate(db, '2026-04-23')).toBe(1);
    const row = catchReports.getByDate(db, '2026-04-23')[0];
    expect(row.angler_count).toBe(22);
    expect(row.species_count).toBe(35);
    expect(row.scraped_at).toBe('2026-04-25T06:00:00Z');
  });

  it('distinguishes rows by species (part of the UNIQUE key)', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db);
    catchReports.upsertMany(db, [
      {
        source_date: '2026-04-23',
        boat_id: boatId,
        landing_id: landingId,
        trip_type: 'Full Day',
        species: 'yellowtail',
        angler_count: 25,
        species_count: 50,
        scraped_at: '2026-04-24T06:00:00Z'
      },
      {
        source_date: '2026-04-23',
        boat_id: boatId,
        landing_id: landingId,
        trip_type: 'Full Day',
        species: 'yellowfin',
        angler_count: 25,
        species_count: 12,
        scraped_at: '2026-04-24T06:00:00Z'
      }
    ]);
    expect(catchReports.totalRowsForDate(db, '2026-04-23')).toBe(2);
  });

  it('distinguishes rows by trip_type (part of the UNIQUE key) — D-05 verbatim trip types', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db);
    catchReports.upsertMany(db, [
      {
        source_date: '2026-04-23',
        boat_id: boatId,
        landing_id: landingId,
        trip_type: '1/2 Day AM',
        species: 'rockfish',
        angler_count: 20,
        species_count: 100,
        scraped_at: '2026-04-24T06:00:00Z'
      },
      {
        source_date: '2026-04-23',
        boat_id: boatId,
        landing_id: landingId,
        trip_type: '1/2 Day PM',
        species: 'rockfish',
        angler_count: 18,
        species_count: 90,
        scraped_at: '2026-04-24T06:00:00Z'
      }
    ]);
    expect(catchReports.totalRowsForDate(db, '2026-04-23')).toBe(2);
  });

  it('upsertMany([]) is a no-op and returns 0', () => {
    db = openTestDb();
    const inserted = catchReports.upsertMany(db, []);
    expect(inserted).toBe(0);
    expect(catchReports.totalRowsForDate(db, '2026-04-23')).toBe(0);
  });
});
