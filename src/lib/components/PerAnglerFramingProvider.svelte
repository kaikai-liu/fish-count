<script lang="ts">
  import { setContext } from 'svelte';
  let { children } = $props();
  const state = $state({ rendered: false });
  setContext('per-angler-framing', {
    consume(): boolean {
      if (state.rendered) return false;
      state.rendered = true;
      return true;
    }
  });
</script>
{@render children()}
