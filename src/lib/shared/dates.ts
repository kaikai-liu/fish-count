// All dates are YYYY-MM-DD in America/Los_Angeles (CLAUDE.md Architecture Rules).
// This module is the SOLE producer of date strings in the entire project.
const TZ = 'America/Los_Angeles';

/** Today's date as YYYY-MM-DD in Pacific time. */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

/** Format any Date as YYYY-MM-DD in Pacific time. */
export function toIsoDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

/** Get the current Pacific-time month (1-12). Used by billing-watcher state tracking. */
export function currentPtMonth(): number {
  const s = today(); // YYYY-MM-DD
  return Number(s.split('-')[1]);
}

/**
 * Add (or subtract, with negative n) calendar days to a YYYY-MM-DD string.
 * Pure: input string -> output string. Does NOT derive "now".
 * Pattern: see scrapeRuns.ts::addOneDay (UTC arithmetic; STO-04 compliant).
 */
export function addDays(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Inclusive day count between two YYYY-MM-DD strings (b - a). Negative if b < a. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

/** Clamp a YYYY-MM-DD string into [min, max] inclusive (string-comparable). */
export function clampDate(s: string, min: string, max: string): string {
  if (s < min) return min;
  if (s > max) return max;
  return s;
}

/** Provisional-badge rule (D-20): is this YYYY-MM-DD string equal to today() in PT? */
export function isToday(s: string): boolean {
  return s === today();
}

/** Cache-header rule (D-30): is this YYYY-MM-DD string strictly before today() in PT? */
export function isPast(s: string): boolean {
  return s < today();
}

/**
 * ISO-week bucket key "YYYY-Www". Matches SQLite strftime('%G-W%V', ...).
 * Verified: 2024-12-30 -> "2025-W01" (ISO week year boundary).
 */
export function isoWeekKey(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // ISO week algorithm: Thursday in current week determines the year.
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const isoYear = dt.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** Calendar-month bucket key "YYYY-MM". Matches SQLite strftime('%Y-%m', ...). */
export function monthKey(s: string): string {
  return s.slice(0, 7);
}

/** Format an ISO-8601 timestamp as "HH:MM PT" (24-hour). For "Last scraped at" indicator. */
export function toPtTimeLabel(iso: string): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(iso));
  return `${fmt} PT`;
}
