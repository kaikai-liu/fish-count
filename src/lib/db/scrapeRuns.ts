// src/lib/db/scrapeRuns.ts — DAL repository for the scrape_runs ledger.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Responsibilities:
//   D-04: single ledger table with outcome enum — record every scrape attempt.
//   D-12: resume query — dates to (re)scrape given a range and prior outcomes.
//   D-23: SLA baseline — 7-day rolling avg of rows_ingested over success runs.
//   D-25: baseline excludes non-success outcomes (empty, http_error, parse_error, killed).
import type Database from 'better-sqlite3';

export type ScrapeOutcome = 'success' | 'empty' | 'http_error' | 'parse_error' | 'killed';

export interface ScrapeRunInput {
  runId: string;
  runDate: string; // YYYY-MM-DD (from src/lib/shared/dates.ts)
  startedAt: string; // ISO-8601
  finishedAt: string; // ISO-8601
  outcome: ScrapeOutcome;
  rowsIngested: number;
  errorMessage?: string;
}

/**
 * Append a ledger row. Exactly one call per scrapeDate() invocation per the
 * Phase 1 pipeline invariant (every early return writes a row first).
 */
export function recordOutcome(db: Database.Database, input: ScrapeRunInput): void {
  db.prepare(
    `INSERT INTO scrape_runs
       (run_id, run_date, started_at, finished_at, outcome, rows_ingested, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.runId,
    input.runDate,
    input.startedAt,
    input.finishedAt,
    input.outcome,
    input.rowsIngested,
    input.errorMessage ?? null
  );
}

/**
 * D-23: 7-day rolling average of rows_ingested across success outcomes only,
 * over the window [today-7, today-1]. Returns null when the window has no
 * qualifying rows (off-season / fresh install / ingestion dark for a week).
 *
 * The `today` parameter is a YYYY-MM-DD string produced by
 * src/lib/shared/dates.ts — this module never generates date strings itself.
 */
export function computeSlaBaseline(db: Database.Database, today: string): number | null {
  const row = db
    .prepare(
      `SELECT AVG(rows_ingested) AS baseline
         FROM scrape_runs
        WHERE outcome = 'success'
          AND run_date >= date(?, '-7 days')
          AND run_date < date(?)`
    )
    .get(today, today) as { baseline: number | null };
  return row.baseline;
}

/**
 * D-12: given a date range, return the dates that still need scraping.
 *
 *   resume=true (default):
 *     - dates with no ledger row            → INCLUDE
 *     - dates whose latest outcome is success or empty → EXCLUDE
 *     - dates whose latest outcome is http_error, parse_error, or killed → INCLUDE
 *
 *   resume=false: return every date in the range (force full-range scrape).
 *
 * "Latest" outcome = highest ledger id for a given run_date; a second attempt
 * that succeeds correctly supersedes a prior http_error.
 */
export function getDatesToScrape(
  db: Database.Database,
  args: { from: string; to: string; resume?: boolean }
): string[] {
  const resume = args.resume ?? true;
  const all = enumerateDates(args.from, args.to);
  if (!resume) return all;

  // Pull the latest outcome per date. We sort by id ASC and overwrite per
  // date so the final entry in the map is the most recent attempt.
  const ledger = db
    .prepare(
      `SELECT run_date, outcome
         FROM scrape_runs
        WHERE run_date BETWEEN ? AND ?
        ORDER BY id ASC`
    )
    .all(args.from, args.to) as Array<{ run_date: string; outcome: ScrapeOutcome }>;

  const latestByDate = new Map<string, ScrapeOutcome>();
  for (const row of ledger) latestByDate.set(row.run_date, row.outcome);

  return all.filter((d) => {
    const o = latestByDate.get(d);
    if (o === undefined) return true; // never attempted
    // Retry the three failure modes per D-12.
    return o === 'http_error' || o === 'parse_error' || o === 'killed';
  });
}

/**
 * D-21 (Phase 2): Returns the most recent finished_at where outcome IN ('success','empty').
 * Used by every Phase 2 data page's "Last scraped at" indicator (BRW-03).
 * Null when no scrape has ever succeeded or completed with empty result.
 */
export function latestSuccessOrEmpty(db: Database.Database): { finished_at: string } | null {
  const row = db
    .prepare(
      `SELECT finished_at
         FROM scrape_runs
        WHERE outcome IN ('success', 'empty')
          AND finished_at IS NOT NULL
        ORDER BY id DESC
        LIMIT 1`
    )
    .get() as { finished_at: string } | undefined;
  return row ?? null;
}

/**
 * Pure helper — produces YYYY-MM-DD strings between `from` and `to` inclusive.
 *
 * NOTE: This is string arithmetic over pre-existing YYYY-MM-DD inputs, not
 * "today" / "now" derivation. STO-04's "single date producer" rule applies to
 * `today()` / `toIsoDate()` (which live in src/lib/shared/dates.ts); enumerating
 * between two already-formatted date strings is a pure range expansion and
 * does not introduce a new clock source.
 *
 * Implementation: increments the day via a parameterized Date (UTC-safe) then
 * formats with zero-padded components — deliberately avoiding the
 * `.toISOString().slice(0, 10)` idiom that the STO-04 boundary test bans
 * (tests/unit/shared/dates-boundary.test.ts). The Date object here is
 * constructed from known string inputs, so it is not a "now" producer.
 */
function enumerateDates(from: string, to: string): string[] {
  const result: string[] = [];
  let cur = from;
  while (cur <= to) {
    result.push(cur);
    cur = addOneDay(cur);
  }
  return result;
}

/**
 * Advance a YYYY-MM-DD string by one day. Uses Date.UTC arithmetic for
 * month/year rollover correctness (e.g., 2024-02-28 → 2024-02-29 in a leap
 * year; 2024-12-31 → 2025-01-01). Does NOT derive "now" — input is always a
 * parameterized date string.
 */
function addOneDay(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
