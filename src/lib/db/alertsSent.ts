// src/lib/db/alertsSent.ts — DAL repository for the alerts_sent table.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Phase 4 ALT-09 / ALT-10 / ALT-11 / ALT-12 per
// .planning/phases/04-email-alerts/04-RESEARCH.md
//
// Idempotency contract (ALT-11, T-04-DAL-02):
//   UNIQUE (subscriber_id, kind, trigger_key, trigger_date) at the schema
//   layer + recordSent/recordQueued throwing on conflict at the DAL layer
//   together guarantee at-most-once dispatch per (subscriber, dedup-key).
//
// Status state machine:
//   queued  → sent      (markSent — happy path drained from queue)
//   queued  → expired   (markExpired — 24h queue TTL; Pitfall 7 mitigation)
//   (no transition out of sent or expired — terminal states)
import type Database from 'better-sqlite3';

export type AlertKind = 'hot_day' | 'starting_to_run';
export type AlertStatus = 'queued' | 'sent' | 'expired';

export interface AlertSentRow {
  id: number;
  subscriber_id: number;
  kind: AlertKind;
  trigger_key: string;
  trigger_date: string;
  status: AlertStatus;
  queued_at: string;
  sent_at: string | null;
  resend_message_id: string | null;
}

export interface DedupKey {
  subscriberId: number;
  kind: AlertKind;
  triggerKey: string;
  triggerDate: string;
}

/**
 * ALT-11 dedup gate: returns true when a row exists for this dedup key,
 * regardless of status (queued, sent, or expired).
 *
 * B1 contract: exists() returning true on a queued row is correct — it
 * prevents the evaluator from queueing the SAME (subscriber, kind,
 * trigger_key, trigger_date) twice. The dispatcher's drainQueued path
 * (Plan 07) reads queued rows BY ID via listQueued() and promotes them
 * to sent via markSent(id, messageId), bypassing the exists() gate by
 * design.
 */
export function exists(db: Database.Database, k: DedupKey): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM alerts_sent
        WHERE subscriber_id = ? AND kind = ? AND trigger_key = ? AND trigger_date = ?
        LIMIT 1`
    )
    .get(k.subscriberId, k.kind, k.triggerKey, k.triggerDate);
  return row !== undefined;
}

/**
 * Insert a 'sent' row. Throws SqliteError on UNIQUE conflict — caller
 * MUST check exists() first when running outside a transaction that
 * already holds the dedup gate.
 */
export function recordSent(db: Database.Database, k: DedupKey, resendMessageId: string): void {
  db.prepare(
    `INSERT INTO alerts_sent (subscriber_id, kind, trigger_key, trigger_date, status, sent_at, resend_message_id)
     VALUES (?, ?, ?, ?, 'sent', datetime('now'), ?)`
  ).run(k.subscriberId, k.kind, k.triggerKey, k.triggerDate, resendMessageId);
}

/**
 * Insert a 'queued' row (no sent_at, no resend_message_id). The
 * dispatcher in Plan 07 picks these up via listQueued() and promotes
 * to 'sent' via markSent().
 */
export function recordQueued(db: Database.Database, k: DedupKey): void {
  db.prepare(
    `INSERT INTO alerts_sent (subscriber_id, kind, trigger_key, trigger_date, status)
     VALUES (?, ?, ?, ?, 'queued')`
  ).run(k.subscriberId, k.kind, k.triggerKey, k.triggerDate);
}

/**
 * ALT-12 warm-up cap denominator: count of 'sent' rows since `sinceIso`.
 * The route layer compares this to the day's cap before flushing the queue.
 *
 * Comparison MUST go through SQLite's `datetime()` so the cutoff (ISO-8601
 * `YYYY-MM-DDTHH:MM:SS.sssZ` from JS) and `sent_at` (SQLite's space-separated
 * `YYYY-MM-DD HH:MM:SS` from `datetime('now')`) are both normalized to the
 * same internal form. A naïve string `>=` would silently return 0 because
 * `' '` (0x20) lexicographically sorts before `'T'` (0x54), excluding every
 * same-day row and quietly disabling the warm-up cap (#CR-01).
 */
export function countSentSince(db: Database.Database, sinceIso: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c
         FROM alerts_sent
        WHERE datetime(sent_at) >= datetime(?)
          AND status = 'sent'`
    )
    .get(sinceIso) as { c: number };
  return row.c;
}

/**
 * Pickup query for the dispatcher — oldest queued first so we drain
 * fairly when the warm-up cap throttles us.
 */
export function listQueued(db: Database.Database): AlertSentRow[] {
  return db
    .prepare(
      `SELECT id, subscriber_id, kind, trigger_key, trigger_date, status,
              queued_at, sent_at, resend_message_id
         FROM alerts_sent
        WHERE status = 'queued'
        ORDER BY queued_at ASC`
    )
    .all() as AlertSentRow[];
}

/**
 * Pitfall 7 mitigation: flip queued → expired for rows older than the
 * dispatch TTL (24h). No-op on already-sent or already-expired rows
 * (WHERE status='queued' guard).
 *
 * Returns the number of rows actually flipped. Empty `ids` short-circuits
 * to avoid the dynamic-placeholder edge case.
 *
 * SECURITY (T-04-A5): the placeholder count is built from `ids.length`
 * (a numeric), and the values themselves pass through `.run(...ids)` —
 * never string-concatenated.
 */
export function markExpired(db: Database.Database, ids: number[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const result = db
    .prepare(
      `UPDATE alerts_sent SET status = 'expired'
        WHERE id IN (${placeholders}) AND status = 'queued'`
    )
    .run(...ids);
  return result.changes;
}

/**
 * Promote a queued row to sent — used by the dispatcher when draining
 * the queue. Idempotent on already-sent rows via the WHERE clause.
 */
export function markSent(db: Database.Database, id: number, resendMessageId: string): void {
  db.prepare(
    `UPDATE alerts_sent
        SET status = 'sent', sent_at = datetime('now'), resend_message_id = ?
      WHERE id = ? AND status = 'queued'`
  ).run(resendMessageId, id);
}
