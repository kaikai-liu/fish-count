// tests/unit/db/boats.test.ts
// D-01: boats repository upserts by source_name with stable surrogate id.
// Also verifies landings repository since catch_reports FKs to both.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import * as boats from '../../../src/lib/db/boats';
import * as landings from '../../../src/lib/db/landings';

describe('boats + landings repositories (D-01, D-02)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('landings.upsertByName returns stable id on repeated calls', () => {
    db = openTestDb();
    const id1 = landings.upsertByName(
      db,
      'Point Loma Sportfishing',
      'Point Loma Sportfishing',
      'https://example.com/landings/plsf'
    );
    const id2 = landings.upsertByName(db, 'Point Loma Sportfishing', 'Point Loma Sportfishing');
    expect(id1).toBe(id2);
    const count = db.prepare(`SELECT COUNT(*) AS c FROM landings`).get() as { c: number };
    expect(count.c).toBe(1);
  });

  it('landings.getById returns the row by id', () => {
    db = openTestDb();
    const id = landings.upsertByName(db, "Fisherman's Landing", "Fisherman's Landing");
    const row = landings.getById(db, id);
    expect(row?.source_name).toBe("Fisherman's Landing");
    expect(row?.display_name).toBe("Fisherman's Landing");
  });

  it('boats.upsertByName returns stable id on repeated calls and links to landing', () => {
    db = openTestDb();
    const landingId = landings.upsertByName(db, 'H&M Landing', 'H&M Landing');
    const id1 = boats.upsertByName(db, 'Grande', landingId, 'Grande', '/charter_boats/grande.php');
    const id2 = boats.upsertByName(db, 'Grande', landingId, 'Grande', '/charter_boats/grande.php');
    expect(id1).toBe(id2);
    const row = boats.getById(db, id1);
    expect(row?.source_name).toBe('Grande');
    expect(row?.landing_id).toBe(landingId);
    expect(row?.source_url).toBe('/charter_boats/grande.php');
  });

  it('boats.upsertByName updates landing_id on conflict but preserves existing source_url when new is null', () => {
    db = openTestDb();
    const landingA = landings.upsertByName(db, 'Seaforth', 'Seaforth');
    const landingB = landings.upsertByName(db, 'Oceanside', 'Oceanside');
    const id = boats.upsertByName(db, 'Pacific Queen', landingA, 'Pacific Queen', '/orig.php');
    // Second upsert with different landing, no url — url should be preserved.
    boats.upsertByName(db, 'Pacific Queen', landingB, 'Pacific Queen');
    const row = boats.getById(db, id);
    expect(row?.landing_id).toBe(landingB);
    expect(row?.source_url).toBe('/orig.php');
  });
});
