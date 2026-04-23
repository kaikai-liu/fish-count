// src/lib/db/smoke.ts
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
// This is the ENTIRE Phase 0 DAL — a single smoke-test table used to verify
// Litestream replication end-to-end. Phase 1 replaces this file with the
// real catch_reports / boats / landings / scrape_runs repositories.
import Database from 'better-sqlite3';
import { logger } from '$lib/server/logger';

const DEFAULT_DB_PATH = process.env.DB_PATH ?? '/data/fishcount.sqlite3';

export function openSmokeDb(dbPath: string = DEFAULT_DB_PATH): Database.Database {
	const db = new Database(dbPath);
	db.pragma('journal_mode = WAL');
	db.pragma('synchronous = NORMAL');
	db.exec(`
		CREATE TABLE IF NOT EXISTS smoke_test (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			marker TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
	`);
	logger.info({ msg: 'smoke_db_opened', dbPath });
	return db;
}

export function writeSmokeRow(db: Database.Database, marker: string): void {
	db.prepare('INSERT INTO smoke_test (marker) VALUES (?)').run(marker);
}

export function readSmokeRows(
	db: Database.Database
): Array<{ id: number; marker: string; created_at: string }> {
	return db.prepare('SELECT id, marker, created_at FROM smoke_test ORDER BY id').all() as Array<{
		id: number;
		marker: string;
		created_at: string;
	}>;
}

export function countSmokeRows(db: Database.Database): number {
	const row = db.prepare('SELECT COUNT(*) as c FROM smoke_test').get() as { c: number };
	return row.c;
}
