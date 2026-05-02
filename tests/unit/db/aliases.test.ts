// tests/unit/db/aliases.test.ts
// Unit tests for src/lib/db/aliases.ts — Phase 8 alias DAL (D-01..D-06, ALI-01..ALI-04).
//
// These tests cover the trip_type_aliases CRUD surface (upsert/get/delete/list)
// plus a smoke check on the exported SQL fragments. End-to-end translation
// behavior (ALIAS_JOIN_SQL + CANONICAL_TRIP_TYPE_EXPR producing merged groups
// in real queries) lives in tests/unit/db/aliases-translation.test.ts.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../helpers/seedTestDb';
import {
  ALIAS_JOIN_SQL,
  CANONICAL_TRIP_TYPE_EXPR,
  upsertAlias,
  getAlias,
  deleteAlias,
  listAllLabelsWithStatus,
  type AliasRow
} from '../../../src/lib/db/aliases';

describe('aliases DAL — exported SQL fragments', () => {
  it('ALIAS_JOIN_SQL is a non-empty string', () => {
    expect(typeof ALIAS_JOIN_SQL).toBe('string');
    expect(ALIAS_JOIN_SQL.length).toBeGreaterThan(0);
    expect(ALIAS_JOIN_SQL).toContain('trip_type_aliases');
  });

  it("CANONICAL_TRIP_TYPE_EXPR uses status='aliased' check + COALESCE fallback", () => {
    expect(typeof CANONICAL_TRIP_TYPE_EXPR).toBe('string');
    expect(CANONICAL_TRIP_TYPE_EXPR).toContain('COALESCE');
    expect(CANONICAL_TRIP_TYPE_EXPR).toMatch(/tta\.status\s*=\s*'aliased'/);
    expect(CANONICAL_TRIP_TYPE_EXPR).toContain('cr.trip_type');
  });
});

describe('aliases DAL — upsertAlias', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it("inserts a new alias with status='accepted' and a non-null accepted_at", () => {
    db = openTestDb();
    upsertAlias(db, {
      source_label: 'Full Day',
      canonical_label: 'Full Day',
      status: 'accepted'
    });
    const row = getAlias(db, 'Full Day');
    expect(row).toBeDefined();
    expect(row!.status).toBe('accepted');
    expect(row!.canonical_label).toBe('Full Day');
    expect(row!.accepted_at).not.toBeNull();
  });

  it("inserts a pending row with accepted_at=NULL even on subsequent re-upsert", () => {
    db = openTestDb();
    // First, an accepted row (accepted_at set).
    upsertAlias(db, {
      source_label: 'Lobster',
      canonical_label: 'Lobster',
      status: 'accepted'
    });
    const firstRow = getAlias(db, 'Lobster');
    expect(firstRow!.accepted_at).not.toBeNull();

    // Reset to pending — accepted_at must clear to NULL.
    upsertAlias(db, {
      source_label: 'Lobster',
      canonical_label: 'Lobster',
      status: 'pending'
    });
    const secondRow = getAlias(db, 'Lobster');
    expect(secondRow!.status).toBe('pending');
    expect(secondRow!.accepted_at).toBeNull();
  });

  it('is idempotent — last-write-wins on canonical_label and notes', () => {
    db = openTestDb();
    upsertAlias(db, {
      source_label: 'Full Day Coronado Islands',
      canonical_label: 'Full Day',
      status: 'aliased',
      notes: 'first note'
    });
    upsertAlias(db, {
      source_label: 'Full Day Coronado Islands',
      canonical_label: 'Full Day',
      status: 'aliased',
      notes: 'second note'
    });
    const rows = db.prepare(
      `SELECT COUNT(*) AS c FROM trip_type_aliases WHERE source_label = ?`
    ).get('Full Day Coronado Islands') as { c: number };
    expect(rows.c).toBe(1);

    const row = getAlias(db, 'Full Day Coronado Islands');
    expect(row!.notes).toBe('second note');
  });

  it("rejects status not in ('aliased','accepted','pending') via CHECK constraint", () => {
    db = openTestDb();
    expect(() =>
      upsertAlias(db!, {
        source_label: 'X',
        canonical_label: 'X',
        // @ts-expect-error — intentionally invalid to verify DB-level CHECK
        status: 'invalid'
      })
    ).toThrow();
  });
});

describe('aliases DAL — getAlias', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns undefined for a missing source_label', () => {
    db = openTestDb();
    expect(getAlias(db, 'Nonexistent')).toBeUndefined();
  });

  it('returns the stored row including notes/accepted_at', () => {
    db = openTestDb();
    upsertAlias(db, {
      source_label: 'Extended 1.5 Day',
      canonical_label: '1.5 Day',
      status: 'aliased',
      notes: 'Source-site variant'
    });
    const row = getAlias(db, 'Extended 1.5 Day') as AliasRow;
    expect(row.canonical_label).toBe('1.5 Day');
    expect(row.notes).toBe('Source-site variant');
    expect(row.status).toBe('aliased');
    expect(row.accepted_at).not.toBeNull();
  });
});

describe('aliases DAL — deleteAlias', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('removes an existing row', () => {
    db = openTestDb();
    upsertAlias(db, {
      source_label: 'Full Day',
      canonical_label: 'Full Day',
      status: 'accepted'
    });
    expect(getAlias(db, 'Full Day')).toBeDefined();
    deleteAlias(db, 'Full Day');
    expect(getAlias(db, 'Full Day')).toBeUndefined();
  });

  it('is a no-op on a missing source_label (no throw)', () => {
    db = openTestDb();
    expect(() => deleteAlias(db!, 'Never Existed')).not.toThrow();
  });
});

describe('aliases DAL — listAllLabelsWithStatus', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('returns one row per distinct catch_reports.trip_type, joined with alias state, sorted by trip_count desc', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Pacific Voyager',
      landingName: 'H&M Landing'
    });
    // 2 distinct (date, boat) tuples for 'Full Day'.
    seedTrip(db, { boatId, landingId, date: '2024-06-01', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });
    seedTrip(db, { boatId, landingId, date: '2024-06-02', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 12 });
    // 1 distinct (date, boat) tuple for '1/2 Day AM' — should sort below Full Day.
    seedTrip(db, { boatId, landingId, date: '2024-06-03', tripType: '1/2 Day AM', species: 'yellowtail', anglers: 20, count: 5 });

    upsertAlias(db, {
      source_label: 'Full Day',
      canonical_label: 'Full Day',
      status: 'accepted'
    });
    // '1/2 Day AM' intentionally has no alias row — status should surface as NULL.

    const rows = listAllLabelsWithStatus(db);
    expect(rows.length).toBe(2);
    expect(rows[0].source_label).toBe('Full Day');
    expect(rows[0].trip_count).toBe(2);
    expect(rows[0].status).toBe('accepted');
    expect(rows[0].canonical_label).toBe('Full Day');

    expect(rows[1].source_label).toBe('1/2 Day AM');
    expect(rows[1].status).toBeNull();
    expect(rows[1].canonical_label).toBeNull();
    expect(rows[1].first_seen).toBe('2024-06-03');
    expect(rows[1].last_seen).toBe('2024-06-03');
  });
});
