// src/lib/copy/moon.ts — Phase 7 moon-overlay copy constants
//
// Single source of truth for every Phase 7 moon-overlay user-facing string.
// Strings are locked verbatim by .planning/phases/07-moon-phase-overlay/07-UI-SPEC.md
// §Copywriting Contract — do NOT paraphrase.
//
// Why a separate file (not an extension of src/lib/copy/metrics.ts): metrics.ts is
// allowlisted by the per-angler-discipline lint and should stay scoped to per-angler
// copy. A separate moon.ts keeps both modules' purposes legible.

/** MoonToggle visible button label.
 *  Punchy fit for the range-strip rhythm — UI-SPEC §Copywriting Contract rationale:
 *  "Show moon phases" is too long for the desktop range-strip row. */
export const MOON_TOGGLE_LABEL = 'Moon';

/** MoonToggle aria-label — full plain-English phrase for screen readers.
 *  CLAUDE.md "trust the audience" / plain English; "lunar overlay" rejected as jargon. */
export const MOON_TOGGLE_ARIA = 'Show moon phases';

/** MoonRow chart container aria-label.
 *  Passed to <Chart> ariaLabel prop. Tells screen readers what the visual represents
 *  (illumination, the continuous quantity) and why it is there (same time range as
 *  the catch chart above). */
export const MOON_ROW_ARIA = 'Moon illumination over the same time range';
