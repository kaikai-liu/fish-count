// src/lib/alerts/evaluators/hotDay.ts
// Phase 4 ALT-09: "hot day" alert evaluator.
//
// PURE FUNCTION — DAL-injected db handle, no module-scope getDb, no fetch, no I/O.
// Mirrors the Phase 3 src/lib/forecast/compute.ts purity contract.
//
// Math (verbatim from 04-RESEARCH.md §"Hot-day math"):
//   For each (subscriber, followed_boat, trip_type) where today's catch_reports has rows:
//     today_value   = SUM(species_count) / SUM(angler_count)  over today × boat × trip_type [all species]
//     trailing_avg  = SUM(species_count) / SUM(angler_count)  over [today-30d, today-1d] × boat × trip_type
//     today_anglers = SUM(angler_count)                       over today × boat × trip_type
//     if today_value > 2.0 * trailing_avg AND today_anglers >= MIN_ANGLERS:
//       emit HotDayCandidate
//
// Honesty floor (CLAUDE.md non-negotiable #3 extended to alerts; Pitfall 5 mitigation):
//   - n_days (trailing window) < 5  -> refuse (insufficient baseline)
//   - trailing_avg <= 0             -> refuse (no division-by-zero false-positives)
//   - today_anglers < MIN_ANGLERS   -> refuse (1-angler-fluke defense; default 8 per Open Question 1)
//
// Trigger key (Open Question 5):
//   trigger_key = `boat:${boat_id}:${trip_type}`  -- same boat with two trip types same day
//                                                    yields TWO distinct candidates (correct).
//   trigger_date = today  (YYYY-MM-DD PT)
//
// Env override:
//   HOT_DAY_MIN_ANGLERS — integer; defaults to 8 when unset/non-numeric.
import type Database from 'better-sqlite3';
import * as alertEval from '$lib/db/queries/alertEval';
import type { ActiveSubscriberWithFollows } from '$lib/db/subscribers';

export const HOT_DAY_RATIO = 2.0;
export const HOT_DAY_DEFAULT_MIN_ANGLERS = 8;
export const HOT_DAY_BASELINE_MIN_DAYS = 5; // CLAUDE.md non-negotiable #3 honesty floor

export interface HotDayCandidate {
  subscriberId: number;
  subscriberEmail: string;
  boatId: number;
  boatDisplayName: string; // raw — templates.ts MUST escapeHtml on render (T-04-A9)
  tripType: string; // raw verbatim domain language — templates.ts escapes
  todayValue: number;
  todayAnglers: number;
  trailingAvg: number;
  multiplier: number; // = todayValue / trailingAvg (pre-computed)
  speciesList: string[]; // verbatim names; templates.ts escapes each
  triggerDate: string; // = today (YYYY-MM-DD PT)
  triggerKey: string; // `boat:${boatId}:${tripType}`
}

function readMinAnglers(): number {
  const raw = process.env.HOT_DAY_MIN_ANGLERS;
  if (!raw) return HOT_DAY_DEFAULT_MIN_ANGLERS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return HOT_DAY_DEFAULT_MIN_ANGLERS;
  return n;
}

export function evaluateHotDay(args: {
  today: string;
  subscribers: ActiveSubscriberWithFollows[];
  db: Database.Database;
}): HotDayCandidate[] {
  const { today, subscribers, db } = args;
  const minAnglers = readMinAnglers();

  // 1. Gather today's stats across all (boat, trip_type) pairs that reported today.
  const todayStats = alertEval.getTodayPerBoatTripStats(db, today);
  if (todayStats.length === 0) return [];

  // 2. Gather trailing 30-day baselines for the SAME set of pairs.
  const trailingMap = alertEval.getTrailingBoatTripStats(db, today, 30);

  // 3. Cartesian-by-subscriber: for each subscriber, emit one candidate per followed boat
  //    that has a (boat, trip_type) row in todayStats meeting all four gates.
  const out: HotDayCandidate[] = [];
  for (const sub of subscribers) {
    if (sub.boats.length === 0) continue;
    const followed = new Set(sub.boats);
    for (const t of todayStats) {
      if (!followed.has(t.boat_id)) continue;
      const baseline = trailingMap.get(`${t.boat_id}:${t.trip_type}`);
      // Honesty floor 1: baseline window must have >=5 days of data.
      if (!baseline || baseline.n_days < HOT_DAY_BASELINE_MIN_DAYS) continue;
      // Honesty floor 2: avoid division-by-zero false-positives.
      if (!(baseline.trailing_avg > 0)) continue;
      // ALT-09 sample-size floor: today's trip must have enough anglers to be meaningful.
      if (t.today_anglers < minAnglers) continue;
      // ALT-09 trigger ratio.
      if (!(t.today_value > HOT_DAY_RATIO * baseline.trailing_avg)) continue;
      out.push({
        subscriberId: sub.id,
        subscriberEmail: sub.email,
        boatId: t.boat_id,
        boatDisplayName: t.boat_display_name,
        tripType: t.trip_type,
        todayValue: t.today_value,
        todayAnglers: t.today_anglers,
        trailingAvg: baseline.trailing_avg,
        multiplier: t.today_value / baseline.trailing_avg,
        speciesList: t.species_list,
        triggerDate: today,
        triggerKey: `boat:${t.boat_id}:${t.trip_type}`
      });
    }
  }
  return out;
}
