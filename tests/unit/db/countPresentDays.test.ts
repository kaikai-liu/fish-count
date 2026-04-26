// tests/unit/db/countPresentDays.test.ts
// Phase 3 (D-24): count of input dates with outcome IN ('success','empty').
// Days with killed/http_error/parse_error OR no scrape_runs row at all are NOT counted.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import { recordOutcome, countPresentDays } from '../../../src/lib/db/scrapeRuns';

describe('scrapeRuns.countPresentDays (D-24 gap-day accounting)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('returns 0 for empty input array (no SQL run)', () => {
    db = openTestDb();
    expect(countPresentDays(db, [])).toBe(0);
  });

  it('counts dates with outcome=success', () => {
    db = openTestDb();
    recordOutcome(db, {
      runId: 'r1',
      runDate: '2024-05-10',
      startedAt: 'x',
      finishedAt: 'x',
      outcome: 'success',
      rowsIngested: 10
    });
    recordOutcome(db, {
      runId: 'r2',
      runDate: '2024-05-11',
      startedAt: 'x',
      finishedAt: 'x',
      outcome: 'success',
      rowsIngested: 20
    });
    expect(
      countPresentDays(db, ['2024-05-10', '2024-05-11', '2024-05-12'])
    ).toBe(2);
  });

  it('counts dates with outcome=empty', () => {
    db = openTestDb();
    recordOutcome(db, {
      runId: 'r1',
      runDate: '2024-05-10',
      startedAt: 'x',
      finishedAt: 'x',
      outcome: 'empty',
      rowsIngested: 0
    });
    expect(countPresentDays(db, ['2024-05-10'])).toBe(1);
  });

  it('excludes outcome=killed / http_error / parse_error', () => {
    db = openTestDb();
    recordOutcome(db, {
      runId: 'r1',
      runDate: '2024-05-10',
      startedAt: 'x',
      finishedAt: 'x',
      outcome: 'killed',
      rowsIngested: 0
    });
    recordOutcome(db, {
      runId: 'r2',
      runDate: '2024-05-11',
      startedAt: 'x',
      finishedAt: 'x',
      outcome: 'http_error',
      rowsIngested: 0
    });
    recordOutcome(db, {
      runId: 'r3',
      runDate: '2024-05-12',
      startedAt: 'x',
      finishedAt: 'x',
      outcome: 'parse_error',
      rowsIngested: 0
    });
    expect(
      countPresentDays(db, ['2024-05-10', '2024-05-11', '2024-05-12'])
    ).toBe(0);
  });

  it('absent dates count as 0 (no scrape_runs row)', () => {
    db = openTestDb();
    expect(
      countPresentDays(db, ['2024-05-10', '2024-05-11', '2024-05-12'])
    ).toBe(0);
  });

  it('counts a date with multiple runs once (DISTINCT)', () => {
    db = openTestDb();
    recordOutcome(db, {
      runId: 'r1',
      runDate: '2024-05-10',
      startedAt: 'x',
      finishedAt: 'x',
      outcome: 'http_error',
      rowsIngested: 0
    });
    // Retry succeeded same date.
    recordOutcome(db, {
      runId: 'r2',
      runDate: '2024-05-10',
      startedAt: 'x',
      finishedAt: 'x',
      outcome: 'success',
      rowsIngested: 5
    });
    expect(countPresentDays(db, ['2024-05-10'])).toBe(1);
  });
});
