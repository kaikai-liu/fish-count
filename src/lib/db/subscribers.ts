// src/lib/db/subscribers.ts — DAL repository for the subscribers table.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Phase 4 ALT-01 / ALT-02 / ALT-06 per .planning/phases/04-email-alerts/04-RESEARCH.md
//
// Email canonicalization (lowercase + trim) lives ONLY here and in
// suppressionList.ts — call sites pass raw user input. This is the
// single point of truth for email normalization (T-04-DAL-01 mitigation).
import type Database from 'better-sqlite3';

export interface Subscriber {
  id: number;
  email: string;
  status: 'pending' | 'active';
  created_at: string;
  confirmed_at: string | null;
  signup_ip: string | null;
  paused_until: string | null;
}

export interface SubscriberSummary {
  email: string;
  boats: Array<{ id: number; display_name: string }>;
  species: string[];
}

export interface CreatePendingInput {
  email: string; // canonicalized inside this fn
  boats: number[]; // boat ids
  species: string[]; // verbatim species names (CLAUDE.md domain language)
  ip: string;
}

export interface ActiveSubscriberWithFollows extends Subscriber {
  boats: number[];
  species: string[];
}

function canonicalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * ALT-01/02: insert (or refresh) a pending subscriber + replace follow lists
 * inside one transaction. Returns the subscriber id.
 *
 * On re-signup of the same email while still pending: ON CONFLICT(email)
 * preserves the row id, refreshes signup_ip + created_at, and resets
 * confirmed_at to NULL so the new token must be confirmed independently.
 *
 * If the email already exists in 'active' status, the upsert demotes it back
 * to 'pending' — by design, since the user clicked Sign Up again with new
 * preferences (the route layer is expected to suppress the demote pathway in
 * the rare case where it matters; v1 keeps DAL semantics simple).
 */
export function createPending(db: Database.Database, input: CreatePendingInput): number {
  const email = canonicalizeEmail(input.email);
  // Wrap in transaction so partial INSERTs cannot corrupt follow-state.
  const tx = db.transaction(() => {
    const upsert = db.prepare(
      `INSERT INTO subscribers (email, status, signup_ip, created_at)
       VALUES (?, 'pending', ?, datetime('now'))
       ON CONFLICT(email) DO UPDATE SET
         status = 'pending',
         signup_ip = excluded.signup_ip,
         created_at = datetime('now'),
         confirmed_at = NULL
       RETURNING id`
    );
    const row = upsert.get(email, input.ip) as { id: number };
    // Replace follow lists atomically.
    db.prepare(`DELETE FROM subscriber_boats WHERE subscriber_id = ?`).run(row.id);
    db.prepare(`DELETE FROM subscriber_species WHERE subscriber_id = ?`).run(row.id);
    const insBoat = db.prepare(
      `INSERT OR IGNORE INTO subscriber_boats (subscriber_id, boat_id) VALUES (?, ?)`
    );
    for (const bid of input.boats) insBoat.run(row.id, bid);
    const insSp = db.prepare(
      `INSERT OR IGNORE INTO subscriber_species (subscriber_id, species) VALUES (?, ?)`
    );
    for (const sp of input.species) insSp.run(row.id, sp);
    return row.id;
  });
  return tx() as number;
}

/**
 * ALT-02: flip status='pending' → 'active' and stamp confirmed_at.
 * No-op if the row is already active or absent (WHERE status='pending' guard).
 */
export function activate(db: Database.Database, id: number): void {
  db.prepare(
    `UPDATE subscribers SET status = 'active', confirmed_at = datetime('now') WHERE id = ? AND status = 'pending'`
  ).run(id);
}

export function findActive(db: Database.Database, email: string): Subscriber | null {
  const row = db
    .prepare(
      `SELECT id, email, status, created_at, confirmed_at, signup_ip, paused_until
         FROM subscribers WHERE email = ? AND status = 'active' LIMIT 1`
    )
    .get(canonicalizeEmail(email)) as Subscriber | undefined;
  return row ?? null;
}

/**
 * Returns the subscriber row when it is still pending AND created_at is
 * within the last `ttlSec` seconds. Used by the resend-confirmation flow
 * and by tests that expire stale pending rows.
 */
export function findRecentPending(
  db: Database.Database,
  email: string,
  ttlSec: number
): Subscriber | null {
  const row = db
    .prepare(
      `SELECT id, email, status, created_at, confirmed_at, signup_ip, paused_until
         FROM subscribers
        WHERE email = ?
          AND status = 'pending'
          AND created_at >= datetime('now', '-' || ? || ' seconds')
        LIMIT 1`
    )
    .get(canonicalizeEmail(email), ttlSec) as Subscriber | undefined;
  return row ?? null;
}

export function findById(db: Database.Database, id: number): Subscriber | null {
  const row = db
    .prepare(
      `SELECT id, email, status, created_at, confirmed_at, signup_ip, paused_until
         FROM subscribers WHERE id = ? LIMIT 1`
    )
    .get(id) as Subscriber | undefined;
  return row ?? null;
}

/**
 * Returns all currently-active subscribers with their followed boat ids
 * and species names. Filters out rows where paused_until is in the future.
 *
 * v1 scale (~hundreds of subscribers) makes the N+1 follow-loop fine.
 * If/when scale demands, swap for a single JOIN query — the public shape
 * does not change.
 */
export function listActive(db: Database.Database): ActiveSubscriberWithFollows[] {
  const subs = db
    .prepare(
      `SELECT id, email, status, created_at, confirmed_at, signup_ip, paused_until
         FROM subscribers
        WHERE status = 'active'
          AND (paused_until IS NULL OR paused_until < date('now'))
        ORDER BY id ASC`
    )
    .all() as Subscriber[];
  const boatStmt = db.prepare(
    `SELECT boat_id FROM subscriber_boats WHERE subscriber_id = ? ORDER BY boat_id ASC`
  );
  const spStmt = db.prepare(
    `SELECT species FROM subscriber_species WHERE subscriber_id = ? ORDER BY species ASC`
  );
  return subs.map((s) => ({
    ...s,
    boats: (boatStmt.all(s.id) as Array<{ boat_id: number }>).map((r) => r.boat_id),
    species: (spStmt.all(s.id) as Array<{ species: string }>).map((r) => r.species)
  }));
}

/**
 * Hard-delete the subscriber. CASCADE removes subscriber_boats,
 * subscriber_species, and alerts_sent rows in the same transaction.
 *
 * The suppression_list row (if any) is intentionally NOT touched here —
 * suppression survives row deletion (ALT-06 invariant).
 */
export function deleteForUnsubscribe(db: Database.Database, id: number): void {
  db.prepare(`DELETE FROM subscribers WHERE id = ?`).run(id);
}

/**
 * Render the subscriber's preferences for the /alerts/confirmed +
 * /alerts/manage pages. Returns null when the id is unknown.
 */
export function getSummary(db: Database.Database, id: number): SubscriberSummary | null {
  const sub = db.prepare(`SELECT email FROM subscribers WHERE id = ?`).get(id) as
    | { email: string }
    | undefined;
  if (!sub) return null;
  const boats = db
    .prepare(
      `SELECT b.id, b.display_name
         FROM subscriber_boats sb
         JOIN boats b ON b.id = sb.boat_id
        WHERE sb.subscriber_id = ?
        ORDER BY b.display_name ASC`
    )
    .all(id) as Array<{ id: number; display_name: string }>;
  const species = (
    db
      .prepare(`SELECT species FROM subscriber_species WHERE subscriber_id = ? ORDER BY species ASC`)
      .all(id) as Array<{ species: string }>
  ).map((r) => r.species);
  return { email: sub.email, boats, species };
}

export interface UpdatePreferencesArgs {
  boats: number[];
  species: string[];
  pausedUntil?: string | null;
}

/**
 * Replace follow lists atomically + optional pause toggle. Used by the
 * /alerts/manage POST handler in Plan 04-04.
 *
 * pausedUntil semantics:
 *   undefined → leave existing paused_until alone
 *   null      → clear pause (unpause)
 *   string    → set pause-until-date (YYYY-MM-DD PT)
 */
export function updatePreferences(
  db: Database.Database,
  id: number,
  args: UpdatePreferencesArgs
): void {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM subscriber_boats WHERE subscriber_id = ?`).run(id);
    db.prepare(`DELETE FROM subscriber_species WHERE subscriber_id = ?`).run(id);
    const insBoat = db.prepare(
      `INSERT OR IGNORE INTO subscriber_boats (subscriber_id, boat_id) VALUES (?, ?)`
    );
    for (const bid of args.boats) insBoat.run(id, bid);
    const insSp = db.prepare(
      `INSERT OR IGNORE INTO subscriber_species (subscriber_id, species) VALUES (?, ?)`
    );
    for (const sp of args.species) insSp.run(id, sp);
    if (args.pausedUntil !== undefined) {
      db.prepare(`UPDATE subscribers SET paused_until = ? WHERE id = ?`).run(args.pausedUntil, id);
    }
  });
  tx();
}
