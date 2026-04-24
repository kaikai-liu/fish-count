// src/lib/db/parseFailures.ts — DAL repository for row-level parse quarantine.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
// D-07: failed rows are stored with raw HTML + zod issues for replay.
import type Database from 'better-sqlite3';

export interface ParseFailure {
  row_index: number;
  raw_html_snippet: string;
  zod_error: string;
}

export interface ParseFailureRow extends ParseFailure {
  id: number;
  created_at: string;
}

/**
 * Batch-insert quarantined rows for a given run. Wrapped in a transaction so
 * the entire batch is atomic. Empty arrays are a no-op.
 *
 * P7: better-sqlite3 transactions are SYNCHRONOUS — never await inside the
 * transaction body.
 */
export function recordMany(
  db: Database.Database,
  runId: string,
  failures: ParseFailure[]
): void {
  if (failures.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO parse_failures (run_id, row_index, raw_html_snippet, zod_error)
     VALUES (?, ?, ?, ?)`
  );
  const tx = db.transaction((items: ParseFailure[]) => {
    for (const f of items) {
      stmt.run(runId, f.row_index, f.raw_html_snippet, f.zod_error);
    }
  });
  tx(failures);
}

export function getByRunId(db: Database.Database, runId: string): ParseFailureRow[] {
  return db
    .prepare(
      `SELECT id, row_index, raw_html_snippet, zod_error, created_at
       FROM parse_failures WHERE run_id = ? ORDER BY row_index`
    )
    .all(runId) as ParseFailureRow[];
}
