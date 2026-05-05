// src/lib/copy/home.ts — Phase 8 home-page copy constants (HOME-01..05).
//
// Single source of truth for the home-page user-facing strings. Verbatim
// per .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-09, §D-34 —
// do NOT paraphrase. CLAUDE.md domain-language rule applies: "fish/angler"
// (never "per rod" / "per person"); never collapse trip-type labels.
//
// Why a separate file (not metrics.ts): metrics.ts is scoped to the per-angler
// metric. A separate home.ts keeps both modules' purposes legible. (Pattern
// set by Phase 7's moon.ts — same rationale.)

export const HOME_PAGE_TITLE = "What's been biting — FishCount";
export const HOME_PAGE_HEADING = "What's been biting";

/** D-09 supporting line under the title. fromDate, toDate are PT YYYY-MM-DD. */
export const HOME_PAGE_SUBTITLE = (fromDate: string, toDate: string): string =>
  `Past 7 days · ${fromDate} → ${toDate}`;

/**
 * D-09 per-section heading: trip-type label + this-week trip count.
 * Trip-type label is rendered verbatim from the alias DAL (CLAUDE.md domain
 * language); we never paraphrase "1/2 Day AM" → "Half-Day AM" etc.
 */
export const sectionHeading = (canonicalLabel: string, tripCount: number): string =>
  `${canonicalLabel} · ${tripCount} ${tripCount === 1 ? 'trip' : 'trips'} this week`;

/**
 * D-09 per-row line: fpa headline + n=1-honest trip count.
 * "fish/angler" literal is the project's locked metric label per CLAUDE.md.
 */
export const ROW_FPA_LINE = (fpa: number, tripCount: number): string =>
  `${fpa.toFixed(1)} fish/angler · ${tripCount} ${tripCount === 1 ? 'trip' : 'trips'}`;

/**
 * D-09 supporting context line: raw catch / angler totals beside the fpa
 * headline. Mirrors the spike report's "Premier · 5.5 fish/angler · 45
 * anglers · 247 total" framing — gives the operator what the source-site
 * gives them, without the fpa noise.
 */
export const ROW_TOTALS_LINE = (totalCaught: number, totalAnglers: number): string =>
  `${totalAnglers} ${totalAnglers === 1 ? 'angler' : 'anglers'} · ${totalCaught} total`;

export const EMPTY_HOME_HEADING = "Nothing scraped in the last 7 days";
export const EMPTY_HOME_BODY =
  "The nightly scraper may be down — try again later, or check the explorer.";
export const EMPTY_HOME_CTA = { label: 'Open the explorer', href: '/explorer' };
