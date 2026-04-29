<script lang="ts">
  // src/routes/alerts/+page.svelte — /alerts signup landing page.
  // Phase 4 ALT-01/03/04: renders SignupForm with verbatim UI-SPEC copy.
  //
  // The /about#email anchor (referenced in the expander) lands in Plan 06
  // — emitting the link now avoids a follow-up edit.
  import type { PageData, ActionData } from './$types';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SignupForm from '$lib/components/SignupForm.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>Get fishing alerts — FishCount</title>
</svelte:head>

<main class="mx-auto max-w-prose px-4 py-8">
  <PageHeader
    title="Get fishing alerts"
    subtitle="We'll email you when boats you follow have hot days, or species you follow start to run."
  />

  <SignupForm
    boats={data.boats}
    species={data.species}
    preselectedBoats={data.preselectedBoats}
    preselectedSpecies={data.preselectedSpecies}
    showWarmupBanner={data.showWarmupBanner}
    {form}
  />

  <details class="mt-8">
    <summary class="text-sm text-(--color-text-muted) cursor-pointer">
      What does this send me?
    </summary>
    <div class="mt-4 text-sm text-(--color-text-muted) space-y-3">
      <p>
        Two kinds of alerts. "Hot day" fires when a boat you follow has today's
        avg fish/angler more than 2× its trailing 30-day same-trip-type average
        (with at least 8 anglers reporting). "Starting to run" fires when a
        species you follow has a rolling 7-day fleet-wide avg more than 1.5×
        the same-week-last-year baseline.
      </p>
      <p>
        One alert per boat per day max; one alert per species per week max. We
        don't send "we miss you" emails. Unsubscribing is one click and
        permanent.
      </p>
      <p>
        Read our
        <a href="/about#email" class="text-(--color-accent) underline">About email alerts</a>
        page for the full disclosure.
      </p>
    </div>
  </details>
</main>
