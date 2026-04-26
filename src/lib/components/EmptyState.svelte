<script lang="ts">
  let {
    heading,
    body,
    cta
  }: {
    heading: string;
    body?: string;
    cta?: { label: string; href: string };
  } = $props();
</script>

<div class="flex flex-col items-center text-center py-12 md:py-16">
  <h2 class="text-xl font-semibold">{heading}</h2>
  {#if body}
    <p class="mt-2 max-w-prose text-base text-(--color-text-muted)">{body}</p>
  {/if}
  {#if cta}
    <a href={cta.href} class="mt-4 text-(--color-accent) underline">{cta.label}</a>
  {/if}
</div>
