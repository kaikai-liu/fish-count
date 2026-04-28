// tests/forecast/heatmap-composer.test.ts
// FCT-05 / D-21: hybrid past/future heatmap composer in /picker loader.
// D-34: today() mocked to a known date; assert past cells come from catch_reports
// and today/future cells come from forecasts.
//
// Isolation pattern: mkdtempSync + DB_PATH + vi.resetModules so the DB singleton
// rebinds against the test DB (mirrors tests/integration/phase2-routes.test.ts).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeEvent(search: string) {
  return {
    url: new URL(`http://localhost/picker?${search}`),
    params: {} as Record<string, string>,
    setHeaders: vi.fn(),
    locals: {
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
      requestId: 'composer-test'
    }
  } as any;
}

describe('picker hybrid heatmap composer (D-21, D-34)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fc-forecast-composer-'));
    process.env.DB_PATH = join(tmp, 'test.sqlite3');
    process.env.NODE_ENV = 'test';
    vi.resetModules();
  });

  afterEach(async () => {
    try {
      const { closeDb } = await import('../../src/lib/db/client');
      closeDb();
    } catch {
      /* ignore */
    }
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    delete process.env.DB_PATH;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('past cells (date < today PT) come from heatmapForQuery (catch_reports)', async () => {
    // Mock today() BEFORE importing modules that use it.
    vi.doMock('$lib/shared/dates', async () => {
      const actual = await vi.importActual<typeof import('../../src/lib/shared/dates')>(
        '../../src/lib/shared/dates'
      );
      return { ...actual, today: () => '2026-05-15' };
    });

    const { getDb } = await import('../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../helpers/seedTestDb');
    const db = getDb();

    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: "Point Loma Sportfishing"
    });
    // Past actual: 2026-05-13 — must be inside the heatmap window for the
    // composer to query it. Use target_date = 2026-05-12 so the 30-cell window
    // is 2026-05-12..2026-06-10, which spans past (≤ 2026-05-14) and future
    // (≥ 2026-05-15 = today PT).
    seedTrip(db, {
      boatId,
      landingId,
      date: '2026-05-13',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });

    const { load } = await import('../../src/routes/picker/+page.server');
    const event = makeEvent('species=yellowtail&tripType=Full+Day&date=2026-05-12');
    const result = await load(event);

    expect(result.heatmap).not.toBeNull();
    const cellMap = new Map((result.heatmap as any[]).map((c) => [c.date, c]));
    const pastCell = cellMap.get('2026-05-13');
    // Past cell present and from heatmapForQuery (no pi_low field).
    expect(pastCell).toBeDefined();
    expect((pastCell as any).pi_low).toBeUndefined();
    // Weighted yield: 30/20 = 1.5
    expect((pastCell as any).value).toBeCloseTo(1.5, 3);
  });

  it('today + future cells (date >= today PT) come from forecastHeatmapForQuery (forecasts)', async () => {
    vi.doMock('$lib/shared/dates', async () => {
      const actual = await vi.importActual<typeof import('../../src/lib/shared/dates')>(
        '../../src/lib/shared/dates'
      );
      return { ...actual, today: () => '2026-05-15' };
    });

    const { getDb } = await import('../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../helpers/seedTestDb');
    const { upsertMany } = await import('../../src/lib/db/forecasts');
    const db = getDb();

    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: "Point Loma Sportfishing"
    });
    // Seed at least one past row so distinctSpecies/distinctTripTypes return real data.
    seedTrip(db, {
      boatId,
      landingId,
      date: '2026-05-13',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });
    // Today forecast: 2026-05-15 — should appear from forecasts.
    // Future forecast: 2026-05-20 — should appear from forecasts.
    upsertMany(db, [
      {
        forecast_date: '2026-05-15',
        species: 'yellowtail',
        trip_type: 'Full Day',
        value: 6.0,
        pi_low: 2.0,
        pi_high: 10.0,
        n_trips: 7,
        baseline_value: 6.0,
        gap_days_present: 35,
        gap_days_expected: 56,
        computed_at: '2026-05-15T00:00:00Z'
      },
      {
        forecast_date: '2026-05-20',
        species: 'yellowtail',
        trip_type: 'Full Day',
        value: 7.0,
        pi_low: 3.0,
        pi_high: 11.0,
        n_trips: 8,
        baseline_value: 7.0,
        gap_days_present: 40,
        gap_days_expected: 56,
        computed_at: '2026-05-15T00:00:00Z'
      }
    ]);

    const { load } = await import('../../src/routes/picker/+page.server');
    const event = makeEvent('species=yellowtail&tripType=Full+Day&date=2026-05-15');
    const result = await load(event);

    expect(result.heatmap).not.toBeNull();
    const cellMap = new Map((result.heatmap as any[]).map((c) => [c.date, c]));

    // Today cell (2026-05-15) is in the future side (date >= today) so comes from forecasts.
    const todayCell = cellMap.get('2026-05-15');
    expect(todayCell).toBeDefined();
    expect((todayCell as any).pi_low).toBe(2.0);
    expect((todayCell as any).pi_high).toBe(10.0);
    expect((todayCell as any).value).toBe(6.0);
    expect((todayCell as any).n).toBe(7);

    // Future cell
    const futureCell = cellMap.get('2026-05-20');
    expect(futureCell).toBeDefined();
    expect((futureCell as any).pi_low).toBe(3.0);
    expect((futureCell as any).pi_high).toBe(11.0);
  });

  it('today() called once per load — same value used for both horizon check and split', async () => {
    // Use a counting mock to assert the loader does not over-call today().
    const todayMock = vi.fn(() => '2026-05-15');
    vi.doMock('$lib/shared/dates', async () => {
      const actual = await vi.importActual<typeof import('../../src/lib/shared/dates')>(
        '../../src/lib/shared/dates'
      );
      return { ...actual, today: todayMock };
    });

    const { getDb } = await import('../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../helpers/seedTestDb');
    const db = getDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: "Point Loma Sportfishing"
    });
    seedTrip(db, {
      boatId,
      landingId,
      date: '2026-05-13',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });

    const { load } = await import('../../src/routes/picker/+page.server');

    // Reset mock counter AFTER imports — module-load calls (e.g. defaultDate) don't count
    // toward the per-request budget; we are asserting the LOAD body's call count.
    todayMock.mockClear();

    const event = makeEvent('species=yellowtail&tripType=Full+Day&date=2026-05-15');
    await load(event);

    // WR-03 fix: the loader body now reads today() EXACTLY ONCE per request —
    // the captured todayPt is reused for filterOptions.defaultDate, the horizon
    // check, and the past/future split (RESEARCH §4 / CONTEXT.md DST-safety).
    expect(todayMock.mock.calls.length).toBe(1);
  });

  it('30-cell array is gap-filled with {date, value: null, n: 0} when neither source has the date', async () => {
    vi.doMock('$lib/shared/dates', async () => {
      const actual = await vi.importActual<typeof import('../../src/lib/shared/dates')>(
        '../../src/lib/shared/dates'
      );
      return { ...actual, today: () => '2026-05-15' };
    });

    const { getDb } = await import('../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../helpers/seedTestDb');
    const db = getDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: "Point Loma Sportfishing"
    });
    // Seed at least one row so distinctSpecies/distinctTripTypes return real data.
    seedTrip(db, {
      boatId,
      landingId,
      date: '2026-05-13',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });

    const { load } = await import('../../src/routes/picker/+page.server');
    const event = makeEvent('species=yellowtail&tripType=Full+Day&date=2026-05-15');
    const result = await load(event);

    expect(result.heatmap).not.toBeNull();
    expect((result.heatmap as any[]).length).toBe(30);
    // Find a date that has neither a catch_report nor a forecast — must be gap-filled.
    const cellMap = new Map((result.heatmap as any[]).map((c) => [c.date, c]));
    const emptyCell = cellMap.get('2026-06-01');
    expect(emptyCell).toBeDefined();
    expect((emptyCell as any).value).toBeNull();
    expect((emptyCell as any).n).toBe(0);
  });

  it('WR-04: future-date gap-fill cells carry pi_low (forecast shape) so tooltip routes to "not enough history"', async () => {
    vi.doMock('$lib/shared/dates', async () => {
      const actual = await vi.importActual<typeof import('../../src/lib/shared/dates')>(
        '../../src/lib/shared/dates'
      );
      return { ...actual, today: () => '2026-05-15' };
    });

    const { getDb } = await import('../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../helpers/seedTestDb');
    const db = getDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    // Seed only ONE past row so distinctSpecies/distinctTripTypes return data,
    // but no forecast rows — every today/future cell will be gap-filled.
    seedTrip(db, {
      boatId,
      landingId,
      date: '2026-05-13',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 30
    });

    const { load } = await import('../../src/routes/picker/+page.server');
    // target date 2026-05-12 → window 2026-05-12..2026-06-10 spans both past and future.
    const event = makeEvent('species=yellowtail&tripType=Full+Day&date=2026-05-12');
    const result = await load(event);

    expect(result.heatmap).not.toBeNull();
    const cellMap = new Map((result.heatmap as any[]).map((c) => [c.date, c]));

    // Past gap-fill (date < 2026-05-15): plain {date, value, n} stub — no pi_low.
    const pastGap = cellMap.get('2026-05-12');
    expect(pastGap).toBeDefined();
    expect((pastGap as any).value).toBeNull();
    expect((pastGap as any).n).toBe(0);
    expect('pi_low' in (pastGap as any)).toBe(false);

    // Today gap-fill (date == 2026-05-15): forecast-shaped stub — carries pi_low.
    const todayGap = cellMap.get('2026-05-15');
    expect(todayGap).toBeDefined();
    expect((todayGap as any).value).toBeNull();
    expect((todayGap as any).n).toBe(0);
    expect('pi_low' in (todayGap as any)).toBe(true);
    expect((todayGap as any).pi_low).toBeNull();
    expect((todayGap as any).pi_high).toBeNull();

    // Future gap-fill (date > 2026-05-15): forecast-shaped stub.
    const futureGap = cellMap.get('2026-06-01');
    expect(futureGap).toBeDefined();
    expect('pi_low' in (futureGap as any)).toBe(true);
    expect((futureGap as any).gap_present).toBe(0);
    expect((futureGap as any).gap_expected).toBe(0);
  });
});
