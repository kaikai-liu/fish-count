// src/lib/scraper/pipeline.ts
// Pipeline orchestrator: scrapeDate(date, source) chains gates → fetch → snapshot → parse → upsert → ledger.
//
// Gate ordering is LOAD-BEARING (D-13 + D-21 + OPS-05 + Pitfall 3):
//   1. firstScrapeAllowed (D-21 fail-closed) — FIRST, before any side effect
//   2. scrapingEnabled    (OPS-05 fail-open kill switch)
//   3. withScrapeLock     (D-13 cross-process mutex)
//   4. sourceQueue.add(fetchPage) (D-13 in-process rate limit + polite fetch)
//   5. writeSnapshot      (D-17 BEFORE parse — preserve raw evidence)
//   6. parsePage          (D-07 per-row quarantine)
//   7. upsertBoatsAndLandings → upsertMany(catch_reports) → recordMany(parse_failures)
//   8. recordOutcome      (invariant 6: exactly ONE scrape_runs row per invocation)
//
// Source: 01-RESEARCH.md §Code Examples lines 580-670 + 01-PATTERNS.md §Shared Patterns.
//
// Important: scrapeDate does NOT call pingHealthcheck — OPS-04 heartbeat bookends
// live in the scheduler tick (scheduler.ts::_scrapeTick). The CLI (Plan 01-06)
// calls scrapeDate directly without pings; only the scheduler owns the
// dead-man's switch.
import { randomUUID } from 'node:crypto';
import { firstScrapeAllowed } from './gate';
import { scrapingEnabled } from '$lib/server/kill-switch';
import { withScrapeLock } from './lock';
import { sourceQueue } from './rate-limiter';
import { fetchPage } from './fetcher';
import { writeSnapshot } from './snapshot';
import { parsePage } from './parser';
import { getDb } from '$lib/db/client';
import { upsertBoatsAndLandings } from '$lib/db/boats';
import { upsertMany as upsertCatchReports, type CatchReportRow } from '$lib/db/catchReports';
import { recordMany as recordParseFailures } from '$lib/db/parseFailures';
import { recordOutcome, type ScrapeOutcome } from '$lib/db/scrapeRuns';
import { logger } from '$lib/server/logger';

export type Source = 'scheduler' | 'cli';

export interface ScrapeResult {
  outcome: ScrapeOutcome;
  rowsIngested: number;
  errorMessage?: string;
  runId: string;
}

/**
 * Helper: record the ledger row + return the result in one step.
 * Invariant 6: every code path through scrapeDate() — including every early
 * return — must call this exactly once.
 */
function recordAndReturn(
  runId: string,
  runDate: string,
  startedAt: string,
  outcome: ScrapeOutcome,
  rowsIngested: number,
  errorMessage?: string
): ScrapeResult {
  const db = getDb();
  recordOutcome(db, {
    runId,
    runDate,
    startedAt,
    finishedAt: new Date().toISOString(),
    outcome,
    rowsIngested,
    errorMessage
  });
  return { outcome, rowsIngested, errorMessage, runId };
}

/**
 * Scrape a single date end-to-end. Returns a ScrapeResult AND writes exactly
 * one row to scrape_runs regardless of outcome.
 *
 * source='scheduler' — called by the cron tick (Plan 01-05 scheduler.ts).
 * source='cli'       — called by backfill.ts (Plan 01-06).
 *
 * The two sources behave identically inside scrapeDate; the difference is
 * that the scheduler wraps calls with pingHealthcheck('start'|'success'|'fail')
 * for OPS-04 dead-man's switch integration. The CLI skips pings.
 */
export async function scrapeDate(date: string, source: Source): Promise<ScrapeResult> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const log = logger.child({ run_id: runId, source_date: date, source });

  // Gate 1: FIRST_SCRAPE_OK (D-21 fail-closed). FIRST, before any side effect.
  //         Operator must have completed TOS review + outreach email BEFORE
  //         flipping this to 'true'. Typo → default to 'refuse'.
  if (!firstScrapeAllowed(process.env)) {
    log.warn({ msg: 'first_scrape_gate_blocked' });
    return recordAndReturn(
      runId,
      date,
      startedAt,
      'killed',
      0,
      'FIRST_SCRAPE_OK not set'
    );
  }

  // Gate 2: SCRAPER_ENABLED kill switch (OPS-05 fail-open).
  //         Explicit 'false' halts ingestion; any other value (incl. unset)
  //         allows. Typo must NOT silently stop the scraper.
  if (!scrapingEnabled(process.env)) {
    log.warn({ msg: 'kill_switch_blocked' });
    return recordAndReturn(
      runId,
      date,
      startedAt,
      'killed',
      0,
      'SCRAPER_ENABLED=false'
    );
  }

  // Gates 3+4: cross-process lock (D-13 tier 2) around the in-process rate
  // limit (D-13 tier 1). Lock-busy throws — handled by the outer .catch below.
  try {
    return await withScrapeLock(async () => {
      // Gate 4: rate-limited fetch through shared p-queue (≤1 req/5s globally).
      let html: string;
      try {
        html = (await sourceQueue.add(() => fetchPage(date))) as string;
      } catch (err) {
        log.error({ err }, 'fetch_failed');
        return recordAndReturn(
          runId,
          date,
          startedAt,
          'http_error',
          0,
          (err as Error).message
        );
      }

      // Gate 5: snapshot BEFORE parse (D-17). If parsing later breaks, we
      //         still have the raw evidence for replay. Non-fatal on failure.
      try {
        await writeSnapshot(date, html);
      } catch (err) {
        log.warn({ err }, 'snapshot_write_failed_non_fatal');
        // Continue: parse + upsert can still proceed.
      }

      // Gate 6: parse (row-level quarantine per D-07). parsePage NEVER throws.
      const { rows, failures } = parsePage(html);

      // Pitfall 2: distinguish legitimate empty-day from silent parser break.
      //   Empty-day page: has navigation/pager panels but NO "Fish Counts"
      //     heading (the source-site uses "{Landing} Fish Counts for {date}"
      //     as the data-panel marker — verified 2026-04-23 live probe).
      //   Selector drift: data panel present (heading says "Fish Counts")
      //     but our row selectors matched zero <tr>. That's a parse_error —
      //     "empty" must mean "source reported nothing", never "we broke".
      // Source: 01-RESEARCH.md §Code Examples line 646.
      const looksLikeDataPage =
        html.includes('Fish Counts') &&
        (html.includes("class='panel'") || html.includes('class="panel"'));
      if (
        rows.length === 0 &&
        failures.length === 0 &&
        looksLikeDataPage &&
        html.length > 500
      ) {
        log.warn({ msg: 'page_structure_unrecognized' });
        return recordAndReturn(
          runId,
          date,
          startedAt,
          'parse_error',
          0,
          'page structure unrecognized — selectors may be stale'
        );
      }

      // DAL writes. catchReports.upsertMany wraps its own transaction.
      const db = getDb();
      const scrapedAt = new Date().toISOString();

      let rowsIngested = 0;
      if (rows.length > 0) {
        const { boatIds, landingIds } = upsertBoatsAndLandings(db, rows);
        const catchRows: CatchReportRow[] = rows
          .filter(
            (r) =>
              boatIds.has(r.source_name) && landingIds.has(r.landing_source_name)
          )
          .map((r) => ({
            source_date: date,
            boat_id: boatIds.get(r.source_name)!,
            landing_id: landingIds.get(r.landing_source_name)!,
            trip_type: r.trip_type,
            species: r.species,
            angler_count: r.angler_count,
            species_count: r.species_count,
            scraped_at: scrapedAt
          }));
        rowsIngested = upsertCatchReports(db, catchRows);
      }

      if (failures.length > 0) {
        recordParseFailures(db, runId, failures);
      }

      const outcome: ScrapeOutcome = rows.length > 0 ? 'success' : 'empty';
      log.info({
        msg: 'scrape_complete',
        outcome,
        rows: rowsIngested,
        failures: failures.length
      });
      return recordAndReturn(runId, date, startedAt, outcome, rowsIngested);
    });
  } catch (err) {
    // Lock-busy, unexpected inner throw, or any uncaught error inside the
    // locked block. Invariant 6 still holds: write exactly one ledger row.
    log.error({ err }, 'scrape_pipeline_error');
    return recordAndReturn(
      runId,
      date,
      startedAt,
      'http_error',
      0,
      (err as Error).message
    );
  }
}
