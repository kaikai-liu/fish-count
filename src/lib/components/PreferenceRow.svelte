<script lang="ts">
  // src/lib/components/PreferenceRow.svelte
  // Phase 4 ALT-02 manage page row primitive. Analog: src/lib/components/BoatRow.svelte.
  // No-JS contract: Remove form is a real <form method="POST"> — server-side action handles the delete.

  let {
    kind,
    label,
    href,
    removeFormAction
  }: {
    kind: 'boat' | 'species';
    label: string;
    href?: string;
    removeFormAction: string; // SvelteKit form-action e.g. '?/removeBoat'
  } = $props();
</script>

<div class="flex items-center justify-between border-b border-(--color-border) py-3">
  <div class="flex flex-1 items-center gap-2">
    {#if href}
      <a href={href} class="text-(--color-accent) underline">{label}</a>
    {:else}
      <span>{label}</span>
    {/if}
  </div>
  <form method="POST" action={removeFormAction} class="m-0">
    <input type="hidden" name="kind" value={kind} />
    <input type="hidden" name="label" value={label} />
    <button
      type="submit"
      class="min-h-11 text-sm text-(--color-text-muted) hover:text-(--color-destructive) underline"
    >
      Remove
    </button>
  </form>
</div>
