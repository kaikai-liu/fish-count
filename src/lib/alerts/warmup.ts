// src/lib/alerts/warmup.ts
// Phase 4 ALT-12: warm-up daily cap. Pure decision; caller computes today's count.
//
// Schedule (UI-SPEC §"Ramp-up disclosure"):
//   day 0..6:    50/day   (week 1)
//   day 7..13:  200/day   (week 2)
//   day >= 14:  unlimited (Number.POSITIVE_INFINITY)
//   day < 0:    0         (warm-up not started — safety floor)
//
// `WARMUP_START_DATE` env var (YYYY-MM-DD PT) anchors the schedule. When unset,
// the dispatcher (Plan 07) treats the system as past warm-up (cap = Infinity) —
// the operator knows when they've crossed the warm-up window from their own deploy.
import { daysBetween } from '$lib/shared/dates';

/**
 * Returns the daily send cap given today's date and the configured warm-up start.
 *
 * When `warmupStartDate` is null or undefined (env var unset), the system is treated
 * as past the warm-up window (cap = Infinity). The dispatcher (Plan 07) consequently
 * never queues alerts in that mode — operator opts in to warm-up by setting the env.
 */
export function dailyCap(today: string, warmupStartDate: string | null | undefined): number {
  if (!warmupStartDate) return Number.POSITIVE_INFINITY;
  const day = daysBetween(warmupStartDate, today);
  if (day < 0) return 0;
  if (day < 7) return 50;
  if (day < 14) return 200;
  return Number.POSITIVE_INFINITY;
}

/** Returns true iff one more send fits under the cap. */
export function withinCap(sentCountToday: number, cap: number): boolean {
  return sentCountToday < cap;
}
