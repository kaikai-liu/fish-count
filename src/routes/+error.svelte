<script lang="ts">
  // src/routes/+error.svelte — Phase 8 Plan 04 (POL-01 / D-31).
  //
  // Page-level error boundary. SvelteKit renders this for any 4xx / 5xx
  // response (loader throw, 404, etc.). Strategy:
  //   - 404 → "Page not found" copy (notFound variant)
  //   - everything else → generic copy
  // We render only static copy + a "back to home" link; no raw error
  // message or stack trace leaks (T-08-04-04). Theme-aware via the
  // --color-* tokens so it flips with the site theme.
  import { page } from '$app/state';
  import { ERROR_HEADINGS, ERROR_BODIES } from '$lib/copy/error-page';
</script>

<svelte:head>
  <title>{page.status === 404 ? 'Page not found' : 'Something broke'} — FishCount</title>
</svelte:head>

<section class="mx-auto max-w-prose py-16 text-center">
  <h1 class="text-2xl font-semibold text-(--color-text)">
    {page.status === 404 ? ERROR_HEADINGS.notFound : ERROR_HEADINGS.generic}
  </h1>
  <p class="mt-3 text-base text-(--color-text-muted)">
    {page.status === 404 ? ERROR_BODIES.notFound : ERROR_BODIES.generic}
  </p>
  <a href="/" class="mt-6 inline-block text-(--color-accent) underline">Back to home</a>
</section>
