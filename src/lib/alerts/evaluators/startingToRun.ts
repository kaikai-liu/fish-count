// src/lib/alerts/evaluators/startingToRun.ts
// Phase 4 ALT-10: "starting to run" alert evaluator.
//
// PURE FUNCTION — DAL-injected db handle, no module-scope getDb, no fetch, no I/O.
// Mirrors src/lib/alerts/evaluators/hotDay.ts purity contract.
//
// Math (verbatim from 04-RESEARCH.md §"Starting-to-run math"):
//   For each (subscriber, followed_species, trip_type[modal]):
//     rolling7_avg  = SUM(species_count) / SUM(angler_count)  over [today-6d, today] × species × trip_type [fleet-wide]
//     year_ago_avg  = SUM/SUM over [today-1y-3d, today-1y+3d] × species × trip_type
//     if rolling7_avg > 1.5 * year_ago_avg AND year_ago_avg > 0 AND n_boats >= 3 AND year_ago.n_trips >= 5:
//       emit RunCandidate
//
// Honesty floors:
//   - year_ago.n_trips < 5  -> refuse (CLAUDE.md non-negotiable #3 floor extended to alerts)
//   - year_ago_avg <= 0     -> refuse (no division-by-zero false-positives)
//   - rolling7.n_boats < 3  -> refuse (a single boat going on a tear is not "the run" — research A3)
//   - no modal trip_type    -> refuse (no recent activity to anchor comparison)
//
// Trigger key (research Open Question 5; A3 modal-trip_type heuristic):
//   trigger_key  = `species:${species}:${tripType}` where tripType = species' modal trip_type in last 30 days
//   trigger_date = isoWeekMonday(today) — at most one alert per (subscriber, species) per ISO week
import type Database from 'better-sqlite3';
import * as alertEval from '$lib/db/queries/alertEval';
import type { ActiveSubscriberWithFollows } from '$lib/db/subscribers';
import { addDays } from '$lib/shared/dates';

export const RUN_RATIO = 1.5;
export const RUN_BASELINE_MIN_TRIPS = 5;
export const RUN_MIN_REPORTING_BOATS = 3;

export interface RunCandidate {
  subscriberId: number;
  subscriberEmail: string;
  species: string;
  tripType: string; // modal — the comparison anchor
  rolling7Avg: number;
  yearAgoAvg: number;
  multiplier: number; // = rolling7Avg / yearAgoAvg
  nBoats: number;
  triggerDate: string; // ISO-week-Monday in YYYY-MM-DD
  triggerKey: string; // `species:${species}:${tripType}`
}

/**
 * Returns the Monday of the ISO-8601 week containing `today`.
 *
 * Pure function. today=YYYY-MM-DD (Pacific). For ISO-week purposes we treat
 * the date as a calendar date — TZ shifts within the day do not move the
 * ISO week, so the day-of-week calculation runs in UTC, then the final
 * YYYY-MM-DD string is produced via addDays() from src/lib/shared/dates.ts
 * (STO-04 single-producer rule + CLAUDE.md Architecture Rules).
 *
 * Algorithm: getUTCDay returns 0=Sun..6=Sat; convert to 1=Mon..7=Sun (ISO);
 * subtract (isoDow - 1) days from the input date string via addDays().
 *
 * Year-boundary: handled implicitly by addDays' UTC arithmetic. Verified by
 * the "Sunday Jan 3 2027 -> Mon Dec 28 2026" test case.
 */
export function isoWeekMonday(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const isoDow = dow === 0 ? 7 : dow; // 1=Mon..7=Sun (ISO)
  return addDays(today, -(isoDow - 1));
}

export function evaluateStartingToRun(args: {
  today: string;
  subscribers: ActiveSubscriberWithFollows[];
  db: Database.Database;
}): RunCandidate[] {
  const { today, subscribers, db } = args;
  const triggerDate = isoWeekMonday(today);
  // Walk the subscriber set; cache per-species evaluation so multiple subscribers following
  // the same species pay only one round of DAL reads.
  const cache = new Map<string, Omit<RunCandidate, 'subscriberId' | 'subscriberEmail'> | null>();

  function evalSpecies(species: string): Omit<RunCandidate, 'subscriberId' | 'subscriberEmail'> | null {
    if (cache.has(species)) {
      return cache.get(species) ?? null;
    }
    const tripType = alertEval.getModalTripTypeForSpecies(db, today, species, 30);
    if (!tripType) {
      cache.set(species, null);
      return null;
    }
    const rolling = alertEval.getRolling7SpeciesStats(db, today, tripType, species);
    if (!rolling) {
      cache.set(species, null);
      return null;
    }
    if (rolling.n_boats < RUN_MIN_REPORTING_BOATS) {
      cache.set(species, null);
      return null;
    }
    const yearAgo = alertEval.getYearAgoSpeciesStats(db, today, tripType, species);
    if (!yearAgo) {
      cache.set(species, null);
      return null;
    }
    if (yearAgo.n_trips < RUN_BASELINE_MIN_TRIPS) {
      cache.set(species, null);
      return null;
    }
    if (!(yearAgo.year_ago_avg > 0)) {
      cache.set(species, null);
      return null;
    }
    if (!(rolling.rolling7_avg > RUN_RATIO * yearAgo.year_ago_avg)) {
      cache.set(species, null);
      return null;
    }

    const candidate: Omit<RunCandidate, 'subscriberId' | 'subscriberEmail'> = {
      species,
      tripType,
      rolling7Avg: rolling.rolling7_avg,
      yearAgoAvg: yearAgo.year_ago_avg,
      multiplier: rolling.rolling7_avg / yearAgo.year_ago_avg,
      nBoats: rolling.n_boats,
      triggerDate,
      triggerKey: `species:${species}:${tripType}`
    };
    cache.set(species, candidate);
    return candidate;
  }

  const out: RunCandidate[] = [];
  for (const sub of subscribers) {
    for (const sp of sub.species) {
      const res = evalSpecies(sp);
      if (!res) continue;
      out.push({ subscriberId: sub.id, subscriberEmail: sub.email, ...res });
    }
  }
  return out;
}
