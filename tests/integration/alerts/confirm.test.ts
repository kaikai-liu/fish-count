// tests/integration/alerts/confirm.test.ts
// Phase 4 Plan 04-05 Task 3: integration tests for /alerts/confirm.
//
// Threat coverage: T-04-A3 (token replay/forgery via wrong-purpose), Pitfall 8
// (anti-enumeration on already-active + deleted-row paths).
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

import { load } from '../../../src/routes/alerts/confirm/+page.server';
import { signToken } from '$lib/alerts/tokens';
import { seedSubscriber } from '../../helpers/seedTestDb';
import * as subs from '$lib/db/subscribers';

function harness(url: URL) {
  return {
    url,
    setHeaders: () => {},
    params: {},
    request: new Request(url),
    locals: {},
    cookies: {}
    // SvelteKit's RequestEvent type is wide; tests pass a structural subset.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('/alerts/confirm load', () => {
  beforeEach(async () => {
    process.env.PROJECT_SECRET = 'integration-test-secret-must-be-32-chars-long';
    process.env.PUBLIC_BASE_URL = 'https://fishcount.app';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('$lib/db/client');
    mod.__reset?.();
  });
  afterEach(() => {
    delete process.env.PROJECT_SECRET;
    delete process.env.PUBLIC_BASE_URL;
  });

  it('valid token activates pending subscriber and 303s to /alerts/confirmed', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('$lib/db/client');
    const db = mod.getDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'pending', boats: [1] });
    const tok = signToken('confirm', sid, 86400);
    const url = new URL(
      `https://fishcount.app/alerts/confirm?token=${encodeURIComponent(tok)}`
    );
    await expect(load(harness(url))).rejects.toMatchObject({ status: 303 });
    expect(subs.findById(db, sid)?.status).toBe('active');
  });

  it('valid token but already-active subscriber 303s with already=1 (Pitfall 8)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('$lib/db/client');
    const db = mod.getDb();
    const sid = seedSubscriber(db, { email: 'b@b.com', status: 'active', boats: [1] });
    const tok = signToken('confirm', sid, 86400);
    const url = new URL(
      `https://fishcount.app/alerts/confirm?token=${encodeURIComponent(tok)}`
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let captured: any;
    try {
      await load(harness(url));
    } catch (e) {
      captured = e;
    }
    expect(captured.status).toBe(303);
    expect(captured.location).toContain('already=1');
  });

  it('wrong-purpose token (manage replayed as confirm) returns invalid (T-04-A3)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('$lib/db/client');
    const db = mod.getDb();
    const sid = seedSubscriber(db, { email: 'c@b.com', status: 'pending', boats: [1] });
    const tok = signToken('manage', sid, 86400); // wrong purpose
    const url = new URL(
      `https://fishcount.app/alerts/confirm?token=${encodeURIComponent(tok)}`
    );
    const result = await load(harness(url));
    expect(result).toEqual({ invalid: true });
  });

  it('missing token returns invalid', async () => {
    const url = new URL('https://fishcount.app/alerts/confirm');
    expect(await load(harness(url))).toEqual({ invalid: true });
  });

  it('deleted subscriber + valid token returns invalid (Pitfall 8 anti-enumeration)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('$lib/db/client');
    const db = mod.getDb();
    const sid = seedSubscriber(db, { email: 'd@b.com', status: 'pending', boats: [1] });
    const tok = signToken('confirm', sid, 86400);
    subs.deleteForUnsubscribe(db, sid);
    const url = new URL(
      `https://fishcount.app/alerts/confirm?token=${encodeURIComponent(tok)}`
    );
    expect(await load(harness(url))).toEqual({ invalid: true });
  });

  it('expired token returns invalid', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('$lib/db/client');
    const db = mod.getDb();
    const sid = seedSubscriber(db, { email: 'e@b.com', status: 'pending', boats: [1] });
    // Sign with negative TTL → already expired.
    const tok = signToken('confirm', sid, -1);
    const url = new URL(
      `https://fishcount.app/alerts/confirm?token=${encodeURIComponent(tok)}`
    );
    expect(await load(harness(url))).toEqual({ invalid: true });
  });
});
