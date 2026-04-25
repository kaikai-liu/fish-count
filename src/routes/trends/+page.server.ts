// src/routes/trends/+page.server.ts — Trend charts (TRN-01, TRN-02)
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Sources:
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-26, D-27, D-29
//   .planning/phases/02-browse-trip-picker-trends/02-UI-SPEC.md §"/trends" (lines 568-576)
//
// Threat mitigations:
//   T-02-30: parseTrendsFilters returns {error} if species or tripType missing → guidance state
//   T-02-31: "all" range maps to a bounded sentinel date window, NOT unbounded query
//   T-02-32: granularity Zod enum rejects unexpected strings at boundary (inherited from 02-01)
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db/client';
import { speciesTrend, boatTrend, type TrendBucket } from '$lib/db/queries/trends';
import { distinctTripTypes, distinctSpecies } from '$lib/db/queries/browse';
import { getById } from '$lib/db/boats';
import { latestSuccessOrEmpty } from '$lib/db/scrapeRuns';
import { today, toPtTimeLabel, addDays } from '$lib/shared/dates';
import { parseTrendsFilters, type TrendsFilters } from '$lib/shared/urlState';
import { FISH_PER_ANGLER_AXIS } from '$lib/copy/metrics';
import { eachWeekOfInterval, eachMonthOfInterval, format } from 'date-fns';

/**
 * Map the time-range preset to a concrete date window.
 * T-02-31: "all" uses a bounded 10-year sentinel — never unbounded.
 */
function rangeToDates(range: TrendsFilters['range']): { fromDate: string; toDate: string } {
  const toDate = today();
  let days = 365;
  if (range === '3mo') days = 90;
  else if (range === '6mo') days = 180;
  else if (range === '1y') days = 365;
  else if (range === 'all') days = 365 * 10; // T-02-31: bounded sentinel
  return { fromDate: addDays(toDate, -days), toDate };
}

/**
 * D-26: default granularity — weekly for ≤6mo range, monthly for >6mo.
 * Explicit granularity from URL always takes precedence.
 */
function chooseGranularity(
  range: TrendsFilters['range'],
  explicit?: 'weekly' | 'monthly'
): 'weekly' | 'monthly' {
  if (explicit) return explicit;
  if (range === '3mo' || range === '6mo') return 'weekly';
  return 'monthly';
}

export const load: PageServerLoad = async ({ url, setHeaders, locals }) => {
  const db = getDb();

  // D-29: /trends caches 5 min
  setHeaders({ 'cache-control': 'public, max-age=300' });

  const filterOptions = {
    tripTypes: distinctTripTypes(db),
    speciesList: distinctSpecies(db)
  };
  const lastScrape = latestSuccessOrEmpty(db);
  const lastScrapedLabel = lastScrape ? toPtTimeLabel(lastScrape.finished_at) : null;

  // T-02-30: parseTrendsFilters enforces required species + tripType at boundary.
  const parseResult = parseTrendsFilters(url.searchParams);
  if ('error' in parseResult) {
    return {
      filters: null,
      guidance: 'Pick a species and trip type to view its trend over time.',
      chartOption: null,
      captionGranularity: null,
      granularity: null,
      filterOptions,
      lastScrapedLabel,
      boatName: null
    };
  }
  const filters = parseResult as TrendsFilters;

  const { fromDate, toDate } = rangeToDates(filters.range);
  const granularity = chooseGranularity(filters.range, filters.granularity);

  // TRN-02: optional boat filter narrows to single-boat trend
  const buckets: TrendBucket[] = filters.boatId
    ? boatTrend(db, {
        boatId: filters.boatId,
        species: filters.species,
        tripType: filters.tripType,
        fromDate,
        toDate,
        granularity
      })
    : speciesTrend(db, {
        species: filters.species,
        tripType: filters.tripType,
        fromDate,
        toDate,
        granularity
      });

  // D-27 gap-fill: enumerate every expected bucket key, align with DB results,
  // insert null for missing buckets so the line renders as a gap (not zero).
  const fromDateObj = new Date(fromDate + 'T00:00:00Z');
  const toDateObj = new Date(toDate + 'T00:00:00Z');

  const expectedKeys: string[] =
    granularity === 'weekly'
      ? eachWeekOfInterval({ start: fromDateObj, end: toDateObj }, { weekStartsOn: 1 }).map((d) =>
          format(d, "RRRR-'W'II")
        )
      : eachMonthOfInterval({ start: fromDateObj, end: toDateObj }).map((d) =>
          format(d, 'yyyy-MM')
        );

  const presentMap = new Map(buckets.map((b) => [b.bucket_key, b]));
  const aligned = expectedKeys.map((k) => ({
    bucket_key: k,
    value: presentMap.get(k)?.value ?? null, // null = gap, NOT zero
    n_trips: presentMap.get(k)?.n_trips ?? 0
  }));

  // Optional boat name for chart title and aria-label (TRN-02)
  const boatRow = filters.boatId ? getById(db, filters.boatId) : null;
  const boatName = boatRow?.display_name ?? (filters.boatId ? `Boat ${filters.boatId}` : null);

  const seriesName = boatName ? `${boatName} · ${filters.species}` : filters.species;

  // yAxis.name uses FISH_PER_ANGLER_AXIS constant — never inline the literal string
  const chartOption = {
    tooltip: { trigger: 'axis' as const },
    xAxis: { type: 'category' as const, data: expectedKeys },
    yAxis: { type: 'value' as const, name: FISH_PER_ANGLER_AXIS },
    series: [
      {
        name: seriesName,
        type: 'line' as const,
        connectNulls: false, // D-27: gaps render as line discontinuities
        data: aligned.map((b) => b.value)
      }
    ]
  };

  const captionGranularity =
    granularity === 'weekly' ? 'Weekly buckets · Mon–Sun PT' : 'Monthly buckets PT';

  locals.logger?.info({
    msg: 'trends_loaded',
    species: filters.species,
    tripType: filters.tripType,
    boatId: filters.boatId,
    range: filters.range,
    granularity,
    bucketCount: expectedKeys.length
  });

  return {
    filters,
    guidance: null,
    chartOption,
    captionGranularity,
    granularity,
    filterOptions,
    lastScrapedLabel,
    boatName
  };
};
