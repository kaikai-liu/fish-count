<script lang="ts">
  import { getContext } from 'svelte';
  import LowDataBadge from './LowDataBadge.svelte';
  import { FISH_PER_ANGLER_AXIS, FORECAST_LABEL, NOT_ENOUGH_HISTORY, PI_LABEL } from '$lib/copy/metrics';
  import { formatPerAngler } from '$lib/shared/format';

  type Ctx = 'row' | 'card' | 'hero';
  type Kind = 'historical' | 'forecast';

  let {
    value,
    nTrips,
    ctx = 'row',
    showFraming,
    kind = 'historical' as Kind,
    pi
  }: {
    value: number | null;
    nTrips: number;
    ctx?: Ctx;
    showFraming?: boolean;
    kind?: Kind;
    pi?: { low: number; high: number };
  } = $props();

  // Auto-detect framing from context provider if showFraming not explicitly set
  const framingCtx = getContext<{ consume: () => boolean } | undefined>('per-angler-framing');
  const renderFraming = $derived(
    showFraming ?? (framingCtx ? framingCtx.consume() : false)
  );

  const formatted = $derived.by(() => {
    // D-25: forecast kind has its own formatting rules.
    if (kind === 'forecast') {
      if (value === null || Number.isNaN(value as number)) {
        // D-08 verbatim n<5 refusal copy. nTrips==0 also renders refusal.
        return NOT_ENOUGH_HISTORY;
      }
      // D-23: integer-only display (Math.round) — no decimals ever for forecasts.
      return String(Math.round(value as number));
    }
    // Historical branch — extracted to shared helper for web/email parity (UI-SPEC FLAG #9).
    return formatPerAngler(value, nTrips);
  });

  // For forecast kind, the 'not enough history' branch replaces the LowDataBadge entirely.
  // Historical kind keeps the existing low-data flag rule.
  const showLowData = $derived(kind === 'historical' && nTrips > 0 && nTrips < 5);
  const tripLabel = $derived(nTrips === 1 ? '1 trip' : `${nTrips} trips`);
  const isUnknown = $derived(formatted === '—' || formatted === NOT_ENOUGH_HISTORY);
  const isForecastWithValue = $derived(kind === 'forecast' && formatted !== NOT_ENOUGH_HISTORY);

  // D-30: forecast framing link points to the anchored /about#forecasts section.
  const aboutHref = $derived(kind === 'forecast' ? '/about#forecasts' : '/about');

  const sizeClass = $derived(
    ctx === 'hero' ? 'text-3xl' : ctx === 'card' ? 'text-xl' : 'text-base'
  );
</script>

<span class="inline-flex flex-wrap items-baseline gap-2">
  <span class="tabular-nums font-semibold {sizeClass}">{formatted}</span>
  {#if isForecastWithValue}
    <span class="text-text-muted text-sm">{FORECAST_LABEL}</span>
  {/if}
  {#if !isUnknown}
    <span class="text-text-muted text-sm">{FISH_PER_ANGLER_AXIS}</span>
    {#if isForecastWithValue && pi}
      <span class="text-text-muted text-sm tabular-nums">[{Math.round(pi.low)}–{Math.round(pi.high)} {PI_LABEL}]</span>
    {/if}
    {#if showLowData}
      <span class="text-text-muted">·</span>
      <LowDataBadge />
    {/if}
    <span class="text-text-muted">·</span>
    <span class="text-text-muted text-sm tabular-nums">n={nTrips} {tripLabel}</span>
  {/if}
  {#if formatted === NOT_ENOUGH_HISTORY}
    <span class="text-text-muted">·</span>
    <span class="text-text-muted text-sm tabular-nums">n={nTrips} {tripLabel}</span>
  {/if}
</span>
{#if renderFraming && !isUnknown}
  <small class="block text-sm text-(--color-text-muted) mt-1">
    derived boat-aggregate average, not individual angler —
    <a href={aboutHref} class="text-(--color-accent) underline">About the data</a>
  </small>
{/if}
