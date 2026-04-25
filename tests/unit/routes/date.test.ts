// tests/unit/routes/date.test.ts
// Integration test for src/routes/date/[date]/+page.server.ts load().
//
// Pattern: env-isolated tmp DB (from PATTERNS.md §tests/unit/routes/*.test.ts).
// Uses vi.resetModules() so the DB singleton rebinds with the test's DB_PATH.
// Dynamic import after env set — critical for env isolation.
//
// T-02-14: regex + calendar validation → 404 on bad input
// T-02-15: dataset bounds clamp via browse.getDateBounds
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('routes/date/[date]/+page.server.ts (load)', () => {
  let tmp: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fc-date-'));
    originalEnv = { DB_PATH: process.env.DB_PATH };
    process.env.DB_PATH = join(tmp, 'test.sqlite3');
    vi.resetModules();
  });

  afterEach(async () => {
    try {
      const { closeDb } = await import('../../../src/lib/db/client');
      closeDb();
    } catch {
      // ignore — module may not have been imported
    }
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(tmp, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function makeLoad() {
    const { load } = await import('../../../src/routes/date/[date]/+page.server');
    return load;
  }

  function makeEvent(date: string, searchParams = '') {
    return {
      params: { date },
      url: new URL(`http://localhost/date/${date}${searchParams ? '?' + searchParams : ''}`),
      setHeaders: vi.fn(),
      locals: { logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any, requestId: 'test' }
    } as any;
  }

  async function seedRow(date: string, tripType = '1/2 Day AM') {
    const { getDb } = await import('../../../src/lib/db/client');
    const boats = await import('../../../src/lib/db/boats');
    const landings = await import('../../../src/lib/db/landings');
    const catchReports = await import('../../../src/lib/db/catchReports');
    const db = getDb();
    const landingId = landings.upsertByName(db, "Fisherman's Landing", "Fisherman's Landing");
    const boatId = boats.upsertByName(db, 'Test Boat', landingId, 'test-boat', null);
    catchReports.upsertMany(db, [{
      source_date: date,
      boat_id: boatId,
      landing_id: landingId,
      trip_type: tripType,
      species: 'yellowtail',
      angler_count: 20,
      species_count: 40,
      scraped_at: '2026-04-25T00:00:00Z'
    }]);
  }

  // T-02-14: regex rejection
  it('throws 404 when date param is "abc" (regex rejected)', async () => {
    const load = await makeLoad();
    const event = makeEvent('abc');
    let thrown: unknown;
    try {
      await load(event);
    } catch (e) {
      thrown = e;
    }
    expect((thrown as any)?.status).toBe(404);
  });

  // T-02-14: calendar invalid
  it('throws 404 when date param is "2024-13-99" (calendar invalid)', async () => {
    const load = await makeLoad();
    const event = makeEvent('2024-13-99');
    let thrown: unknown;
    try {
      await load(event);
    } catch (e) {
      thrown = e;
    }
    expect((thrown as any)?.status).toBe(404);
  });

  it('returns rows + nav.prevDate/nextDate for a seeded date', async () => {
    await seedRow('2024-07-15');
    const load = await makeLoad();
    const event = makeEvent('2024-07-15');
    const result = await load(event);
    expect(result.date).toBe('2024-07-15');
    expect(result.nav.prevDate).toBe('2024-07-14');
    expect(result.nav.nextDate).toBe('2024-07-16');
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('returns isProvisional: true and cache-control max-age=60 for today', async () => {
    const { today } = await import('../../../src/lib/shared/dates');
    const todayStr = today();
    const load = await makeLoad();
    const event = makeEvent(todayStr);
    const result = await load(event);
    expect(result.isProvisional).toBe(true);
    expect(event.setHeaders).toHaveBeenCalledWith({ 'cache-control': 'public, max-age=60' });
  });

  it('returns isProvisional: false and cache-control max-age=86400 for a past date', async () => {
    await seedRow('2024-07-15');
    const load = await makeLoad();
    const event = makeEvent('2024-07-15');
    const result = await load(event);
    expect(result.isProvisional).toBe(false);
    expect(event.setHeaders).toHaveBeenCalledWith({ 'cache-control': 'public, max-age=86400' });
  });

  // T-02-15: Empty-DB clamp — getDateBounds returns {min:null, max:null}
  it('empty DB clamp: renders without crashing when DB has no catch_reports', async () => {
    const load = await makeLoad();
    const event = makeEvent('2024-07-15');
    // No seeded data — bounds are null, loader falls back to today()/today()
    const result = await load(event);
    // Should not throw; rows will be empty
    expect(result).toBeDefined();
    expect(Array.isArray(result.rows)).toBe(true);
    // date should be clamped to today() since bounds fallback to today/today
    const { today } = await import('../../../src/lib/shared/dates');
    expect(result.date).toBe(today());
  });

  // T-02-15: Past clamp — date before min gets clamped to min
  it('past clamp: date before dataset min is clamped to min', async () => {
    await seedRow('2024-01-15');
    await seedRow('2024-12-31');
    const load = await makeLoad();
    const event = makeEvent('2020-01-01');
    const result = await load(event);
    expect(result.date).toBe('2024-01-15');
  });

  // T-02-15: Future clamp — date after max gets clamped to max
  it('future clamp: date after dataset max is clamped to max', async () => {
    await seedRow('2024-01-15');
    await seedRow('2024-12-31');
    const load = await makeLoad();
    const event = makeEvent('2099-01-01');
    const result = await load(event);
    expect(result.date).toBe('2024-12-31');
  });

  // Prev/next disable at bounds
  it('prev disabled when date is at minDate', async () => {
    await seedRow('2024-01-15');
    const load = await makeLoad();
    const event = makeEvent('2024-01-15');
    const result = await load(event);
    expect(result.nav.prevDisabled).toBe(true);
  });

  it('next disabled when date is at maxDate', async () => {
    await seedRow('2024-01-15');
    const load = await makeLoad();
    const event = makeEvent('2024-01-15');
    const result = await load(event);
    // Only one date in dataset, so both min and max are 2024-01-15
    expect(result.nav.nextDisabled).toBe(true);
  });
});
