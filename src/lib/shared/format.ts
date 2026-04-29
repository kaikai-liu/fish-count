// src/lib/shared/format.ts
// UI-SPEC §FLAG #9 mitigation: single shared formatter for per-angler values.
// Used by both <PerAnglerMetric>.svelte (web) AND $lib/email/buildEmail (Plan 03 email composer).
//
// Decimal rule (CLAUDE.md non-negotiable #3): integer when ≥10, one-decimal when <10
// with trailing .0 stripped, '—' when value=null/NaN or nTrips=0. Never two decimals.
//
// Source: extracted from src/lib/components/PerAnglerMetric.svelte lines 31-46 (historical branch).
// The forecast branch ('not enough history' literal) lives in PerAnglerMetric.svelte and stays there —
// emails do not render forecast values; only historical actuals appear in alert emails.

export function formatPerAngler(value: number | null, nTrips: number): string {
  if (value === null || Number.isNaN(value) || nTrips === 0) return '—';
  if (value >= 10) return String(Math.round(value));
  const fixed = value.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

/**
 * UI-SPEC §"Email masking rule": render an email as "f***@d***.com" — first
 * character of local part + first character of domain only. Used by:
 *   - /alerts/pending success page (post-signup)
 *   - /alerts/unsubscribe success page
 *   - tests of anti-enumeration discipline
 *
 * Returns '—' on malformed input (no @). Never throws.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '—';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  if (dot <= 0) return '—';
  const tld = domain.slice(dot + 1);
  return `${local[0]}***@${domain[0]}***.${tld}`;
}
