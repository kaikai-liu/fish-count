// src/lib/alerts/honeypot.ts
// Phase 4 ALT-03: honeypot field check. Pure — no I/O, no DB.
//
// UI-SPEC §"Anti-enumeration rule" + §FLAG #11: when filled, the SERVER renders
// the same generic-success page as a real signup. The bot cannot distinguish.
// Field name `website` per UI-SPEC §FLAG #11 (common-enough to attract dumb bots,
// never a real signup field for FishCount).

/**
 * Returns true iff the honeypot field is non-empty after trimming.
 * Whitespace-only counts as empty (legitimate browsers may insert no value;
 * dumb auto-fillers insert a URL or any non-empty string).
 */
export function isFilled(websiteFieldValue: string | undefined | null): boolean {
  return typeof websiteFieldValue === 'string' && websiteFieldValue.trim().length > 0;
}
