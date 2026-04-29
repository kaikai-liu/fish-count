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

  it('creates the Phase 3 forecasts table (D-11)', () => {
    db = openTestDb();
    const rows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    expect(rows.map((r) => r.name)).toContain('forecasts');
  });

  it('forecasts has UNIQUE index on (forecast_date, species, trip_type) — the Phase 3 idempotent-upsert key (D-11)', () => {
    db = openTestDb();
    const indexes = db
      .prepare(`PRAGMA index_list(forecasts)`)
      .all() as Array<{ name: string; unique: number }>;
    const uniqueIndex = indexes.find((i) => i.name === 'idx_forecasts_unique');
    expect(uniqueIndex, 'no idx_forecasts_unique on forecasts').toBeDefined();
    expect(uniqueIndex!.unique).toBe(1);
    const idxCols = db
      .prepare(`PRAGMA index_info(${uniqueIndex!.name})`)
      .all() as Array<{ seqno: number; name: string }>;
    const cols = idxCols.sort((a, b) => a.seqno - b.seqno).map((c) => c.name);
    expect(cols).toEqual(['forecast_date', 'species', 'trip_type']);
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
    // Phase 1 tables (5) + Phase 3 forecasts (1) + Phase 4 tables (6) — no duplicates.
    const domain = rows.map((r) => r.name).filter((n) => !n.startsWith('sqlite_'));
    expect(domain.sort()).toEqual(
      [
        'alerts_sent',
        'boats',
        'catch_reports',
        'forecasts',
        'landings',
        'parse_failures',
        'scrape_runs',
        'signup_attempts',
        'subscriber_boats',
        'subscriber_species',
        'subscribers',
        'suppression_list'
      ].sort()
    );
  });
});

describe('migrations — Phase 4 email-alerts schema (ALT-01..ALT-12)', () => {
  let db: Database.Database | null = null;

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('creates all 6 Phase 4 tables', () => {
    db = openTestDb();
    const rows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const names = rows.map((r) => r.name);
    for (const t of [
      'subscribers',
      'subscriber_boats',
      'subscriber_species',
      'suppression_list',
      'signup_attempts',
      'alerts_sent'
    ]) {
      expect(names, `missing table: ${t}`).toContain(t);
    }
  });

  it('subscribers has the expected columns (ALT-01/02)', () => {
    db = openTestDb();
    const cols = db
      .prepare(`PRAGMA table_info(subscribers)`)
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    for (const c of [
      'id',
      'email',
      'status',
      'created_at',
      'confirmed_at',
      'signup_ip',
      'paused_until'
    ]) {
      expect(names, `subscribers missing column: ${c}`).toContain(c);
    }
  });

  it('subscribers.email is UNIQUE — duplicate INSERT throws', () => {
    db = openTestDb();
    db.prepare(`INSERT INTO subscribers (email, status, signup_ip) VALUES (?, 'pending', ?)`)
      .run('a@b.com', '1.1.1.1');
    expect(() => {
      db!
        .prepare(`INSERT INTO subscribers (email, status, signup_ip) VALUES (?, 'pending', ?)`)
        .run('a@b.com', '2.2.2.2');
    }).toThrow();
  });

  it('subscribers.status CHECK constraint rejects values outside (pending, active)', () => {
    db = openTestDb();
    expect(() => {
      db!
        .prepare(`INSERT INTO subscribers (email, status, signup_ip) VALUES (?, ?, ?)`)
        .run('x@y.com', 'banned', '0.0.0.0');
    }).toThrow();
  });

  it('alerts_sent UNIQUE(subscriber_id, kind, trigger_key, trigger_date) rejects duplicate inserts (ALT-11)', () => {
    db = openTestDb();
    db.prepare(`INSERT INTO landings (id, source_name, display_name) VALUES (1, 'fl', 'Fishermans')`).run();
    db.prepare(`INSERT INTO boats (id, source_name, display_name, landing_id) VALUES (1, 'b1', 'B1', 1)`).run();
    db.prepare(`INSERT INTO subscribers (id, email, status, signup_ip) VALUES (1, 'a@b.com', 'active', '1.1.1.1')`).run();
    db.prepare(
      `INSERT INTO alerts_sent (subscriber_id, kind, trigger_key, trigger_date, status, sent_at)
       VALUES (?, ?, ?, ?, 'sent', datetime('now'))`
    ).run(1, 'hot_day', 'boat:1:1/2 Day AM', '2026-04-27');
    expect(() => {
      db!
        .prepare(
          `INSERT INTO alerts_sent (subscriber_id, kind, trigger_key, trigger_date, status, sent_at)
           VALUES (?, ?, ?, ?, 'sent', datetime('now'))`
        )
        .run(1, 'hot_day', 'boat:1:1/2 Day AM', '2026-04-27');
    }).toThrow();
  });

  it('alerts_sent.kind CHECK constraint rejects values outside (hot_day, starting_to_run)', () => {
    db = openTestDb();
    db.prepare(`INSERT INTO subscribers (id, email, status, signup_ip) VALUES (1, 'a@b.com', 'active', '1.1.1.1')`).run();
    expect(() => {
      db!
        .prepare(
          `INSERT INTO alerts_sent (subscriber_id, kind, trigger_key, trigger_date, status)
           VALUES (?, ?, ?, ?, 'queued')`
        )
        .run(1, 'random_kind', 'k', '2026-04-27');
    }).toThrow();
  });

  it('suppression_list.reason CHECK constraint rejects values outside (user_unsub, operator_remove)', () => {
    db = openTestDb();
    expect(() => {
      db!
        .prepare(`INSERT INTO suppression_list (email, reason) VALUES (?, ?)`)
        .run('a@b.com', 'bounce');
    }).toThrow();
  });

  it('signup_attempts has indexed (ip, attempted_at)', () => {
    db = openTestDb();
    const indexes = db
      .prepare(`PRAGMA index_list(signup_attempts)`)
      .all() as Array<{ name: string }>;
    expect(indexes.map((i) => i.name)).toContain('idx_signup_attempts_ip_time');
  });

  it('subscriber_boats CASCADEs on subscriber delete', () => {
    db = openTestDb();
    db.prepare(`INSERT INTO landings (id, source_name, display_name) VALUES (1, 'fl', 'F')`).run();
    db.prepare(`INSERT INTO boats (id, source_name, display_name, landing_id) VALUES (1, 'b', 'B', 1)`).run();
    db.prepare(
      `INSERT INTO subscribers (id, email, status, signup_ip) VALUES (1, 'a@b.com', 'active', '1.1.1.1')`
    ).run();
    db.prepare(`INSERT INTO subscriber_boats (subscriber_id, boat_id) VALUES (1, 1)`).run();
    db.prepare(`INSERT INTO subscriber_species (subscriber_id, species) VALUES (1, 'bluefin')`).run();
    db.prepare(`DELETE FROM subscribers WHERE id = 1`).run();
    const fb = db.prepare(`SELECT COUNT(*) AS c FROM subscriber_boats WHERE subscriber_id = 1`).get() as { c: number };
    const fs = db.prepare(`SELECT COUNT(*) AS c FROM subscriber_species WHERE subscriber_id = 1`).get() as { c: number };
    expect(fb.c).toBe(0);
    expect(fs.c).toBe(0);
  });

  it('alerts_sent CASCADEs on subscriber delete', () => {
    db = openTestDb();
    db.prepare(
      `INSERT INTO subscribers (id, email, status, signup_ip) VALUES (1, 'a@b.com', 'active', '1.1.1.1')`
    ).run();
    db.prepare(
      `INSERT INTO alerts_sent (subscriber_id, kind, trigger_key, trigger_date, status, sent_at)
       VALUES (1, 'hot_day', 'k', '2026-04-27', 'sent', datetime('now'))`
    ).run();
    db.prepare(`DELETE FROM subscribers WHERE id = 1`).run();
    const c = db.prepare(`SELECT COUNT(*) AS c FROM alerts_sent WHERE subscriber_id = 1`).get() as { c: number };
    expect(c.c).toBe(0);
  });

  it('runMigrations is idempotent for Phase 4 tables (called twice)', () => {
    db = openTestDb();
    expect(() => runMigrations(db!)).not.toThrow();
    expect(() => runMigrations(db!)).not.toThrow();
  });
});
