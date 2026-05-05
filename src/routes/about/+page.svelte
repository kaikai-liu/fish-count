<script lang="ts">
  // No props — static page.
  // Phase 8 Plan 03 (D-23, RTR-07): rewritten for v2. Forecast / picker / heatmap
  // sections retired (the surfaces themselves are gone). Source-attribution,
  // scrape-cadence, per-angler-caveat sections carry forward unchanged.
</script>

<svelte:head>
  <title>About FishCount</title>
</svelte:head>

<article class="mx-auto max-w-prose">
  <h1 class="mb-6 text-3xl font-semibold md:text-4xl">About FishCount</h1>

  <p class="mb-4">
    FishCount is a public view onto San Diego charter-boat dock totals — built for
    anglers who want to see the patterns the source dashboard doesn't surface.
  </p>

  <h2 class="mb-2 mt-6 text-xl font-semibold">What you can do here</h2>
  <p class="mb-4">
    The <a href="/explorer" class="text-(--color-accent) underline">explorer</a> is
    the main view: pick a boat, species, or landing as the ticker and see catch
    history over your chosen range, with overlays for trip types or boats. The
    <a href="/" class="text-(--color-accent) underline">home page</a> shows what's
    been biting in the past 7 days — top boats per trip type, ranked by
    fish/angler. <a href="/compare" class="text-(--color-accent) underline">Compare</a>
    lines up two or three boats on the same trip type side-by-side.
  </p>
  <p class="mb-4">
    Boats and species sometimes get renamed at the source. We map those renames so
    a boat's history stays continuous when its label changes — the
    <a href="/admin/trip-types" class="text-(--color-accent) underline">trip-type alias</a>
    page (operator-only) is where that mapping lives. Anglers see the canonical
    name everywhere; the rename is invisible.
  </p>

  <h2 class="mb-2 mt-6 text-xl font-semibold">Where the data comes from</h2>
  <p class="mb-4">
    FishCount aggregates publicly posted dock totals from sandiegofishreports.com.
    We scrape that source nightly at 23:00 PT, store the counts in our own
    database, and re-render them in the views above.
  </p>
  <p class="mb-4">
    We never modify the source numbers. Every row links back to the source page so
    you can verify it.
  </p>

  <h2 class="mb-2 mt-6 text-xl font-semibold">What "fish/angler" means</h2>
  <p class="mb-4">
    The dock-total report tells you a boat caught X fish for Y anglers on a trip.
    Our "fish/angler" metric is X ÷ Y — the boat's per-angler yield on that trip,
    averaged across multiple matching trips when we rank or summarize.
  </p>
  <p class="mb-4">
    This is a derived boat-aggregate average, not an individual attribution. The
    boat that caught 50 yellowtail with 25 anglers gets credited 2.0 fish/angler.
    We don't know which anglers caught what, and we don't claim to. Some anglers
    caught more, some caught fewer, some caught zero.
  </p>
  <p class="mb-4">
    Use this number to compare boats on similar trips, not to predict your own
    catch.
  </p>

  <h2 class="mb-2 mt-6 text-xl font-semibold">Why trip type matters</h2>
  <p class="mb-4">
    A 1/2 Day AM trip and a Long Range trip catch fundamentally different fish in
    fundamentally different volumes. We never compare per-angler numbers across
    different trip types. The trip-type label always rides along with the number.
  </p>

  <h2 class="mb-2 mt-6 text-xl font-semibold">Sample size and "low data"</h2>
  <p class="mb-4">
    Every per-angler number we show comes with n=X — the count of trips that fed
    the average. When n is below 5, we flag the row as "low data" and trust you to
    read it skeptically. We don't hide it; we flag it.
  </p>

  <h2 class="mb-2 mt-6 text-xl font-semibold">Data gaps</h2>
  <p class="mb-4">
    If our scraper missed a day, we render that day as a gap, not a zero. A boat
    with zero anglers reported is missing data, not a zero-fish trip.
  </p>

  <h2 class="mb-2 mt-6 text-xl font-semibold">How fresh is the data</h2>
  <p class="mb-4">
    The "Last scraped at" indicator at the top of every data page tells you when
    the most recent scrape finished. Today's data is labeled "provisional" until
    the day rolls over — boats are still reporting.
  </p>

</article>
