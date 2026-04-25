// tests/unit/routes/home.test.ts
// Integration test for src/routes/+page.server.ts load().
//
// Pattern: env-isolated tmp DB (from PATTERNS.md §tests/unit/routes/*.test.ts).
// Uses vi.resetModules() so the DB singleton rebinds with the test's DB_PATH.
// Dynamic import after env set — critical for env isolation.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('routes/+page.server.ts (load)', () => {
  let tmp: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fc-home-'));
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
    const { load } = await import('../../../src/routes/+page.server');
    return load;
  }

  async function makeEvent(searchParams = '') {
    return {
      url: new URL(`http://localhost/${searchParams ? '?' + searchParams : ''}`),
      setHeaders: vi.fn(),
      locals: { logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any, requestId: 'test' }
    } as any;
  }

  async function seedRow(date: string, tripType: string) {
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
    return { boatId, landingId };
  }

  it('returns shape with all 6 required keys', async () => {
    const load = await makeLoad();
    const event = await makeEvent();
    const result = await load(event);
    expect(result).toHaveProperty('rows');
    expect(result).toHaveProperty('date');
    expect(result).toHaveProperty('isProvisional');
    expect(result).toHaveProperty('lastScrapedLabel');
    expect(result).toHaveProperty('filters');
    expect(result).toHaveProperty('filterOptions');
  });

  it('returns rowCount > 0 when today row is seeded', async () => {
    const { today } = await import('../../../src/lib/shared/dates');
    const todayStr = today();
    await seedRow(todayStr, '1/2 Day AM');
    const load = await makeLoad();
    const event = await makeEvent();
    const result = await load(event);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('returns empty rows array (not throw, not null) when no rows seeded', async () => {
    const load = await makeLoad();
    const event = await makeEvent();
    const result = await load(event);
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBe(0);
  });

  it('sets cache-control header to "public, max-age=60"', async () => {
    const load = await makeLoad();
    const event = await makeEvent();
    await load(event);
    expect(event.setHeaders).toHaveBeenCalledWith({ 'cache-control': 'public, max-age=60' });
  });

  it('filters by tripType when ?tripType=Long Range is set', async () => {
    const { today } = await import('../../../src/lib/shared/dates');
    const todayStr = today();
    // Seed two trips — Long Range and 1/2 Day AM
    const { getDb } = await import('../../../src/lib/db/client');
    const boats = await import('../../../src/lib/db/boats');
    const landings = await import('../../../src/lib/db/landings');
    const catchReports = await import('../../../src/lib/db/catchReports');
    const db = getDb();
    const landingId = landings.upsertByName(db, "Fisherman's Landing", "Fisherman's Landing");
    const boatId1 = boats.upsertByName(db, 'Long Range Boat', landingId, 'lr-boat', null);
    const boatId2 = boats.upsertByName(db, 'Half Day Boat', landingId, 'hd-boat', null);
    catchReports.upsertMany(db, [
      { source_date: todayStr, boat_id: boatId1, landing_id: landingId, trip_type: 'Long Range', species: 'bluefin', angler_count: 30, species_count: 90, scraped_at: '2026-04-25T00:00:00Z' },
      { source_date: todayStr, boat_id: boatId2, landing_id: landingId, trip_type: '1/2 Day AM', species: 'yellowtail', angler_count: 20, species_count: 40, scraped_at: '2026-04-25T00:00:00Z' }
    ]);
    const load = await makeLoad();
    const event = await makeEvent('tripType=Long+Range');
    const result = await load(event);
    expect(result.rows.every((r) => r.trip_type === 'Long Range')).toBe(true);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('does not crash on unknown/malformed filter key — returns full row set with partial filters', async () => {
    const { today } = await import('../../../src/lib/shared/dates');
    const todayStr = today();
    await seedRow(todayStr, '3/4 Day');
    const load = await makeLoad();
    // Pass a non-existent key in query params
    const event = await makeEvent('unknownKey=foo');
    let result: Awaited<ReturnType<typeof load>> | undefined;
    await expect(async () => {
      result = await load(event);
    }).not.toThrow();
    // rows should still be present (filters don't match anything, but don't crash)
    expect(Array.isArray(result!.rows)).toBe(true);
  });

  it('isProvisional is true (today is always provisional)', async () => {
    const load = await makeLoad();
    const event = await makeEvent();
    const result = await load(event);
    expect(result.isProvisional).toBe(true);
  });

  it('filterOptions contains tripTypes, landings, speciesList arrays', async () => {
    const load = await makeLoad();
    const event = await makeEvent();
    const result = await load(event);
    expect(Array.isArray(result.filterOptions.tripTypes)).toBe(true);
    expect(Array.isArray(result.filterOptions.landings)).toBe(true);
    expect(Array.isArray(result.filterOptions.speciesList)).toBe(true);
  });
});
