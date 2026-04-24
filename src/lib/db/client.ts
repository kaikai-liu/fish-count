// src/lib/db/client.ts
// DAL connection singleton. Replaces Phase 0 smoke.ts client block.
//
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
// Pragma order + DB_PATH default preserved verbatim from Phase 0 (smoke.ts:9-14).
import Database from 'better-sqlite3';
import { logger } from '$lib/server/logger';
import { runMigrations } from './migrations';

const DEFAULT_DB_PATH = process.env.DB_PATH ?? '/data/fishcount.sqlite3';

let singleton: Database.Database | null = null;

/**
 * Open a new DB handle. Used directly by tests / CLI scripts that need an
 * isolated connection; production code should prefer `getDb()` for the singleton.
 */
export function openDb(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // verbatim from smoke.ts:13
  db.pragma('synchronous = NORMAL'); // verbatim from smoke.ts:14
  db.pragma('foreign_keys = ON'); // enforce FK constraints at runtime
  runMigrations(db);
  logger.info({ msg: 'db_opened', dbPath });
  return db;
}

/**
 * Singleton accessor for long-running server processes (SvelteKit server runtime).
 * CLI scripts should call `openDb()` + `close()` themselves for explicit lifecycle.
 */
export function getDb(): Database.Database {
  if (!singleton) singleton = openDb();
  return singleton;
}

/**
 * Close the singleton (if any). Called from the process shutdown hook.
 */
export function closeDb(): void {
  if (singleton) {
    singleton.close();
    singleton = null;
    logger.info({ msg: 'db_closed' });
  }
}
