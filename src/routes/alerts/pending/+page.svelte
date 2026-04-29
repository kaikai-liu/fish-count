<script lang="ts">
  // src/routes/alerts/pending/+page.svelte — Generic-success page (UI-SPEC §<GenericSuccess>).
  //
  // Verbatim UI-SPEC copy: "Check your email" + the four-paragraph body.
  // This page renders the SAME response shape regardless of which silent-success
  // branch the upstream action chose (honeypot / suppression / already-pending
  // / happy path) — anti-enumeration discipline (T-04-A1).
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/PageHeader.svelte';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Check your email — FishCount</title>
</svelte:head>

<main class="mx-auto max-w-2xl px-4 py-8">
  <PageHeader title="Check your email" />
  <article class="space-y-4 text-base leading-normal">
    {#if data.maskedEmail}
      <p>We sent a verification link to <strong>{data.maskedEmail}</strong>.</p>
    {:else}
      <p>We sent a verification link to your email address.</p>
    {/if}
    <p>
      Click the link in that email within 24 hours to activate your alerts. If
      you don't see it, check your spam folder.
    </p>
    <p>You're not subscribed to anything yet. Activation only happens after you click the link.</p>
    <p class="pt-4 text-sm text-(--color-text-muted)">
      Wrong email?
      <a href="/alerts" class="text-(--color-accent) underline">Sign up again</a>.
    </p>
  </article>
</main>
