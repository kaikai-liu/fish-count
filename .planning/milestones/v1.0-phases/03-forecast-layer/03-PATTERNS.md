# Phase 3: Forecast Layer — Pattern Map

**Mapped:** 2026-04-26
**Files analyzed:** 14 (8 new, 6 modified)
**Analogs found:** 14 / 14

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/forecast/compute.ts` | service (pure-math) | transform | `src/lib/scraper/parser.ts` | exact — pure-function module, no SQL, fully testable |
| `src/lib/db/forecasts.ts` | DAL repository | CRUD | `src/lib/db/catchReports.ts` | exact — same upsertMany + prepared-statement pattern |
| `src/lib/db/queries/forecastHeatmap.ts` | DAL read query | request-response | `src/lib/db/queries/tripPicker.ts` `heatmapForQuery` | exact — same `{date, value, n}` shape contract |
| `scripts/forecasts-rebuild.ts` | utility / CLI | batch | `scripts/backfill.ts` | exact — same tsx + parseArgs + getDb + log discipline |
| `scripts/forecast-benchmark.ts` | utility / CLI | batch | `scripts/backfill.ts` + `scripts/seed-dev-db.ts` | role-match — same tsx/parseArgs/main-export pattern; writes Markdown artifact |
| `src/lib/db/migrations.ts` (modify) | config | CRUD | self (append to `SCHEMA_SQL`) | self-reference — same IF NOT EXISTS DDL block pattern |
| `src/lib/server/scheduler.ts` (modify) | service | event-driven | self (`_scrapeTick` non-fatal try/catch at line 75-79) | self-reference — same SLA non-fatal pattern to copy |
| `scripts/backfill.ts` (modify) | utility / CLI | batch | self (final step before `return 0`) | self-reference — append before existing `return 0` |
| `src/lib/components/PerAnglerMetric.svelte` (modify) | component | request-response | self (existing `formatted` derived + `showLowData` branches) | self-reference — extend existing prop/branch pattern |
| `src/routes/picker/+page.server.ts` (modify) | route loader | request-response | self (lines 97-113 gap-fill loop) | self-reference — extend heatmap composer with past/future split |
| `src/routes/picker/heatmapOption.ts` (modify) | utility | transform | self (tooltip formatter lines 63-73) | self-reference — branch on pi_low/pi_high presence |
| `src/routes/about/+page.svelte` (modify) | component | request-response | self (existing `<h2>` + `<p>` section pattern at lines 51-60) | self-reference — append new `<h2 id="forecasts">` section |
| `src/lib/copy/metrics.ts` (modify) | utility / config | — | self (existing constant exports lines 17-33) | self-reference — append `FORECAST_LABEL` constant |
| `tests/forecast/*.test.ts` | test | — | `tests/unit/db/queries/tripPicker.test.ts` + `tests/helpers/seedTestDb.ts` | exact — same openTestDb + seedBoat + seedTrip fixture pattern |

---

## Pattern Assignments

### `src/lib/forecast/compute.ts` (service, transform)

**Analog:** `src/lib/scraper/parser.ts`

**Purity contract** (parser.ts lines 1-10):
```typescript
// Pure HTML → CatchRow[] transform. No I/O. No DB. No network.
//
// MUST NEVER throw. Even on empty string, garbage HTML, or unexpected shapes.
```
Apply verbatim: `compute.ts` must be pure math (no I/O, no DB module-scope imports, no throws). DAL handles arrive as function parameters. Every public function is synchronous.

**Module header pattern** (parser.ts lines 39-41):
```typescript
import * as cheerio from 'cheerio';
import { CatchRowSchema, type CatchRow } from './schema.ts';
```
Analog for `compute.ts` (relative imports only at top level; DAL injected as parameter):
```typescript
import type Database from 'better-sqlite3';
import { today, addDays } from '$lib/shared/dates';
// NO: import { getDb } from '$lib/db/client'  — db handle must be a parameter
```

**Core pure-function signature pattern** (parser.ts lines 48-50):
```typescript
export function parsePage(html: string): { rows: CatchRow[]; failures: ParseFailure[] } {
  const rows: CatchRow[] = [];
  const failures: ParseFailure[] = [];
```
Analog for `compute.ts`:
```typescript
export function recomputeForecasts(db: Database.Database, opts?: { today?: string }): void
export function computeCell(input: CellInput): CellResult
export function percentile(sorted: number[], p: number): number
```

**Error handling — non-throwing contract** (parser.ts lines 53-60):
```typescript
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    return { rows, failures };
  }
```
`computeCell` must return a null-value result (not throw) when input is empty or angler_count sums to zero. Never throw from within the recompute loop — log and continue to the next cell.

**Percentile helper** (from RESEARCH.md §Technical Approach §1, lines 156-167):
```typescript
// Standard interpolating percentile (numpy "linear" method).
// Input MUST be pre-sorted ascending.
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

**Logger correlation pattern** (scheduler.ts lines 47-50):
```typescript
const tickLogger = logger.child({
  job: 'nightly-scrape',
  jobId: crypto.randomUUID()
});
```
`recomputeForecasts` uses `logger.child({ job: 'forecast-recompute', jobId: crypto.randomUUID() })`.

---

### `src/lib/db/forecasts.ts` (DAL repository, CRUD)

**Analog:** `src/lib/db/catchReports.ts`

**Module header pattern** (catchReports.ts lines 1-8):
```typescript
// src/lib/db/catchReports.ts — DAL repository for the catch_reports table.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// D-06 + ING-04: idempotent upsert on (source_date, boat_id, trip_type, species).
import type Database from 'better-sqlite3';
```

**Row interface pattern** (catchReports.ts lines 10-19):
```typescript
export interface CatchReportRow {
  source_date: string; // YYYY-MM-DD (produced by src/lib/shared/dates.ts)
  boat_id: number;
  ...
}
```
Analog for `forecasts.ts`:
```typescript
export interface ForecastRow {
  forecast_date: string; // YYYY-MM-DD PT
  species: string;
  trip_type: string;
  value: number | null;           // NULL when n_trips < 5
  pi_low: number | null;
  pi_high: number | null;
  n_trips: number;
  baseline_value: number | null;
  gap_days_present: number;
  gap_days_expected: number;
  computed_at: string;            // ISO-8601 timestamp
}
```

**`upsertMany` transaction pattern** (catchReports.ts lines 28-47 — the exact model for forecasts.ts):
```typescript
export function upsertMany(db: Database.Database, rows: CatchReportRow[]): number {
  if (rows.length === 0) return 0;
  const stmt = db.prepare(
    `INSERT INTO catch_reports
       (source_date, boat_id, landing_id, trip_type, species,
        angler_count, species_count, scraped_at)
     VALUES (@source_date, @boat_id, @landing_id, @trip_type, @species,
             @angler_count, @species_count, @scraped_at)
     ON CONFLICT(source_date, boat_id, trip_type, species) DO UPDATE SET
       landing_id    = excluded.landing_id,
       angler_count  = excluded.angler_count,
       species_count = excluded.species_count,
       scraped_at    = excluded.scraped_at`
  );
  const tx = db.transaction((items: CatchReportRow[]) => {
    for (const r of items) stmt.run(r);
  });
  tx(rows);
  return rows.length;
}
```
`forecasts.ts` `upsertMany` uses this EXACT pattern with the `forecasts` table and its UNIQUE key `(forecast_date, species, trip_type)`. RESEARCH.md §2 (lines 243-267) has the adapted version ready.

**Read query pattern** (catchReports.ts lines 62-72):
```typescript
export function getByDate(db: Database.Database, date: string): CatchReportRow[] {
  return db
    .prepare(
      `SELECT source_date, boat_id, ...
         FROM catch_reports WHERE source_date = ?
         ORDER BY boat_id, trip_type, species`
    )
    .all(date) as CatchReportRow[];
}
```
`getCellsInRange` and `pruneBeforeHorizon` use this pattern (`.prepare(...).all(args)` cast to typed interface).

---

### `src/lib/db/queries/forecastHeatmap.ts` (DAL read query, request-response)

**Analog:** `src/lib/db/queries/tripPicker.ts` `heatmapForQuery` (lines 72-115)

**Interface pattern** (tripPicker.ts lines 72-76):
```typescript
export interface HeatmapCell {
  date: string;
  value: number | null;
  n: number;
}
```
`ForecastHeatmapCell` extends this shape (additive, Phase 2 D-15 shape is preserved):
```typescript
export interface ForecastHeatmapCell {
  date: string;
  value: number | null;   // NULL when n_trips < 5; Phase 2 D-15 contract
  n: number;              // Phase 2 D-15 contract
  pi_low?: number | null;
  pi_high?: number | null;
  gap_present?: number;
  gap_expected?: number;
}
```

**Args interface pattern** (tripPicker.ts lines 78-83):
```typescript
export interface HeatmapArgs {
  fromDate: string;
  toDate: string;
  species: string;
  tripType: string;
}
```
`ForecastHeatmapArgs` is identical shape — same field names, same YYYY-MM-DD strings.

**Query function pattern** (tripPicker.ts lines 96-115):
```typescript
export function heatmapForQuery(db: Database.Database, args: HeatmapArgs): HeatmapCell[] {
  return db
    .prepare(
      `SELECT cr.source_date AS date,
              SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS value,
              COUNT(DISTINCT cr.source_date || '|' || cr.trip_type)          AS n
         FROM catch_reports cr
        WHERE cr.species   = @species
          AND cr.trip_type = @tripType
          AND cr.source_date BETWEEN @fromDate AND @toDate
        GROUP BY cr.source_date
        ORDER BY cr.source_date ASC`
    )
    .all({
      species: args.species,
      tripType: args.tripType,
      fromDate: args.fromDate,
      toDate: args.toDate
    }) as HeatmapCell[];
}
```
`forecastHeatmapForQuery` replaces the `catch_reports` JOIN with a simple `SELECT` from `forecasts` (no JOIN needed — forecasts table already has the aggregated values):
```typescript
export function forecastHeatmapForQuery(db: Database.Database, args: ForecastHeatmapArgs): ForecastHeatmapCell[] {
  return db
    .prepare(
      `SELECT forecast_date AS date,
              value,
              n_trips       AS n,
              pi_low,
              pi_high,
              gap_days_present  AS gap_present,
              gap_days_expected AS gap_expected
         FROM forecasts
        WHERE species    = @species
          AND trip_type  = @tripType
          AND forecast_date BETWEEN @fromDate AND @toDate
        ORDER BY forecast_date ASC`
    )
    .all({ species: args.species, tripType: args.tripType,
           fromDate: args.fromDate, toDate: args.toDate }) as ForecastHeatmapCell[];
}
```

---

### `scripts/forecasts-rebuild.ts` (utility / CLI, batch)

**Analog:** `scripts/backfill.ts`

**Shebang + header comment pattern** (backfill.ts lines 1-31):
```typescript
#!/usr/bin/env tsx
// scripts/backfill.ts — FishCount resumable historical backfill CLI.
// ...
// NO SvelteKit boot: relative `.ts` imports only at this top-level file per
// 01-PATTERNS.md §SvelteKit-Alias Boundary (lines 706-727).
// NO SQL: DAL boundary (CLAUDE.md Architecture Rules + STO-03).

import { parseArgs } from 'node:util';
import { getDb, closeDb } from '../src/lib/db/client.ts';
```

**`main()` export + exit code pattern** (backfill.ts lines 56-139):
```typescript
export async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({ options: { ... }, strict: true, allowPositionals: false });
  } catch (err) {
    console.error(`[backfill] arg parse error: ${(err as Error).message}`);
    return 2;
  }
  // ... validate args ...
  const db = getDb();
  // ... do work ...
  return 0;
}
```
`forecasts-rebuild.ts` uses the same skeleton. Since it does a full rebuild (no flags needed per Claude's Discretion in CONTEXT.md), `parseArgs` only handles `--quiet` / `--help`.

**Self-invocation guard pattern** (backfill.ts lines 144-174):
```typescript
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === new URL(`file://${entry}`).href;
  } catch {
    return import.meta.url.endsWith(entry);
  }
})();

if (invokedDirectly) {
  main()
    .then((code) => {
      try { closeDb(); } catch { /* ignore */ }
      process.exit(code);
    })
    .catch((err: unknown) => {
      console.error(`[forecasts-rebuild] fatal: ${(err as Error).message}`);
      try { closeDb(); } catch { /* ignore */ }
      process.exit(1);
    });
}
```
Copy verbatim; update prefix strings to `[forecasts-rebuild]`.

**Log discipline pattern** (backfill.ts lines 43-44, 118-120):
```typescript
function log(msg: string, quiet: boolean): void {
  if (!quiet) process.stdout.write(msg + '\n');
}
// ...
log(`[forecasts-rebuild] rebuilding forecasts window ${fromDate}..${toDate}`, quiet);
```

---

### `scripts/forecast-benchmark.ts` (utility / CLI, batch — one-time artifact)

**Analog:** `scripts/backfill.ts` (shell pattern) + `scripts/seed-dev-db.ts` (file-write + gate pattern)

**Same tsx + parseArgs + main-export + self-invocation guard** as `backfill.ts` — all patterns above apply.

**Production gate pattern** (seed-dev-db.ts lines 44-58 — adapt for benchmark: refuse if no data):
```typescript
function gatePass(): { ok: boolean; reason?: string } {
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, reason: 'NODE_ENV is production — refusing to seed' };
  }
  // ...
  return { ok: true };
}
```
`forecast-benchmark.ts` gates on DB being non-empty (needs historical data) rather than production env.

**File write for Markdown artifact** — use `import { writeFileSync } from 'node:fs'`. No existing in-codebase analog; standard Node pattern. Output path: `.planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md`.

**Held-out year query** — reads from `catch_reports` where `source_date < '2025-01-01'` to compute forecasts, then compares to `catch_reports` rows from 2025. No new DAL function needed; uses existing `getRatiosForWindow` from `catchReports.ts` (same function `computeCell` calls).

---

### `src/lib/db/migrations.ts` (append DDL to `SCHEMA_SQL`)

**Self-analog:** existing `SCHEMA_SQL` constant (migrations.ts lines 16-89)

**DDL block pattern** (migrations.ts lines 40-57):
```typescript
  -- D-05: catch_reports — trip_type stored VERBATIM (CLAUDE.md domain language rule).
  CREATE TABLE IF NOT EXISTS catch_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_date TEXT NOT NULL,
    ...
  );

  -- D-06: UNIQUE index doubles as the idempotent-upsert key (ING-04).
  CREATE UNIQUE INDEX IF NOT EXISTS idx_catch_unique
    ON catch_reports (source_date, boat_id, trip_type, species);
  CREATE INDEX IF NOT EXISTS idx_catch_date_species
    ON catch_reports (source_date, species);
```
Append the `forecasts` DDL (D-11 schema verbatim from CONTEXT.md) with the same `IF NOT EXISTS` safety. Two indexes: `idx_forecasts_unique` (UNIQUE on `forecast_date, species, trip_type`) and `idx_forecasts_range`. No separate migration file — same `SCHEMA_SQL` constant.

---

### `src/lib/server/scheduler.ts` — append `recomputeForecasts` call in `_scrapeTick`

**Self-analog:** existing non-fatal SLA try/catch block (scheduler.ts lines 73-79):
```typescript
    // ING-07: row-count SLA check (D-23/D-24/D-25). Scheduler-only entry point;
    // checkSlaAndAlert short-circuits internally on non-success outcomes. Wrap
    // in a non-fatal try/catch so a Resend outage (or any SLA-side error) never
    // blocks pingHealthcheck('success') — OPS-04 dead-man's switch owns the
    // higher-level "is ingestion alive" signal; SLA is a secondary tripwire.
    try {
      await checkSlaAndAlert(date, result.outcome);
    } catch (err) {
      tickLogger.error({ err, msg: 'sla_check_failed_non_fatal' });
    }
```

The Phase 3 insertion point is AFTER this SLA block and BEFORE `pingHealthcheck(result.outcome === 'killed' ? 'fail' : 'success')` (line 86). Gate on D-14: only run when `result.outcome` is `'success'` or `'empty'`. Copy the non-fatal try/catch wrapper exactly:
```typescript
    // Phase 3: FCT-06 — recompute forecasts after each successful scrape.
    // Non-fatal: a recompute failure must never block pingHealthcheck('success').
    if (result.outcome === 'success' || result.outcome === 'empty') {
      try {
        recomputeForecasts(getDb());
        tickLogger.info({ msg: 'forecast_recompute_complete' });
      } catch (err) {
        tickLogger.error({ err, msg: 'forecast_recompute_failed_non_fatal' });
      }
    }
```

**Import addition** — add to the existing import block at top of file (lines 20-26):
```typescript
import { recomputeForecasts } from '$lib/forecast/compute';
import { getDb } from '$lib/db/client';
```

---

### `scripts/backfill.ts` — append final `recomputeForecasts` call (D-17)

**Self-analog:** lines 134-138 (completion log before `return 0`):
```typescript
  const durationMin = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(
    `[backfill] complete: ${dates.length} dates attempted, ${total} total rows, ${durationMin} min`
  );
  return 0;
```

Insert the recompute call BEFORE the completion log:
```typescript
  // D-17: recompute forecasts once at end of backfill run.
  try {
    recomputeForecasts(db);
    log('[backfill] forecast recompute complete', quiet);
  } catch (err) {
    console.error(`[backfill] forecast recompute failed (non-fatal): ${(err as Error).message}`);
  }
```

**Import addition** at top of backfill.ts (after existing imports line 36):
```typescript
import { recomputeForecasts } from '../src/lib/forecast/compute.ts';
```

---

### `src/lib/components/PerAnglerMetric.svelte` (extend with `kind` + `pi` props)

**Self-analog:** existing prop destructure + `formatted` derived + branch pattern (lines 1-47)

**Existing props pattern** (lines 7-12):
```typescript
  let {
    value,
    nTrips,
    ctx = 'row',
    showFraming
  }: { value: number | null; nTrips: number; ctx?: Ctx; showFraming?: boolean } = $props();
```
D-25 requires adding `kind?: 'historical' | 'forecast'` (default `'historical'`) and `pi?: { low: number; high: number }`. Preserve all existing prop names — existing callers must remain unchanged.

**Existing `formatted` derived branch** (lines 20-25):
```typescript
  const formatted = $derived.by(() => {
    if (value === null || Number.isNaN(value as number) || nTrips === 0) return '—';
    if ((value as number) >= 10) return String(Math.round(value as number));
    const fixed = (value as number).toFixed(1);
    return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
  });
```
Phase 3 extension: when `kind === 'forecast'` AND `value === null`, return `'not enough history'` (D-08 — exact string). When `kind === 'forecast'` AND `value !== null`, always `Math.round(value)` (integer-only, D-23). The historical branch is unchanged.

**`showLowData` pattern** (line 27):
```typescript
  const showLowData = $derived(nTrips > 0 && nTrips < 5);
```
For `kind === 'forecast'`, `showLowData` becomes `false` — the `not enough history` branch replaces the low-data badge entirely.

**Template section pattern** (lines 36-47):
```typescript
<span class="inline-flex flex-wrap items-baseline gap-2">
  <span class="tabular-nums font-semibold {sizeClass}">{formatted}</span>
  {#if !isUnknown}
    <span class="text-text-muted text-sm">{FISH_PER_ANGLER_AXIS}</span>
    {#if showLowData}
      <span class="text-text-muted">·</span>
      <LowDataBadge />
    {/if}
    <span class="text-text-muted">·</span>
    <span class="text-text-muted text-sm tabular-nums">n={nTrips} {tripLabel}</span>
  {/if}
</span>
```
Phase 3 adds forecast-specific branches inside this `<span>`:
- After the value `<span>`, when `kind === 'forecast'` AND `formatted !== 'not enough history'`, render inline `forecast` label (from `FORECAST_LABEL` constant in `metrics.ts`).
- When `pi` prop is present AND `kind === 'forecast'`, render `[{Math.round(pi.low)}–{Math.round(pi.high)} 80% PI]` after the label.
- The `/about#forecasts` link for D-30 is added in the framing block (lines 48-53), not the value block.

**Framing block pattern** (lines 48-53):
```typescript
{#if renderFraming && !isUnknown}
  <small class="block text-sm text-(--color-text-muted) mt-1">
    derived boat-aggregate average, not individual angler —
    <a href="/about" class="text-(--color-accent) underline">About the data</a>
  </small>
{/if}
```
For `kind === 'forecast'`, the link target changes to `/about#forecasts` (D-30). The "derived boat-aggregate average" framing wording is preserved — forecast cells inherit non-negotiable #4.

---

### `src/routes/picker/+page.server.ts` (extend load() with hybrid heatmap + horizon gate)

**Self-analog:** existing heatmap composition block (lines 94-113)

**Existing `heatmapStart` / `heatmapEnd` pattern** (lines 94-96):
```typescript
  const heatmapStart = filters.rangeMode && filters.fromDate ? filters.fromDate : filters.date;
  const heatmapEnd = addDays(heatmapStart, 29);
```

**Horizon gate** (D-10) inserts BEFORE computing `heatmapEnd`:
```typescript
  // D-10: >30-day horizon → render message, skip heatmap computation.
  const todayPt = today();
  const horizonTooFar = filters.date > addDays(todayPt, 30);
  if (horizonTooFar) {
    // Rankings still computed (historical data). Heatmap area renders message.
    return { ..., heatmap: null, heatmapHorizonMessage: 'horizon too far — historical data only' };
  }
```

**Existing gap-fill loop** (lines 107-113 — the model for the hybrid composer):
```typescript
  const presentMap = new Map<string, HeatmapCell>(presentCells.map((c) => [c.date, c]));
  const heatmap: HeatmapCell[] = [];
  for (let i = 0; i < 30; i++) {
    const d = addDays(heatmapStart, i);
    const found = presentMap.get(d);
    heatmap.push(found ?? { date: d, value: null, n: 0 });
  }
```

Phase 3 hybrid composer replaces `presentCells` sourcing with two separate queries split on `today()`, then merges into one 30-cell array:
```typescript
  const pastCells = heatmapForQuery(db, { ...args, toDate: addDays(todayPt, -1) });
  const futureCells = forecastHeatmapForQuery(db, { ...args, fromDate: todayPt });
  const presentMap = new Map([
    ...pastCells.map((c) => [c.date, c]),
    ...futureCells.map((c) => [c.date, c])
  ]);
  // gap-fill loop unchanged
```

**Import additions** — add to existing import block (lines 18-29):
```typescript
import { forecastHeatmapForQuery, type ForecastHeatmapCell } from '$lib/db/queries/forecastHeatmap';
```

The return type of `heatmap` widens from `HeatmapCell[] | null` to `(HeatmapCell | ForecastHeatmapCell)[] | null` — or define a union `HeatmapCellUnion` type locally.

---

### `src/routes/picker/heatmapOption.ts` (extend tooltip formatter with forecast branch)

**Self-analog:** existing tooltip formatter (lines 63-73)

**Existing tooltip formatter** (lines 64-73):
```typescript
      formatter: (params: any) => {
        const date: string = params.value[0];
        const cell = cells.find((c) => c.date === date);
        if (!cell) return '';
        if (cell.n < 5) {
          return `${cell.date}<br/>low data — n=${cell.n} ${cell.n === 1 ? 'trip' : 'trips'}`;
        }
        return `${cell.date}<br/>${(cell.value ?? 0).toFixed(1)} ${FISH_PER_ANGLER_TOOLTIP_UNIT}<br/>n=${cell.n} ${cell.n === 1 ? 'trip' : 'trips'}`;
      }
```

Phase 3 extension — branch on `pi_low`/`pi_high` presence (D-22):
```typescript
      formatter: (params: any) => {
        const date: string = params.value[0];
        const cell = cells.find((c) => c.date === date);
        if (!cell) return '';
        const isForecast = 'pi_low' in cell;  // additive field = forecast cell
        if (cell.n < 5) {
          // D-08: exact wording for n<5
          return `${cell.date}<br/>not enough history — n=${cell.n} ${cell.n === 1 ? 'trip' : 'trips'}`;
        }
        if (isForecast && cell.value !== null) {
          const v = Math.round(cell.value);
          const lo = cell.pi_low != null ? Math.round(cell.pi_low) : null;
          const hi = cell.pi_high != null ? Math.round(cell.pi_high) : null;
          const piStr = lo != null && hi != null ? ` [${lo}–${hi} 80% PI]` : '';
          const gapStr = (cell.gap_present != null && cell.gap_expected != null &&
                          cell.gap_present < cell.gap_expected)
            ? `<br/>based on ${cell.gap_present} of ${cell.gap_expected} days`
            : '';
          return `${cell.date}<br/>forecast: ${v} ${FISH_PER_ANGLER_TOOLTIP_UNIT}${piStr}<br/>n=${cell.n} trips${gapStr}`;
        }
        // Historical actuals branch — unchanged
        return `${cell.date}<br/>${(cell.value ?? 0).toFixed(1)} ${FISH_PER_ANGLER_TOOLTIP_UNIT}<br/>n=${cell.n} ${cell.n === 1 ? 'trip' : 'trips'}`;
      }
```

**Cells type update** — `buildHeatmapOption` signature widens:
```typescript
// Before (line 42-45):
export function buildHeatmapOption(cells: HeatmapCell[], range: { from: string; to: string }): EChartsOption

// After:
import type { ForecastHeatmapCell } from '$lib/db/queries/forecastHeatmap';
type AnyHeatmapCell = HeatmapCell | ForecastHeatmapCell;
export function buildHeatmapOption(cells: AnyHeatmapCell[], range: { from: string; to: string }): EChartsOption
```

---

### `src/routes/about/+page.svelte` (append Forecasts section)

**Self-analog:** existing section pattern (lines 51-60):
```svelte
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
```

Phase 3 replaces the "In Phase 3 we add forecast projections..." paragraph inside the "Sample size" section AND appends a new `<h2 id="forecasts">` section after the existing "Data gaps" section (after line 68). The `id="forecasts"` attribute is required by D-30 (`/about#forecasts` anchor link from `PerAnglerMetric`):
```svelte
  <h2 id="forecasts" class="mb-2 mt-6 text-xl font-semibold">Forecasts</h2>
  <p class="mb-4">
    ...seasonal-naïve baseline explanation (D-29 bullet 1)...
  </p>
  <p class="mb-4">
    ...prediction interval explanation (D-29 bullet 2)...
  </p>
  ...etc per D-29 bullets 3-6...
```

**Lint allowlist** — `about/+page.svelte` is already on the per-angler-discipline lint allowlist (file comment line 6). No change needed.

---

### `src/lib/copy/metrics.ts` (append `FORECAST_LABEL` constant)

**Self-analog:** existing constant exports (lines 16-33):
```typescript
/** ECharts yAxis.name on every per-angler chart (line + heatmap legend unit). */
export const FISH_PER_ANGLER_AXIS = 'fish/angler';
```

Phase 3 appends (only if the string `'forecast'` appears in more than one place):
```typescript
/** Inline kind label for forecast cells in PerAnglerMetric and heatmap tooltip.
 *  D-25 "Specific Ideas": verbatim "forecast" — never "prediction" or "projection". */
export const FORECAST_LABEL = 'forecast';
```

This constant is consumed by `PerAnglerMetric.svelte` and `heatmapOption.ts`. If it ends up used in only one place, inline it instead of a constant — planner decides.

---

### `tests/forecast/*.test.ts` (unit + integration tests)

**Primary analog:** `tests/unit/db/queries/tripPicker.test.ts` (full file read above)
**Secondary analog:** `tests/unit/db/catchReports.test.ts` (upsertMany idempotency tests)
**Helpers:** `tests/helpers/in-memory-db.ts` + `tests/helpers/seedTestDb.ts`

**Test file header pattern** (tripPicker.test.ts lines 1-8):
```typescript
// tests/unit/db/queries/tripPicker.test.ts
// Unit tests for src/lib/db/queries/tripPicker.ts
// Critical: verify weighted-yield math (D-08) and n_trips semantics (D-09).
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../../helpers/in-memory-db';
import { seedBoat, seedTrip } from '../../../helpers/seedTestDb';
```

**In-memory DB fixture pattern** (tripPicker.test.ts lines 10-14):
```typescript
describe('tripPicker.rankBoatsForQuery', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) { db.close(); db = null; }
  });
```
Copy `afterEach` pattern verbatim — always close the `:memory:` DB to prevent test bleed.

**Static fixture preference** (D-32 — matches existing test style):
```typescript
  it('D-01 seasonal-naïve weighted yield: SUM/SUM across matched window', () => {
    db = openTestDb();
    const { boatId, landingId } = seedBoat(db, { boatName: 'Grande', landingName: 'Point Loma Sportfishing' });
    // Seed 5 prior-year trips in the same ±7-day window
    seedTrip(db, { boatId, landingId, date: '2024-05-10', tripType: 'Full Day', species: 'yellowtail', anglers: 20, count: 40 });
    // ... assert value, pi_low, pi_high, n_trips, gap_days_present
  });
```

**`seedTestDb` helpers already support forecast tests** — `seedTrip` seeds `catch_reports` rows which are the input to `computeCell`. No new seed helper needed for the unit tests.

**`today()` mock pattern for D-34** (picker.test.ts lines 27-29 uses env isolation; for date mocking use `vi.mock`):
```typescript
// In heatmap-composer test (D-34):
import { vi } from 'vitest';
vi.mock('$lib/shared/dates', () => ({
  today: vi.fn().mockReturnValue('2026-05-15'),
  addDays: (await vi.importActual('$lib/shared/dates')).addDays,
}));
```

**Integration test pattern** (picker.test.ts lines 15-55 — mkdtempSync isolation):
```typescript
describe('picker load: hybrid heatmap composer (D-34)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fc-forecast-'));
    process.env.DB_PATH = join(tmp, 'test.sqlite3');
    vi.resetModules();
  });
  afterEach(async () => {
    // closeDb + rmSync + restoreAllMocks — exact pattern from picker.test.ts lines 33-46
  });
});
```

---

## Shared Patterns

### DAL Boundary (applies to all new files)
**Source:** `src/lib/db/catchReports.ts` line 5 + CLAUDE.md Architecture Rules
**Apply to:** `src/lib/forecast/compute.ts`, `src/routes/picker/+page.server.ts`, all test files
```typescript
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
// compute.ts MUST NOT import getDb() at module scope or call db.prepare() directly.
// DB handle arrives as a parameter: recomputeForecasts(db: Database.Database)
```

### Date Production (applies to all new files)
**Source:** `src/lib/shared/dates.ts` lines 1-3
**Apply to:** `src/lib/forecast/compute.ts`, `src/lib/db/forecasts.ts`, `scripts/forecasts-rebuild.ts`, `src/routes/picker/+page.server.ts`
```typescript
// All dates are YYYY-MM-DD in America/Los_Angeles (CLAUDE.md Architecture Rules).
// This module is the SOLE producer of date strings in the entire project.
import { today, addDays } from '$lib/shared/dates';
// Scripts use relative imports:
import { today, addDays } from '../src/lib/shared/dates.ts';
```

### Idempotent UPSERT (applies to forecasts.ts)
**Source:** `src/lib/db/catchReports.ts` lines 28-47
**Apply to:** `src/lib/db/forecasts.ts` `upsertMany`
```typescript
// ON CONFLICT(forecast_date, species, trip_type) DO UPDATE SET ...
// UNIQUE index in migrations.ts is the enforcement mechanism.
// Running recomputeForecasts twice in a row produces identical DB state.
```

### Non-Fatal Try/Catch (applies to scheduler.ts append + backfill.ts append)
**Source:** `src/lib/server/scheduler.ts` lines 73-79
**Apply to:** scheduler.ts Phase 3 addition, backfill.ts Phase 3 addition
```typescript
    try {
      await checkSlaAndAlert(date, result.outcome);
    } catch (err) {
      tickLogger.error({ err, msg: 'sla_check_failed_non_fatal' });
    }
```
`recomputeForecasts` is wrapped in the identical pattern. A recompute failure must never surface to `pingHealthcheck('fail')`.

### Integer Rounding for Forecast Display (applies to PerAnglerMetric + heatmapOption)
**Source:** CONTEXT.md D-23 + CLAUDE.md non-negotiable #3
**Apply to:** `PerAnglerMetric.svelte` forecast branch, `heatmapOption.ts` forecast tooltip branch
```typescript
// Forecast values stored as REAL; rounded to integer at display time.
// Both point estimate AND PI bounds use Math.round() — no decimals ever.
Math.round(value)    // point estimate
Math.round(pi.low)   // PI lower bound
Math.round(pi.high)  // PI upper bound
```

### Verbatim UI Copy Strings (applies to heatmapOption.ts + PerAnglerMetric.svelte + about page)
**Source:** CONTEXT.md §Specific Ideas + RESEARCH.md Domain Context table
**Apply to:** any component or formatter that renders these strings
```typescript
// These strings are LOCKED — never paraphrase:
'not enough history'                    // n<5 refusal (D-08)
'forecast'                              // kind label (D-25) — not "prediction"/"projection"
'based on N of M days'                  // gap annotation (D-24)
'horizon too far — historical data only' // >30-day message (D-10)
// PI label: "80% PI" (not 95%, not confidence interval)
```

### Script Import Boundary (applies to all scripts/)
**Source:** `scripts/backfill.ts` lines 22-36
**Apply to:** `scripts/forecasts-rebuild.ts`, `scripts/forecast-benchmark.ts`
```typescript
// NO SvelteKit boot: relative `.ts` imports only at this top-level file.
// Inside imported modules, $lib/ aliases continue to resolve via tsx tsconfig.
import { parseArgs } from 'node:util';
import { getDb, closeDb } from '../src/lib/db/client.ts';
import { recomputeForecasts } from '../src/lib/forecast/compute.ts';
```

### Logger Correlation (applies to compute.ts + scheduler.ts append)
**Source:** `src/lib/server/scheduler.ts` lines 47-50
**Apply to:** `src/lib/forecast/compute.ts` `recomputeForecasts`, scheduler.ts addition
```typescript
import { logger } from '$lib/server/logger';
const recomputeLogger = logger.child({ job: 'forecast-recompute', jobId: crypto.randomUUID() });
```

---

## No Analog Found

All 14 files have close analogs. No entries in this section.

The one sub-pattern without a direct codebase model is the **year-boundary wrap** in the ±7-day window SQL (when `forecast_date` is in early January, the window wraps December into January). RESEARCH.md §Technical Approach §1 (lines 196-213) documents the OR-branch SQL pattern required. The planner should include a test case for a January forecast date to verify this edge case.

---

## Metadata

**Analog search scope:** `src/lib/`, `src/routes/`, `scripts/`, `tests/`
**Files scanned:** 14 source files + 10 test files
**Pattern extraction date:** 2026-04-26
