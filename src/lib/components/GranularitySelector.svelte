<script lang="ts">
  // src/lib/components/GranularitySelector.svelte — Phase 8 Plan 04 (GRN-01).
  // Daily / Weekly / Monthly button group. Mirrors RangeStrip.svelte exactly
  // (PATTERNS.md says "the entire 36-line file is the literal model").
  // Hidden by parent (ExplorerHeader) when range < 3M (D-37 hide rule).
  import type { Granularity } from '$lib/shared/urlState';

  let {
    value,
    onChange
  }: {
    value: Granularity;
    onChange: (next: Granularity) => void;
  } = $props();

  const items: Array<{ id: Granularity; label: string }> = [
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' }
  ];
</script>

<div role="group" aria-label="Chart granularity" class="flex gap-1">
  {#each items as item (item.id)}
    <button
      type="button"
      aria-pressed={value === item.id}
      class="min-h-11 shrink-0 rounded border px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors {value === item.id
        ? 'bg-(--color-accent) text-white border-(--color-accent) hover:bg-(--color-accent-hover) hover:border-(--color-accent-hover)'
        : 'bg-(--color-surface) text-(--color-text-muted) border-(--color-border) hover:bg-(--color-accent-bg) hover:text-(--color-accent) hover:border-(--color-accent)'}"
      onclick={() => onChange(item.id)}
    >
      {item.label}
    </button>
  {/each}
</div>
