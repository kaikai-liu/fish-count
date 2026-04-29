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
    For forecast projections (future-dated cells in the picker heatmap), we apply
    a stricter rule: if fewer than 5 historical trips match the target slot, we
    refuse to show a number entirely — the cell renders gray with "not enough
    history" instead of any point estimate. See the Forecasts section below for
    the full method.
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

  <h2 id="forecasts" class="mb-2 mt-6 text-xl font-semibold">Forecasts</h2>
  <p class="mb-4">
    When you select a future date in the trip picker, the calendar heatmap shows a
    statistical projection rather than historical actuals. Here is exactly what
    those numbers mean and how we compute them.
  </p>

  <h3 class="mb-2 mt-4 text-lg font-semibold">The model</h3>
  <p class="mb-4">
    We use a seasonal-naïve baseline. For any target date, we look up every trip of
    the same species and trip type that occurred within ±7 calendar days of the
    same calendar slot in previous years, then compute the fleet-wide weighted
    average (SUM fish ÷ SUM anglers) and the empirical 10th and 90th percentiles
    of per-trip per-angler ratios. This is not a machine-learning model. It is a
    summary of historical patterns for the same time of year, and we label it as
    such.
  </p>

  <h3 class="mb-2 mt-4 text-lg font-semibold">Prediction intervals</h3>
  <p class="mb-4">
    The [low–high] range shown on a forecast cell is an 80% prediction interval —
    the range that contained 80% of historical trip outcomes inside the same
    seasonal window. Wider bands mean the fishing was more variable historically
    (or the sample size is small). The prediction interval is about per-trip
    outcomes, not about the precision of the average.
  </p>

  <h3 class="mb-2 mt-4 text-lg font-semibold">Sample size and "not enough history"</h3>
  <p class="mb-4">
    When fewer than 5 historical trips match the target slot, we refuse to show a
    point estimate and display "not enough history" instead. Off-season slots
    (e.g., closed-rockfish months, peak-bluefin months before bluefin appeared in
    the dataset) will consistently render gray. This is the intended behavior, not
    a bug.
  </p>

  <h3 class="mb-2 mt-4 text-lg font-semibold">Horizon cap</h3>
  <p class="mb-4">
    Forecasts are only available within 30 days of today. Beyond that, the heatmap
    area renders "horizon too far — historical data only." The rankings table
    below the heatmap always shows historical actuals regardless of target date —
    the horizon cap only affects the future-projection display.
  </p>

  <h3 class="mb-2 mt-4 text-lg font-semibold">Data gaps in the forecast window</h3>
  <p class="mb-4">
    When our scraper missed days that would have contributed to the forecast
    window, the cell shows "based on N of M days" alongside the projection. A
    forecast based on 42 of 56 expected days is less reliable than one based on
    56 of 56 — the annotation makes that visible rather than hidden.
  </p>

  <h3 class="mb-2 mt-4 text-lg font-semibold">Benchmark validation</h3>
  <p class="mb-4">
    We benchmark this seasonal-naïve baseline against a simpler fleet-mean model on
    held-out historical data — the methodology, MAE, median absolute error, and
    80% prediction interval coverage are documented in our forecast benchmark
    report (Phase 3 validation, kept at
    <code>.planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md</code>
    in the project repository). The shipped baseline is the one labeled here; we
    do not claim ML-grade accuracy and do not present fake-precision numbers (no
    decimals on forecast values, no "73.4% chance" framing).
  </p>

  <!-- Phase 4 ALT-01 — Email alerts section. UI-SPEC §"/about#email" verbatim copy.
       Anchored at #email so emails (Plan 03 compliance footer) and inline CTAs deep-link here. -->
  <h2 id="email" class="mb-2 mt-6 text-xl font-semibold">Email alerts</h2>

  <p class="mb-4">We send two kinds of alerts: "hot day" and "starting to run."</p>

  <p class="mb-4">
    A "hot day" fires when a boat you follow has today's avg fish/angler more than 2× its trailing 30-day same-trip-type average, with at least 8 anglers reporting (so a 1-angler fluke doesn't trigger). One alert per boat per day, max.
  </p>

  <p class="mb-4">
    A "starting to run" fires when a species you follow has a rolling 7-day fleet-wide avg/angler more than 1.5× the same-week-last-year baseline on the same trip type. One alert per species per week, max.
  </p>

  <p class="mb-4">
    We send the alerts as honestly as we frame the data: same n=X disclosure, same
    trip-type discipline, same per-angler caveat. We don't predict your catch — we tell
    you that historically, conditions matched a pattern.
  </p>

  <p class="mb-4">
    We use Resend for delivery and Litestream-backed SQLite for the suppression list. We
    don't share your email. We don't run analytics on opens or clicks. Unsubscribing is
    one click and permanent.
  </p>

  <h3 id="warmup" class="mb-2 mt-4 text-lg font-semibold">Warm-up and rate limits</h3>
  <p class="mb-4">
    During the first two weeks of production sending, we cap volume at 50 alerts/day (week 1) and 200/day (week 2). If volume exceeds the cap, alerts queue and send the next morning — we never silently drop alerts. Public signups are rate-limited to 3 per hour per IP, and the form rejects disposable-email domains. After the first 14 days, the volume cap lifts; the abuse protections stay on.
  </p>
  <p class="mb-4 text-sm text-(--color-text-muted)">
    <a href="/alerts" class="text-(--color-accent) underline">Sign up for alerts →</a>
  </p>

  <h2 class="mb-2 mt-6 text-xl font-semibold">Contact</h2>
  <p class="mb-4">
    Reach out: [contact pointer — populated in Phase 5].
  </p>
</article>
