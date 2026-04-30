// tests/integration/alerts/dispatch.test.ts
// Phase 4 ALT-09 + ALT-11 end-to-end through dispatchAlerts:
//   seed -> dispatch -> Resend send + alerts_sent row -> second tick is dedupe-no-op.
//
// Asserts the full UI-SPEC subject + RFC 8058 List-Unsubscribe headers
// produced by sendUserEmail (Plan 03) flow through dispatch unchanged.
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

describe('Phase 4 dispatch e2e (ALT-09 + ALT-11 idempotency)', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'mock-msg-e2e' }, error: null });
    process.env.PROJECT_SECRET = 'integration-test-secret-must-be-32-chars-min';
    process.env.POSTAL_ADDRESS = 'PO Box 1, San Diego CA 92101';
    process.env.RESEND_API_KEY = 'rk_test';
    process.env.SUBSCRIBER_FROM_EMAIL = 'alerts@fishcount.app';
    process.env.PUBLIC_BASE_URL = 'https://fishcount.app';
  });
  afterEach(() => {
    for (const k of [
      'PROJECT_SECRET',
      'POSTAL_ADDRESS',
      'RESEND_API_KEY',
      'SUBSCRIBER_FROM_EMAIL',
      'PUBLIC_BASE_URL'
    ])
      delete process.env[k];
  });

  it('seed -> dispatch -> alert sent + alerts_sent row + dedup on second tick', async () => {
    const { dispatchAlerts } = await import('../../../src/lib/alerts/dispatch');
    const db = freshDb();
    const sid = seedSubscriber(db, { email: 'subscriber@test.example', status: 'active', boats: [1] });

    // 7 days of trailing baseline at 0.5 fish/angler.
    for (let i = 1; i <= 7; i++)
      seedRow(db, {
        date: dateOffset(TODAY, -i),
        boatId: 1,
        tripType: '1/2 Day AM',
        species: 'yellowtail',
        speciesCount: 6,
        anglers: 12
      });
    // Today: 2.0 fish/angler with 12 anglers (>= MIN_ANGLERS=8, >2x baseline).
    seedRow(db, {
      date: TODAY,
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      speciesCount: 24,
      anglers: 12
    });

    // First dispatch tick.
    await dispatchAlerts(TODAY, db);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0][0];
    expect(payload.subject).toBe('Hot day: Pacific Dawn');
    expect(payload.headers['List-Unsubscribe']).toMatch(/<mailto:unsubscribe\+/);
    expect(payload.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const sent = db
      .prepare(
        `SELECT subscriber_id, kind, trigger_key, trigger_date, status, resend_message_id FROM alerts_sent`
      )
      .all() as Array<{
      subscriber_id: number;
      kind: string;
      trigger_key: string;
      trigger_date: string;
      status: string;
      resend_message_id: string;
    }>;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      subscriber_id: sid,
      kind: 'hot_day',
      trigger_key: 'boat:1:1/2 Day AM',
      trigger_date: TODAY,
      status: 'sent'
    });
    expect(sent[0].resend_message_id).toBe('mock-msg-e2e');

    // Second dispatch tick: dedup must short-circuit (ALT-11). No additional send.
    await dispatchAlerts(TODAY, db);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(db.prepare(`SELECT COUNT(*) as c FROM alerts_sent`).get()).toMatchObject({ c: 1 });
  });
});
