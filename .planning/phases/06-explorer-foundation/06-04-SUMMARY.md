---
phase: 06-explorer-foundation
plan: "04"
subsystem: ui-components
tags: [phase-6, explorer, ui, components, mobile-first, svelte5, tailwind]
dependency_graph:
  requires:
    - src/lib/shared/urlState.ts (Plan 02 — ExplorerFilters type; Ticker/Range unions)
    - src/lib/db/queries/explorer.ts (Plan 03 — speciesBreakdownForBoat row shape: {species, total_catch, n_trips})
  provides:
    - src/lib/components/TickerPills.svelte (Ticker type segmented pill toggle)
    - src/lib/components/RangeStrip.svelte (Range type horizontal-scrollable button strip)
    - src/lib/components/CustomDateInputs.svelte (paired date inputs with blur-submit)
    - src/lib/components/SpeciesBreakdownTable.svelte (boat-ticker species totals grid)
    - src/lib/components/ExplorerHeader.svelte (sticky 3-row top bar composing all three primitives)
  affects:
    - src/routes/explorer/+page.svelte (Plan 05 — consumes all 5 components)
tech_stack:
  added: []
  patterns:
    - Svelte 5 runes ($props, $bindable, $state) — consistent with Chart.svelte prop style
    - Snippet slot pattern from FilterBar.svelte for ExplorerHeader selector row
    - onChange callback props (not embedded navigation) — page owns goto() calls
    - aria-pressed on toggle buttons (not aria-selected — these are not tabs)
    - tabular-nums on numeric columns in SpeciesBreakdownTable
key_files:
  created:
    - src/lib/components/TickerPills.svelte
    - src/lib/components/RangeStrip.svelte
    - src/lib/components/CustomDateInputs.svelte
    - src/lib/components/SpeciesBreakdownTable.svelte
    - src/lib/components/ExplorerHeader.svelte
  modified: []
decisions:
  - "ExplorerHeader uses top-0 on mobile / md:top-[48px] on desktop: nav is not sticky on mobile (top-0 correct); nav is sticky at ~48px (py-3 + border) on desktop, so ExplorerHeader must offset by that height. z-20 ensures it renders above the nav z-10 layer."
  - "selector prop is a Snippet (not a string or component ref) so Plan 05 can pass any server-rendered content — boats list, species list, or landings list — without ExplorerHeader knowing the ticker type. ExplorerHeader stays data-agnostic."
  - "aria-pressed used on ticker pills and range buttons (not aria-selected/role=tab) — these are toggle buttons, not a true tabpanel pattern; the content they control is not a tab panel. UI-SPEC uses aria-pressed."
  - "SpeciesBreakdownTable renders row.species verbatim (no .toLowerCase()/.replace()) per CLAUDE.md domain-language rule. Species names come from DB unchanged."
metrics:
  duration_minutes: 2
  completed_date: "2026-05-01"
  tasks_completed: 2
  files_modified: 5
---

# Phase 6 Plan 04: Explorer UI Components Summary

**One-liner:** Five Svelte 5 presentational components for the explorer's sticky top bar and species breakdown table, using only existing Tailwind color tokens and onChange callback props — no embedded navigation or DB calls.

## What Was Built

### Component Prop Signatures

**`src/lib/components/TickerPills.svelte`**
```typescript
type Ticker = 'boat' | 'species' | 'landing';
// Props:
{
  value: Ticker;           // which pill is active
  onChange: (next: Ticker) => void;  // emitted on pill click
}
```
Renders 3 `<button>` elements in a `role="group"` with `aria-pressed`. Active pill: `bg-(--color-accent) text-white hover:bg-(--color-accent-hover)`. Inactive: `bg-(--color-surface-muted) text-(--color-text-muted)` with accent hover. All buttons: `min-h-11 flex-1 rounded-full`.

---

**`src/lib/components/RangeStrip.svelte`**
```typescript
type Range = '1m' | '3m' | '6m' | '1y' | '2y' | '5y' | 'all' | 'custom';
// Props:
{
  value: Range;             // which button is active
  onChange: (next: Range) => void;
}
```
Renders 8 `<button>` elements in a horizontally-scrollable `role="group"` (`overflow-x-auto md:overflow-visible`). Each button: `shrink-0 rounded border whitespace-nowrap min-h-11`. Active: filled accent. Inactive: surface background with accent border on hover.

---

**`src/lib/components/CustomDateInputs.svelte`**
```typescript
// Props (fromDate/toDate are $bindable):
{
  fromDate?: string;        // YYYY-MM-DD, bindable
  toDate?: string;          // YYYY-MM-DD, bindable
  onSubmit: (next: { fromDate: string; toDate: string }) => void;  // fires on blur of second field when both filled
  clampNote?: string | null;  // inline note if dates were clamped
}
```
Two `<input type="date">` fields with `aria-label="From date"` / `"To date"`. `onblur` on the `To` field calls `onSubmit({fromDate, toDate})` when both values are present. `clampNote` renders as `text-sm text-(--color-text-subtle)` inline below the inputs.

---

**`src/lib/components/SpeciesBreakdownTable.svelte`**
```typescript
// Props:
{
  rows: Array<{ species: string; total_catch: number; n_trips: number }>;
}
```
Renders nothing when `rows.length === 0`. Shows a `<section>` with heading "Species caught" and a CSS grid (`grid-cols-1 md:grid-cols-2 gap-2`). Each row: species name verbatim (left) and `{total_catch.toLocaleString()} total · n={n_trips}` (right, `tabular-nums`).

---

**`src/lib/components/ExplorerHeader.svelte`**
```typescript
type Ticker = 'boat' | 'species' | 'landing';
type Range = '1m' | '3m' | '6m' | '1y' | '2y' | '5y' | 'all' | 'custom';
// Props:
{
  ticker: Ticker;
  range: Range;
  fromDate?: string;           // $bindable — passed to CustomDateInputs
  toDate?: string;             // $bindable — passed to CustomDateInputs
  onTickerChange: (next: Ticker) => void;
  onRangeChange: (next: Range) => void;
  onCustomDates: (next: { fromDate: string; toDate: string }) => void;
  autoWidenNote?: string | null;  // renders inline when range auto-widened
  clampNote?: string | null;      // forwarded to CustomDateInputs
  selector: Snippet;              // Plan 05 passes the <select> content here
}
```

### Color Tokens Used

No new tokens introduced. All from `src/app.css @theme`:

| Token | Where used |
|-------|-----------|
| `--color-accent` | Active pill/button fill, active button border |
| `--color-accent-hover` | Active pill/button hover background and border |
| `--color-accent-bg` | Inactive hover background (light blue) |
| `--color-surface` | RangeStrip inactive button bg, CustomDateInputs input bg, ExplorerHeader header bg |
| `--color-surface-muted` | TickerPills inactive pill bg, SpeciesBreakdownTable row bg |
| `--color-text` | SpeciesBreakdownTable species name text |
| `--color-text-muted` | Inactive pill/button text, SpeciesBreakdownTable count text |
| `--color-text-subtle` | clampNote, autoWidenNote text |
| `--color-border` | RangeStrip inactive button border, CustomDateInputs input border, ExplorerHeader bottom border, SpeciesBreakdownTable row border |
| `--color-border-strong` | (available; not used by these components — reserved for select focus in Plan 05) |

### Sticky Header z-index and top Offset Rationale

The global nav (`+layout.svelte`) uses `md:sticky md:top-0 md:z-10`:
- **Mobile (<768px):** nav is not sticky. ExplorerHeader uses `top-0` — it sticks to the very top.
- **Desktop (≥768px):** nav is sticky at `top-0` with `z-10`. ExplorerHeader uses `md:top-[48px]` (the nav's rendered height: `py-3` = 12px × 2 + ~16px text + 1px border ≈ 48px) and `z-20` to stack above the nav layer.

If the nav height changes (e.g., multi-line wrapping on a narrow desktop), `md:top-[48px]` should be adjusted. This is the only layout assumption requiring visual verification in Plan 05.

### How the selector Snippet Slot Will Be Filled by Plan 05

Plan 05 (`+page.svelte`) will use `{#snippet selector()}` to pass in a native `<select>` element that changes based on the active `ticker` value:

- **Boat ticker:** `<select>` listing all boats from `data.boats` (display_name / slug)
- **Species ticker:** `<select>` listing all distinct species
- **Landing ticker:** `<select>` listing all landings (display_name)

ExplorerHeader doesn't know which options to render — it just calls `{@render selector()}` in Row 2. This keeps the header data-agnostic and lets Plan 05 own the options logic.

## Deviations from Plan

None — plan executed exactly as written. All 5 components match the plan-specified implementations.

## Known Stubs

None. These are purely presentational components with no hardcoded data values. All content flows through typed props at runtime.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. These are client-rendered presentational components:

- `{row.species}` and `{autoWidenNote}` use Svelte 5's auto-escaping template interpolation — no `{@html}` anywhere (T-06-20, T-06-21 mitigated).
- `<input type="date">` returns YYYY-MM-DD or empty string; downstream Zod validation in Plan 02 re-checks format (T-06-22 mitigated).
- All data comes from server-rendered loader output — no user-private state (T-06-23 accept disposition confirmed).

## Self-Check: PASSED

Files exist:
- `src/lib/components/TickerPills.svelte` — EXISTS (30 lines)
- `src/lib/components/RangeStrip.svelte` — EXISTS (38 lines)
- `src/lib/components/CustomDateInputs.svelte` — EXISTS (40 lines)
- `src/lib/components/SpeciesBreakdownTable.svelte` — EXISTS (21 lines)
- `src/lib/components/ExplorerHeader.svelte` — EXISTS (60 lines)

Commits:
- `077efdf` — feat(06-04): TickerPills, RangeStrip, CustomDateInputs
- `e76006d` — feat(06-04): SpeciesBreakdownTable, ExplorerHeader

svelte-check: 0 errors on all 5 new files
anti-feature lint: PASSED (1/1 tests)
