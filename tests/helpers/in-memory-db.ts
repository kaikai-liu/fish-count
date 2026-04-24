// tests/helpers/in-memory-db.ts
// Test helper: open a :memory: better-sqlite3 DB with the Phase 1 schema applied.
// Used by all DAL unit tests to avoid disk I/O and bleed between tests.
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/lib/db/migrations';

export function openTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}
