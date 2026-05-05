<!-- src/routes/admin/trip-types/login/+page.svelte — Phase 8 D-04 admin login form.
     Single password input, mobile-first (≥44px tap target, no horizontal overflow at 375px).
     Generic error message per Security V7 — does NOT distinguish "no user" vs "wrong password". -->
<script lang="ts">
  import {
    LOGIN_TITLE,
    LOGIN_HEADING,
    LOGIN_SUBTITLE,
    LOGIN_PASSWORD_LABEL,
    LOGIN_SUBMIT
  } from '$lib/copy/admin';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
  <title>{LOGIN_TITLE}</title>
</svelte:head>

<header class="border-b border-(--color-border) pb-4 mb-6">
  <h1 class="text-3xl font-semibold leading-tight">{LOGIN_HEADING}</h1>
  <p class="mt-1 text-base text-(--color-text-muted)">{LOGIN_SUBTITLE}</p>
</header>

<form method="POST" class="max-w-sm flex flex-col gap-3">
  <label class="flex flex-col gap-1">
    <span class="text-sm font-semibold">{LOGIN_PASSWORD_LABEL}</span>
    <input
      type="password"
      name="password"
      autocomplete="current-password"
      required
      class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-3 py-2"
    />
  </label>

  {#if form?.error}
    <p
      role="alert"
      class="rounded border border-(--color-provisional) bg-(--color-provisional-bg) px-3 py-2 text-sm text-(--color-provisional)">
      {form.error}
    </p>
  {/if}

  <button
    type="submit"
    class="min-h-11 rounded bg-(--color-accent) px-4 py-2 font-semibold text-white hover:bg-(--color-accent-hover)">
    {LOGIN_SUBMIT}
  </button>
</form>
