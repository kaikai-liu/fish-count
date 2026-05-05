<script lang="ts">
  // src/lib/components/LoadingSkeleton.svelte — Phase 8 Plan 04 (POL-02 / D-32)
  //
  // Shimmer placeholder used while loaders are in flight. D-32 split:
  // chart fetches use this skeleton (chart-shaped); typeahead waits use a
  // small spinner (this component does NOT render a spinner — those go
  // inline). Theme-aware via --color-surface-muted; the global
  // prefers-reduced-motion rule in app.css already neutralizes the
  // shimmer animation duration to 0.01ms.

  type Variant = 'chart' | 'rows' | 'card';
  let {
    variant = 'chart',
    height = '320px',
    ariaLabel = 'Loading'
  }: { variant?: Variant; height?: string; ariaLabel?: string } = $props();
</script>

{#if variant === 'chart'}
  <div
    role="status"
    aria-label={ariaLabel}
    aria-live="polite"
    style="height: {height}"
    class="fc-skeleton w-full rounded bg-(--color-surface-muted) border border-(--color-border)"
  ></div>
{:else if variant === 'rows'}
  <div role="status" aria-label={ariaLabel} aria-live="polite" class="space-y-2">
    {#each Array.from({ length: 5 }) as _, i (i)}
      <div class="fc-skeleton h-10 w-full rounded bg-(--color-surface-muted) border border-(--color-border)"></div>
    {/each}
  </div>
{:else}
  <div
    role="status"
    aria-label={ariaLabel}
    aria-live="polite"
    class="fc-skeleton h-32 w-full rounded bg-(--color-surface-muted) border border-(--color-border)"
  ></div>
{/if}
