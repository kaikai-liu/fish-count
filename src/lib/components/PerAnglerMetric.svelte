<script lang="ts">
  import { getContext } from 'svelte';
  import LowDataBadge from './LowDataBadge.svelte';
  import { FISH_PER_ANGLER_AXIS } from '$lib/copy/metrics';

  type Ctx = 'row' | 'card' | 'hero';
  let {
    value,
    nTrips,
    ctx = 'row',
    showFraming
  }: { value: number | null; nTrips: number; ctx?: Ctx; showFraming?: boolean } = $props();

  // Auto-detect framing from context provider if showFraming not explicitly set
  const framingCtx = getContext<{ consume: () => boolean } | undefined>('per-angler-framing');
  const renderFraming = $derived(
    showFraming ?? (framingCtx ? framingCtx.consume() : false)
  );

  const formatted = $derived.by(() => {
    if (value === null || Number.isNaN(value as number) || nTrips === 0) return '—';
    if ((value as number) >= 10) return String(Math.round(value as number));
    const fixed = (value as number).toFixed(1);
    return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
  });

  const showLowData = $derived(nTrips > 0 && nTrips < 5);
  const tripLabel = $derived(nTrips === 1 ? '1 trip' : `${nTrips} trips`);
  const isUnknown = $derived(formatted === '—');

  const sizeClass = $derived(
    ctx === 'hero' ? 'text-3xl' : ctx === 'card' ? 'text-xl' : 'text-base'
  );
</script>

<span class="inline-flex flex-wrap items-baseline gap-2">
  <span class="tabular-nums font-semibold {sizeClass}">{formatted}</span>
  {#if !isUnknown}
    <span class="text-text-muted text-sm">{FISH_PER_ANGLER_AXIS}</span>
    {#if showLowData}
      <span class="text-text-muted">·</span>
      <LowDataBadge />
    {/if}
    <span class="text-text-muted">·</span>
    <span class="text-text-muted text-sm tabular-nums">n={nTrips} {tripLabel}</span>
  {/if}
</span>
{#if renderFraming && !isUnknown}
  <small class="block text-sm text-(--color-text-muted) mt-1">
    derived boat-aggregate average, not individual angler —
    <a href="/about" class="text-(--color-accent) underline">About the data</a>
  </small>
{/if}
