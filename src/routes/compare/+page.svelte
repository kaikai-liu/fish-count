<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import Chart from '$lib/components/Chart.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import PerAnglerMetric from '$lib/components/PerAnglerMetric.svelte';
  import PerAnglerFramingProvider from '$lib/components/PerAnglerFramingProvider.svelte';
  import { serializeCompareFilters, type CompareFilters } from '$lib/shared/urlState';
  import { WEEKLY_FISH_PER_ANGLER_HEADING, FISH_PER_ANGLER_ARIA } from '$lib/copy/metrics';

  let { data }: { data: PageData } = $props();

  let formTripType = $state(data.filters?.tripType ?? '');
  let formFromDate = $state(data.filters?.fromDate ?? data.filterOptions.defaultFromDate);
  let formToDate = $state(data.filters?.toDate ?? data.filterOptions.defaultToDate);
  // boatIds stored as a comma-separated string for the text input
  let formBoatIdsRaw = $state(data.filters?.boatIds.join(',') ?? '');

  function submit() {
    const parsedIds = formBoatIdsRaw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (parsedIds.length < 2 || parsedIds.length > 3 || !formTripType) return;
    const filters: CompareFilters = {
      tripType: formTripType,
      fromDate: formFromDate,
      toDate: formToDate,
      boatIds: parsedIds
    };
    const sp = serializeCompareFilters(filters);
    goto(`/compare?${sp.toString()}`, { keepFocus: true, replaceState: true, noScroll: true });
  }

  function reset() {
    goto('/compare', { noScroll: true });
  }
</script>

<svelte:head><title>Compare boats — FishCount</title></svelte:head>

<PageHeader title="Compare boats" lastScrapedLabel={data.lastScrapedLabel} />

<FilterBar>
  {#snippet filters()}
    <label class="flex flex-col gap-1">
      <span class="text-sm font-semibold">
        Trip type <span aria-hidden="true">*</span>
      </span>
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

    <label class="flex min-w-48 flex-col gap-1">
      <span class="text-sm font-semibold">
        Boat IDs (comma-separated, 2–3) <span aria-hidden="true">*</span>
      </span>
      <input
        type="text"
        class="min-h-11 rounded border border-(--color-border) px-2"
        placeholder="e.g. 12,15,23"
        bind:value={formBoatIdsRaw}
      />
      <span class="text-xs text-(--color-text-muted)">
        Find boat IDs on each boat's detail page URL.
      </span>
    </label>
  {/snippet}

  {#snippet actions()}
    <button
      type="button"
      class="min-h-11 rounded bg-(--color-accent) px-4 py-2 font-semibold text-white hover:bg-(--color-accent-hover)"
      onclick={submit}
    >
      Compare boats
    </button>
    <button type="button" class="text-sm text-(--color-text-muted) underline" onclick={reset}>
      Reset
    </button>
  {/snippet}
</FilterBar>

{#if data.guidance}
  <p class="rounded border border-(--color-border) bg-(--color-surface-muted) p-4 text-sm text-(--color-text-muted)">
    {data.guidance}
  </p>
{:else if data.rows && data.chartOption}
  <PerAnglerFramingProvider>
    <section class="mb-8 grid gap-4 md:grid-cols-3">
      {#each data.rows as r, i (i)}
        {#if r === null}
          <article class="rounded border border-(--color-border) p-4 text-sm text-(--color-text-muted)">
            <h3 class="text-lg font-semibold">Boat {data.filters?.boatIds[i]}</h3>
            <p>No trips in window for this boat on {data.filters?.tripType}.</p>
          </article>
        {:else}
          <article class="rounded border border-(--color-border) p-4">
            <h3 class="text-lg font-semibold">{r.boat_name}</h3>
            <p class="text-sm text-(--color-text-muted)">{r.landing_name}</p>
            <div class="mt-3">
              <PerAnglerMetric value={r.avg_per_angler} nTrips={r.total_trips} ctx="card" />
            </div>
            <dl class="mt-3 text-sm text-(--color-text-muted)">
              <div>
                <dt class="inline">Total trips:</dt>
                <dd class="inline tabular-nums">{r.total_trips}</dd>
              </div>
              <div>
                <dt class="inline">Top species:</dt>
                <dd class="inline">{r.top_species ?? '—'}</dd>
              </div>
              <div>
                <dt class="inline">Last trip:</dt>
                <dd class="inline tabular-nums">{r.last_trip_date ?? '—'}</dd>
              </div>
            </dl>
          </article>
        {/if}
      {/each}
    </section>

    <section>
      <h2 class="mb-3 text-xl font-semibold">{WEEKLY_FISH_PER_ANGLER_HEADING}</h2>
      <Chart
        option={data.chartOption}
        ariaLabel={`Weekly ${FISH_PER_ANGLER_ARIA} comparison for ${data.filters?.boatIds.length} boats on ${data.filters?.tripType} from ${data.filters?.fromDate} to ${data.filters?.toDate}`}
        height="320px"
      />
    </section>
  </PerAnglerFramingProvider>
{:else}
  <EmptyState
    heading="Pick a date and target boats"
    body="Select a trip type, a date range, and 2 or 3 boats to compare their historical catch rates."
  />
{/if}
