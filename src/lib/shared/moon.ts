// src/lib/shared/moon.ts — Pure moon-illumination function (Phase 7, MOON-03).
// Deterministic from a YYYY-MM-DD date string in PT (CLAUDE.md Architecture Rule:
// all dates flow through src/lib/shared/dates.ts — moon math accepts the same
// YYYY-MM-DD format). This module is the SOLE producer of moon values.
// CLAUDE.md Architecture Rule: this module issues no SQL, makes no network calls,
// and uses no Date.now() (MOON-03 — no API, no DB column, no I/O).
//
// Algorithm: synodic-month phase-fraction (Conway-style approximation) anchored on
// the 2000-01-06 18:14 UTC reference new moon (JD 2451550.1) with synodic length
// 29.530588853 days. Accuracy is well within ±0.05 at every full/new moon — verified
// by tests/unit/shared/moon.test.ts against NASA/USNO 2026 anchor dates.

import { addDays, daysBetween } from './dates';

const SYNODIC_MONTH = 29.530588853;
const REF_NEW_MOON_JD = 2451550.1; // 2000-01-06 18:14 UTC

/** Julian Day Number for a YYYY-MM-DD date interpreted at 00:00 PT (08:00 UTC).
 *  Pure: parses the string the same way dates.ts:37 does — no Date constructor. */
function julianDay(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  // Standard JD algorithm (Fliegel & Van Flandern, valid Gregorian from 1582 onward).
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  const jdn =
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045;
  // 00:00 PT = 08:00 UTC, so subtract 16/24 from JDN-at-noon to get JD-at-PT-midnight.
  return jdn - 0.5 + 8 / 24;
}

/** Moon illumination fraction in [0, 1] for a YYYY-MM-DD date in PT.
 *  0 = new moon (curve trough), 1 = full moon (curve peak). Deterministic. */
export function moonIllumination(s: string): number {
  const daysSinceRef = julianDay(s) - REF_NEW_MOON_JD;
  // Modulo with sign correction (works for dates before the reference too).
  const phaseFraction =
    (((daysSinceRef % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH) / SYNODIC_MONTH;
  // Cosine wave: phaseFraction=0 → illumination=0 (new); phaseFraction=0.5 → 1 (full).
  return (1 - Math.cos(2 * Math.PI * phaseFraction)) / 2;
}

/** One illumination value per inclusive day in [fromDate, toDate].
 *  Used by the explorer loader to populate the moon series for the visible range.
 *  Iterates via dates.ts::addDays — never the Date constructor. */
export function moonIlluminationSeries(fromDate: string, toDate: string): number[] {
  const n = daysBetween(fromDate, toDate);
  const out: number[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    out[i] = moonIllumination(addDays(fromDate, i));
  }
  return out;
}
