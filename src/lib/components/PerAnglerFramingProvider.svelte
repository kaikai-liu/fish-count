<script lang="ts">
  import { setContext } from 'svelte';
  let { children } = $props();
  // Plain ref — NOT $state. The consume() latch is mutated from inside
  // PerAnglerMetric template expressions during render, which Svelte 5
  // forbids on $state values (state_unsafe_mutation). We never want to
  // re-render based on this flag — it's a one-shot "did the first metric
  // claim the framing slot?" marker for the duration of this provider's
  // mount, so a plain object is the correct shape.
  const latch = { rendered: false };
  setContext('per-angler-framing', {
    consume(): boolean {
      if (latch.rendered) return false;
      latch.rendered = true;
      return true;
    }
  });
</script>
{@render children()}
