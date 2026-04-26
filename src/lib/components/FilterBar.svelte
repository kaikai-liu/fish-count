<!--
  FilterBar — slot-based filter bar wrapper.

  Usage pattern (D-19 URL-state round-trip):
  Routes that need URL-driven filter changes import `goto` from `$app/navigation`
  and call `goto(url, { keepFocus: true, replaceState: true, noScroll: true })`.
  FilterBar itself does NOT call goto — that responsibility lives in the route page
  so each route owns its filter shape (parsePickerFilters etc. from urlState.ts).

  The `filters` snippet slot holds route-owned filter inputs (selects, date pickers, etc).
  The `actions` snippet slot holds submit/find/compare buttons when batch application is needed.
  Touch targets: all interactive children should use min-h-11 (44px) to meet the mobile target.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    filters,
    actions
  }: {
    filters: Snippet;
    actions?: Snippet;
  } = $props();
</script>

<form
  role="search"
  class="mb-6 flex flex-col gap-4 rounded border border-(--color-border) bg-(--color-surface-muted) p-4 md:flex-row md:flex-wrap md:items-end md:gap-4"
  onsubmit={(e) => e.preventDefault()}
>
  <div class="flex-1 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:gap-4">
    {@render filters()}
  </div>
  {#if actions}
    <div class="flex items-center gap-3 md:self-end">
      {@render actions()}
    </div>
  {/if}
</form>
