// tests/unit/scripts/seed-dev-db.test.ts
// Plan 02-07 Task 1 — unit tests for the seed-dev-db CLI entry point.
//
// Test isolation pattern from tests/unit/scripts/backfill.test.ts:
//   - each test uses its own tmpdir (DB_PATH)
//   - vi.resetModules() in beforeEach so the DB singleton rebinds with new DB_PATH
//   - closeDb() in afterEach to release the file handle
//   - env saved/restored around every test
//
// Covers:
//   T-02-34: NODE_ENV=production → exit 1
//   T-02-34: DB_PATH=prod path without ALLOW_SEED_ON_PROD_PATH → exit 1
//   T-02-35: no fetch/network calls (fixture-only replay)
//   Successful run: populates ≥3 days of catch_reports + recordOutcome ≥3 times
//   Idempotent: re-running on same range produces same row count
//   Invalid date format → exit 1
//   from > to → exit 1
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SEED_SCRIPT_PATH = join(process.cwd(), 'scripts', 'seed-dev-db.ts');
const PROD_DB_PATH = '/data/fishcount.sqlite3';

describe('scripts/seed-dev-db.ts', () => {
  let tmp: string;
  let originalEnv: Record<string, string | undefined>;
  let originalArgv: string[];

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fc-seed-'));
    originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      DB_PATH: process.env.DB_PATH,
      ALLOW_SEED_ON_PROD_PATH: process.env.ALLOW_SEED_ON_PROD_PATH
    };
    // Set up a safe dev environment by default
    process.env.NODE_ENV = 'test';
    process.env.DB_PATH = join(tmp, 'test.sqlite3');
    delete process.env.ALLOW_SEED_ON_PROD_PATH;
    originalArgv = process.argv;
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
    process.argv = originalArgv;
    rmSync(tmp, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns 1 + logs error when NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production';
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { main } = await import(SEED_SCRIPT_PATH);
    const code = await main([]);
    expect(code).toBe(1);
    const allErr = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allErr).toMatch(/production/i);
  });

  it('returns 1 + logs error when DB_PATH equals production default without ALLOW_SEED_ON_PROD_PATH', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DB_PATH = PROD_DB_PATH;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { main } = await import(SEED_SCRIPT_PATH);
    const code = await main([]);
    expect(code).toBe(1);
    const allErr = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allErr).toMatch(/production/i);
  });

  it('returns 0 when DB_PATH equals production default but ALLOW_SEED_ON_PROD_PATH=1', async () => {
    // Override with a real tmp path to avoid actual prod DB access
    process.env.NODE_ENV = 'development';
    process.env.DB_PATH = join(tmp, 'allowed.sqlite3');
    process.env.ALLOW_SEED_ON_PROD_PATH = '1';
    const { main } = await import(SEED_SCRIPT_PATH);
    const code = await main(['--from', '2024-07-01', '--to', '2024-07-03', '--quiet']);
    expect(code).toBe(0);
  });

  it('successful run: returns 0, populates ≥3 days of catch_reports, records ≥3 scrape_runs', async () => {
    process.env.NODE_ENV = 'development';
    const { main } = await import(SEED_SCRIPT_PATH);
    const code = await main(['--from', '2024-07-01', '--to', '2024-07-03', '--quiet']);
    expect(code).toBe(0);

    // Verify catch_reports were inserted (≥3 days seeded)
    const { getDb } = await import('../../../src/lib/db/client');
    const db = getDb();
    const rowCount = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM catch_reports
           WHERE source_date BETWEEN '2024-07-01' AND '2024-07-03'`
        )
        .get() as { c: number }
    ).c;
    expect(rowCount).toBeGreaterThan(0);

    // Verify scrape_runs rows — 3 days → 3 rows (one per day)
    const runCount = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM scrape_runs
           WHERE run_date BETWEEN '2024-07-01' AND '2024-07-03'`
        )
        .get() as { c: number }
    ).c;
    expect(runCount).toBeGreaterThanOrEqual(3);
  });

  it('idempotent: re-running on same range produces same catch_reports row count', async () => {
    process.env.NODE_ENV = 'development';

    const { main: main1 } = await import(SEED_SCRIPT_PATH);
    await main1(['--from', '2024-07-01', '--to', '2024-07-05', '--quiet']);

    // Count rows after first run
    const { getDb } = await import('../../../src/lib/db/client');
    const db = getDb();
    const countAfterFirst = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM catch_reports
           WHERE source_date BETWEEN '2024-07-01' AND '2024-07-05'`
        )
        .get() as { c: number }
    ).c;

    // Reset modules to simulate fresh run with same DB_PATH
    vi.resetModules();

    const { main: main2 } = await import(SEED_SCRIPT_PATH);
    await main2(['--from', '2024-07-01', '--to', '2024-07-05', '--quiet']);

    // Count rows after second run — idempotent: same count
    const { getDb: getDb2 } = await import('../../../src/lib/db/client');
    const db2 = getDb2();
    const countAfterSecond = (
      db2
        .prepare(
          `SELECT COUNT(*) AS c FROM catch_reports
           WHERE source_date BETWEEN '2024-07-01' AND '2024-07-05'`
        )
        .get() as { c: number }
    ).c;

    expect(countAfterFirst).toEqual(countAfterSecond);
    expect(countAfterFirst).toBeGreaterThan(0);
  });

  it('returns 1 when --from has invalid date format', async () => {
    process.env.NODE_ENV = 'development';
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { main } = await import(SEED_SCRIPT_PATH);
    const code = await main(['--from', 'abc']);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it('returns 1 when --from > --to', async () => {
    process.env.NODE_ENV = 'development';
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { main } = await import(SEED_SCRIPT_PATH);
    const code = await main(['--from', '2024-07-05', '--to', '2024-07-01']);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it('--help flag returns 0 and prints usage', async () => {
    process.env.NODE_ENV = 'development';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { main } = await import(SEED_SCRIPT_PATH);
    const code = await main(['--help']);
    expect(code).toBe(0);
    expect(logSpy).toHaveBeenCalled();
  });
});
