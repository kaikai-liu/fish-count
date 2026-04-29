// tests/unit/db/subscribers.test.ts
// Unit tests for src/lib/db/subscribers.ts DAL repository (Phase 4 ALT-01/02).
// Verifies: pending → active state machine, email canonicalization, ON CONFLICT
// re-signup behavior, listActive paused_until filter, CASCADE delete semantics.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import * as subs from '../../../src/lib/db/subscribers';
import { seedSubscriber } from '../../helpers/seedTestDb';

function freshDb(): Database.Database {
  const db = openTestDb();
  // Seed boats so subscriber_boats FK resolves in tests.
  db.prepare(`INSERT INTO landings (id, source_name, display_name) VALUES (1, 'fl', 'Fishermans')`).run();
  db.prepare(
    `INSERT INTO boats (id, source_name, display_name, landing_id) VALUES (1, 'b1', 'Boat One', 1), (2, 'b2', 'Boat Two', 1)`
  ).run();
  return db;
}

describe('subscribers DAL', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('createPending inserts pending row with canonicalized email', () => {
    db = freshDb();
    const id = subs.createPending(db, {
      email: '  Kaikai@GMAIL.com  ',
      boats: [1],
      species: ['bluefin'],
      ip: '1.2.3.4'
    });
    const row = subs.findById(db, id);
    expect(row?.email).toBe('kaikai@gmail.com');
    expect(row?.status).toBe('pending');
    expect(row?.signup_ip).toBe('1.2.3.4');
  });

  it('createPending re-signup updates created_at and replaces follow lists, preserves id', () => {
    db = freshDb();
    const id1 = subs.createPending(db, {
      email: 'a@b.com',
      boats: [1],
      species: [],
      ip: '1.1.1.1'
    });
    const id2 = subs.createPending(db, {
      email: 'a@b.com',
      boats: [2],
      species: ['yellowtail'],
      ip: '2.2.2.2'
    });
    expect(id2).toBe(id1);
    const summary = subs.getSummary(db, id1)!;
    expect(summary.boats.map((b) => b.id)).toEqual([2]);
    expect(summary.species).toEqual(['yellowtail']);
  });

  it('createPending re-signup of activated subscriber demotes back to pending and clears confirmed_at', () => {
    db = freshDb();
    const id = subs.createPending(db, {
      email: 'a@b.com',
      boats: [1],
      species: [],
      ip: '1.1.1.1'
    });
    subs.activate(db, id);
    expect(subs.findById(db, id)!.status).toBe('active');
    subs.createPending(db, { email: 'a@b.com', boats: [2], species: [], ip: '3.3.3.3' });
    const row = subs.findById(db, id)!;
    expect(row.status).toBe('pending');
    expect(row.confirmed_at).toBeNull();
  });

  it('activate flips status to active and sets confirmed_at', () => {
    db = freshDb();
    const id = subs.createPending(db, {
      email: 'a@b.com',
      boats: [1],
      species: [],
      ip: '1.1.1.1'
    });
    subs.activate(db, id);
    const row = subs.findById(db, id)!;
    expect(row.status).toBe('active');
    expect(row.confirmed_at).not.toBeNull();
  });

  it('activate is a no-op when row is already active', () => {
    db = freshDb();
    const id = subs.createPending(db, {
      email: 'a@b.com',
      boats: [1],
      species: [],
      ip: '1.1.1.1'
    });
    subs.activate(db, id);
    const firstConfirmedAt = subs.findById(db, id)!.confirmed_at;
    subs.activate(db, id);
    const secondConfirmedAt = subs.findById(db, id)!.confirmed_at;
    expect(secondConfirmedAt).toBe(firstConfirmedAt);
  });

  it('findActive returns null for pending and row for active (canonicalizes input)', () => {
    db = freshDb();
    const id = subs.createPending(db, {
      email: 'a@b.com',
      boats: [1],
      species: [],
      ip: '1.1.1.1'
    });
    expect(subs.findActive(db, 'a@b.com')).toBeNull();
    subs.activate(db, id);
    expect(subs.findActive(db, 'A@B.COM')).not.toBeNull();
  });

  it('findRecentPending applies TTL window', () => {
    db = freshDb();
    const id = subs.createPending(db, {
      email: 'a@b.com',
      boats: [1],
      species: [],
      ip: '1.1.1.1'
    });
    // Backdate created_at to 25h ago.
    db.prepare(`UPDATE subscribers SET created_at = datetime('now', '-25 hours') WHERE id = ?`).run(id);
    expect(subs.findRecentPending(db, 'a@b.com', 24 * 3600)).toBeNull();
    expect(subs.findRecentPending(db, 'a@b.com', 26 * 3600)).not.toBeNull();
  });

  it('findRecentPending returns null when row is active', () => {
    db = freshDb();
    const id = subs.createPending(db, {
      email: 'a@b.com',
      boats: [1],
      species: [],
      ip: '1.1.1.1'
    });
    subs.activate(db, id);
    expect(subs.findRecentPending(db, 'a@b.com', 24 * 3600)).toBeNull();
  });

  it('listActive includes paused_until=null and excludes paused-future rows', () => {
    db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    const pid = seedSubscriber(db, { email: 'p@b.com', status: 'active', boats: [2] });
    db.prepare(`UPDATE subscribers SET paused_until = date('now', '+30 days') WHERE id = ?`).run(pid);
    const active = subs.listActive(db);
    expect(active.map((s) => s.id)).toEqual([sid]);
    expect(active[0].boats).toEqual([1]);
  });

  it('listActive excludes pending subscribers', () => {
    db = freshDb();
    seedSubscriber(db, { email: 'pending@b.com', status: 'pending', boats: [1] });
    const activeId = seedSubscriber(db, { email: 'active@b.com', status: 'active', boats: [2] });
    const active = subs.listActive(db);
    expect(active.map((s) => s.id)).toEqual([activeId]);
  });

  it('listActive includes paused-past rows (pause expired)', () => {
    db = freshDb();
    const id = seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    db.prepare(`UPDATE subscribers SET paused_until = date('now', '-1 day') WHERE id = ?`).run(id);
    const active = subs.listActive(db);
    expect(active.map((s) => s.id)).toContain(id);
  });

  it('deleteForUnsubscribe cascades follow rows', () => {
    db = freshDb();
    const id = seedSubscriber(db, {
      email: 'a@b.com',
      status: 'active',
      boats: [1, 2],
      species: ['bluefin']
    });
    subs.deleteForUnsubscribe(db, id);
    const fb = db.prepare(`SELECT COUNT(*) AS c FROM subscriber_boats WHERE subscriber_id = ?`).get(id) as { c: number };
    const fs = db.prepare(`SELECT COUNT(*) AS c FROM subscriber_species WHERE subscriber_id = ?`).get(id) as { c: number };
    expect(fb.c).toBe(0);
    expect(fs.c).toBe(0);
    expect(subs.findById(db, id)).toBeNull();
  });

  it('getSummary returns null for unknown id', () => {
    db = freshDb();
    expect(subs.getSummary(db, 9999)).toBeNull();
  });

  it('getSummary joins boat display_name', () => {
    db = freshDb();
    const id = seedSubscriber(db, {
      email: 'a@b.com',
      status: 'active',
      boats: [1, 2],
      species: ['bluefin', 'yellowtail']
    });
    const summary = subs.getSummary(db, id)!;
    expect(summary.email).toBe('a@b.com');
    expect(summary.boats).toEqual([
      { id: 1, display_name: 'Boat One' },
      { id: 2, display_name: 'Boat Two' }
    ]);
    expect(summary.species).toEqual(['bluefin', 'yellowtail']);
  });

  it('updatePreferences replaces follow lists and toggles paused_until', () => {
    db = freshDb();
    const id = seedSubscriber(db, {
      email: 'a@b.com',
      status: 'active',
      boats: [1],
      species: ['bluefin']
    });
    subs.updatePreferences(db, id, {
      boats: [2],
      species: ['yellowtail', 'dorado'],
      pausedUntil: '2026-12-31'
    });
    const summary = subs.getSummary(db, id)!;
    expect(summary.boats.map((b) => b.id)).toEqual([2]);
    expect(summary.species.sort()).toEqual(['dorado', 'yellowtail']);
    expect(subs.findById(db, id)!.paused_until).toBe('2026-12-31');
  });

  it('updatePreferences with pausedUntil:null clears the pause', () => {
    db = freshDb();
    const id = seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    subs.updatePreferences(db, id, { boats: [1], species: [], pausedUntil: '2026-12-31' });
    expect(subs.findById(db, id)!.paused_until).toBe('2026-12-31');
    subs.updatePreferences(db, id, { boats: [1], species: [], pausedUntil: null });
    expect(subs.findById(db, id)!.paused_until).toBeNull();
  });

  it('updatePreferences with pausedUntil undefined leaves existing value alone', () => {
    db = freshDb();
    const id = seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    subs.updatePreferences(db, id, { boats: [1], species: [], pausedUntil: '2026-12-31' });
    subs.updatePreferences(db, id, { boats: [2], species: [] });
    expect(subs.findById(db, id)!.paused_until).toBe('2026-12-31');
  });
});
