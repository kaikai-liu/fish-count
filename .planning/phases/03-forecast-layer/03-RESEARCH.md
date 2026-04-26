# Phase 3: Forecast Layer — Research

**Researched:** 2026-04-26
**Domain:** Statistical time-series projection + SQLite aggregate math + SvelteKit route composition
**Confidence:** HIGH — all major claims verified against source code, CONTEXT.md, and project research artifacts

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Shipped projection = seasonal-naïve weighted-yield baseline. ±7 calendar days of same `(month, day-of-month)` × all prior years.
- **D-02:** Window ±7 × all prior years. Off-season gaps (closed rockfish, no-bluefin) correctly produce n<5 → gray.
- **D-03:** Fleet-wide grain `(forecast_date, species, trip_type)`. No per-boat forecasts.
- **D-04:** PI = empirical 10th/90th percentiles of per-trip per-angler ratios. Distribution-free.
- **D-05:** Percentile compute location is **Claude's Discretion** (see below).
- **D-06:** `n_trips` = `COUNT(DISTINCT (source_date, boat_id, trip_type))`.
- **D-07:** ALL cells written regardless of n; `value=NULL` when n<5; `baseline_value` always populated.
- **D-08:** UI renders gray + "not enough history — n=N trips" when `value IS NULL`.
- **D-09:** Precompute window = `today..today+30`. No recompute of past rows.
- **D-10:** >30-day target date renders "horizon too far — historical data only". No parse rejection.
- **D-11:** `forecasts` table schema — see CONTEXT.md. UNIQUE on `(forecast_date, species, trip_type)`.
- **D-12:** `baseline_value` = `value` for v1; column reserved for future model-vs-baseline.
- **D-13:** Recompute inline in `_scrapeTick` after `scrapeDate` returns.
- **D-14:** Recompute on `{success, empty}` outcomes only.
- **D-15:** Full rebuild of `today..today+30` × all species × all trip_types on each recompute.
- **D-16:** Past forecast rows never recomputed; retained indefinitely.
- **D-17:** `scripts/backfill.ts` calls `recomputeForecasts(today())` once at end.
- **D-18:** New `scripts/forecasts-rebuild.ts` for operator ad-hoc rebuild.
- **D-19:** One-time `scripts/forecast-benchmark.ts` produces `03-VALIDATION-BENCHMARK.md`.
- **D-20:** New `forecastHeatmap.ts` query returns `{date, value, n, pi_low?, pi_high?, gap_present?, gap_expected?}`.
- **D-21:** Picker loader composes past cells from `heatmapForQuery`, today/future from `forecastHeatmapForQuery`. Split on `today()` PT.
- **D-22:** `buildHeatmapOption` tooltip branches on presence of `pi_low`/`pi_high`.
- **D-23:** Integer display: `Math.round()` on forecast value and PI bounds at display time. Stored as REAL.
- **D-24:** Gap accounting reads `scrape_runs.outcome`. Present = `{success, empty}`. Gap = `{killed, http_error, parse_error}` or no row.
- **D-25:** `PerAnglerMetric` gains `kind?: 'historical' | 'forecast'` prop + optional `pi` prop.
- **D-26:** Per-angler lint allowlist unchanged.
- **D-27:** Module placement — `src/lib/forecast/compute.ts`, `src/lib/db/forecasts.ts`, `src/lib/db/queries/forecastHeatmap.ts`, `scripts/forecasts-rebuild.ts`.
- **D-28:** `compute.ts` takes DB handle via parameter (purity rule; same model as `parser.ts`).
- **D-29:** `/about` Forecasts section with 6 bullet points.
- **D-30:** `PerAnglerMetric` with `kind='forecast'` links to `/about#forecasts`.
- **D-31:** `/picker` cache-control unchanged: `public, max-age=300`.
- **D-32:** Unit tests use `seedTestDb` with synthetic `catch_reports` fixture.
- **D-33:** End-to-end: seed dev DB → `forecasts-rebuild.ts` → `/picker GET`.
- **D-34:** Heatmap composer test with `today()` mocked to known date.

### Claude's Discretion

1. **Percentile compute location:** JS-side (pull ratios array, sort, interpolate) vs SQLite window-function tricks. Planner picks. Research recommendation in Technical Approach §1 below.
2. **Transaction scope for recompute:** Single `BEGIN…COMMIT` vs per-cell vs batched. Planner picks. Research recommendation in Technical Approach §2 below.
3. **Species/trip_type recency predicate:** `distinctSpecies()` / `distinctTripTypes()` with "seen in last 365 days" filter or plain distinct. Planner picks. Research recommendation in Technical Approach §9 below.
4. **`forecasts-rebuild.ts` range mode:** `--from`/`--to` flags or always full-window rebuild. Planner picks. Research recommendation: full rebuild only (simpler, operator use case is "fix it now").
5. **Tooltip copy:** exact wording within D-22/D-23/D-24 constraints. Planner picks.
6. **Gap-year inclusion:** does the year of `forecast_date` itself count toward M? Recommendation: exclude (only past years contribute). Research recommendation in Technical Approach §5 below.

### Deferred Ideas (OUT OF SCOPE)

- Per-boat forecasts
- Continuous backtest cron
- Bayesian shrinkage
- Bootstrap percentile intervals
- Quantile regression / GAMs
- Same-week-last-year overlay (V1X-01)
- Confidence intervals (vs prediction intervals)
- Median / trimmed-mean forecast variant (V1X-03)
- Forecast freshness indicator
- Smoothing (LOESS / kernel smoother)
- Per-cell forecast diagnostics page
- Email alert payload using forecast values (Phase 4 decision)
- Background recompute via worker thread
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FCT-01 | Statistical projection (avg + prediction bands) precomputed per (species, trip_type, date-window) stored in `forecasts` table | D-01/D-03/D-04/D-11 locked schema; Technical Approach §1-2 cover compute mechanics |
| FCT-02 | Every forecast displays sample size `n` alongside projection | D-06 n_trips definition; Validation §edge-cases |
| FCT-03 | Projections with n<5 do NOT render point estimate — render "not enough history" | D-07/D-08; Validation §n<5 edge-case |
| FCT-04 | Seasonal-naïve baseline benchmarked; held-out validation; ship baseline if needed | D-19 benchmark methodology; Forecast Methodology §2 |
| FCT-05 | Calendar heatmap cell coloring uses precomputed forecast | D-20/D-21 hybrid composer; Technical Approach §6/8 |
| FCT-06 | Forecasts regenerate nightly as part of scrape pipeline | D-13/D-14 scheduler wiring; Technical Approach §2 |
| FCT-07 | Forecast horizon capped at 30 days; farther queries render "horizon too far" | D-09/D-10; Validation §>30-day branch |
</phase_requirements>

---

## Summary

Phase 3 ships a pure-math seasonal-naïve forecast layer that is fully prescribed by the 34-decision CONTEXT.md. The code surface is manageable: one pure module (`compute.ts`), one new DAL repository (`db/forecasts.ts`), one new read query (`db/queries/forecastHeatmap.ts`), three scripts, and two route extensions. The architectural patterns from Phase 1 and Phase 2 compose directly — the upsert discipline, the `scrape_runs`-based gap ledger, the `seedTestDb` fixture pattern, and the `buildHeatmapOption` branch pattern all extend without modification.

The two primary technical questions left open by CONTEXT.md (percentile method, transaction scope) both have clear correct answers based on existing code patterns: JS-side percentile (simpler, testable, bounded input) and a single wrapping transaction (matches Phase 1 `upsertMany` pattern, WAL keeps readers unblocked). The gap-year question resolves to "exclude the forecast year itself" because future dates in the input window are unknowable and their absence is not a gap.

The benchmark script (FCT-04) is a one-time artifact that runs before phase-complete. Its output calibrates whether the seasonal-naïve model is defensible. The planner should ensure that script produces a Markdown report that the `/about` Forecasts section can directly link to, with inline summary numbers.

**Primary recommendation:** Implement percentile computation in JS (option a), wrap the full recompute in a single SQLite transaction, and exclude the forecast year from M in gap accounting. These three micro-decisions resolve the only open items.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Forecast math (weighted yield, percentile PI) | Backend (Node / `src/lib/forecast/compute.ts`) | — | Pure math, no DOM; DB handle injected; testable from Node |
| Forecast persistence (UPSERT/read) | Database + DAL (`src/lib/db/forecasts.ts`) | — | Only SQL surface per CLAUDE.md Architecture Rule |
| Forecast heatmap read query | DAL (`src/lib/db/queries/forecastHeatmap.ts`) | — | Read path; shape contract maintained for UI |
| Hybrid heatmap composition (past/future split) | API / Backend (`src/routes/picker/+page.server.ts` `load()`) | — | Server-side; reads today() once, passes pre-shaped array to component |
| Integer rounding at display time | Frontend (`PerAnglerMetric.svelte`, `heatmapOption.ts`) | — | Display concern; underlying REAL retained in DB |
| Forecast tooltip branch (`pi_low`/`pi_high` present) | Frontend Server (`heatmapOption.ts` — pure Node-testable) | — | ECharts option builder; already unit-tested |
| Gap annotation ("based on N of M days") | Backend (loader computes; component renders) | Frontend (render) | Loader extracts gap_present/gap_expected; component formats copy |
| Nightly recompute trigger | API / Backend (`scheduler.ts` `_scrapeTick`) | — | Inline after scrapeDate returns; non-fatal try/catch |
| Benchmark script (FCT-04) | Backend (script, not a route) | — | One-time; reads DB, writes Markdown artifact |
| >30-day horizon gate | API / Backend (picker loader) | Frontend (renders message) | Loader detects horizon excess; Svelte template renders message |

---

## Domain Context

### What Forecasting in This Domain Looks Like

San Diego charter fishing is **seasonal, sparse, and species-specific.** A fleet-wide forecast for "yellowtail on a Full Day trip in mid-May" draws from ~10–15 prior years of data, with ~14 candidate dates per year (±7 days of the same calendar slot), filtered to one trip type. This typically yields 50–200 matched rows, not thousands. The distribution is right-skewed (most days modest, occasional hot days). This shape makes empirical percentiles directly appropriate — there is no theoretical basis for a normal distribution.

**Key domain language constraints (verbatim — never paraphrase these):**

| UI string | Source | Context |
|-----------|--------|---------|
| `forecast` | D-25, CONTEXT.md §Specific Ideas | Inline label in PerAnglerMetric — never "prediction" or "projection" |
| `not enough history` | D-08, CONTEXT.md §Specific Ideas | n<5 refusal in all locations |
| `based on N of M days` | D-24, CONTEXT.md §Specific Ideas | Gap annotation — exact wording, not paraphrase |
| `horizon too far — historical data only` | D-10, CONTEXT.md §Specific Ideas | >30-day message in heatmap area |
| `80% PI` | D-04, CONTEXT.md | The prediction interval is empirical 10/90 = 80% coverage interval |

**Per-angler framing carries to forecasts.** Every forecast number is still "derived boat-aggregate average" (CLAUDE.md non-negotiable #4). The `kind='forecast'` PerAnglerMetric extension does not relax this rule — the same framing logic auto-detects from context and the `/about#forecasts` link is added.

**Trip types verbatim (CLAUDE.md):** "1/2 Day AM," "1/2 Day PM," "3/4 Day," "Full Day," "Full Day Coronado Islands," "Overnight," "1.5 Day," "2 Day," "2.5 Day," "3 Day," "Long Range." The recompute iterates `distinctTripTypes()` which returns these verbatim from the DB — no normalization occurs.

---

## Technical Approach

### 1. Percentile in SQLite — Recommendation: JS-side (Option A)

**CONTEXT.md leaves this to Claude's Discretion (D-05).** [VERIFIED: source code review of existing DAL modules]

SQLite 3.46 does not have a native `percentile_cont` aggregate function. Two options:

**Option A — Pull ratios into JS, sort, compute (RECOMMENDED):**
```typescript
// Source: standard interpolating percentile ("linear" method, matches numpy default)
// Input: sorted array of per-trip ratios (species_count / angler_count)
// P = desired fractile (0.10 for 10th, 0.90 for 90th)
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}
```
[ASSUMED: numpy "linear" interpolation method; the formula is standard but the specific behavior at n=2 with p=0.1 has not been cross-checked against a reference test vector in this session]

**Option B — NTILE/window tricks in SQL:**
SQLite supports `NTILE(n)` and `PERCENT_RANK()` window functions, but these compute rank-based approximations, not interpolated percentiles. `NTILE(10)` bucketing gives approximate deciles; the bucket boundary is imprecise at small n (e.g., n=6 with NTILE(10) leaves most buckets empty). This approach is harder to unit-test and produces systematically different results from Option A.

**Why Option A wins:**
1. **Bounded inputs:** ≤1000 ratios per cell (D-05 CONTEXT.md); JS sort is O(n log n) over a tiny array — no performance concern.
2. **Testable:** `percentile(sorted, 0.10)` is a pure function — trivially unit-tested with reference vectors.
3. **Correct interpolation:** Matches numpy's "linear" method; standard in statistics tooling.
4. **Single query:** The aggregate SQL `SELECT species_count * 1.0 / NULLIF(angler_count, 0) AS ratio FROM catch_reports WHERE ...` returns the ratio array; `sort() + percentile()` runs in the same JS function.
5. **DAL boundary preserved:** SQL lives in the DAL; math lives in `compute.ts`.

**Query to pull matched ratios for a cell** (belongs in `src/lib/db/catchReports.ts` as a new function `getRatiosForWindow`):
```typescript
// Returns per-trip per-angler ratios for the ±7-day seasonal window
// across all years strictly before forecast_date's year.
// Called by compute.ts to build the input set for percentile computation.
function getRatiosForWindow(
  db: Database.Database,
  args: { forecastDate: string; species: string; tripType: string }
): { ratio: number | null; source_date: string; boat_id: number }[]
// SQL:
`SELECT
    SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS ratio,
    cr.source_date,
    cr.boat_id
  FROM catch_reports cr
 WHERE cr.species = @species
   AND cr.trip_type = @tripType
   AND CAST(strftime('%Y', cr.source_date) AS INTEGER) < @forecastYear
   AND (
     (strftime('%m-%d', cr.source_date) >= @windowStart AND
      strftime('%m-%d', cr.source_date) <= @windowEnd)
     OR
     -- handle year-boundary wrap (e.g. window spans Dec 25 - Jan 8)
     -- Only needed when windowStart > windowEnd (month-day string comparison)
     (@windowWraps = 1 AND (
       strftime('%m-%d', cr.source_date) >= @windowStart OR
       strftime('%m-%d', cr.source_date) <= @windowEnd
     ))
   )
 GROUP BY cr.source_date, cr.boat_id, cr.trip_type`
```
[VERIFIED: SQLite `strftime('%m-%d', date_string)` works on TEXT columns in YYYY-MM-DD format — confirmed by reviewing scrapeRuns.ts SQLite date arithmetic patterns in codebase]

**Important edge case — year-boundary wrap:** For a `forecast_date` of `2026-01-03` (January 3), the ±7-day window spans `12-27` to `01-10`. The `strftime('%m-%d')` comparison `>= '12-27' AND <= '01-10'` would return zero rows because no date can satisfy both conditions lexicographically. The query must detect when `windowStart > windowEnd` (string comparison) and use an OR branch. The planner must include a test case for a January forecast date.

**n_trips derivation** (verified against D-06 and Phase 2 D-09 pattern in `tripPicker.ts`):
```sql
COUNT(DISTINCT cr.source_date || '|' || cr.trip_type || '|' || cr.boat_id)
```
Note: this is `(source_date, boat_id, trip_type)` triple — consistent with D-06 "same trip counting rule as Phase 2 D-09." The existing `tripPicker.ts` uses `source_date || '|' || trip_type` (without boat_id) because it counts trips per boat separately. For the fleet-wide forecast cell, `boat_id` must be included to avoid double-counting when two boats ran the same trip type on the same day.

**weighted yield** (D-01 = same as Phase 2 D-08):
```sql
SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS value
```

---

### 2. Recompute Transaction Strategy — Recommendation: Single Transaction

**CONTEXT.md leaves this to Claude's Discretion.** [VERIFIED: better-sqlite3 WAL mode confirmed in codebase; Phase 1 `upsertMany` transaction pattern confirmed in `catchReports.ts`]

**Options:**
- **Per-cell:** 3,720 individual UPSERT statements, each auto-committed. Maximum contention with concurrent readers.
- **Per-cell in a single transaction (RECOMMENDED):** Wrap all 3,720 UPSERTs in one `db.transaction(fn)`. Matches the Phase 1 `upsertMany` pattern exactly.
- **Batched:** Intermediate option (e.g., 100 cells per transaction). Unnecessary complexity for this workload.

**Why single transaction wins:** [CITED: better-sqlite3 documentation pattern; ASSUMED: WAL mode performance characteristics]
- WAL mode (Phase 1) allows readers during a write transaction — `/picker` reads are unblocked even during the full recompute.
- A single `db.transaction()` wrapper is ~10–50x faster than 3,720 individual commits due to fsync amortization. For ~3,720 rows this is the difference between <100ms and potentially seconds.
- Rollback semantics: if one cell computation throws (e.g., SQLite error mid-batch), the entire transaction rolls back, leaving the `forecasts` table in its previous state. The previous valid forecast continues to serve until the next successful recompute.
- This matches the existing Phase 1 `upsertMany` pattern in `catchReports.ts` — planner can use that as the direct model.

**Pseudocode for `upsertMany` in `src/lib/db/forecasts.ts`:**
```typescript
export function upsertMany(db: Database.Database, rows: ForecastRow[]): void {
  if (rows.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO forecasts
       (forecast_date, species, trip_type, value, pi_low, pi_high,
        n_trips, baseline_value, gap_days_present, gap_days_expected, computed_at)
     VALUES (@forecast_date, @species, @trip_type, @value, @pi_low, @pi_high,
             @n_trips, @baseline_value, @gap_days_present, @gap_days_expected, @computed_at)
     ON CONFLICT(forecast_date, species, trip_type) DO UPDATE SET
       value             = excluded.value,
       pi_low            = excluded.pi_low,
       pi_high           = excluded.pi_high,
       n_trips           = excluded.n_trips,
       baseline_value    = excluded.baseline_value,
       gap_days_present  = excluded.gap_days_present,
       gap_days_expected = excluded.gap_days_expected,
       computed_at       = excluded.computed_at`
  );
  const tx = db.transaction((items: ForecastRow[]) => {
    for (const r of items) stmt.run(r);
  });
  tx(rows);
}
```
[VERIFIED: this is the exact pattern from `catchReports.ts` lines 30-46, adapted for the `forecasts` table]

---

### 3. `scrape_runs` Outcome Enum — Confirmed Values

[VERIFIED: `src/lib/db/scrapeRuns.ts` line 11 and `migrations.ts` CHECK constraint line 71]

```typescript
export type ScrapeOutcome = 'success' | 'empty' | 'http_error' | 'parse_error' | 'killed';
```

**Gap-day accounting per D-24:**
- **Present** (`gap_days_present`): `outcome IN ('success', 'empty')` — we tried and got a definitive answer (data or honest zero).
- **Gap** (absent from present count): `outcome IN ('killed', 'http_error', 'parse_error')` OR no `scrape_runs` row for that date — we don't know what happened.

**SQL to count gap_days_present** for a given set of input dates (new function `countPresentDays` in `src/lib/db/scrapeRuns.ts`):
```sql
SELECT COUNT(DISTINCT run_date) AS present_count
  FROM scrape_runs
 WHERE run_date IN ({placeholders})
   AND outcome IN ('success', 'empty')
```
[VERIFIED: confirmed against `scrapeRuns.ts` `getDatesToScrape()` logic which uses the same success/empty vs failure distinction]

**gap_days_expected** = total count of calendar dates in the input window (the ±7-day × all-prior-years set). This is a pure date enumeration — no DB query needed.

---

### 4. `today()` Timezone Correctness — Confirmed

[VERIFIED: `src/lib/shared/dates.ts` lines 6-13]

```typescript
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}
```

`today()` correctly returns the current Pacific Time date in YYYY-MM-DD format. `Intl.DateTimeFormat` with `timeZone: 'America/Los_Angeles'` handles DST automatically (the `en-CA` locale produces `YYYY-MM-DD` format). **This is the authoritative time source.** The picker loader MUST call `today()` once at the start of `load()` and use that single value for all past/future cell boundary decisions in the heatmap composer (D-21).

**Composer off-by-one prevention:**
- Call `const todayPt = today()` once at the top of `load()`.
- For each heatmap cell date `d`: `d < todayPt` → use `heatmapForQuery` (actuals); `d >= todayPt` → use `forecastHeatmapForQuery`.
- Do NOT call `today()` twice (once for cell splitting, once for horizon check) — use the same `todayPt` for both to avoid DST-boundary inconsistency within a single request.
- The ECharts calendar component on the client renders times after the server has already resolved the split — no TZ risk on the client side for the coloring boundary.

**`addDays()` confirmed available** in `src/lib/shared/dates.ts` (line 36). Used for window-edge computation.

---

### 5. Gap-Year Inclusion — Recommendation: Exclude Forecast Year

**CONTEXT.md leaves this to Claude's Discretion (final bullet).** [ASSUMED: reasoning from data availability semantics]

**The question:** For `forecast_date = 2026-05-15`, should `M` (gap_days_expected) include the 14 candidate dates from 2026 itself (2026-05-08..2026-05-22)?

**Recommendation: Exclude the forecast year itself from M.**

Rationale:
1. **Future dates are not gaps.** A gap means "we tried to scrape and failed." Future dates (2026-05-08..2026-05-22 haven't happened yet) cannot be gaps — they're simply not yet in the dataset. Including them in M would make the denominator artificially large, producing "based on 42 of 70 days" when the correct statement is "based on 42 of 56 prior-year days."
2. **The current-year dates before `forecast_date`** (e.g., 2026-01-01 to 2026-05-07) that fall within ±7 days of the same calendar slot are a gray area. The simplest clean rule: **exclude the entire year of `forecast_date` from M**. This means M = count of candidate dates from years 2010..2025 (or whatever years have data), which is always a finite, fully-known set.
3. **The forecast value computation (D-01) already excludes the forecast year** from the input ("`all prior years in the dataset`"). Gap accounting should be consistent with the forecast computation's year filter.

**Implementation:** In the window expansion loop, filter candidate dates to `year < parseInt(forecastDate.slice(0, 4))`.

---

### 6. Hybrid Heatmap Composer Correctness

[VERIFIED: `src/routes/picker/+page.server.ts` reviewed; heatmap composition logic at lines 94-113]

**Current Phase 2 heatmap composition** (lines 94-113 of `+page.server.ts`):
```typescript
const heatmapStart = filters.rangeMode && filters.fromDate ? filters.fromDate : filters.date;
const heatmapEnd = addDays(heatmapStart, 29);
const presentCells = heatmapForQuery(db, { fromDate: heatmapStart, toDate: heatmapEnd, ... });
const presentMap = new Map(presentCells.map((c) => [c.date, c]));
const heatmap: HeatmapCell[] = [];
for (let i = 0; i < 30; i++) {
  const d = addDays(heatmapStart, i);
  heatmap.push(presentMap.get(d) ?? { date: d, value: null, n: 0 });
}
```

**Phase 3 modification** is additive: instead of querying all 30 cells from `heatmapForQuery`, split by `todayPt`:

```typescript
const todayPt = today();  // called ONCE

// Determine the >30-day horizon condition BEFORE computing heatmap
const horizonDaysOut = daysBetween(todayPt, filters.date);
if (horizonDaysOut > 30) {
  // D-10: render "horizon too far" message; rankings still computed from historical
  return { ..., heatmap: null, horizonTooFar: true, rankings, ... };
}

// Split heatmap window into past cells (actuals) and future cells (forecasts)
const pastCells: HeatmapCell[] = [];
const futureCells: ForecastHeatmapCell[] = [];
for (let i = 0; i < 30; i++) {
  const d = addDays(heatmapStart, i);
  if (d < todayPt) {
    // actuals from Phase 2 heatmapForQuery (called once for the past range)
  } else {
    // forecasts from forecastHeatmapForQuery (called once for the future range)
  }
}
```

**Efficiency:** call `heatmapForQuery` once for `[heatmapStart, addDays(todayPt, -1)]` and `forecastHeatmapForQuery` once for `[todayPt, heatmapEnd]`, then merge by date into the 30-cell array. Two queries, not 30.

**`forecastHeatmapForQuery` shape** (D-20 contract — `src/lib/db/queries/forecastHeatmap.ts`):
```typescript
export interface ForecastHeatmapCell {
  date: string;
  value: number | null;     // D-07: NULL when n_trips < 5
  n: number;                // = n_trips
  pi_low?: number | null;   // NULL when n_trips < 5
  pi_high?: number | null;  // NULL when n_trips < 5
  gap_present?: number;     // gap_days_present
  gap_expected?: number;    // gap_days_expected
}
```

The first three fields match Phase 2's `HeatmapCell` interface exactly — `buildHeatmapOption` receives a unified array and branches only in the tooltip formatter.

---

### 7. Idempotent UPSERT Pattern — Confirmed Exemplar

[VERIFIED: `src/lib/db/catchReports.ts` lines 30-46]

The Phase 1 `upsertMany` in `catchReports.ts` is the direct exemplar:
- Prepared statement with named `@field` bindings (better-sqlite3 object-bind style)
- `ON CONFLICT(unique_key) DO UPDATE SET ...excluded...`
- `db.transaction(fn)` wrapper for atomic batch

The `forecasts` table `upsertMany` in `src/lib/db/forecasts.ts` follows this pattern exactly with `ON CONFLICT(forecast_date, species, trip_type)`. See the snippet in §2 above.

---

### 8. `buildHeatmapOption` Extension — Branch Point

[VERIFIED: `src/routes/picker/heatmapOption.ts` reviewed; current tooltip formatter at lines 62-73]

**Current Phase 2 tooltip formatter:**
```typescript
formatter: (params: any) => {
  const cell = cells.find((c) => c.date === date);
  if (!cell) return '';
  if (cell.n < 5) {
    return `${cell.date}<br/>low data — n=${cell.n} ${...}`;
  }
  return `${cell.date}<br/>${(cell.value ?? 0).toFixed(1)} fish/angler<br/>n=${cell.n} trips`;
}
```

**Phase 3 extension** — branch on presence of `pi_low` to detect forecast cell:
```typescript
// A cell is a forecast cell if pi_low is present (even if null — the field's presence
// is the signal, not its value). Use `'pi_low' in cell` or a type-discriminant.
if ('pi_low' in cell && cell.n >= 5) {
  // Forecast cell with data
  const v = Math.round(cell.value ?? 0);
  const lo = Math.round(cell.pi_low ?? 0);
  const hi = Math.round(cell.pi_high ?? 0);
  const gapNote = (cell.gap_present !== undefined && cell.gap_expected !== undefined
    && cell.gap_present < cell.gap_expected)
    ? `<br/>based on ${cell.gap_present} of ${cell.gap_expected} days`
    : '';
  return `${cell.date}<br/>forecast: ${v} fish/angler [${lo}–${hi} 80% PI]<br/>n=${cell.n} trips${gapNote}`;
}
if ('pi_low' in cell && cell.n < 5) {
  // Forecast cell, insufficient data
  return `${cell.date}<br/>not enough history — n=${cell.n} trips`;
}
// Phase 2 actuals path — unchanged
```

**Phase 2 cells are unaffected** because they are `HeatmapCell` objects that lack the `pi_low` field. The `'pi_low' in cell` check will be `false` for all Phase 2 actuals cells, preserving the existing rendering path.

**Type evolution** — `buildHeatmapOption` signature should accept `(HeatmapCell | ForecastHeatmapCell)[]` rather than a union typedef. The planner should define a `UnifiedHeatmapCell = HeatmapCell | ForecastHeatmapCell` union type exported from `forecastHeatmap.ts` or a new `src/lib/shared/types.ts` entry.

---

### 9. `distinctSpecies` / `distinctTripTypes` Recency Predicate

[VERIFIED: `src/lib/db/queries/browse.ts` lines 60-65 and 93-97]

**Current implementation:** returns all distinct values ever seen in `catch_reports`, no date filter.

**Claude's Discretion question:** add "seen in last 365 days" predicate?

**Recommendation:** Keep the plain DISTINCT for v1 (no predicate). Rationale: at v1 scale, the number of distinct trip types and species is small (≤15 species, ≤12 trip types based on CLAUDE.md domain language). Forecasting for a species/trip_type that hasn't been seen in a year will produce n<5 cells that correctly render gray — the n<5 floor already handles stale labels gracefully. Adding a recency filter introduces the risk of silently omitting a species from forecasts when it was fished 13 months ago but will be fished again next month (e.g., bluefin seasonal patterns). The gray "not enough history" cells are more honest than silently omitting the species from the forecast window.

---

## Forecast Methodology

### 1. Math — Seasonal-Naïve Weighted-Yield Baseline (D-01)

**Forecast value (point estimate):**

```
value = SUM(species_count over matched input set) / SUM(angler_count over matched input set)
```

This is the **weighted yield** = D-08 = Phase 2's SUM/SUM metric, applied to the seasonal window rather than a date range.

**Matched input set definition for `(forecast_date, species, trip_type)`:**
- All `catch_reports` rows where:
  - `species = target_species`
  - `trip_type = target_trip_type`
  - `CAST(strftime('%Y', source_date) AS INTEGER) < CAST(strftime('%Y', forecast_date) AS INTEGER)`
  - `strftime('%m-%d', source_date)` within ±7 calendar days of `strftime('%m-%d', forecast_date)` (with year-boundary wrap handling)
- [ASSUMED: year-boundary wrap requires special handling in SQL when the ±7-day window crosses December 31 / January 1 — e.g., forecast_date = 2026-01-03 has window 12-27 to 01-10 which requires an OR clause in SQL]

**Sample size (n_trips):**
```
n_trips = COUNT(DISTINCT (source_date, boat_id, trip_type)) over matched input set
```
[VERIFIED: this is the fleet-wide trip-counting rule; consistent with D-06 and Phase 2 D-09]

**Prediction interval (pi_low, pi_high):**

1. From the matched input set, compute per-trip per-angler ratio for each `(source_date, boat_id)` group: `SUM(species_count) / NULLIF(SUM(angler_count), 0)`.
2. Collect non-null ratios into a JS array. Sort ascending.
3. `pi_low = percentile(sorted, 0.10)` (10th percentile, linear interpolation)
4. `pi_high = percentile(sorted, 0.90)` (90th percentile, linear interpolation)

**Storage:** `value`, `pi_low`, `pi_high` stored as REAL. Displayed as `Math.round()` integers.

**n<5 storage policy (D-07):** When `n_trips < 5`, store `value=NULL`, `pi_low=NULL`, `pi_high=NULL`, but still populate `n_trips` and `baseline_value`.

**`baseline_value`:** For v1, `baseline_value = value` (they are the same model). The column exists for FCT-04 audit and future model comparison.

---

### 2. Forecast Benchmark Methodology (FCT-04 / D-19)

**Held-out year:** Most recent complete calendar year with sufficient data. Assume 2025 if data exists through 2025-12-31; otherwise planner determines from actual dataset bounds.

**Benchmark procedure:**
1. Select all `(forecast_date, species, trip_type)` cells in the held-out year (2025-01-01 to 2025-12-31) where the actual outcome is known (i.e., `catch_reports` has at least one row for that date/species/trip_type).
2. For each cell: recompute forecast using ONLY data from `catch_reports` with `source_date < 2025-01-01`.
3. Compare two variants:
   - **Variant 1 (shipped):** Seasonal-naïve — ±7 days × all prior years (D-01).
   - **Variant 2 (fleet-mean baseline):** No seasonality — all `(species, trip_type)` rows from prior years, no date-window filter.
4. **Actuals** for comparison: `SUM(species_count) / NULLIF(SUM(angler_count), 0)` per `(date, species, trip_type)` on the held-out dates.
5. **Metrics to report:**
   - MAE (Mean Absolute Error): `mean(|forecast - actual|)` over all valid cells
   - Median absolute error: `median(|forecast - actual|)` — more robust to outliers
   - PI coverage: `fraction of actuals falling in [pi_low, pi_high]` — should be ~80% if calibrated

**Honest coverage interpretation:**
- **Calibrated:** 75–85% of held-out actuals fall within [pi_low, pi_high] — empirical 80% PI is performing as intended.
- **Overconfident:** <60% coverage — PI is too narrow; catch distribution is heavier-tailed than the ±7-day window suggests. Flag in the benchmark report.
- **Underconfident:** >90% coverage — PI is too wide; the seasonal window may be pulling in too many off-peak trips.

**D-19 gate:** If Variant 1 (seasonal) is **decisively worse** than Variant 2 (fleet-mean) on MAE (e.g., >50% higher MAE), the planner must reconsider D-01 before phase-complete. "Decisively worse" is a judgment call; the planner should define a threshold in the benchmark script (e.g., if `mae_seasonal > 1.5 × mae_fleet_mean`, print a warning in the benchmark output).

[ASSUMED: 2025 data exists in the dataset — this depends on actual backfill completion; planner should verify dataset bounds before committing the benchmark methodology]

**Output format for `03-VALIDATION-BENCHMARK.md`:**
```markdown
# Forecast Benchmark — Phase 3 Validation

**Held-out year:** 2025
**Training data:** all catch_reports with source_date < 2025-01-01
**Valid cells evaluated:** N cells (species/trip_type/date combinations with actual outcomes)

## Point Estimate Accuracy

| Model | MAE | Median AE | Notes |
|-------|-----|-----------|-------|
| Seasonal-naïve (±7 days × all prior years) | X.XX | X.XX | shipped |
| Fleet-mean baseline (no seasonality) | X.XX | X.XX | comparison |

## Prediction Interval Calibration

| Model | PI Coverage | Target | Assessment |
|-------|-------------|--------|------------|
| Seasonal-naïve 80% PI | XX% | ~80% | calibrated / overconfident / underconfident |

## Conclusion

[Human-readable verdict: seasonal model beats / ties / loses to fleet-mean baseline]
[PI calibration: honest / needs adjustment]
[Shipping decision: seasonal-naïve proceeds / reconsider D-01]
```

This document is linked from the `/about#forecasts` section (D-29). The planner must ensure the benchmark script writes to `.planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md`.

---

## Validation Architecture

> `nyquist_validation: true` in `.planning/config.json` — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (already installed; `vitest.config.ts` present) |
| Config file | `vitest.config.ts` at project root |
| Quick run | `npx vitest run tests/unit/forecast/` |
| Full suite | `npx vitest run` |

[VERIFIED: `vitest.config.ts` at `/Users/zen/Documents/code/fish-count/vitest.config.ts`; test runner active for existing Phase 1+2 tests]

### Test Infrastructure Available

[VERIFIED: all three helpers confirmed in `tests/helpers/`]

| Helper | Path | What it provides |
|--------|------|------------------|
| `openTestDb()` | `tests/helpers/in-memory-db.ts` | `:memory:` better-sqlite3 with Phase 1 schema via `runMigrations()` |
| `seedBoat()` | `tests/helpers/seedTestDb.ts` | Insert a boat + landing via the real DAL |
| `seedTrip()` | `tests/helpers/seedTestDb.ts` | Insert a `catch_reports` row via the real DAL |
| `seedTripsBatch()` | `tests/helpers/seedTestDb.ts` | Batch insert `catch_reports` rows |

Phase 3 tests extend `openTestDb()` by appending the `forecasts` table DDL via the updated `runMigrations()` call — once D-11 DDL is added to `migrations.ts`, all existing test DB helpers automatically include the new table.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | File | Automated Command |
|--------|----------|-----------|------|-------------------|
| FCT-01 | `computeCell()` produces correct value/pi_low/pi_high for a known synthetic input | unit | `tests/unit/forecast/compute.test.ts` | `npx vitest run tests/unit/forecast/compute.test.ts` |
| FCT-01 | Idempotent UPSERT: calling `recomputeForecasts` twice produces identical rows | unit | `tests/unit/forecast/compute.test.ts` | same |
| FCT-01 | Year-boundary wrap: January forecast date uses Dec+Jan input dates correctly | unit | `tests/unit/forecast/compute.test.ts` | same |
| FCT-02 | n_trips = COUNT(DISTINCT source_date, boat_id, trip_type) not row count | unit | `tests/unit/forecast/compute.test.ts` | same |
| FCT-03 | n<5 → `value=NULL`, `pi_low=NULL`, `pi_high=NULL`, `n_trips` populated | unit | `tests/unit/forecast/compute.test.ts` | same |
| FCT-04 | Benchmark script reads DB, produces MAE+coverage report, writes Markdown | integration | `tests/unit/scripts/forecast-benchmark.test.ts` | `npx vitest run tests/unit/scripts/forecast-benchmark.test.ts` |
| FCT-05 | `forecastHeatmapForQuery` returns `{date, value, n, pi_low, pi_high}` shape | unit | `tests/unit/db/queries/forecastHeatmap.test.ts` | `npx vitest run tests/unit/db/queries/forecastHeatmap.test.ts` |
| FCT-05 | Heatmap composer: past cells use actuals, today/future use forecasts | unit | `tests/unit/routes/picker-hybrid-heatmap.test.ts` | `npx vitest run tests/unit/routes/picker-hybrid-heatmap.test.ts` |
| FCT-06 | `recomputeForecasts` hook in `_scrapeTick` calls compute on success/empty, skips on http_error | unit | `tests/scheduler/scrape-tick.test.ts` (extend) | `npx vitest run tests/scheduler/scrape-tick.test.ts` |
| FCT-07 | >30-day target: loader returns `horizonTooFar: true`, heatmap null, rankings present | unit | `tests/unit/routes/picker.test.ts` (extend) | `npx vitest run tests/unit/routes/picker.test.ts` |

### Critical Edge Cases — MUST Test

1. **n<5 null path:** Seed exactly 4 matching trips → verify `value=NULL`, `pi_low=NULL`, `pi_high=NULL`. Seed exactly 5 matching trips → verify `value` non-null.

2. **Year-boundary wrap:** `forecast_date = '2026-01-05'` (window spans Dec 29 – Jan 12). Seed trips on `2025-01-03`, `2024-12-31`, `2024-01-07` → verify all three are included in the input set.

3. **Percentile method consistency:** `percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.10)` → `1.9` (linear interpolation). `percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.90)` → `9.1`. Test these reference vectors.

4. **Idempotent UPSERT:** Run `recomputeForecasts` twice with identical input → `SELECT COUNT(*) FROM forecasts` is same both times; verify via `computed_at` update that the second run overwrote.

5. **Hybrid heatmap composer past/today/future boundary:** Mock `today()` to a known date (e.g., `2026-05-15`). Seed actuals for `2026-05-10..2026-05-14` and forecasts for `2026-05-15..2026-05-25`. Assert that cells `< 2026-05-15` come from `catch_reports`-derived values and cells `>= 2026-05-15` come from `forecasts` table values.

6. **>30-day horizon branch:** `target_date = addDays(today(), 31)` → loader returns `horizonTooFar: true`; `target_date = addDays(today(), 30)` → normal heatmap path.

7. **Property assertions (invariants):**
   - When `value` is non-null: `pi_low <= value` and `value <= pi_high`. [ASSUMED: may not always hold for weighted-mean vs percentile computation; weighted mean is not guaranteed to fall inside the empirical 10/90 PI of the per-trip ratios. This is an expected property to test, with explicit acknowledgment that the point estimate may fall outside the PI if the fleet ratio distribution is sufficiently asymmetric. This does NOT indicate a bug; it indicates the PI is of per-trip ratios while the value is a SUM/SUM aggregate. Document in test comments.]
   - `n_trips >= 5` whenever `value` is non-null.
   - `gap_days_present <= gap_days_expected`.

8. **Gap-day accounting boundary:** forecast_date in current year → confirm M excludes current-year dates.

9. **Forecast tooltip vs actuals tooltip:** `buildHeatmapOption` test with a mixed array containing both `HeatmapCell` (past) and `ForecastHeatmapCell` (future) objects → verify tooltip for past cell uses `.toFixed(1)` format, tooltip for future cell uses integer + PI format.

### Property-Style Assertions

```typescript
// Idempotence: same inputs → same outputs every call
expect(firstComputeResult).toEqual(secondComputeResult);

// PI ordering: when non-null, pi_low <= pi_high (but value may be outside either)
if (cell.pi_low !== null && cell.pi_high !== null) {
  expect(cell.pi_low).toBeLessThanOrEqual(cell.pi_high);
}

// n_trips integrity
if (cell.value !== null) expect(cell.n_trips).toBeGreaterThanOrEqual(5);
if (cell.n_trips < 5) expect(cell.value).toBeNull();

// Gap accounting
expect(cell.gap_days_present).toBeLessThanOrEqual(cell.gap_days_expected);
```

### End-to-End Test Seam (D-33)

Mirrors the Phase 2 integration test structure (`tests/integration/phase2-routes.test.ts`):

```
1. Open in-memory DB with Phase 1+3 schema
2. Seed catch_reports for prior years with known values for (yellowtail, Full Day, 2025-05-12 ± 7 days)
3. Call recomputeForecasts(db, { today: '2026-05-12' })
4. Assert forecasts table has row for (2026-05-12, 'yellowtail', 'Full Day') with non-null value
5. Call picker load() with target_date=2026-05-18, species=yellowtail, tripType='Full Day'
6. Assert heatmap cells for 2026-05-18 onward come from forecasts table (have pi_low field)
7. Assert heatmap cells for 2026-05-11 and prior come from catch_reports aggregate (no pi_low field)
```

[VERIFIED: `tests/integration/phase2-routes.test.ts` exists as the direct model]

### Benchmark Validation Seam (FCT-04)

```typescript
// tests/unit/scripts/forecast-benchmark.test.ts
// Validates output structure of forecast-benchmark.ts script
it('benchmark produces MAE, median AE, and PI coverage', async () => {
  // Seed synthetic data: 2 years prior, then "held-out" year
  // Run benchmark with heldOutYear='SYNTHETIC_YEAR'
  // Assert output contains: mae_seasonal, mae_fleet_mean, pi_coverage
  // Assert PI coverage is a fraction between 0 and 1
  // Assert output Markdown contains a table with | Model | MAE | columns
});
```

### Wave 0 Gaps

Files that must be created before implementation (or in Wave 0 of the plan):

- [ ] `tests/unit/forecast/compute.test.ts` — covers FCT-01, FCT-02, FCT-03 edge cases
- [ ] `tests/unit/db/queries/forecastHeatmap.test.ts` — covers FCT-05 query shape
- [ ] `tests/unit/routes/picker-hybrid-heatmap.test.ts` — covers D-21, D-34 boundary
- [ ] `tests/unit/scripts/forecast-benchmark.test.ts` — covers FCT-04 output structure
- [ ] `tests/unit/forecast/` directory does not yet exist — Wave 0 creates it

---

## Information Architecture

### `/about` Forecasts Section (D-29)

[VERIFIED: `src/routes/about/+page.svelte` reviewed; existing "In Phase 3 we add forecast projections" placeholder paragraph at line 57-59 is the insertion point]

**Recommended structure:**

```html
<h2 id="forecasts">Forecasts</h2>

<p>
  When you select a future date in the trip picker, we show a statistical
  projection rather than historical actuals. Here is what those numbers mean
  and how to read them.
</p>

<h3>The model</h3>
<p>
  We use a seasonal-naïve baseline: for any target date, we look up all trips
  of the same species and trip type that occurred within ±7 calendar days of
  the same calendar slot in previous years. We compute the fleet-wide
  weighted average (SUM fish ÷ SUM anglers) and the empirical 10th and 90th
  percentile of per-trip per-angler ratios.
</p>
<p>
  This is not a machine-learning model. It is a summary of historical
  patterns for the same time of year. We label it as such.
</p>

<h3>Prediction intervals</h3>
<p>
  The [low–high] range shown is an 80% prediction interval — the range that
  contained 80% of actual trip outcomes in held-out validation. Wider bands
  mean the fishing is more variable or the sample size is small.
</p>

<h3>Sample size and "not enough history"</h3>
<p>
  When fewer than 5 historical trips match the target slot, we refuse to show
  a point estimate and display "not enough history" instead. Off-season slots
  (e.g., rockfish closure months, peak bluefin months before bluefin appeared
  in the dataset) will consistently show gray. This is honest, not a bug.
</p>

<h3>Horizon cap</h3>
<p>
  Forecasts are only available within 30 days of today. Beyond that, we show
  "horizon too far — historical data only." The rankings table below the
  heatmap always shows historical actuals regardless of target date.
</p>

<h3>Data gaps</h3>
<p>
  When our scraper missed days that would have contributed to the forecast
  window, we show "based on N of M days" next to the forecast. A forecast
  based on 42 of 56 expected days is less reliable than one based on 56 of 56.
</p>

<h3>Benchmark validation</h3>
<p>
  We ran this model on held-out data from [year]. The seasonal-naïve baseline
  achieved a MAE of [X.XX] fish/angler. The 80% prediction interval captured
  [XX%] of actual outcomes. Full methodology and results:
  <a href="[link-to-benchmark-md-or-inline]">Forecast benchmark report</a>.
</p>
```

**Inline summary vs link-only (Research Question 10):**

**Recommend inline summary** (top-line numbers embedded in text, with a link for full details). Rationale:
1. The user reading `/about#forecasts` is asking "should I trust this?" — an inline answer ("80% PI captured 78% of actuals") is more convincing than "see this other document."
2. The benchmark Markdown file lives in `.planning/phases/` and is not a public route — the link must either be a public route or the summary is embedded. Embedding is simpler and more user-facing.
3. A two-sentence summary with the key metrics (MAE + PI coverage) plus a link to the full report satisfies ROADMAP success criterion #2 ("baseline ships and is labeled as such") and is more user-trustworthy.

**Implementation note:** The benchmark script (`scripts/forecast-benchmark.ts`) should print or return the key metrics so the About page copy can be filled in after the script runs. The planner should create a `03-VALIDATION-BENCHMARK.md` placeholder with `[TBD after benchmark script runs]` tokens, which are filled during execution.

---

## Project Constraints (from CLAUDE.md)

These constraints are non-negotiable. The planner must verify every task against this checklist.

| Constraint | Implication for Phase 3 |
|------------|------------------------|
| **Forecast honesty (non-negotiable #3):** prediction intervals always, n shown, hard floor n<5, beat seasonal-naïve OR ship labeled, integers only, 30-day cap | All 7 FCT requirements; every forecast display surface |
| **Per-angler framing (non-negotiable #4):** derived boat-aggregate average, mandatory trip-type segmentation, inline disclaimer, `/about` link | `PerAnglerMetric kind='forecast'` inherits framing context; `/about#forecasts` anchor added |
| **DAL = only SQL surface (Architecture Rule + STO-03):** no SQL in `compute.ts`, no SQL in routes, no SQL in components | `compute.ts` MUST NOT import SQL; calls DAL functions only |
| **All dates via `src/lib/shared/dates.ts` (Architecture Rule + STO-04):** | `today()` in loader, `addDays()` for window edges; no `new Date()` except inside `dates.ts` |
| **Idempotent upsert (Architecture Rule):** | `forecasts.UNIQUE(forecast_date, species, trip_type)` + `ON CONFLICT DO UPDATE` |
| **Precompute aggregates, serve cheap reads (Architecture Rule):** | Nightly recompute; picker reads key-lookup from `forecasts` table |
| **No ML forecasts (Anti-feature):** | Seasonal-naïve only; no sklearn, no Prophet, no statsmodels |
| **No fake-precision decimals (Anti-feature):** | `Math.round()` at display; stored as REAL but never rendered with decimals |
| **No "ON FIRE" hype badges (Anti-feature):** | "forecast" label only; no emoji, no color-coded excitement copy |
| **Trip type domain language verbatim:** | `distinctTripTypes()` from DB; no normalization |
| **"per angler" framing** | See non-negotiable #4 above |

---

## Risks & Pitfalls

### Pitfall 1 (PITFALLS.md §3): Forecast Looks Confident But Is Statistical Noise

**Directly relevant to Phase 3.** Mitigation already locked in CONTEXT.md:
- D-04: empirical PI (distribution-free, honest on sparse data)
- D-07/D-08: n<5 → NULL storage + "not enough history" render
- D-23: integer rounding, no decimal inflation
- D-29: `/about` explanation

**Additional risk:** The PI property assertion noted in §Validation above — the weighted-mean point estimate is not guaranteed to fall inside the empirical 10/90 PI of per-trip ratios. This is not a bug but may surprise users who see "forecast: 3 fish/angler [8–15]" (point estimate below the 10th percentile). This can happen when a few very large trips dominate the SUM/SUM aggregate but the median trip produces a very different ratio. The planner should consider whether to document this discrepancy in `/about`, or whether to redefine the point estimate as the median of per-trip ratios for consistency with the PI. [ASSUMED: this trade-off has not been surfaced in CONTEXT.md discussions; flagging as open question for the planner]

### Pitfall 2 (PITFALLS.md §8): Data Gaps That Break Forecasts Silently

**Directly relevant.** The D-24 gap accounting (gap_days_present / gap_days_expected) is the mitigation. The implementation requires:
1. A new DAL function to query `scrape_runs` for a set of dates and count `{success, empty}` outcomes.
2. The compute module calling this function for each cell's input date set.
3. The tooltip formatter rendering "based on N of M days" when `gap_present < gap_expected`.

**Risk:** If the scrape_runs ledger is empty (fresh install that hasn't scraped yet), all gap_days_present = 0 and all cells would show "based on 0 of N days." The planner should handle this gracefully: when `gap_days_present = 0` AND `n_trips = 0`, the cell is legitimately "no data" (not a gap disclosure scenario). The gap note should only render when `n_trips >= 5` AND `gap_present < gap_expected`.

### Pitfall 3 (PITFALLS.md §Performance Traps): Live Computation in Request Path

Fully mitigated by precompute design (D-09/D-15). The picker route reads a key-lookup against the `forecasts` table — no aggregation in the request path. The risk is inadvertently reintroducing live computation if a developer adds a forecast computation to the loader. The DAL boundary makes this detectable: if `compute.ts` is ever imported from a route, that is an architecture violation.

### Pitfall 4 (PITFALLS.md §Technical Debt): Point Estimates Without Intervals

CONTEXT.md D-04 locks in PI from day one. No ship-then-add-intervals risk.

### Pitfall 5: Year-Boundary Window Wrap (SQL Correctness)

[ASSUMED: this is a non-obvious edge case]

The `strftime('%m-%d')` comparison in SQLite is lexicographic string comparison. For a forecast_date in early January:
- `windowStart = '12-25'` (7 days before 01-01)
- `windowEnd = '01-08'` (7 days after 01-01)
- The condition `strftime('%m-%d') BETWEEN '12-25' AND '01-08'` returns NO rows because no date string can be >= '12-25' AND <= '01-08' simultaneously.

**Mitigation:** Detect when `windowStart > windowEnd` (string comparison) and use: `strftime('%m-%d') >= '12-25' OR strftime('%m-%d') <= '01-08'`. This must be a tested edge case (see §Validation above).

### Pitfall 6: Today() Called Multiple Times in Load()

The hybrid heatmap composer calls `today()` in the loader. If called twice (once for the horizon check, once for the past/future split), a request that straddles midnight PT could produce an inconsistent split (one cell that should be "past" ends up as "future"). **Mitigation:** Call `today()` once, assign to `const todayPt = today()`, use `todayPt` everywhere in the function. This is documented in §Technical Approach §4 above.

### Pitfall 7: `baseline_value` Confusion

D-12 stores `baseline_value = value` for v1. The FCT-04 benchmark script reads `baseline_value` to perform comparison. If the benchmark script accidentally reads `value` instead of `baseline_value`, it will compare the model to itself (result: MAE = 0, coverage = 100%) — a misleading artifact. The planner must ensure the benchmark script queries `baseline_value` from the held-out recompute, not `value`.

### Pitfall 8: Phantom Coverage from Small Held-Out Set

If the held-out year has few valid cells (e.g., data only covers 6 months), the PI coverage statistic may be computed over <50 cells, making it statistically meaningless. The benchmark script should report the cell count (`N valid cells evaluated`) and warn if N < 100. [ASSUMED: threshold of 100 cells is reasonable for a meaningful coverage estimate]

---

## Standard Stack

Phase 3 introduces no new npm dependencies. All tools are already installed.

| Component | Library | Version | Status |
|-----------|---------|---------|--------|
| DB driver | better-sqlite3 | 12.9.x | Already installed — Phase 1 |
| Test runner | Vitest | installed | Already installed — Phase 2 |
| Date math | `src/lib/shared/dates.ts` | project module | Phase 1 |
| ECharts (heatmap tooltip extension) | echarts | 6.0.x | Already installed — Phase 2 |
| Script runner | tsx | via package.json | Already installed — Phase 1 |

**No new npm install step required for Phase 3.**

[VERIFIED: `package.json` and existing `scripts/backfill.ts` pattern confirmed; all referenced libraries present]

---

## Recommendations

1. **Percentile method:** Use JS-side computation (Option A). Sort the ratio array in JS, apply linear interpolation. Provide a unit-tested `percentile(sorted, p)` pure function in `src/lib/forecast/compute.ts`. Do not use SQLite NTILE.

2. **Transaction scope:** Single `db.transaction()` wrapping all ~3,720 UPSERT calls. Matches Phase 1 `upsertMany` pattern. WAL mode keeps concurrent `/picker` reads unblocked.

3. **Gap-year exclusion:** Exclude the year of `forecast_date` from M entirely. Only prior complete years contribute to gap_days_expected. Filter candidate dates with `year < parseInt(forecastDate.slice(0,4))`.

4. **Year-boundary wrap:** Implement and test the SQL OR-branch for forecast_dates in January (window spans Dec–Jan). This is a concrete bug if missed — the test in Wave 0 will catch it.

5. **`today()` called once:** In the picker `load()` function, assign `const todayPt = today()` at the top and use it for both the horizon check (D-10) and the past/future split (D-21). Never call `today()` twice in the same request.

6. **PI property note:** The point estimate (weighted fleet mean) is not guaranteed to fall inside the 10/90 percentile interval of per-trip ratios. Document this in `/about#forecasts` and in the test comments. It is not a bug.

7. **Benchmark inline summary:** Embed the two key numbers (MAE and PI coverage) directly in the `/about#forecasts` section text (not just a link), filled in from `03-VALIDATION-BENCHMARK.md` after the benchmark runs. The link to the full report is additive.

8. **Recency predicate — skip for v1:** Keep `distinctSpecies()` and `distinctTripTypes()` as plain DISTINCT queries. The n<5 floor handles stale labels gracefully.

9. **`forecasts-rebuild.ts` — full window only:** No `--from`/`--to` range mode. The operator use case is "rebuild everything now." Range mode adds flags with no clear benefit.

10. **Tooltip copy for forecast cell** (planner picks exact wording within D-22/D-23/D-24 constraints):
    - Suggested: `${date}<br/>forecast: ${v} fish/angler<br/>[${lo}–${hi} 80% PI] · n=${n} trips` + optional gap note
    - The word "forecast" must appear (D-25 verbatim label).
    - The band must be labeled "80% PI" (D-29).
    - Integer values only (D-23).

11. **Recompute failure handling:** The `recomputeForecasts` call in `_scrapeTick` must be wrapped in a non-fatal try/catch matching the existing SLA check pattern (lines 74-79 of `scheduler.ts`). A forecast recompute failure must NOT block `pingHealthcheck('success')`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | numpy "linear" interpolation method formula is correct; at n=2 p=0.1 behavior | Technical Approach §1 | Percentile values differ by ~5% from reference; unit test with reference vector catches this |
| A2 | Year-boundary wrap for January forecast dates requires OR-clause in SQL | Technical Approach §1, Pitfalls §5 | January forecasts silently return n=0, render gray; test catches this |
| A3 | 2025 is the most recent complete year with backfill data | Forecast Methodology §2 | Benchmark uses wrong held-out year; planner must verify dataset bounds |
| A4 | Weighted-mean point estimate may fall outside empirical 10/90 PI | Validation §7, Risks §1 | Tooltip shows "forecast: 3 [8–15]" — confusing but not incorrect; document in /about |
| A5 | PI coverage >75% is "calibrated" for this domain | Forecast Methodology §2 | Coverage of 60% would still ship (no gate blocks shipping); it would require a PI width adjustment note in /about |
| A6 | Gap_days_present = 0 with n_trips >= 5 is impossible in normal operation | Risks §2 | Could show misleading "based on 0 of M days" if scrape_runs was not populated for those dates; guard in tooltip logic |
| A7 | Benchmark needs N >= 100 valid cells for meaningful coverage estimate | Risks §8 | If fewer, coverage statistic is unreliable; report cell count and warn |

---

## Open Questions

1. **Point estimate vs PI consistency:** The weighted-mean fleet estimate is not guaranteed to fall inside the empirical 10/90 percentile of per-trip ratios. Should the point estimate be the median of per-trip ratios (consistent with PI) rather than SUM/SUM (consistent with Phase 2's D-08 ranking metric)?
   - What we know: D-01 locks in "weighted yield = SUM/SUM, same as Phase 2 D-08" for the forecast value.
   - What's unclear: whether a tooltip like "forecast: 3 fish/angler [8–15 80% PI]" would confuse or undermine trust.
   - Recommendation: keep SUM/SUM for consistency with Phase 2; document the discrepancy in `/about#forecasts`. The PI is a "range of per-trip outcomes you might expect" rather than "uncertainty around the point estimate."

2. **`scrape_runs` gap query performance:** Querying `scrape_runs` once per cell (3,720 cells × ~14 candidate dates each = ~52,080 date checks per recompute) could be slow if done naively. Recommend a single bulk query: pull all `(run_date, outcome)` pairs from `scrape_runs` into a JS `Map<string, ScrapeOutcome>` at the start of `recomputeForecasts`, then resolve each cell's gap counts from the map. This converts 3,720 DB queries into one.
   - What we know: `scrape_runs` has an index on `run_date`.
   - Recommendation: bulk-fetch into Map at start of recompute. One query for all gap data.

3. **`baseline_value` in benchmark:** D-12 says `baseline_value = value` for v1. The FCT-04 benchmark script is supposed to compare "shipped model" vs "fleet-mean baseline" — but both models compute `baseline_value` from their own result. Clarification needed: does the benchmark script write a *separate* compute run (not stored in `forecasts` table) for the fleet-mean variant, or does it read `baseline_value` from the stored rows?
   - Recommendation: the benchmark script runs both variants as pure in-memory computations (no `forecasts` table writes); it compares their outputs to held-out actuals. It does NOT need to write to `forecasts`. The `baseline_value` column in `forecasts` is for future audit, not for the FCT-04 benchmark.

---

## Environment Availability

Phase 3 is code/config-only changes with no new external dependencies. Step 2.6: SKIPPED (no external dependencies introduced; all tools verified present in Phase 1+2).

[VERIFIED: `package.json` scripts, `vitest.config.ts`, `better-sqlite3` in `node_modules` — all present]

---

## Sources

### Primary (HIGH confidence)
- Source code: `src/lib/db/migrations.ts` — confirmed schema, outcome enum, idempotent pattern
- Source code: `src/lib/db/catchReports.ts` — confirmed upsertMany pattern (transaction exemplar)
- Source code: `src/lib/db/scrapeRuns.ts` — confirmed outcome enum values, gap accounting semantics
- Source code: `src/lib/db/queries/tripPicker.ts` — confirmed D-08 (SUM/SUM), D-09 (n_trips COUNT DISTINCT)
- Source code: `src/lib/db/queries/browse.ts` — confirmed distinctSpecies/distinctTripTypes interface
- Source code: `src/lib/server/scheduler.ts` — confirmed `_scrapeTick` gate ordering, non-fatal try/catch SLA pattern
- Source code: `src/lib/shared/dates.ts` — confirmed `today()` PT correctness, `addDays()` availability
- Source code: `src/lib/components/PerAnglerMetric.svelte` — confirmed existing props/framing/formatting
- Source code: `src/routes/picker/+page.server.ts` — confirmed heatmap composition pattern, cache-control
- Source code: `src/routes/picker/heatmapOption.ts` — confirmed tooltip formatter structure, branch point
- Source code: `src/routes/about/+page.svelte` — confirmed insertion point for Forecasts section
- Source code: `tests/helpers/` — confirmed `openTestDb`, `seedBoat`, `seedTrip` availability
- Source code: `vitest.config.ts` — confirmed test runner config
- `.planning/phases/03-forecast-layer/03-CONTEXT.md` — all 34 decisions, constraints, module placement
- `.planning/research/PITFALLS.md` — §3, §8, §Performance Traps, §Technical Debt
- `.planning/research/ARCHITECTURE.md` — Pattern 3, Forecast Engine, Critical Contracts
- `.planning/research/STACK.md` — better-sqlite3 WAL, Vitest patterns

### Secondary (MEDIUM confidence — cross-referenced with source code patterns)
- [CITED: better-sqlite3 transaction API — `db.transaction(fn)` wraps synchronous function; confirmed by Phase 1 `upsertMany` usage]
- [CITED: SQLite WAL mode allows concurrent readers during write transactions — confirmed by ARCHITECTURE.md §Monolith trade-offs and Phase 1 D-06 schema decisions]

### Tertiary (LOW confidence — training knowledge, not session-verified)
- [ASSUMED: numpy "linear" interpolation formula — standard, but reference vector should be tested]
- [ASSUMED: PI coverage >75% = "calibrated" threshold for this domain]
- [ASSUMED: year-boundary SQL OR-branch behavior — logical analysis, needs unit test]

---

## RESEARCH COMPLETE

**Phase:** 03 — Forecast Layer
**Confidence:** HIGH

### Key Findings

1. **All 34 CONTEXT.md decisions are implementation-ready.** No ambiguity blocks planning. The three Claude's Discretion items (percentile method, transaction scope, gap-year inclusion) have clear recommended answers.

2. **JS-side percentile (Option A) is the correct choice.** Bounded inputs (≤1000 ratios), testable pure function, standard linear interpolation. SQLite NTILE would give approximate results and is harder to test.

3. **Single-transaction UPSERT is the correct choice.** Matches Phase 1 exemplar, WAL keeps readers unblocked, rollback semantics clean.

4. **Year-boundary wrap (January forecast dates) is a concrete implementation hazard** — `strftime('%m-%d') BETWEEN '12-25' AND '01-08'` returns zero rows. Must be handled with an OR-branch and tested.

5. **The test infrastructure is fully in place.** `openTestDb`, `seedTrip`, `seedTripsBatch` helpers extend directly. Four new test files needed (Wave 0 gaps); no new test framework installation required.

6. **The point estimate (SUM/SUM) may fall outside the empirical 10/90 PI** for asymmetric distributions. This is expected behavior, not a bug, but must be documented in `/about#forecasts` and in test comments.

7. **Benchmark inline summary recommended** — embed MAE and PI coverage numbers directly in `/about#forecasts` text; link to full `03-VALIDATION-BENCHMARK.md` for methodology detail.

### File Created

`.planning/phases/03-forecast-layer/03-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | No new dependencies; all libraries verified present in codebase |
| Architecture patterns | HIGH | All patterns extend directly from Phase 1+2 verified source code |
| Forecast math | HIGH | Standard weighted-yield math; percentile formula is standard |
| SQL edge cases (year-wrap) | MEDIUM | Logical analysis; needs unit test to confirm |
| Benchmark methodology | MEDIUM | Procedure prescribed by D-19; held-out year depends on actual dataset |
| PI calibration thresholds | LOW | Training knowledge; ranges reported from statistics literature |

### Open Questions

- Point estimate vs PI consistency: SUM/SUM value may fall outside 10/90 PI of per-trip ratios. Document in `/about` or change to median? (Recommendation: keep SUM/SUM + document.)
- Bulk gap-query strategy: pull all `scrape_runs` into a Map at start of recompute to avoid 3,720 individual DB queries. (Recommendation: yes, bulk-fetch.)
- Benchmark script variant separation: fleet-mean baseline computed in-memory (not written to `forecasts` table). (Recommendation: yes, in-memory only.)

### Ready for Planning

Research complete. Planner can now create PLAN.md files for Phase 3.
