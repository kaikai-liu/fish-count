// src/lib/db/suppressionList.ts — DAL repository for the suppression_list table.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Phase 4 ALT-06 per .planning/phases/04-email-alerts/04-RESEARCH.md
//
// Anti-enumeration discipline (T-04-A11): has() does a single indexed lookup
// with no result-conditional branching. UI-SPEC anti-enumeration relies on
// this — the route layer renders identical responses on hit/miss; this
// module must not introduce timing variance via branching.
//
// Email canonicalization mirrors src/lib/db/subscribers.ts so a row added
// via either path matches a lookup via the other.
import type Database from 'better-sqlite3';

export type SuppressionReason = 'user_unsub' | 'operator_remove';

export interface SuppressedRow {
  email: string;
  suppressed_at: string;
  reason: SuppressionReason;
}

function canonicalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Add an email to the suppression list. INSERT OR IGNORE makes this
 * idempotent — re-adding the same canonicalized email is a no-op rather
 * than a duplicate-key error, so callers don't need to wrap in try/catch.
 */
export function add(db: Database.Database, email: string, reason: SuppressionReason): void {
  db.prepare(
    `INSERT OR IGNORE INTO suppression_list (email, reason, suppressed_at)
     VALUES (?, ?, datetime('now'))`
  ).run(canonicalizeEmail(email), reason);
}

/**
 * Returns true when the (canonicalized) email is on the suppression list.
 * Single indexed equality lookup — constant-time-equivalent shape, no
 * branching that varies on row contents (T-04-A11 anti-enumeration).
 */
export function has(db: Database.Database, email: string): boolean {
  const row = db
    .prepare(`SELECT 1 FROM suppression_list WHERE email = ? LIMIT 1`)
    .get(canonicalizeEmail(email));
  return row !== undefined;
}

/**
 * Operator debug helper: list every suppression row newest-first.
 * Tiny table at v1 scale (<10k rows over the project lifetime); no
 * pagination needed.
 */
export function list(db: Database.Database): SuppressedRow[] {
  return db
    .prepare(
      `SELECT email, suppressed_at, reason
         FROM suppression_list
        ORDER BY suppressed_at DESC`
    )
    .all() as SuppressedRow[];
}
