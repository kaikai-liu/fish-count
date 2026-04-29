<script lang="ts">
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/PageHeader.svelte';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>You're unsubscribed — FishCount</title></svelte:head>

<main class="mx-auto max-w-2xl px-4 py-8">
  {#if data.invalid}
    <PageHeader title="This unsubscribe link is no longer valid" />
    <article class="space-y-4 text-base leading-normal">
      <p>If you got this page after clicking an unsubscribe link, the link signature couldn't be verified.</p>
      <p>
        <a href="mailto:contact@fishcount.example" class="text-(--color-accent) underline"
          >Contact us</a
        > and we'll handle it manually.
      </p>
    </article>
  {:else if data.writeFailed}
    <PageHeader title="We hit a problem" />
    <article class="space-y-4 text-base leading-normal">
      <p>We tried to unsubscribe you but the suppression-list write failed.</p>
      <p>
        <a href="mailto:contact@fishcount.example" class="text-(--color-accent) underline"
          >Contact us</a
        > and we'll handle it manually.
      </p>
    </article>
  {:else}
    <PageHeader title="You're unsubscribed" />
    <article class="space-y-4 text-base leading-normal">
      {#if data.maskedEmail}
        <p>We've removed <strong>{data.maskedEmail}</strong> from all FishCount alerts.</p>
      {:else}
        <p>We've removed your address from all FishCount alerts.</p>
      {/if}
      <p>You won't receive any more emails from us. If you change your mind in the future, you'll need to sign up with a different email address — once an address unsubscribes, we don't reuse it.</p>
      <p><a href="/" class="text-(--color-accent) underline">Back to FishCount</a></p>
    </article>
  {/if}
</main>
