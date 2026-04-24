// tests/unit/scraper/end-to-end.test.ts
// Plan 01-09 Task 2 — Phase 1 end-to-end integration (the "I trust this phase"
// gate). Drives the CLI main() through the real pipeline against stubbed
// fetch + committed HTML fixtures, and asserts measurable DB outcomes:
//
//   Scenario 1: 3-date backfill → 3 success ledger rows + catch_reports populated
//   Scenario 2: Re-run same range → D-12 resume skips all dates (zero boats.php fetches)
//   Scenario 3: Mixed [200, 503-always, 200] → outcomes={success:2, http_error:1}
//
// No mocks of internal behavior — only globalThis.fetch is stubbed. Every hop
// (CLI argv parsing → getDatesToScrape → scrapeDate → gates → sourceQueue →
// fetcher → snapshot → parser → DAL upserts → scrape_runs ledger) runs live.
//
// Test-isolation pattern copied verbatim from
// tests/unit/scripts/backfill.test.ts:
//   - per-test tmpdir for DB + snapshots + lock
//   - vi.resetModules() before import so DB_PATH singleton rebinds
//   - closeDb() in afterEach
//   - env + argv saved/restored
//
// Timing notes (ING-03 5s rate-limit floor is REAL in this test):
//   - Scenario 1: 3 fetches, ≥5s between starts → ~10-15s wall clock
//   - Scenario 2: run 1 (~12s) + run 2 (0 fetches, <1s) → ~15s total
//   - Scenario 3: 1 success + 4 retry attempts (p-retry 1s/2s/4s backoff +
//                 randomize jitter) + 1 success, with 5s queue floor between
//                 each fetch start → ~20-35s
// Timeouts are generous (20s / 30s / 60s respectively) to tolerate CI jitter.
//
// DAL-boundary note: this file is under tests/, which dal-boundary.test.ts
// does NOT scan. The inline SELECT below is allowed per invariant 2.
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

const BACKFILL_SCRIPT_PATH = join(process.cwd(), 'scripts', 'backfill.ts');

describe('Phase 1 end-to-end integration (CLI → pipeline → DAL)', () => {
  let tmp: string;
  let originalEnv: Record<string, string | undefined>;
  let originalArgv: string[];

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fc-e2e-'));
    originalEnv = {
      FIRST_SCRAPE_OK: process.env.FIRST_SCRAPE_OK,
      SCRAPER_ENABLED: process.env.SCRAPER_ENABLED,
      DB_PATH: process.env.DB_PATH,
      SNAPSHOT_DIR: process.env.SNAPSHOT_DIR,
      SCRAPE_LOCK_PATH: process.env.SCRAPE_LOCK_PATH
    };
    process.env.FIRST_SCRAPE_OK = 'true';
    process.env.SCRAPER_ENABLED = 'true';
    process.env.DB_PATH = join(tmp, 'e2e.sqlite3');
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
    // argv[1] intentionally not pointing at backfill.ts so the self-invocation
    // guard inside the CLI evaluates to FALSE when we import it from a test.
    process.argv = ['node', 'vitest', ...args];
  }

  it(
    'scenario 1: 3-date backfill → 3 success ledger rows + catch_reports populated',
    async () => {
      setArgv('--from', '2024-08-13', '--to', '2024-08-15', '--quiet');
      stubFetch([{ body: TYPICAL }, { body: TYPICAL }, { body: TYPICAL }]);

      const { main } = await import(BACKFILL_SCRIPT_PATH);
      const code = await main();
      expect(code).toBe(0);

      const { getDb } = await import('../../../src/lib/db/client');
      const db = getDb();

      const ledgerSuccess = (
        db
          .prepare(
            "SELECT COUNT(*) as c FROM scrape_runs WHERE outcome = 'success'"
          )
          .get() as { c: number }
      ).c;
      expect(ledgerSuccess).toBe(3);

      const reportCount = (
        db.prepare('SELECT COUNT(*) as c FROM catch_reports').get() as {
          c: number;
        }
      ).c;
      expect(reportCount).toBeGreaterThan(0);

      // All three dates should appear in the catch_reports table.
      const datesPresent = db
        .prepare(
          'SELECT DISTINCT source_date FROM catch_reports ORDER BY source_date'
        )
        .all() as Array<{ source_date: string }>;
      expect(datesPresent.map((r) => r.source_date)).toEqual([
        '2024-08-13',
        '2024-08-14',
        '2024-08-15'
      ]);
    },
    20_000
  );

  it(
    'scenario 2: re-running same range → D-12 resume skips all dates (zero boats.php fetches)',
    async () => {
      // --- Run 1: seed the ledger with 3 success rows ---
      setArgv('--from', '2024-08-13', '--to', '2024-08-15', '--quiet');
      stubFetch([{ body: TYPICAL }, { body: TYPICAL }, { body: TYPICAL }]);
      const { main } = await import(BACKFILL_SCRIPT_PATH);
      const code1 = await main();
      expect(code1).toBe(0);

      // Sanity: run 1 produced 3 success rows (so run 2 has something to skip).
      const { getDb } = await import('../../../src/lib/db/client');
      const reportCountAfterRun1 = (
        getDb().prepare('SELECT COUNT(*) as c FROM catch_reports').get() as {
          c: number;
        }
      ).c;
      expect(reportCountAfterRun1).toBeGreaterThan(0);

      // Close DB + reset modules so run 2 starts from a fresh module graph
      // against the same on-disk state. D-12 resume reads scrape_runs from
      // disk and must conclude "nothing to do".
      const { closeDb } = await import('../../../src/lib/db/client');
      closeDb();
      vi.resetModules();

      // --- Run 2: identical args; expect zero boats.php fetches ---
      restoreFetch();
      const fetchMock2 = stubFetch({ body: TYPICAL });
      setArgv('--from', '2024-08-13', '--to', '2024-08-15', '--quiet');
      const { main: main2 } = await import(BACKFILL_SCRIPT_PATH);
      const code2 = await main2();
      expect(code2).toBe(0);

      const boatsFetches = fetchMock2.mock.calls.filter((c) =>
        String(c[0]).includes('boats.php')
      );
      expect(boatsFetches).toHaveLength(0);

      // Report count unchanged — nothing was re-ingested.
      const reportCountAfterRun2 = (
        getDb().prepare('SELECT COUNT(*) as c FROM catch_reports').get() as {
          c: number;
        }
      ).c;
      expect(reportCountAfterRun2).toBe(reportCountAfterRun1);
    },
    30_000
  );

  it(
    'scenario 3: mixed success + http_error → ledger records 2 success + 1 http_error',
    async () => {
      setArgv('--from', '2024-08-13', '--to', '2024-08-15', '--quiet');
      // IMPORTANT: the FIRST outbound fetch on a fresh module graph is always
      // `/robots.txt` (per src/lib/scraper/robots.ts — cached 24h, but the
      // cache is empty here because vi.resetModules() in beforeEach rebinds
      // the module). We give it an empty-body 200 so robots-parser allows
      // all URLs. Then the queue pairs with the actual boats.php fetches.
      //
      // Planned fetch sequence:
      //   1. /robots.txt            → { status: 200, body: '' }
      //   2. boats.php?date=2024-08-13 (date #1) → TYPICAL → success
      //   3. boats.php?date=2024-08-14 (date #2, attempt 1) → 503
      //   4. retry attempt 2 → 503
      //   5. retry attempt 3 → 503
      //   6. retry attempt 4 → 503 → p-retry gives up → outcome=http_error
      //   7. boats.php?date=2024-08-15 (date #3) → TYPICAL (fallback sticky)
      //                                             → success
      const responses = [
        { status: 200, body: '' }, // 1. /robots.txt — allow all
        { body: TYPICAL }, // 2. 2024-08-13 success
        { status: 503, body: 'server error' }, // 3. 2024-08-14 attempt 1
        { status: 503, body: 'server error' }, // 4. attempt 2
        { status: 503, body: 'server error' }, // 5. attempt 3
        { status: 503, body: 'server error' }, // 6. attempt 4 → give up
        { body: TYPICAL } // 7. 2024-08-15 success (also the
        //    sticky fallback if any extra
        //    fetch slips through)
      ];
      stubFetch(responses);

      const { main } = await import(BACKFILL_SCRIPT_PATH);
      const code = await main();
      // CLI treats http_error as non-halting per Plan 01-06 design (only
      // outcome='killed' halts the loop; http_error continues to next date).
      expect(code).toBe(0);

      const { getDb } = await import('../../../src/lib/db/client');
      const byOutcome = getDb()
        .prepare(
          'SELECT outcome, COUNT(*) as c FROM scrape_runs GROUP BY outcome'
        )
        .all() as Array<{ outcome: string; c: number }>;
      const asMap = Object.fromEntries(byOutcome.map((r) => [r.outcome, r.c]));

      expect(asMap['success']).toBe(2);
      expect(asMap['http_error']).toBe(1);

      // The errored date is the MIDDLE date — 2024-08-14.
      const errRow = getDb()
        .prepare(
          "SELECT run_date FROM scrape_runs WHERE outcome = 'http_error'"
        )
        .get() as { run_date: string } | undefined;
      expect(errRow?.run_date).toBe('2024-08-14');
    },
    60_000
  );
});
