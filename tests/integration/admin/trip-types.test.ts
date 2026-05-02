// tests/integration/admin/trip-types.test.ts
// Phase 8 ALI-03 / ALI-04 — admin trip-type aliases route integration tests.
//
// Exercises both /admin/trip-types/login and /admin/trip-types loaders +
// actions directly via dynamic import, using a vi.mock'd $lib/db/client to
// route SQL through an in-memory DB.
//
// Behaviors covered:
//   T1: GET /admin/trip-types with no cookie → 303 redirect to login.
//   T2: GET /admin/trip-types with valid signed cookie → labels list.
//   T3: POST /admin/trip-types/login with WRONG password → 401 + 'Invalid password'.
//   T4: POST /admin/trip-types/login with RIGHT password → 303 + sets fc_admin cookie.
//   T5: POST /?/alias  → upserts row with status='aliased'.
//   T6: POST /?/accept → upserts row with status='accepted'.
//   T7: POST /?/reset  → upserts row with status='pending', accepted_at=NULL.
//   T8: POST /?/logout → clears fc_admin cookie + redirects to login.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import { getAlias } from '../../../src/lib/db/aliases';

// ---------------------------------------------------------------------------
// Mock $lib/db/client to use an in-memory DB
// ---------------------------------------------------------------------------
let _testDb: Database.Database | null = null;

vi.mock('../../../src/lib/db/client', () => ({
  getDb: () => {
    if (!_testDb) throw new Error('Test DB not initialized');
    return _testDb;
  },
  openDb: () => {
    if (!_testDb) throw new Error('Test DB not initialized');
    return _testDb;
  },
  closeDb: () => {}
}));

vi.mock('../../../src/lib/server/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis()
  }
}));

// $app/environment is not mocked — fall through to default (dev=false in tests).
// SvelteKit fail()/redirect() throw a special-shaped object; tests catch via try/catch.

// ---------------------------------------------------------------------------
// Test cookies helper — minimal { get, set, delete } shim
// ---------------------------------------------------------------------------
type CookieStore = Map<string, string>;
function makeCookies(initial: Record<string, string> = {}) {
  const store: CookieStore = new Map(Object.entries(initial));
  const setCalls: Array<{ name: string; value: string; options?: unknown }> = [];
  const deleteCalls: Array<{ name: string; options?: unknown }> = [];
  return {
    get: (name: string) => store.get(name),
    set: (name: string, value: string, options?: unknown) => {
      store.set(name, value);
      setCalls.push({ name, value, options });
    },
    delete: (name: string, options?: unknown) => {
      store.delete(name);
      deleteCalls.push({ name, options });
    },
    _store: store,
    _setCalls: setCalls,
    _deleteCalls: deleteCalls
  };
}

function makeFormDataRequest(fields: Record<string, string>): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request('http://localhost/admin/trip-types', {
    method: 'POST',
    body: fd
  });
}

beforeEach(() => {
  process.env.ADMIN_PASSWORD = 'correct';
  process.env.ADMIN_COOKIE_SECRET = '0'.repeat(64);
  vi.resetModules();
});

afterEach(() => {
  if (_testDb) {
    _testDb.close();
    _testDb = null;
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/admin/trip-types — auth gate (T1, T2)', () => {
  it('T1: redirects to /admin/trip-types/login when no fc_admin cookie', async () => {
    _testDb = openTestDb();
    const mod = await import('../../../src/routes/admin/trip-types/+page.server.js');
    const cookies = makeCookies();
    let caught: { status: number; location: string } | null = null;
    try {
      await mod.load({ cookies, setHeaders: vi.fn() } as unknown as Parameters<typeof mod.load>[0]);
    } catch (err) {
      caught = err as { status: number; location: string };
    }
    expect(caught).not.toBeNull();
    expect(caught!.status).toBe(303);
    expect(caught!.location).toBe('/admin/trip-types/login');
  });

  it('T2: loads labels when fc_admin cookie is valid (signed by signAdminCookie)', async () => {
    _testDb = openTestDb();
    // Seed a couple of distinct catch_reports trip_type rows so listAllLabelsWithStatus has data.
    const { seedBoat, seedTrip } = await import('../../helpers/seedTestDb');
    const a = seedBoat(_testDb, { boatName: 'Premier', landingName: "Fisherman's Landing" });
    seedTrip(_testDb, { boatId: a.boatId, landingId: a.landingId, date: '2026-04-26', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 10 });

    const { signAdminCookie } = await import('../../../src/lib/auth/admin');
    const cookie = signAdminCookie();
    const cookies = makeCookies({ fc_admin: cookie });
    const setHeaders = vi.fn();

    const mod = await import('../../../src/routes/admin/trip-types/+page.server.js');
    const result = await mod.load({ cookies, setHeaders } as unknown as Parameters<typeof mod.load>[0]);
    expect(Array.isArray(result.labels)).toBe(true);
    expect(result.labels.length).toBeGreaterThanOrEqual(1);
    expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
  });
});

describe('/admin/trip-types/login — POST default action (T3, T4)', () => {
  it('T3: rejects login with wrong password (401 + Invalid password)', async () => {
    _testDb = openTestDb();
    const mod = await import('../../../src/routes/admin/trip-types/login/+page.server.js');
    const cookies = makeCookies();
    const result = await mod.actions.default({
      request: makeFormDataRequest({ password: 'WRONGGG' }),
      cookies
    } as unknown as Parameters<typeof mod.actions.default>[0]);
    // SvelteKit's fail() returns { status, data } — at runtime it's a special object
    // with the shape expected by the form-action machinery. We check the shape.
    expect(result).toBeDefined();
    expect((result as { status: number }).status).toBe(401);
    const data = (result as { data: { error: string } }).data;
    expect(data.error).toBe('Invalid password');
    expect(cookies._store.has('fc_admin')).toBe(false);
  });

  it('T4: accepts login with right password and sets fc_admin cookie + 303 redirect', async () => {
    _testDb = openTestDb();
    const mod = await import('../../../src/routes/admin/trip-types/login/+page.server.js');
    const cookies = makeCookies();
    let caught: { status: number; location: string } | null = null;
    try {
      await mod.actions.default({
        request: makeFormDataRequest({ password: 'correct' }),
        cookies
      } as unknown as Parameters<typeof mod.actions.default>[0]);
    } catch (err) {
      caught = err as { status: number; location: string };
    }
    expect(caught).not.toBeNull();
    expect(caught!.status).toBe(303);
    expect(caught!.location).toBe('/admin/trip-types');
    // fc_admin set
    expect(cookies._store.has('fc_admin')).toBe(true);
    const setCall = cookies._setCalls.find((c) => c.name === 'fc_admin');
    expect(setCall).toBeDefined();
    const opts = setCall!.options as { httpOnly: boolean; sameSite: string; maxAge: number; path: string };
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('strict');
    expect(opts.maxAge).toBe(86400);
    expect(opts.path).toBe('/admin');
  });
});

describe('/admin/trip-types — form actions (T5, T6, T7, T8)', () => {
  async function authedCookies() {
    const { signAdminCookie } = await import('../../../src/lib/auth/admin');
    return makeCookies({ fc_admin: signAdminCookie() });
  }

  it('T5: alias action upserts row with status=aliased', async () => {
    _testDb = openTestDb();
    const cookies = await authedCookies();
    const mod = await import('../../../src/routes/admin/trip-types/+page.server.js');
    const result = await mod.actions.alias({
      request: makeFormDataRequest({
        source_label: 'New Label',
        canonical_label: 'Full Day',
        notes: 'op note'
      }),
      cookies
    } as unknown as Parameters<typeof mod.actions.alias>[0]);
    expect((result as { success: boolean }).success).toBe(true);
    const row = getAlias(_testDb, 'New Label');
    expect(row).toBeDefined();
    expect(row!.status).toBe('aliased');
    expect(row!.canonical_label).toBe('Full Day');
    expect(row!.notes).toBe('op note');
  });

  it('T6: accept action upserts row with status=accepted (canonical = source)', async () => {
    _testDb = openTestDb();
    const cookies = await authedCookies();
    const mod = await import('../../../src/routes/admin/trip-types/+page.server.js');
    const result = await mod.actions.accept({
      request: makeFormDataRequest({ source_label: 'Lobster' }),
      cookies
    } as unknown as Parameters<typeof mod.actions.accept>[0]);
    expect((result as { success: boolean }).success).toBe(true);
    const row = getAlias(_testDb, 'Lobster');
    expect(row).toBeDefined();
    expect(row!.status).toBe('accepted');
    expect(row!.canonical_label).toBe('Lobster');
    expect(row!.accepted_at).not.toBeNull();
  });

  it('T7: reset action upserts row with status=pending, accepted_at=NULL', async () => {
    _testDb = openTestDb();
    const cookies = await authedCookies();
    const mod = await import('../../../src/routes/admin/trip-types/+page.server.js');
    // Seed an aliased row first.
    await mod.actions.alias({
      request: makeFormDataRequest({
        source_label: 'Resettable',
        canonical_label: 'Full Day'
      }),
      cookies
    } as unknown as Parameters<typeof mod.actions.alias>[0]);
    expect(getAlias(_testDb, 'Resettable')!.accepted_at).not.toBeNull();

    const result = await mod.actions.reset({
      request: makeFormDataRequest({ source_label: 'Resettable' }),
      cookies
    } as unknown as Parameters<typeof mod.actions.reset>[0]);
    expect((result as { success: boolean }).success).toBe(true);
    const row = getAlias(_testDb, 'Resettable');
    expect(row!.status).toBe('pending');
    expect(row!.accepted_at).toBeNull();
  });

  it('T8: logout action clears fc_admin cookie + 303 redirect to login', async () => {
    _testDb = openTestDb();
    const cookies = await authedCookies();
    expect(cookies._store.has('fc_admin')).toBe(true);
    const mod = await import('../../../src/routes/admin/trip-types/+page.server.js');
    let caught: { status: number; location: string } | null = null;
    try {
      await mod.actions.logout({
        request: makeFormDataRequest({}),
        cookies
      } as unknown as Parameters<typeof mod.actions.logout>[0]);
    } catch (err) {
      caught = err as { status: number; location: string };
    }
    expect(caught).not.toBeNull();
    expect(caught!.status).toBe(303);
    expect(caught!.location).toBe('/admin/trip-types/login');
    expect(cookies._store.has('fc_admin')).toBe(false);
    expect(cookies._deleteCalls[0].name).toBe('fc_admin');
  });

  it('T9: actions reject when cookie absent (defense in depth)', async () => {
    _testDb = openTestDb();
    const cookies = makeCookies(); // no fc_admin
    const mod = await import('../../../src/routes/admin/trip-types/+page.server.js');
    const result = await mod.actions.alias({
      request: makeFormDataRequest({ source_label: 'X', canonical_label: 'Y' }),
      cookies
    } as unknown as Parameters<typeof mod.actions.alias>[0]);
    expect((result as { status: number }).status).toBe(401);
    // Ensure no DB write happened
    expect(getAlias(_testDb, 'X')).toBeUndefined();
  });
});
