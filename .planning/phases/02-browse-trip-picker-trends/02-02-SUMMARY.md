---
phase: 02-browse-trip-picker-trends
plan: 02
subsystem: ui-components
tags: [svelte5, tailwind4, echarts, per-angler, design-tokens, components]
dependency_graph:
  requires:
    - 02-01 (urlState.ts — FilterBar consumers will import goto from $app/navigation and call parsePickerFilters from urlState.ts)
    - src/lib/shared/dates.ts (toPtTimeLabel used by route loaders before passing to LastScrapedLabel)
  provides:
    - src/app.css @theme block (design tokens consumed by all Phase 2 routes)
    - src/lib/copy/metrics.ts (per-angler copy constants, allowlisted by Plan 02-07 lint)
    - src/lib/components/* (all 11 components, consumed by Wave 2 plans 02-03 through 02-06)
  affects:
    - 02-03 (browse route), 02-04 (trip picker), 02-05 (boat detail + compare), 02-06 (trends), 02-07 (lint)
tech_stack:
  added:
    - echarts@^6.0.0 (production dependency — dynamic-imported in Chart.svelte)
  patterns:
    - Svelte 5 runes ($props, $state, $derived, $derived.by, $effect, getContext, setContext)
    - Tailwind 4 @theme CSS-first configuration (no tailwind.config.js)
    - ECharts dynamic import pattern (SSR-safe, keeps bundle lean)
    - Svelte 5 context API for cross-component framing state
key_files:
  created:
    - src/lib/copy/metrics.ts
    - src/lib/components/LowDataBadge.svelte
    - src/lib/components/PerAnglerFramingProvider.svelte
    - src/lib/components/PerAnglerMetric.svelte
    - src/lib/components/Chart.svelte
    - src/lib/components/ProvisionalBadge.svelte
    - src/lib/components/LastScrapedLabel.svelte
    - src/lib/components/PageHeader.svelte
    - src/lib/components/EmptyState.svelte
    - src/lib/components/FilterBar.svelte
    - src/lib/components/BoatRow.svelte
    - src/lib/components/BoatCard.svelte
  modified:
    - src/app.css (extended with @theme block + base styles)
    - package.json / package-lock.json (echarts added)
decisions:
  - D-04 implemented: Chart.svelte dynamic-imports echarts/core in onMount — never statically imported
  - D-16 implemented: PerAnglerMetric with ctx prop (row/card/hero), inline framing, n=X always visible
  - D-17 supported: /about link rendered by PerAnglerMetric framing line
  - D-19 documented: FilterBar provides wrapper; goto() is route responsibility
  - D-20 supported: ProvisionalBadge accepts boolean show prop; route loader decides
  - D-21 implemented: LastScrapedLabel renders "Last scraped at HH:MM PT" from label prop
  - D-22 implemented: BoatRow source link format verbatim (sandiegofishreports.com/dock_totals/boats.php?date=)
  - D-23 supported: BoatCard links to /boats/{boat_id} for full detail
  - D-28 implemented: BoatCard "Why this boat?" expand panel with slide transition + aria-expanded/controls
  - D-31 honored: all components mobile-first at 375px baseline with md: modifiers
  - D-32 implemented: Chart.svelte wraps ECharts init/destroy lifecycle, ResizeObserver
metrics:
  duration_minutes: 6
  completed_date: "2026-04-25"
  tasks_completed: 4
  files_created: 13
  files_modified: 2
---

# Phase 02 Plan 02: Component Library + Design Tokens Summary

One-liner: Svelte 5 component library with ECharts dynamic-import wrapper, mandatory per-angler framing via context API, and Tailwind 4 @theme design tokens including viridis heatmap palette.

## What Was Built

### Design Tokens (src/app.css)

Extended from single-line `@import 'tailwindcss'` to a full Tailwind 4 `@theme` block:
- 16 semantic color tokens: surface/surface-muted/surface-sunken, border/border-strong, text/text-muted/text-subtle, accent/accent-hover/accent-bg, provisional/provisional-bg, lowdata/lowdata-bg, destructive
- 5-stop viridis heatmap palette (colorblind-safe): heatmap-0 through heatmap-4
- System-UI font stack token
- Base styles: focus-visible WCAG ring, prefers-reduced-motion CSS rule, skip-to-main utility

### Per-angler Copy Constants (src/lib/copy/metrics.ts)

Single source of truth for all "fish/angler" string surfaces. 6 exports:
- `FISH_PER_ANGLER_AXIS` — ECharts yAxis.name and heatmap legend unit
- `FISH_PER_ANGLER_ARIA` — ARIA-label fragment (spelled out for screen readers)
- `FISH_PER_ANGLER_TOOLTIP_UNIT` — tooltip suffix
- `WEEKLY_FISH_PER_ANGLER_HEADING` — /compare chart section heading
- `BEST_DAY_UNIT` — BoatCard why-panel best-day line unit
- `HEATMAP_LEGEND_HIGH` — heatmap visualMap "high" label

Plan 02-07's per-angler-discipline lint allowlists this file alongside PerAnglerMetric.svelte and /about/+page.svelte.

### Mandatory Components (Task 3)

**LowDataBadge.svelte** — Gray pill "low data" with ARIA label "fewer than 5 trips backing this average". Used internally by PerAnglerMetric.

**PerAnglerFramingProvider.svelte** — Svelte 5 context provider. Tracks whether inline framing has been rendered. First `<PerAnglerMetric>` under it gets `showFraming=true`; subsequent instances get false. Routes wrap their data sections in this.

**PerAnglerMetric.svelte** — Centerpiece component. Props: `{ value: number | null; nTrips: number; ctx?: 'row' | 'card' | 'hero'; showFraming?: boolean }`. Renders:
- Formatted value: integer when ≥10, one-decimal when <10 (trailing .0 trimmed), em-dash on null/NaN/n=0
- "fish/angler" unit (from FISH_PER_ANGLER_AXIS constant — never inlined)
- "low data" badge when 0 < nTrips < 5
- "n=X trips" count always visible
- On first per-page occurrence: inline framing "derived boat-aggregate average, not individual angler — About the data" with /about link (CLAUDE.md non-negotiable #4)
- ctx sizes: hero=text-3xl, card=text-xl, row=text-base

**Chart.svelte** — ECharts wrapper. Props: `{ option: EChartsOption; height?: string; ariaLabel: string; loading?: boolean }`. Four sequential `await import()` calls (echarts/core, echarts/charts, echarts/components, echarts/renderers) inside onMount — keeps echarts out of SSR bundle. ResizeObserver for responsive resize. Honors `prefers-reduced-motion` by setting `animation: false`. Re-applies option on prop change via `$effect`.

**ProvisionalBadge.svelte** — Static amber pill "provisional — boats still reporting". No logic; caller decides when to render.

**LastScrapedLabel.svelte** — Renders "Last scraped at {label}" or "No scrape data yet". Route loader converts scrape_runs.finished_at to "HH:MM PT" via dates.ts::toPtTimeLabel before passing as `label` prop.

### Chrome + Data Components (Task 4)

**PageHeader.svelte** — Title + optional subtitle + ProvisionalBadge + LastScrapedLabel. Props: `{ title; subtitle?; showProvisional?; lastScrapedLabel? }`.

**EmptyState.svelte** — Centered empty/no-results state. Props: `{ heading; body?; cta?: { label; href } }`.

**FilterBar.svelte** — Slot-based filter bar wrapper using Svelte 5 snippets. Two slots: `filters` (route-owned inputs) and `actions` (optional submit buttons). Wraps in `<form role="search">` with `onsubmit preventDefault`. Routes own the goto() call per D-19.

**BoatRow.svelte** — Table-row variant for `/` and `/date/[d]`. 7 columns: boat name (link to /boats/{id}), landing, trip type, angler count, species, species count, source-site link. Source link uses D-22 verbatim format (`sandiegofishreports.com/dock_totals/boats.php?date=YYYY-MM-DD`) with `rel="noopener noreferrer external"` (T-02-13 mitigation).

**BoatCard.svelte** — Card variant for /picker results. Props: `{ rank; boat; why }`. Renders PerAnglerMetric in hero position + "Why this boat?" expand panel (D-28). Why-panel uses `transition:slide`, ARIA (`aria-expanded`, `aria-controls`), best-day line uses `BEST_DAY_UNIT` constant (not inlined). `panelId` uses `$derived` to track reactive boat prop.

## Decisions Implemented

| Decision | Implementation |
|----------|----------------|
| D-04 | Chart.svelte: 4x `await import()` inside onMount; no top-level echarts import |
| D-14 (partial) | LowDataBadge ready; route loaders pass n<5 cells to components for gray rendering |
| D-16 | PerAnglerMetric with ctx/showFraming props, inline framing + /about link |
| D-17 | /about link rendered by PerAnglerMetric on first per-page instance |
| D-19 | FilterBar documented: goto() is route responsibility, not component |
| D-20 | ProvisionalBadge: boolean show prop; route loader decides |
| D-21 | LastScrapedLabel: label prop (HH:MM PT string) from route loader |
| D-22 | BoatRow: verbatim source URL format |
| D-23 | BoatCard/BoatRow: /boats/{boat_id} internal links |
| D-28 | BoatCard: expand panel with slide transition + ARIA |
| D-31 | All components: mobile-first 375px baseline |
| D-32 | Chart.svelte: ECharts lifecycle encapsulated, ResizeObserver |

## Anti-features Explicitly NOT Rendered

- No "ON FIRE" badges, no hype signals
- No red/green coloring (viridis palette only in heatmap)
- No tooltip-only per-angler framing (inline in PerAnglerMetric)
- No `{@html}` in any component (zero XSS surface — T-02-08 mitigated)
- No cross-trip-type comparison surface in any component
- No `new Date().toISOString().slice()` date idiom (dates.ts boundary preserved)
- No static echarts import (T-02-11 mitigated — no SSR bundle bloat)

## Notes for Wave 2 Consumers

### Using PerAnglerFramingProvider

Wrap each route's data region in `<PerAnglerFramingProvider>` so the first `<PerAnglerMetric>` renders the inline framing:

```svelte
<PerAnglerFramingProvider>
  {#each boats as boat}
    <BoatCard {rank} {boat} {why} />
  {/each}
</PerAnglerFramingProvider>
```

The context auto-tracks — no prop threading needed. BoatCard's why-panel nests additional PerAnglerMetric instances but they get `showFraming=false` automatically (framing already rendered on the card's visible metric).

### Feeding Chart options

For a line chart:
```svelte
<Chart
  option={{ xAxis: { type: 'category', data: dates }, yAxis: { type: 'value', name: FISH_PER_ANGLER_AXIS }, series: [{ type: 'line', data: values }] }}
  height="320px"
  ariaLabel="Weekly {FISH_PER_ANGLER_ARIA} for Yellowtail on 1/2 Day AM"
/>
```

For a heatmap: pass CalendarComponent-based option; low-data cells use `itemStyle: { color: 'var(--heatmap-lowdata-bg)' }` override.

### FilterBar snippet slots

```svelte
<FilterBar>
  {#snippet filters()}
    <label>Species <select bind:value={species} onchange={handleChange}>...</select></label>
  {/snippet}
  {#snippet actions()}
    <button type="submit" class="min-h-11 ...">Find boats</button>
  {/snippet}
</FilterBar>
```

The route calls `goto(newUrl, { keepFocus: true, replaceState: true, noScroll: true })` in handleChange per D-19.

### Importing constants from $lib/copy/metrics

```typescript
import { FISH_PER_ANGLER_AXIS, FISH_PER_ANGLER_ARIA, BEST_DAY_UNIT, HEATMAP_LEGEND_HIGH } from '$lib/copy/metrics';
```

Every chart axis name, aria-label, and tooltip unit referencing "fish/angler" MUST use these constants. Plan 02-07's lint will reject any inline literal outside the allowlisted files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Install echarts dependency**
- **Found during:** Task 3 — Chart.svelte requires echarts types and dynamic imports
- **Issue:** `package.json` had no echarts entry; `import type { EChartsOption } from 'echarts'` would fail type-check
- **Fix:** `npm install echarts@^6.0.0`
- **Files modified:** package.json, package-lock.json
- **Commit:** 23a14cf

**2. [Rule 1 - Bug] Fix Svelte 5 state_referenced_locally warning in BoatCard**
- **Found during:** Task 4 — svelte-check warned on `const panelId = \`why-${boat.boat_id}\``
- **Issue:** Svelte 5 warns that `boat` (a prop) is captured at initial value rather than reactively tracked
- **Fix:** Changed to `const panelId = $derived(\`why-${boat.boat_id}\`)`
- **Files modified:** src/lib/components/BoatCard.svelte
- **Commit:** 79f756c

## Threat Surface Scan

All threat mitigations from the plan's threat model were implemented:
- T-02-08: No `{@html}` in any component — `grep "{@html" src/lib/components/*.svelte` returns 0
- T-02-09: PerAnglerMetric refuses per-angler value without nTrips prop (typed); PerAnglerFramingProvider enforces inline framing
- T-02-10: PerAnglerMetric owns formatting (Math.round ≥10, toFixed(1) <10, trim .0); props are typed `number`
- T-02-11: echarts dynamically imported in onMount; no static import
- T-02-12: ProvisionalBadge accepts `show` boolean prop; route loader owns the isToday logic
- T-02-13: BoatRow source link uses `rel="noopener noreferrer external"` + hardcoded host

No new threat surfaces introduced beyond the plan's scope.

## Self-Check: PASSED

Files verified to exist:
- src/app.css: FOUND
- src/lib/copy/metrics.ts: FOUND
- src/lib/components/PerAnglerMetric.svelte: FOUND
- src/lib/components/PerAnglerFramingProvider.svelte: FOUND
- src/lib/components/LowDataBadge.svelte: FOUND
- src/lib/components/Chart.svelte: FOUND
- src/lib/components/ProvisionalBadge.svelte: FOUND
- src/lib/components/LastScrapedLabel.svelte: FOUND
- src/lib/components/PageHeader.svelte: FOUND
- src/lib/components/EmptyState.svelte: FOUND
- src/lib/components/FilterBar.svelte: FOUND
- src/lib/components/BoatRow.svelte: FOUND
- src/lib/components/BoatCard.svelte: FOUND

Commits verified:
- d144fe0: feat(02-02): extend app.css with Tailwind 4 @theme design tokens
- 3bf6250: feat(02-02): add canonical per-angler copy constants module
- 23a14cf: feat(02-02): build mandatory components (PerAnglerMetric, Chart, ProvisionalBadge, etc.)
- 79f756c: feat(02-02): build chrome and data-row components (PageHeader, FilterBar, BoatRow, BoatCard, EmptyState)

svelte-check: 3 pre-existing errors (vite.config.ts test property, two .ts extension imports in scraper/billing — all pre-date this plan). 0 errors from this plan's files.
