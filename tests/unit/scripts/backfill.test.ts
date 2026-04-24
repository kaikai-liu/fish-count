// tests/unit/scripts/backfill.test.ts
// Plan 01-06 Task 2 — integration test for the backfill CLI entry point.
//
// Covers:
//   - Arg validation (--from missing / --to missing / invalid date / from>to → exit 2)
//   - Valid run with typical fixture → exit 0, catch_reports populated
//   - D-12 resume semantics:
//       * prior outcome=success → date skipped (no fetch)
//       * prior outcome=http_error → date retried (fetch called)
//   - FIRST_SCRAPE_OK unset → halts with exit 1 (Invariant 7 surfaced via CLI)
//
// Test-isolation pattern borrowed verbatim from
// tests/unit/scraper/pipeline.test.ts (Plan 01-05):
//   - each test runs against its own tmpdir (DB + snapshots + lock)
//   - vi.resetModules() in beforeEach so the DB_PATH singleton rebinds
//   - closeDb() in afterEach to release the file handle
//   - env + argv saved/restored around every test
//
// DAL-boundary note: this file is under tests/, which dal-boundary.test.ts
// does NOT scan (it scans src/ + scripts/). The explicit SELECT below is
// allowed per invariant 2 (DAL boundary applies to production code only).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubFetch, restoreFetch } from '../../helpers/fetch-stub';

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'scraper');
const TYPICAL = readFileSync(
  join(FIXTURE_DIR, '2024-08-15-typical.html'),
  'utf8'
);

// Resolve absolute path to scripts/backfill.ts so the self-invocation guard
// inside the script (import.meta.url === file://argv[1]) evaluates to FALSE
// when the test imports it — process.argv[1] here is the vitest binary, not
// the backfill script.
const BACKFILL_SCRIPT_PATH = join(process.cwd(), 'scripts', 'backfill.ts');

describe('scripts/backfill.ts (ING-08 CLI)', () => {
  let tmp: string;
  let originalEnv: Record<string, string | undefined>;
  let originalArgv: string[];

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fc-bf-'));
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
    originalArgv = process.argv;
    vi.resetModules();
  });

  afterEach(async () => {
    restoreFetch();
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

  function setArgv(...args: string[]): void {
    // Leave argv[1] pointing at a non-script path so the self-invocation
    // guard inside backfill.ts evaluates to FALSE on import.
    process.argv = ['node', 'vitest', ...args];
  }

  it('missing --from → exits with code 2', async () => {
    setArgv('--to', '2024-08-15', '--quiet');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { main } = await import(BACKFILL_SCRIPT_PATH);
    const code = await main();
    expect(code).toBe(2);
    expect(errSpy).toHaveBeenCalled();
  });

  it('missing --to → exits with code 2', async () => {
    setArgv('--from', '2024-08-15', '--quiet');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { main } = await import(BACKFILL_SCRIPT_PATH);
    const code = await main();
    expect(code).toBe(2);
  });

  it('invalid date format → exits with code 2', async () => {
    setArgv('--from', 'not-a-date', '--to', '2024-08-15', '--quiet');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { main } = await import(BACKFILL_SCRIPT_PATH);
    const code = await main();
    expect(code).toBe(2);
    // Assert the helpful error message calls out the offending value.
    const allErr = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allErr).toMatch(/invalid date format/);
    expect(allErr).toMatch(/not-a-date/);
  });

  it('from > to → exits with code 2', async () => {
    setArgv('--from', '2024-08-20', '--to', '2024-08-15', '--quiet');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { main } = await import(BACKFILL_SCRIPT_PATH);
    const code = await main();
    expect(code).toBe(2);
    const allErr = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allErr).toMatch(/must be/);
  });

  it('valid run with typical fixture → exit 0, rows ingested', async () => {
    process.env.FIRST_SCRAPE_OK = 'true';
    process.env.SCRAPER_ENABLED = 'true';
    setArgv('--from', '2024-08-15', '--to', '2024-08-15', '--quiet');
    stubFetch({ body: TYPICAL });

    const { main } = await import(BACKFILL_SCRIPT_PATH);
    const { totalRowsForDate } = await import(
      '../../../src/lib/db/catchReports'
    );
    const { getDb } = await import('../../../src/lib/db/client');

    const code = await main();
    expect(code).toBe(0);
    expect(totalRowsForDate(getDb(), '2024-08-15')).toBeGreaterThan(0);
  });

  it('D-12 resume: date with outcome=success is skipped (no fetch)', async () => {
    process.env.FIRST_SCRAPE_OK = 'true';
    process.env.SCRAPER_ENABLED = 'true';

    // Pre-seed scrape_runs with a success outcome for the target date.
    const { getDb } = await import('../../../src/lib/db/client');
    const { recordOutcome } = await import(
      '../../../src/lib/db/scrapeRuns'
    );
    recordOutcome(getDb(), {
      runId: 'seed-success',
      runDate: '2024-08-15',
      startedAt: '2024-08-15T00:00:00Z',
      finishedAt: '2024-08-15T00:00:01Z',
      outcome: 'success',
      rowsIngested: 50
    });

    setArgv('--from', '2024-08-15', '--to', '2024-08-15', '--quiet');
    const fetchMock = stubFetch({ body: TYPICAL });
    const { main } = await import(BACKFILL_SCRIPT_PATH);

    const code = await main();
    expect(code).toBe(0);
    // No boats.php fetch should have happened — getDatesToScrape excluded
    // the date from the work list. (Other fetches such as robots.txt are
    // allowed — the filter ensures we only assert on the source endpoint.)
    const boatsFetches = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('boats.php')
    );
    expect(boatsFetches).toHaveLength(0);
  });

  it('D-12 resume: date with outcome=http_error is retried (fetch called)', async () => {
    process.env.FIRST_SCRAPE_OK = 'true';
    process.env.SCRAPER_ENABLED = 'true';

    const { getDb } = await import('../../../src/lib/db/client');
    const { recordOutcome } = await import(
      '../../../src/lib/db/scrapeRuns'
    );
    recordOutcome(getDb(), {
      runId: 'seed-err',
      runDate: '2024-08-15',
      startedAt: '2024-08-15T00:00:00Z',
      finishedAt: '2024-08-15T00:00:01Z',
      outcome: 'http_error',
      rowsIngested: 0,
      errorMessage: 'simulated 503'
    });

    setArgv('--from', '2024-08-15', '--to', '2024-08-15', '--quiet');
    const fetchMock = stubFetch({ body: TYPICAL });
    const { main } = await import(BACKFILL_SCRIPT_PATH);

    const code = await main();
    expect(code).toBe(0);
    const boatsFetches = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('boats.php')
    );
    expect(boatsFetches.length).toBeGreaterThanOrEqual(1);
  });

  it('FIRST_SCRAPE_OK unset → halts with exit 1 (outcome=killed)', async () => {
    delete process.env.FIRST_SCRAPE_OK;
    process.env.SCRAPER_ENABLED = 'true';
    setArgv('--from', '2024-08-15', '--to', '2024-08-15', '--quiet');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // No source fetch should happen — scrapeDate halts at Gate 1. Provide
    // a stub anyway so any accidental network call is safely captured.
    const fetchMock = stubFetch({ body: TYPICAL });

    const { main } = await import(BACKFILL_SCRIPT_PATH);
    const code = await main();

    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalled();
    const allErr = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allErr).toMatch(/halted/);
    // Invariant 7: no source fetch occurred.
    const boatsFetches = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('boats.php')
    );
    expect(boatsFetches).toHaveLength(0);
  });
});
