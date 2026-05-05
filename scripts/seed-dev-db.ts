#!/usr/bin/env tsx
// scripts/seed-dev-db.ts — Phase 2 D-33 dev fixture replay.
//
// Replays committed HTML fixtures from tests/fixtures/scraper/*.html through
// parsePage + DAL upsert across synthetic dates so the home page, /explorer,
// /compare, /boats, and /date routes have data to render in dev. Idempotent
// (Phase 1 ING-04 upsert invariant). Seeds catch_reports / boats / landings
// only — the v1 /trends, /heatmap, /picker surfaces were retired in Phase 8
// Plan 03 and seed never inserted forecast rows.
//
// NON-PRODUCTION ONLY: hard-gates on NODE_ENV !== 'production' AND
// DB_PATH !== production default unless ALLOW_SEED_ON_PROD_PATH=1.
//
// Usage: NODE_ENV=development tsx scripts/seed-dev-db.ts \
//          [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--quiet]
//
// NO SvelteKit boot: relative `.ts` imports at this top-level file per
// Phase 1 PATTERNS.md §SvelteKit-Alias Boundary.
//
// NO live fetch — fixtures only.
// NO SQL — DAL boundary (CLAUDE.md + STO-03).

import { parseArgs } from 'node:util';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePage } from '../src/lib/scraper/parser.ts';
import { upsertBoatsAndLandings } from '../src/lib/db/boats.ts';
import { upsertMany as upsertCatchReports } from '../src/lib/db/catchReports.ts';
import { recordOutcome } from '../src/lib/db/scrapeRuns.ts';
import { getDb, closeDb } from '../src/lib/db/client.ts';
import { addDays, today } from '../src/lib/shared/dates.ts';

const PROD_DB_PATH = '/data/fishcount.sqlite3';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'tests', 'fixtures', 'scraper');

const USAGE = `Usage: tsx scripts/seed-dev-db.ts [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--quiet]
Default range: today − 365 days through today.
Idempotent: re-running on same range produces identical state.`;

/**
 * T-02-34: Hard gate — refuse to run in production or against the production DB path.
 * Returns { ok: false, reason } when the gate fails; { ok: true } when safe to proceed.
 */
function gatePass(): { ok: boolean; reason?: string } {
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, reason: 'NODE_ENV is production — refusing to seed' };
  }
  if (
    process.env.DB_PATH === PROD_DB_PATH &&
    process.env.ALLOW_SEED_ON_PROD_PATH !== '1'
  ) {
    return {
      ok: false,
      reason: `DB_PATH equals production default ${PROD_DB_PATH} — refusing without ALLOW_SEED_ON_PROD_PATH=1`
    };
  }
  return { ok: true };
}

/**
 * CLI entry point. Exported so unit tests can drive the logic without
 * triggering process.exit (matches scripts/backfill.ts pattern).
 *
 * Returns process exit code:
 *   0 — clean completion
 *   1 — gate rejected (production) or runtime error
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const gate = gatePass();
  if (!gate.ok) {
    console.error(`[seed-dev-db] ${gate.reason}`);
    return 1;
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        from: { type: 'string' },
        to: { type: 'string' },
        quiet: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false }
      },
      strict: true,
      allowPositionals: false
    });
  } catch (err) {
    console.error(`[seed-dev-db] arg parse error: ${(err as Error).message}`);
    console.error(USAGE);
    return 1;
  }

  const { values } = parsed;

  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const toDate = values.to ?? today();
  const fromDate = values.from ?? addDays(toDate, -365);

  if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate)) {
    console.error('[seed-dev-db] --from and --to must be YYYY-MM-DD');
    return 1;
  }
  if (fromDate > toDate) {
    console.error('[seed-dev-db] --from must be <= --to');
    return 1;
  }

  // T-02-35: fixture-only — no fetch/network calls. HTML files are read from disk.
  // Edge-case fixtures (empty days, mangled rows) are kept for parser unit tests
  // but excluded from seed rotation — replaying them across hundreds of days
  // produces sparse data that makes the dev UX look broken (e.g. picker default
  // state returns "no matching trips" because the rotation lands on an empty
  // fixture for "today"). Restrict seed rotation to substantive fixtures.
  const SEED_EXCLUDE = /-empty-day|parse-edge-mangled/;
  const fixtureFiles = readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.html') && !SEED_EXCLUDE.test(f))
    .sort(); // deterministic order
  if (fixtureFiles.length === 0) {
    console.error(`[seed-dev-db] no .html fixtures found in ${FIXTURE_DIR}`);
    return 1;
  }

  const db = getDb();
  let totalDays = 0;
  let totalRows = 0;

  try {
    let cursor = fromDate;
    while (cursor <= toDate) {
      // Round-robin across fixture files so different dates get varied data.
      const fixturePath = join(FIXTURE_DIR, fixtureFiles[totalDays % fixtureFiles.length]);
      const html = readFileSync(fixturePath, 'utf-8');

      // parsePage returns { rows: CatchRow[], failures: ParseFailure[] }
      // CatchRow: { source_name, landing_source_name, trip_type, angler_count,
      //             species, species_count, source_url?, landing_source_url? }
      const { rows } = parsePage(html);

      if (rows.length > 0) {
        // Step 1: Upsert boats + landings, get back id maps.
        const { boatIds, landingIds } = upsertBoatsAndLandings(db, rows);

        // Step 2: Map CatchRow → CatchReportRow with synthetic source_date.
        // Rows whose boat or landing failed to resolve are silently skipped
        // (same quarantine semantics as parsePage failures).
        const catchRows = rows.flatMap((r) => {
          const boatId = boatIds.get(r.source_name);
          const landingId = landingIds.get(r.landing_source_name);
          if (boatId === undefined || landingId === undefined) return [];
          return [
            {
              source_date: cursor,
              boat_id: boatId,
              landing_id: landingId,
              trip_type: r.trip_type,
              species: r.species,
              angler_count: r.angler_count,
              species_count: r.species_count,
              scraped_at: new Date().toISOString()
            }
          ];
        });

        upsertCatchReports(db, catchRows);
        totalRows += catchRows.length;
      }

      // Record a synthetic scrape_run entry for this date so "Last scraped at"
      // indicator has data and route tests can verify SLA logic.
      recordOutcome(db, {
        runId: `seed-${cursor}`,
        runDate: cursor,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        outcome: 'success',
        rowsIngested: rows.length
      });

      totalDays++;
      cursor = addDays(cursor, 1);
    }

    if (!values.quiet) {
      console.log(
        `[seed-dev-db] seeded ${totalDays} days, ${totalRows} catch_report rows from ${fixtureFiles.length} fixture(s).`
      );
    }
    return 0;
  } catch (err) {
    console.error(`[seed-dev-db] fatal: ${(err as Error).message}`);
    return 1;
  } finally {
    closeDb();
  }
}

// Entry-point self-invocation guard (matches scripts/backfill.ts pattern).
// When imported by a test, process.argv[1] points to the vitest binary, not
// this file — so the guard evaluates to false and main() is NOT auto-called.
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === new URL(`file://${entry}`).href;
  } catch {
    return import.meta.url.endsWith(entry);
  }
})();

if (invokedDirectly) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch((err: unknown) => {
      console.error(`[seed-dev-db] fatal: ${(err as Error).message}`);
      process.exit(1);
    });
}
