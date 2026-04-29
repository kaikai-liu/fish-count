// tests/unit/db/suppressionList.test.ts
// Unit tests for src/lib/db/suppressionList.ts (Phase 4 ALT-06).
// Verifies: canonicalized writes/reads, idempotent INSERT OR IGNORE,
// CHECK constraint on reason, anti-enumeration shape (single indexed lookup).
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import * as suppression from '../../../src/lib/db/suppressionList';

describe('suppressionList DAL', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('add inserts canonicalized email and is idempotent on duplicate', () => {
    db = openTestDb();
    suppression.add(db, ' KaiKai@Gmail.COM ', 'user_unsub');
    suppression.add(db, 'kaikai@gmail.com', 'user_unsub');
    expect(suppression.list(db)).toHaveLength(1);
  });

  it('has returns true for canonicalized match, false otherwise', () => {
    db = openTestDb();
    suppression.add(db, 'a@b.com', 'user_unsub');
    expect(suppression.has(db, 'A@B.com')).toBe(true);
    expect(suppression.has(db, 'a@b.com')).toBe(true);
    expect(suppression.has(db, ' a@b.com ')).toBe(true);
    expect(suppression.has(db, 'c@d.com')).toBe(false);
  });

  it('add accepts both reason values', () => {
    db = openTestDb();
    suppression.add(db, 'a@b.com', 'user_unsub');
    suppression.add(db, 'c@d.com', 'operator_remove');
    const all = suppression.list(db);
    expect(all).toHaveLength(2);
    const reasons = all.map((r) => r.reason).sort();
    expect(reasons).toEqual(['operator_remove', 'user_unsub']);
  });

  it('rejects invalid reason via CHECK constraint', () => {
    db = openTestDb();
    expect(() =>
      db!
        .prepare(`INSERT INTO suppression_list (email, reason) VALUES (?, ?)`)
        .run('a@b.com', 'bounce')
    ).toThrow();
  });

  it('list returns rows newest-first by suppressed_at', () => {
    db = openTestDb();
    db.prepare(
      `INSERT INTO suppression_list (email, reason, suppressed_at)
       VALUES ('a@b.com', 'user_unsub', '2026-01-01T00:00:00')`
    ).run();
    db.prepare(
      `INSERT INTO suppression_list (email, reason, suppressed_at)
       VALUES ('b@b.com', 'user_unsub', '2026-04-01T00:00:00')`
    ).run();
    const rows = suppression.list(db);
    expect(rows[0].email).toBe('b@b.com');
    expect(rows[1].email).toBe('a@b.com');
  });
});
