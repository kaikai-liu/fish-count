// src/lib/copy/empty-states.ts — Phase 8 Plan 04 (POL-03 / D-33)
//
// Empty-state copy variants. D-33 contract: distinguish "this ticker has no
// history at all" from "history exists, just outside the current range."
// The first invites patience (the boat may not have run any trips); the
// second invites a tweak (widen the range or pick a different ticker).
//
// Variants are shaped per ticker × scenario. Each is a function so the
// concrete name is interpolated at render time (CLAUDE.md domain-language
// rule: pass the verbatim source label, never collapse).

export const EMPTY_STATES = {
  // Boat has zero rows in catch_reports IGNORING the current range.
  boatNoHistoryAtAll: (name: string) => ({
    heading: `${name} has no scraped trips yet`,
    body: 'This boat may have only run trips outside our scrape window. Check back later.'
  }),

  // Boat exists in catch_reports but no rows in the current range.
  boatNoHistoryInRange: (name: string) => ({
    heading: `No ${name} trips in this range`,
    body: 'Try widening the time range, or pick a different boat.'
  }),

  // Species has zero rows in the current range (the species itself may be in
  // the catalog from another time period).
  speciesNoHistoryInRange: (name: string) => ({
    heading: `No ${name} catches in this range`,
    body: 'Try widening the time range, or pick a different species.'
  }),

  // Landing has zero rows in the current range.
  landingNoHistoryInRange: (name: string) => ({
    heading: `No trips from ${name} in this range`,
    body: 'Try widening the time range, or pick a different landing.'
  }),

  // /compare default state — user hasn't picked enough to render anything.
  compareNoSelection: () => ({
    heading: 'Pick a date and target boats',
    body: 'Select a trip type, a date range, and 2 or 3 boats to compare their historical catch rates.'
  })
} as const;
