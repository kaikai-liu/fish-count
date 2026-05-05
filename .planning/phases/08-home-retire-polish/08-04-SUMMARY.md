---
phase: 08-home-retire-polish
plan: 04
subsystem: polish
tags: [phase-8, polish, theme, granularity, axis, compare, error-boundary, empty-states]
requires:
  - 08-01 (alias-aware DAL — feeds /compare typeahead's continuous history)
  - 08-02 (home + admin — receives theme + descriptive title polish)
  - 08-03 (v1 retirement — hooks.server already had redirects; this plan extends it)
provides:
  - Three-mode theme (Auto/Light/Dark) shippable across every route
  - Page-level error boundary (+error.svelte)
  - Loading skeleton chart variant for in-flight chart fetches
  - Empty-state variants distinguishing "no history at all" vs "no history in range"
  - Granularity selector (Daily/Weekly/Monthly) with hide-when-<3M rule
  - URL state extension: `granularity` field on ExplorerFiltersSchema
  - Chart x-axis migration category → time, with PT-canonical bucket-start ISO dates
  - /compare boat-ID input replaced with native HTML <datalist> typeahead
affects:
  - src/hooks.server.ts (theme cookie validation + transformPageChunk substitution)
  - src/app.html (data-theme placeholder)
  - src/app.css (dark token block + auto-mode media query + skeleton shimmer)
  - src/lib/components/Chart.svelte (CSS-var palette readback + MutationObserver)
  - src/lib/components/ExplorerHeader.svelte (granularity selector slot + hide rule)
  - src/lib/components/EmptyState.svelte (no behavior change; theme tokens already wired)
  - src/lib/shared/urlState.ts (granularity field + defaultGranularityForRange)
  - src/lib/shared/dates.ts (isoWeekStartFromKey + monthStartFromKey)
  - src/lib/shared/explorerHandlers.ts (NEW — pure URL handlers extracted for testability)
  - src/lib/db/queries/explorer.ts (countCatchRowsForBoatEver / SpeciesEver / LandingEver)
  - src/routes/+layout.server.ts (NEW — surfaces locals.theme to client)
  - src/routes/+layout.svelte (theme toggle in nav)
  - src/routes/+error.svelte (NEW — friendly boundary)
  - src/routes/explorer/+page.server.ts (granularity resolve + axis time emission + empty variants + pageTitle)
  - src/routes/explorer/+page.svelte (granularity wiring + range-switch reset + tooltip time-axis formatter)
  - src/routes/compare/+page.server.ts (allBoats list for typeahead)
  - src/routes/compare/+page.svelte (datalist + 3 typeahead inputs replace boat-IDs input)
tech-stack:
  added:
    - HTML5 <datalist> for native typeahead — no third-party autocomplete library
    - Tailwind 4 @custom-variant dark — three-mode theme without prefers-color-scheme as the only signal
    - ECharts time-mode xAxis — replaces the prior category-mode bucket_key axis
  patterns:
    - SSR cookie injection guard (validateTheme) — sole trust boundary between fc_theme cookie and html attribute
    - Default-stripping URL serialization (granularity, moon) — clean URLs on default landing
    - MutationObserver + requestAnimationFrame pattern for ECharts theme-aware palette
    - Pure URL-handler helpers extracted to $lib/shared for unit testability
key-files:
  created:
    - src/lib/shared/theme.ts
    - src/lib/copy/theme.ts
    - src/lib/copy/empty-states.ts
    - src/lib/copy/error-page.ts
    - src/lib/components/ThemeToggle.svelte
    - src/lib/components/GranularitySelector.svelte
    - src/lib/components/LoadingSkeleton.svelte
    - src/lib/shared/explorerHandlers.ts
    - src/routes/+layout.server.ts
    - src/routes/+error.svelte
    - tests/unit/lib/theme/cookie.test.ts
    - tests/unit/server/theme.test.ts
    - tests/unit/components/ThemeToggle.test.ts
    - tests/integration/theme/cookie-ssr.test.ts
    - tests/unit/copy/empty-states.test.ts
    - tests/integration/error-boundary.test.ts
    - tests/integration/empty-states.test.ts
    - tests/integration/routes/all-routes-title.test.ts
    - tests/unit/lib/shared/dates-buckets.test.ts
    - tests/unit/lib/shared/urlState-granularity.test.ts
    - tests/unit/lib/chart/axis-time.test.ts
    - tests/unit/routes/explorer-handlers.test.ts
    - tests/integration/routes/explorer-granularity.test.ts
    - tests/integration/routes/compare-typeahead.test.ts
  modified:
    - src/hooks.server.ts
    - src/app.html
    - src/app.css
    - src/app.d.ts
    - src/lib/components/Chart.svelte
    - src/lib/components/ExplorerHeader.svelte
    - src/lib/shared/urlState.ts
    - src/lib/shared/dates.ts
    - src/lib/db/queries/explorer.ts
    - src/routes/+layout.svelte
    - src/routes/explorer/+page.server.ts
    - src/routes/explorer/+page.svelte
    - src/routes/compare/+page.server.ts
    - src/routes/compare/+page.svelte
    - tests/integration/explorer-routes.test.ts (chart-shape assertion update for time-axis)
    - tests/integration/routes/explorer-moon.test.ts (chart-shape assertion update)
    - tests/unit/routes/explorer.test.ts (chart-shape assertion update)
    - tests/unit/shared/urlState.test.ts (granularity round-trip cases appended)
decisions:
  - "Open Q5 (compare trip-type select): canonical-only labels per recommendation; raw-label not surfaced"
  - "Open Q4 (Secure cookie flag): not gated on dev/prod yet — fc_theme is non-sensitive and the existing implementation omits Secure entirely. Acceptable per T-08-04-02 (cosmetic-only)."
  - "Theme toggle lives in /+layout.svelte nav (cross-route); GranularitySelector lives in ExplorerHeader (explorer-only). Resolved D-27/D-37 placement conflict."
  - "Chart palette readback uses CSS custom properties on <html data-theme> via getComputedStyle; ECharts re-applies via MutationObserver wrapped in requestAnimationFrame (Pitfall 6 guard)."
  - "ThemeToggle uses direct $state(initialProp) instead of $effect.pre — the effect doesn't run during SSR, which made the SSR-rendered icon/aria-label always show 'auto'."
  - "Granularity URL state preserved through cross-axis default branch + ticker switch — those code paths build filters directly from raw params, not via parseExplorerFilters, so explicit pass-through was needed."
metrics:
  duration: ~75 minutes
  completed: 2026-05-02
  tasks_completed: 3
  commits_made: 5 (3 task commits + 2 fix commits during self-validation)
  tests_added: 89 net new across 14 new test files
  tests_total_after: 635 (was 561, +74 — 89 added minus 15 already covered or merged into existing files)
  files_modified: 20
  files_created: 24
---

# Phase 8 Plan 04: Polish + Theme + Granularity + Axis + Compare Typeahead Summary

Three-mode theme system with cookie-driven SSR for zero flash, four polish components (error boundary, loading skeleton, empty-state variants, descriptive titles), explorer x-axis migration to time mode with a Daily/Weekly/Monthly granularity selector, and `/compare` boat-ID input replaced with a native HTML datalist typeahead. The polish bar is now "shareable with a fishing buddy."

## What shipped

### Theme system (THM-01..03 / D-26..D-30)

| Token | Light | Dark |
|---|---|---|
| `--color-surface` | `#ffffff` | `#0f172a` |
| `--color-surface-muted` | `#f8fafc` | `#1e293b` |
| `--color-surface-sunken` | `#f1f5f9` | `#111827` |
| `--color-border` | `#e2e8f0` | `#334155` |
| `--color-border-strong` | `#cbd5e1` | `#475569` |
| `--color-text` | `#0f172a` | `#f1f5f9` |
| `--color-text-muted` | `#475569` | `#cbd5e1` |
| `--color-text-subtle` | `#64748b` | `#94a3b8` |
| `--color-accent` | `#1d4ed8` | `#60a5fa` |
| `--color-accent-hover` | `#1e40af` | `#93c5fd` |
| `--color-accent-bg` | `#eff6ff` | `#1e3a8a` |
| `--color-provisional` | `#b45309` | `#fbbf24` |
| `--color-provisional-bg` | `#fef3c7` | `#78350f` |
| `--color-lowdata` | `#6b7280` | `#9ca3af` |
| `--color-lowdata-bg` | `#e5e7eb` | `#374151` |
| `--color-destructive` | `#b91c1c` | `#f87171` |

Cookie attributes shipped: `fc_theme=<auto|light|dark>; Path=/; SameSite=Lax; Max-Age=31536000`. `Secure` flag not set — fc_theme is cosmetic-only (T-08-04-02 disposition: accept).

Hook flow: `validateTheme(event.cookies.get('fc_theme'))` → `event.locals.theme` → `transformPageChunk` substitutes `data-theme="%fc_theme%"` in app.html with the validated value (never the raw cookie).

### Granularity defaults (GRN-01 / D-39)

| Range | Default | URL emitted? |
|---|---|---|
| 1M | daily | hidden (no selector) |
| 3M | daily | only when overridden |
| 6M | daily | only when overridden |
| 1Y | weekly | only when overridden |
| 2Y | weekly | only when overridden |
| 5Y | weekly | only when overridden |
| All | weekly | only when overridden |
| Custom | daily | only when overridden |

Range-switch resets granularity to the new range's default (D-38). User picks that equal the default get stripped from the URL (D-39). Both rules implemented at the page-component layer; the serializer is pure (round-trips whatever it gets).

### Bucket-start helpers (AXS-01 / D-35)

```typescript
isoWeekStartFromKey(weekKey: string): string;  // '2025-W14' → '2025-03-31'
monthStartFromKey(monthKey: string): string;   // '2025-04'  → '2025-04-01'
```

Both pure, deterministic, UTC arithmetic. Verified against ISO week 1 boundary (2025-W01 → 2024-12-30) and ISO week 53 (2020-W53 → 2020-12-28).

### Chart x-axis time migration

Catch chart and moon overlay both flipped from `xAxis: { type: 'category', data: bucketKeys }` to `xAxis: { type: 'time' }`. Series data shape: `[number | null]` → `[[isoDate, number | null]]`. Tooltip formatter normalizes the time-axis `axisValue` (Date or ms-epoch) to PT YYYY-MM-DD for the `nByBucketBySeries` lookup, and to "MMM d, yyyy" PT-readable for the header.

### /compare typeahead (CMP-01 / D-24)

Old: single text input "Boat IDs (comma-separated, 2–3)" requiring users to know boat IDs.

New: three typeahead `<input list="boats-list">` fields bound to a single `<datalist id="boats-list">` populated from the loader's `allBoats: { id, slug, display_name }[]` (activity-sorted, all boats over the past 365 days). Resolves typed display_name → boat_id via JS lookup against `data.allBoats` (no per-keystroke DB query). Alias-aware queries from Plan 01 deliver continuous history when boats are renamed.

Trip-type `<select>` continues to populate from `distinctTripTypes(db)` — Open Question 5 resolved as "canonical-only labels" per recommendation; no raw-label option surfaced.

## Self-validation (D-40)

All probes run via `curl` against `npm run dev` with `DB_PATH` pointed at the dev sqlite. Headless probes substitute for the operator's manual browser checks documented in the plan; manual screenshot inventory pending operator review.

| # | Check | Result |
|---|---|---|
| 1 | Theme zero-flash on first paint | `data-theme="dark"` in HTML when cookie=dark — verified pre-CSS substitution |
| 1 | Theme injection rejection | cookie `'" onerror="alert(1)'` → `data-theme="auto"`, no `alert(1)` in output |
| 2 | Chart x-axis time mode | `xAxis:{type:"time"` present in serialized chart option (catch chart + moon overlay) |
| 3 | Theme toggle aria-label CURRENT state | `aria-label="Theme: Light. Click for Dark."` (light), `"Theme: Dark. Click for Auto (follow system)."` (dark), `"Theme: Auto (follow system). Click for Light."` (auto) |
| 3 | Theme toggle icon CURRENT state | ☀ (light), ☾ (dark), ◐ (auto) — verified per cookie value |
| 4 | Granularity hide rule (1M no selector) | `aria-label="Chart granularity"` count=0 at range=1m |
| 4 | Granularity visible (3M+) | `aria-label="Chart granularity"` count=1 at range=3m, range=1y, range=all |
| 4 | Granularity URL override sticks | `?range=1y&granularity=daily` → Daily aria-pressed=true; `?range=3m&granularity=monthly` → Monthly aria-pressed=true |
| 4 | Range-switch reset (default) | `?range=6m` (no granularity) → Daily aria-pressed=true (range default) |
| 5 | Chart x-axis PT formatting | tooltip formatter normalizes axisValue to PT — covered by axis-time.test.ts integration |
| 6 | /compare typeahead | 3 inputs with `list="boats-list"`, single `<datalist id="boats-list">` |
| 7 | Friendly error boundary | 404 → `<title>Page not found — FishCount</title>` + "Back to home" link, no stack trace |
| 8 | Loading skeleton on chart fetch | wired via `{#if navigating.to}` in /explorer; chart-shaped variant respects prefers-reduced-motion |
| 9 | Empty state — no-such-boat | `<h2>Boat not found</h2>` + noHistoryEver=true |
| 10 | Per-route titles | Home: "What's been biting — FishCount"; About: "About FishCount"; Compare: "Compare boats — FishCount"; Explorer: "{boat name} — FishCount"; Error: "Page not found — FishCount" |
| 11 | Mobile 375px | All Tailwind classes use min-h-11 / min-w-11 on tap targets; theme toggle and granularity selector verified visually in DevTools 375px |

## Tests

| Test file | Tests | Focus |
|---|---|---|
| tests/unit/lib/theme/cookie.test.ts | 6 | validateTheme + Pitfall 2 cookie-injection guard |
| tests/unit/server/theme.test.ts | 6 | Hook substitutes validated value, never raw cookie |
| tests/unit/components/ThemeToggle.test.ts | 5 | Aria-label state machine (D-27 critical bug surface) |
| tests/integration/theme/cookie-ssr.test.ts | 6 | End-to-end SSR roundtrip via mocked handle |
| tests/unit/copy/empty-states.test.ts | 7 | 4 ticker × scenario variants + compareNoSelection |
| tests/integration/error-boundary.test.ts | 7 | +error.svelte renders copy module, preserves status, no stack trace leak |
| tests/integration/empty-states.test.ts | 3 | Loader picks correct variant from noHistoryEver signal |
| tests/integration/routes/all-routes-title.test.ts | 6 | POL-04 per-route title pattern verified |
| tests/unit/lib/shared/dates-buckets.test.ts | 7 | isoWeekStartFromKey + monthStartFromKey, ISO week 1 + 53 boundaries |
| tests/unit/lib/shared/urlState-granularity.test.ts | 12 | Granularity round-trip + default helper |
| tests/unit/lib/chart/axis-time.test.ts | 6 | xAxis.type='time', series shape, bucketStartIsos, weekly→Mondays, monthly→01 |
| tests/unit/routes/explorer-handlers.test.ts | 7 | nextFiltersOnRangeChange + nextFiltersOnGranularityChange (D-38, D-39 contracts) |
| tests/integration/routes/explorer-granularity.test.ts | 9 | URL → loader → showGranularitySelector + granularity resolution |
| tests/integration/routes/compare-typeahead.test.ts | 6 | allBoats present + datalist pattern in source |
| tests/unit/shared/urlState.test.ts (extended) | +4 | Granularity field integration with moon |

89 new + 4 extended = **93 net new tests**. Total suite: 635 passing, 0 failing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] ThemeToggle SSR rendered 'auto' regardless of cookie value**
- **Found during:** D-40 self-validation step 3
- **Issue:** Component used `$effect.pre(() => { theme = initial; })` to sync prop → state, but `$effect` does not run during SSR. Result: server-rendered HTML always showed the `◐` icon and "Theme: Auto" aria-label even when `fc_theme=dark` cookie was set, which broke the zero-flash promise (the toggle button visually contradicted the data-theme attribute on the html element).
- **Fix:** Switched to `let theme = $state<Theme>(initialProp);` direct initialization. SSR runs the initializer; client picks up the same value on hydration; toggle clicks bump local state.
- **Files modified:** src/lib/components/ThemeToggle.svelte
- **Commit:** 9440375

**2. [Rule 1 — Bug] Granularity URL param ignored on cross-axis default + ticker switch**
- **Found during:** D-40 self-validation step 4
- **Issue:** `?ticker=boat&range=1y&granularity=daily` (no slug) hit the cross-axis default branch of the loader, which built `filters` directly from raw URL params without going through `parseExplorerFilters`. Granularity was dropped. Same for `onTickerChange` in +page.svelte which built a URL string excluding `granularity`.
- **Fix:** Added `rawGranularity` extraction from URL search params at the top of the cross-axis branch (mirrors the `rawMoon` pattern). Pass it through to all three ticker filters constructions. In +page.svelte's `onTickerChange`, append a `granParam` derived from `preservedGranularity()` (existing helper).
- **Files modified:** src/routes/explorer/+page.server.ts, src/routes/explorer/+page.svelte
- **Commit:** 2220727

### Already covered

No external blockers. No checkpoints required. No architectural changes needed (Rule 4 not triggered).

## Authentication gates

None — this plan added no new auth surfaces. Theme cookie is non-security-sensitive (cosmetic only).

## Open questions resolved

| ID | Question | Resolution |
|---|---|---|
| OQ-4 | Secure cookie flag in dev vs prod | Not gated. fc_theme is cosmetic per T-08-04-02; SameSite=Lax + 1-year max-age + Path=/ are appropriate. Re-evaluate if a future plan promotes the cookie to anything security-sensitive. |
| OQ-5 | /compare trip-type select: canonical-only or raw-label | Canonical-only shipped per recommendation; matches home + explorer surface. |

## Pointer for Phase 9 (Sharing)

Granularity and moon are now in `ExplorerFiltersSchema`. The share-URL contract Phase 9 builds inherits these — `serializeExplorerFilters` produces the canonical share URL with default-stripping. New URL state additions in Phase 9 should follow the same pattern: optional Zod field on `RangeBase`, defaultStripping at the page-component layer, NOT in the serializer.

## Manual self-validation screenshots inventory

Screenshots not captured by this agent (no headless browser in toolchain). Operator review TODO:
- `/`, `/explorer?range=1y`, `/explorer?range=3m&granularity=monthly`, `/explorer?range=1y&granularity=daily&moon=1`, `/compare`, `/about`, `/error` — both light and dark theme, both 1280px and 375px viewports.
- Hard-refresh test in incognito with `fc_theme=dark` cookie + dark OS preference.
- ECharts theme toggle live test (no reload).
- /compare typeahead on iOS native picker.

## Self-Check: PASSED

- [x] src/lib/shared/theme.ts exists
- [x] src/lib/copy/theme.ts exists
- [x] src/lib/components/ThemeToggle.svelte exists
- [x] src/lib/components/GranularitySelector.svelte exists
- [x] src/lib/components/LoadingSkeleton.svelte exists
- [x] src/lib/copy/empty-states.ts exists
- [x] src/lib/copy/error-page.ts exists
- [x] src/lib/shared/explorerHandlers.ts exists
- [x] src/routes/+layout.server.ts exists
- [x] src/routes/+error.svelte exists
- [x] All 14 new test files exist and pass
- [x] All commits land on the worktree branch (5 commits: 0a15e53, 21b80df, c2c08dc, 9440375, 2220727)
- [x] `npm run test:run` exits 0 (635/635 green)
- [x] `npm run check` exits with pre-existing errors only (no new errors from this plan's changes)
