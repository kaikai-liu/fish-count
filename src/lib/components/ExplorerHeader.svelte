<script lang="ts">
  import type { Snippet } from 'svelte';
  import TickerPills from './TickerPills.svelte';
  import RangeStrip from './RangeStrip.svelte';
  import GranularitySelector from './GranularitySelector.svelte';
  import { MOON_TOGGLE_LABEL, MOON_TOGGLE_ARIA } from '$lib/copy/moon';
  import type { Granularity } from '$lib/shared/urlState';

  type Ticker = 'boat' | 'species' | 'landing';
  // Polish pass: dropped 'custom' — chart dataZoom slider replaces it.
  type Range = '1m' | '3m' | '6m' | '1y' | '2y' | '5y' | 'all';

  let {
    ticker,
    range,
    onTickerChange,
    onRangeChange,
    autoWidenNote,
    selector,
    // Phase 7 (MOON-01)
    moon,
    onMoonChange,
    // Phase 8 Plan 04 (GRN-01 / D-37)
    granularity,
    onGranularityChange
  }: {
    ticker: Ticker;
    range: Range;
    onTickerChange: (next: Ticker) => void;
    onRangeChange: (next: Range) => void;
    autoWidenNote?: string | null;
    selector: Snippet;
    moon: boolean;
    onMoonChange: (next: boolean) => void;
    granularity: Granularity;
    onGranularityChange: (next: Granularity) => void;
  } = $props();

  // Phase 8 Plan 04 (GRN-01 / D-37). Hide the granularity selector at short
  // ranges where Daily is the only sensible bucket. Visible at 3M and longer.
  const showGranularitySelector = $derived(
    range === '3m' ||
      range === '6m' ||
      range === '1y' ||
      range === '2y' ||
      range === '5y' ||
      range === 'all'
  );
</script>

<header class="sticky top-0 md:top-[48px] z-20 bg-(--color-surface) border-b border-(--color-border)">
  <div class="px-4 md:px-8">
    <!-- Row 1: Ticker pills -->
    <div class="py-3">
      <TickerPills value={ticker} onChange={onTickerChange} />
    </div>

    <!-- Row 2: Selector (slotted by parent — content depends on ticker type) -->
    <div class="py-2">
      {@render selector()}
    </div>

    <!-- Row 3: Range strip + Granularity + Moon toggle -->
    <div class="py-2 md:py-3">
      <div class="md:flex md:flex-wrap md:items-start md:gap-2">
        <RangeStrip value={range} onChange={onRangeChange} />
        {#if showGranularitySelector}
          <div class="mt-2 md:mt-0">
            <GranularitySelector value={granularity} onChange={onGranularityChange} />
          </div>
        {/if}
        {#if range !== 'all'}
          <!-- Polish pass: moon overlay is suppressed at range='all' (29.5-day
               cycle compresses into noise across 13+ years). Hide the toggle
               so the affordance matches the rendered chart. -->
          <div class="mt-2 md:mt-0 inline-flex">
            <button
              type="button"
              role="switch"
              aria-checked={moon}
              aria-label={MOON_TOGGLE_ARIA}
              onclick={() => onMoonChange(!moon)}
              class="min-h-11 shrink-0 rounded border px-3 py-2 text-sm font-semibold transition-colors {moon
                ? 'bg-(--color-accent) text-white border-(--color-accent) hover:bg-(--color-accent-hover) hover:border-(--color-accent-hover)'
                : 'bg-(--color-surface) text-(--color-text-muted) border-(--color-border) hover:bg-(--color-accent-bg) hover:text-(--color-accent) hover:border-(--color-accent)'}"
            >
              {MOON_TOGGLE_LABEL}
            </button>
          </div>
        {/if}
      </div>
    </div>

    {#if autoWidenNote}
      <p class="pb-2 text-sm text-(--color-text-subtle)">{autoWidenNote}</p>
    {/if}
  </div>
</header>
