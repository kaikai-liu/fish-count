<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import BoatRow from '$lib/components/BoatRow.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { serializeDateFilters } from '$lib/shared/urlState';

  let { data }: { data: PageData } = $props();

  function applyFilter(key: 'tripType' | 'landing' | 'species', value: string) {
    const next = { ...data.filters, [key]: value || undefined };
    const sp = serializeDateFilters(next);
    goto(`/date/${data.date}?${sp.toString()}`, { keepFocus: true, replaceState: true, noScroll: true });
  }

  function jumpToDate(value: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      goto(`/date/${value}`, { noScroll: true });
    }
  }
</script>

<svelte:head>
  <title>{data.date} Counts — FishCount</title>
</svelte:head>

<PageHeader
  title="{data.date} Counts"
  subtitle="San Diego"
  showProvisional={data.isProvisional}
  lastScrapedLabel={data.lastScrapedLabel}
/>

<nav class="mb-4 flex flex-wrap items-center gap-3 text-sm" aria-label="Date navigation">
  {#if data.nav.prevDisabled}
    <span class="text-[--color-text-subtle]">‹ Previous day</span>
  {:else}
    <a class="text-[--color-accent] underline" href="/date/{data.nav.prevDate}">‹ Previous day</a>
  {/if}
  <label class="flex items-center gap-2">
    <span class="sr-only">Pick a date</span>
    <input
      type="date"
      class="min-h-11 rounded border border-[--color-border] px-2"
      value={data.date}
      min={data.nav.minDate}
      max={data.nav.maxDate}
      onchange={(e) => jumpToDate((e.target as HTMLInputElement).value)}
    />
  </label>
  <a class="text-[--color-accent] underline" href="/">Today</a>
  {#if data.nav.nextDisabled}
    <span class="text-[--color-text-subtle]">Next day ›</span>
  {:else}
    <a class="text-[--color-accent] underline" href="/date/{data.nav.nextDate}">Next day ›</a>
  {/if}
</nav>

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
        {#each data.filterOptions.tripTypes as t}<option value={t}>{t}</option>{/each}
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
        {#each data.filterOptions.landings as l}<option value={l.display_name}>{l.display_name}</option>{/each}
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
        {#each data.filterOptions.speciesList as s}<option value={s}>{s}</option>{/each}
      </select>
    </label>
  {/snippet}
</FilterBar>

{#if data.rows.length === 0}
  <EmptyState
    heading="No counts on file for {data.date}."
    body="This date is either before the dataset's earliest record, or no boats reported."
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
