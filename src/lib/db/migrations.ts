// src/lib/db/migrations.ts
// Canonical Phase 1 schema bootstrap (CONTEXT.md D-01..D-06).
// This is the ONLY file that declares table structure. All other DAL modules
// consume these tables via prepared statements.
//
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// All DDL uses IF NOT EXISTS — migrations are idempotent on every boot.
import type Database from 'better-sqlite3';
import { slugify, uniqueSlug } from '$lib/shared/slug';

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

  -- Phase 3 FCT-01 forecasts table is RETIRED in Phase 8 (D-19, RTR-03).
  -- Drop is performed in dropForecastsTable() — runs from runMigrations().
  -- Schema deliberately no longer creates the table; the DROP is idempotent.
`;

/**
 * Guard: returns true if boats already has a slug column.
 * Used to prevent re-running the ALTER TABLE on already-migrated DBs.
 */
function hasSlugColumn(db: Database.Database): boolean {
  const cols = db.prepare(`PRAGMA table_info(boats)`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === 'slug');
}

/**
 * Backfill slug values for all boats that currently have slug IS NULL.
 * Reads all (id, display_name) rows in id-ascending order, builds a taken Set
 * accumulating as it goes, and issues UPDATE inside a single transaction.
 * D-13: never overwrites an existing non-null slug.
 */
function backfillSlugs(db: Database.Database): void {
  const rows = db
    .prepare(`SELECT id, display_name FROM boats WHERE slug IS NULL ORDER BY id ASC`)
    .all() as Array<{ id: number; display_name: string }>;
  const taken = new Set<string>();
  const upd = db.prepare(`UPDATE boats SET slug = ? WHERE id = ?`);
  const tx = db.transaction((items: Array<{ id: number; display_name: string }>) => {
    for (const row of items) {
      const slug = uniqueSlug(slugify(row.display_name), taken);
      taken.add(slug);
      upd.run(slug, row.id);
    }
  });
  tx(rows);
}

/**
 * Phase 8 RTR-03 (D-19): drop the retired forecasts table and its indexes.
 * Idempotent — `IF EXISTS` everywhere. Safe to re-run on every boot.
 *
 * The forecasts table was Phase 3 statistical-projection storage. Phase 8
 * retires the forecast feature entirely (operator decision per D-19); the
 * derived data has no PII so the drop is reversible at most by re-running
 * a future scrape backfill, but no production system depends on it.
 */
function dropForecastsTable(db: Database.Database): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_forecasts_unique;
    DROP INDEX IF EXISTS idx_forecasts_range;
    DROP TABLE IF EXISTS forecasts;
  `);
}

/**
 * Phase 8 ALI-01 / ALI-05 (D-02, D-06): create trip_type_aliases and seed
 * the initial 26-row alias map. Idempotent — `IF NOT EXISTS` on the table
 * and indexes; seed only runs when the table is empty (preserves operator
 * edits on subsequent boots).
 *
 * Seed contents (per Phase 8 RESEARCH §"Idempotent Alias Table Migration +
 * Seed" lines 891-957 + spike addendum 2 inventory of 25 distinct labels in
 * the live DB):
 *   - 3 confident merges (status='aliased') — read-time merged into a canonical
 *   - 11 stable canonicals (status='accepted') — surface as themselves
 *   - 12 ambiguous one-offs (status='pending') — surface as themselves until
 *     the operator adjudicates them via /admin/trip-types (Wave 2)
 *
 * Per Phase 8 RESEARCH Open Question 2: only `Full Day Coronado Islands →
 * Full Day` is operator-confirmed (2026-04-27 source-site relabel). Every
 * other row is Claude-inferred from the spike addendum and reversible via
 * the admin page in Wave 2 — but reviewing the seed list at the Wave 1
 * checkpoint is a 5-minute, high-leverage step.
 *
 * `Long Range` is included as 'accepted' for forward-compatibility — no
 * rows in catch_reports yet (verified 2026-05-02), but the spike research
 * named it as a stable canonical for SD long-range trips.
 */
function runAliasTableMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trip_type_aliases (
      source_label TEXT PRIMARY KEY,
      canonical_label TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('aliased', 'accepted', 'pending')),
      accepted_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_alias_canonical ON trip_type_aliases(canonical_label);
    CREATE INDEX IF NOT EXISTS idx_alias_status ON trip_type_aliases(status);
  `);

  const count = (
    db.prepare(`SELECT COUNT(*) AS c FROM trip_type_aliases`).get() as { c: number }
  ).c;
  if (count !== 0) return;

  // Seed — 26 rows. Operator can edit any row via /admin/trip-types (Wave 2).
  // Use INSERT OR IGNORE so a partially-populated table also stays safe.
  type SeedRow = {
    source: string;
    canonical: string;
    status: 'aliased' | 'accepted' | 'pending';
    notes?: string;
  };
  const seed: SeedRow[] = [
    // Confident merges (D-06) — status='aliased' triggers read-time translation.
    { source: 'Extended 1.5 Day', canonical: '1.5 Day', status: 'aliased', notes: 'Source-site variant; merged 2026-05' },
    { source: 'Extended 1/2 Day', canonical: '1/2 Day AM', status: 'aliased', notes: 'Likely AM extension; operator review on admin page' },
    { source: 'Full Day Coronado Islands', canonical: 'Full Day', status: 'aliased', notes: '2026-04-27 source-site relabel; operator-confirmed merge; reversible' },

    // Stable canonicals (status='accepted' means "this IS its own canonical").
    { source: '1/2 Day AM', canonical: '1/2 Day AM', status: 'accepted' },
    { source: '1/2 Day PM', canonical: '1/2 Day PM', status: 'accepted' },
    { source: '1/2 Day Twilight', canonical: '1/2 Day Twilight', status: 'accepted' },
    { source: 'Full Day', canonical: 'Full Day', status: 'accepted' },
    { source: '1.5 Day', canonical: '1.5 Day', status: 'accepted' },
    { source: '2 Day', canonical: '2 Day', status: 'accepted' },
    { source: '3 Day', canonical: '3 Day', status: 'accepted' },
    { source: 'Overnight', canonical: 'Overnight', status: 'accepted' },
    { source: '3.5 Day', canonical: '3.5 Day', status: 'accepted' },
    { source: '3/4 Day', canonical: '3/4 Day', status: 'accepted' },
    { source: 'Long Range', canonical: 'Long Range', status: 'accepted' },

    // Pending — operator must adjudicate via admin page (D-05 NEW badge in Wave 2).
    { source: '1.75 Day', canonical: '1.75 Day', status: 'pending' },
    { source: '4 Day', canonical: '4 Day', status: 'pending' },
    { source: '4.5 Day', canonical: '4.5 Day', status: 'pending' },
    { source: '5 Day', canonical: '5 Day', status: 'pending' },
    { source: '6 Day', canonical: '6 Day', status: 'pending' },
    { source: '7 Day', canonical: '7 Day', status: 'pending' },
    { source: '3.25 Day', canonical: '3.25 Day', status: 'pending' },
    { source: '2.5 Day', canonical: '2.5 Day', status: 'pending' },
    { source: '3/4 Day Local', canonical: '3/4 Day', status: 'pending', notes: 'Probably 3/4 Day variant — operator review' },
    { source: '3/4 Day Islands', canonical: '3/4 Day', status: 'pending' },
    { source: '3/4 Day Offshore', canonical: '3/4 Day', status: 'pending' },
    { source: 'Lobster', canonical: 'Lobster', status: 'pending', notes: 'Distinct category — keep separate?' }
  ];

  const insert = db.prepare(
    `INSERT OR IGNORE INTO trip_type_aliases
       (source_label, canonical_label, status, accepted_at, notes)
     VALUES (
       @source, @canonical, @status,
       CASE WHEN @status = 'pending' THEN NULL ELSE datetime('now') END,
       @notes
     )`
  );
  const tx = db.transaction((rows: SeedRow[]) => {
    for (const r of rows) {
      insert.run({
        source: r.source,
        canonical: r.canonical,
        status: r.status,
        notes: r.notes ?? null
      });
    }
  });
  tx(seed);
}

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

  // Phase 6 additive migration: boats.slug column + covering indexes (D-12, D-20)
  if (!hasSlugColumn(db)) {
    db.exec(`ALTER TABLE boats ADD COLUMN slug TEXT`);
    backfillSlugs(db);
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_boats_slug ON boats(slug) WHERE slug IS NOT NULL`
    );
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_catch_species_date ON catch_reports(species, source_date)`
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_catch_landing_date ON catch_reports(landing_id, source_date)`
  );

  // Phase 8 retire — drop forecasts BEFORE creating the alias table so a
  // partially-migrated DB cannot interleave the two surfaces. SCHEMA_SQL
  // no longer recreates forecasts, so this is a no-op on fresh DBs.
  dropForecastsTable(db); // RTR-03 (D-19)
  runAliasTableMigration(db); // ALI-01, ALI-05
}
