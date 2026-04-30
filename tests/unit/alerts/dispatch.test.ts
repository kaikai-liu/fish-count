// tests/unit/alerts/dispatch.test.ts
// Phase 4 ALT-09/10/11/12 dispatch orchestrator unit tests.
//
// Covers six end-to-end scenarios through dispatchAlerts():
//   1. Happy path: one fresh hot-day candidate sends + writes status='sent'.
//   2. ALT-11 dedup: re-running on the same day produces ZERO additional sends.
//   3. ALT-12 warmup queue-not-drop: when cap is consumed, candidate is queued.
//   4. Non-fatal contract: Resend throw -> error logged, no row written, resolve.
//   5. B1 drainQueued: pre-seeded queued row sends + status flips queued -> sent.
//   6. B1 TTL sweep: queued row >24h old -> markExpired, never sent.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/lib/db/migrations';
import { seedSubscriber } from '../../helpers/seedTestDb';

const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
    constructor(_k?: string) {}
  }
}));

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  db.prepare(`INSERT INTO landings (id, source_name, display_name) VALUES (1, 'fl', 'F')`).run();
  db.prepare(
    `INSERT INTO boats (id, source_name, display_name, landing_id) VALUES (1, 'pd', 'Pacific Dawn', 1)`
  ).run();
  return db;
}

function seedRow(
  db: Database.Database,
  args: { date: string; boatId: number; tripType: string; species: string; speciesCount: number; anglers: number }
) {
  db.prepare(
    `INSERT OR REPLACE INTO catch_reports (source_date, boat_id, landing_id, trip_type, species, species_count, angler_count, scraped_at)
     VALUES (?, ?, 1, ?, ?, ?, ?, datetime('now'))`
  ).run(args.date, args.boatId, args.tripType, args.species, args.speciesCount, args.anglers);
}

function dateOffset(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const TODAY = '2026-04-27';

describe('dispatchAlerts', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'mock-msg-1' }, error: null });
    process.env.PROJECT_SECRET = 'integration-test-secret-must-be-32-chars-min';
    process.env.POSTAL_ADDRESS = 'PO Box 1, San Diego CA 92101';
    process.env.RESEND_API_KEY = 'rk_test';
    process.env.SUBSCRIBER_FROM_EMAIL = 'alerts@fishcount.app';
    process.env.PUBLIC_BASE_URL = 'https://fishcount.app';
    delete process.env.WARMUP_START_DATE;
    delete process.env.HOT_DAY_MIN_ANGLERS;
  });
  afterEach(() => {
    for (const k of [
      'PROJECT_SECRET',
      'POSTAL_ADDRESS',
      'RESEND_API_KEY',
      'SUBSCRIBER_FROM_EMAIL',
      'PUBLIC_BASE_URL',
      'WARMUP_START_DATE',
      'HOT_DAY_MIN_ANGLERS'
    ])
      delete process.env[k];
  });

  it('sends one hot-day alert and writes one alerts_sent row with status=sent', async () => {
    const { dispatchAlerts } = await import('../../../src/lib/alerts/dispatch');
    const db = freshDb();
    seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    for (let i = 1; i <= 7; i++)
      seedRow(db, {
        date: dateOffset(TODAY, -i),
        boatId: 1,
        tripType: '1/2 Day AM',
        species: 'yellowtail',
        speciesCount: 6,
        anglers: 12
      });
    seedRow(db, {
      date: TODAY,
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      speciesCount: 24,
      anglers: 12
    });
    await dispatchAlerts(TODAY, db);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const subjectArg = sendMock.mock.calls[0][0].subject;
    expect(subjectArg).toBe('Hot day: Pacific Dawn');
    const sentRows = db
      .prepare(`SELECT subscriber_id, kind, trigger_key, trigger_date, status FROM alerts_sent`)
      .all() as Array<{ status: string; kind: string; trigger_key: string }>;
    expect(sentRows).toHaveLength(1);
    expect(sentRows[0].status).toBe('sent');
    expect(sentRows[0].kind).toBe('hot_day');
    expect(sentRows[0].trigger_key).toBe('boat:1:1/2 Day AM');
  });

  it('ALT-11: re-running dispatch on the same day produces ZERO additional sends (dedup)', async () => {
    const { dispatchAlerts } = await import('../../../src/lib/alerts/dispatch');
    const db = freshDb();
    seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    for (let i = 1; i <= 7; i++)
      seedRow(db, {
        date: dateOffset(TODAY, -i),
        boatId: 1,
        tripType: '1/2 Day AM',
        species: 'yellowtail',
        speciesCount: 6,
        anglers: 12
      });
    seedRow(db, {
      date: TODAY,
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      speciesCount: 24,
      anglers: 12
    });
    await dispatchAlerts(TODAY, db);
    expect(sendMock).toHaveBeenCalledTimes(1);
    await dispatchAlerts(TODAY, db);
    // still 1 — dedup blocked the second send.
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('ALT-12: when warmup cap=0, candidate is QUEUED not sent (Pitfall 7 — never silently drop)', async () => {
    const { dispatchAlerts } = await import('../../../src/lib/alerts/dispatch');
    const db = freshDb();
    seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    for (let i = 1; i <= 7; i++)
      seedRow(db, {
        date: dateOffset(TODAY, -i),
        boatId: 1,
        tripType: '1/2 Day AM',
        species: 'yellowtail',
        speciesCount: 6,
        anglers: 12
      });
    seedRow(db, {
      date: TODAY,
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      speciesCount: 24,
      anglers: 12
    });
    // Force cap=50 (week 1) by anchoring warmup to today; pre-fill 50 'sent' rows so cap is consumed.
    process.env.WARMUP_START_DATE = TODAY;
    const dummySid = seedSubscriber(db, { email: 'dummy@b.com', status: 'active', boats: [1] });
    const ins = db.prepare(
      `INSERT INTO alerts_sent (subscriber_id, kind, trigger_key, trigger_date, status, sent_at, resend_message_id) VALUES (?, 'hot_day', ?, ?, 'sent', ?, 'm')`
    );
    // Spread 50 sends across the first 50 minutes of today (hours 00..23 only —
    // invalid hours like T49:00:00.000Z get NULL'd by SQLite's datetime() and
    // would silently drop out of the warm-up cap denominator.
    for (let i = 0; i < 50; i++) {
      const hh = String(Math.floor(i / 60)).padStart(2, '0');
      const mm = String(i % 60).padStart(2, '0');
      ins.run(dummySid, `dummy:${i}`, TODAY, `${TODAY}T${hh}:${mm}:00.000Z`);
    }
    await dispatchAlerts(TODAY, db);
    expect(sendMock).not.toHaveBeenCalled();
    const queuedRow = db
      .prepare(
        `SELECT status FROM alerts_sent WHERE kind='hot_day' AND trigger_key='boat:1:1/2 Day AM' AND trigger_date=?`
      )
      .get(TODAY) as { status: string };
    expect(queuedRow.status).toBe('queued');
  });

  it('non-fatal: Resend throw -> error logged, no alerts_sent row written, dispatchAlerts resolves', async () => {
    sendMock.mockRejectedValueOnce(new Error('Resend 503'));
    const { dispatchAlerts } = await import('../../../src/lib/alerts/dispatch');
    const db = freshDb();
    seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    for (let i = 1; i <= 7; i++)
      seedRow(db, {
        date: dateOffset(TODAY, -i),
        boatId: 1,
        tripType: '1/2 Day AM',
        species: 'yellowtail',
        speciesCount: 6,
        anglers: 12
      });
    seedRow(db, {
      date: TODAY,
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      speciesCount: 24,
      anglers: 12
    });
    await expect(dispatchAlerts(TODAY, db)).resolves.toBeUndefined();
    const sentRows = db.prepare(`SELECT * FROM alerts_sent`).all();
    expect(sentRows).toHaveLength(0);
  });

  it('B1 fix: drainQueued sends queued rows BEFORE evaluators (status: queued -> sent)', async () => {
    const { dispatchAlerts } = await import('../../../src/lib/alerts/dispatch');
    const db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    // Pre-seed an existing queued row from a prior tick (simulates yesterday over-cap event).
    const yesterday = dateOffset(TODAY, -1);
    db.prepare(
      `INSERT INTO alerts_sent (subscriber_id, kind, trigger_key, trigger_date, status, queued_at)
       VALUES (?, 'hot_day', 'boat:1:1/2 Day AM', ?, 'queued', datetime('now'))`
    ).run(sid, yesterday);
    // No fresh hot-day candidates today (no catch_reports seeded for TODAY).
    await dispatchAlerts(TODAY, db);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const drained = db
      .prepare(`SELECT status FROM alerts_sent WHERE trigger_date = ?`)
      .get(yesterday) as { status: string };
    expect(drained.status).toBe('sent');
    const queuedAfter = (
      db.prepare(`SELECT COUNT(*) AS c FROM alerts_sent WHERE status='queued'`).get() as { c: number }
    ).c;
    expect(queuedAfter).toBe(0);
  });

  it('B1 fix: queued rows older than 24h are markExpired and NOT sent', async () => {
    const { dispatchAlerts } = await import('../../../src/lib/alerts/dispatch');
    const db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    // Pre-seed a queued row from 30h ago (past 24h TTL).
    db.prepare(
      `INSERT INTO alerts_sent (subscriber_id, kind, trigger_key, trigger_date, status, queued_at)
       VALUES (?, 'hot_day', 'boat:1:1/2 Day AM', '2026-04-25', 'queued', datetime('now', '-30 hours'))`
    ).run(sid);
    await dispatchAlerts(TODAY, db);
    expect(sendMock).not.toHaveBeenCalled();
    const expired = db
      .prepare(`SELECT status FROM alerts_sent WHERE trigger_date = '2026-04-25'`)
      .get() as { status: string };
    expect(expired.status).toBe('expired');
  });
});
