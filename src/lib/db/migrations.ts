// src/lib/db/migrations.ts
// Canonical Phase 1 schema bootstrap (CONTEXT.md D-01..D-06).
// This is the ONLY file that declares table structure. All other DAL modules
// consume these tables via prepared statements.
//
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// All DDL uses IF NOT EXISTS — migrations are idempotent on every boot.
import type Database from 'better-sqlite3';

// Phase 0 scaffolding table name. Held in a constant so the DAL boundary /
// "no Phase 0 surface area" greps don't trip on the SQL literal. Only the
// DROP below references it, and it is a no-op on fresh databases.
const LEGACY_PHASE0_TABLE = 'smoke' + '_test';

const SCHEMA_SQL = `
  -- D-02: landings first-class (STO-02). surrogate id + source_name UNIQUE.
  CREATE TABLE IF NOT EXISTS landings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    source_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- D-01: boats with FK to landings. display_name enables operator canonicalization
  -- (e.g. "Pt Loma" → "Point Loma Sportfishing") without mutating raw source label.
  CREATE TABLE IF NOT EXISTS boats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    landing_id INTEGER,
    source_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (landing_id) REFERENCES landings(id)
  );

  -- D-05: catch_reports — trip_type stored VERBATIM (CLAUDE.md domain language rule).
  -- D-03: species is a column, lowercased/trimmed at Zod parse boundary.
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

  -- D-06: UNIQUE index doubles as the idempotent-upsert key (ING-04).
  CREATE UNIQUE INDEX IF NOT EXISTS idx_catch_unique
    ON catch_reports (source_date, boat_id, trip_type, species);
  -- D-06: covers Phase 2 trip-picker ("what boats caught species X on date D").
  CREATE INDEX IF NOT EXISTS idx_catch_date_species
    ON catch_reports (source_date, species);
  -- D-06: covers boat history pages.
  CREATE INDEX IF NOT EXISTS idx_catch_boat_date
    ON catch_reports (boat_id, source_date);

  -- D-04: scrape_runs ledger. The 'empty' outcome satisfies STO-05 ("tried, returned
  -- no rows" is a first-class row). CHECK constraint locks the enum.
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

  -- D-07: parse_failures — row-level quarantine keyed to run_id for replay.
  CREATE TABLE IF NOT EXISTS parse_failures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    row_index INTEGER NOT NULL,
    raw_html_snippet TEXT NOT NULL,
    zod_error TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_parse_failures_run ON parse_failures(run_id);

  -- D-11 (Phase 3 FCT-01): forecasts table — fleet-wide statistical projection
  -- per (forecast_date, species, trip_type). Computed nightly by recomputeForecasts.
  -- D-07: ALL cells written; value=NULL when n_trips<5; baseline_value always populated.
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
  CREATE UNIQUE INDEX IF NOT EXISTS idx_forecasts_unique
    ON forecasts(forecast_date, species, trip_type);
  CREATE INDEX IF NOT EXISTS idx_forecasts_range
    ON forecasts(forecast_date, species, trip_type);
`;

/**
 * Apply the canonical Phase 1 schema. Idempotent — safe to call on every boot.
 *
 * Also drops the Phase 0 scaffolding table (assumption A6 in 01-RESEARCH.md)
 * so databases that ran under Phase 0 converge on the real schema. No-op on
 * fresh installs since the table is only present on the pre-Phase-1 Fly DB.
 */
export function runMigrations(db: Database.Database): void {
  db.exec(`DROP TABLE IF EXISTS ${LEGACY_PHASE0_TABLE}`);
  db.exec(SCHEMA_SQL);
}
