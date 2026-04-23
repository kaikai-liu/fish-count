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
