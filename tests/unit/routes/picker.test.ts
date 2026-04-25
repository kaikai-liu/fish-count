// tests/unit/routes/picker.test.ts
// Covers:
//   TRP-05: Missing tripType → guidance state (no rankings)
//   TRP-07: n<5 boats are retained (not filtered out)
//   Heatmap 30-cell shape + gap-fill
//   Why-panel data present per ranking row
//   Cache-control header set to max-age=300
//   Window math (± days expansion)
//   defaultTripType selection (W-7, D-10)
//   defaultTripType on empty DB → null
//
// Isolation pattern: mkdtempSync tmp DB + vi.resetModules() between tests
// so the DB singleton rebinds with each test's DB_PATH.
// Source: tests/unit/scripts/backfill.test.ts (env-isolation skeleton).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CWD = process.cwd();

describe('routes/picker/+page.server.ts (load)', () => {
  let tmp: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fc-picker-'));
    originalEnv = { DB_PATH: process.env.DB_PATH };
    process.env.DB_PATH = join(tmp, 'test.sqlite3');
    vi.resetModules();
  });

  afterEach(async () => {
    try {
      const { closeDb } = await import(join(CWD, 'src/lib/db/client.ts'));
      closeDb();
    } catch {
      // ignore if module not loaded
    }
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(tmp, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  /** Build a minimal fake SvelteKit event for the picker load function. */
  function fakeEvent(urlString: string) {
    return {
      url: new URL(urlString),
      setHeaders: vi.fn(),
      locals: { logger: { info: vi.fn() } as any, requestId: 'test' }
    } as any;
  }

  /** Seed a boat + landing + catch reports into the test DB. */
  async function seedBoatWithTrips(
    boatName: string,
    tripType: string,
    species: string,
    dates: string[],
    anglers = 10,
    count = 30
  ): Promise<number> {
    const { seedBoat, seedTrip } = await import(join(CWD, 'tests/helpers/seedTestDb.ts'));
    const { getDb } = await import(join(CWD, 'src/lib/db/client.ts'));
    const db = getDb();
    const { boatId, landingId } = seedBoat(db, { boatName, landingName: 'Test Landing' });
    for (const date of dates) {
      seedTrip(db, { boatId, landingId, date, tripType, species, anglers, count });
    }
    return boatId;
  }

  // ---------------------------------------------------------------------------
  // Test 1: TRP-05 — missing tripType → guidance state
  // ---------------------------------------------------------------------------
  it('TRP-05: returns guidance when tripType is missing from URL', async () => {
    const { load } = await import(
      join(CWD, 'src/routes/picker/+page.server.ts')
    );
    const event = fakeEvent('http://localhost/picker?date=2026-04-23&species=yellowtail');
    const result = await load(event);

    expect(result.rankings).toBeNull();
    expect(result.filters).toBeNull();
    expect(result.guidance).toBeTruthy();
    expect(typeof result.guidance).toBe('string');
    expect((result.guidance as string).length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Test 2: TRP-07 — boat with n<5 trips is retained
  // ---------------------------------------------------------------------------
  it('TRP-07: boat with n=2 trips is NOT filtered out (remains in rankings)', async () => {
    await seedBoatWithTrips('Low-n Boat', '1/2 Day AM', 'yellowtail', [
      '2024-07-01',
      '2024-07-02'
    ]);

    const { load } = await import(
      join(CWD, 'src/routes/picker/+page.server.ts')
    );
    const event = fakeEvent(
      'http://localhost/picker?date=2024-07-15&species=yellowtail&tripType=1%2F2+Day+AM&windowDays=14'
    );
    const result = await load(event);

    expect(result.rankings).not.toBeNull();
    expect(result.rankings!.length).toBe(1);
    expect(result.rankings![0].n_trips).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Test 3: Heatmap 30-cell shape
  // ---------------------------------------------------------------------------
  it('heatmap always has exactly 30 cells with {date, value, n} keys', async () => {
    await seedBoatWithTrips('Test Boat', 'Full Day', 'yellowtail', [
      '2024-07-15',
      '2024-07-16'
    ]);

    const { load } = await import(
      join(CWD, 'src/routes/picker/+page.server.ts')
    );
    const event = fakeEvent(
      'http://localhost/picker?date=2024-07-15&species=yellowtail&tripType=Full+Day'
    );
    const result = await load(event);

    expect(result.heatmap).not.toBeNull();
    expect(result.heatmap!.length).toBe(30);
    for (const cell of result.heatmap!) {
      expect(cell).toHaveProperty('date');
      expect(cell).toHaveProperty('value');
      expect(cell).toHaveProperty('n');
    }
  });

  // ---------------------------------------------------------------------------
  // Test 4: Heatmap gap-fill — missing dates get value=null, n=0
  // ---------------------------------------------------------------------------
  it('heatmap gap-fills missing dates with value=null and n=0', async () => {
    // Only 5 specific dates have data within the 30-day window starting 2024-07-15
    const dateDates = [
      '2024-07-15',
      '2024-07-17',
      '2024-07-19',
      '2024-07-21',
      '2024-07-23'
    ];
    await seedBoatWithTrips('Gap Boat', 'Full Day', 'yellowtail', dateDates);

    const { load } = await import(
      join(CWD, 'src/routes/picker/+page.server.ts')
    );
    const event = fakeEvent(
      'http://localhost/picker?date=2024-07-15&species=yellowtail&tripType=Full+Day'
    );
    const result = await load(event);

    const cells = result.heatmap! as Array<{ date: string; value: number | null; n: number }>;
    expect(cells.length).toBe(30);

    const withData = cells.filter((c) => c.n > 0);
    const withoutData = cells.filter((c) => c.n === 0);
    expect(withData.length).toBe(5);
    expect(withoutData.length).toBe(25);
    for (const c of withoutData) {
      expect(c.value).toBeNull();
      expect(c.n).toBe(0);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 5: Why-panel data present for every ranking row
  // ---------------------------------------------------------------------------
  it('why-panel data is present for every boat in rankings', async () => {
    const boatId = await seedBoatWithTrips('Why Boat', '3/4 Day', 'bluefin', [
      '2024-08-01',
      '2024-08-02',
      '2024-08-03'
    ]);

    const { load } = await import(
      join(CWD, 'src/routes/picker/+page.server.ts')
    );
    const event = fakeEvent(
      'http://localhost/picker?date=2024-08-01&species=bluefin&tripType=3%2F4+Day'
    );
    const result = await load(event);

    expect(result.rankings).not.toBeNull();
    expect(result.why).not.toBeNull();
    for (const boat of result.rankings!) {
      const panel = result.why![boat.boat_id];
      expect(panel).toBeDefined();
      expect(panel.species).toBe('bluefin');
      expect(panel.tripType).toBe('3/4 Day');
      expect(typeof panel.windowStart).toBe('string');
      expect(typeof panel.windowEnd).toBe('string');
    }
  });

  // ---------------------------------------------------------------------------
  // Test 6: Cache-control header
  // ---------------------------------------------------------------------------
  it('sets cache-control: public, max-age=300', async () => {
    const { load } = await import(
      join(CWD, 'src/routes/picker/+page.server.ts')
    );
    const event = fakeEvent('http://localhost/picker');
    await load(event);

    expect(event.setHeaders).toHaveBeenCalledWith({
      'cache-control': 'public, max-age=300'
    });
  });

  // ---------------------------------------------------------------------------
  // Test 7: Window math (± days)
  // ---------------------------------------------------------------------------
  it('window math: date=2024-07-15 windowDays=3 → fromDate=2024-07-12, toDate=2024-07-18', async () => {
    await seedBoatWithTrips('Window Boat', 'Full Day', 'yellowtail', ['2024-07-15']);

    const { load } = await import(
      join(CWD, 'src/routes/picker/+page.server.ts')
    );
    const event = fakeEvent(
      'http://localhost/picker?date=2024-07-15&species=yellowtail&tripType=Full+Day&windowDays=3'
    );
    const result = await load(event);

    expect(result.windowStart).toBe('2024-07-12');
    expect(result.windowEnd).toBe('2024-07-18');
  });

  // ---------------------------------------------------------------------------
  // Test 8: defaultTripType — most common trip type is selected
  // ---------------------------------------------------------------------------
  it('defaultTripType: returns the most common trip type from the DB (D-10)', async () => {
    const { seedBoat, seedTrip } = await import(join(CWD, 'tests/helpers/seedTestDb.ts'));
    const { getDb } = await import(join(CWD, 'src/lib/db/client.ts'));
    const db = getDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Default Boat', landingName: 'Test Landing' });

    // 10 rows for "1/2 Day AM", 2 rows for "Full Day"
    const halfDayDates = [
      '2024-06-01','2024-06-02','2024-06-03','2024-06-04','2024-06-05',
      '2024-06-06','2024-06-07','2024-06-08','2024-06-09','2024-06-10'
    ];
    for (const date of halfDayDates) {
      seedTrip(db, { boatId, landingId, date, tripType: '1/2 Day AM', species: 'yellowtail', anglers: 10, count: 30 });
    }
    seedTrip(db, { boatId, landingId, date: '2024-07-01', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 40 });
    seedTrip(db, { boatId, landingId, date: '2024-07-02', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 40 });

    const { load } = await import(
      join(CWD, 'src/routes/picker/+page.server.ts')
    );
    // No tripType in URL → guidance state, but filterOptions.defaultTripType should be populated
    const event = fakeEvent('http://localhost/picker');
    const result = await load(event);

    expect(result.filterOptions.defaultTripType).toBe('1/2 Day AM');
  });

  // ---------------------------------------------------------------------------
  // Test 9: defaultTripType on empty DB → null
  // ---------------------------------------------------------------------------
  it('defaultTripType on empty DB returns null', async () => {
    const { load } = await import(
      join(CWD, 'src/routes/picker/+page.server.ts')
    );
    const event = fakeEvent('http://localhost/picker');
    const result = await load(event);

    expect(result.filterOptions.defaultTripType).toBeNull();
  });
});
