// tests/unit/db/parseFailures.test.ts
// D-07: row-level failures quarantine and are retrievable by run_id for replay.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import * as parseFailures from '../../../src/lib/db/parseFailures';

describe('parseFailures repository (D-07)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('recordMany writes one row per failure keyed to run_id', () => {
    db = openTestDb();
    parseFailures.recordMany(db, 'run-xyz', [
      {
        row_index: 3,
        raw_html_snippet: '<tr><td>garbled</td></tr>',
        zod_error: '[{"path":["angler_count"],"message":"Expected number"}]'
      },
      {
        row_index: 7,
        raw_html_snippet: '<tr><td>partial</td></tr>',
        zod_error: '[{"path":["species"],"message":"Required"}]'
      }
    ]);
    const rows = parseFailures.getByRunId(db, 'run-xyz');
    expect(rows.length).toBe(2);
    expect(rows[0].row_index).toBe(3);
    expect(rows[1].row_index).toBe(7);
    expect(rows[0].raw_html_snippet).toBe('<tr><td>garbled</td></tr>');
  });

  it('recordMany with empty array is a no-op', () => {
    db = openTestDb();
    parseFailures.recordMany(db, 'run-empty', []);
    const rows = parseFailures.getByRunId(db, 'run-empty');
    expect(rows).toEqual([]);
  });

  it('getByRunId scopes by run_id', () => {
    db = openTestDb();
    parseFailures.recordMany(db, 'run-a', [
      { row_index: 0, raw_html_snippet: '<tr/>', zod_error: '[]' }
    ]);
    parseFailures.recordMany(db, 'run-b', [
      { row_index: 0, raw_html_snippet: '<tr/>', zod_error: '[]' },
      { row_index: 1, raw_html_snippet: '<tr/>', zod_error: '[]' }
    ]);
    expect(parseFailures.getByRunId(db, 'run-a').length).toBe(1);
    expect(parseFailures.getByRunId(db, 'run-b').length).toBe(2);
  });
});
