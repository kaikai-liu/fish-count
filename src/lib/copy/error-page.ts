// src/lib/copy/error-page.ts — Phase 8 Plan 04 (POL-01 / D-31)
//
// Single source for error-boundary copy. Tone per CLAUDE.md "trust the
// audience" — plain English, neutral, not jokey, not apologetic-grovelling.
// "Page not found" + a plain explanation; "Something broke" + a plain "try
// again" prompt. The boundary itself never leaks the raw error message —
// only a static heading + body from this module.

export const ERROR_HEADINGS = {
  notFound: 'Page not found',
  generic: 'Something broke on our end'
} as const;

export const ERROR_BODIES = {
  notFound:
    "We couldn't find that page — it may have been retired in v2. Try the explorer or head back home.",
  generic:
    "An unexpected error happened while loading this page. Please try again, or head back home if it persists."
} as const;
