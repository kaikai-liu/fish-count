// tests/unit/db/migrations-aliases.test.ts
// Phase 8 ALI-01 / RTR-03 — verifies the alias-table CREATE+seed migration is
// idempotent and the forecasts-DROP migration is idempotent.
//
// Sources:
//   .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-02, §D-06, §D-19
//   .planning/phases/08-home-retire-polish/08-RESEARCH.md
//     §"Idempotent Alias Table Migration + Seed" (lines 891-957)
//     §"Forecasts-Table Drop Migration" (lines 961-977)
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type DatabaseType from 'better-sqlite3';
import { runMigrations } from '../../../src/lib/db/migrations';
import { openTestDb } from '../../helpers/in-memory-db';

// Seed size derived from the canonical 26-row list in src/lib/db/migrations.ts
// (3 aliased + 11 accepted + 12 pending). Locked here so a regression that
// silently shrinks or grows the seed list trips the test.
const EXPECTED_SEED_COUNT = 26;

describe('migrations — alias table CREATE+seed (Phase 8 ALI-01, ALI-05)', () => {
  let db: DatabaseType.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('creates trip_type_aliases with the expected seed row count on a fresh DB', () => {
    db = openTestDb();
    const { c } = db.prepare(`SELECT COUNT(*) AS c FROM trip_type_aliases`).get() as { c: number };
    expect(c).toBe(EXPECTED_SEED_COUNT);
  });

  it('seeds the operator-confirmed Full Day Coronado Islands -> Full Day merge as status=aliased', () => {
    db = openTestDb();
    const row = db.prepare(
      `SELECT canonical_label, status FROM trip_type_aliases WHERE source_label = ?`
    ).get('Full Day Coronado Islands') as { canonical_label: string; status: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.canonical_label).toBe('Full Day');
    expect(row!.status).toBe('aliased');
  });

  it('seeds 3 aliased rows, 11 accepted rows, 12 pending rows', () => {
    db = openTestDb();
    const counts = db.prepare(
      `SELECT status, COUNT(*) AS c FROM trip_type_aliases GROUP BY status`
    ).all() as Array<{ status: string; c: number }>;
    const byStatus = Object.fromEntries(counts.map((r) => [r.status, r.c]));
    expect(byStatus.aliased).toBe(3);
    expect(byStatus.accepted).toBe(11);
    expect(byStatus.pending).toBe(12);
  });

  it('is idempotent — re-running runMigrations preserves operator edits and does not duplicate seed', () => {
    db = openTestDb();
    // Simulate operator editing a row in the admin page.
    db.prepare(
      `UPDATE trip_type_aliases SET notes = 'op edit' WHERE source_label = '1/2 Day AM'`
    ).run();

    runMigrations(db);
    const { c } = db.prepare(`SELECT COUNT(*) AS c FROM trip_type_aliases`).get() as { c: number };
    expect(c).toBe(EXPECTED_SEED_COUNT);

    const row = db.prepare(
      `SELECT notes FROM trip_type_aliases WHERE source_label = ?`
    ).get('1/2 Day AM') as { notes: string };
    expect(row.notes).toBe('op edit');
  });

  it('enforces the status enum CHECK constraint', () => {
    db = openTestDb();
    expect(() =>
      db
        .prepare(
          `INSERT INTO trip_type_aliases (source_label, canonical_label, status)
           VALUES (?, ?, ?)`
        )
        .run('Garbage Label', 'Garbage Label', 'garbage')
    ).toThrow();
  });

  it('aliased rows have non-null accepted_at; pending rows have null accepted_at', () => {
    db = openTestDb();
    const aliased = db
      .prepare(`SELECT accepted_at FROM trip_type_aliases WHERE status = 'aliased' LIMIT 1`)
      .get() as { accepted_at: string | null };
    expect(aliased.accepted_at).not.toBeNull();

    const pending = db
      .prepare(`SELECT accepted_at FROM trip_type_aliases WHERE status = 'pending' LIMIT 1`)
      .get() as { accepted_at: string | null };
    expect(pending.accepted_at).toBeNull();
  });
});

describe('migrations — forecasts table DROP (Phase 8 RTR-03, D-19)', () => {
  let db: DatabaseType.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });

  it('forecasts table does not exist after runMigrations on a fresh DB', () => {
    db = openTestDb();
    const rows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='forecasts'`)
      .all() as Array<{ name: string }>;
    expect(rows.length).toBe(0);
  });

  it('drops a pre-existing forecasts table + its indexes on migration', () => {
    // Build a "legacy" DB by hand: fresh in-memory + manually create the
    // forecasts table the way Phase 3 left it. Then run the Phase 8 migration
    // and confirm the table + both indexes were dropped.
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE forecasts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        forecast_date TEXT NOT NULL,
        species TEXT NOT NULL,
        trip_type TEXT NOT NULL,
        value REAL,
        pi_low REAL,
        pi_high REAL,
        n_trips INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX idx_forecasts_unique
        ON forecasts(forecast_date, species, trip_type);
      CREATE INDEX idx_forecasts_range
        ON forecasts(forecast_date, species, trip_type);
    `);

    // Sanity — confirm the legacy state before migration.
    const beforeTables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='forecasts'`)
      .all();
    expect(beforeTables.length).toBe(1);

    runMigrations(db);

    const afterTables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='forecasts'`)
      .all();
    expect(afterTables.length).toBe(0);

    const afterIndexes = db
      .prepare(
        `SELECT name FROM sqlite_master
          WHERE type='index' AND name IN ('idx_forecasts_unique','idx_forecasts_range')`
      )
      .all();
    expect(afterIndexes.length).toBe(0);
  });

  it('re-running migrations after the forecasts drop is a no-op (idempotent)', () => {
    db = openTestDb();
    expect(() => runMigrations(db!)).not.toThrow();
    expect(() => runMigrations(db!)).not.toThrow();
  });
});
