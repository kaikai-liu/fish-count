<script lang="ts">
  import PerAnglerMetric from './PerAnglerMetric.svelte';
  import { BEST_DAY_UNIT } from '$lib/copy/metrics';
  import { slide } from 'svelte/transition';

  let {
    rank,
    boat,
    why
  }: {
    rank: number;
    boat: {
      boat_id: number;
      boat_name: string;
      landing_name: string;
      avg_per_angler: number | null;
      n_trips: number;
      last_trip_date: string | null;
      trip_type: string;
    };
    why: {
      species: string;
      tripType: string;
      windowStart: string;
      windowEnd: string;
      bestDay: { date: string; value: number } | null;
    };
  } = $props();

  let expanded = $state(false);
  const panelId = $derived(`why-${boat.boat_id}`);
</script>

<article class="rounded border border-(--color-border) bg-(--color-surface) p-4 shadow-sm">
  <header class="flex items-start justify-between gap-3">
    <div>
      <h3 class="text-xl font-semibold">
        <a href="/boats/{boat.boat_id}" class="text-(--color-text) hover:text-(--color-accent)">{boat.boat_name}</a>
      </h3>
      <p class="text-sm text-(--color-text-muted)">{boat.landing_name}</p>
    </div>
    <span class="text-sm text-(--color-text-subtle) tabular-nums">#{rank}</span>
  </header>

  <div class="mt-3">
    <PerAnglerMetric value={boat.avg_per_angler} nTrips={boat.n_trips} ctx="card" />
  </div>

  <dl class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-(--color-text-muted)">
    <div><dt class="inline">last trip:</dt> <dd class="inline tabular-nums">{boat.last_trip_date ?? '—'}</dd></div>
    <div>
      <span class="inline-flex items-center rounded bg-(--color-surface-sunken) px-2 py-0.5 text-xs font-semibold text-(--color-text)">
        {boat.trip_type}
      </span>
    </div>
  </dl>

  <button
    type="button"
    class="mt-3 text-sm text-(--color-accent) underline"
    aria-expanded={expanded}
    aria-controls={panelId}
    onclick={() => (expanded = !expanded)}
  >
    Why this boat? {expanded ? '▲' : '▼'}
  </button>

  {#if expanded}
    <div id={panelId} class="mt-3 rounded bg-(--color-surface-muted) p-3 text-sm" transition:slide>
      <p>
        Based on n={boat.n_trips} {boat.n_trips === 1 ? 'trip' : 'trips'} matching
        <strong>{why.species}</strong> on <strong>{why.tripType}</strong>
        between {why.windowStart} and {why.windowEnd}:
      </p>
      <ul class="mt-2 list-disc pl-5 space-y-1">
        <li>Weighted average: <PerAnglerMetric value={boat.avg_per_angler} nTrips={boat.n_trips} ctx="row" /></li>
        <li>Last trip in window: <span class="tabular-nums">{boat.last_trip_date ?? '—'}</span></li>
        {#if why.bestDay}
          <li>Best day in window: <span class="tabular-nums">{why.bestDay.date}</span> · {why.bestDay.value.toFixed(1)} {BEST_DAY_UNIT}</li>
        {/if}
      </ul>
      <p class="mt-2">
        <a href="/boats/{boat.boat_id}" class="text-(--color-accent) underline">View full boat history →</a>
      </p>
    </div>
  {/if}
</article>
