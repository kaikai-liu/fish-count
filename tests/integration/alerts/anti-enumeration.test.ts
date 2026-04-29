// tests/integration/alerts/anti-enumeration.test.ts
// Phase 4 Plan 04-04 Task 3: T-04-A1 anti-enumeration parity check.
//
// Asserts that the three silent-success branches of /alerts (honeypot,
// suppression, already-pending) AND the happy path all return the same
// HTTP shape: 303 redirect to /alerts/pending?m={masked} with an identical
// path prefix and a masked-email pattern. A bot probing for valid emails
// cannot tell them apart by status code, redirect target, or response body.
//
// Send-mock counter additionally proves the load-bearing invariant: only the
// happy path actually transmits an email through Resend.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_k?: string) {}
  }
}));

vi.mock('$lib/db/client', async () => {
  const Database = (await import('better-sqlite3')).default;
  const { runMigrations } = await import('../../../src/lib/db/migrations');
  let _db: import('better-sqlite3').Database | null = null;
  return {
    getDb: () => {
      if (_db) return _db;
      _db = new Database(':memory:');
      _db.pragma('foreign_keys = ON');
      runMigrations(_db);
      _db
        .prepare(`INSERT INTO landings (id, source_name, display_name) VALUES (1, 'fl', 'F')`)
        .run();
      _db
        .prepare(
          `INSERT INTO boats (id, source_name, display_name, landing_id) VALUES (1, 'b', 'Boat 1', 1)`
        )
        .run();
      return _db;
    },
    closeDb: () => {
      if (_db) {
        _db.close();
        _db = null;
      }
    },
    openDb: () => {
      throw new Error('openDb is not mocked in integration tests');
    },
    __reset: () => {
      if (_db) {
        _db.close();
        _db = null;
      }
    }
  };
});

import { actions } from '../../../src/routes/alerts/+page.server';
import { seedSuppressed, seedSubscriber } from '../../helpers/seedTestDb';

function fdReq(body: Record<string, string | string[]>, ip = '9.9.9.9'): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) {
    if (Array.isArray(v)) for (const x of v) fd.append(k, x);
    else fd.append(k, v);
  }
  return new Request('http://localhost/alerts', {
    method: 'POST',
    body: fd,
    headers: { 'fly-client-ip': ip }
  });
}

const harness = (req: Request, ip = '9.9.9.9') =>
  ({
    request: req,
    getClientAddress: () => ip,
    url: new URL('http://localhost/alerts'),
    params: {},
    locals: {},
    cookies: {
      get: () => undefined,
      set: () => {},
      delete: () => {},
      serialize: () => '',
      getAll: () => []
    }
  }) as never;

describe('T-04-A1 anti-enumeration: identical generic-success response on 3 silent-success branches', () => {
  beforeEach(async () => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'm' }, error: null });
    process.env.PROJECT_SECRET = 'integration-test-secret-must-be-32-chars-min';
    process.env.POSTAL_ADDRESS = 'PO Box 1';
    process.env.RESEND_API_KEY = 'rk';
    process.env.SUBSCRIBER_FROM_EMAIL = 'alerts@fishcount.app';
    process.env.PUBLIC_BASE_URL = 'https://fishcount.app';
    const mod = (await import('$lib/db/client')) as unknown as { __reset?: () => void };
    mod.__reset?.();
  });
  afterEach(() => {
    for (const k of [
      'PROJECT_SECRET',
      'POSTAL_ADDRESS',
      'RESEND_API_KEY',
      'SUBSCRIBER_FROM_EMAIL',
      'PUBLIC_BASE_URL'
    ]) {
      delete process.env[k];
    }
  });

  async function captureRedirect(
    req: Request
  ): Promise<{ status: number; location: string }> {
    try {
      await actions.default!(harness(req));
      throw new Error('expected redirect');
    } catch (e: unknown) {
      const err = e as { status?: number; location?: string };
      if (err?.status && err?.location) return { status: err.status, location: err.location };
      throw e;
    }
  }

  it('honeypot, suppression, already-pending, happy-path all 303 to identical /alerts/pending shape', async () => {
    // (a) Honeypot triggered for a fresh email — silent success expected.
    const r1 = await captureRedirect(
      fdReq({ email: 'honey@b.com', boats: ['1'], website: 'spam' })
    );
    expect(r1.status).toBe(303);
    expect(r1.location).toMatch(/^\/alerts\/pending\?m=h[^@]*\*\*\*%40b\*\*\*\.com$/);
    expect(sendMock).not.toHaveBeenCalled();

    // (b) Suppressed email — silent success expected.
    const mod = (await import('$lib/db/client')) as { getDb: () => import('better-sqlite3').Database };
    const db = mod.getDb();
    seedSuppressed(db, 'supp@b.com');
    const r2 = await captureRedirect(
      fdReq({ email: 'supp@b.com', boats: ['1'], website: '' })
    );
    expect(r2.status).toBe(303);
    expect(r2.location).toMatch(/^\/alerts\/pending\?m=s[^@]*\*\*\*%40b\*\*\*\.com$/);
    expect(sendMock).not.toHaveBeenCalled();

    // (c) Already-pending — silent success expected, NO second confirm send.
    seedSubscriber(db, { email: 'pend@b.com', status: 'pending', boats: [1] });
    const r3 = await captureRedirect(
      fdReq({ email: 'pend@b.com', boats: ['1'], website: '' })
    );
    expect(r3.status).toBe(303);
    expect(r3.location).toMatch(/^\/alerts\/pending\?m=p[^@]*\*\*\*%40b\*\*\*\.com$/);
    expect(sendMock).not.toHaveBeenCalled();

    // (d) Happy path — same redirect shape, but Resend IS called exactly once.
    const r4 = await captureRedirect(
      fdReq({ email: 'fresh@b.com', boats: ['1'], website: '' })
    );
    expect(r4.status).toBe(303);
    expect(r4.location).toMatch(/^\/alerts\/pending\?m=f[^@]*\*\*\*%40b\*\*\*\.com$/);
    expect(sendMock).toHaveBeenCalledTimes(1);

    // All four redirects share the same path prefix (/alerts/pending) — the
    // entire load-bearing claim of T-04-A1 anti-enumeration.
    const prefixes = [r1, r2, r3, r4].map((r) => r.location.split('?')[0]);
    expect(new Set(prefixes).size).toBe(1);
  });
});
