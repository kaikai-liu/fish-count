// src/routes/boats/[id]/+page.server.ts — Boat detail (BOAT-01, BOAT-02)
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Sources:
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-02, D-23, D-29
//   .planning/phases/02-browse-trip-picker-trends/02-01-SUMMARY.md (getBoatProfile signature)
//
// Security: T-02-24 — params.id validated as positive integer before any DAL call.
// Cache: D-29 — max-age=300 (5 min) for input-derived pages.
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getDb } from '$lib/db/client';
import { getBoatProfile } from '$lib/db/queries/boatDetail';
import { latestSuccessOrEmpty } from '$lib/db/scrapeRuns';
import { today, toPtTimeLabel, addDays } from '$lib/shared/dates';

export const load: PageServerLoad = async ({ params, setHeaders, locals }) => {
  // T-02-24: validate params.id is a numeric string before any DAL interaction.
  if (!/^\d+$/.test(params.id)) {
    throw error(404, 'Invalid boat id.');
  }
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw error(404, 'Invalid boat id.');
  }

  const db = getDb();
  // D-29: boat detail caches 5 min
  setHeaders({ 'cache-control': 'public, max-age=300' });

  // Plan 02-01 ships getBoatProfile(db, boatId, cutoffDate?) — cutoffDate is optional.
  // We pass an explicit cutoffDate so the 90-day window is testable from this loader and
  // so /boats/[id] can later opt into a different window (Phase 5 polish) without changing the DAL.
  const cutoffDate = addDays(today(), -90);
  const profile = getBoatProfile(db, id, cutoffDate);
  if (!profile) {
    throw error(404, 'Boat not found.');
  }

  const lastScrape = latestSuccessOrEmpty(db);
  locals.logger?.info({ msg: 'boat_loaded', boat_id: id });

  return {
    profile,
    lastScrapedLabel: lastScrape ? toPtTimeLabel(lastScrape.finished_at) : null
  };
};
