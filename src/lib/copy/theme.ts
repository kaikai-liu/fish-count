// src/lib/copy/theme.ts — Phase 8 Plan 04 (THM-01, D-27)
//
// Single source of truth for theme-toggle user-facing strings.
// CLAUDE.md "trust the audience" — plain English; aria-label spells out the
// CURRENT state and what clicking will do, not just the next state. This is
// the explicit fix for the original D-27 critical bug surface (toggle that
// only describes its action, leaving screen reader users guessing the state).

import type { Theme } from '$lib/shared/theme';

const STATE_LABEL: Record<Theme, string> = {
  auto: 'Auto (follow system)',
  light: 'Light',
  dark: 'Dark'
};

const NEXT: Record<Theme, Theme> = {
  auto: 'light',
  light: 'dark',
  dark: 'auto'
};

/**
 * Aria-label format: "Theme: <current>. Click for <next>."
 * Reflects the CURRENT state first (D-27).
 */
export function themeToggleAria(current: Theme): string {
  return `Theme: ${STATE_LABEL[current]}. Click for ${STATE_LABEL[NEXT[current]]}.`;
}

/** Tooltip / hover hint — shorter, doesn't repeat current state. */
export const THEME_TOGGLE_TOOLTIP = 'Cycles Auto → Light → Dark';
