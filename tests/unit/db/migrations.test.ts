// tests/unit/db/migrations.test.ts
// STO-01/02/03/05 + ING-04/09 schema invariants, verified against :memory: SQLite.
// These tests lock the canonical schema locked in CONTEXT.md D-01..D-06.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import { runMigrations } from '../../../src/lib/db/migrations';

describe('migrations — canonical Phase 1 schema (D-01..D-06)', () => {
  let db: Database.Database | null = null;

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('creates all 5 Phase 1 tables', () => {
    db = openTestDb();
    const rows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const names = rows.map((r) => r.name);
    for (const t of ['boats', 'landings', 'catch_reports', 'scrape_runs', 'parse_failures']) {
      expect(names, `missing table: ${t}`).toContain(t);
    }
  });

  it('catch_reports has columns in canonical order (D-05)', () => {
    db = openTestDb();
    const cols = db
      .prepare(`PRAGMA table_info(catch_reports)`)
      .all() as Array<{ cid: number; name: string; type: string }>;
    const ordered = cols.sort((a, b) => a.cid - b.cid).map((c) => c.name);
    expect(ordered).toEqual([
      'id',
      'source_date',
      'boat_id',
      'landing_id',
      'trip_type',
      'species',
      'angler_count',
      'species_count',
      'scraped_at'
    ]);
  });

  it('catch_reports has UNIQUE index on (source_date, boat_id, trip_type, species) — the idempotent-upsert key (D-06, ING-04)', () => {
    db = openTestDb();
    const indexes = db
      .prepare(`PRAGMA index_list(catch_reports)`)
      .all() as Array<{ name: string; unique: number }>;
    const uniqueIndex = indexes.find((i) => i.unique === 1);
    expect(uniqueIndex, 'no unique index on catch_reports').toBeDefined();
    const idxCols = db
      .prepare(`PRAGMA index_info(${uniqueIndex!.name})`)
      .all() as Array<{ seqno: number; name: string }>;
    const cols = idxCols.sort((a, b) => a.seqno - b.seqno).map((c) => c.name);
    expect(cols).toEqual(['source_date', 'boat_id', 'trip_type', 'species']);
  });

  it('scrape_runs has outcome index (D-04 baseline query support)', () => {
    db = openTestDb();
    const indexes = db
      .prepare(`PRAGMA index_list(scrape_runs)`)
      .all() as Array<{ name: string }>;
    expect(indexes.map((i) => i.name)).toContain('idx_scrape_runs_outcome');
  });

  it('scrape_runs CHECK constraint rejects invalid outcome values (STO-05)', () => {
    db = openTestDb();
    expect(() => {
      db!
        .prepare(
          `INSERT INTO scrape_runs
            (run_id, run_date, started_at, finished_at, outcome, rows_ingested)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run('run-x', '2026-04-24', 'now', 'now', 'invalid', 0);
    }).toThrow();
  });

  it('catch_reports foreign key to boats is enforced (foreign_keys=ON)', () => {
    db = openTestDb();
    // No boat with id=999 exists → FK violation
    expect(() => {
      db!
        .prepare(
          `INSERT INTO catch_reports
            (source_date, boat_id, landing_id, trip_type, species,
             angler_count, species_count, scraped_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run('2026-04-24', 999, 999, 'Full Day', 'yellowtail', 10, 5, 'now');
    }).toThrow();
  });

  it('re-running migrations is idempotent (IF NOT EXISTS guards)', () => {
    db = openTestDb();
    // Run again — should not throw.
    expect(() => runMigrations(db!)).not.toThrow();
    expect(() => runMigrations(db!)).not.toThrow();
    const rows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    // Still exactly the 5 tables — no duplicates.
    const domain = rows.map((r) => r.name).filter((n) => !n.startsWith('sqlite_'));
    expect(domain.sort()).toEqual(
      ['boats', 'catch_reports', 'landings', 'parse_failures', 'scrape_runs'].sort()
    );
  });
});
