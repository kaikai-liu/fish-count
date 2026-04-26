<script lang="ts">
  // src/routes/picker/+page.svelte — Trip Picker UI (TRP-01..09)
  //
  // Sources:
  //   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-10..D-19, D-28, D-31
  //   .planning/phases/02-browse-trip-picker-trends/02-UI-SPEC.md §"/picker"
  //
  // Anti-feature guard: No inline per-angler unit literals — all per-angler text
  // goes through $lib/copy/metrics constants or the PerAnglerMetric component.
  // No SQL. No banned date idiom. No hype badges, no sponsored slots.
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import Chart from '$lib/components/Chart.svelte';
  import BoatCard from '$lib/components/BoatCard.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import PerAnglerFramingProvider from '$lib/components/PerAnglerFramingProvider.svelte';
  import { serializePickerFilters, type PickerFilters } from '$lib/shared/urlState';
  import { FISH_PER_ANGLER_ARIA } from '$lib/copy/metrics';
  import { buildHeatmapOption } from './heatmapOption';
  import type { EChartsOption } from 'echarts';

  let { data }: { data: PageData } = $props();

  // Local form state — initialized from current filters or sensible defaults.
  let formDate = $state(data.filters?.date ?? data.filterOptions.defaultDate);
  let formSpecies = $state(data.filters?.species ?? '');
  let formTripType = $state(data.filters?.tripType ?? data.filterOptions.defaultTripType ?? '');
  let formWindowDays = $state(data.filters?.windowDays ?? 3);
  let formRangeMode = $state(data.filters?.rangeMode ?? false);
  let formFromDate = $state(data.filters?.fromDate ?? '');
  let formToDate = $state(data.filters?.toDate ?? '');

  function submit() {
    if (!formTripType || !formSpecies || !formDate) {
      return; // required fields guard — native validation also applies
    }
    const filters: PickerFilters = {
      date: formDate,
      species: formSpecies,
      tripType: formTripType,
      windowDays: formWindowDays,
      rangeMode: formRangeMode,
      fromDate: formRangeMode ? formFromDate : undefined,
      toDate: formRangeMode ? formToDate : undefined
    };
    const sp = serializePickerFilters(filters);
    // D-19: URL-state round-trip via goto (keepFocus + replaceState + noScroll).
    goto(`/picker?${sp.toString()}`, { keepFocus: true, replaceState: true, noScroll: true });
  }

  function reset() {
    goto('/picker', { noScroll: true });
  }

  // Heatmap chart option — built from the pure helper (zero DOM deps, fully tested).
  const heatmapOption = $derived.by<EChartsOption | null>(() => {
    if (!data.heatmap || !data.heatmapRange) return null;
    return buildHeatmapOption(data.heatmap, data.heatmapRange);
  });

  // Aria-label uses FISH_PER_ANGLER_ARIA constant — never the inline literal.
  const heatmapAriaLabel = $derived(
    data.filters
      ? `30-day calendar heatmap of ${data.filters.species} catch on ${data.filters.tripType} trips, ${FISH_PER_ANGLER_ARIA}, gray cells indicate fewer than 5 trips`
      : 'Calendar heatmap — no data selected'
  );
</script>

<svelte:head>
  <title>Trip Picker — FishCount</title>
</svelte:head>

<PageHeader
  title="Trip Picker"
  subtitle="Find boats by date and species"
  lastScrapedLabel={data.lastScrapedLabel}
/>

<FilterBar>
  {#snippet filters()}
    <label class="flex flex-col gap-1">
      <span class="text-sm font-semibold">Target date <span aria-hidden="true">*</span></span>
      <input
        type="date"
        class="min-h-11 rounded border border-(--color-border) px-2"
        required
        bind:value={formDate}
      />
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-sm font-semibold">Species <span aria-hidden="true">*</span></span>
      <select
        class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-2"
        required
        bind:value={formSpecies}
      >
        <option value="" disabled>Choose…</option>
        {#each data.filterOptions.speciesList as s (s)}
          <option value={s}>{s}</option>
        {/each}
      </select>
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-sm font-semibold">Trip type <span aria-hidden="true">*</span></span>
      <select
        class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-2"
        required
        bind:value={formTripType}
      >
        <option value="" disabled>Choose…</option>
        {#each data.filterOptions.tripTypes as t (t)}
          <option value={t}>{t}</option>
        {/each}
      </select>
    </label>

    {#if !formRangeMode}
      <label class="flex flex-col gap-1">
        <span class="text-sm font-semibold">± days</span>
        <input
          type="number"
          min="0"
          max="14"
          class="min-h-11 w-20 rounded border border-(--color-border) px-2 tabular-nums"
          bind:value={formWindowDays}
        />
      </label>
    {:else}
      <label class="flex flex-col gap-1">
        <span class="text-sm font-semibold">From</span>
        <input
          type="date"
          class="min-h-11 rounded border border-(--color-border) px-2"
          bind:value={formFromDate}
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-semibold">To</span>
        <input
          type="date"
          class="min-h-11 rounded border border-(--color-border) px-2"
          bind:value={formToDate}
        />
      </label>
    {/if}

    <label class="flex items-center gap-2 self-end">
      <input type="checkbox" bind:checked={formRangeMode} />
      <span class="text-sm">Use date range</span>
    </label>
  {/snippet}

  {#snippet actions()}
    <button
      type="button"
      class="min-h-11 rounded bg-(--color-accent) px-4 py-2 font-semibold text-white hover:bg-(--color-accent-hover)"
      onclick={submit}
    >
      Find boats
    </button>
    <button
      type="button"
      class="text-sm text-(--color-text-muted) underline"
      onclick={reset}
    >
      Reset filters
    </button>
  {/snippet}
</FilterBar>

{#if data.guidance}
  <!-- TRP-05: No trip type submitted — render guidance prompt -->
  <p class="rounded border border-(--color-border) bg-(--color-surface-muted) p-4 text-sm text-(--color-text-muted)">
    {data.guidance}
  </p>
{:else if data.rankings && data.rankings.length === 0}
  <EmptyState
    heading="No matching trips."
    body="Try a wider ± days window, a different species, or a different trip type."
  />
{:else if data.rankings && data.heatmap && data.filters && heatmapOption}
  <PerAnglerFramingProvider>
    <!-- 30-day heatmap section -->
    <section class="mb-8">
      <h2 class="mb-3 text-xl font-semibold">30-day window</h2>
      <Chart option={heatmapOption} ariaLabel={heatmapAriaLabel} height="240px" />
      <p class="mt-2 text-sm text-(--color-text-muted)">
        Cells with fewer than 5 historical trips render gray (insufficient data).
      </p>
    </section>

    <!-- Ranked boat list — PerAnglerFramingProvider context ensures first PerAnglerMetric
         renders the inline framing disclaimer (CLAUDE.md non-negotiable #4). -->
    <section>
      <h2 class="mb-3 text-xl font-semibold">
        Ranked boats ({data.rankings.length})
      </h2>
      <ul class="grid gap-4 md:grid-cols-2">
        {#each data.rankings as boat, i (boat.boat_id)}
          {@const w = data.why?.[boat.boat_id]}
          {#if w}
            <li>
              <BoatCard rank={i + 1} {boat} why={w} />
            </li>
          {/if}
        {/each}
      </ul>
    </section>
  </PerAnglerFramingProvider>
{/if}
