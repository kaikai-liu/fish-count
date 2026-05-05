<!-- src/lib/components/BoatBarRow.svelte — Phase 8 D-09/D-10 home-page row.
     Renders one boat in a section: a normalized horizontal bar (per-section
     max), the boat name as a link to its explorer view, and the fpa /
     trip-count headline plus a supporting "anglers · total" context line.
     The NewLabelBadge surfaces inline when this boat's data has at least one
     constituent raw label still in pending alias status (D-05).
     Mobile-first: ≥44px tap target via min-h-11 (D-04). -->
<script lang="ts">
  import type { HomeRow } from '$lib/db/queries/home';
  import { ROW_FPA_LINE, ROW_TOTALS_LINE } from '$lib/copy/home';
  import { barWidthPct } from '$lib/shared/normalize';
  import NewLabelBadge from './NewLabelBadge.svelte';
  import LowDataBadge from './LowDataBadge.svelte';

  let { row, sectionMax }: { row: HomeRow; sectionMax: number } = $props();

  const widthPct = $derived(barWidthPct(row.fpa, sectionMax));
  // About-page contract: n<5 trips → flag as 'low data'. Mirrors PerAnglerMetric.
  const showLowData = $derived(row.trip_count > 0 && row.trip_count < 5);
</script>

<div class="relative border-b border-(--color-border) last:border-b-0 min-h-11">
  <!-- D-10 normalized bar background (per-section max). aria-hidden — the
       fpa text is the assistive label, the bar is decoration. -->
  <div
    class="absolute inset-y-0 left-0 bg-(--color-accent-bg)"
    style="width: {widthPct}%"
    aria-hidden="true">
  </div>

  <div class="relative flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2">
    <div class="flex flex-wrap items-center gap-2">
      <a
        href="/explorer?ticker=boat&slug={row.boat_slug}"
        class="text-(--color-accent) underline font-semibold">
        {row.boat_display_name}
      </a>
      {#if row.pending}
        <NewLabelBadge />
      {/if}
      {#if showLowData}
        <LowDataBadge />
      {/if}
    </div>
    <div class="text-right text-sm tabular-nums">
      <div class="font-semibold">{ROW_FPA_LINE(row.fpa, row.trip_count)}</div>
      <div class="text-(--color-text-muted)">{ROW_TOTALS_LINE(row.total_caught, row.total_anglers)}</div>
    </div>
  </div>
</div>
