<script lang="ts">
  type Range = '1m' | '3m' | '6m' | '1y' | '2y' | '5y' | 'all' | 'custom';
  let {
    value,
    onChange
  }: {
    value: Range;
    onChange: (next: Range) => void;
  } = $props();

  const items: Array<{ id: Range; label: string }> = [
    { id: '1m', label: '1M' },
    { id: '3m', label: '3M' },
    { id: '6m', label: '6M' },
    { id: '1y', label: '1Y' },
    { id: '2y', label: '2Y' },
    { id: '5y', label: '5Y' },
    { id: 'all', label: 'All' },
    { id: 'custom', label: 'Custom' }
  ];
</script>

<div role="group" aria-label="Time range" class="flex gap-1 overflow-x-auto md:overflow-visible pb-1">
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
