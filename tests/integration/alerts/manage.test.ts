// tests/integration/alerts/manage.test.ts
// Phase 4 Plan 04-05 Task 3: integration tests for /alerts/manage load + actions.
//
// Threat coverage: T-04-MANAGE-AUTHZ (every action re-verifies token).
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
        `INSERT INTO boats (id, source_name, display_name, landing_id) VALUES (1,'b1','B1',1),(2,'b2','B2',1)`
      ).run();
      _db.prepare(
        `INSERT INTO catch_reports (source_date, boat_id, landing_id, trip_type, species, angler_count, species_count, scraped_at)
         VALUES ('2026-04-01',1,1,'1/2 Day AM','bluefin',10,5,'2026-04-01T22:00:00Z'),
                ('2026-04-02',2,1,'Full Day','yellowtail',20,15,'2026-04-02T22:00:00Z')`
      ).run();
      return _db;
    },
    __reset: () => {
      _db = null;
    }
  };
});

import { load, actions } from '../../../src/routes/alerts/manage/+page.server';
import { signToken } from '$lib/alerts/tokens';
import { seedSubscriber } from '../../helpers/seedTestDb';

function harness(url: URL, body?: Record<string, string | string[]>) {
  const fd = new FormData();
  if (body) {
    for (const [k, v] of Object.entries(body)) {
      if (Array.isArray(v)) for (const x of v) fd.append(k, x);
      else fd.append(k, v);
    }
  }
  return {
    url,
    setHeaders: () => {},
    request: new Request(url, {
      method: body ? 'POST' : 'GET',
      body: body ? fd : undefined
    }),
    params: {},
    locals: {},
    cookies: {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('/alerts/manage', () => {
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

  it('load returns summary on valid manage token', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('$lib/db/client');
    const db = mod.getDb();
    const sid = seedSubscriber(db, {
      email: 'a@b.com',
      status: 'active',
      boats: [1],
      species: ['bluefin']
    });
    const tok = signToken('manage', sid, 30 * 24 * 3600);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await load(
      harness(new URL(`https://fishcount.app/alerts/manage?token=${encodeURIComponent(tok)}`))
    );
    expect(result.invalid).toBeFalsy();
    expect(result.summary.email).toBe('a@b.com');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(result.summary.boats.map((b: any) => b.id)).toEqual([1]);
    expect(result.summary.species).toEqual(['bluefin']);
    // unsubscribeUrl must include the issued unsubscribe token
    expect(result.unsubscribeUrl).toContain('/alerts/unsubscribe?token=');
  });

  it('load with invalid token returns invalid', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await load(
      harness(new URL('https://fishcount.app/alerts/manage?token=bogus'))
    );
    expect(result).toEqual({ invalid: true });
  });

  it('load without token returns invalid', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await load(harness(new URL('https://fishcount.app/alerts/manage')));
    expect(result).toEqual({ invalid: true });
  });

  it('actions.default updates preferences and returns ok', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('$lib/db/client');
    const db = mod.getDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    const tok = signToken('manage', sid, 30 * 24 * 3600);
    const url = new URL(
      `https://fishcount.app/alerts/manage?token=${encodeURIComponent(tok)}`
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await actions.default(
      harness(url, { boats: ['1', '2'], species: ['yellowtail'], pause: 'off' })
    );
    expect(result.ok).toBe(true);
    expect(result.message).toBe('Preferences updated.');
    // Verify via fresh load
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loaded: any = await load(harness(url));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(loaded.summary.boats.map((b: any) => b.id).sort()).toEqual([1, 2]);
    expect(loaded.summary.species).toEqual(['yellowtail']);
  });

  it('actions.default with invalid token returns 401 invalid (T-04-MANAGE-AUTHZ)', async () => {
    const url = new URL('https://fishcount.app/alerts/manage?token=bogus');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await actions.default(
      harness(url, { boats: [], species: [], pause: 'off' })
    );
    expect(result.status).toBe(401);
  });

  it('actions.removeBoat removes a single boat (preserves others) and 303s', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('$lib/db/client');
    const db = mod.getDb();
    const sid = seedSubscriber(db, {
      email: 'rm@b.com',
      status: 'active',
      boats: [1, 2],
      species: ['bluefin']
    });
    const tok = signToken('manage', sid, 30 * 24 * 3600);
    const url = new URL(
      `https://fishcount.app/alerts/manage?token=${encodeURIComponent(tok)}`
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let captured: any;
    try {
      await actions.removeBoat(harness(url, { boatId: '1' }));
    } catch (e) {
      captured = e;
    }
    expect(captured.status).toBe(303);
    // Verify boat 1 gone, boat 2 + bluefin survive
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loaded: any = await load(harness(url));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(loaded.summary.boats.map((b: any) => b.id)).toEqual([2]);
    expect(loaded.summary.species).toEqual(['bluefin']);
  });

  it('actions.removeSpecies removes the matching species and 303s', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('$lib/db/client');
    const db = mod.getDb();
    const sid = seedSubscriber(db, {
      email: 'rs@b.com',
      status: 'active',
      boats: [1],
      species: ['bluefin', 'yellowtail']
    });
    const tok = signToken('manage', sid, 30 * 24 * 3600);
    const url = new URL(
      `https://fishcount.app/alerts/manage?token=${encodeURIComponent(tok)}`
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let captured: any;
    try {
      await actions.removeSpecies(harness(url, { kind: 'species', label: 'bluefin' }));
    } catch (e) {
      captured = e;
    }
    expect(captured.status).toBe(303);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loaded: any = await load(harness(url));
    expect(loaded.summary.species).toEqual(['yellowtail']);
  });
});
