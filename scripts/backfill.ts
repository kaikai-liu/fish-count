#!/usr/bin/env tsx
// scripts/backfill.ts — FishCount resumable historical backfill CLI.
// ING-08 (resumable backfill) + D-10 (parseArgs UX) + D-11 (progress format)
// + D-12 (auto-resume) + D-21 (FIRST_SCRAPE_OK gate enforced via scrapeDate).
//
// Required args:
//   --from YYYY-MM-DD
//   --to   YYYY-MM-DD
// Optional:
//   --resume   (default: true)
//   --quiet    (default: false)
//
// Required env vars (read by pipeline internals):
//   FIRST_SCRAPE_OK=true   — per D-21, scrapeDate() refuses otherwise (outcome='killed')
//   SCRAPER_ENABLED=true   — OPS-05 kill switch (or unset; fail-open)
//   DB_PATH                — SQLite file (default /data/fishcount.sqlite3)
//   SNAPSHOT_DIR           — gzip snapshot root (default /data/snapshots)
//   SCRAPE_LOCK_PATH       — cross-process lock (default /data/scrape.lock)
//
// Invocation: `npm run backfill -- --from 2010-01-01 --to 2026-04-23`
//   package.json wires: "backfill": "tsx scripts/backfill.ts"
//
// NO SvelteKit boot: does NOT import from $app/*, $lib/*, hooks.server.ts,
// or startup.ts. Relative `.ts` imports only at this top-level file per
// 01-PATTERNS.md §SvelteKit-Alias Boundary (lines 706-727). Inside the
// imported modules, `$lib/` aliases continue to resolve because tsx honors
// the SvelteKit tsconfig path map.
//
// NO SQL: DAL boundary (CLAUDE.md Architecture Rules + STO-03). All DB
// reads/writes go through typed repository functions in src/lib/db/.

import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { scrapeDate } from '../src/lib/scraper/pipeline.ts';
import { getDatesToScrape } from '../src/lib/db/scrapeRuns.ts';
import { getDb, closeDb } from '../src/lib/db/client.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const USAGE =
  'Usage: npm run backfill -- --from YYYY-MM-DD --to YYYY-MM-DD [--resume] [--quiet]';

function log(msg: string, quiet: boolean): void {
  if (!quiet) process.stdout.write(msg + '\n');
}

/**
 * CLI entry point. Exported so unit tests can drive the parseArgs + loop
 * logic without triggering a self-invoking process.exit (see bottom of file).
 *
 * Returns the process exit code:
 *   0  — clean completion
 *   1  — halted by gate (FIRST_SCRAPE_OK unset / SCRAPER_ENABLED=false) or
 *        unexpected runtime error
 *   2  — bad args (missing / invalid / inverted range)
 */
export async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        from: { type: 'string' },
        to: { type: 'string' },
        resume: { type: 'boolean', default: true },
        quiet: { type: 'boolean', default: false }
      },
      strict: true,
      allowPositionals: false
    });
  } catch (err) {
    console.error(`[backfill] arg parse error: ${(err as Error).message}`);
    console.error(USAGE);
    return 2;
  }
  const { values } = parsed;

  // Pitfall 8 (RESEARCH.md:573-575): parseArgs returns undefined for missing
  // flags; without this guard the CLI would silently scrape nothing.
  if (!values.from || !values.to) {
    console.error('[backfill] --from and --to required');
    console.error(USAGE);
    return 2;
  }
  if (!DATE_RE.test(values.from) || !DATE_RE.test(values.to)) {
    console.error(
      `[backfill] invalid date format; expected YYYY-MM-DD (got from=${values.from}, to=${values.to})`
    );
    console.error(USAGE);
    return 2;
  }
  if (values.from > values.to) {
    console.error(
      `[backfill] --from (${values.from}) must be ≤ --to (${values.to})`
    );
    return 2;
  }

  const quiet = !!values.quiet;
  const resume = values.resume !== false;

  const db = getDb();
  const dates = getDatesToScrape(db, {
    from: values.from,
    to: values.to,
    resume
  });
  log(
    `[backfill] ${dates.length} date(s) to process (resume=${resume})`,
    quiet
  );

  let total = 0;
  const startTime = Date.now();

  for (const date of dates) {
    const result = await scrapeDate(date, 'cli');
    total += result.rowsIngested;
    // D-11: compact one-line-per-date with running totals.
    log(
      `[${date}] ${result.rowsIngested} rows / ${total} total / ${result.outcome}`,
      quiet
    );
    // If the pipeline returned 'killed' (FIRST_SCRAPE_OK not set, or
    // SCRAPER_ENABLED=false), halt. The operator needs to see the block
    // rather than have the CLI chew through the whole range writing
    // 'killed' ledger rows for every date.
    if (result.outcome === 'killed') {
      console.error(
        `[backfill] halted — outcome=killed (${result.errorMessage ?? 'gate closed'})`
      );
      return 1;
    }
  }

  const durationMin = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(
    `[backfill] complete: ${dates.length} dates attempted, ${total} total rows, ${durationMin} min`
  );
  return 0;
}

// Entry-point guard: only self-invoke when this file is run directly
// (via `npm run backfill` or `tsx scripts/backfill.ts`). When imported by
// a test, the guard prevents triggering process.exit on import.
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === new URL(`file://${entry}`).href;
  } catch {
    // Fallback: path suffix match (some runners pass relative argv[1]).
    return import.meta.url.endsWith(entry);
  }
})();

if (invokedDirectly) {
  main()
    .then((code) => {
      try {
        closeDb();
      } catch {
        /* ignore */
      }
      process.exit(code);
    })
    .catch((err: unknown) => {
      console.error(`[backfill] fatal: ${(err as Error).message}`);
      try {
        closeDb();
      } catch {
        /* ignore */
      }
      process.exit(1);
    });
}
