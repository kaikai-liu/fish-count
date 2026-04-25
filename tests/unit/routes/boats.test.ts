// tests/unit/routes/boats.test.ts
// Plan 02-05 Task 1 — load() integration tests for /boats/[id].
//
// Uses env-isolated tmp DB pattern from backfill.test.ts:46-77.
// Dynamic imports AFTER env mutation so the DB singleton rebinds.
//
// Covers:
//   - Non-numeric id → 404
//   - id=0 → 404
//   - Valid id but no boat in DB → 404 (error.status === 404)
//   - Valid id + seeded boat → returns correct profile shape
//   - sourceUrl path: boat.source_url non-null when set; falls back to landing_source_url
//   - Cutoff window: trips at today-200 excluded; trips at today-89 included
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('routes/boats/[id]/+page.server.ts (load)', () => {
  let tmp: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fc-boats-'));
    originalEnv = { DB_PATH: process.env.DB_PATH };
    process.env.DB_PATH = join(tmp, 'test.sqlite3');
    vi.resetModules();
  });

  afterEach(async () => {
    try {
      const { closeDb } = await import('../../../src/lib/db/client');
      closeDb();
    } catch {
      // ignore
    }
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(tmp, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function makeEvent(id: string, extraLocals: Record<string, unknown> = {}) {
    return {
      params: { id },
      setHeaders: vi.fn(),
      locals: { logger: { info: vi.fn() }, requestId: 'test', ...extraLocals }
    } as unknown as Parameters<import('../../../src/routes/boats/[id]/+page.server').load>[0];
  }

  it('returns 404 for non-numeric id (abc)', async () => {
    const { load } = await import('../../../src/routes/boats/[id]/+page.server');
    await expect(load(makeEvent('abc'))).rejects.toMatchObject({ status: 404 });
  });

  it('returns 404 for id containing letters mixed with digits', async () => {
    const { load } = await import('../../../src/routes/boats/[id]/+page.server');
    await expect(load(makeEvent('12abc'))).rejects.toMatchObject({ status: 404 });
  });

  it('returns 404 for id=0', async () => {
    const { load } = await import('../../../src/routes/boats/[id]/+page.server');
    await expect(load(makeEvent('0'))).rejects.toMatchObject({ status: 404 });
  });

  it('returns 404 when boat does not exist in DB', async () => {
    const { load } = await import('../../../src/routes/boats/[id]/+page.server');
    await expect(load(makeEvent('9999'))).rejects.toMatchObject({ status: 404 });
  });

  it('returns full profile shape for valid seeded boat', async () => {
    const { getDb } = await import('../../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../../../tests/helpers/seedTestDb');
    const { today, addDays } = await import('../../../src/lib/shared/dates');
    const db = getDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Pacific Queen',
      landingName: "Fisherman's Landing",
      sourceUrl: 'https://example.com/pacific-queen'
    });
    // Seed a recent trip (within 90 days)
    seedTrip(db, {
      boatId,
      landingId,
      date: addDays(today(), -10),
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 25,
      count: 75
    });

    const { load } = await import('../../../src/routes/boats/[id]/+page.server');
    const result = await load(makeEvent(String(boatId)));

    expect(result.profile).toBeDefined();
    expect(result.profile.boat.id).toBe(boatId);
    expect(result.profile.boat.display_name).toBe('Pacific Queen');
    expect(result.profile.recentTrips).toHaveLength(1);
    expect(result.profile.recentTrips[0].species).toBe('yellowtail');
    expect(result.profile.seasonTotals.total_trips).toBe(1);
    expect(result.profile.tripTypes).toContain('Full Day');
  });

  it('includes sourceUrl from boat.source_url when set', async () => {
    const { getDb } = await import('../../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../../../tests/helpers/seedTestDb');
    const { today, addDays } = await import('../../../src/lib/shared/dates');
    const db = getDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Enterprise',
      landingName: 'H&M Landing',
      sourceUrl: 'https://source.example.com/enterprise'
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: addDays(today(), -5),
      tripType: '1/2 Day AM',
      species: 'bluefin',
      anglers: 15,
      count: 30
    });

    const { load } = await import('../../../src/routes/boats/[id]/+page.server');
    const result = await load(makeEvent(String(boatId)));

    expect(result.profile.boat.source_url).toBe('https://source.example.com/enterprise');
  });

  it('returns null boat.source_url when not set (landing_source_url fallback available in UI)', async () => {
    const { getDb } = await import('../../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../../../tests/helpers/seedTestDb');
    const { today, addDays } = await import('../../../src/lib/shared/dates');
    const db = getDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Sea Hawk',
      landingName: 'Point Loma Sportfishing'
      // no sourceUrl
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: addDays(today(), -7),
      tripType: '3/4 Day',
      species: 'dorado',
      anglers: 20,
      count: 10
    });

    const { load } = await import('../../../src/routes/boats/[id]/+page.server');
    const result = await load(makeEvent(String(boatId)));

    // Server returns both source_url and landing_source_url; UI uses ??
    expect(result.profile.boat.source_url).toBeNull();
    // landing_source_url is also null when seedBoat doesn't set it
    expect(result.profile).toBeDefined();
  });

  it('cutoff window: trips at today-200 are excluded; trips at today-89 are included', async () => {
    const { getDb } = await import('../../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../../../tests/helpers/seedTestDb');
    const { today, addDays } = await import('../../../src/lib/shared/dates');
    const db = getDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Tiburon',
      landingName: 'Seaforth'
    });

    // Outside the 90-day window
    seedTrip(db, {
      boatId,
      landingId,
      date: addDays(today(), -200),
      tripType: 'Full Day',
      species: 'rockfish',
      anglers: 30,
      count: 90
    });

    // Inside the 90-day window
    seedTrip(db, {
      boatId,
      landingId,
      date: addDays(today(), -89),
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 25,
      count: 50
    });

    const { load } = await import('../../../src/routes/boats/[id]/+page.server');
    const result = await load(makeEvent(String(boatId)));

    // recentTrips should only include the trip within the 90-day window
    expect(result.profile.recentTrips).toHaveLength(1);
    expect(result.profile.recentTrips[0].species).toBe('yellowtail');
    // seasonTotals are all-time — both trips counted
    expect(result.profile.seasonTotals.total_trips).toBe(2);
  });

  it('returns Cache-Control: public, max-age=300', async () => {
    const { getDb } = await import('../../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../../../tests/helpers/seedTestDb');
    const { today, addDays } = await import('../../../src/lib/shared/dates');
    const db = getDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Calico Jack',
      landingName: 'Dana Wharf'
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: addDays(today(), -1),
      tripType: 'Full Day',
      species: 'calico bass',
      anglers: 10,
      count: 20
    });

    const setHeaders = vi.fn();
    const event = {
      params: { id: String(boatId) },
      setHeaders,
      locals: { logger: { info: vi.fn() }, requestId: 'test' }
    } as unknown as Parameters<import('../../../src/routes/boats/[id]/+page.server').load>[0];

    const { load } = await import('../../../src/routes/boats/[id]/+page.server');
    await load(event);

    expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'public, max-age=300' });
  });
});
