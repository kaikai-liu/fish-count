// tests/unit/db/boats-batch.test.ts
// Plan 01-05 Task 1 RED: verify upsertBoatsAndLandings batch helper resolves
// FK ids for catch_reports rows. Companion to boats.test.ts (D-01) and
// landings.test.ts (D-02) — this exercises the batch composition used by
// pipeline.ts.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import { upsertBoatsAndLandings } from '../../../src/lib/db/boats';

describe('upsertBoatsAndLandings (Plan 01-05 batch helper)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('populates landings first, then boats, returning both id maps', () => {
    db = openTestDb();
    const rows = [
      {
        source_name: 'Grande',
        landing_source_name: 'Point Loma Sportfishing',
        source_url: '/charter_boats/grande.php',
        landing_source_url: '/landings/plsf'
      },
      {
        source_name: 'Pacific Queen',
        landing_source_name: 'Point Loma Sportfishing'
      },
      {
        source_name: 'Dolphin',
        landing_source_name: "Fisherman's Landing"
      }
    ];

    const { boatIds, landingIds } = upsertBoatsAndLandings(db, rows);

    // Two distinct landings, three distinct boats
    expect(landingIds.size).toBe(2);
    expect(boatIds.size).toBe(3);
    expect(landingIds.get('Point Loma Sportfishing')).toBeGreaterThan(0);
    expect(landingIds.get("Fisherman's Landing")).toBeGreaterThan(0);
    expect(boatIds.get('Grande')).toBeGreaterThan(0);
    expect(boatIds.get('Pacific Queen')).toBeGreaterThan(0);
    expect(boatIds.get('Dolphin')).toBeGreaterThan(0);
  });

  it('is idempotent — calling twice with the same rows returns same ids', () => {
    db = openTestDb();
    const rows = [
      { source_name: 'Grande', landing_source_name: 'Point Loma Sportfishing' }
    ];
    const r1 = upsertBoatsAndLandings(db, rows);
    const r2 = upsertBoatsAndLandings(db, rows);
    expect(r1.boatIds.get('Grande')).toBe(r2.boatIds.get('Grande'));
    expect(r1.landingIds.get('Point Loma Sportfishing')).toBe(
      r2.landingIds.get('Point Loma Sportfishing')
    );
  });

  it('empty input produces empty maps without error', () => {
    db = openTestDb();
    const { boatIds, landingIds } = upsertBoatsAndLandings(db, []);
    expect(boatIds.size).toBe(0);
    expect(landingIds.size).toBe(0);
  });
});
