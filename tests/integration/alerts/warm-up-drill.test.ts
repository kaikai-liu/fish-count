// tests/integration/alerts/warm-up-drill.test.ts
// Phase 4 ALT-12 warm-up cap drill — automated end-to-end progression of the
// 50/200/full warm-up schedule (CLAUDE.md non-negotiable rule #5).
//
// This drill is the integration-level guarantee for the warm-up cap. The
// pure-fn dailyCap is unit-tested in tests/unit/alerts/warmup.test.ts; here
// we exercise the FULL pipeline (catch_reports -> evaluators -> dispatch ->
// cap -> recordSent / recordQueued) so a regression anywhere in that chain
// trips this test.
//
// Pitfall 7 invariant ("never silently drop"): when the cap is exceeded,
// candidates MUST land in alerts_sent with status='queued' (not vanish).
// On a subsequent tick whose cap > sentToday, drainQueued promotes those
// queued rows to status='sent' before evaluators run.
//
// Threat ref: T-04-A8 (Tampering / DoS — warmup cap end-to-end). Bypass
// requires either env mutation (operator-only via WARMUP_START_DATE) or
// direct DAL writes — both outside the dispatcher's surface.
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

function freshDb(boatCount: number): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  db.prepare(`INSERT INTO landings (id, source_name, display_name) VALUES (1, 'fl', 'F')`).run();
  const insertBoat = db.prepare(
    `INSERT INTO boats (id, source_name, display_name, landing_id) VALUES (?, ?, ?, 1)`
  );
  for (let i = 1; i <= boatCount; i++) insertBoat.run(i, `b${i}`, `Boat ${i}`);
  return db;
}

function seedRow(
  db: Database.Database,
  args: {
    date: string;
    boatId: number;
    tripType: string;
    species: string;
    speciesCount: number;
    anglers: number;
  }
): void {
  db.prepare(
    `INSERT OR REPLACE INTO catch_reports (source_date, boat_id, landing_id, trip_type, species, species_count, angler_count, scraped_at)
     VALUES (?, ?, 1, ?, ?, ?, ?, datetime('now'))`
  ).run(
    args.date,
    args.boatId,
    args.tripType,
    args.species,
    args.speciesCount,
    args.anglers
  );
}

function dateOffset(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Seed N (boat, trip_type) hot-day candidates, each with its own subscriber.
 * Each subscriber follows exactly one boat (by index). Today's catch is 4x the
 * trailing 7-day baseline (24/12 = 2.0 vs 6/12 = 0.5; multiplier=4.0 > 2.0
 * threshold; today's anglers=12 > MIN_ANGLERS=8).
 */
function seedHotDayBatch(db: Database.Database, today: string, count: number): void {
  for (let i = 1; i <= count; i++) {
    seedSubscriber(db, {
      email: `sub${i}@test.example`,
      status: 'active',
      boats: [i]
    });
    for (let d = 1; d <= 7; d++) {
      seedRow(db, {
        date: dateOffset(today, -d),
        boatId: i,
        tripType: '1/2 Day AM',
        species: 'yellowtail',
        speciesCount: 6,
        anglers: 12
      });
    }
    seedRow(db, {
      date: today,
      boatId: i,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      speciesCount: 24,
      anglers: 12
    });
  }
}

describe('Phase 4 ALT-12 warm-up cap drill', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'msg-warmup' }, error: null });
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
      'PUBLIC_BASE_URL',
      'WARMUP_START_DATE'
    ])
      delete process.env[k];
  });

  it('week 1 (cap=50): 60 candidates -> 50 sent + 10 queued (Pitfall 7 invariant — never silently drop)', async () => {
    const today = '2026-05-01';
    // Set warmup start = today so dailyCap(today, today) = 50 (day 0 = week 1).
    process.env.WARMUP_START_DATE = today;
    const db = freshDb(60);
    seedHotDayBatch(db, today, 60);
    const { dispatchAlerts } = await import('../../../src/lib/alerts/dispatch');
    await dispatchAlerts(today, db);

    expect(sendMock).toHaveBeenCalledTimes(50);
    const sentCount = (db
      .prepare(`SELECT COUNT(*) AS c FROM alerts_sent WHERE status='sent'`)
      .get() as { c: number }).c;
    const queuedCount = (db
      .prepare(`SELECT COUNT(*) AS c FROM alerts_sent WHERE status='queued'`)
      .get() as { c: number }).c;
    expect(sentCount).toBe(50);
    expect(queuedCount).toBe(10);
  });

  it('week 2 (cap=200): subsequent tick honors higher cap; queued rows from week 1 NOT silently deleted', async () => {
    const startDate = '2026-05-01';
    const week2 = '2026-05-08'; // 7 days into warmup -> day 7 = week 2 boundary -> cap=200
    process.env.WARMUP_START_DATE = startDate;
    const db = freshDb(60);
    seedHotDayBatch(db, startDate, 60);
    const { dispatchAlerts } = await import('../../../src/lib/alerts/dispatch');
    await dispatchAlerts(startDate, db);

    // Week 1 verdict: 50 sent + 10 queued.
    expect(
      (db.prepare(`SELECT COUNT(*) AS c FROM alerts_sent WHERE status='sent'`).get() as {
        c: number;
      }).c
    ).toBe(50);
    expect(
      (db.prepare(`SELECT COUNT(*) AS c FROM alerts_sent WHERE status='queued'`).get() as {
        c: number;
      }).c
    ).toBe(10);

    // Roll calendar forward 7 days. Re-seed today's hot-day catch_reports for the same 60 boats.
    sendMock.mockClear();
    for (let i = 1; i <= 60; i++) {
      seedRow(db, {
        date: week2,
        boatId: i,
        tripType: '1/2 Day AM',
        species: 'yellowtail',
        speciesCount: 24,
        anglers: 12
      });
    }
    await dispatchAlerts(week2, db);
    // B1 invariant: drainQueued runs BEFORE evaluators on this week-2 tick.
    // It picks up the 10 startDate-queued rows (within 24h TTL) and promotes via
    // markSent, then the evaluator emits 60 fresh candidates which also send.
    // Total this tick: 10 drained + 60 fresh = 70 sends (well under week-2 cap of 200).
    expect(sendMock).toHaveBeenCalledTimes(70);
    // The 10 queued rows from startDate were drained (status='sent') — NOT silently deleted, NOT still queued.
    // After week-2 tick: every row with trigger_date=startDate is now status='sent'
    // (50 from the original week-1 send + 10 promoted from queued by drainQueued).
    const queuedFromStart = (db
      .prepare(`SELECT COUNT(*) AS c FROM alerts_sent WHERE status='queued' AND trigger_date = ?`)
      .get(startDate) as { c: number }).c;
    expect(queuedFromStart).toBe(0);
    const sentFromStart = (db
      .prepare(`SELECT COUNT(*) AS c FROM alerts_sent WHERE status='sent' AND trigger_date = ?`)
      .get(startDate) as { c: number }).c;
    expect(sentFromStart).toBe(60);
  });

  it('post-warmup (cap=Infinity): no candidates queued', async () => {
    const today = '2026-05-15'; // > 14 days after WARMUP_START_DATE -> cap=Infinity (per Plan 02 dailyCap)
    process.env.WARMUP_START_DATE = '2026-05-01';
    const db = freshDb(300);
    seedHotDayBatch(db, today, 300);
    const { dispatchAlerts } = await import('../../../src/lib/alerts/dispatch');
    await dispatchAlerts(today, db);
    expect(sendMock).toHaveBeenCalledTimes(300);
    expect(
      (db.prepare(`SELECT COUNT(*) AS c FROM alerts_sent WHERE status='queued'`).get() as {
        c: number;
      }).c
    ).toBe(0);
  });

  it('warm-up unset (no env): cap=Infinity, no queueing (steady-state path)', async () => {
    delete process.env.WARMUP_START_DATE;
    const today = '2026-05-15';
    const db = freshDb(120);
    seedHotDayBatch(db, today, 120);
    const { dispatchAlerts } = await import('../../../src/lib/alerts/dispatch');
    await dispatchAlerts(today, db);
    expect(sendMock).toHaveBeenCalledTimes(120);
    expect(
      (db.prepare(`SELECT COUNT(*) AS c FROM alerts_sent WHERE status='queued'`).get() as {
        c: number;
      }).c
    ).toBe(0);
  });
});
