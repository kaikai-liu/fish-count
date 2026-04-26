# Forecast Benchmark — Phase 3 Validation (FCT-04)

**Status:** placeholder — populated by `scripts/forecast-benchmark.ts` at execution time.

Run `pnpm tsx scripts/forecast-benchmark.ts` (or `npx tsx scripts/forecast-benchmark.ts`)
against the production DB (or a seeded dev DB) to populate this file with MAE,
median absolute error, and PI coverage for the seasonal-naïve baseline vs the
fleet-mean baseline.

The script writes its output to this exact path so the `/about#forecasts` page can
link to a stable location.
