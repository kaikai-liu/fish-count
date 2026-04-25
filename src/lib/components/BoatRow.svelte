<script lang="ts">
  import ProvisionalBadge from './ProvisionalBadge.svelte';

  let {
    row,
    showProvisional = false
  }: {
    row: {
      boat_id: number;
      boat_name: string;
      landing_name: string;
      trip_type: string;
      species: string;
      species_count: number;
      angler_count: number;
      source_date: string;
    };
    showProvisional?: boolean;
  } = $props();

  const sourceDailyUrl = $derived(
    `https://www.sandiegofishreports.com/dock_totals/boats.php?date=${row.source_date}`
  );
</script>

<tr class="border-b border-[--color-border] hover:bg-[--color-surface-muted]">
  <td class="px-3 py-2">
    <div class="flex flex-wrap items-center gap-2">
      <a href="/boats/{row.boat_id}" class="text-[--color-accent] underline">{row.boat_name}</a>
      {#if showProvisional}
        <ProvisionalBadge />
      {/if}
    </div>
  </td>
  <td class="px-3 py-2 text-[--color-text-muted]">{row.landing_name}</td>
  <td class="px-3 py-2">{row.trip_type}</td>
  <td class="px-3 py-2 tabular-nums text-right">{row.angler_count}</td>
  <td class="px-3 py-2">{row.species}</td>
  <td class="px-3 py-2 tabular-nums text-right">{row.species_count}</td>
  <td class="px-3 py-2">
    <a
      href={sourceDailyUrl}
      target="_blank"
      rel="noopener noreferrer external"
      class="text-[--color-accent] underline"
      aria-label="View on sandiegofishreports.com"
    >↗</a>
  </td>
</tr>
