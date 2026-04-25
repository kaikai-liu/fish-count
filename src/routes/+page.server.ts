// src/routes/+page.server.ts — Home (today's per-boat counts)
// Sources:
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-03, D-20, D-21, D-29
//   .planning/phases/02-browse-trip-picker-trends/02-RESEARCH.md §Pattern 1
//
// No SQL in this file. DAL boundary enforced (CLAUDE.md Architecture Rule).
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db/client';
import {
  getRowsForDate,
  distinctTripTypes,
  distinctLandings,
  distinctSpecies
} from '$lib/db/queries/browse';
import { latestSuccessOrEmpty } from '$lib/db/scrapeRuns';
import { today, toPtTimeLabel } from '$lib/shared/dates';
import { parseHomeFilters } from '$lib/shared/urlState';

export const load: PageServerLoad = async ({ url, setHeaders, locals }) => {
  const db = getDb();
  const todayStr = today();

  // D-29: today's page caches 60s (still reporting)
  setHeaders({ 'cache-control': 'public, max-age=60' });

  // Parse filters from URL search params; fall back to empty on parse error
  const filtersResult = parseHomeFilters(url.searchParams);
  const filters = 'error' in filtersResult ? {} : filtersResult;

  // Get today's rows then apply in-memory filters
  let rows = getRowsForDate(db, todayStr);
  if ('tripType' in filters && filters.tripType) {
    rows = rows.filter((r) => r.trip_type === filters.tripType);
  }
  if ('landing' in filters && filters.landing) {
    rows = rows.filter((r) => r.landing_name === filters.landing);
  }
  if ('species' in filters && filters.species) {
    rows = rows.filter((r) => r.species === filters.species);
  }

  const lastScrape = latestSuccessOrEmpty(db);
  const tripTypes = distinctTripTypes(db);
  const landings = distinctLandings(db);
  const speciesList = distinctSpecies(db);

  locals.logger?.info({ msg: 'home_loaded', date: todayStr, rowCount: rows.length });

  return {
    rows,
    date: todayStr,
    isProvisional: true, // D-20: today is always provisional
    lastScrapedLabel: lastScrape ? toPtTimeLabel(lastScrape.finished_at) : null,
    filters,
    filterOptions: { tripTypes, landings, speciesList }
  };
};
