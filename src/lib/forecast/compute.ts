// src/lib/forecast/compute.ts — Pure-math forecast engine (FCT-01..06).
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL — this file
// MUST NOT contain SQL or import getDb at module scope. DB handle arrives as a parameter.
//
// Math (D-01, D-04):
//   value          = SUM(species_count) / SUM(angler_count) over matched window  (weighted yield)
//   pi_low         = 10th percentile of per-trip per-angler ratios               (empirical 80% PI lower)
//   pi_high        = 90th percentile of per-trip per-angler ratios               (empirical 80% PI upper)
//   n_trips        = COUNT(DISTINCT source_date, boat_id, trip_type)             (D-06)
//   baseline_value = value (v1 — column reserved for future model vs baseline)   (D-12)
//
// Window (D-01): ±7 calendar days of (forecast_date.month, forecast_date.day-of-month)
// across ALL prior years. Year-boundary wrap handled in DAL via OR-branch (RESEARCH §1).
//
// Gap accounting (D-24, RESEARCH §5): gap_days_expected = candidate dates from prior
// years only (excludes forecast_date's year itself). gap_days_present = count from
// scrape_runs where outcome IN ('success','empty').
//
// Storage (D-07): when n_trips < 5, store value/pi_low/pi_high = NULL but n_trips
// and baseline_value populated. UI consumes value IS NULL as the n<5 signal.
//
// Sources:
//   .planning/phases/03-forecast-layer/03-RESEARCH.md §Forecast Methodology
//   .planning/phases/03-forecast-layer/03-CONTEXT.md D-01..D-28
//   .planning/phases/03-forecast-layer/03-PATTERNS.md (parser.ts purity exemplar)
import type Database from 'better-sqlite3';
import { logger } from '$lib/server/logger';
import { today, addDays } from '$lib/shared/dates';
import { distinctSpecies, distinctTripTypes } from '$lib/db/queries/browse';
import { getRatiosForWindow } from '$lib/db/catchReports';
import { countPresentDays } from '$lib/db/scrapeRuns';
import { upsertMany, type ForecastRow } from '$lib/db/forecasts';

/**
 * Standard interpolating percentile (numpy "linear" method).
 * Pure — input MUST be pre-sorted ascending.
 *
 * Reference vectors (tested):
 *   percentile([1..10], 0.10) === 1.9
 *   percentile([1..10], 0.90) === 9.1
 *   percentile([1..10], 0.50) === 5.5
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export interface CellInput {
  forecastDate: string; // YYYY-MM-DD PT
  species: string;
  tripType: string;
}

export interface CellComputeResult {
  value: number | null;
  pi_low: number | null;
  pi_high: number | null;
  n_trips: number;
  baseline_value: number | null;
  gap_days_present: number;
  gap_days_expected: number;
}

/**
 * Compute a single (forecast_date, species, trip_type) cell from the matched
 * input set. Pure with respect to the DB handle (no module-scope DB).
 *
 * Returns NULL value/pi_low/pi_high when n_trips < 5 (D-07). Never throws —
 * empty input or all-zero anglers yields a null-result cell (D-32 testable).
 */
export function computeCell(db: Database.Database, input: CellInput): CellComputeResult {
  const { forecastDate, species, tripType } = input;
  const forecastYear = parseInt(forecastDate.slice(0, 4), 10);

  // ±7 calendar-day window around the same (month, day-of-month) for gap accounting.
  const candidateDates = enumerateWindowDates(forecastDate, forecastYear);
  const { windowStart, windowEnd, windowWraps } = computeWindowBounds(forecastDate);

  // Pull per-trip ratios + sum_species/sum_anglers from prior years only (D-01).
  const rows = getRatiosForWindow(db, {
    forecastYear,
    species,
    tripType,
    windowStart,
    windowEnd,
    windowWraps
  });

  // n_trips = COUNT(DISTINCT (source_date, boat_id, trip_type)) — getRatiosForWindow
  // already groups at this granularity, so rows.length is the count.
  const n_trips = rows.length;

  // Gap accounting (D-24): present = scrape_runs.outcome IN ('success','empty')
  // across the candidate calendar dates from PRIOR YEARS ONLY (RESEARCH §5).
  const gap_days_expected = candidateDates.length;
  const gap_days_present = countPresentDays(db, candidateDates);

  if (n_trips < 5) {
    // D-07: store n_trips but leave value / PI as NULL.
    return {
      value: null,
      pi_low: null,
      pi_high: null,
      n_trips,
      baseline_value: null,
      gap_days_present,
      gap_days_expected
    };
  }

  // D-04 prediction interval: empirical 10/90 percentiles of per-trip ratios.
  const ratios = rows
    .map((r) => r.ratio)
    .filter((r): r is number => r !== null && Number.isFinite(r));

  if (ratios.length === 0) {
    // All-zero-anglers edge case: ratios all null (NULLIF division). Honest
    // stance — no point estimate even though n_trips >= 5.
    return {
      value: null,
      pi_low: null,
      pi_high: null,
      n_trips,
      baseline_value: null,
      gap_days_present,
      gap_days_expected
    };
  }

  const sorted = [...ratios].sort((a, b) => a - b);
  const pi_low = percentile(sorted, 0.1);
  const pi_high = percentile(sorted, 0.9);

  // D-01 weighted yield: SUM(species_count) / SUM(angler_count) over matched window.
  // RatioRow returns sum_species + sum_anglers per trip; fleet-wide SUM/SUM is the
  // sum of trip-level numerators ÷ sum of trip-level denominators (NOT mean-of-ratios).
  const totalSpecies = rows.reduce((acc, r) => acc + (r.sum_species ?? 0), 0);
  const totalAnglers = rows.reduce((acc, r) => acc + (r.sum_anglers ?? 0), 0);
  const value = totalAnglers > 0 ? totalSpecies / totalAnglers : null;

  return {
    value,
    pi_low,
    pi_high,
    n_trips,
    baseline_value: value, // D-12: equals value for v1
    gap_days_present,
    gap_days_expected
  };
}

/**
 * Recompute the full forecasts table window: today..today+30 × distinctSpecies
 * × distinctTripTypes. D-15 full rebuild — UPSERT via UNIQUE index makes the
 * rebuild idempotent.
 *
 * Wraps all writes via upsertMany (which already wraps in a single transaction
 * per the catchReports.ts pattern; WAL keeps /picker readers unblocked).
 *
 * NEVER throws — per-cell errors are logged and skipped so one bad cell does
 * not abort the whole nightly recompute.
 */
export function recomputeForecasts(
  db: Database.Database,
  opts: { today?: string } = {}
): void {
  const recomputeLogger = logger.child({
    job: 'forecast-recompute',
    jobId: crypto.randomUUID()
  });
  const todayPt = opts.today ?? today();
  const horizonEnd = addDays(todayPt, 30);

  const speciesList = distinctSpecies(db);
  const tripTypeList = distinctTripTypes(db);

  const now = new Date().toISOString();
  const rows: ForecastRow[] = [];

  for (let i = 0; i <= 30; i++) {
    const forecastDate = addDays(todayPt, i);
    for (const species of speciesList) {
      for (const tripType of tripTypeList) {
        try {
          const r = computeCell(db, { forecastDate, species, tripType });
          rows.push({
            forecast_date: forecastDate,
            species,
            trip_type: tripType,
            value: r.value,
            pi_low: r.pi_low,
            pi_high: r.pi_high,
            n_trips: r.n_trips,
            baseline_value: r.baseline_value,
            gap_days_present: r.gap_days_present,
            gap_days_expected: r.gap_days_expected,
            computed_at: now
          });
        } catch (err) {
          recomputeLogger.error({
            err,
            forecastDate,
            species,
            tripType,
            msg: 'forecast_cell_failed'
          });
        }
      }
    }
  }

  upsertMany(db, rows);
  recomputeLogger.info({
    msg: 'forecast_recompute_complete',
    cells: rows.length,
    todayPt,
    horizonEnd
  });
}

// ---- helpers --------------------------------------------------------------

/**
 * Enumerate the ±7 calendar dates from prior years for a given forecastDate.
 * Excludes the forecast year itself per RESEARCH §5 / D-24 ("only past years contribute").
 *
 * Returns at most 15 × (forecastYear - earliestYear) dates. The earliest year
 * defaults to 2010 (project's working data range). Dates are emitted as
 * YYYY-MM-DD strings using our addDays date producer.
 */
function enumerateWindowDates(forecastDate: string, forecastYear: number): string[] {
  const EARLIEST_YEAR = 2010;
  const result: string[] = [];
  const mm = forecastDate.slice(5, 7);
  const dd = forecastDate.slice(8, 10);
  for (let y = EARLIEST_YEAR; y < forecastYear; y++) {
    // Pin the prior-year copy of the (month, day-of-month).
    // Feb 29 in non-leap years rolls forward via addDays — acceptable for v1
    // (the ±7 window swallows the 1-day difference).
    const anchor = canonicalAnchor(y, mm, dd);
    for (let d = -7; d <= 7; d++) {
      result.push(addDays(anchor, d));
    }
  }
  return result;
}

/**
 * Build a YYYY-MM-DD anchor for a (year, mm, dd). When dd is 29 and year is
 * a non-leap year for February, the addDays helper handles the rollover; we
 * simply emit Feb 28 in that case to keep the anchor valid.
 */
function canonicalAnchor(year: number, mm: string, dd: string): string {
  if (mm === '02' && dd === '29') {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    if (!isLeap) return `${year}-02-28`;
  }
  return `${year}-${mm}-${dd}`;
}

/**
 * Compute the ±7-day window in MM-DD form for SQL filtering.
 * windowWraps=1 when the window crosses Dec 31 / Jan 1 (forecastDate near year boundary).
 */
function computeWindowBounds(forecastDate: string): {
  windowStart: string;
  windowEnd: string;
  windowWraps: 0 | 1;
} {
  // Use the year 2000 as a leap-year anchor to compute MM-DD ±7 days.
  // 2000 is a leap year so Feb 29 is reachable; the year is then stripped.
  const yearAnchor = `2000-${forecastDate.slice(5)}`;
  const startStr = addDays(yearAnchor, -7).slice(5); // 'MM-DD'
  const endStr = addDays(yearAnchor, 7).slice(5); // 'MM-DD'
  const wraps: 0 | 1 = startStr > endStr ? 1 : 0;
  return { windowStart: startStr, windowEnd: endStr, windowWraps: wraps };
}
