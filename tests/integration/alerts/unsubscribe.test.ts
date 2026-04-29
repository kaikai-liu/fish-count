// tests/integration/alerts/unsubscribe.test.ts
// Phase 4 Plan 04-05 Task 3: integration tests for /alerts/unsubscribe.
//
// Threat coverage: T-04-RFC8058 (POST one-click parity with GET), T-04-CASCADE
// (FK CASCADE removes subscriber_boats + subscriber_species), T-04-A8
// (write-then-render order; suppression survives subscriber row deletion).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('$lib/db/client', async () => {
  const Database = (await import('better-sqlite3')).default;
  const { runMigrations } = await import('$lib/db/migrations');
  let _db: import('better-sqlite3').Database | null = null;
  return {
    getDb: () => {
      if (_db) return _db;
      _db = new Database(':memory:');
      _db.pragma('foreign_keys = ON');
      runMigrations(_db);
      _db.prepare(
        `INSERT INTO landings (id, source_name, display_name) VALUES (1,'fl','F')`
      ).run();
      _db.prepare(
        `INSERT INTO boats (id, source_name, display_name, landing_id) VALUES (1,'b','B',1)`
      ).run();
      return _db;
    },
    __reset: () => {
      _db = null;
    }
  };
});

import { load, actions } from '../../../src/routes/alerts/unsubscribe/+page.server';
import { signToken } from '$lib/alerts/tokens';
import { seedSubscriber } from '../../helpers/seedTestDb';
import * as suppression from '$lib/db/suppressionList';
import * as subs from '$lib/db/subscribers';

function harness(url: URL) {
  return {
    url,
    setHeaders: () => {},
    request: new Request(url),
    params: {},
    locals: {},
    cookies: {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('/alerts/unsubscribe', () => {
  beforeEach(async () => {
    process.env.PROJECT_SECRET = 'integration-test-secret-must-be-32-chars-long';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('$lib/db/client');
    mod.__reset?.();
  });
  afterEach(() => {
    delete process.env.PROJECT_SECRET;
  });

  it('GET writes suppression + deletes subscriber (one-click, no interstitial)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('$lib/db/client');
    const db = mod.getDb();
    const sid = seedSubscriber(db, { email: 'unsub@b.com', status: 'active', boats: [1] });
    const tok = signToken('unsubscribe', sid, null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await load(
      harness(
        new URL(`https://fishcount.app/alerts/unsubscribe?token=${encodeURIComponent(tok)}`)
      )
    );
    expect(result.invalid).toBe(false);
    expect(result.maskedEmail).toBe('u***@b***.com');
    expect(suppression.has(db, 'unsub@b.com')).toBe(true);
    expect(subs.findById(db, sid)).toBeNull();
  });

  it('POST one-click (RFC 8058 List-Unsubscribe-Post) writes suppression + deletes subscriber', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('$lib/db/client');
    const db = mod.getDb();
    const sid = seedSubscriber(db, { email: 'unsub2@b.com', status: 'active', boats: [1] });
    const tok = signToken('unsubscribe', sid, null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await actions.default(
      harness(
        new URL(`https://fishcount.app/alerts/unsubscribe?token=${encodeURIComponent(tok)}`)
      )
    );
    expect(result.ok).toBe(true);
    expect(result.invalid).toBe(false);
    expect(suppression.has(db, 'unsub2@b.com')).toBe(true);
    expect(subs.findById(db, sid)).toBeNull();
  });

  it('CASCADE: subscriber_boats and subscriber_species rows removed on unsubscribe (T-04-CASCADE)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('$lib/db/client');
    const db = mod.getDb();
    const sid = seedSubscriber(db, {
      email: 'cascade@b.com',
      status: 'active',
      boats: [1],
      species: ['bluefin']
    });
    const tok = signToken('unsubscribe', sid, null);
    await load(
      harness(
        new URL(`https://fishcount.app/alerts/unsubscribe?token=${encodeURIComponent(tok)}`)
      )
    );
    const remainingFollows = db
      .prepare(`SELECT COUNT(*) AS c FROM subscriber_boats WHERE subscriber_id=?`)
      .get(sid) as { c: number };
    const remainingSpecies = db
      .prepare(`SELECT COUNT(*) AS c FROM subscriber_species WHERE subscriber_id=?`)
      .get(sid) as { c: number };
    expect(remainingFollows.c).toBe(0);
    expect(remainingSpecies.c).toBe(0);
  });

  it('invalid token returns invalid', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await load(
      harness(new URL('https://fishcount.app/alerts/unsubscribe?token=bogus'))
    );
    expect(result).toEqual({ invalid: true, maskedEmail: null });
  });

  it('missing token returns invalid', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await load(
      harness(new URL('https://fishcount.app/alerts/unsubscribe'))
    );
    expect(result).toEqual({ invalid: true, maskedEmail: null });
  });

  it('already-deleted subscriber + valid token returns success-shaped (anti-enumeration)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('$lib/db/client');
    const db = mod.getDb();
    const sid = seedSubscriber(db, { email: 'gone@b.com', status: 'active', boats: [1] });
    const tok = signToken('unsubscribe', sid, null);
    subs.deleteForUnsubscribe(db, sid);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await load(
      harness(
        new URL(`https://fishcount.app/alerts/unsubscribe?token=${encodeURIComponent(tok)}`)
      )
    );
    expect(result.invalid).toBe(false);
    expect(result.maskedEmail).toBeNull();
  });

  it('suppression survives subscriber row deletion (T-04-A8)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('$lib/db/client');
    const db = mod.getDb();
    const sid = seedSubscriber(db, {
      email: 'survive@b.com',
      status: 'active',
      boats: [1]
    });
    const tok = signToken('unsubscribe', sid, null);
    await load(
      harness(
        new URL(`https://fishcount.app/alerts/unsubscribe?token=${encodeURIComponent(tok)}`)
      )
    );
    // Subscriber row gone.
    expect(subs.findById(db, sid)).toBeNull();
    // Suppression row endures.
    expect(suppression.has(db, 'survive@b.com')).toBe(true);
  });
});
