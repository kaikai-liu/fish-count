// tests/unit/db/alertsSent.test.ts
// Unit tests for src/lib/db/alertsSent.ts (Phase 4 ALT-09/10/11/12).
// Verifies: ALT-11 dedup contract (UNIQUE index throws on duplicate),
// status state machine (queued → sent | expired), warm-up cap counter
// (countSentSince filtering), markExpired no-op on already-sent rows.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import * as sent from '../../../src/lib/db/alertsSent';
import { seedSubscriber } from '../../helpers/seedTestDb';

function freshDb(): Database.Database {
  const db = openTestDb();
  db.prepare(`INSERT INTO landings (id, source_name, display_name) VALUES (1, 'fl', 'F')`).run();
  db.prepare(`INSERT INTO boats (id, source_name, display_name, landing_id) VALUES (1, 'b', 'B', 1)`).run();
  return db;
}

describe('alertsSent DAL', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('exists/recordSent round-trip + ALT-11 dedup throws on duplicate', () => {
    db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', boats: [1] });
    const k = {
      subscriberId: sid,
      kind: 'hot_day' as const,
      triggerKey: 'boat:1:1/2 Day AM',
      triggerDate: '2026-04-27'
    };
    expect(sent.exists(db, k)).toBe(false);
    sent.recordSent(db, k, 'msg-1');
    expect(sent.exists(db, k)).toBe(true);
    // ALT-11: second insert with same dedup key throws (UNIQUE conflict).
    expect(() => sent.recordSent(db, k, 'msg-2')).toThrow();
  });

  it('exists() returns true for queued rows too (B1 contract)', () => {
    db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', boats: [1] });
    const k = {
      subscriberId: sid,
      kind: 'hot_day' as const,
      triggerKey: 'k1',
      triggerDate: '2026-04-27'
    };
    sent.recordQueued(db, k);
    expect(sent.exists(db, k)).toBe(true);
  });

  it('countSentSince filters by sent_at AND status=sent', () => {
    db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', boats: [1] });
    sent.recordSent(
      db,
      { subscriberId: sid, kind: 'hot_day', triggerKey: 'k1', triggerDate: '2026-04-27' },
      'm1'
    );
    sent.recordQueued(db, {
      subscriberId: sid,
      kind: 'hot_day',
      triggerKey: 'k2',
      triggerDate: '2026-04-27'
    });
    expect(sent.countSentSince(db, '2026-04-27 00:00:00')).toBe(1);
  });

  it('countSentSince excludes rows older than the cutoff', () => {
    db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', boats: [1] });
    // Insert a row with a sent_at well in the past.
    db.prepare(
      `INSERT INTO alerts_sent (subscriber_id, kind, trigger_key, trigger_date, status, sent_at, resend_message_id)
       VALUES (?, 'hot_day', 'old', '2025-01-01', 'sent', '2025-01-01 12:00:00', 'm-old')`
    ).run(sid);
    // Cutoff after the past row → 0.
    expect(sent.countSentSince(db, '2026-01-01 00:00:00')).toBe(0);
  });

  it('listQueued returns queued rows in queued_at ASC order', () => {
    db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', boats: [1] });
    // Insert with explicit queued_at to enforce ordering.
    db.prepare(
      `INSERT INTO alerts_sent (subscriber_id, kind, trigger_key, trigger_date, status, queued_at)
       VALUES (?, 'hot_day', 'second', '2026-04-27', 'queued', '2026-04-27 11:00:00')`
    ).run(sid);
    db.prepare(
      `INSERT INTO alerts_sent (subscriber_id, kind, trigger_key, trigger_date, status, queued_at)
       VALUES (?, 'hot_day', 'first', '2026-04-27', 'queued', '2026-04-27 10:00:00')`
    ).run(sid);
    const queued = sent.listQueued(db);
    expect(queued.map((r) => r.trigger_key)).toEqual(['first', 'second']);
  });

  it('markExpired flips queued rows only', () => {
    db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', boats: [1] });
    sent.recordQueued(db, {
      subscriberId: sid,
      kind: 'hot_day',
      triggerKey: 'k1',
      triggerDate: '2026-04-27'
    });
    const queued = sent.listQueued(db);
    expect(queued).toHaveLength(1);
    const changed = sent.markExpired(db, [queued[0].id]);
    expect(changed).toBe(1);
    expect(sent.listQueued(db)).toHaveLength(0);
  });

  it('markExpired is a no-op on already-sent rows', () => {
    db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', boats: [1] });
    sent.recordSent(
      db,
      { subscriberId: sid, kind: 'hot_day', triggerKey: 'k1', triggerDate: '2026-04-27' },
      'm1'
    );
    const sentRow = db
      .prepare(`SELECT id FROM alerts_sent WHERE trigger_key = 'k1'`)
      .get() as { id: number };
    const changed = sent.markExpired(db, [sentRow.id]);
    expect(changed).toBe(0);
  });

  it('markExpired with empty array returns 0 (no SQL run)', () => {
    db = freshDb();
    expect(sent.markExpired(db, [])).toBe(0);
  });

  it('markSent promotes a queued row to sent', () => {
    db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', boats: [1] });
    sent.recordQueued(db, {
      subscriberId: sid,
      kind: 'hot_day',
      triggerKey: 'k1',
      triggerDate: '2026-04-27'
    });
    const queued = sent.listQueued(db);
    sent.markSent(db, queued[0].id, 'msg-promoted');
    expect(sent.listQueued(db)).toHaveLength(0);
    const row = db
      .prepare(`SELECT status, resend_message_id FROM alerts_sent WHERE id = ?`)
      .get(queued[0].id) as { status: string; resend_message_id: string };
    expect(row.status).toBe('sent');
    expect(row.resend_message_id).toBe('msg-promoted');
  });
});
