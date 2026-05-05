<!-- src/lib/components/HomeSectionCard.svelte — Phase 8 D-09/D-10 home-page section.
     Renders one canonical trip type as a card with a heading and N BoatBarRows.
     The per-section max fpa is computed locally so each section's bars fill
     their own scale (D-10) — Overnight (~1 fpa max) and 3.5 Day (~35 fpa max)
     both look readable without one swallowing the other. -->
<script lang="ts">
  import type { HomeSection } from '$lib/db/queries/home';
  import { sectionHeading } from '$lib/copy/home';
  import BoatBarRow from './BoatBarRow.svelte';

  let { section }: { section: HomeSection } = $props();

  // D-10: per-section max fpa — never global. Falls back to 0 (handled
  // gracefully by barWidthPct) when every row's fpa is 0/null.
  const sectionMax = $derived(
    section.rows.reduce((m, r) => (r.fpa > m ? r.fpa : m), 0)
  );
</script>

<section class="mb-6 rounded border border-(--color-border) bg-(--color-surface) overflow-hidden">
  <header class="border-b border-(--color-border) bg-(--color-surface-muted) px-3 py-2">
    <h2 class="text-lg font-semibold">{sectionHeading(section.canonical_trip_type, section.trip_count)}</h2>
  </header>
  <div>
    {#each section.rows as row (row.boat_id)}
      <BoatBarRow {row} {sectionMax} />
    {/each}
  </div>
</section>
