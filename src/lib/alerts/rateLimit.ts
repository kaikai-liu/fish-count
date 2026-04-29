// src/lib/alerts/rateLimit.ts
// Phase 4 ALT-03: per-IP signup rate limit.
//
// Decision split (mirrors src/lib/scraper/sla.ts):
//   - `exceeded(count)` is PURE — trivially testable without DB.
//   - `check` reads the DAL ledger; caller decides what to do with the result.
//   - `record` writes the DAL ledger; caller invokes only after accepting the attempt.
//
// CLAUDE.md DAL boundary: this module MUST NOT inline SQL. All DB I/O routes
// through src/lib/db/signupAttempts.ts.
//
// REQUIREMENTS.md ALT-03: 3 signups per hour per IP. UI-SPEC FLAG #12 (RESOLVED)
// 3rd attempt is rejected: the 3rd request sees count=2 BEFORE record(); the next
// attempt sees count=3 → exceeded(3) === true.
//
import type Database from 'better-sqlite3';
import * as signupAttempts from '$lib/db/signupAttempts';

export const WINDOW_SECONDS = 3600;
export const MAX_ATTEMPTS = 3;

/** Pure decision: returns true iff `count` of recent attempts is at or above the cap. */
export function exceeded(countInWindow: number): boolean {
  return countInWindow >= MAX_ATTEMPTS;
}

/** Read DAL count + return decision. Caller invokes record(...) only on accept. */
export function check(
  db: Database.Database,
  ip: string,
  asOfIso: string
): { exceeded: boolean; count: number } {
  const count = signupAttempts.countWithinWindow(db, ip, WINDOW_SECONDS, asOfIso);
  return { exceeded: exceeded(count), count };
}

/** Append an attempt to the DAL ledger. Call AFTER all anti-abuse guards have passed. */
export function record(db: Database.Database, ip: string, asOfIso: string): void {
  signupAttempts.recordAttempt(db, ip, asOfIso);
}
