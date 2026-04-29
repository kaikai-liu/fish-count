// tests/unit/db/signupAttempts.test.ts
// Unit tests for src/lib/db/signupAttempts.ts (Phase 4 ALT-03 backbone).
// Verifies: ledger append + sliding-window count math (the algorithmic
// core of the rate-limit decision in Plan 04-02).
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import * as attempts from '../../../src/lib/db/signupAttempts';

describe('signupAttempts DAL', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('recordAttempt persists row with caller-supplied timestamp', () => {
    db = openTestDb();
    attempts.recordAttempt(db, '5.6.7.8', '2026-04-27T10:00:00');
    const row = db
      .prepare(`SELECT ip, attempted_at FROM signup_attempts WHERE ip = ?`)
      .get('5.6.7.8') as { ip: string; attempted_at: string };
    expect(row.ip).toBe('5.6.7.8');
    expect(row.attempted_at).toBe('2026-04-27T10:00:00');
  });

  it('counts attempts only within the window', () => {
    db = openTestDb();
    const ip = '5.6.7.8';
    // Use plain SQLite-friendly datetime strings (no Z suffix) — datetime()
    // arithmetic operates on these directly.
    const t0 = '2026-04-27 10:00:00';
    for (let i = 0; i < 4; i++) attempts.recordAttempt(db, ip, t0);
    // Query at t0+30min, window=3600 (1h) → 4
    expect(attempts.countWithinWindow(db, ip, 3600, '2026-04-27 10:30:00')).toBe(4);
    // Query at t0+61min → 0 (all attempts outside window)
    expect(attempts.countWithinWindow(db, ip, 3600, '2026-04-27 11:01:00')).toBe(0);
    // Different IP → 0
    expect(attempts.countWithinWindow(db, '9.9.9.9', 3600, '2026-04-27 10:30:00')).toBe(0);
  });

  it('window lower bound is INCLUSIVE', () => {
    db = openTestDb();
    const ip = '1.1.1.1';
    // Attempt at exactly the boundary should be counted.
    attempts.recordAttempt(db, ip, '2026-04-27 10:00:00');
    // window=3600, asOf=11:00:00 → boundary is 10:00:00 inclusive.
    expect(attempts.countWithinWindow(db, ip, 3600, '2026-04-27 11:00:00')).toBe(1);
  });

  it('returns 0 when no attempts for the ip', () => {
    db = openTestDb();
    expect(attempts.countWithinWindow(db, '1.1.1.1', 3600, '2026-04-27 11:00:00')).toBe(0);
  });

  it('handles a longer window correctly', () => {
    db = openTestDb();
    const ip = '7.7.7.7';
    attempts.recordAttempt(db, ip, '2026-04-27 09:00:00');
    attempts.recordAttempt(db, ip, '2026-04-27 10:00:00');
    attempts.recordAttempt(db, ip, '2026-04-27 11:00:00');
    // 24h window at 12:00 includes all three.
    expect(attempts.countWithinWindow(db, ip, 86400, '2026-04-27 12:00:00')).toBe(3);
  });
});
