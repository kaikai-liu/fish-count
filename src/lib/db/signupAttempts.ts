// src/lib/db/signupAttempts.ts — DAL repository for the signup_attempts table.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Phase 4 ALT-03 per .planning/phases/04-email-alerts/04-RESEARCH.md
//
// Backbone of src/lib/alerts/rateLimit.ts (Plan 04-02) — per-IP attempt
// ledger queried via a sliding-window count to gate signup attempts.
import type Database from 'better-sqlite3';

/**
 * Append a signup attempt for the given IP at the given ISO timestamp.
 *
 * The timestamp is caller-supplied (not derived here) so unit tests can
 * inject deterministic instants and so the route handler stamps with
 * the same instant it logged for the request — STO-04 sole-date-producer
 * principle: this DAL never invents a clock value.
 */
export function recordAttempt(db: Database.Database, ip: string, attemptedAt: string): void {
  db.prepare(`INSERT INTO signup_attempts (ip, attempted_at) VALUES (?, ?)`).run(ip, attemptedAt);
}

/**
 * Returns the number of attempts logged for `ip` in the last `windowSeconds`
 * seconds relative to `asOfIso`. Sliding window — equality at the lower
 * bound is INCLUSIVE.
 *
 * Uses datetime arithmetic (`datetime(?, '-N seconds')`) so SQLite's date
 * functions handle the math; no JavaScript Date parsing risk.
 */
export function countWithinWindow(
  db: Database.Database,
  ip: string,
  windowSeconds: number,
  asOfIso: string
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c
         FROM signup_attempts
        WHERE ip = ?
          AND attempted_at >= datetime(?, '-' || ? || ' seconds')`
    )
    .get(ip, asOfIso, windowSeconds) as { c: number };
  return row.c;
}
