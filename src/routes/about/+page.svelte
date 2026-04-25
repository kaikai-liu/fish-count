<script lang="ts">
  // No props — static page.
  // NOTE: This file is allowlisted by Plan 02-07's per-angler-discipline lint
  // because the verbatim UI-SPEC copy legitimately contains "fish/angler" / "per angler"
  // multiple times. This is the only route file permitted to inline those literals
  // (alongside src/lib/copy/metrics.ts and src/lib/components/PerAnglerMetric.svelte).
</script>

<svelte:head>
  <title>About the data — FishCount</title>
</svelte:head>

<article class="mx-auto max-w-prose">
  <h1 class="mb-6 text-3xl font-semibold md:text-4xl">About the data</h1>

  <h2 class="mb-2 mt-6 text-xl font-semibold">Where the data comes from</h2>
  <p class="mb-4">
    FishCount aggregates publicly posted dock totals from sandiegofishreports.com. We
    scrape that source nightly at 23:00 PT, store the counts in our own database, and
    re-render them in views the source site doesn't offer (trip pickers, calendars,
    trends, comparisons).
  </p>
  <p class="mb-4">
    We never modify the source numbers. Every row links back to the source page so you
    can verify it.
  </p>

  <h2 class="mb-2 mt-6 text-xl font-semibold">What "fish/angler" means</h2>
  <p class="mb-4">
    The dock-total report tells you a boat caught X fish for Y anglers on a trip. Our
    "fish/angler" metric is X ÷ Y — the boat's per-angler yield on that trip, averaged
    across multiple matching trips when we rank or summarize.
  </p>
  <p class="mb-4">
    This is a derived boat-aggregate average, not an individual attribution. The boat
    that caught 50 yellowtail with 25 anglers gets credited 2.0 fish/angler. We don't
    know which anglers caught what, and we don't claim to. Some anglers caught more,
    some caught fewer, some caught zero.
  </p>
  <p class="mb-4">
    Use this number to compare boats on similar trips, not to predict your own catch.
  </p>

  <h2 class="mb-2 mt-6 text-xl font-semibold">Why trip type matters</h2>
  <p class="mb-4">
    A 1/2 Day AM trip and a Long Range trip catch fundamentally different fish in
    fundamentally different volumes. We never compare per-angler numbers across
    different trip types. The trip-type filter is required for a reason.
  </p>

  <h2 class="mb-2 mt-6 text-xl font-semibold">Sample size and "low data"</h2>
  <p class="mb-4">
    Every per-angler number we show comes with n=X — the count of trips that fed the
    average. When n is below 5, we flag the row as "low data" and trust you to read
    it skeptically. We don't hide it; we flag it.
  </p>
  <p class="mb-4">
    In Phase 3 we add forecast projections, and we will refuse to render a point
    estimate when n&lt;5 — only the historical record will show.
  </p>

  <h2 class="mb-2 mt-6 text-xl font-semibold">Data gaps</h2>
  <p class="mb-4">
    If our scraper missed a day, we render that day as a gap, not a zero. A boat with
    zero anglers reported is missing data, not a zero-fish trip.
  </p>

  <h2 class="mb-2 mt-6 text-xl font-semibold">How fresh is the data</h2>
  <p class="mb-4">
    The "Last scraped at" indicator at the top of every data page tells you when the
    most recent scrape finished. Today's data is labeled "provisional" until the day
    rolls over — boats are still reporting.
  </p>

  <h2 class="mb-2 mt-6 text-xl font-semibold">Contact</h2>
  <p class="mb-4">
    Reach out: [contact pointer — populated in Phase 5].
  </p>
</article>
