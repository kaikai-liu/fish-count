// tests/unit/db/scrapeRuns.test.ts
// D-04: scrape_runs ledger — record + SLA baseline + resume query.
// Also locks D-12 resume semantics and D-23 baseline-exclusion logic.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import * as scrapeRuns from '../../../src/lib/db/scrapeRuns';
import type { ScrapeOutcome } from '../../../src/lib/db/scrapeRuns';

function seed(
  db: Database.Database,
  runDate: string,
  outcome: ScrapeOutcome,
  rowsIngested: number
): void {
  scrapeRuns.recordOutcome(db, {
    runId: `run-${runDate}-${outcome}`,
    runDate,
    startedAt: `${runDate}T23:00:00Z`,
    finishedAt: `${runDate}T23:05:00Z`,
    outcome,
    rowsIngested
  });
}

describe('scrapeRuns repository (D-04, D-12, D-23..D-25)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  describe('recordOutcome — ledger durability (invariant 6)', () => {
    it('writes exactly one row per invocation', () => {
      db = openTestDb();
      scrapeRuns.recordOutcome(db, {
        runId: 'run-123',
        runDate: '2026-04-23',
        startedAt: '2026-04-23T23:00:00Z',
        finishedAt: '2026-04-23T23:05:00Z',
        outcome: 'killed',
        rowsIngested: 0
      });
      const count = db.prepare(`SELECT COUNT(*) AS c FROM scrape_runs`).get() as { c: number };
      expect(count.c).toBe(1);
    });

    it('accepts each of the five outcomes (STO-05)', () => {
      db = openTestDb();
      const outcomes: ScrapeOutcome[] = [
        'success',
        'empty',
        'http_error',
        'parse_error',
        'killed'
      ];
      for (const [i, o] of outcomes.entries()) {
        seed(db, `2026-04-${10 + i}`, o, o === 'success' ? 100 : 0);
      }
      const count = db.prepare(`SELECT COUNT(*) AS c FROM scrape_runs`).get() as { c: number };
      expect(count.c).toBe(outcomes.length);
    });

    it('stores error_message when provided', () => {
      db = openTestDb();
      scrapeRuns.recordOutcome(db, {
        runId: 'run-err',
        runDate: '2026-04-23',
        startedAt: '2026-04-23T23:00:00Z',
        finishedAt: '2026-04-23T23:00:05Z',
        outcome: 'http_error',
        rowsIngested: 0,
        errorMessage: 'HTTP 503 Service Unavailable'
      });
      const row = db
        .prepare(`SELECT outcome, error_message FROM scrape_runs WHERE run_id = ?`)
        .get('run-err') as { outcome: string; error_message: string };
      expect(row.outcome).toBe('http_error');
      expect(row.error_message).toBe('HTTP 503 Service Unavailable');
    });
  });

  describe('computeSlaBaseline — D-23 baseline semantics', () => {
    it('averages rows_ingested over success rows in [today-7, today-1]', () => {
      db = openTestDb();
      // Seed 4 successful rows + assorted non-success rows in the window
      seed(db, '2026-04-16', 'success', 100);
      seed(db, '2026-04-17', 'success', 120);
      seed(db, '2026-04-18', 'success', 90);
      seed(db, '2026-04-19', 'success', 110);
      seed(db, '2026-04-20', 'empty', 0);
      seed(db, '2026-04-21', 'http_error', 0);
      seed(db, '2026-04-22', 'killed', 0);
      const baseline = scrapeRuns.computeSlaBaseline(db, '2026-04-23');
      expect(baseline).toBeCloseTo((100 + 120 + 90 + 110) / 4, 5); // 105
    });

    it('excludes outcomes other than success from the denominator (D-23)', () => {
      db = openTestDb();
      seed(db, '2026-04-20', 'success', 50);
      seed(db, '2026-04-21', 'empty', 9999); // big empty row — must not poison baseline
      seed(db, '2026-04-22', 'parse_error', 9999);
      const baseline = scrapeRuns.computeSlaBaseline(db, '2026-04-23');
      expect(baseline).toBe(50);
    });

    it('excludes "today" itself from the window', () => {
      db = openTestDb();
      seed(db, '2026-04-22', 'success', 100); // yesterday — included
      seed(db, '2026-04-23', 'success', 9999); // today — MUST be excluded per D-23
      const baseline = scrapeRuns.computeSlaBaseline(db, '2026-04-23');
      expect(baseline).toBe(100);
    });

    it('excludes rows older than today-7', () => {
      db = openTestDb();
      seed(db, '2026-04-15', 'success', 9999); // today-8 — MUST be excluded
      seed(db, '2026-04-16', 'success', 100); // today-7 — INCLUDED
      const baseline = scrapeRuns.computeSlaBaseline(db, '2026-04-23');
      expect(baseline).toBe(100);
    });

    it('returns null when no success rows are in the window', () => {
      db = openTestDb();
      seed(db, '2026-04-22', 'empty', 0);
      const baseline = scrapeRuns.computeSlaBaseline(db, '2026-04-23');
      expect(baseline).toBeNull();
    });
  });

  describe('getDatesToScrape — D-12 resume semantics', () => {
    it('returns every date in range when ledger is empty', () => {
      db = openTestDb();
      const dates = scrapeRuns.getDatesToScrape(db, {
        from: '2026-04-10',
        to: '2026-04-13'
      });
      expect(dates).toEqual(['2026-04-10', '2026-04-11', '2026-04-12', '2026-04-13']);
    });

    it('skips success + empty; retries http_error + parse_error + killed; enqueues unattempted', () => {
      db = openTestDb();
      seed(db, '2026-04-10', 'success', 100);
      seed(db, '2026-04-11', 'empty', 0);
      seed(db, '2026-04-12', 'http_error', 0);
      seed(db, '2026-04-13', 'parse_error', 0);
      seed(db, '2026-04-14', 'killed', 0);
      // 2026-04-15, 2026-04-16 have no ledger → enqueued as new work.
      const dates = scrapeRuns.getDatesToScrape(db, {
        from: '2026-04-10',
        to: '2026-04-16'
      });
      expect(dates).toEqual([
        '2026-04-12',
        '2026-04-13',
        '2026-04-14',
        '2026-04-15',
        '2026-04-16'
      ]);
    });

    it('uses the LATEST outcome per date (retry-then-success means skip)', () => {
      db = openTestDb();
      // First attempt errored, second succeeded — per D-12 we should skip.
      seed(db, '2026-04-10', 'http_error', 0);
      seed(db, '2026-04-10', 'success', 87);
      const dates = scrapeRuns.getDatesToScrape(db, {
        from: '2026-04-10',
        to: '2026-04-10'
      });
      expect(dates).toEqual([]);
    });

    it('returns every date when resume=false (force full-range scrape)', () => {
      db = openTestDb();
      seed(db, '2026-04-10', 'success', 100);
      seed(db, '2026-04-11', 'success', 120);
      const dates = scrapeRuns.getDatesToScrape(db, {
        from: '2026-04-10',
        to: '2026-04-12',
        resume: false
      });
      expect(dates).toEqual(['2026-04-10', '2026-04-11', '2026-04-12']);
    });

    it('handles single-date range', () => {
      db = openTestDb();
      const dates = scrapeRuns.getDatesToScrape(db, {
        from: '2026-04-10',
        to: '2026-04-10'
      });
      expect(dates).toEqual(['2026-04-10']);
    });
  });
});
