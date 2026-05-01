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
// Home filters ( / )
// All fields optional — no required filters on the home page.
// ---------------------------------------------------------------------------

export const HomeFiltersSchema = z.object({
  tripType: z.string().optional(),
  landing: z.string().optional(),
  species: z.string().optional()
});

export type HomeFilters = z.infer<typeof HomeFiltersSchema>;

export function parseHomeFilters(sp: URLSearchParams): HomeFilters | { error: ZodError } {
  const result = HomeFiltersSchema.safeParse(Object.fromEntries(sp.entries()));
  if (!result.success) return { error: result.error };
  return result.data;
}

export function serializeHomeFilters(filters: HomeFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.tripType) sp.set('tripType', filters.tripType);
  if (filters.landing) sp.set('landing', filters.landing);
  if (filters.species) sp.set('species', filters.species);
  return sp;
}

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
// Picker filters ( /picker )
// Required: date (or fromDate+toDate in range mode), species, tripType.
// windowDays: default 3, clamped [0, 14] (D-11, T-02-03).
// ---------------------------------------------------------------------------

// String "false" coerces to boolean true under z.coerce.boolean — must parse
// the literal "true"/"false" strings produced by serializePickerFilters.
const boolStringField = z
  .enum(['true', 'false'])
  .transform((s) => s === 'true');

export const PickerFiltersSchema = z.object({
  date: dateField,
  species: z.string().min(1, 'species is required'),
  tripType: z.string().min(1, 'tripType is required'),
  windowDays: z.coerce.number().int().min(0).max(14).default(3),
  rangeMode: boolStringField.default('false'),
  fromDate: dateField.optional(),
  toDate: dateField.optional()
});

export type PickerFilters = z.infer<typeof PickerFiltersSchema>;

export function parsePickerFilters(sp: URLSearchParams): PickerFilters | { error: ZodError } {
  const result = PickerFiltersSchema.safeParse(Object.fromEntries(sp.entries()));
  if (!result.success) return { error: result.error };
  return result.data;
}

export function serializePickerFilters(filters: PickerFilters): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set('date', filters.date);
  sp.set('species', filters.species);
  sp.set('tripType', filters.tripType);
  sp.set('windowDays', String(filters.windowDays));
  sp.set('rangeMode', String(filters.rangeMode));
  if (filters.fromDate) sp.set('fromDate', filters.fromDate);
  if (filters.toDate) sp.set('toDate', filters.toDate);
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
// Trends filters ( /trends )
// Required: species, tripType.
// Optional: boatId (single boat overlay), range, granularity.
// ---------------------------------------------------------------------------

export const TrendsFiltersSchema = z.object({
  species: z.string().min(1, 'species is required'),
  tripType: z.string().min(1, 'tripType is required'),
  boatId: z.coerce.number().int().positive().optional(),
  range: z.enum(['3mo', '6mo', '1y', 'all']).default('1y'),
  granularity: z.enum(['weekly', 'monthly']).optional()
});

export type TrendsFilters = z.infer<typeof TrendsFiltersSchema>;

export function parseTrendsFilters(sp: URLSearchParams): TrendsFilters | { error: ZodError } {
  const result = TrendsFiltersSchema.safeParse(Object.fromEntries(sp.entries()));
  if (!result.success) return { error: result.error };
  return result.data;
}

export function serializeTrendsFilters(filters: TrendsFilters): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set('species', filters.species);
  sp.set('tripType', filters.tripType);
  if (filters.boatId !== undefined) sp.set('boatId', String(filters.boatId));
  sp.set('range', filters.range);
  if (filters.granularity) sp.set('granularity', filters.granularity);
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

const RangeBase = z.object({
  range: z.enum(RANGE_PRESETS).default('1y'),
  fromDate: dateField.optional(),
  toDate: dateField.optional()
});

// D-19: custom range requires both dates; fromDate <= toDate (T-06-10).
export const ExplorerFiltersSchema = z
  .intersection(TickerVariant, RangeBase)
  .superRefine((v, ctx) => {
    if (v.range === 'custom') {
      if (!v.fromDate || !v.toDate) {
        ctx.addIssue({
          code: 'custom',
          message: 'fromDate and toDate required when range=custom'
        });
        return;
      }
      if (v.fromDate > v.toDate) {
        ctx.addIssue({
          code: 'custom',
          message: 'fromDate must be <= toDate'
        });
      }
    }
  });

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
  if (filters.range === 'custom') {
    if (filters.fromDate) sp.set('fromDate', filters.fromDate);
    if (filters.toDate) sp.set('toDate', filters.toDate);
  }
  return sp;
}
