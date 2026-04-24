# Phase 01: Ingest + Store — Pattern Map

**Mapped:** 2026-04-23
**Files analyzed:** 28 new files, 1 modified, ~6 reusable read-only dependencies
**Analogs found:** 24 / 28 (4 files have no close analog — documented below)

---

## File Classification

### DAL repositories (new — role: model/repository, data flow: CRUD)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/lib/db/client.ts` | db connection | init/singleton | `src/lib/db/smoke.ts` (open+pragma block) | exact |
| `src/lib/db/migrations.ts` | schema bootstrap | DDL | `src/lib/db/smoke.ts` (CREATE TABLE IF NOT EXISTS) | role-match |
| `src/lib/db/boats.ts` | repository | CRUD upsert | `src/lib/db/smoke.ts` | role-match (Phase 0 is the only DAL module; only CRUD example) |
| `src/lib/db/landings.ts` | repository | CRUD upsert | `src/lib/db/smoke.ts` | role-match |
| `src/lib/db/catchReports.ts` | repository | batched upsert in transaction | `src/lib/db/smoke.ts` | role-match |
| `src/lib/db/scrapeRuns.ts` | repository | CRUD + aggregate (AVG, resume query) | `src/lib/db/smoke.ts` | role-match |
| `src/lib/db/parseFailures.ts` | repository | CRUD insert-many | `src/lib/db/smoke.ts` | role-match |

### Scraper modules (new — role: service/utility)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/lib/scraper/fetcher.ts` | service | outbound HTTP | `src/lib/server/heartbeat.ts` (native fetch + AbortSignal.timeout + try/catch) | partial (heartbeat is outbound-fetch-in-process; no retry logic exists yet) |
| `src/lib/scraper/rate-limiter.ts` | utility/singleton | queue | *no analog* | none — new primitive (p-queue singleton) |
| `src/lib/scraper/lock.ts` | utility | cross-process mutex | *no analog* | none — new primitive (proper-lockfile) |
| `src/lib/scraper/snapshot.ts` | service | file I/O | `scripts/billing-watcher.ts` (readFile/writeFile pattern) | partial |
| `src/lib/scraper/parser.ts` | service | transform (HTML→CatchRow[]) | *no analog* | none — first pure-transform module |
| `src/lib/scraper/schema.ts` | model | validation schema | *no analog* | none — first Zod schema in the codebase |
| `src/lib/scraper/pipeline.ts` | orchestrator | request-response pipeline | `src/lib/server/scheduler.ts::_heartbeatTick` (kill-switch → work → ledger pattern) | role-match |
| `src/lib/scraper/sla.ts` | service | aggregate + alert | `src/lib/ops/billing.ts` + `scripts/billing-watcher.ts::sendAlert` | role-match |
| `src/lib/scraper/robots.ts` | utility | outbound HTTP + cache | `src/lib/server/heartbeat.ts` (fetch shape) | partial |
| `src/lib/scraper/gate.ts` | utility | env-var predicate | `src/lib/server/kill-switch.ts::scrapingEnabled` | **exact** |

### Scheduler integration (modified — role: orchestrator)

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/lib/server/scheduler.ts` (modify) | orchestrator | cron tick | self (Phase 0 `_heartbeatTick`) | exact — copy tick skeleton |

### CLI (new — role: script)

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `scripts/backfill.ts` | CLI script | batch orchestration | `scripts/billing-watcher.ts` (argv-less, but same shebang + node-strip-types + main()+exit pattern) | role-match |

### Test files (new — role: test)

| New File | Analog | Match Quality |
|----------|--------|---------------|
| `tests/unit/scraper/parser.test.ts` | `tests/ops/billing.test.ts` (pure-function fixture-driven tests) | role-match |
| `tests/unit/scraper/fetcher.test.ts` | `tests/scheduler/heartbeat.test.ts` (globalThis.fetch mock + env save/restore) | **exact** |
| `tests/unit/scraper/rate-limiter.test.ts` | `tests/scheduler/heartbeat.test.ts` | partial |
| `tests/unit/scraper/pipeline.test.ts` | `tests/scheduler/tick-ordering.test.ts` (vi.resetModules + vi.doMock gate testing) | **exact** |
| `tests/unit/scraper/sla.test.ts` | `tests/ops/operator-alert.test.ts` (vi.mock('resend') + sendMock) | **exact** |
| `tests/unit/scraper/snapshot.test.ts` | *no analog* | none |
| `tests/unit/db/*.test.ts` | `tests/ops/billing.test.ts` | role-match |
| `tests/scheduler/scrape-tick.test.ts` | `tests/scheduler/tick-ordering.test.ts` | **exact** — same ordering invariant, new tick |
| `tests/helpers/in-memory-db.ts` | *no analog* | none |
| `tests/helpers/fetch-stub.ts` | `tests/scheduler/heartbeat.test.ts` (monkey-patch pattern inline) | partial |

### Planning artifacts (new — role: documentation)

| File | Analog | Match Quality |
|------|--------|---------------|
| `.planning/research/TOS-REVIEW.md` | `.planning/research/STACK.md` (existing `.planning/research/*.md` layout) | partial |
| `.planning/research/OUTREACH-EMAIL.md` | same | partial |

### Fixtures (new — role: test data)

| New File | Analog | Match Quality |
|----------|--------|---------------|
| `tests/fixtures/scraper/*.html` + `*.expected.json` | *no analog* (tests/fixtures/.gitkeep only) | none |

---

## Pattern Assignments

### `src/lib/db/client.ts` (db connection singleton)

**Analog:** `src/lib/db/smoke.ts`

**Connection + WAL pragma pattern** (copy verbatim from `smoke.ts:9-14`):

```typescript
import Database from 'better-sqlite3';
import { logger } from '$lib/server/logger';

const DEFAULT_DB_PATH = process.env.DB_PATH ?? '/data/fishcount.sqlite3';

export function openDb(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');          // verbatim from smoke.ts:13
  db.pragma('synchronous = NORMAL');        // verbatim from smoke.ts:14
  logger.info({ msg: 'db_opened', dbPath });
  return db;
}
```

**Convention to replicate verbatim:**
- `DB_PATH` env var override with `/data/fishcount.sqlite3` default (matches `smoke.ts:9`).
- `pragma('journal_mode = WAL')` then `pragma('synchronous = NORMAL')` in that order.
- Import logger from `$lib/server/logger` (SvelteKit alias — works in server runtime but NOT in CLI/script context; see CLI section).
- `logger.info({ msg: 'db_opened', dbPath })` — note the `msg` key is used as the log message convention in Phase 0.

**Additional required export** (not present in Phase 0 but needed by `shutdown.ts` TODO comment at line 27):

```typescript
let singleton: Database.Database | null = null;
export function getDb(): Database.Database { /* lazy init */ }
export function closeDb(): void { singleton?.close(); singleton = null; }
```

---

### `src/lib/db/migrations.ts` (schema bootstrap)

**Analog:** `src/lib/db/smoke.ts:15-21`

**DDL pattern** (extend from smoke.ts):

```typescript
// smoke.ts:15-21 — copy the IF NOT EXISTS idiom, expand tables
db.exec(`
  CREATE TABLE IF NOT EXISTS smoke_test (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    marker TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
```

**Convention to replicate:**
- `db.exec()` for DDL, wrapped in a single multi-statement string.
- `created_at TEXT NOT NULL DEFAULT (datetime('now'))` — SQLite idiom for timestamps (Phase 0 uses this).
- `IF NOT EXISTS` guards throughout (migrations must be idempotent on boot).
- Per assumption A6 in RESEARCH.md: either DROP `smoke_test` here or leave it harmless.

---

### `src/lib/db/boats.ts` / `landings.ts` / `catchReports.ts` / `scrapeRuns.ts` / `parseFailures.ts`

**Analog:** `src/lib/db/smoke.ts` (only existing DAL module)

**Prepared-statement pattern** (copy shape from `smoke.ts:26-43`):

```typescript
// Template from smoke.ts:26-43:
export function writeSmokeRow(db: Database.Database, marker: string): void {
  db.prepare('INSERT INTO smoke_test (marker) VALUES (?)').run(marker);
}

export function readSmokeRows(db: Database.Database): Array<{id: number; marker: string; created_at: string}> {
  return db.prepare('SELECT id, marker, created_at FROM smoke_test ORDER BY id').all() as Array<{
    id: number;
    marker: string;
    created_at: string;
  }>;
}

export function countSmokeRows(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) as c FROM smoke_test').get() as { c: number };
  return row.c;
}
```

**Conventions the planner MUST replicate verbatim:**

1. **Every repository function accepts `db: Database.Database` as first param** — do NOT import a module-level singleton. The Phase 0 pattern threads the DB handle through. (This matters for tests using `:memory:` DBs.)
2. **Cast `.all()` / `.get()` results to a typed shape** — `as Array<{...}>` and `as { c: number }`. No runtime validation (Zod is at scraper boundary, not DAL boundary).
3. **`.prepare()` inline per function** — Phase 0 does not cache prepared statements. For hot-path upserts (catchReports), cache module-level but follow the better-sqlite3 transaction pattern from RESEARCH.md §Pattern 2.
4. **Idempotent upsert pattern for `catchReports.ts`** (per D-06):
   ```typescript
   const insertStmt = db.prepare(`
     INSERT INTO catch_reports
       (source_date, boat_id, landing_id, trip_type, species,
        angler_count, species_count, scraped_at)
     VALUES (@source_date, @boat_id, @landing_id, @trip_type, @species,
             @angler_count, @species_count, @scraped_at)
     ON CONFLICT(source_date, boat_id, trip_type, species) DO UPDATE SET
       landing_id = excluded.landing_id,
       angler_count = excluded.angler_count,
       species_count = excluded.species_count,
       scraped_at = excluded.scraped_at
   `);
   const upsertMany = db.transaction((rows: CatchRow[]) => {
     for (const r of rows) insertStmt.run(r);
   });
   ```
   Pitfall P7 from RESEARCH.md: `db.transaction()` is SYNCHRONOUS — never `await` inside its body.

---

### `src/lib/scraper/gate.ts` (FIRST_SCRAPE_OK predicate)

**Analog:** `src/lib/server/kill-switch.ts` (near-exact parallel)

**Copy this entire module shape** (`kill-switch.ts:1-15`):

```typescript
// src/lib/server/kill-switch.ts — ENTIRE FILE
// OPS-05: environment-variable kill switch.
// Semantics:
//   SCRAPER_ENABLED === 'false'   → halt (case-sensitive)
//   anything else (incl. unset)   → allow
// Fail-open is intentional: ...
export function scrapingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SCRAPER_ENABLED !== 'false';
}
```

**New `gate.ts` MUST mirror this shape — but INVERT the fail-open/fail-closed default** (per D-21):

```typescript
// FAIL-CLOSED — the opposite of kill-switch semantics by design:
// FIRST_SCRAPE_OK === 'true'    → allow (explicit opt-in)
// anything else (incl. unset)   → block (default stance is "refuse")
export function firstScrapeAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FIRST_SCRAPE_OK === 'true';
}
```

**Convention the planner MUST replicate verbatim:**
- Function signature `(env: NodeJS.ProcessEnv = process.env): boolean` — allows test injection.
- Case-sensitive string compare (`=== 'true'`, not `.toLowerCase()`).
- Top-of-file comment block explaining fail-open vs fail-closed rationale (kill-switch has a rich comment block at lines 4–11; gate.ts needs the parallel rationale for WHY it inverts).

---

### `src/lib/scraper/fetcher.ts` (polite HTTP fetch)

**Analog:** `src/lib/server/heartbeat.ts` (only existing fetch-with-timeout example)

**Imports + AbortSignal.timeout pattern** (from `heartbeat.ts:34-45`):

```typescript
// heartbeat.ts:34-45
try {
  await fetch(url, {
    method: 'POST',
    body: exitCode !== 0 ? `exit code: ${exitCode}` : undefined,
    signal: AbortSignal.timeout(PING_TIMEOUT_MS)    // ← copy this idiom
  });
  logger.info({ status, url: redactPingUrl(url) }, 'healthcheck ping sent');
} catch (err) {
  logger.warn({ err, status, url: redactPingUrl(url) }, 'healthcheck ping failed — non-fatal');
}
```

**Convention to replicate:**
- `AbortSignal.timeout(MS)` for HTTP timeouts (native Node 22, no undici-specific Agent needed per A7).
- `try { await fetch(...) } catch (err) { logger.warn({ err, ... }) }` shape.
- Log-and-swallow is the Phase 0 pattern for non-critical fetches; **fetcher.ts inverts this — it must rethrow so pipeline.ts records `outcome='http_error'`** (per pipeline.ts pseudocode at RESEARCH.md:629–637).

**New pieces with no Phase 0 analog** (use RESEARCH.md code examples):
- `p-retry` wrapper with `AbortError` for 4xx (RESEARCH.md §Don't Hand-Roll row 5).
- User-Agent string `FishCountBot/0.1 (+https://...; contact@...)` — must contain `+http` (verified by test per ING-02).
- URL construction `https://www.sandiegofishreports.com/dock_totals/boats.php?date=${date}` (A8 verified).

---

### `src/lib/scraper/pipeline.ts` (orchestrator — the central composition point)

**Analog:** `src/lib/server/scheduler.ts::_heartbeatTick` (lines 22-46)

**Tick-body structure — copy this ordering discipline verbatim** (`scheduler.ts:22-46`):

```typescript
export async function _heartbeatTick(): Promise<void> {
  const tickLogger = logger.child({ job: 'heartbeat', jobId: crypto.randomUUID() });

  // Kill switch is checked FIRST and does NOT ping. When the kill switch is
  // active, we WANT the dead-man's switch to fire after grace — that surfaces
  // to the operator that ingestion is halted. This is intentional per
  // 00-RESEARCH.md §Q2 (dead-man's switch is an absence-detector).
  if (!scrapingEnabled(process.env)) {
    tickLogger.warn({ reason: 'kill_switch_set' }, 'heartbeat skipped');
    return;
  }

  await pingHealthcheck('start');
  try {
    tickLogger.info({ status: 'ok' }, 'heartbeat tick');
    // Phase 1 replaces this body with the real scrape call. For Phase 0 the
    // tick is a no-op body that exists only to exercise start/success ping flow.
    await pingHealthcheck('success');
  } catch (err) {
    tickLogger.error({ err }, 'heartbeat tick failed');
    await pingHealthcheck('fail', 1);
    throw err;
  }
}
```

**Convention the planner MUST replicate verbatim (load-bearing):**

1. **Correlation logger at TOP of tick** — `logger.child({ ... })`. For Phase 1 use `run_id` (runId from `crypto.randomUUID()`) and `source_date` and `source: 'scheduler'|'cli'` keys. RESEARCH.md line 606–607 shows the exact shape.
2. **Gate checks BEFORE any side effect** — kill-switch first in Phase 0; Phase 1 MUST order as: (a) `firstScrapeAllowed()` → (b) `scrapingEnabled()` → (c) `withScrapeLock()` → (d) `sourceQueue.add(() => fetchPage())`. Every gate writes an `outcome='killed'` ledger row before returning.
3. **Heartbeat bookends reused** — Phase 0's `pingHealthcheck('start')` / `'success'` / `'fail'` pattern wraps scrape work in the scheduler tick (but NOT in the CLI pipeline — source=`'cli'` should skip healthcheck pings; only scheduler owns the dead-man's switch).
4. **`try { ... } catch (err) { logger.error({ err }, '...'); ping('fail', 1); throw err; }`** — rethrow in the scheduler tick so croner sees the failure.
5. **Exactly ONE `scrape_runs` row per scrapeDate() invocation** (per invariant 6 in RESEARCH.md Validation Architecture). Every code path — including early returns — must call `recordScrapeRun()` first.

---

### `src/lib/scraper/sla.ts` (row-count SLA alert)

**Analog:** `src/lib/ops/billing.ts` (threshold detection) + `scripts/billing-watcher.ts::sendAlert` (Resend dispatch)

**Threshold detection shape** (from `billing.ts:21-31`):

```typescript
// billing.ts:21-31 — pure function pattern for threshold checks
export function checkThresholds(spendUsd: number, state: ThresholdState): ThresholdResult {
  const crossed: Threshold[] = [];
  const newState: ThresholdState = { ...state };
  for (const t of [20, 50, 100] as const) {
    if (spendUsd >= t && !state[t]) {
      crossed.push(t);
      newState[t] = true;
    }
  }
  return { crossed, newState };
}
```

**Alert dispatch reuse** (from `src/lib/alerts/operator.ts:35-70` — **READ-ONLY reuse**):

```typescript
// src/lib/alerts/operator.ts — import and call directly
import { sendOperatorAlert } from '$lib/alerts/operator';

await sendOperatorAlert({
  subject: `FishCount: row-count SLA breach for ${date}`,
  body: `Today total: ${total} rows. 7-day baseline: ${baseline.toFixed(1)} rows.`
});
```

**Convention to replicate verbatim:**
- **Pure function for the decision, side effect (send) separated** — `billing.ts` separates `checkThresholds` (pure) from `billing-watcher.ts::sendAlert` (side effect). SLA should do the same: `shouldAlert(baseline, total): boolean` pure + `checkSlaAndAlert(date): Promise<void>` wrapper.
- **Reuse `sendOperatorAlert()` directly** — do NOT inline a Resend call (billing-watcher.ts does inline it, but only because it runs outside the SvelteKit alias scope; pipeline.ts runs inside it).
- **Outcome gating** — per D-25, only `outcome='success'` triggers SLA. First line of `checkSlaAndAlert`: `if (outcome !== 'success') return;`.

---

### `src/lib/scraper/snapshot.ts` (gzip + write)

**Analog:** `scripts/billing-watcher.ts::readState/writeState` (lines 48-61) — only existing fs/promises pattern

**File I/O pattern** (from `billing-watcher.ts:48-61`):

```typescript
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

async function writeState(state: StoredState): Promise<void> {
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}
```

**Convention to replicate:**
- `node:fs/promises` for async I/O.
- `node:fs` (sync) ONLY for `existsSync`.

**New pieces with no Phase 0 analog** (per RESEARCH.md §Pattern 5 + D-17/D-19):
- `zlib.gzipSync(html)` before `writeFile` (sync gzip is fine for 14KB pages).
- `mkdir({recursive: true})` for `/data/snapshots/YYYY/MM/` directory creation.
- Snapshot write MUST occur BEFORE parse (pitfall warning in RESEARCH.md:482).

---

### `src/lib/server/scheduler.ts` (modify — add scrape tick)

**Analog:** self — existing `scheduler.ts:49-70` startScheduler + `_heartbeatTick:22-46`

**Existing cron registration pattern to replicate** (`scheduler.ts:58-67`):

```typescript
const heartbeat = new Cron(
  '* * * * *',
  {
    name: 'heartbeat',
    timezone: 'America/Los_Angeles',    // ← MUST replicate for DST safety per pitfall P6
    protect: true                       // ← MUST replicate (skip tick if previous still running)
  },
  _heartbeatTick
);
jobs.push(heartbeat);
```

**New scrape cron entry** (per D-14 `0 23 * * *`):

```typescript
const nightlyScrape = new Cron(
  '0 23 * * *',
  { name: 'nightly-scrape', timezone: 'America/Los_Angeles', protect: true },
  _scrapeTick
);
jobs.push(nightlyScrape);
```

**Planner decision per RESEARCH.md:295 comment ("add alongside or replace — TBD by Phase 1 planning"):** Either (a) replace `_heartbeatTick` with `_scrapeTick` entirely, OR (b) keep heartbeat at `* * * * *` and add scrape at `0 23 * * *`. Recommendation: option (a) — promote `_scrapeTick` to the sole cron, since heartbeat was Phase 0 scaffolding (the pingHealthcheck bookends move into `_scrapeTick`).

---

### `scripts/backfill.ts` (new CLI)

**Analog:** `scripts/billing-watcher.ts`

**Shebang + import + main + exit pattern** (from `billing-watcher.ts:1-36, 221-225`):

```typescript
#!/usr/bin/env node
// scripts/billing-watcher.ts — header block with env var contract

// IMPORT from canonical modules — these are the unit-tested source of truth.
// Note: `.ts` extension is required because Node 22's --experimental-strip-types
// ESM loader does not auto-resolve extensionless specifiers.
import {
  checkThresholds,
  loadOrResetState,
  currentMonthKey,
  type ThresholdState
} from '../src/lib/ops/billing.ts';

// ... main logic ...

main().catch((err: unknown) => {
  console.error(`[watcher] fatal: ${(err as Error).message}`);
  process.exit(1);
});
```

**Convention the planner MUST replicate verbatim (load-bearing CLI-specific rules):**

1. **Relative imports with `.ts` extension** — `from '../src/lib/scraper/pipeline.ts'` NOT `from '$lib/scraper/pipeline'`. The SvelteKit `$lib` alias is not resolved under `tsx` / `node --experimental-strip-types`. See `billing.ts:11` and `billing-watcher.ts:31-36` for the rationale comment.
2. **DO NOT import from `$lib/server/logger`** — that module is SvelteKit-aliased. Use `console.log`/`console.error` with a `[backfill]` prefix, matching `billing-watcher.ts:152-170`. Alternatively: re-export pino from `src/lib/shared/logger.ts` (new, no alias) — but that's a Phase 0 refactor.
3. **`main().catch((err) => { console.error(...); process.exit(1); })`** tail — `billing-watcher.ts:221-225`.
4. **Env-var contract at top of file in comment block** — `billing-watcher.ts:5-13`.
5. **`node:util parseArgs`** — per D-10 (RESEARCH.md §Code Examples lines 773-787). NOT commander/yargs.
6. **tsx invocation, not direct node** — add to `package.json`: `"backfill": "tsx scripts/backfill.ts"`. (billing-watcher uses `node --experimental-strip-types`, but Phase 1 needs tsx because pipeline.ts imports cheerio/zod/etc. which require full TS compilation.)
7. **MUST NOT boot SvelteKit** — no `import '$app/...'`, no `import { runStartup }`. CLI opens DB directly via `openDb()` from `src/lib/db/client.ts`.

---

### Test files — specific pattern pairings

#### `tests/unit/scraper/fetcher.test.ts`

**Analog:** `tests/scheduler/heartbeat.test.ts:33-60`

**globalThis.fetch mock + env save/restore pattern** (copy verbatim):

```typescript
// heartbeat.test.ts:39-52
describe('pingHealthcheck (OPS-04 dead-man ping)', () => {
  const BASE = 'https://hc-ping.com/abcd1234-...';
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env.HEALTHCHECKS_PING_URL;
    fetchMock = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    vi.resetModules(); // so the module picks up the current env on each import
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env.HEALTHCHECKS_PING_URL;
    else process.env.HEALTHCHECKS_PING_URL = originalEnv;
    vi.restoreAllMocks();
  });
```

**Convention to replicate verbatim:**
- `vi.resetModules()` in `beforeEach` — critical for env-based module behavior (kill-switch, gate, etc.).
- Save/restore env in beforeEach/afterEach triplets (original, set, delete-or-restore).
- `await import('../../src/lib/scraper/fetcher')` INSIDE the `it` block, not at top of file.

#### `tests/scheduler/scrape-tick.test.ts`

**Analog:** `tests/scheduler/tick-ordering.test.ts` (**EXACT — copy pattern for new tick**)

**vi.doMock + dynamic import for ordering invariant** (copy from `tick-ordering.test.ts:21-38`):

```typescript
// tick-ordering.test.ts:21-38
it('does NOT call pingHealthcheck when SCRAPER_ENABLED=false', async () => {
  process.env.SCRAPER_ENABLED = 'false';
  const pingHealthcheck = vi.fn().mockResolvedValue(undefined);
  vi.doMock('../../src/lib/server/heartbeat', () => ({ pingHealthcheck }));

  const mod = await import('../../src/lib/server/scheduler');
  await mod._heartbeatTick();

  expect(pingHealthcheck).not.toHaveBeenCalled();
  expect(pingHealthcheck).toHaveBeenCalledTimes(0);
});
```

**Required new invariant tests for Phase 1 scrape tick** (per RESEARCH.md Validation Architecture invariants 6, 7, 8):
- With `FIRST_SCRAPE_OK` unset → `fetch` never called, scrape_runs row `outcome='killed'` written.
- With `SCRAPER_ENABLED=false` → `fetch` never called (same ordering as kill-switch test).
- With both gates open → `fetchPage` IS called.

#### `tests/unit/scraper/sla.test.ts`

**Analog:** `tests/ops/operator-alert.test.ts:1-62`

**vi.mock('resend') at module scope** (copy from `operator-alert.test.ts:1-9`):

```typescript
// operator-alert.test.ts:1-9
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn(() => ({
    emails: { send: sendMock }
  }))
}));
```

#### `tests/unit/db/*.test.ts`

**Analog:** `tests/ops/billing.test.ts:1-8`

**Pure-function test shape** (copy from `billing.test.ts`):

```typescript
import { describe, it, expect } from 'vitest';
import {
  checkThresholds,
  emptyState,
  // ... named imports
  type ThresholdState
} from '../../src/lib/ops/billing';

describe('checkThresholds (OPS-01 idempotent threshold state machine)', () => {
  const fresh = (): ThresholdState => emptyState();

  it('returns no crossings when spend below smallest threshold', () => {
    const r = checkThresholds(5, fresh());
    expect(r.crossed).toEqual([]);
  });
});
```

**DB-test adaptation required** (no Phase 0 analog for DB tests):
- Use `new Database(':memory:')` in-memory DB per test.
- Run `migrations.run(db)` in `beforeEach`.
- Assert via `db.prepare('SELECT ...').all()` — test-internal SQL is allowed per invariant 2 (DAL boundary is for src/, not tests/).

---

## Shared Patterns (cross-cutting — apply to multiple new files)

### Authentication / Gate Ordering

**Source:** `src/lib/server/scheduler.ts::_heartbeatTick` (lines 22-46) + `src/lib/server/kill-switch.ts`

**Apply to:** `src/lib/scraper/pipeline.ts` (every entry) + `src/lib/server/scheduler.ts::_scrapeTick` (new)

**The ordering invariant** (Phase 0 enforces kill-switch-first; Phase 1 MUST extend with FIRST_SCRAPE_OK-first):

```typescript
// Required order at top of scrapeDate():
// 1. firstScrapeAllowed() — D-21 fail-closed gate
// 2. scrapingEnabled() — OPS-05 fail-open kill switch
// 3. withScrapeLock() — D-13 cross-process mutex
// 4. sourceQueue.add(fetchPage) — D-13 in-process rate limit
// 5. writeSnapshot(html) — D-17 BEFORE parse
// 6. parsePage(html) — D-07 per-row Zod + quarantine
// 7. upsertBoatsAndLandings + upsertCatchReports — DAL
// 8. recordParseFailures — DAL
// 9. recordScrapeRun({ outcome, ... }) — exactly ONE per path
// 10. (scheduler only) checkSlaAndAlert(date, outcome) — D-23
```

**Every early return MUST write to `scrape_runs` ledger first** — invariant 6.

---

### Logging / Correlation

**Source:** `src/lib/server/logger.ts` + `src/lib/server/scheduler.ts:24`

**Apply to:** All scraper modules, pipeline.ts, scheduler.ts new tick

**Child logger pattern** (copy from `scheduler.ts:24` and `hooks.server.ts:17`):

```typescript
// scheduler.ts:24 — tickLogger with jobId correlation
const tickLogger = logger.child({ job: 'heartbeat', jobId: crypto.randomUUID() });

// hooks.server.ts:17 — request-scoped child
const reqLogger = logger.child({ requestId, path: event.url.pathname });
```

**Phase 1 scrape correlation keys** (per RESEARCH.md:606-607):
```typescript
const log = logger.child({ run_id: runId, source_date: date, source: 'scheduler'|'cli' });
```

**Convention the planner MUST replicate verbatim:**
- Use `logger.child({...})` — NOT a new `pino()` call. Inherits redaction + serializers.
- Put correlation keys in the CHILD — `{ run_id, source_date, source }` — not in every log line.
- `logger.info({ msg: 'event_name', ...fields }, 'human message')` — the snake_case `msg` key is the Phase 0 convention (smoke.ts:22, startup.ts:20, scheduler.ts:31).
- Logger is imported via `$lib/server/logger` in src/ code; NOT importable from scripts/ (use console there — see CLI section above).

---

### Error Handling

**Source:** `src/lib/server/heartbeat.ts:41-45` + `src/lib/server/scheduler.ts:41-45` + `src/lib/alerts/operator.ts:58-64`

**Apply to:** All scraper modules

**Phase 0 error idioms** (three distinct shapes, pick per context):

```typescript
// (A) Log-and-swallow (non-critical side channel) — heartbeat.ts:41-45:
} catch (err) {
  logger.warn({ err, ... }, 'X failed — non-fatal');
}

// (B) Log-and-rethrow (critical work in scheduler tick) — scheduler.ts:41-45:
} catch (err) {
  tickLogger.error({ err }, 'tick failed');
  await pingHealthcheck('fail', 1);
  throw err;
}

// (C) Log-then-throw-new (external-service wrapper) — operator.ts:58-64:
if (result.error) {
  logger.error({ err: result.error, ... }, 'X send failed');
  throw new Error(`Resend error: ${result.error.message}`);
}
```

**Phase 1 mapping:**
- `fetcher.ts` → pattern (B): log + rethrow so pipeline records `outcome='http_error'`.
- `parser.ts` → NO throws (per-row failure = quarantine; page-level failure = empty return + pipeline classifies).
- `pipeline.ts` → pattern (B) at outer try/catch; ALWAYS write scrape_runs row before rethrow.
- `snapshot.ts` → pattern (A) — snapshot write failure is recoverable (parse+upsert can still succeed); log and continue.
- `sla.ts` → pattern (C) if `sendOperatorAlert` fails (inherit from operator.ts).

---

### Validation

**Source:** NO Phase 0 analog — Zod is NEW to Phase 1

**Apply to:** `src/lib/scraper/schema.ts` + `src/lib/scraper/parser.ts`

**Per RESEARCH.md §Pattern 5 (no existing codebase pattern to copy):**

```typescript
// src/lib/scraper/schema.ts — NEW pattern, no analog
import { z } from 'zod';
export const CatchRowSchema = z.object({
  source_name: z.string().min(1),
  landing_source_name: z.string().min(1),
  trip_type: z.string().min(1),
  angler_count: z.number().int().nonnegative(),
  species: z.string().min(1).transform(s => s.toLowerCase().trim()),  // D-03
  species_count: z.number().int().nonnegative()
});
export type CatchRow = z.infer<typeof CatchRowSchema>;

// parser.ts — per-row safeParse + quarantine (D-07):
const result = CatchRowSchema.safeParse(rawCandidate);
if (!result.success) {
  failures.push({
    row_index: idx,
    raw_html_snippet: $.html(rowEl),
    zod_error: JSON.stringify(result.error.issues)
  });
  continue;
}
rows.push(result.data);
```

---

### Date Handling

**Source:** `src/lib/shared/dates.ts` (**READ-ONLY reuse — sole date producer**)

**Apply to:** Every file producing a `YYYY-MM-DD` string (fetcher, pipeline, backfill CLI, all DAL queries with `run_date` / `source_date`).

**Available exports** (verbatim from `dates.ts`):
- `today(): string` — returns `YYYY-MM-DD` in `America/Los_Angeles`
- `toIsoDate(d: Date): string` — formats any Date in PT
- `currentPtMonth(): number` — 1-12

**Enforcement (RESEARCH.md invariant 3):** No `new Date().toISOString()` or `Date.now()`-based date production anywhere in `src/lib/scraper/`, `src/lib/db/`, or `scripts/`. Static grep test enforces this.

---

### SvelteKit-Alias Boundary (CLI vs server code)

**Source:** `src/lib/ops/billing.ts:7-11` (comment block) + `scripts/billing-watcher.ts:27-36`

**Apply to:** Any module consumed by BOTH `src/` (SvelteKit runtime) AND `scripts/` (CLI runtime).

**Load-bearing convention** (copy verbatim from `billing.ts:7-11`):

```typescript
// NOTE: uses relative import (not `$lib/`) because this module is also consumed by
// scripts/billing-watcher.ts which runs under `node --experimental-strip-types` in
// GitHub Actions — the SvelteKit `$lib` alias is not resolved in that context.
// The `.ts` extension is required because Node 22's ESM loader (with
// --experimental-strip-types) does NOT auto-resolve extensionless specifiers.
// SvelteKit/Vite strip the extension at bundle time, so this doesn't affect the app build.
import { today } from '../shared/dates.ts';
```

**Impact on Phase 1 planner:**
- `src/lib/db/client.ts`, `src/lib/db/migrations.ts`, every DAL repository, AND `src/lib/scraper/pipeline.ts` are imported by `scripts/backfill.ts` → they MUST use relative `.ts` imports for their internal deps, NOT `$lib/` aliases.
- `src/lib/server/logger.ts` is SvelteKit-server-only (base: `{ app: 'fishcount', env: ... }` and redact config assume pino runtime). The CLI should NOT import it. Either (a) CLI uses `console` with a prefix, or (b) Phase 1 factors logger into `src/lib/shared/logger.ts` (new).

---

## No Analog Found

Files with no close analog in the codebase (planner should use RESEARCH.md code examples directly):

| File | Role | Reason | Fallback |
|------|------|--------|----------|
| `src/lib/scraper/rate-limiter.ts` | p-queue singleton | No queue primitive exists | RESEARCH.md §Pattern 4 (lines 406-414) |
| `src/lib/scraper/lock.ts` | proper-lockfile mutex | No mutex primitive exists | RESEARCH.md §Pattern 4 (lines 417-430) |
| `src/lib/scraper/parser.ts` | Cheerio HTML→row transform | No HTML parser exists | RESEARCH.md §Code Examples (lines 675-762) |
| `src/lib/scraper/schema.ts` | Zod schema | No Zod usage exists | RESEARCH.md §Pattern 5 (lines 442-451) |
| `src/lib/scraper/robots.ts` | robots-parser cache | No robots check exists | RESEARCH.md §Architecture Patterns "24h cache" |
| `tests/helpers/in-memory-db.ts` | test helper | No test helpers dir | RESEARCH.md Wave 0 Gaps (lines 973) |
| `tests/fixtures/scraper/*.html` | test fixtures | Empty `tests/fixtures/` dir | RESEARCH.md Wave 0 Gaps (lines 965-969); D-09 |
| `.planning/research/TOS-REVIEW.md` | docs template | No TOS artifact exists | D-20; new template |
| `.planning/research/OUTREACH-EMAIL.md` | email draft | No email artifact exists | D-20; new template |

---

## Load-Bearing Conventions Summary (the planner MUST replicate verbatim)

1. **Log `msg` key convention** — `logger.info({ msg: 'event_name', ...fields })` per `smoke.ts:22`, `startup.ts:20`, `scheduler.ts:69`.
2. **Pragma order** — `journal_mode = WAL` then `synchronous = NORMAL` (smoke.ts:13-14).
3. **Tick ordering** — gate checks FIRST, before any side effect (scheduler.ts:30 kill-switch; Phase 1 adds gate.ts first).
4. **Child logger correlation** — `logger.child({ run_id, source_date, source })` not raw pino or per-line keys.
5. **Fail-open vs fail-closed env defaults** — kill-switch `!== 'false'` (fail-open); gate `=== 'true'` (fail-closed).
6. **croner options `timezone: 'America/Los_Angeles'` + `protect: true`** — both required for DST + overlap safety (scheduler.ts:60-65).
7. **Relative `.ts` imports in scripts/** — never `$lib/` aliases in CLI-reachable modules (billing.ts:11 rationale block).
8. **Every entry writes exactly one `scrape_runs` row** — no code path skips the ledger.
9. **Snapshot BEFORE parse** — preserve raw evidence for replay (RESEARCH.md:482).
10. **Single date producer** — all `YYYY-MM-DD` from `src/lib/shared/dates.ts`; no `new Date().toISOString()` outside that file (invariant 3).
11. **DAL boundary** — SQL only inside `src/lib/db/*`; scraper/pipeline/server/alerts call typed repository functions (STO-03, invariant 2).
12. **Idempotent upsert key** — `(source_date, boat_id, trip_type, species)` is both the UNIQUE index and the ON CONFLICT clause (D-06, invariant 1).
13. **vitest test pattern** — `vi.resetModules()` in `beforeEach`, `vi.doMock` for env-dependent modules, `await import('...')` inside `it` blocks (heartbeat.test.ts:44, tick-ordering.test.ts:11).
14. **Resend reuse** — `sendOperatorAlert()` from `$lib/alerts/operator` in server code; inline Resend call only in scripts/ (follow billing-watcher.ts comment block rationale at :146-150).

---

## Metadata

**Analog search scope:** `src/lib/**/*.ts`, `tests/**/*.ts`, `scripts/**/*.ts`
**Files scanned:** 17 source files + 6 test files + 5 scripts = 28 files
**Pattern extraction date:** 2026-04-23
**Phase 0 version basis:** commit 9fce561 "docs(state): record phase 1 context session"
