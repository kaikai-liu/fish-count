<script lang="ts">
  let {
    fromDate = $bindable(''),
    toDate = $bindable(''),
    onSubmit,
    clampNote
  }: {
    fromDate?: string;
    toDate?: string;
    onSubmit: (next: { fromDate: string; toDate: string }) => void;
    clampNote?: string | null;
  } = $props();

  function handleToBlur() {
    if (fromDate && toDate) {
      onSubmit({ fromDate, toDate });
    }
  }
</script>

<div class="mt-2 flex flex-wrap gap-3 items-end">
  <label class="flex flex-col gap-1">
    <span class="text-sm font-semibold">From</span>
    <input
      type="date"
      class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-2 text-sm"
      bind:value={fromDate}
      aria-label="From date"
      required
    />
  </label>
  <label class="flex flex-col gap-1">
    <span class="text-sm font-semibold">To</span>
    <input
      type="date"
      class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-2 text-sm"
      bind:value={toDate}
      onblur={handleToBlur}
      aria-label="To date"
      required
    />
  </label>
  {#if clampNote}
    <p class="text-sm text-(--color-text-subtle)">{clampNote}</p>
  {/if}
</div>
