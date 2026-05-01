---
phase: 06-explorer-foundation
verified: 2026-04-30T10:35:00Z
resolved: 2026-05-01T10:38:00Z
status: passed
score: 28/28 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Each chart series legend label = '{name} · n=NN'; tooltip has axis crosshair + per-bucket n; caption shows 'Based on N trips across the [range]. [Granularity] buckets, PT.'"
    status: resolved
    resolved_in: "fix(06-05): populate nByBucketBySeries with per-bucket trip counts"
    reason: "Originally per-bucket n in the tooltip always showed 0 because nByBucketBySeries was an empty map. Resolved: each per-ticker series builder now captures n_trips per bucket via the buildNByBucket helper, and the legend-keyed map is populated from those captures. New integration assertion locks in non-zero per-bucket counts."
    artifacts:
      - path: "src/routes/explorer/+page.server.ts"
        issue: "nByBucketBySeries is initialized as {} for every series and never populated with per-bucket n_trips data. The series-building loop creates nByBucketBySeries[legendName] = {} but does not write individual bucket keys into it."
    missing:
      - "During per-ticker series construction (boat: boatExplorerSeries buckets; species: speciesAcrossBoats result.series; landing: landingAcrossSpecies result.series), build nByBucketBySeries[legendName][bucket_key] = bucket.n_trips for each raw bucket so the tooltip formatter can read actual per-bucket trip counts instead of 0."
human_verification:
  - test: "Open /explorer in a browser at 375px viewport width (DevTools device emulation or physical device)"
    expected: "Sticky top bar shows 3 rows — (1) Boat/Species/Landing pills full-width, (2) select dropdown full-width, (3) horizontal-scrolling range strip. Chart renders at 280px height. All pill and range buttons are at least 44px touch targets. Tapping a different ticker pill re-renders the chart. Tapping a range button re-renders the chart. Custom date inputs appear below the range strip when 'Custom' is tapped."
    why_human: "matchMedia and sticky layout cannot be verified by grep or unit tests. Mobile tap-target sizes and scroll behavior require visual inspection."
  - test: "On the species or landing ticker with >6 series, verify the ECharts legend '+N more' behavior"
    expected: "Only the top 6 series are visible on initial load. Series 7+ appear in the ECharts scroll legend as toggled-off entries. Clicking a legend entry reveals/hides its series. The series value labels in the legend use verbatim domain names (trip types, species, boat display names)."
    why_human: "ECharts runtime legend behavior cannot be verified without a browser. The legendSelected map is correctly set (series 7+ = false), but the rendering of the scroll legend and click-to-toggle behavior requires visual confirmation."
  - test: "iOS Safari / Android Chrome: tap to pin tooltip; verify per-series n= in tooltip"
    expected: "Tapping a data point pins the ECharts crosshair tooltip showing the bucket date, per-series fish/angler value, and (n=NN) per series. Note: per-bucket n is currently 0 (known stub) — this test item validates the tooltip renders correctly and n= is visible even if the count reads 0."
    why_human: "Mobile browser touch event behavior requires physical device or emulator."
  - test: "Bundle inspection: ECharts must appear in a split chunk, not the SSR route chunk"
    expected: "Running 'npm run build' and inspecting .svelte-kit/output/client/_app/immutable/chunks/ — ECharts appears in a separate chunk (Chart-*.js or similar) and not in the explorer route's server chunk."
    why_human: "Bundle analysis requires a build run and manual inspection of chunk filenames."
---

# Phase 6: Explorer Foundation — Verification Report

**Phase Goal:** Stand up a working `/explorer` route that lets a San Diego angler pick a boat / species / landing as a "ticker" and see catch history over a chosen range (1M / 3M / 6M / 1Y / 2Y / 5Y / All / Custom), with the species breakdown table beneath the chart. The slug + URL contract + DAL aggregations + UI components must all wire together end-to-end.
**Verified:** 2026-04-30T10:35:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria + Plan frontmatter must-haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Angler opens site and immediately sees a chart of one boat's catch history, with each trip type as a separate overlay series, without picking anything first | ✓ VERIFIED | `mostActiveBoatLast30Days()` resolves default boat on empty URL; `boatExplorerSeries()` returns per-trip-type buckets; series wired in chartOption. Integration test 1 confirms. |
| SC-2 | Angler can switch ticker between boat, species, landing, and pick any item using verbatim SD names | ✓ VERIFIED | `TickerPills.svelte` 3-button toggle; `distinctSpecies()` / `distinctLandings()` / `listBoatsByActivity()` populate selector; verbatim names confirmed (no normalization). |
| SC-3 | Angler can change range using preset buttons or custom start/end date; chart updates without stall even at All | ✓ VERIFIED | `RangeStrip.svelte` 8 buttons; `CustomDateInputs.svelte` blur-submit; `rangeToDates('all')` bounded at 365×15 days; soft-perf test shows 0.8ms for All-range. Cache-control wired. |
| SC-4 | Per-angler numbers always appear next to sample size n; every series shows trip-type label in legend | ✓ VERIFIED (legend n) / ✗ PARTIAL (tooltip per-bucket n) | Legend label `name · n=NN` correct. Caption format correct. Tooltip n= always shows 0 (nByBucketBySeries stub). D-16 requires per-bucket n in tooltip. |
| SC-5 | Explorer is usable on a phone at 375px width | ? NEEDS HUMAN | matchMedia $effect sets 280px chart height; ExplorerHeader 3-row sticky layout; min-h-11 (44px) on all buttons. Visual confirmation required. |
| PLAN-01 | boats table has a non-null slug column for every existing row after migration runs | ✓ VERIFIED | `hasSlugColumn()` guard + `backfillSlugs()` in transaction; migrations.test.ts 7 new assertions pass. |
| PLAN-02 | Slug is deterministic from display_name (lowercase, hyphenated, ASCII) | ✓ VERIFIED | `slugify()` NFKD normalization + 60-char cap; 14 slug.test.ts cases pass. |
| PLAN-03 | Collisions resolve as base, base-2, base-3 (deterministic) | ✓ VERIFIED | `uniqueSlug(base, taken)` deterministic; boats.test.ts intra-batch collision case passes. |
| PLAN-04 | Slug is frozen at first-seen — display_name changes never alter slug | ✓ VERIFIED | `ON CONFLICT DO UPDATE` omits slug column; `upsertByName` accepts slug only on INSERT; boats.test.ts freeze case. |
| PLAN-05 | Two new covering indexes exist: idx_catch_species_date, idx_catch_landing_date | ✓ VERIFIED | Both `CREATE INDEX IF NOT EXISTS` statements in migrations.ts; migrations.test.ts asserts index existence. |
| PLAN-06 | ExplorerFilters URLs round-trip through parse → serialize → parse | ✓ VERIFIED | urlState.test.ts round-trip tests for boat/species/landing/custom — all pass. |
| PLAN-07 | Custom range with fromDate > toDate is rejected by Zod | ✓ VERIFIED | `superRefine` in ExplorerFiltersSchema; test case passes. |
| PLAN-08 | Boat slug parameter passes only `[a-z0-9-]` (regex-bounded) | ✓ VERIFIED | `z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80)`; test cases for uppercase, spaces, and 81-char slug all reject. |
| PLAN-09 | Range mapper returns correct fromDate/toDate/granularity for every preset | ✓ VERIFIED | range.test.ts covers all 8 presets with fake timers; 23 tests pass. |
| PLAN-10 | All-range fromDate is bounded (today() - 365×15) — never unbounded | ✓ VERIFIED | `PRESET_DAYS.all = 365 * 15` in range.ts; T-02-31 sentinel confirmed. |
| PLAN-11 | includesToday predicate is true iff toDate >= today() | ✓ VERIFIED | range.ts `includesToday: custom.toDate >= today()`; cache-control integration test confirms max-age=300 when historical. |
| PLAN-12 | Boat ticker query returns one bucket-keyed series per trip type in window | ✓ VERIFIED | `boatExplorerSeries()` GROUP BY (bucket_key, trip_type); explorer.test.ts confirms. |
| PLAN-13 | Species ticker query returns top-6 boats by window totals (Pitfall 9 safe) | ✓ VERIFIED | Two-pass: Pass 1 ORDER BY SUM(species_count) DESC LIMIT @topN; Pass 2 IN (?, ...) with those IDs; explorer.test.ts 8-boat scenario confirms top-6. |
| PLAN-14 | Landing ticker query returns top-6 species by window totals | ✓ VERIFIED | Same two-pass pattern; explorer.test.ts 8-species scenario confirms. |
| PLAN-15 | speciesBreakdownForBoat returns species totals for the breakdown table | ✓ VERIFIED | Function exported; integration test confirms breakdownRows populated on empty URL. |
| PLAN-16 | countCatchRowsForBoatInRange returns 0/1+ for auto-widen check | ✓ VERIFIED | LIMIT 1 sentinel; auto-widen unit test and integration test 2b confirm. |
| PLAN-17 | trends.ts granularity union extends to 'daily' | 'weekly' | 'monthly' without breaking existing callers | ✓ VERIFIED | Both BoatTrendArgs + SpeciesTrendArgs updated; 3-way bucketExpr conditional; trends.test.ts 14 tests pass. |
| PLAN-18 | Landings DAL has getByName + mostRecentlyActiveLanding | ✓ VERIFIED | Both exported from landings.ts; landings.test.ts 6 tests pass. |
| PLAN-19 | /explorer with no params resolves default boat server-side (clean URL) | ✓ VERIFIED | `url.searchParams.size === 0` branch; `mostActiveBoatLast30Days()` call; integration test 1. |
| PLAN-20 | Auto-widen 1Y → All when default boat has zero rows; banner reads 'No 1Y data — showing full history.' | ✓ VERIFIED | `countCatchRowsForBoatInRange()` check; exact banner string on line 329; unit test 2 + 2b. |
| PLAN-21 | Each chart series legend label = '{name} · n=NN'; **tooltip has axis crosshair + per-bucket n**; caption format correct | ✗ PARTIAL | Legend n= correct. Caption correct. Axis crosshair correct (axisPointer.type='cross'). Per-bucket n in tooltip is always 0 — nByBucketBySeries is never populated. See gap below. |
| PLAN-22 | Cache-Control: max-age=60 if toDate >= today() else max-age=300 | ✓ VERIFIED | `setHeaders` branch on `includesToday`; both unit and integration tests confirm. |
| PLAN-23 | Nav has 'Explorer' as 2nd item after 'Home' | ✓ VERIFIED | `+layout.svelte` line 8: `{ href: '/explorer', label: 'Explorer' }` at index 1 after Home. |

**Score:** 27/28 truths verified (1 partial = gap)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/shared/slug.ts` | slugify + uniqueSlug pure helpers | ✓ VERIFIED | 2 exports, no DB imports, 14 test cases |
| `src/lib/db/migrations.ts` | boats.slug migration + 3 indexes | ✓ VERIFIED | hasSlugColumn guard, backfillSlugs transaction, partial UNIQUE index |
| `src/lib/db/boats.ts` | BoatRow.slug + findBySlug + listBoatsByActivity + mostActiveBoatLast30Days | ✓ VERIFIED | All 3 new exports; slug in INSERT only (D-13) |
| `src/lib/shared/range.ts` | rangeToDates + chooseGranularity + RANGE_PRESETS | ✓ VERIFIED | All 3 exports; 365×15 sentinel; civil-epoch span math |
| `src/lib/shared/urlState.ts` | ExplorerFiltersSchema + parseExplorerFilters + serializeExplorerFilters | ✓ VERIFIED | Discriminated union; superRefine for custom range; round-trip tested |
| `src/lib/db/queries/explorer.ts` | 7+ DAL aggregations + earliestScrapeDate | ✓ VERIFIED | 8 exports (boatExplorerSeries, speciesAcrossBoats, landingAcrossSpecies, speciesBreakdownForBoat, countCatchRowsForBoatInRange, earliestScrapeDate, mostCaughtSpeciesForBoatInRange, topBoatForSpeciesInRange) |
| `src/lib/db/queries/trends.ts` | granularity extended to 'daily' | ✓ VERIFIED | Both Args interfaces updated; 3-way bucketExpr |
| `src/lib/db/landings.ts` | getByName + mostRecentlyActiveLanding | ✓ VERIFIED | Both exported; 6 test cases |
| `src/lib/components/TickerPills.svelte` | 3-button Boat/Species/Landing toggle | ✓ VERIFIED | aria-pressed; min-h-11; --color-accent fill on active |
| `src/lib/components/RangeStrip.svelte` | 8-button horizontal-scroll range strip | ✓ VERIFIED | All 8 items; overflow-x-auto; min-h-11 |
| `src/lib/components/CustomDateInputs.svelte` | Paired date inputs + blur-submit | ✓ VERIFIED | onblur on 'To' field; both inputs min-h-11 |
| `src/lib/components/SpeciesBreakdownTable.svelte` | 1-col mobile / 2-col grid ≥768px; verbatim species | ✓ VERIFIED | md:grid-cols-2; row.species verbatim; no .replace/.toLowerCase |
| `src/lib/components/ExplorerHeader.svelte` | Sticky z-20; 3-row mobile; selector Snippet | ✓ VERIFIED | sticky top-0 md:top-[48px] z-20; 3 rows; selector: Snippet; {#if range === 'custom'} CustomDateInputs |
| `src/routes/explorer/+page.server.ts` | Loader: parse → defaults → DAL → gap-fill → chartOption | ✓ VERIFIED | All branches present; no db.prepare; no echarts import; FISH_PER_ANGLER_AXIS imported |
| `src/routes/explorer/+page.svelte` | Page: ExplorerHeader + Chart + breakdown + EmptyState + nav update | ✓ VERIFIED | All 4 components imported; tooltipFormatter wired; page title set |
| `src/routes/+layout.svelte` | navItems updated with /explorer at index 1 | ✓ VERIFIED | Line 8: { href: '/explorer', label: 'Explorer' } immediately after Home |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/scraper/pipeline.ts` | `src/lib/db/boats.ts upsertBoatsAndLandings` | `upsertBoatsAndLandings(db, rows)` at line 182 | ✓ WIRED | Call site unchanged; slug generation internal |
| `src/lib/db/boats.ts upsertByName` | boats table INSERT | ON CONFLICT omits slug (D-13 freeze) | ✓ WIRED | slug not in UPDATE clause confirmed |
| `src/lib/shared/urlState.ts ExplorerFiltersSchema` | `src/lib/shared/range.ts RANGE_PRESETS` | `z.enum(RANGE_PRESETS)` imported from range.ts | ✓ WIRED | Single source of truth confirmed |
| `src/lib/shared/range.ts rangeToDates` | `src/lib/shared/dates.ts today() / addDays()` | `import { today, addDays } from '$lib/shared/dates'` | ✓ WIRED | Date discipline intact; dates-boundary lint passes |
| `src/lib/db/queries/explorer.ts speciesAcrossBoats` | Two-pass top-6 with window totals | ORDER BY total DESC LIMIT 6 in Pass 1 | ✓ WIRED | Pitfall 9 mitigated; explorer.test.ts 8-boat scenario |
| `src/routes/explorer/+page.server.ts` | `src/lib/db/queries/explorer.ts`, `boats.ts`, `landings.ts` | import statements lines 26-33 | ✓ WIRED | 5+ DAL modules imported |
| `src/routes/explorer/+page.server.ts` | `parseExplorerFilters` + `rangeToDates` | imports at lines 36-37 | ✓ WIRED | Both used in load() |
| `src/routes/explorer/+page.svelte` | ExplorerHeader + Chart + SpeciesBreakdownTable + EmptyState | imports lines 5-8 | ✓ WIRED | All 4 components imported and used in template |
| `src/routes/explorer/+page.svelte` | `src/lib/copy/metrics.ts FISH_PER_ANGLER_TOOLTIP_UNIT` | import line 10; used in tooltipFormatter | ✓ WIRED | Per-angler discipline lint passes |
| `src/lib/components/Chart.svelte` | optional `tooltipFormatter` prop | Merged in $effect before setOption | ✓ WIRED | 4 occurrences of tooltipFormatter in Chart.svelte |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `+page.server.ts` → chartOption | `chartSeries[].data` | `boatExplorerSeries()` / `speciesAcrossBoats()` / `landingAcrossSpecies()` → gap-fill alignment | DB queries with BETWEEN date bounds | ✓ FLOWING |
| `+page.server.ts` → `breakdownRows` | `SpeciesBreakdownRow[]` | `speciesBreakdownForBoat()` | DB query via boat_id | ✓ FLOWING |
| `+page.server.ts` → `selectorOptions` | `Array<{value, label}>` | `listBoatsByActivity(db, 90)` / `distinctSpecies(db)` / `distinctLandings(db)` | DB queries | ✓ FLOWING |
| `+page.server.ts` → `nByBucketBySeries` | `Record<string, Record<string, number>>` | Constructed after series loop — inner maps initialized to `{}` but never populated | No data source — stub | ✗ HOLLOW (per-bucket n always 0) |
| `+page.svelte` → Chart | `chartOption` from loader; `tooltipFormatter` constructed client-side | Loader JSON; `data.nByBucketBySeries` for n lookup | Real for value; stub for per-bucket n | ⚠️ PARTIAL |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| slug.ts exports slugify + uniqueSlug | `grep -n "^export function" src/lib/shared/slug.ts \| wc -l` | 2 | ✓ PASS |
| range.ts exports rangeToDates | `grep "export function rangeToDates" src/lib/shared/range.ts` | 1 match | ✓ PASS |
| ExplorerFiltersSchema exists + discriminated union | `grep "z.discriminatedUnion" src/lib/shared/urlState.ts` | 1 match | ✓ PASS |
| 7+ explorer DAL exports | `grep "^export function" src/lib/db/queries/explorer.ts \| wc -l` | 8 | ✓ PASS |
| migrations adds slug + 2 covering indexes | `grep "idx_catch_species_date\|ALTER TABLE boats ADD COLUMN slug" src/lib/db/migrations.ts` | 2 matches | ✓ PASS |
| No SQL in route loader | `grep "db.prepare" src/routes/explorer/+page.server.ts \| wc -l` | 0 | ✓ PASS |
| No echarts import in loader | `grep "from 'echarts'" src/routes/explorer/+page.server.ts \| wc -l` | 0 | ✓ PASS |
| nByBucketBySeries inner maps populated | `grep "nByBucketBySeries\[legendName\]\[" src/routes/explorer/+page.server.ts` | no matches | ✗ FAIL — stub confirmed |
| Full test suite | `npx vitest run` | 590 pass / 1 fail (pre-existing forecast-benchmark, unrelated to Phase 6) | ✓ PASS |
| Lint guards | `npx vitest run tests/unit/db/dal-boundary.test.ts tests/unit/lint/ tests/unit/shared/dates-boundary.test.ts` | 5/5 pass | ✓ PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EXPL-01 | Plan 05 | User lands on explorer with default boat ticker pre-selected | ✓ SATISFIED | Empty URL → mostActiveBoatLast30Days → chartOption with boat series |
| EXPL-02 | Plans 04, 05 | User can switch ticker type between boat, species, landing | ✓ SATISFIED | TickerPills 3-button toggle; onTickerChange fires goto(); loader resolves cross-axis defaults |
| EXPL-03 | Plans 01, 05 | User can pick any boat from a list | ✓ SATISFIED | listBoatsByActivity(db, 90) populates selectorOptions; <select> in ExplorerHeader selector snippet |
| EXPL-04 | Plan 05 | User can pick any species using verbatim SD names | ✓ SATISFIED | distinctSpecies(db) populates selector; verbatim names from DB unchanged |
| EXPL-05 | Plan 05 | User can pick any landing using verbatim names | ✓ SATISFIED | distinctLandings(db) populates selector; verbatim display_name |
| EXPL-06 | Plans 03, 05 | Boat ticker → catch history with trip-type series overlaid | ✓ SATISFIED | boatExplorerSeries GROUP BY (bucket_key, trip_type); series per trip type in chartOption |
| EXPL-07 | Plans 03, 05 | Species ticker → catch history across boats | ✓ SATISFIED | speciesAcrossBoats two-pass top-6; boat series in chartOption |
| EXPL-08 | Plans 03, 05 | Landing ticker → catch history across species | ✓ SATISFIED | landingAcrossSpecies two-pass top-6; species series in chartOption |
| EXPL-09 | Plans 02, 04, 05 | User can change range via 1M/3M/6M/1Y/2Y/5Y/All | ✓ SATISFIED | RangeStrip 8 buttons (including Custom); rangeToDates maps each preset |
| EXPL-10 | Plans 03, 05 | Per-angler numbers always show sample size n | ✓ SATISFIED (series-level n) / ✗ PARTIAL (tooltip per-bucket n) | Legend n=NN correct. Caption n correct. Tooltip per-bucket n shows 0. D-16 requires tooltip per-bucket n. |
| EXPL-11 | Plans 03, 05 | Trip-type label appears in every series legend | ✓ SATISFIED | Series name = `${s.label} · n=${s.totalN}` where label is verbatim trip_type/boat/species |
| EXPL-12 | Plans 04, 05 | Explorer usable on mobile at 375px | ? NEEDS HUMAN | 280px chart height via matchMedia; min-h-11 buttons; 3-row sticky header — visual confirmation required |
| EXPL-13 | Plans 01, 03, 05 | Chart loads within reasonable time at All range | ✓ SATISFIED | All-range bounded at 365×15 days monthly; 0.8ms DAL soft-perf test; covering indexes; Cache-Control max-age=60 |
| EXPL-14 | Plans 02, 04, 05 | User can pick a custom date range | ✓ SATISFIED | RangeStrip 'Custom' 8th button; CustomDateInputs blur-submit; Zod superRefine validates fromDate <= toDate; clamped to [earliestScrapeDate, today()] |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/routes/explorer/+page.server.ts` | 538–560 | `nByBucketBySeries` maps initialized to `{}` and never populated — comments explain the intent and defer the fix | ✗ Blocker | Tooltip per-bucket n always shows 0; violates Plan 05 must-have "tooltip has per-bucket n" and D-16/D-22 |

No other anti-patterns found. No TODO/FIXME comments in production code beyond the nByBucketBySeries comments. No hardcoded empty returns in goal-critical paths. DAL boundary, date discipline, per-angler, and anti-feature lint all pass.

---

### Human Verification Required

#### 1. Mobile layout at 375px

**Test:** Open `/explorer` in a browser using DevTools device emulation at 375×812 (iPhone SE) or a physical mobile device. Scroll to verify the sticky header pins to the top. Tap each ticker pill (Boat, Species, Landing) and verify the chart re-renders. Tap several range buttons and verify chart updates. Tap "Custom" and verify the date inputs appear below the range strip.

**Expected:** Three-row sticky header pinned at top of viewport. Chart renders at 280px height. All buttons are comfortably tappable (≥44px). Range strip scrolls horizontally if needed. Custom date inputs appear below range strip when Custom is active.

**Why human:** matchMedia and sticky CSS layout cannot be verified by grep. Tap-target size requires visual or automated browser testing.

---

#### 2. ECharts scroll legend with series 7+ hidden

**Test:** Navigate to `/explorer?ticker=species&name=bluefin&range=all` (or any species with >6 boats). Observe the legend at the bottom of the chart.

**Expected:** Six series are initially visible in the chart. The ECharts scroll legend shows additional entries for series 7+ with them toggled off by default. Clicking a legend entry reveals/hides the corresponding series. Series names are verbatim (boat display names, no normalization).

**Why human:** ECharts runtime legend behavior (scroll, click-to-toggle) requires a browser.

---

#### 3. Tooltip per-bucket n (known stub)

**Test:** Hover over any data point in the chart. Observe the tooltip row for each series.

**Expected (currently):** Tooltip shows `marker SeriesName: X.X fish/angler (n=0)` — n=0 for all buckets because nByBucketBySeries is not populated (known stub).

**Expected (after fix):** Tooltip shows actual trip counts for that specific bucket per series.

**Why human:** Requires browser to trigger ECharts tooltip; visual confirmation of n value.

---

#### 4. Bundle split: ECharts in separate chunk

**Test:** Run `npm run build` and inspect `.svelte-kit/output/client/_app/immutable/chunks/`. Check that a `Chart-*.js` or `echarts-*.js` chunk exists separately from the explorer route chunk.

**Expected:** ECharts (~800KB) appears in a split chunk, not bundled into the explorer route's SSR chunk.

**Why human:** Requires a build run and manual inspection of output filenames.

---

## Gaps Summary

**1 gap blocking a must-have:**

**Tooltip per-bucket n is always 0.** The Plan 05 must-have explicitly states "tooltip has axis crosshair + per-bucket n." The axis crosshair is correctly wired (`axisPointer.type: 'cross'`). The per-bucket n is the stub: `nByBucketBySeries` is a `Record<string, Record<string, number>>` where each series key maps to an empty inner object `{}`. The tooltip formatter reads `seriesNByBucket[axisValue] ?? 0` — always 0.

**Root cause:** During series-building in the loader, raw bucket data (`BoatExplorerBucket[]` / `SpeciesAcrossBoatsBucket[]` / `LandingAcrossSpeciesBucket[]`) already contains `n_trips` per bucket. The loop that constructs `seriesList` accumulates `totalN` (series-level total) correctly but does not write per-bucket entries into `nByBucketBySeries`. The fix requires a second pass inside each ticker branch to populate `nByBucketBySeries[legendName][bucket.bucket_key] = bucket.n_trips` from the raw DAL output.

**Impact scope:** EXPL-10 (per-angler numbers always show sample size n) is partially satisfied — legend n is correct, caption is correct, but the tooltip-hover per-bucket n (specified in D-16 and D-22) is always 0. This is a UX gap: anglers cannot judge thin individual buckets from the tooltip, only from the legend total.

**Note:** This gap does not affect the route's ability to render charts, switch tickers, change ranges, or display the species breakdown table. All 14 EXPL requirements are substantively implemented; EXPL-10 is the one partially degraded by this stub.

---

_Verified: 2026-04-30T10:35:00Z_
_Verifier: Claude (gsd-verifier)_
