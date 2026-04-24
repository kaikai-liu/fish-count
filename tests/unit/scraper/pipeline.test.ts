// tests/unit/scraper/pipeline.test.ts
// Plan 01-05 Task 3 — pipeline integration test exercising the 7 load-bearing
// invariants from 01-RESEARCH.md §Validation Architecture:
//   1. Idempotency on (source_date, boat_id, trip_type, species)
//   5. Quarantine on parse failure (valid rows still ingested)
//   6. Exactly one scrape_runs row per scrapeDate invocation
//   7. FIRST_SCRAPE_OK unset → fetch never called, outcome='killed'
//   8. SCRAPER_ENABLED='false' → fetch never called, outcome='killed'
//   + Success path (typical fixture → outcome='success')
//   + Empty-day path (outcome='empty')
//
// Test isolation strategy:
//   - Each test runs against its own tmpdir (tmpdir/scrape.sqlite3 + snapshots/)
//   - vi.resetModules() before each test so env-dependent module caches reset
//   - DB singleton explicitly closed in afterEach to free the on-disk file
//
// DAL-boundary note: this test uses raw SQL to count ledger rows (test
// inspection only). The dal-boundary.test.ts scan covers src/ and scripts/,
// not tests/, so test-internal SQL is allowed per invariant 2.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubFetch, restoreFetch } from '../../helpers/fetch-stub';

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'scraper');
const TYPICAL = readFileSync(join(FIXTURE_DIR, '2024-08-15-typical.html'), 'utf8');
const EMPTY = readFileSync(join(FIXTURE_DIR, '2026-12-25-empty-day.html'), 'utf8');
const MANGLED = readFileSync(join(FIXTURE_DIR, 'parse-edge-mangled.html'), 'utf8');

describe('scrapeDate pipeline (integration)', () => {
  let tmp: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fc-pipe-'));
    originalEnv = {
      FIRST_SCRAPE_OK: process.env.FIRST_SCRAPE_OK,
      SCRAPER_ENABLED: process.env.SCRAPER_ENABLED,
      DB_PATH: process.env.DB_PATH,
      SNAPSHOT_DIR: process.env.SNAPSHOT_DIR,
      SCRAPE_LOCK_PATH: process.env.SCRAPE_LOCK_PATH
    };
    process.env.DB_PATH = join(tmp, 'test.sqlite3');
    process.env.SNAPSHOT_DIR = join(tmp, 'snapshots');
    process.env.SCRAPE_LOCK_PATH = join(tmp, 'scrape.lock');
    vi.resetModules();
  });

  afterEach(async () => {
    restoreFetch();
    try {
      const { closeDb } = await import('../../../src/lib/db/client');
      closeDb();
    } catch {
      // ignore — module may not have been imported in this test
    }
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(tmp, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('invariant 7: FIRST_SCRAPE_OK unset → fetch never called, outcome=killed', async () => {
    delete process.env.FIRST_SCRAPE_OK;
    process.env.SCRAPER_ENABLED = 'true';
    const fetchMock = stubFetch({ body: TYPICAL });

    const { scrapeDate } = await import('../../../src/lib/scraper/pipeline');
    const result = await scrapeDate('2024-08-15', 'cli');

    expect(result.outcome).toBe('killed');
    expect(result.errorMessage).toMatch(/FIRST_SCRAPE_OK/);
    const boatsFetches = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('boats.php')
    );
    expect(boatsFetches).toHaveLength(0);
  });

  it('invariant 8: SCRAPER_ENABLED=false → fetch never called, outcome=killed', async () => {
    process.env.FIRST_SCRAPE_OK = 'true';
    process.env.SCRAPER_ENABLED = 'false';
    const fetchMock = stubFetch({ body: TYPICAL });

    const { scrapeDate } = await import('../../../src/lib/scraper/pipeline');
    const result = await scrapeDate('2024-08-15', 'cli');

    expect(result.outcome).toBe('killed');
    expect(result.errorMessage).toMatch(/SCRAPER_ENABLED/);
    const boatsFetches = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('boats.php')
    );
    expect(boatsFetches).toHaveLength(0);
  });

  it('both gates open → typical fixture → outcome=success, rows ingested, snapshot written', async () => {
    process.env.FIRST_SCRAPE_OK = 'true';
    process.env.SCRAPER_ENABLED = 'true';
    stubFetch({ body: TYPICAL });

    const { scrapeDate } = await import('../../../src/lib/scraper/pipeline');
    const { snapshotPathFor } = await import('../../../src/lib/scraper/snapshot');
    const result = await scrapeDate('2024-08-15', 'cli');

    expect(result.outcome).toBe('success');
    expect(result.rowsIngested).toBeGreaterThan(0);
    // D-17: snapshot written BEFORE parse, so even if rows were 0 the file
    // would be present. Here we also assert >0 rows so both paths green.
    expect(existsSync(snapshotPathFor('2024-08-15'))).toBe(true);
  });

  it(
    'invariant 1: idempotent — running twice produces same catch_reports row count',
    async () => {
      process.env.FIRST_SCRAPE_OK = 'true';
      process.env.SCRAPER_ENABLED = 'true';
      // Two sequential fetches both return the same fixture — simulates the
      // scheduler re-running a date. ON CONFLICT DO UPDATE makes this a no-op
      // at the data-content level.
      stubFetch([{ body: TYPICAL }, { body: TYPICAL }]);

      const { scrapeDate } = await import('../../../src/lib/scraper/pipeline');
      const { totalRowsForDate } = await import(
        '../../../src/lib/db/catchReports'
      );
      const { getDb } = await import('../../../src/lib/db/client');

      const r1 = await scrapeDate('2024-08-15', 'cli');
      const countAfter1 = totalRowsForDate(getDb(), '2024-08-15');

      // The shared sourceQueue enforces ≥5s between source-site fetches
      // (ING-03 polite scraping). This test makes TWO outbound fetches back
      // to back; the second must wait. Bump the test timeout to 15s so the
      // 5s floor doesn't mask the assertion.
      const r2 = await scrapeDate('2024-08-15', 'cli');
      const countAfter2 = totalRowsForDate(getDb(), '2024-08-15');

      expect(r1.outcome).toBe('success');
      expect(r2.outcome).toBe('success');
      expect(countAfter1).toBeGreaterThan(0);
      expect(countAfter2).toBe(countAfter1);
    },
    15_000
  );

  it('empty-day fixture → outcome=empty, rows_ingested=0', async () => {
    process.env.FIRST_SCRAPE_OK = 'true';
    process.env.SCRAPER_ENABLED = 'true';
    stubFetch({ body: EMPTY });

    const { scrapeDate } = await import('../../../src/lib/scraper/pipeline');
    const result = await scrapeDate('2026-12-25', 'cli');

    expect(result.outcome).toBe('empty');
    expect(result.rowsIngested).toBe(0);
  });

  it('invariant 5: mangled fixture → parse_failures rows written, valid rows still ingested', async () => {
    process.env.FIRST_SCRAPE_OK = 'true';
    process.env.SCRAPER_ENABLED = 'true';
    stubFetch({ body: MANGLED });

    const { scrapeDate } = await import('../../../src/lib/scraper/pipeline');
    const { getByRunId } = await import('../../../src/lib/db/parseFailures');
    const { getDb } = await import('../../../src/lib/db/client');

    const result = await scrapeDate('2024-08-15', 'cli');
    // Mangled fixture has one valid row (Grande, 2 species fragments) plus
    // one shape-invalid row → outcome='success' because valid rows > 0.
    expect(result.outcome).toBe('success');
    expect(result.rowsIngested).toBeGreaterThanOrEqual(1);
    const failures = getByRunId(getDb(), result.runId);
    expect(failures.length).toBeGreaterThanOrEqual(1);
  });

  it('invariant 6: every invocation writes exactly ONE scrape_runs row', async () => {
    process.env.FIRST_SCRAPE_OK = 'true';
    process.env.SCRAPER_ENABLED = 'true';
    stubFetch({ body: TYPICAL });

    const { scrapeDate } = await import('../../../src/lib/scraper/pipeline');
    const { getDb } = await import('../../../src/lib/db/client');

    const before = (
      getDb().prepare('SELECT COUNT(*) as c FROM scrape_runs').get() as { c: number }
    ).c;
    await scrapeDate('2024-08-15', 'cli');
    const after = (
      getDb().prepare('SELECT COUNT(*) as c FROM scrape_runs').get() as { c: number }
    ).c;

    expect(after - before).toBe(1);
  });

  it('invariant 6 (gated path): killed outcome also writes exactly ONE scrape_runs row', async () => {
    delete process.env.FIRST_SCRAPE_OK;
    process.env.SCRAPER_ENABLED = 'true';
    stubFetch({ body: TYPICAL });

    const { scrapeDate } = await import('../../../src/lib/scraper/pipeline');
    const { getDb } = await import('../../../src/lib/db/client');

    const before = (
      getDb().prepare('SELECT COUNT(*) as c FROM scrape_runs').get() as { c: number }
    ).c;
    const result = await scrapeDate('2024-08-15', 'cli');
    const after = (
      getDb().prepare('SELECT COUNT(*) as c FROM scrape_runs').get() as { c: number }
    ).c;

    expect(result.outcome).toBe('killed');
    expect(after - before).toBe(1);
  });
});
