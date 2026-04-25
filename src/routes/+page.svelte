<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import BoatRow from '$lib/components/BoatRow.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { serializeHomeFilters } from '$lib/shared/urlState';

  let { data }: { data: PageData } = $props();

  function applyFilter(key: 'tripType' | 'landing' | 'species', value: string) {
    const next = { ...data.filters, [key]: value || undefined };
    const sp = serializeHomeFilters(next);
    goto(`?${sp.toString()}`, { keepFocus: true, replaceState: true, noScroll: true });
  }

  function reset() {
    goto('/', { keepFocus: true, replaceState: true, noScroll: true });
  }
</script>

<svelte:head>
  <title>Today's Counts — FishCount</title>
</svelte:head>

<PageHeader
  title="Today's Counts"
  subtitle={`${data.date}, San Diego`}
  showProvisional={data.isProvisional}
  lastScrapedLabel={data.lastScrapedLabel}
/>

<FilterBar>
  {#snippet filters()}
    <label class="flex flex-col gap-1">
      <span class="text-sm font-semibold">Trip type</span>
      <select
        class="min-h-11 rounded border border-[--color-border] bg-[--color-surface] px-2"
        value={data.filters.tripType ?? ''}
        onchange={(e) => applyFilter('tripType', (e.target as HTMLSelectElement).value)}
      >
        <option value="">All</option>
        {#each data.filterOptions.tripTypes as t}
          <option value={t}>{t}</option>
        {/each}
      </select>
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-sm font-semibold">Landing</span>
      <select
        class="min-h-11 rounded border border-[--color-border] bg-[--color-surface] px-2"
        value={data.filters.landing ?? ''}
        onchange={(e) => applyFilter('landing', (e.target as HTMLSelectElement).value)}
      >
        <option value="">All</option>
        {#each data.filterOptions.landings as l}
          <option value={l.display_name}>{l.display_name}</option>
        {/each}
      </select>
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-sm font-semibold">Species</span>
      <select
        class="min-h-11 rounded border border-[--color-border] bg-[--color-surface] px-2"
        value={data.filters.species ?? ''}
        onchange={(e) => applyFilter('species', (e.target as HTMLSelectElement).value)}
      >
        <option value="">All</option>
        {#each data.filterOptions.speciesList as s}
          <option value={s}>{s}</option>
        {/each}
      </select>
    </label>
  {/snippet}
  {#snippet actions()}
    <button type="button" class="text-sm text-[--color-text-muted] underline" onclick={reset}>Reset filters</button>
    <a href="/date/{data.date}" class="text-sm text-[--color-accent] underline">View past dates</a>
  {/snippet}
</FilterBar>

{#if data.rows.length === 0}
  <EmptyState
    heading="No counts reported yet today."
    body="Boats are still out, or the evening scrape hasn't run. Check back after 23:00 PT."
  />
{:else}
  <div class="overflow-x-auto rounded border border-[--color-border]">
    <table class="w-full text-sm">
      <thead class="bg-[--color-surface-muted] text-left text-sm font-semibold">
        <tr>
          <th class="px-3 py-2">Boat</th>
          <th class="px-3 py-2">Landing</th>
          <th class="px-3 py-2">Trip type</th>
          <th class="px-3 py-2 text-right">Anglers</th>
          <th class="px-3 py-2">Species</th>
          <th class="px-3 py-2 text-right">Count</th>
          <th class="px-3 py-2">Source</th>
        </tr>
      </thead>
      <tbody>
        {#each data.rows as row (row.boat_id + '-' + row.trip_type + '-' + row.species)}
          <BoatRow {row} showProvisional={data.isProvisional} />
        {/each}
      </tbody>
    </table>
  </div>
{/if}
