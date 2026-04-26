#!/usr/bin/env tsx
// scripts/forecast-benchmark.ts — FCT-04 honesty artifact (D-19).
//
// One-time validation: compares shipped seasonal-naïve baseline against a simpler
// fleet-mean baseline on held-out historical data. Reports MAE, median absolute
// error, and PI coverage. Writes Markdown report to:
//   .planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md
//
// Per ROADMAP success criterion #2: the baseline ships and is labeled as such.
// The benchmark exists to document honesty, NOT as a model-shipping gate. If
// seasonal-naïve is decisively worse than fleet-mean (>50% higher MAE), the
// script prints a warning so the operator can revisit D-01.
//
// Optional flags:
//   --year=YYYY   override held-out year (default: most recent complete year)
//   --quiet       suppress per-step logs
//   --help        print usage and exit 0
//
// Exit codes:
//   0  — clean completion (Markdown written)
//   1  — runtime error or no held-out data
//   2  — bad args
//
// NO SvelteKit boot. NO SQL — DAL boundary (CLAUDE.md + STO-03). All DB access
// goes through src/lib/forecast/compute.ts (percentile helper) and the
// src/lib/db/queries/benchmark.ts read helpers (actualForCell, fleetMeanForecast,
// determineHeldOutYear, enumerateHeldOutDates) plus distinctSpecies / distinctTripTypes
// and getRatiosForWindow for the seasonal variant.

import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, closeDb } from '../src/lib/db/client.ts';
import {
  getRatiosForWindow,
  type RatioWindowArgs
} from '../src/lib/db/catchReports.ts';
import { percentile } from '../src/lib/forecast/compute.ts';
import {
  distinctSpecies,
  distinctTripTypes
} from '../src/lib/db/queries/browse.ts';
import {
  actualForCell,
  fleetMeanForecast,
  determineHeldOutYear,
  enumerateHeldOutDates
} from '../src/lib/db/queries/benchmark.ts';
import { addDays } from '../src/lib/shared/dates.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(
  __dirname,
  '..',
  '.planning',
  'phases',
  '03-forecast-layer',
  '03-VALIDATION-BENCHMARK.md'
);
const USAGE =
  'Usage: tsx scripts/forecast-benchmark.ts [--year=YYYY] [--quiet] [--help]';
const MIN_VALID_CELLS = 100;

function log(msg: string, quiet: boolean): void {
  if (!quiet) process.stdout.write(msg + '\n');
}

interface ForecastSample {
  forecast: number | null;
  actual: number;
  pi_low: number | null;
  pi_high: number | null;
}

interface VariantStats {
  mae: number | null;
  medianAE: number | null;
  piCoverage: number | null; // only meaningful for the seasonal variant
  validCells: number;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Compute the ±7-day MM-DD window for a given forecast date — same anchoring
 * as src/lib/forecast/compute.ts (year 2000 leap-anchor, then strip year).
 */
function computeWindowBoundsForBenchmark(forecastDate: string): {
  windowStart: string;
  windowEnd: string;
  windowWraps: 0 | 1;
} {
  const yearAnchor = `2000-${forecastDate.slice(5)}`;
  const startStr = addDays(yearAnchor, -7).slice(5); // 'MM-DD'
  const endStr = addDays(yearAnchor, 7).slice(5); // 'MM-DD'
  const wraps: 0 | 1 = startStr > endStr ? 1 : 0;
  return { windowStart: startStr, windowEnd: endStr, windowWraps: wraps };
}

/**
 * Compute the seasonal-naïve forecast (D-01) for a single (date, species,
 * trip_type) cell using ONLY rows with source_date.year < heldOutYear.
 * Returns value/pi_low/pi_high all null when n_trips < 5 (D-07 floor).
 */
function seasonalForecastForCell(
  db: import('better-sqlite3').Database,
  date: string,
  species: string,
  tripType: string,
  heldOutYear: number
): { value: number | null; pi_low: number | null; pi_high: number | null } {
  const { windowStart, windowEnd, windowWraps } =
    computeWindowBoundsForBenchmark(date);
  const args: RatioWindowArgs = {
    forecastYear: heldOutYear, // restricts to source_date.year < heldOutYear
    species,
    tripType,
    windowStart,
    windowEnd,
    windowWraps
  };
  const rows = getRatiosForWindow(db, args);
  if (rows.length < 5) return { value: null, pi_low: null, pi_high: null };

  const ratios = rows
    .map((r) => r.ratio)
    .filter((r): r is number => r !== null && Number.isFinite(r));
  if (ratios.length === 0)
    return { value: null, pi_low: null, pi_high: null };

  const sorted = [...ratios].sort((a, b) => a - b);
  const totalSpecies = rows.reduce(
    (acc, r) => acc + (r.sum_species ?? 0),
    0
  );
  const totalAnglers = rows.reduce(
    (acc, r) => acc + (r.sum_anglers ?? 0),
    0
  );
  const value = totalAnglers > 0 ? totalSpecies / totalAnglers : null;
  return {
    value,
    pi_low: percentile(sorted, 0.1),
    pi_high: percentile(sorted, 0.9)
  };
}

function summarizeVariant(samples: ForecastSample[]): VariantStats {
  const valid = samples.filter(
    (v) => v.forecast !== null && Number.isFinite(v.forecast as number)
  );
  if (valid.length === 0)
    return { mae: null, medianAE: null, piCoverage: null, validCells: 0 };
  const errors = valid.map((v) => Math.abs((v.forecast as number) - v.actual));
  const mae = errors.reduce((a, b) => a + b, 0) / errors.length;
  const sortedErr = [...errors].sort((a, b) => a - b);
  const medianAE = median(sortedErr);
  const piEligible = valid.filter(
    (v) => v.pi_low !== null && v.pi_high !== null
  );
  const piCoverage =
    piEligible.length > 0
      ? piEligible.filter(
          (v) =>
            v.actual >= (v.pi_low as number) &&
            v.actual <= (v.pi_high as number)
        ).length / piEligible.length
      : null;
  return { mae, medianAE, piCoverage, validCells: valid.length };
}

function fmt(n: number | null, d = 2): string {
  return n === null ? 'n/a' : n.toFixed(d);
}

function fmtPct(n: number | null): string {
  return n === null ? 'n/a' : (n * 100).toFixed(1) + '%';
}

function piAssessment(coverage: number | null): string {
  if (coverage === null) return 'no PI cells';
  if (coverage >= 0.75 && coverage <= 0.85) return 'calibrated';
  if (coverage < 0.6) return 'overconfident (PI too narrow)';
  if (coverage > 0.9) return 'underconfident (PI too wide)';
  return 'borderline';
}

function conclusionLine(
  seasonal: VariantStats,
  fleetMean: VariantStats
): string {
  if (seasonal.mae === null || fleetMean.mae === null) {
    return 'Insufficient data to compare variants — see warnings.';
  }
  if (seasonal.mae <= fleetMean.mae) {
    return 'Seasonal-naïve baseline matches or beats fleet-mean baseline on MAE — shipping seasonal as labeled per ROADMAP success criterion #2.';
  }
  return (
    'Seasonal-naïve baseline has higher MAE than fleet-mean baseline (' +
    fmt(seasonal.mae) +
    ' vs ' +
    fmt(fleetMean.mae) +
    '). Shipping the labeled baseline per ROADMAP success criterion #2; if the gap exceeds 50%, revisit D-01.'
  );
}

function renderMarkdown(opts: {
  heldOutYear: number;
  validCellCount: number;
  seasonal: VariantStats;
  fleetMean: VariantStats;
}): string {
  const cellWarning =
    opts.validCellCount < MIN_VALID_CELLS
      ? ' (warning: below ' +
        MIN_VALID_CELLS +
        ' — coverage statistic may be unreliable)'
      : '';

  return (
    '# Forecast Benchmark — Phase 3 Validation (FCT-04)\n' +
    '\n' +
    '**Held-out year:** ' +
    opts.heldOutYear +
    '\n' +
    '**Training data:** all catch_reports with source_date < ' +
    opts.heldOutYear +
    '-01-01\n' +
    '**Valid cells evaluated:** ' +
    opts.validCellCount +
    cellWarning +
    '\n' +
    '\n' +
    '## Methodology\n' +
    '\n' +
    'Two variants are compared on every (date, species, trip_type) cell in the held-out year where actual outcomes exist:\n' +
    '\n' +
    '1. **Seasonal-naïve baseline (shipped):** weighted yield = SUM(species_count) / SUM(angler_count) over rows from prior years where source_date is within ±7 calendar days of the same (month, day-of-month). Empirical 10/90 percentiles of per-trip per-angler ratios form the 80% prediction interval.\n' +
    '2. **Fleet-mean baseline (comparison):** weighted yield = SUM(species_count) / SUM(angler_count) over ALL prior-year rows for the same (species, trip_type), no seasonal window.\n' +
    '\n' +
    'Actuals = SUM(species_count) / NULLIF(SUM(angler_count), 0) per held-out (date, species, trip_type).\n' +
    '\n' +
    '## Point Estimate Accuracy\n' +
    '\n' +
    '| Model | MAE | Median AE | Valid cells | Notes |\n' +
    '|-------|-----|-----------|-------------|-------|\n' +
    '| Seasonal-naïve (±7 days × all prior years) | ' +
    fmt(opts.seasonal.mae) +
    ' | ' +
    fmt(opts.seasonal.medianAE) +
    ' | ' +
    opts.seasonal.validCells +
    ' | shipped |\n' +
    '| Fleet-mean baseline (no seasonality) | ' +
    fmt(opts.fleetMean.mae) +
    ' | ' +
    fmt(opts.fleetMean.medianAE) +
    ' | ' +
    opts.fleetMean.validCells +
    ' | comparison |\n' +
    '\n' +
    '## Prediction Interval Calibration\n' +
    '\n' +
    '| Model | PI Coverage | Target | Assessment |\n' +
    '|-------|-------------|--------|------------|\n' +
    '| Seasonal-naïve 80% PI | ' +
    fmtPct(opts.seasonal.piCoverage) +
    ' | ~80% | ' +
    piAssessment(opts.seasonal.piCoverage) +
    ' |\n' +
    '\n' +
    '## Conclusion\n' +
    '\n' +
    conclusionLine(opts.seasonal, opts.fleetMean) +
    '\n' +
    '\n' +
    '---\n' +
    '\n' +
    '*Generated by scripts/forecast-benchmark.ts. Re-run after significant backfill changes.*\n'
  );
}

/**
 * CLI entry point. Exported so unit tests can drive parseArgs + the loop without
 * triggering a self-invoking process.exit (see bottom of file).
 */
export async function main(
  argv: string[] = process.argv.slice(2)
): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        year: { type: 'string' },
        quiet: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false }
      },
      strict: true,
      allowPositionals: false
    });
  } catch (err) {
    console.error(
      `[forecast-benchmark] arg parse error: ${(err as Error).message}`
    );
    console.error(USAGE);
    return 2;
  }
  if (parsed.values.help) {
    console.log(USAGE);
    return 0;
  }
  const quiet = !!parsed.values.quiet;
  const yearOverride = parsed.values.year
    ? parseInt(parsed.values.year, 10)
    : undefined;
  if (
    yearOverride !== undefined &&
    (Number.isNaN(yearOverride) || yearOverride < 2000 || yearOverride > 2100)
  ) {
    console.error(
      `[forecast-benchmark] --year must be a valid 4-digit year (got ${parsed.values.year})`
    );
    return 2;
  }

  try {
    const db = getDb();
    const heldOutYear = determineHeldOutYear(db, yearOverride);
    if (heldOutYear === null) {
      console.error(
        '[forecast-benchmark] no catch_reports data — cannot benchmark'
      );
      return 1;
    }
    log(`[forecast-benchmark] held-out year = ${heldOutYear}`, quiet);

    const heldOutDates = enumerateHeldOutDates(db, heldOutYear);
    if (heldOutDates.length === 0) {
      console.error(
        `[forecast-benchmark] no catch_reports rows in year ${heldOutYear} — cannot benchmark`
      );
      return 1;
    }
    const speciesList = distinctSpecies(db);
    const tripTypeList = distinctTripTypes(db);

    const seasonalSamples: ForecastSample[] = [];
    const fleetMeanSamples: ForecastSample[] = [];

    let totalEvaluated = 0;
    for (const date of heldOutDates) {
      for (const species of speciesList) {
        for (const tripType of tripTypeList) {
          const actual = actualForCell(db, date, species, tripType);
          if (actual === null) continue; // no held-out outcome for this cell
          totalEvaluated++;
          const seasonal = seasonalForecastForCell(
            db,
            date,
            species,
            tripType,
            heldOutYear
          );
          const fleet = fleetMeanForecast(db, species, tripType, heldOutYear);
          seasonalSamples.push({
            forecast: seasonal.value,
            actual,
            pi_low: seasonal.pi_low,
            pi_high: seasonal.pi_high
          });
          fleetMeanSamples.push({
            forecast: fleet,
            actual,
            pi_low: null,
            pi_high: null
          });
        }
      }
    }
    log(`[forecast-benchmark] evaluated ${totalEvaluated} cells`, quiet);
    if (totalEvaluated < MIN_VALID_CELLS) {
      console.error(
        `[forecast-benchmark] WARNING: ${totalEvaluated} valid cells (< ${MIN_VALID_CELLS}) — coverage statistic may be unreliable`
      );
    }

    const seasonalStats = summarizeVariant(seasonalSamples);
    const fleetMeanStats = summarizeVariant(fleetMeanSamples);
    const md = renderMarkdown({
      heldOutYear,
      validCellCount: totalEvaluated,
      seasonal: seasonalStats,
      fleetMean: fleetMeanStats
    });
    writeFileSync(OUTPUT_PATH, md, 'utf8');
    log(`[forecast-benchmark] wrote ${OUTPUT_PATH}`, quiet);
    return 0;
  } catch (err) {
    console.error(`[forecast-benchmark] fatal: ${(err as Error).message}`);
    return 1;
  }
}

// Entry-point self-invocation guard (matches scripts/backfill.ts pattern).
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
      console.error(`[forecast-benchmark] fatal: ${(err as Error).message}`);
      try {
        closeDb();
      } catch {
        /* ignore */
      }
      process.exit(1);
    });
}
