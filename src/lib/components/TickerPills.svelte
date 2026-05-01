<script lang="ts">
  type Ticker = 'boat' | 'species' | 'landing';
  let {
    value,
    onChange
  }: {
    value: Ticker;
    onChange: (next: Ticker) => void;
  } = $props();

  const items: Array<{ id: Ticker; label: string }> = [
    { id: 'boat', label: 'Boat' },
    { id: 'species', label: 'Species' },
    { id: 'landing', label: 'Landing' }
  ];
</script>

<div role="group" aria-label="Ticker type" class="flex gap-2">
  {#each items as item (item.id)}
    <button
      type="button"
      aria-pressed={value === item.id}
      class="min-h-11 flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors {value === item.id
        ? 'bg-(--color-accent) text-white hover:bg-(--color-accent-hover)'
        : 'bg-(--color-surface-muted) text-(--color-text-muted) hover:bg-(--color-accent-bg) hover:text-(--color-accent)'}"
      onclick={() => onChange(item.id)}
    >
      {item.label}
    </button>
  {/each}
</div>
