<script lang="ts">
  // Polish pass: unified supporting list under the explorer chart. Renders
  // either a "Species caught" list (boat ticker) or a "Boats at this …"
  // list (landing/species ticker). Rows are clickable links so anglers can
  // jump from a boat's species list into that species' ticker, etc.
  import LowDataBadge from './LowDataBadge.svelte';

  type Row = {
    label: string;
    href: string;
    fish_per_angler: number | null;
    total_catch: number;
    n_trips: number;
  };

  let {
    heading,
    rows
  }: {
    heading: string;
    rows: Row[];
  } = $props();

  function fmtFpa(v: number | null): string {
    if (v == null) return '—';
    return v.toFixed(v >= 10 ? 0 : 1);
  }
</script>

{#if rows.length > 0}
  <section class="mt-6">
    <h2 class="text-base font-semibold mb-3">{heading}</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
      {#each rows as row (row.label)}
        <a
          href={row.href}
          class="flex items-baseline justify-between gap-3 rounded border border-(--color-border) bg-(--color-surface-muted) px-3 py-2 text-sm transition-colors hover:border-(--color-accent) hover:bg-(--color-accent-bg)"
        >
          <span class="flex items-center gap-2 text-(--color-text)">
            {row.label}
            {#if row.n_trips > 0 && row.n_trips < 5}
              <LowDataBadge />
            {/if}
          </span>
          <span class="tabular-nums text-(--color-text-muted)">
            <span class="text-(--color-text)">{fmtFpa(row.fish_per_angler)}</span>
            fish/angler
            ·
            {row.total_catch.toLocaleString()} total
            ·
            {row.n_trips.toLocaleString()} {row.n_trips === 1 ? 'trip' : 'trips'}
          </span>
        </a>
      {/each}
    </div>
  </section>
{/if}
