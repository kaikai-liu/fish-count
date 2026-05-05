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

  // Phase 8 Plan 04 (CMP-01 / D-24). Boat picker: 3 typeahead inputs feeding
  // an HTML <datalist>. Each input holds a typed/picked display_name; we
  // resolve to id via a small JS lookup against data.allBoats before
  // submitting. Keeping the inputs separate (vs comma-paste) makes the UX
  // match the explorer's boat-pill experience and removes the need to know
  // boat IDs at all.
  function preselectedNames(): [string, string, string] {
    const ids = data.filters?.boatIds ?? [];
    const byId = new Map(data.allBoats.map((b) => [b.id, b.display_name]));
    return [
      byId.get(ids[0] ?? -1) ?? '',
      byId.get(ids[1] ?? -1) ?? '',
      byId.get(ids[2] ?? -1) ?? ''
    ];
  }
  const initialNames = preselectedNames();
  let boatName1 = $state(initialNames[0]);
  let boatName2 = $state(initialNames[1]);
  let boatName3 = $state(initialNames[2]);

  function resolveBoatId(name: string): number | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    // Exact-match first; case-insensitive fallback.
    const exact = data.allBoats.find((b) => b.display_name === trimmed);
    if (exact) return exact.id;
    const ci = data.allBoats.find(
      (b) => b.display_name.toLowerCase() === trimmed.toLowerCase()
    );
    return ci?.id ?? null;
  }

  function submit() {
    const ids = [boatName1, boatName2, boatName3]
      .map(resolveBoatId)
      .filter((n): n is number => n !== null);
    if (ids.length < 2 || ids.length > 3 || !formTripType) return;
    const filters: CompareFilters = {
      tripType: formTripType,
      fromDate: formFromDate,
      toDate: formToDate,
      boatIds: ids
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

    <label class="flex min-w-44 flex-col gap-1">
      <span class="text-sm font-semibold">
        Boat 1 <span aria-hidden="true">*</span>
      </span>
      <input
        type="text"
        list="boats-list"
        autocomplete="off"
        class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-2"
        placeholder="Type a boat name…"
        bind:value={boatName1}
      />
    </label>

    <label class="flex min-w-44 flex-col gap-1">
      <span class="text-sm font-semibold">
        Boat 2 <span aria-hidden="true">*</span>
      </span>
      <input
        type="text"
        list="boats-list"
        autocomplete="off"
        class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-2"
        placeholder="Type a boat name…"
        bind:value={boatName2}
      />
    </label>

    <label class="flex min-w-44 flex-col gap-1">
      <span class="text-sm font-semibold">Boat 3 (optional)</span>
      <input
        type="text"
        list="boats-list"
        autocomplete="off"
        class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-2"
        placeholder="Type a boat name…"
        bind:value={boatName3}
      />
    </label>

    <!-- Phase 8 Plan 04 (CMP-01). Single datalist shared by all three inputs.
         T-08-04-09: Svelte auto-escapes display_name in option value; no raw
         HTML render. T-08-04-05: boat names are public data. -->
    <datalist id="boats-list">
      {#each data.allBoats as b (b.id)}
        <option value={b.display_name}></option>
      {/each}
    </datalist>
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
            <h3 class="text-lg font-semibold">
              {data.allBoats.find((b) => b.id === data.filters?.boatIds[i])?.display_name ??
                `Boat ${data.filters?.boatIds[i]}`}
            </h3>
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
