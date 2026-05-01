<script lang="ts">
  let {
    rows
  }: {
    rows: Array<{ species: string; total_catch: number; n_trips: number }>;
  } = $props();
</script>

{#if rows.length > 0}
  <section class="mt-6">
    <h2 class="text-base font-semibold mb-3">Species caught</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
      {#each rows as row (row.species)}
        <div class="flex justify-between rounded border border-(--color-border) bg-(--color-surface-muted) px-3 py-2 text-sm">
          <span class="text-(--color-text)">{row.species}</span>
          <span class="tabular-nums text-(--color-text-muted)">{row.total_catch.toLocaleString()} total · n={row.n_trips}</span>
        </div>
      {/each}
    </div>
  </section>
{/if}
