// src/lib/shared/range.ts
// Pure range → {fromDate, toDate, granularity, includesToday} mapper.
// Single source of truth for explorer date-window resolution (D-18, D-19, D-20).
// CLAUDE.md Architecture Rule: all date math goes through $lib/shared/dates.
import { today, addDays } from '$lib/shared/dates';

// Polish pass: removed 'custom' preset — the chart's dataZoom slider lets
// users zoom to any sub-range without a separate Custom date-input mode.
export const RANGE_PRESETS = ['1m', '3m', '6m', '1y', '2y', '5y', 'all'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export type Granularity = 'daily' | 'weekly' | 'monthly';

export interface ResolvedRange {
  fromDate: string;
  toDate: string;
  granularity: Granularity;
  includesToday: boolean;
}

const PRESET_DAYS: Record<RangePreset, number> = {
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
  '2y': 365 * 2,
  '5y': 365 * 5,
  'all': 365 * 15 // T-02-31: bounded sentinel — never unbounded
};

const PRESET_GRANULARITY: Record<RangePreset, Granularity> = {
  '1m': 'daily',
  '3m': 'weekly',
  '6m': 'weekly',
  '1y': 'weekly',
  '2y': 'monthly',
  '5y': 'monthly',
  'all': 'monthly'
};

/**
 * Resolve a range preset to concrete fromDate/toDate/granularity/includesToday.
 *
 *   - toDate = today() in PT.
 *   - fromDate = today() - PRESET_DAYS[preset] days.
 *   - includesToday = true always (all presets end at today).
 *   - 'all' range is bounded at 365*15 days (T-02-31 — never unbounded).
 */
export function rangeToDates(range: RangePreset): ResolvedRange {
  const toDate = today();
  const fromDate = addDays(toDate, -PRESET_DAYS[range]);
  return {
    fromDate,
    toDate,
    granularity: PRESET_GRANULARITY[range],
    includesToday: true
  };
}
