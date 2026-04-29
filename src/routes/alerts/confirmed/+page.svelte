<script lang="ts">
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/PageHeader.svelte';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>You're confirmed — FishCount</title></svelte:head>

<main class="mx-auto max-w-2xl px-4 py-8">
  <div class="mb-4 text-center text-3xl text-(--color-accent)" aria-hidden="true">✓</div>
  <PageHeader title="You're confirmed" />

  {#if data.summary}
    <article class="space-y-4 text-base leading-normal">
      <p>You're now subscribed to:</p>
      {#if data.summary.boats.length > 0}
        <ul class="list-disc pl-6">
          {#each data.summary.boats as b (b.id)}
            <li><a href="/boats/{b.id}" class="text-(--color-accent) underline">{b.display_name}</a></li>
          {/each}
        </ul>
      {/if}
      {#if data.summary.species.length > 0}
        <ul class="list-disc pl-6">
          {#each data.summary.species as s (s)}
            <li>{s}</li>
          {/each}
        </ul>
      {/if}

      <p class="pt-4">We'll email you when:</p>
      <ul class="list-disc pl-6 text-base">
        <li>A boat you follow has a "hot day" (today's avg/angler &gt; 2&times; its trailing 30-day same-trip-type average, with &ge; 8 anglers).</li>
        <li>A species you follow has a "starting to run" signal (rolling 7-day fleet-wide avg &gt; 1.5&times; same-week-last-year baseline).</li>
      </ul>

      <p class="pt-4">
        {#if data.manageUrl}
          <a
            href={data.manageUrl}
            class="inline-block min-h-11 rounded bg-(--color-accent) px-4 py-2 font-semibold text-white hover:bg-(--color-accent-hover)"
            >Manage your alerts</a
          >
        {/if}
        <a href="/" class="ml-4 text-(--color-text-muted) underline">Back to home</a>
      </p>
    </article>
  {:else}
    <article class="space-y-4 text-base leading-normal">
      {#if data.already}
        <p>Your subscription is already active.</p>
      {:else}
        <p>Your subscription is active.</p>
      {/if}
      <p>Use the link in your most recent FishCount email to manage your alerts or unsubscribe.</p>
      <p><a href="/" class="text-(--color-text-muted) underline">Back to home</a></p>
    </article>
  {/if}
</main>
