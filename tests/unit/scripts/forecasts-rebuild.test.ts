// tests/unit/scripts/forecasts-rebuild.test.ts
// Smoke tests for the forecasts-rebuild CLI — verifies parseArgs handling and
// successful main() exit code on a seeded test DB.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('scripts/forecasts-rebuild.ts (D-18)', () => {
  let tmp: string;
  let originalDbPath: string | undefined;

  beforeEach(() => {
    originalDbPath = process.env.DB_PATH;
    tmp = mkdtempSync(join(tmpdir(), 'fc-forecasts-rebuild-'));
    process.env.DB_PATH = join(tmp, 'test.sqlite3');
    vi.resetModules();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      const { closeDb } = await import('../../../src/lib/db/client');
      closeDb();
    } catch {
      /* ignore */
    }
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    if (originalDbPath !== undefined) {
      process.env.DB_PATH = originalDbPath;
    } else {
      delete process.env.DB_PATH;
    }
  });

  it('main() with --help returns 0 and prints usage', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { main } = await import('../../../scripts/forecasts-rebuild');
    const code = await main(['--help']);
    expect(code).toBe(0);
    const allLog = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allLog).toMatch(/Usage:/);
  });

  it('main() with bad arg returns exit code 2', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { main } = await import('../../../scripts/forecasts-rebuild');
    // strict parseArgs rejects unknown flags
    const code = await main(['--bogus-flag']);
    expect(code).toBe(2);
  });

  it('main() runs end-to-end on an empty DB and returns 0 (idempotent no-data case)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { main } = await import('../../../scripts/forecasts-rebuild');
    const code = await main(['--quiet']);
    expect(code).toBe(0);
  });

  it('main() runs end-to-end on a seeded DB and writes forecast rows', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { getDb } = await import('../../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../../helpers/seedTestDb');
    const db = getDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    // Seed 5 prior-year trips on the same calendar slot so n>=5 cells get values.
    for (let i = 0; i < 5; i++) {
      seedTrip(db, {
        boatId,
        landingId,
        date: `2024-05-${10 + i}`,
        tripType: 'Full Day',
        species: 'yellowtail',
        anglers: 20,
        count: 30
      });
    }

    const { main } = await import('../../../scripts/forecasts-rebuild');
    const code = await main(['--quiet']);
    expect(code).toBe(0);

    const total = db.prepare('SELECT COUNT(*) AS c FROM forecasts').get() as {
      c: number;
    };
    expect(total.c).toBeGreaterThan(0);
  });
});
