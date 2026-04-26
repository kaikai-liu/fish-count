#!/usr/bin/env tsx
// scripts/forecasts-rebuild.ts — FishCount ad-hoc forecast rebuild CLI (D-18, FCT-06).
//
// Operator entry point for "rebuild all forecasts now" — ad-hoc repair / testing.
// Always rebuilds the full today..today+30 × distinctSpecies × distinctTripTypes
// window per RESEARCH §Recommendation 9 (no date range flags — operator use
// case is "fix it now," range mode is unnecessary at v1).
//
// Optional flags:
//   --quiet    suppress per-step logs
//   --help     print usage and exit 0
//
// Required env vars:
//   DB_PATH    SQLite file (default /data/fishcount.sqlite3)
//
// Invocation: `npm run forecasts:rebuild` or `tsx scripts/forecasts-rebuild.ts`
//
// NO SvelteKit boot: relative `.ts` imports only at this top-level file per
// Phase 1 PATTERNS.md §SvelteKit-Alias Boundary.
//
// NO SQL: DAL boundary (CLAUDE.md Architecture Rules + STO-03). All DB access
// goes through src/lib/forecast/compute.ts which itself only calls DAL functions.

import { parseArgs } from 'node:util';
import { getDb, closeDb } from '../src/lib/db/client.ts';
import { recomputeForecasts } from '../src/lib/forecast/compute.ts';

const USAGE = 'Usage: tsx scripts/forecasts-rebuild.ts [--quiet] [--help]';

function log(msg: string, quiet: boolean): void {
  if (!quiet) process.stdout.write(msg + '\n');
}

/**
 * CLI entry point. Exported so unit tests can drive the logic without
 * triggering process.exit (matches scripts/backfill.ts pattern).
 *
 * Returns process exit code:
 *   0 — clean completion
 *   1 — runtime error
 *   2 — bad args
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        quiet: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false }
      },
      strict: true,
      allowPositionals: false
    });
  } catch (err) {
    console.error(`[forecasts-rebuild] arg parse error: ${(err as Error).message}`);
    console.error(USAGE);
    return 2;
  }
  const { values } = parsed;

  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const quiet = !!values.quiet;
  const startTime = Date.now();

  try {
    const db = getDb();
    log('[forecasts-rebuild] rebuilding forecasts (today..today+30 × species × trip_type)', quiet);
    recomputeForecasts(db);
    const durationMs = Date.now() - startTime;
    console.log(`[forecasts-rebuild] complete in ${durationMs}ms`);
    return 0;
  } catch (err) {
    console.error(`[forecasts-rebuild] fatal: ${(err as Error).message}`);
    return 1;
  }
}

// Entry-point guard: only self-invoke when this file is run directly.
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
      try {
        closeDb();
      } catch {
        /* ignore */
      }
      process.exit(code);
    })
    .catch((err: unknown) => {
      console.error(`[forecasts-rebuild] fatal: ${(err as Error).message}`);
      try {
        closeDb();
      } catch {
        /* ignore */
      }
      process.exit(1);
    });
}
