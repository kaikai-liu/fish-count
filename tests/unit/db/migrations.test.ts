// tests/unit/db/migrations.test.ts
// STO-01/02/03/05 + ING-04/09 schema invariants, verified against :memory: SQLite.
// These tests lock the canonical schema locked in CONTEXT.md D-01..D-06.
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type DatabaseType from 'better-sqlite3';
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

  it('does NOT create the forecasts table (Phase 8 RTR-03 / D-19 — retired)', () => {
    db = openTestDb();
    const rows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='forecasts'`)
      .all() as Array<{ name: string }>;
    expect(rows.length).toBe(0);
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
    // Phase 1 tables (5) + Phase 8 trip_type_aliases (1). Forecasts is retired
    // (RTR-03 / D-19) so it must NOT appear here.
    const domain = rows.map((r) => r.name).filter((n) => !n.startsWith('sqlite_'));
    expect(domain.sort()).toEqual(
      ['boats', 'catch_reports', 'landings', 'parse_failures', 'scrape_runs', 'trip_type_aliases'].sort()
    );
  });
});

describe('boats.slug additive migration (Phase 6 — D-12, D-13, D-20)', () => {
  let db: DatabaseType.Database | null = null;

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  /**
   * Helper: open a raw :memory: DB with Phase 1 schema but WITHOUT slug column.
   * Simulates a pre-Phase-6 production DB.
   */
  function openPrePhase6Db(): DatabaseType.Database {
    const raw = new Database(':memory:');
    raw.pragma('foreign_keys = ON');
    // Create tables without slug column (as they existed before Phase 6)
    raw.exec(`
      CREATE TABLE IF NOT EXISTS landings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        source_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS boats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        landing_id INTEGER,
        source_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (landing_id) REFERENCES landings(id)
      );
      CREATE TABLE IF NOT EXISTS catch_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_date TEXT NOT NULL,
        boat_id INTEGER NOT NULL,
        landing_id INTEGER NOT NULL,
        trip_type TEXT NOT NULL,
        species TEXT NOT NULL,
        angler_count INTEGER NOT NULL,
        species_count INTEGER NOT NULL,
        scraped_at TEXT NOT NULL,
        FOREIGN KEY (boat_id) REFERENCES boats(id),
        FOREIGN KEY (landing_id) REFERENCES landings(id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_catch_unique ON catch_reports (source_date, boat_id, trip_type, species);
      CREATE INDEX IF NOT EXISTS idx_catch_date_species ON catch_reports (source_date, species);
      CREATE INDEX IF NOT EXISTS idx_catch_boat_date ON catch_reports (boat_id, source_date);
      CREATE TABLE IF NOT EXISTS scrape_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        run_date TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('success','empty','http_error','parse_error','killed')),
        rows_ingested INTEGER NOT NULL DEFAULT 0,
        error_message TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_scrape_runs_date ON scrape_runs(run_date);
      CREATE INDEX IF NOT EXISTS idx_scrape_runs_outcome ON scrape_runs(outcome, run_date);
      CREATE TABLE IF NOT EXISTS parse_failures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        row_index INTEGER NOT NULL,
        raw_html_snippet TEXT NOT NULL,
        zod_error TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_parse_failures_run ON parse_failures(run_id);
      CREATE TABLE IF NOT EXISTS forecasts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        forecast_date TEXT NOT NULL,
        species TEXT NOT NULL,
        trip_type TEXT NOT NULL,
        value REAL,
        pi_low REAL,
        pi_high REAL,
        n_trips INTEGER NOT NULL DEFAULT 0,
        baseline_value REAL,
        gap_days_present INTEGER NOT NULL DEFAULT 0,
        gap_days_expected INTEGER NOT NULL DEFAULT 0,
        computed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_forecasts_unique ON forecasts(forecast_date, species, trip_type);
      CREATE INDEX IF NOT EXISTS idx_forecasts_range ON forecasts(forecast_date, species, trip_type);
    `);
    return raw;
  }

  it('adds slug column and backfills all existing boat rows', () => {
    db = openPrePhase6Db();
    // Seed 3 boats without slug
    db.exec(`INSERT INTO landings (source_name, display_name) VALUES ('H&M Landing', 'H&M Landing')`);
    const landingId = (db.prepare(`SELECT id FROM landings WHERE source_name = 'H&M Landing'`).get() as { id: number }).id;
    db.exec(`INSERT INTO boats (source_name, display_name, landing_id) VALUES ('Pacific Voyager', 'Pacific Voyager', ${landingId})`);
    db.exec(`INSERT INTO boats (source_name, display_name, landing_id) VALUES ('Grande', 'Grande', ${landingId})`);
    db.exec(`INSERT INTO boats (source_name, display_name, landing_id) VALUES ('Tomahawk', 'Tomahawk', ${landingId})`);

    // Run Phase 6 migration
    runMigrations(db);

    const cols = db.prepare(`PRAGMA table_info(boats)`).all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === 'slug')).toBe(true);

    const rows = db.prepare(`SELECT slug FROM boats WHERE slug IS NULL`).all();
    expect(rows.length).toBe(0);

    const boats = db.prepare(`SELECT slug FROM boats ORDER BY id ASC`).all() as Array<{ slug: string }>;
    expect(boats).toHaveLength(3);
    expect(boats[0].slug).toBe('pacific-voyager');
    expect(boats[1].slug).toBe('grande');
    expect(boats[2].slug).toBe('tomahawk');
  });

  it('assigns distinct slugs when two boats have identical display_name', () => {
    db = openPrePhase6Db();
    db.exec(`INSERT INTO landings (source_name, display_name) VALUES ('Seaforth', 'Seaforth')`);
    const landingId = (db.prepare(`SELECT id FROM landings WHERE source_name = 'Seaforth'`).get() as { id: number }).id;
    db.exec(`INSERT INTO boats (source_name, display_name, landing_id) VALUES ('Redfish-1', 'Redfish', ${landingId})`);
    db.exec(`INSERT INTO boats (source_name, display_name, landing_id) VALUES ('Redfish-2', 'Redfish', ${landingId})`);

    runMigrations(db);

    const boats = db.prepare(`SELECT slug FROM boats ORDER BY id ASC`).all() as Array<{ slug: string }>;
    expect(boats[0].slug).toBe('redfish');
    expect(boats[1].slug).toBe('redfish-2');
    // Slugs must be unique
    expect(new Set(boats.map((b) => b.slug)).size).toBe(2);
  });

  it('re-running migration on already-migrated DB is a no-op (idempotent)', () => {
    db = openTestDb(); // fresh DB — already has slug column from first runMigrations
    expect(() => runMigrations(db!)).not.toThrow();
    expect(() => runMigrations(db!)).not.toThrow();
    // No error, no duplicate columns
    const cols = db.prepare(`PRAGMA table_info(boats)`).all() as Array<{ name: string }>;
    const slugCols = cols.filter((c) => c.name === 'slug');
    expect(slugCols.length).toBe(1);
  });

  it('creates idx_catch_species_date index on catch_reports', () => {
    db = openTestDb();
    const indexes = db.prepare(`PRAGMA index_list(catch_reports)`).all() as Array<{ name: string }>;
    expect(indexes.map((i) => i.name)).toContain('idx_catch_species_date');
  });

  it('creates idx_catch_landing_date index on catch_reports', () => {
    db = openTestDb();
    const indexes = db.prepare(`PRAGMA index_list(catch_reports)`).all() as Array<{ name: string }>;
    expect(indexes.map((i) => i.name)).toContain('idx_catch_landing_date');
  });

  it('creates idx_boats_slug as a partial UNIQUE index (WHERE slug IS NOT NULL)', () => {
    db = openTestDb();
    const indexes = db.prepare(`PRAGMA index_list(boats)`).all() as Array<{ name: string; unique: number }>;
    const slugIdx = indexes.find((i) => i.name === 'idx_boats_slug');
    expect(slugIdx, 'idx_boats_slug index must exist').toBeDefined();
    expect(slugIdx!.unique).toBe(1);
    // Confirm the WHERE clause via sqlite_master
    const sql = (db.prepare(`SELECT sql FROM sqlite_master WHERE name = 'idx_boats_slug'`).get() as { sql: string }).sql;
    expect(sql).toContain('WHERE slug IS NOT NULL');
  });

  it('preserves existing idx_catch_boat_date index (not duplicated, not dropped)', () => {
    db = openTestDb();
    const indexes = db.prepare(`PRAGMA index_list(catch_reports)`).all() as Array<{ name: string }>;
    expect(indexes.map((i) => i.name)).toContain('idx_catch_boat_date');
  });
});
