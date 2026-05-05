// src/lib/shared/normalize.ts — Pure helpers for the home page's per-section bar widths.
// Sources:
//   .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-10 (per-section, not global)
//   .planning/phases/08-home-retire-polish/08-PATTERNS.md §"BoatBarRow.svelte"
//
// Design rule (D-10): bars normalize to the section's OWN max fpa. The 30×
// scale variance between Overnight (~1 fpa) and 3.5 Day (~35 fpa) would
// compress the short-trip sections into invisibility on a global axis, so
// every section gets its own 0..100 scale.

/**
 * Returns the inline-style width percentage (0..100) for a single bar row,
 * given its fpa value and the section's max fpa.
 *
 * Edge cases:
 *   - sectionMax === 0       → returns 0 (degenerate: every row's fpa is 0).
 *                               Avoids NaN / Infinity from division.
 *   - rowFpa > sectionMax    → clamps to 100. In production this should be
 *                               impossible (sectionMax is the section's max),
 *                               but we guard against fpa floating-point drift
 *                               or future caller bugs.
 *   - rowFpa < 0             → clamps to 0 (defensive — fpa is non-negative
 *                               in practice but caller bugs shouldn't paint
 *                               bars in the wrong direction).
 */
export function barWidthPct(rowFpa: number, sectionMax: number): number {
  if (!Number.isFinite(rowFpa) || !Number.isFinite(sectionMax)) return 0;
  if (sectionMax <= 0) return 0;
  if (rowFpa <= 0) return 0;
  const pct = (rowFpa / sectionMax) * 100;
  if (pct > 100) return 100;
  return pct;
}
