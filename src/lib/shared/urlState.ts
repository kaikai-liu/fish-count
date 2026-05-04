// src/lib/shared/urlState.ts — Typed parse + serialize for Phase 2 route filter state.
// CLAUDE.md Architecture Rule: All filter state lives in $page.url.searchParams (D-18).
//
// Sources:
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-18, D-19
//
// Trust boundary: URL search params are UNTRUSTED user input (T-02-02).
// All parse functions run Zod safeParse; failures return {error: ZodError}.
// Callers treat {error} as "render guidance" (no rankings / no chart).
//
// Pattern:
//   parse{Route}Filters(sp: URLSearchParams): T | { error: ZodError }
//   serialize{Route}Filters(filters: T): URLSearchParams
//
// Zod coercions:
//   - Numeric fields: z.coerce.number().int() — handles strings from query params.
//   - Boolean fields: z.coerce.boolean() — "true"/"false" strings from query params.
//   - Date fields: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) — T-02-02 date format guard.
//   - windowDays: clamped to [0, 14] (T-02-03 DoS guard + D-11 range).
//
// Array fields (compare.boatIds): URLSearchParams encodes arrays as repeated keys.
// We handle this with sp.getAll('boatIds') before Zod, then validate the array.
import { z, ZodError } from 'zod';

// ---------------------------------------------------------------------------
// Shared validators
// ---------------------------------------------------------------------------

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const dateField = z.string().regex(dateRegex, 'Must be YYYY-MM-DD');

// ---------------------------------------------------------------------------
// Date-view filters ( /date/[YYYY-MM-DD] )
// The date itself is the route param; optional filter-bar filters.
// ---------------------------------------------------------------------------

export const DateFiltersSchema = z.object({
  tripType: z.string().optional(),
  landing: z.string().optional(),
  species: z.string().optional()
});

export type DateFilters = z.infer<typeof DateFiltersSchema>;

export function parseDateFilters(sp: URLSearchParams): DateFilters | { error: ZodError } {
  const result = DateFiltersSchema.safeParse(Object.fromEntries(sp.entries()));
  if (!result.success) return { error: result.error };
  return result.data;
}

export function serializeDateFilters(filters: DateFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.tripType) sp.set('tripType', filters.tripType);
  if (filters.landing) sp.set('landing', filters.landing);
  if (filters.species) sp.set('species', filters.species);
  return sp;
}

// ---------------------------------------------------------------------------
// Compare filters ( /compare )
// Required: tripType, fromDate, toDate, boatIds[] (2–3 boats).
// boatIds uses getAll() because URLSearchParams repeats the key.
// ---------------------------------------------------------------------------

export const CompareFiltersSchema = z.object({
  tripType: z.string().min(1, 'tripType is required'),
  fromDate: dateField,
  toDate: dateField,
  boatIds: z.array(z.coerce.number().int().positive()).min(2).max(3)
});

export type CompareFilters = z.infer<typeof CompareFiltersSchema>;

export function parseCompareFilters(sp: URLSearchParams): CompareFilters | { error: ZodError } {
  // Accept both the canonical repeated-key form (?boatIds=1&boatIds=2&boatIds=3,
  // produced by serializeCompareFilters) and the comma form (?boatIds=1,2,3,
  // which the form's text input naturally produces when a user copies and
  // pastes the boat IDs into a URL bar).
  const boatIds = sp
    .getAll('boatIds')
    .flatMap((v) => v.split(','))
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number);
  const raw = {
    tripType: sp.get('tripType') ?? undefined,
    fromDate: sp.get('fromDate') ?? undefined,
    toDate: sp.get('toDate') ?? undefined,
    boatIds
  };
  const result = CompareFiltersSchema.safeParse(raw);
  if (!result.success) return { error: result.error };
  return result.data;
}

export function serializeCompareFilters(filters: CompareFilters): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set('tripType', filters.tripType);
  sp.set('fromDate', filters.fromDate);
  sp.set('toDate', filters.toDate);
  for (const id of filters.boatIds) {
    sp.append('boatIds', String(id));
  }
  return sp;
}

// ---------------------------------------------------------------------------
// Explorer filters ( /explorer )
// Phase 6: D-12 (boat → slug), D-14 (species/landing → plain name), D-19 (custom range).
// Trust boundary: URLSearchParams is fully untrusted client input (T-06-07..T-06-13).
// Discriminated union on `ticker` field ensures correct fields per ticker type.
// ---------------------------------------------------------------------------

import { RANGE_PRESETS } from '$lib/shared/range';

// D-12: slug is lowercase alphanumeric + hyphens, bounded to 80 chars.
// Rejects uppercase, spaces, and overly long values (T-06-07, T-06-09).
const slugField = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'invalid slug').max(80);

const BoatTickerSchema = z.object({
  ticker: z.literal('boat'),
  slug: slugField
});

const SpeciesTickerSchema = z.object({
  ticker: z.literal('species'),
  name: z.string().min(1).max(80)
});

const LandingTickerSchema = z.object({
  ticker: z.literal('landing'),
  name: z.string().min(1).max(120)
});

// z.discriminatedUnion enforces ticker=boat REQUIRES slug; ticker=species/landing REQUIRES name.
// Cross-field mixing is a parse error (T-06-12).
const TickerVariant = z.discriminatedUnion('ticker', [
  BoatTickerSchema,
  SpeciesTickerSchema,
  LandingTickerSchema
]);

// boolFlagField — accepts URL-style boolean flags `1|0|true|false`. Used by Phase 7
// `moon` field on ExplorerFiltersSchema. UI-SPEC §URL State Contract requires
// the `?moon=1` shorthand to be valid in addition to `?moon=true`.
//
// Note: `.default('false')` is applied BEFORE `.transform()` so that the default
// value flows through the transform (yielding `false`). Putting `.default()`
// after `.transform()` would yield the raw string `'false'` on missing input.
const boolFlagField = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((s) => s === 'true' || s === '1');

// Polish pass: dropped fromDate/toDate from RangeBase — chart dataZoom
// replaces the 'custom' range. (Compare's date filters live in their own
// schema, untouched.)
const RangeBase = z.object({
  range: z.enum(RANGE_PRESETS).default('1y'),
  moon: boolFlagField, // Phase 7 (MOON-01) — default off; URL omits param when off (D-04 clean-URL)
  // Phase 8 Plan 04 (GRN-01 / D-39). Optional override; loader resolves the
  // default per range (defaultGranularityForRange). Default-stripping at
  // serialize time keeps the URL clean (RESEARCH §Pitfall 3).
  granularity: z.enum(['daily', 'weekly', 'monthly']).optional()
});

export type Granularity = 'daily' | 'weekly' | 'monthly';

/**
 * Phase 8 Plan 04 (D-39 / GRN-01). Default granularity for each range
 * preset. Short ranges default to Daily; long ranges to Weekly. The loader
 * applies this when filters.granularity is undefined.
 */
export function defaultGranularityForRange(
  range: ExplorerFilters['range']
): Granularity {
  if (range === '1m' || range === '3m' || range === '6m') return 'daily';
  // 1y / 2y / 5y / all → weekly.
  return 'weekly';
}

// Polish pass: dropped the 'custom'-only superRefine — schema is now a
// straight intersection.
export const ExplorerFiltersSchema = z.intersection(TickerVariant, RangeBase);

export type ExplorerFilters = z.infer<typeof ExplorerFiltersSchema>;

export function parseExplorerFilters(sp: URLSearchParams): ExplorerFilters | { error: ZodError } {
  const result = ExplorerFiltersSchema.safeParse(Object.fromEntries(sp.entries()));
  if (!result.success) return { error: result.error };
  return result.data;
}

export function serializeExplorerFilters(filters: ExplorerFilters): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set('ticker', filters.ticker);
  if (filters.ticker === 'boat') {
    sp.set('slug', filters.slug);
  } else {
    sp.set('name', filters.name);
  }
  sp.set('range', filters.range);
  // Phase 7 (MOON-01) — emit moon=1 ONLY when on. UI-SPEC §URL State Contract
  // "Serialization rule": "When moon is off, the param is omitted entirely. This
  // preserves D-04 (clean URL on default landing) and the off-state guarantee."
  if (filters.moon) sp.set('moon', '1');
  // Phase 8 Plan 04 (GRN-01 / D-39). Emit `granularity` ONLY when set.
  // Default-stripping (omit when filters.granularity == defaultForRange) is
  // the page-component's job (range-change handler); see /explorer/+page.svelte
  // onRangeChange. Here we just round-trip the field as-is.
  if (filters.granularity) sp.set('granularity', filters.granularity);
  return sp;
}
