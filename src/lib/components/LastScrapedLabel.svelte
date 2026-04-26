<script lang="ts">
  let { label }: { label: string | null } = $props();
</script>

<span class="text-sm text-(--color-text-subtle)">
  {label ? `Last scraped at ${label}` : 'No scrape data yet'}
</span>
