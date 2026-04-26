<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import Chart from '$lib/components/Chart.svelte';
  import { serializeTrendsFilters, type TrendsFilters } from '$lib/shared/urlState';
  import { FISH_PER_ANGLER_ARIA } from '$lib/copy/metrics';

  let { data }: { data: PageData } = $props();

  // Form state: seeded from URL-driven SSR data. On filter submit, goto() triggers
  // a full SSR reload which re-seeds these values from the new URL state.
  // Using $state here is intentional — the form state is independent of data
  // between submissions (the user edits filters before clicking "View trend").
  // eslint-disable-next-line svelte/no-reactive-reassignment
  let formSpecies = $state(data.filters?.species ?? '');
  // eslint-disable-next-line svelte/no-reactive-reassignment
  let formTripType = $state(data.filters?.tripType ?? '');
  // eslint-disable-next-line svelte/no-reactive-reassignment
  let formBoatId = $state(data.filters?.boatId?.toString() ?? '');
  // eslint-disable-next-line svelte/no-reactive-reassignment
  let formRange = $state<TrendsFilters['range']>(data.filters?.range ?? '1y');
  // eslint-disable-next-line svelte/no-reactive-reassignment
  let formGranularity = $state<TrendsFilters['granularity']>(data.filters?.granularity);

  function submit() {
    if (!formSpecies || !formTripType) return;
    const filters: TrendsFilters = {
      species: formSpecies,
      tripType: formTripType,
      boatId: formBoatId ? Number(formBoatId) : undefined,
      range: formRange,
      granularity: formGranularity
    };
    const sp = serializeTrendsFilters(filters);
    goto(`/trends?${sp.toString()}`, { keepFocus: true, replaceState: true, noScroll: true });
  }

  function reset() {
    goto('/trends', { noScroll: true });
  }
</script>

<svelte:head>
  <title>Trends — FishCount</title>
</svelte:head>

<PageHeader title="Trends" lastScrapedLabel={data.lastScrapedLabel} />

<FilterBar>
  {#snippet filters()}
    <label class="flex flex-col gap-1">
      <span class="text-sm font-semibold"
        >Species <span aria-hidden="true">*</span></span
      >
      <select
        class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-2"
        required
        bind:value={formSpecies}
      >
        <option value="" disabled>Choose…</option>
        {#each data.filterOptions.speciesList as s}<option value={s}>{s}</option>{/each}
      </select>
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-sm font-semibold"
        >Trip type <span aria-hidden="true">*</span></span
      >
      <select
        class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-2"
        required
        bind:value={formTripType}
      >
        <option value="" disabled>Choose…</option>
        {#each data.filterOptions.tripTypes as t}<option value={t}>{t}</option>{/each}
      </select>
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-sm font-semibold">Boat (optional)</span>
      <input
        type="number"
        min="1"
        class="min-h-11 w-32 rounded border border-(--color-border) px-2 tabular-nums"
        bind:value={formBoatId}
      />
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-sm font-semibold">Range</span>
      <select
        class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-2"
        bind:value={formRange}
      >
        <option value="3mo">3 months</option>
        <option value="6mo">6 months</option>
        <option value="1y">1 year</option>
        <option value="all">All</option>
      </select>
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-sm font-semibold">Granularity</span>
      <select
        class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-2"
        bind:value={formGranularity}
      >
        <option value="">(auto)</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
    </label>
  {/snippet}
  {#snippet actions()}
    <button
      type="button"
      class="min-h-11 rounded bg-(--color-accent) px-4 py-2 font-semibold text-white hover:bg-(--color-accent-hover)"
      onclick={submit}
    >
      View trend
    </button>
    <button
      type="button"
      class="text-sm text-(--color-text-muted) underline"
      onclick={reset}
    >
      Reset
    </button>
  {/snippet}
</FilterBar>

{#if data.guidance}
  <p class="rounded border border-(--color-border) bg-(--color-surface-muted) p-4 text-sm text-(--color-text-muted)">
    {data.guidance}
  </p>
{:else if data.chartOption && data.filters}
  <section>
    <Chart
      option={data.chartOption}
      ariaLabel={`${data.granularity} ${FISH_PER_ANGLER_ARIA} trend for ${data.filters.species} on ${data.filters.tripType}${data.boatName ? ' for ' + data.boatName : ''}`}
      height="360px"
    />
    <p class="mt-2 text-sm text-(--color-text-muted)">{data.captionGranularity}</p>
  </section>
{/if}
