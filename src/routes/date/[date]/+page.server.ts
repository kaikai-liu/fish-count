// src/routes/date/[date]/+page.server.ts — Past-date view (BRW-05)
// Sources:
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-03, D-29, D-30
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-20 (provisional), D-21 (last-scraped)
//
// No SQL in this file. DAL boundary enforced (CLAUDE.md Architecture Rule).
//
// T-02-14: Route param date validated by regex + calendar check before any DAL call.
// T-02-15: Date clamped to dataset bounds via browse.getDateBounds + dates.clampDate.
// T-02-17: setHeaders is the sole writer of cache-control (hooks.server.ts confirmed clean).
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getDb } from '$lib/db/client';
import {
  getRowsForDate,
  distinctTripTypes,
  distinctLandings,
  distinctSpecies,
  getDateBounds
} from '$lib/db/queries/browse';
import { latestSuccessOrEmpty } from '$lib/db/scrapeRuns';
import { today, toPtTimeLabel, addDays, clampDate, isToday } from '$lib/shared/dates';
import { parseDateFilters } from '$lib/shared/urlState';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const load: PageServerLoad = async ({ params, url, setHeaders, locals }) => {
  const requestedDate = params.date;

  // T-02-14: regex-validate before any further use
  if (!DATE_RE.test(requestedDate)) {
    throw error(404, 'Invalid date format. Use YYYY-MM-DD.');
  }
  // Sanity: not all 8-digit YYYY-MM-DD strings are valid calendars; check via Date parse
  const [y, m, d] = requestedDate.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw error(404, 'Invalid calendar date.');
  }

  const db = getDb();

  // BRW-05: dataset bounds for clamp-to-bounds navigation. browse.getDateBounds returns
  // {min, max} with both null when DB is empty — fall back to today() so page renders
  // without breaking prev/next math.
  const bounds = getDateBounds(db);
  const todayStr = today();
  const minDate = bounds.min ?? todayStr;
  const maxDate = bounds.max ?? todayStr;
  const dateClamped = clampDate(requestedDate, minDate, maxDate);

  // D-29 / D-30: past dates cache 1 day; today's-via-/date caches 60s same as /
  const isTodayDate = isToday(dateClamped);
  if (isTodayDate) {
    setHeaders({ 'cache-control': 'public, max-age=60' });
  } else {
    setHeaders({ 'cache-control': 'public, max-age=86400' });
  }

  const filtersResult = parseDateFilters(url.searchParams);
  const filters = 'error' in filtersResult ? {} : filtersResult;

  let rows = getRowsForDate(db, dateClamped);
  if ('tripType' in filters && filters.tripType) {
    rows = rows.filter((r) => r.trip_type === filters.tripType);
  }
  if ('landing' in filters && filters.landing) {
    rows = rows.filter((r) => r.landing_name === filters.landing);
  }
  if ('species' in filters && filters.species) {
    rows = rows.filter((r) => r.species === filters.species);
  }

  const prevDate = addDays(dateClamped, -1);
  const nextDate = addDays(dateClamped, 1);
  const prevDisabled = prevDate < minDate;
  const nextDisabled = nextDate > maxDate;

  const lastScrape = latestSuccessOrEmpty(db);

  locals.logger?.info({ msg: 'date_loaded', date: dateClamped, rowCount: rows.length });

  return {
    rows,
    date: dateClamped,
    isProvisional: isTodayDate,
    lastScrapedLabel: lastScrape ? toPtTimeLabel(lastScrape.finished_at) : null,
    filters,
    filterOptions: {
      tripTypes: distinctTripTypes(db),
      landings: distinctLandings(db),
      speciesList: distinctSpecies(db)
    },
    nav: {
      prevDate,
      nextDate,
      prevDisabled,
      nextDisabled,
      minDate,
      maxDate
    }
  };
};
