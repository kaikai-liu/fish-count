// tests/unit/scraper/sla.test.ts
// Plan 01-07 Task 2 — full coverage for shouldAlert (pure truth table) and
// checkSlaAndAlert (side effect). Mocks the `resend` module at module scope,
// exactly mirroring tests/ops/operator-alert.test.ts (the analog per
// 01-PATTERNS.md §tests/unit/scraper/sla.test.ts).
//
// DAL-boundary note: this test uses a raw `DELETE FROM scrape_runs` and
// inline `db.prepare(...)` for table cleanup. The dal-boundary.test.ts scan
// covers src/ only (see tests/unit/db/dal-boundary.test.ts); test-internal
// SQL is allowed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock Resend at module scope — same pattern as tests/ops/operator-alert.test.ts
const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn(() => ({
    emails: { send: sendMock }
  }))
}));

describe('shouldAlert (pure, D-23/D-25)', () => {
  let shouldAlert: typeof import('../../../src/lib/scraper/sla').shouldAlert;
  beforeEach(async () => {
    const mod = await import('../../../src/lib/scraper/sla');
    shouldAlert = mod.shouldAlert;
  });

  it('returns false when outcome is not "success" (D-25: only success triggers)', () => {
    expect(shouldAlert('empty', 100, 0)).toBe(false);
    expect(shouldAlert('http_error', 100, 0)).toBe(false);
    expect(shouldAlert('parse_error', 100, 0)).toBe(false);
    expect(shouldAlert('killed', 100, 0)).toBe(false);
  });

  it('returns false when baseline is null (no history)', () => {
    expect(shouldAlert('success', null, 0)).toBe(false);
    expect(shouldAlert('success', null, 100)).toBe(false);
  });

  it('returns false when baseline < 5 (insufficient-history safeguard)', () => {
    expect(shouldAlert('success', 4, 0)).toBe(false);
    expect(shouldAlert('success', 2.5, 0)).toBe(false);
    expect(shouldAlert('success', 4.99, 0)).toBe(false);
  });

  it('returns true when today < 50% of baseline and baseline >= 5', () => {
    expect(shouldAlert('success', 100, 49)).toBe(true);
    expect(shouldAlert('success', 100, 40)).toBe(true);
    expect(shouldAlert('success', 100, 0)).toBe(true);
    expect(shouldAlert('success', 10, 4)).toBe(true);
    expect(shouldAlert('success', 5, 2)).toBe(true);
  });

  it('returns false when today exactly at 50% of baseline (strict < threshold)', () => {
    expect(shouldAlert('success', 100, 50)).toBe(false);
    expect(shouldAlert('success', 10, 5)).toBe(false);
  });

  it('returns false when today >= 50% of baseline', () => {
    expect(shouldAlert('success', 100, 51)).toBe(false);
    expect(shouldAlert('success', 100, 100)).toBe(false);
    expect(shouldAlert('success', 100, 120)).toBe(false);
  });
});

describe('checkSlaAndAlert (side effect, D-24)', () => {
  let tmp: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fc-sla-'));
    originalEnv = {
      DB_PATH: process.env.DB_PATH,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      OPERATOR_EMAIL: process.env.OPERATOR_EMAIL,
      OPERATOR_FROM_EMAIL: process.env.OPERATOR_FROM_EMAIL
    };
    process.env.DB_PATH = join(tmp, 'sla.sqlite3');
    process.env.RESEND_API_KEY = 'test-key';
    process.env.OPERATOR_EMAIL = 'ops@example.com';
    process.env.OPERATOR_FROM_EMAIL = 'alerts@fishcount.example';
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'rs_fake' }, error: null });
    vi.resetModules();
  });

  afterEach(async () => {
    try {
      const { closeDb } = await import('../../../src/lib/db/client');
      closeDb();
    } catch {
      // module may not have been imported in this test — ignore
    }
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it('outcome=empty → no DB read, no alert (short-circuit)', async () => {
    const { checkSlaAndAlert } = await import('../../../src/lib/scraper/sla');
    await checkSlaAndAlert('2024-08-15', 'empty');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('outcome=http_error → no alert (non-success short-circuit)', async () => {
    const { checkSlaAndAlert } = await import('../../../src/lib/scraper/sla');
    await checkSlaAndAlert('2024-08-15', 'http_error');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('outcome=parse_error → no alert (non-success short-circuit)', async () => {
    const { checkSlaAndAlert } = await import('../../../src/lib/scraper/sla');
    await checkSlaAndAlert('2024-08-15', 'parse_error');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('outcome=killed → no alert (non-success short-circuit)', async () => {
    const { checkSlaAndAlert } = await import('../../../src/lib/scraper/sla');
    await checkSlaAndAlert('2024-08-15', 'killed');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('outcome=success, today < 50% of baseline → alert dispatched once with date + counts', async () => {
    const { getDb } = await import('../../../src/lib/db/client');
    const { recordOutcome } = await import('../../../src/lib/db/scrapeRuns');
    const { upsertMany } = await import('../../../src/lib/db/catchReports');
    const { upsertByName: upsertLanding } = await import('../../../src/lib/db/landings');
    const { upsertByName: upsertBoat } = await import('../../../src/lib/db/boats');

    const db = getDb();
    // Seed 7 historical success days with 100 rows each (2024-08-08 .. 2024-08-14).
    for (let i = 0; i < 7; i++) {
      const day = String(8 + i).padStart(2, '0');
      const d = `2024-08-${day}`;
      recordOutcome(db, {
        runId: `seed-${i}`,
        runDate: d,
        startedAt: `${d}T23:00:00Z`,
        finishedAt: `${d}T23:01:00Z`,
        outcome: 'success',
        rowsIngested: 100
      });
    }

    const lid = upsertLanding(db, 'TestLanding', 'TestLanding');
    const bid = upsertBoat(db, 'TestBoat', lid, 'TestBoat');

    // Seed TODAY (2024-08-15) with only 20 catch_reports — below 50% of 100.
    const rows = Array.from({ length: 20 }, (_, i) => ({
      source_date: '2024-08-15',
      boat_id: bid,
      landing_id: lid,
      trip_type: 'Full Day',
      species: `species-${i}`,
      angler_count: 10,
      species_count: 1,
      scraped_at: '2024-08-15T23:30:00Z'
    }));
    upsertMany(db, rows);

    const { checkSlaAndAlert } = await import('../../../src/lib/scraper/sla');
    await checkSlaAndAlert('2024-08-15', 'success');

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [args] = sendMock.mock.calls[0];
    expect(args.subject).toContain('2024-08-15');
    expect(args.subject).toMatch(/SLA/i);
    expect(args.text).toContain('20'); // today total
    expect(args.text).toContain('100'); // baseline
    expect(args.text).toContain('2024-08-15'); // date in body
  });

  it('outcome=success, today >= 50% baseline → no alert', async () => {
    const { getDb } = await import('../../../src/lib/db/client');
    const { recordOutcome } = await import('../../../src/lib/db/scrapeRuns');
    const { upsertMany } = await import('../../../src/lib/db/catchReports');
    const { upsertByName: upsertLanding } = await import('../../../src/lib/db/landings');
    const { upsertByName: upsertBoat } = await import('../../../src/lib/db/boats');

    const db = getDb();
    for (let i = 0; i < 7; i++) {
      const day = String(8 + i).padStart(2, '0');
      const d = `2024-08-${day}`;
      recordOutcome(db, {
        runId: `seed-${i}`,
        runDate: d,
        startedAt: `${d}T23:00:00Z`,
        finishedAt: `${d}T23:01:00Z`,
        outcome: 'success',
        rowsIngested: 100
      });
    }
    const lid = upsertLanding(db, 'TestLanding', 'TestLanding');
    const bid = upsertBoat(db, 'TestBoat', lid, 'TestBoat');

    // Today = 60 rows (>= 50% of baseline 100 → no alert).
    const rows = Array.from({ length: 60 }, (_, i) => ({
      source_date: '2024-08-15',
      boat_id: bid,
      landing_id: lid,
      trip_type: 'Full Day',
      species: `species-${i}`,
      angler_count: 10,
      species_count: 1,
      scraped_at: '2024-08-15T23:30:00Z'
    }));
    upsertMany(db, rows);

    const { checkSlaAndAlert } = await import('../../../src/lib/scraper/sla');
    await checkSlaAndAlert('2024-08-15', 'success');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('outcome=success but baseline < 5 (only 1 prior success) → no alert', async () => {
    const { getDb } = await import('../../../src/lib/db/client');
    const { recordOutcome } = await import('../../../src/lib/db/scrapeRuns');
    const db = getDb();
    recordOutcome(db, {
      runId: 'seed-1',
      runDate: '2024-08-14',
      startedAt: '2024-08-14T23:00:00Z',
      finishedAt: '2024-08-14T23:01:00Z',
      outcome: 'success',
      rowsIngested: 2
    });
    // No catch_reports for 2024-08-15 → today total = 0, baseline = 2 (< 5) → no alert.
    const { checkSlaAndAlert } = await import('../../../src/lib/scraper/sla');
    await checkSlaAndAlert('2024-08-15', 'success');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('D-25: baseline excludes non-success outcomes from denominator', async () => {
    const { getDb } = await import('../../../src/lib/db/client');
    const { recordOutcome, computeSlaBaseline } = await import(
      '../../../src/lib/db/scrapeRuns'
    );
    const db = getDb();

    // Seed: 4 success @ 100 rows, 3 non-success @ 0 rows within the 7-day window.
    // If the query wrongly included non-success rows, AVG would be (400 + 0)/7 = 57.14.
    // D-25 mandates outcome='success' only → AVG = 400/4 = 100.
    const mk = (date: string, outcome: import('../../../src/lib/db/scrapeRuns').ScrapeOutcome, rows: number) => ({
      runId: `x-${date}-${outcome}`,
      runDate: date,
      startedAt: `${date}T00:00:00Z`,
      finishedAt: `${date}T00:00:01Z`,
      outcome,
      rowsIngested: rows
    });
    recordOutcome(db, mk('2024-08-08', 'success', 100));
    recordOutcome(db, mk('2024-08-09', 'success', 100));
    recordOutcome(db, mk('2024-08-10', 'success', 100));
    recordOutcome(db, mk('2024-08-11', 'success', 100));
    recordOutcome(db, mk('2024-08-12', 'empty', 0));
    recordOutcome(db, mk('2024-08-13', 'http_error', 0));
    recordOutcome(db, mk('2024-08-14', 'killed', 0));

    expect(computeSlaBaseline(db, '2024-08-15')).toBe(100);
  });
});
