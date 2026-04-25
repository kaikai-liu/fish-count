<script lang="ts">
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import BoatRow from '$lib/components/BoatRow.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';

  let { data }: { data: PageData } = $props();
  const profile = $derived(data.profile);
  const lastScrapedLabel = $derived(data.lastScrapedLabel);
  const sourceUrl = $derived(profile.boat.source_url ?? profile.boat.landing_source_url);
</script>

<svelte:head><title>{profile.boat.display_name} — FishCount</title></svelte:head>

<PageHeader
  title={profile.boat.display_name}
  subtitle={profile.boat.landing_display_name}
  lastScrapedLabel={lastScrapedLabel}
/>

<section class="mb-6 flex flex-wrap gap-4 text-sm">
  {#if sourceUrl}
    <a
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer external"
      class="text-[--color-accent] underline"
    >
      Source listing ↗
    </a>
  {/if}
  <span class="text-[--color-text-muted]">
    View at landing: {profile.boat.landing_display_name}
  </span>
</section>

<section class="mb-8">
  <h2 class="mb-3 text-xl font-semibold">Recent trips (last 90 days)</h2>
  {#if profile.recentTrips.length === 0}
    <EmptyState heading="No trips on file for this boat in the last 90 days." />
  {:else}
    <div class="overflow-x-auto rounded border border-[--color-border]">
      <table class="w-full text-sm">
        <thead class="bg-[--color-surface-muted] text-left text-sm font-semibold">
          <tr>
            <th class="px-3 py-2">Date</th>
            <th class="px-3 py-2">Trip type</th>
            <th class="px-3 py-2 text-right">Anglers</th>
            <th class="px-3 py-2">Species</th>
            <th class="px-3 py-2 text-right">Count</th>
            <th class="px-3 py-2">Source</th>
          </tr>
        </thead>
        <tbody>
          {#each profile.recentTrips as t (`${t.source_date}-${t.trip_type}-${t.species}`)}
            <BoatRow
              row={{
                boat_id: profile.boat.id,
                boat_name: profile.boat.display_name,
                landing_name: profile.boat.landing_display_name,
                trip_type: t.trip_type,
                species: t.species,
                species_count: t.species_count,
                angler_count: t.angler_count,
                source_date: t.source_date
              }}
            />
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<section class="mb-8">
  <h2 class="mb-3 text-xl font-semibold">Season-to-date totals</h2>
  <dl class="grid gap-4 md:grid-cols-3">
    <div class="rounded border border-[--color-border] p-3">
      <dt class="text-sm text-[--color-text-muted]">Total trips</dt>
      <dd class="text-2xl font-semibold tabular-nums">{profile.seasonTotals.total_trips ?? 0}</dd>
    </div>
    <div class="rounded border border-[--color-border] p-3">
      <dt class="text-sm text-[--color-text-muted]">Total anglers</dt>
      <dd class="text-2xl font-semibold tabular-nums">
        {profile.seasonTotals.total_anglers ?? 0}
      </dd>
    </div>
    <div class="rounded border border-[--color-border] p-3">
      <dt class="text-sm text-[--color-text-muted]">Top species</dt>
      <dd>
        {#if profile.seasonTotals.top_species.length === 0}
          <span class="text-[--color-text-muted]">—</span>
        {:else}
          <ul class="text-sm">
            {#each profile.seasonTotals.top_species as s (s.species)}
              <li class="tabular-nums">{s.species}: {s.total_count}</li>
            {/each}
          </ul>
        {/if}
      </dd>
    </div>
  </dl>
</section>

<section>
  <h2 class="mb-3 text-xl font-semibold">Trip types this boat runs</h2>
  {#if profile.tripTypes.length === 0}
    <p class="text-sm text-[--color-text-muted]">No trip types on record.</p>
  {:else}
    <ul class="flex flex-wrap gap-2">
      {#each profile.tripTypes as t (t)}
        <li class="rounded bg-[--color-surface-sunken] px-3 py-1 text-sm font-semibold">{t}</li>
      {/each}
    </ul>
  {/if}
</section>
