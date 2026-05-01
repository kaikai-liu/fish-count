<script lang="ts">
  import type { Snippet } from 'svelte';
  import TickerPills from './TickerPills.svelte';
  import RangeStrip from './RangeStrip.svelte';
  import CustomDateInputs from './CustomDateInputs.svelte';

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
    selector
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

    <!-- Row 3: Range strip -->
    <div class="py-2 md:py-3">
      <RangeStrip value={range} onChange={onRangeChange} />
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
