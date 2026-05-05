// src/routes/compare/+page.server.ts — 2-3 boat side-by-side compare (TRN-03)
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Sources:
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-24, D-25, D-29
//   .planning/phases/02-browse-trip-picker-trends/02-01-SUMMARY.md (compareBoats + boatTrend signatures)
//
// Security: T-02-25 — Zod enforces boatIds array length 2..3 via parseCompareFilters.
//           T-02-26 — single tripType string accepted; multi tripType impossible by schema.
//           T-02-29 — compare default window 30 days; indexed source_date columns.
// Cache: D-29 — max-age=300 (5 min) for input-derived pages.
// Copy: Chart yAxis.name uses imported FISH_PER_ANGLER_AXIS constant (never inlined).
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db/client';
import { compareBoats } from '$lib/db/queries/compare';
import { boatTrend, type TrendBucket } from '$lib/db/queries/trends';
import { activeTripTypes } from '$lib/db/queries/browse';
import { listBoatsByActivity } from '$lib/db/boats';
import { latestSuccessOrEmpty } from '$lib/db/scrapeRuns';
import { today, toPtTimeLabel, addDays, isoWeekStartFromKey } from '$lib/shared/dates';
import { parseCompareFilters, type CompareFilters } from '$lib/shared/urlState';
import { FISH_PER_ANGLER_AXIS } from '$lib/copy/metrics';
import { eachWeekOfInterval, format } from 'date-fns';

export const load: PageServerLoad = async ({ url, setHeaders, locals }) => {
  const db = getDb();
  // D-29: compare caches 5 min
  setHeaders({ 'cache-control': 'public, max-age=300' });

  const filterOptions = {
    // Polish pass: only show trip types that are actually active right now —
    // ≥50 trips in the past 365 days, alias-aware. Drops historical anomalies
    // (1.75 Day, Lobster, Reverse Overnight) AND rare types (5 Day, 7 Day,
    // 4 Hour, 6 Hour). Sorted by frequency desc — the type anglers know first.
    tripTypes: activeTripTypes(db, 365, 50),
    defaultFromDate: addDays(today(), -30),
    defaultToDate: today()
  };
  const lastScrape = latestSuccessOrEmpty(db);
  const lastScrapedLabel = lastScrape ? toPtTimeLabel(lastScrape.finished_at) : null;

  // Phase 8 Plan 04 (CMP-01 / D-24). All-boats list for the typeahead
  // <datalist>. Activity-sorted so the most relevant boats are at the top
  // when a typed prefix matches multiple. Each boat carries id + slug +
  // display_name; the page-side JS resolves a typed display_name → id by
  // a small lookup against this list (no DB query per keystroke).
  const allBoats = listBoatsByActivity(db, 365).map((b) => ({
    id: b.id,
    slug: b.slug,
    display_name: b.display_name
  }));

  // Parse and validate compare filters from URL search params.
  // parseCompareFilters enforces: tripType required, boatIds 2..3, date format.
  const parseResult = parseCompareFilters(url.searchParams);
  if ('error' in parseResult) {
    locals.logger?.info({ msg: 'compare_guidance', reason: 'invalid_filters' });
    return {
      filters: null,
      guidance: 'Pick a trip type, a date range, and 2 or 3 boats to compare.',
      rows: null,
      chartOption: null,
      filterOptions,
      lastScrapedLabel,
      allBoats
    };
  }
  const filters = parseResult as CompareFilters;

  // Per-boat aggregates within the selected window and trip type.
  const rows = compareBoats(db, {
    boatIds: filters.boatIds,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    tripType: filters.tripType
  });

  // Per-boat weekly trend for the multi-series chart.
  // D-25: compare is "boat × tripType" within a window — NOT per-species. We pass
  // species: undefined to boatTrend so each bucket value sums across all species
  // (the boat-aggregate framing). Plan 02-01 ships boatTrend.species as OPTIONAL
  // with two prepared statements (per-species + all-species) — we consume the
  // contract directly. No sibling helper, no workaround.
  const trendsByBoat: Record<number, TrendBucket[]> = {};
  for (const boatId of filters.boatIds) {
    trendsByBoat[boatId] = boatTrend(db, {
      boatId,
      species: undefined, // per D-25 + Plan 02-01 contract — all-species aggregate
      tripType: filters.tripType,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      granularity: 'weekly'
    });
  }

  // Build aligned weekly bucket axis.
  // date-fns eachWeekOfInterval produces weeks starting Monday (ISO).
  const fromDateObj = new Date(filters.fromDate + 'T00:00:00Z');
  const toDateObj = new Date(filters.toDate + 'T00:00:00Z');
  const expectedBuckets = eachWeekOfInterval(
    { start: fromDateObj, end: toDateObj },
    { weekStartsOn: 1 }
  ).map((d) => format(d, "RRRR-'W'II"));
  // Polish pass: time-axis ISO start for each bucket so the x-axis renders
  // "May / Jun / Jul" calendar labels instead of "2026-W14 / 2026-W15".
  const bucketStartIsos = expectedBuckets.map(
    (k) => `${isoWeekStartFromKey(k)}T00:00:00Z`
  );

  // Chart styling mirrors the Explorer chart: time-axis x, dataZoom slider,
  // restore-zoom toolbox, bottom legend wrapping at 90%.
  const visibleSeries = rows.filter((r) => r !== null);
  const chartOption = {
    grid: { left: 56, right: 24, top: 36, bottom: 132 },
    toolbox: {
      right: 8,
      top: 4,
      itemSize: 14,
      feature: { restore: { title: 'Reset zoom' } }
    },
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'cross' as const }
    },
    legend: {
      type: 'plain' as const,
      bottom: 36,
      width: '90%',
      data: visibleSeries.map((r) => r!.boat_name)
    },
    dataZoom: [
      { type: 'slider' as const, xAxisIndex: 0, bottom: 4, height: 22 },
      { type: 'inside' as const, xAxisIndex: 0 }
    ],
    xAxis: { type: 'time' as const },
    yAxis: { type: 'value' as const, name: FISH_PER_ANGLER_AXIS },
    series: visibleSeries.map((r) => {
      const presentMap = new Map(
        (trendsByBoat[r!.boat_id] ?? []).map((b) => [b.bucket_key, b.value])
      );
      return {
        name: r!.boat_name,
        type: 'line' as const,
        connectNulls: true, // Polish pass (operator pref): smooth line across no-data gaps
        data: expectedBuckets.map((k, i) => [bucketStartIsos[i], presentMap.get(k) ?? null])
      };
    })
  };

  locals.logger?.info({
    msg: 'compare_loaded',
    tripType: filters.tripType,
    boatCount: filters.boatIds.length
  });

  return {
    filters,
    guidance: null,
    rows,
    chartOption,
    filterOptions,
    lastScrapedLabel,
    allBoats
  };
};
