// src/routes/+page.server.ts — Home loader (Phase 8 HOME-01..05).
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Sources:
//   .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-07..D-15 (home page)
//   .planning/phases/08-home-retire-polish/08-RESEARCH.md §"Home-Page Section Query"
//   .planning/phases/08-home-retire-polish/08-PATTERNS.md §"src/routes/+page.server.ts"
//
// Replaces the v1 today's-counts loader. Behaviors:
//   - Past-7-days window (no today-fallback bug, by definition).
//   - No URL state (D-14): /?anything === /.
//   - Cache-Control: public, max-age=300 — D-15 hot-path discipline.
//   - locals.logger info on every load with section count and window dates.
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db/client';
import { homeSections } from '$lib/db/queries/home';
import { latestSuccessOrEmpty } from '$lib/db/scrapeRuns';
import { today, addDays, toPtTimeLabel } from '$lib/shared/dates';

export const load: PageServerLoad = async ({ setHeaders, locals }) => {
  const db = getDb();
  const toDate = today();
  const fromDate = addDays(toDate, -7);

  // D-15: Cache-Control discipline — past-7d view, no today-provisional flag,
  // 5-minute public cache matches Phase 6's hot-path queries.
  setHeaders({ 'cache-control': 'public, max-age=300' });

  const sections = homeSections(db, { fromDate, toDate, minTrips: 5, perSection: 5 });
  const lastScrape = latestSuccessOrEmpty(db);
  const lastScrapedLabel = lastScrape ? toPtTimeLabel(lastScrape.finished_at) : null;

  locals.logger?.info({
    msg: 'home_loaded',
    sections: sections.length,
    fromDate,
    toDate
  });

  return { sections, fromDate, toDate, lastScrapedLabel };
};
