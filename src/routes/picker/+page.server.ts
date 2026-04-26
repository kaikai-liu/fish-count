// src/routes/picker/+page.server.ts — Trip picker (TRP-01..09)
// CLAUDE.md Architecture Rules: DAL is the only module that issues SQL;
// all dates via src/lib/shared/dates.ts (STO-04).
//
// Sources:
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-08..D-15, D-19, D-28, D-29
//   .planning/phases/02-browse-trip-picker-trends/02-RESEARCH.md §Pitfall 2 (TRP-05 enforcement)
//
// Key invariants:
//   TRP-05: Trip type is REQUIRED. If missing/invalid, load returns guidance state
//           (no rankings) — enforced here at the SERVER, not just in the client form.
//   TRP-07: Low-n boats are NEVER filtered. The query returns all boats; the
//           PerAnglerMetric / LowDataBadge components signal low data visually.
//   D-08:   Ranking = SUM(species_count)/SUM(angler_count) — weighted yield, not
//           mean-of-ratios. Implemented in rankBoatsForQuery (DAL).
//   D-09:   n = COUNT(DISTINCT source_date|trip_type) per boat. Implemented in DAL.
//   D-29:   cache-control: public, max-age=300 (input-derived page).
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db/client';
import {
  rankBoatsForQuery,
  heatmapForQuery,
  type RankedBoat,
  type HeatmapCell
} from '$lib/db/queries/tripPicker';
import {
  forecastHeatmapForQuery,
  type ForecastHeatmapCell
} from '$lib/db/queries/forecastHeatmap';
import { distinctTripTypes, distinctSpecies, mostCommonTripType } from '$lib/db/queries/browse';
import { latestSuccessOrEmpty } from '$lib/db/scrapeRuns';
import { today, toPtTimeLabel, addDays, daysBetween } from '$lib/shared/dates';
import { parsePickerFilters, type PickerFilters } from '$lib/shared/urlState';

// D-21: Phase 3 hybrid heatmap merges Phase 2 actuals + Phase 3 forecasts.
// First three fields ({date, value, n}) are the Phase 2 D-15 contract; forecast
// cells additively carry pi_low/pi_high/gap_present/gap_expected which the Plan
// 03-04 tooltip formatter discriminates by `'pi_low' in cell`.
type AnyHeatmapCell = HeatmapCell | ForecastHeatmapCell;

export const load: PageServerLoad = async ({ url, setHeaders, locals }) => {
  const db = getDb();

  // D-29: picker caches 5 min (input-derived read surface).
  setHeaders({ 'cache-control': 'public, max-age=300' });

  // Filter-bar option lists — always populated regardless of parse result.
  const filterOptions = {
    tripTypes: distinctTripTypes(db),
    speciesList: distinctSpecies(db),
    defaultTripType: mostCommonTripType(db), // D-10: pre-select most common trip type
    defaultDate: today()
  };

  const lastScrape = latestSuccessOrEmpty(db);
  const lastScrapedLabel = lastScrape ? toPtTimeLabel(lastScrape.finished_at) : null;

  // T-02-19: TRP-05 enforcement at the SERVER level.
  // URL bypass (no tripType param) returns guidance state, never rankings.
  // parsePickerFilters validates via Zod — missing tripType fails validation.
  const parseResult = parsePickerFilters(url.searchParams);

  if ('error' in parseResult || !url.searchParams.get('tripType')) {
    // No valid filters (or tripType explicitly missing) → render guidance form only.
    locals.logger?.info({ msg: 'picker_guidance', reason: 'missing_or_invalid_filters' });
    return {
      filters: null,
      guidance: 'Pick a date, target species, and trip type to start.',
      rankings: null as RankedBoat[] | null,
      heatmap: null as AnyHeatmapCell[] | null,
      horizonTooFar: false,
      heatmapHorizonMessage: null as string | null,
      why: null as Record<number, WhyPanel> | null,
      windowStart: null as string | null,
      windowEnd: null as string | null,
      heatmapRange: null as { from: string; to: string } | null,
      filterOptions,
      lastScrapedLabel
    };
  }

  const filters = parseResult as PickerFilters;

  // Compute the ranking window.
  // Range mode: explicit fromDate / toDate supplied by user.
  // Single mode: target date ± windowDays (D-11).
  let fromDate: string;
  let toDate: string;
  if (filters.rangeMode && filters.fromDate && filters.toDate) {
    fromDate = filters.fromDate;
    toDate = filters.toDate;
  } else {
    fromDate = addDays(filters.date, -filters.windowDays);
    toDate = addDays(filters.date, filters.windowDays);
  }

  const rankings = rankBoatsForQuery(db, {
    fromDate,
    toDate,
    species: filters.species,
    tripType: filters.tripType
  });

  // D-21 + RESEARCH §4: capture the PT calendar date ONCE per request and
  // reuse for horizon check AND past/future split. Re-reading inside the load
  // body can produce DST-boundary inconsistency within a single request.
  const todayPt = today();

  // D-10 (FCT-07): >30-day target → render "horizon too far" message; rankings
  // still computed below (historical actuals unaffected by horizon cap).
  const horizonDaysOut = daysBetween(todayPt, filters.date);
  const horizonTooFar = horizonDaysOut > 30;

  // Heatmap: 30-cell window starting at target date (or rangeMode fromDate).
  // D-13: 30 days starting on the selected target date.
  const heatmapStart = filters.rangeMode && filters.fromDate ? filters.fromDate : filters.date;
  const heatmapEnd = addDays(heatmapStart, 29);

  let heatmap: AnyHeatmapCell[] | null = null;
  let heatmapHorizonMessage: string | null = null;

  if (horizonTooFar) {
    // D-10 verbatim copy. Heatmap area renders the message in place of the calendar.
    heatmapHorizonMessage = 'horizon too far — historical data only';
  } else {
    // D-21 hybrid composer: past cells from catch_reports actuals; today/future
    // cells from precomputed forecasts. Two queries, then merge by date.
    const pastEnd = addDays(todayPt, -1); // last "past" date (inclusive)
    const futureStart = todayPt; // first "today/future" date (inclusive)

    // Past range: heatmapStart .. min(heatmapEnd, pastEnd)
    const pastRangeEnd = pastEnd < heatmapEnd ? pastEnd : heatmapEnd;
    const pastCells: HeatmapCell[] =
      heatmapStart <= pastRangeEnd
        ? heatmapForQuery(db, {
            fromDate: heatmapStart,
            toDate: pastRangeEnd,
            species: filters.species,
            tripType: filters.tripType
          })
        : [];

    // Future range: max(heatmapStart, futureStart) .. heatmapEnd
    const futureRangeStart = heatmapStart > futureStart ? heatmapStart : futureStart;
    const futureCells: ForecastHeatmapCell[] =
      futureRangeStart <= heatmapEnd
        ? forecastHeatmapForQuery(db, {
            fromDate: futureRangeStart,
            toDate: heatmapEnd,
            species: filters.species,
            tripType: filters.tripType
          })
        : [];

    // Merge into one map keyed by date. Forecast cells (additive shape) win
    // over past cells if both happened to map to the same date — by
    // construction they do not (pastEnd < futureStart), but ordering is
    // explicit for safety.
    const presentMap = new Map<string, AnyHeatmapCell>();
    for (const c of pastCells) presentMap.set(c.date, c);
    for (const c of futureCells) presentMap.set(c.date, c);

    // Gap-fill the full 30-cell array. Dates absent from both sources get a
    // stub cell with value=null, n=0 (D-14 gray render).
    const cells: AnyHeatmapCell[] = [];
    for (let i = 0; i < 30; i++) {
      const d = addDays(heatmapStart, i);
      cells.push(presentMap.get(d) ?? { date: d, value: null, n: 0 });
    }
    heatmap = cells;
  }

  // D-28: "Why this boat?" panel data — computed server-side, present per row.
  // Phase 2 shortcut: best-day uses the boat's last_trip_date + avg_per_angler.
  // Phase 3 can extend this to per-day breakdown without changing the loader API.
  const why: Record<number, WhyPanel> = {};
  for (const r of rankings) {
    why[r.boat_id] = {
      species: filters.species,
      tripType: filters.tripType,
      windowStart: fromDate,
      windowEnd: toDate,
      bestDay:
        r.last_trip_date && r.avg_per_angler !== null
          ? { date: r.last_trip_date, value: r.avg_per_angler }
          : null
    };
  }

  locals.logger?.info({
    msg: 'picker_loaded',
    species: filters.species,
    tripType: filters.tripType,
    rankingCount: rankings.length,
    windowDays: filters.windowDays
  });

  return {
    filters,
    guidance: null,
    rankings,
    heatmap, // null when horizonTooFar
    horizonTooFar,
    heatmapHorizonMessage, // D-10 verbatim message when horizonTooFar; else null
    why,
    windowStart: fromDate,
    windowEnd: toDate,
    heatmapRange: horizonTooFar ? null : { from: heatmapStart, to: heatmapEnd },
    filterOptions,
    lastScrapedLabel
  };
};

// ---------------------------------------------------------------------------
// Local types (not exported — the route owns this; BoatCard receives it as props)
// ---------------------------------------------------------------------------

interface WhyPanel {
  species: string;
  tripType: string;
  windowStart: string;
  windowEnd: string;
  bestDay: { date: string; value: number } | null;
}
