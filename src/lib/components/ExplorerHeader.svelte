<script lang="ts">
  import type { Snippet } from 'svelte';
  import TickerPills from './TickerPills.svelte';
  import RangeStrip from './RangeStrip.svelte';
  import CustomDateInputs from './CustomDateInputs.svelte';
  import { MOON_TOGGLE_LABEL, MOON_TOGGLE_ARIA } from '$lib/copy/moon';

  type Ticker = 'boat' | 'species' | 'landing';
  type Range = '1m' | '3m' | '6m' | '1y' | '2y' | '5y' | 'all' | 'custom';

  let {
    ticker,
    range,
    fromDate = $bindable(''),
    toDate = $bindable(''),
    onTickerChange,
    onRangeChange,
    onCustomDates,
    autoWidenNote,
    clampNote,
    selector,
    // Phase 7 (MOON-01)
    moon,
    onMoonChange
  }: {
    ticker: Ticker;
    range: Range;
    fromDate?: string;
    toDate?: string;
    onTickerChange: (next: Ticker) => void;
    onRangeChange: (next: Range) => void;
    onCustomDates: (next: { fromDate: string; toDate: string }) => void;
    autoWidenNote?: string | null;
    clampNote?: string | null;
    selector: Snippet;
    // Phase 7 (MOON-01)
    moon: boolean;
    onMoonChange: (next: boolean) => void;
  } = $props();
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

    <!-- Row 3: Range strip + Moon toggle (Phase 7, MOON-01) -->
    <div class="py-2 md:py-3">
      <div class="md:flex md:items-start md:gap-2">
        <RangeStrip value={range} onChange={onRangeChange} />
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
      </div>
      {#if range === 'custom'}
        <CustomDateInputs
          bind:fromDate
          bind:toDate
          onSubmit={onCustomDates}
          {clampNote}
        />
      {/if}
    </div>

    {#if autoWidenNote}
      <p class="pb-2 text-sm text-(--color-text-subtle)">{autoWidenNote}</p>
    {/if}
  </div>
</header>
