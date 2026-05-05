<script lang="ts">
  let { label }: { label: string | null } = $props();
</script>

<span
  class="text-sm text-(--color-text-subtle)"
  title={label ? 'PT — Pacific time, the timezone our scraper records under' : undefined}
>
  {label ? `Last scraped at ${label}` : 'No scrape data yet'}
</span>
