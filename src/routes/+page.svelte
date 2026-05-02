<!-- src/routes/+page.svelte — Home page (Phase 8 HOME-01..05).
     Replaces the v1 today's-counts dashboard. Per D-14 the URL has no state.
     The page is a list of per-canonical-trip-type sections with per-section
     bar normalization (D-10) and n=1 cells (D-11). -->
<script lang="ts">
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import HomeSectionCard from '$lib/components/HomeSectionCard.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import {
    HOME_PAGE_TITLE,
    HOME_PAGE_HEADING,
    HOME_PAGE_SUBTITLE,
    EMPTY_HOME_HEADING,
    EMPTY_HOME_BODY,
    EMPTY_HOME_CTA
  } from '$lib/copy/home';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{HOME_PAGE_TITLE}</title>
</svelte:head>

<PageHeader
  title={HOME_PAGE_HEADING}
  subtitle={HOME_PAGE_SUBTITLE(data.fromDate, data.toDate)}
  lastScrapedLabel={data.lastScrapedLabel}
/>

{#if data.sections.length === 0}
  <EmptyState
    heading={EMPTY_HOME_HEADING}
    body={EMPTY_HOME_BODY}
    cta={EMPTY_HOME_CTA}
  />
{:else}
  {#each data.sections as section (section.canonical_trip_type)}
    <HomeSectionCard {section} />
  {/each}
{/if}
