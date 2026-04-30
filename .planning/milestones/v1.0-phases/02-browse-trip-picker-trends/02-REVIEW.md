---
phase: 02-browse-trip-picker-trends
reviewed: 2026-04-25T22:00:00Z
depth: standard
files_reviewed: 59
files_reviewed_list:
  - scripts/seed-dev-db.ts
  - src/app.css
  - src/lib/components/BoatCard.svelte
  - src/lib/components/BoatRow.svelte
  - src/lib/components/Chart.svelte
  - src/lib/components/EmptyState.svelte
  - src/lib/components/FilterBar.svelte
  - src/lib/components/LastScrapedLabel.svelte
  - src/lib/components/LowDataBadge.svelte
  - src/lib/components/PageHeader.svelte
  - src/lib/components/PerAnglerFramingProvider.svelte
  - src/lib/components/PerAnglerMetric.svelte
  - src/lib/components/ProvisionalBadge.svelte
  - src/lib/copy/metrics.ts
  - src/lib/db/boats.ts
  - src/lib/db/queries/boatDetail.ts
  - src/lib/db/queries/browse.ts
  - src/lib/db/queries/compare.ts
  - src/lib/db/queries/trends.ts
  - src/lib/db/queries/tripPicker.ts
  - src/lib/db/scrapeRuns.ts
  - src/lib/shared/dates.ts
  - src/lib/shared/urlState.ts
  - src/routes/+layout.svelte
  - src/routes/+page.server.ts
  - src/routes/+page.svelte
  - src/routes/about/+page.server.ts
  - src/routes/about/+page.svelte
  - src/routes/boats/[id]/+page.server.ts
  - src/routes/boats/[id]/+page.svelte
  - src/routes/compare/+page.server.ts
  - src/routes/compare/+page.svelte
  - src/routes/date/[date]/+page.server.ts
  - src/routes/date/[date]/+page.svelte
  - src/routes/picker/+page.server.ts
  - src/routes/picker/+page.svelte
  - src/routes/picker/heatmapOption.ts
  - src/routes/trends/+page.server.ts
  - src/routes/trends/+page.svelte
  - tests/helpers/seedTestDb.ts
  - tests/integration/phase2-routes.test.ts
  - tests/unit/db/dal-boundary.test.ts
  - tests/unit/db/queries/boatDetail.test.ts
  - tests/unit/db/queries/browse.test.ts
  - tests/unit/db/queries/compare.test.ts
  - tests/unit/db/queries/trends.test.ts
  - tests/unit/db/queries/tripPicker.test.ts
  - tests/unit/lint/anti-feature.test.ts
  - tests/unit/lint/per-angler-discipline.test.ts
  - tests/unit/routes/boats.test.ts
  - tests/unit/routes/compare.test.ts
  - tests/unit/routes/date.test.ts
  - tests/unit/routes/home.test.ts
  - tests/unit/routes/picker-heatmap-option.test.ts
  - tests/unit/routes/picker.test.ts
  - tests/unit/routes/trends.test.ts
  - tests/unit/scripts/seed-dev-db.test.ts
  - tests/unit/shared/dates-boundary.test.ts
  - tests/unit/shared/dates.test.ts
  - tests/unit/shared/urlState.test.ts
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-25T22:00:00Z
**Depth:** standard
**Files Reviewed:** 59
**Status:** issues_found

## Summary

Phase 2 delivers browse, trip picker, trends, compare, and about routes, shared DAL queries, URL state parsing, and the per-angler framing system. The architecture rules are well-applied: all SQL is inside `src/lib/db/queries/*`, no YYYY-MM-DD string production outside `src/lib/shared/dates.ts`, no anti-features, no inline per-angler literals outside the 3-file allowlist. All 373 tests pass. The phase is shippable for v1.

Two warnings and three informational items were found. Neither warning is a data-corruption bug, but one (week-key misalignment in PST) produces incorrect chart alignment in the production TZ and warrants a fix before Phase 3 adds forecasting to the same chart infrastructure.

---

## Warnings

### WR-01: Week bucket keys misalign between date-fns and SQLite in PST production environment

**Files:**
- `src/routes/compare/+page.server.ts:81-86`
- `src/routes/trends/+page.server.ts:103-113`

**Issue:** Both the `/compare` and `/trends` route loaders construct Date objects for `eachWeekOfInterval` by appending `T00:00:00Z` to YYYY-MM-DD strings (UTC midnight). The production Fly.io deployment has `TZ = "America/Los_Angeles"` set in `fly.toml`. Because `date-fns` functions use **local time**, a UTC midnight date is seen as the _previous day_ (4–8 pm PST/PDT). This causes `eachWeekOfInterval` to include the preceding ISO week when `fromDate` happens to be a Monday or Tuesday.

Concrete example:
- `fromDate = '2026-04-21'` (a Monday)
- `new Date('2026-04-21T00:00:00Z')` = Sunday April 20 at 4 pm PST
- `eachWeekOfInterval` backs up to the Monday before April 20 (i.e., April 14, W16)
- Expected buckets include `2026-W16` but SQLite never produces a row for it
- Chart renders an extra leading null/gap week that should not be there

The data alignment is not corrupted (existing week keys from SQL still map correctly via `presentMap.get(k)`), but the chart gains 1-2 phantom gap buckets at the start of the axis. This also means the chart for the "1 year" trends preset starts one week early. The ISO-year boundary case (`2024-12-30 -> 2025-W01`) coincidentally tests clean because the specific test dates chosen avoid a Monday-at-UTC-midnight scenario.

**Fix:** Use `parseISO` from `date-fns` instead of `new Date(dateStr + 'T00:00:00Z')` — `parseISO` produces a local-midnight Date that `eachWeekOfInterval` correctly aligns to.

```typescript
// In both compare/+page.server.ts and trends/+page.server.ts:
import { eachWeekOfInterval, eachMonthOfInterval, format, parseISO } from 'date-fns';

// Replace:
const fromDateObj = new Date(fromDate + 'T00:00:00Z');
const toDateObj   = new Date(toDate   + 'T00:00:00Z');

// With:
const fromDateObj = parseISO(fromDate);  // local midnight, TZ-aware
const toDateObj   = parseISO(toDate);    // local midnight, TZ-aware
```

`parseISO('2026-04-21')` returns April 21 at midnight local time (PST), which `eachWeekOfInterval` correctly places in W17 (April 20 Monday). No bucket mis-shift.

---

### WR-02: CompareFiltersSchema does not validate `fromDate <= toDate`

**File:** `src/lib/shared/urlState.ts:134-139`

**Issue:** `CompareFiltersSchema` validates that `fromDate` and `toDate` are individually valid YYYY-MM-DD strings, but does not enforce `fromDate <= toDate`. When `fromDate > toDate` is submitted (either via URL manipulation or a user selecting dates in reverse):

1. SQLite `BETWEEN @fromDate AND @toDate` returns 0 rows (no data, no crash).
2. `eachWeekOfInterval({ start: fromDateObj, end: toDateObj })` with `start > end` returns weeks in **descending order** (date-fns does not throw).
3. The chart renders with a reversed xAxis that may appear as garbled output.

The same pattern applies to the `PickerFiltersSchema` for range mode (`fromDate` and `toDate` are optional there, but no cross-field validation exists).

**Fix:** Add a Zod `refine` to enforce chronological order:

```typescript
export const CompareFiltersSchema = z.object({
  tripType: z.string().min(1, 'tripType is required'),
  fromDate: dateField,
  toDate: dateField,
  boatIds: z.array(z.coerce.number().int().positive()).min(2).max(3)
}).refine((d) => d.fromDate <= d.toDate, {
  message: 'fromDate must be <= toDate',
  path: ['toDate']
});
```

The server already handles the empty-result case gracefully, so this is defence-in-depth and UX improvement rather than a crash fix.

---

## Info

### IN-01: "Best day in window" in BoatCard why-panel is mislabeled — shows window average, not best single day

**File:** `src/lib/components/BoatCard.svelte:79` and `src/routes/picker/+page.server.ts:115-129`

**Issue:** The server builds `bestDay` as `{ date: r.last_trip_date, value: r.avg_per_angler }` — i.e., the _last trip date_ in the window paired with the boat's _window-average_ per-angler yield. The UI renders it as "Best day in window: 2024-07-01 · 1.7 fish/angler". The label is misleading: the value is not the best single-day yield, it is the same aggregate average already shown in the card header, and the date is the last (not best) trip date.

A user reading "Best day in window" naturally expects the peak single-day performance. The server comment acknowledges this as a Phase 2 shortcut ("Phase 3 can extend this to per-day breakdown"), but the current label creates a false impression of per-day resolution.

**Fix (minimal for v1):** Relabel to avoid the precision implication:

```typescript
// +page.server.ts — rename the field or change the server label
why[r.boat_id] = {
  // ...
  windowAvg:  // rename from bestDay
    r.last_trip_date && r.avg_per_angler !== null
      ? { lastTripDate: r.last_trip_date, value: r.avg_per_angler }
      : null
};
```

```svelte
<!-- BoatCard.svelte line 78-80 -->
{#if why.windowAvg}
  <li>Window average: <span class="tabular-nums">{why.windowAvg.lastTripDate}</span> · {why.windowAvg.value.toFixed(1)} {BEST_DAY_UNIT}</li>
{/if}
```

Or alternatively keep the structure but relabel the UI text from "Best day in window" to "Window average (last trip: DATE)". The forecast-honesty non-negotiable applies here: integers-only and no false-precision projections — calling a window average a "best day" is a mild form of false precision.

---

### IN-02: `$derived` expression in `PerAnglerMetric` has a side effect (latch consume call)

**File:** `src/lib/components/PerAnglerMetric.svelte:16-18`

**Issue:** `renderFraming` is a `$derived` that calls `framingCtx.consume()`, a function that mutates a shared latch (`latch.rendered = true`). Svelte 5 treats `$derived` as a pure computation and may re-execute it when dependencies change. The comment in `PerAnglerFramingProvider` correctly explains why `$state` was not used, but the side-effectful `consume()` call inside `$derived` is a pattern that could misbehave in future Svelte 5 versions that enforce purity more strictly.

In the current implementation the risk is low because:
- `showFraming` (the only reactive dependency) is never passed explicitly in production routes.
- `framingCtx` is a stable context reference not tracked as a Svelte reactive dependency.
- All 373 tests pass.

**Fix:** Move the `consume()` call out of `$derived` using `$effect` or keep it in the component's initialization logic (e.g., call `consume()` once during `onMount`). However, `onMount` is client-only and would break SSR framing. The safest minimal change is to document the constraint as a known Svelte 5 limitation with a lint suppression comment rather than restructuring, since changing it risks breaking the SSR framing guarantee.

No code change is required to ship v1. Flag for re-evaluation when upgrading to Svelte 5 stable.

---

### IN-03: `PickerFiltersSchema` does not cross-validate `rangeMode=true` requires `fromDate` + `toDate`

**File:** `src/lib/shared/urlState.ts:98-113`

**Issue:** When `rangeMode=true`, the picker is supposed to use an explicit date range instead of `date ± windowDays`. However, `fromDate` and `toDate` are both `optional()` in `PickerFiltersSchema` regardless of `rangeMode`. A URL like `?date=2026-04-25&species=yellowtail&tripType=Full+Day&rangeMode=true` (no `fromDate`/`toDate`) passes Zod validation and falls through to the `else` branch in the server (line 81-83), silently ignoring `rangeMode`. The user who checked "Use date range" but left the range fields empty gets results computed from `date ± windowDays` — no error, no indication the range mode was silently ignored.

**Fix:** Add a Zod `refine` or use a discriminated union:

```typescript
export const PickerFiltersSchema = z.object({
  date: dateField,
  species: z.string().min(1),
  tripType: z.string().min(1),
  windowDays: z.coerce.number().int().min(0).max(14).default(3),
  rangeMode: boolStringField.default('false'),
  fromDate: dateField.optional(),
  toDate: dateField.optional()
}).refine(
  (d) => !d.rangeMode || (d.fromDate != null && d.toDate != null),
  { message: 'rangeMode=true requires fromDate and toDate', path: ['fromDate'] }
);
```

This ensures the picker server never silently ignores a user's range-mode intent.

---

_Reviewed: 2026-04-25T22:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
