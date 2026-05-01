// src/lib/shared/range.ts
// Pure range → {fromDate, toDate, granularity, includesToday} mapper.
// Single source of truth for explorer date-window resolution (D-18, D-19, D-20).
// CLAUDE.md Architecture Rule: all date math goes through $lib/shared/dates.
import { today, addDays } from '$lib/shared/dates';

export const RANGE_PRESETS = ['1m', '3m', '6m', '1y', '2y', '5y', 'all', 'custom'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export type Granularity = 'daily' | 'weekly' | 'monthly';

export interface ResolvedRange {
  fromDate: string;
  toDate: string;
  granularity: Granularity;
  includesToday: boolean;
}

const PRESET_DAYS: Record<Exclude<RangePreset, 'custom'>, number> = {
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
  '2y': 365 * 2,
  '5y': 365 * 5,
  'all': 365 * 15 // T-02-31: bounded sentinel — never unbounded
};

const PRESET_GRANULARITY: Record<Exclude<RangePreset, 'custom'>, Granularity> = {
  '1m': 'daily',
  '3m': 'weekly',
  '6m': 'weekly',
  '1y': 'weekly',
  '2y': 'monthly',
  '5y': 'monthly',
  'all': 'monthly'
};

/**
 * Pick granularity for a custom range based on span in days (D-18).
 * - ≤ 45 days  → daily
 * - ≤ 730 days → weekly
 * - > 730 days → monthly
 */
export function chooseGranularity(spanDays: number): Granularity {
  if (spanDays <= 45) return 'daily';
  if (spanDays <= 365 * 2) return 'weekly';
  return 'monthly';
}

/**
 * Compute span in days between two YYYY-MM-DD strings using pure integer
 * arithmetic (Howard Hinnant civil-epoch algorithm). No Date objects —
 * safe against DST and the STO-04 date-boundary lint.
 */
function spanDays(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);

  const toOrdinal = (y: number, m: number, d: number): number => {
    const yp = m <= 2 ? y - 1 : y;
    const era = Math.floor(yp / 400);
    const yoe = yp - era * 400;
    const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe;
  };

  return toOrdinal(ty, tm, td) - toOrdinal(fy, fm, fd);
}

/**
 * Resolve a range preset (or custom) to concrete fromDate/toDate/granularity/includesToday.
 *
 * For custom ranges:
 *   - Requires `custom` param with both fromDate and toDate.
 *   - fromDate must be <= toDate (defensive throw; Zod upstream enforces before this is called).
 *   - Granularity is determined by the span (D-18).
 *
 * For preset ranges:
 *   - toDate = today() in PT.
 *   - fromDate = today() - PRESET_DAYS[preset] days.
 *   - includesToday = true always (all presets end at today).
 *   - 'all' range is bounded at 365*15 days (T-02-31 — never unbounded).
 */
export function rangeToDates(
  range: RangePreset,
  custom?: { fromDate: string; toDate: string }
): ResolvedRange {
  if (range === 'custom') {
    if (!custom) throw new Error('custom range requires fromDate and toDate');
    if (custom.fromDate > custom.toDate) throw new Error('fromDate must be <= toDate');
    const span = spanDays(custom.fromDate, custom.toDate);
    return {
      fromDate: custom.fromDate,
      toDate: custom.toDate,
      granularity: chooseGranularity(span),
      includesToday: custom.toDate >= today()
    };
  }

  const toDate = today();
  const fromDate = addDays(toDate, -PRESET_DAYS[range]);
  return {
    fromDate,
    toDate,
    granularity: PRESET_GRANULARITY[range],
    includesToday: true
  };
}
