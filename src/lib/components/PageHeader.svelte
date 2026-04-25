<script lang="ts">
  import ProvisionalBadge from './ProvisionalBadge.svelte';
  import LastScrapedLabel from './LastScrapedLabel.svelte';

  let {
    title,
    subtitle,
    showProvisional = false,
    lastScrapedLabel = null
  }: {
    title: string;
    subtitle?: string;
    showProvisional?: boolean;
    lastScrapedLabel?: string | null;
  } = $props();
</script>

<header class="border-b border-[--color-border] pb-4 mb-6 md:mb-8">
  <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
    <div class="flex-1">
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-3xl md:text-4xl font-semibold leading-tight">{title}</h1>
        {#if showProvisional}
          <ProvisionalBadge />
        {/if}
      </div>
      {#if subtitle}
        <p class="mt-1 text-base text-[--color-text-muted]">{subtitle}</p>
      {/if}
    </div>
    <div class="md:text-right">
      <LastScrapedLabel label={lastScrapedLabel} />
    </div>
  </div>
</header>
