// src/lib/shared/theme.ts — Phase 8 Plan 04 (THM-01..03, D-26..D-30)
//
// Three-mode theme system: Auto (follow OS) / Light / Dark.
// SSR-driven via the `fc_theme` cookie + transformPageChunk substitution
// (src/hooks.server.ts) so the first paint never flashes the wrong theme.
//
// Trust boundary (T-08-04-01): the cookie value is UNTRUSTED. validateTheme
// accepts ONLY the literal strings 'auto', 'light', 'dark'. Anything else
// (undefined, garbage, HTML-injection attempts like `'" onerror="alert(1)`)
// falls back to 'auto'. This is the single guard for the
// `<html data-theme="...">` attribute substitution.

export const THEME_COOKIE = 'fc_theme';

export const THEME_VALUES = ['auto', 'light', 'dark'] as const;
export type Theme = (typeof THEME_VALUES)[number];

/**
 * Validate a raw cookie value to a Theme literal.
 * Case-sensitive: 'LIGHT' falls back to 'auto'. Pitfall 2 (08-RESEARCH).
 */
export function validateTheme(raw: string | undefined | null): Theme {
  if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw;
  return 'auto';
}
