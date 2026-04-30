---
phase: 01-ingest-store
plan: 02
subsystem: infra
tags: [scraper, p-queue, p-retry, proper-lockfile, robots-parser, rate-limit, polite-scraping]

# Dependency graph
requires:
  - phase: 01-ingest-store/01
    provides: ScrapeOutcome enum + DAL repositories (unused in this plan; consumed by Plan 01-05)
provides:
  - sourceQueue singleton (≤1 req/5s in-process rate limit)
  - withScrapeLock cross-process file mutex (fail-fast, retries:0)
  - firstScrapeAllowed fail-closed D-21 gate
  - fetchPage(date) polite fetcher (UA with +http, p-retry + AbortError on 4xx)
  - isAllowed(url, ua) 24h-cached robots.txt check
  - USER_AGENT constant with +http contact link
  - tests/helpers/fetch-stub.ts (reusable globalThis.fetch mock)
affects: [01-03-parser, 01-04-snapshot, 01-05-pipeline, 01-06-backfill-cli, 01-07-scheduler-wiring]

# Tech tracking
tech-stack:
  added: [p-queue@9.1.2, p-retry@8.0.0, proper-lockfile@4.1.2, robots-parser@3.0.1, cheerio@1.2.0, zod@4.3.6, tsx@4.21.0, "@types/proper-lockfile@4.1.4"]
  patterns:
    - "Fail-closed gate (gate.ts) — structural mirror of kill-switch.ts with inverted default (block by default, only exact 'true' allows)"
    - "Two-tier polite fetch (D-13): in-process p-queue rate limit + cross-process proper-lockfile mutex"
    - "p-retry + AbortError for 4xx short-circuit (permanent failures never retry)"
    - "24h per-host robots.txt cache keyed by URL origin"
    - "Reusable fetch-stub test helper with queued + sticky responses"

key-files:
  created:
    - src/lib/scraper/gate.ts
    - src/lib/scraper/rate-limiter.ts
    - src/lib/scraper/lock.ts
    - src/lib/scraper/robots.ts
    - src/lib/scraper/fetcher.ts
    - tests/helpers/fetch-stub.ts
    - tests/unit/scraper/gate.test.ts
    - tests/unit/scraper/fetcher.test.ts
    - tests/unit/scraper/rate-limiter.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "SOURCE_URL_PREFIX written as one literal string (not concatenated from base + query key) so grep-based invariant checks can find 'boats.php?date=' directly"
  - "robots.txt failure defaults to ALLOWED (with warning log) — conventional robots-parser semantics and the source operator has been notified separately via OUTREACH-EMAIL.md (D-20)"
  - "Rate-limiter test uses REAL timers (not fake) because p-queue's 5s interval cannot be observed under fake timers without re-implementing its scheduler — Pitfall 1 guard worth the 5s wall-clock cost"

patterns-established:
  - "Fail-closed env-var gate: mirror kill-switch.ts shape (function signature (env = process.env): boolean), invert the semantics in the comment block, use === 'true' for exact-match check"
  - "Polite HTTP client: sourceQueue.add(() => fetchPage(date)) → fetchPage internally does robots.isAllowed + p-retry + AbortSignal.timeout + AbortError-on-4xx"
  - "Test helper pattern: stubFetch(responses) saves the original fetch, replaces with a vi.fn that consumes queued responses and sticks on the last one — restoreFetch() in afterEach"

requirements-completed: [ING-01, ING-02, ING-03, ING-10, ING-11]

# Metrics
duration: 7m 4s
completed: 2026-04-24
---

# Phase 01 Plan 02: Polite-Fetcher Subsystem Summary

**Polite source-site fetcher with two-tier rate limit (p-queue + proper-lockfile), UA-with-contact, p-retry + AbortError-on-4xx, 24h-cached robots.txt check, and fail-closed FIRST_SCRAPE_OK gate — all five modules are small, testable primitives that Plan 01-05's pipeline will compose.**

## Performance

- **Duration:** 7m 4s
- **Started:** 2026-04-24T15:23:53Z
- **Completed:** 2026-04-24T15:31:00Z (approx)
- **Tasks:** 3 (+ 1 auto-fix)
- **Files created:** 9 (5 source modules + 3 tests + 1 test helper)
- **Files modified:** 2 (package.json, package-lock.json)

## Accomplishments

- **Rate limiter (ING-03):** `sourceQueue` PQueue singleton with `concurrency:1 / intervalCap:1 / interval:5000` — empirically verified by a real-timer test that measures 5017ms delta between two consecutive queued tasks.
- **Cross-process mutex (D-13 tier 2):** `withScrapeLock()` using proper-lockfile with `stale:60_000` and `retries:{retries:0}` — second concurrent caller fails fast so CLI can print "scheduler is running" and exit.
- **Fail-closed gate (D-21):** `firstScrapeAllowed()` pure predicate mirroring kill-switch.ts shape but inverted: only the exact string `'true'` allows; `'TRUE'`, `'1'`, `'yes'`, empty string, and unset all block.
- **Polite fetcher (ING-02 + ING-03):** `fetchPage(date)` with `USER_AGENT = 'FishCountBot/0.1 (+https://github.com/kaikai/fish-count; contact: liukk1211@gmail.com)'` — p-retry with 3 retries + exponential backoff + randomize; `AbortError` short-circuits 4xx so permanent failures never hammer the source.
- **robots.txt check:** `isAllowed(url, ua)` with 24h per-host cache via robots-parser; defaults to allowed on fetch error (with warning log).
- **Test coverage:** 12 new test cases across 3 files (6 gate + 5 fetcher + 1 rate-limiter timing). Total project test count rose from 80 → 98 (all green).

## Task Commits

Each task was committed atomically following the RED → GREEN TDD cycle:

1. **Task 1 (gate + rate-limiter + lock + gate test)**
   - `81bc440` test(01-02): add failing test for FIRST_SCRAPE_OK gate (RED)
   - `19be9b7` feat(01-02): add FIRST_SCRAPE_OK gate, p-queue rate limiter, and file mutex (GREEN)

2. **Task 2 (robots + fetcher + fetch-stub + fetcher test)**
   - `f3baff5` test(01-02): add failing tests for polite fetcher + fetch-stub helper (RED)
   - `2beb259` feat(01-02): add robots.txt check + polite fetcher with p-retry + AbortError (GREEN)

3. **Task 3 (rate-limiter invariant test)**
   - `ea7bd5a` test(01-02): add rate-limiter 5s-spacing invariant test (Pitfall 1 guard)

**Deviation fix:**
- `37559c4` fix(01-02): match p-retry v8 RetryContext shape in onFailedAttempt callback

## Files Created/Modified

### Created
- `src/lib/scraper/gate.ts` — Pure fail-closed predicate `firstScrapeAllowed(env)` exported as the D-21 pre-prod gate.
- `src/lib/scraper/rate-limiter.ts` — Module-level PQueue singleton `sourceQueue` enforcing 5s spacing.
- `src/lib/scraper/lock.ts` — `withScrapeLock<T>(fn, path?)` wrapper using proper-lockfile; `ensureLockTarget()` auto-creates the lock file on first use.
- `src/lib/scraper/robots.ts` — `isAllowed(url, userAgent)` with 24h per-host cache via robots-parser; exports `_clearRobotsCache()` for tests.
- `src/lib/scraper/fetcher.ts` — `fetchPage(date)` + `USER_AGENT` const. Internally: robots check → p-retry wrapper → fetch with 30s timeout → 4xx throws AbortError, 5xx throws regular Error (retries), 2xx returns body text.
- `tests/helpers/fetch-stub.ts` — `stubFetch(responses)` / `restoreFetch()` helpers with queued + sticky-last-response behavior. Reusable by Plan 01-05 pipeline tests.
- `tests/unit/scraper/gate.test.ts` — 6 assertions on D-21 fail-closed semantics.
- `tests/unit/scraper/fetcher.test.ts` — 5 assertions: UA has `+http`, URL shape correct, 4xx no-retry, 200 returns body, 503→200 retries.
- `tests/unit/scraper/rate-limiter.test.ts` — 1 empirical timing assertion (≥5000ms between two tasks).

### Modified
- `package.json` — added `cheerio`, `p-queue`, `p-retry`, `proper-lockfile`, `robots-parser`, `zod` as runtime deps; `tsx`, `@types/proper-lockfile` as dev deps; `backfill` npm script (target file arrives in Plan 01-06).
- `package-lock.json` — regenerated by `npm install`.

## Exact USER_AGENT String Committed

```
FishCountBot/0.1 (+https://github.com/kaikai/fish-count; contact: liukk1211@gmail.com)
```

- Contains `+http` (ING-02 invariant) — grep-verified (returns 2 matches in fetcher.ts — code + comment).
- Contact link is an existing GitHub repo path + operator's email (per CLAUDE.md user email).

## Module Signatures (downstream contracts for Plan 01-05)

```typescript
// rate-limiter.ts
export const sourceQueue: PQueue; // { concurrency:1, intervalCap:1, interval:5000 }

// lock.ts
export async function withScrapeLock<T>(
  fn: () => Promise<T>,
  path?: string
): Promise<T>;

// gate.ts
export function firstScrapeAllowed(env?: NodeJS.ProcessEnv): boolean;

// robots.ts
export async function isAllowed(url: string, userAgent: string): Promise<boolean>;
export function _clearRobotsCache(): void; // test-only

// fetcher.ts
export const USER_AGENT: string; // contains '+http'
export async function fetchPage(date: string): Promise<string>; // throws on HTTP error
```

## Decisions Made

- **URL written as one literal string** — `SOURCE_URL_PREFIX = 'https://.../boats.php?date='` instead of composing `base + '?date='` so grep-based invariant checks (e.g., `grep -c "boats.php?date="`) match without extra effort. No behavior change.
- **robots.txt failure defaults to ALLOWED (with warning log)** — conventional robots-parser semantics. The source operator has been notified via OUTREACH-EMAIL.md (D-20) per the multi-layer polite-scraping contract, so robots.txt being unreachable is not the only safeguard.
- **Rate-limiter test uses REAL timers** — p-queue's internal scheduling cannot be observed under `vi.useFakeTimers()` without re-implementing it, and Pitfall 1 (deal-breaker severity) mandates the invariant be empirically guarded. 5s wall-clock cost accepted.
- **fetch-stub helper is a test-package primitive** — keeping it under `tests/helpers/` (not inside a test file) so Plan 01-05 pipeline tests can reuse it without copy-paste.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] p-retry v8 RetryContext signature mismatch**
- **Found during:** Post-Task-2 `npm run check` pass (svelte-check reported type error)
- **Issue:** Plan specified `onFailedAttempt: (err) => logger.warn({ attempt: err.attemptNumber, err: err.message, url }, ...)` — but p-retry@8.0.0 passes a `RetryContext` object with `{ error, attemptNumber, retriesLeft, retriesConsumed, retryDelay }` where the error lives at `.error`, not the callback parameter itself.
- **Fix:** Renamed parameter to `ctx` and accessed `ctx.error.message` + `ctx.attemptNumber`.
- **Files modified:** `src/lib/scraper/fetcher.ts`
- **Verification:** `npm run check` now shows only the two pre-existing errors (vite.config.ts and billing.ts — already documented in `.planning/phases/01-ingest-store/deferred-items.md`); `npm run test:run -- tests/unit/scraper/fetcher.test.ts` still green (5/5).
- **Committed in:** `37559c4` (separate fix commit after Task 3 since discovered during final verification)

---

**Total deviations:** 1 auto-fixed (Rule 1 bug: API signature mismatch)
**Impact on plan:** Zero scope creep — the fix is a 2-line adjustment to match the installed library version. The bug was latent (logger call would fail at runtime only when a 5xx retry occurred) and the typecheck caught it before any retry path executed in production.

## Issues Encountered

- **Initial vitest run failed with `Cannot find module './.svelte-kit/tsconfig.json'`** — resolved by running `npx svelte-kit sync` to generate the missing `.svelte-kit/tsconfig.json`. This is expected first-run behavior on a fresh worktree, not a bug.
- **None otherwise** — the five-module design made each piece independently testable; no cross-module debugging was needed.

## Known Constraint

- **Rate-limiter test takes ~5s wall time.** This is documented in the test comment and is the only way to empirically guard Pitfall 1 (deal-breaker severity). Plan 01-05's pipeline test will NOT duplicate this — it stubs fetches and does not go through `sourceQueue.add` directly, so pipeline tests run fast.

## Next Plan Readiness

- **Plan 01-03 (parser):** Independent — operates on HTML strings, does not touch these modules.
- **Plan 01-04 (snapshot):** Already implemented in Phase 0 scaffolding (`src/lib/scraper/snapshot.ts`). May need verification work only.
- **Plan 01-05 (pipeline orchestrator):** Primary consumer. Imports all five exports plus the DAL from Plan 01-01:
  1. `firstScrapeAllowed(process.env)` — first gate (D-21)
  2. `scrapingEnabled(process.env)` — second gate (OPS-05 Phase 0)
  3. `withScrapeLock(async () => { ... })` — third gate (D-13 tier 2)
  4. Inside lock: `sourceQueue.add(() => fetchPage(date))` — tier 1 rate limit + polite fetch
  5. Then `writeSnapshot(date, html)` (Plan 01-04) before parse (D-17 raw-evidence invariant)
  6. Then `parsePage(html)` (Plan 01-03) → DAL upserts (Plan 01-01)
- **Plan 01-06 (backfill CLI):** Imports via relative `../src/lib/scraper/*.ts` paths (no `$lib` alias under tsx per 01-PATTERNS.md line 438). `backfill` npm script already wired.

**No blockers for subsequent plans.**

## Threat Flags

None — all new surface is addressed by the plan's `<threat_model>` register (T-01-07 through T-01-12). No new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

Verified post-write:

**Files created (9/9 found):**
- `src/lib/scraper/gate.ts` ✓
- `src/lib/scraper/rate-limiter.ts` ✓
- `src/lib/scraper/lock.ts` ✓
- `src/lib/scraper/robots.ts` ✓
- `src/lib/scraper/fetcher.ts` ✓
- `tests/helpers/fetch-stub.ts` ✓
- `tests/unit/scraper/gate.test.ts` ✓
- `tests/unit/scraper/fetcher.test.ts` ✓
- `tests/unit/scraper/rate-limiter.test.ts` ✓

**Commits (6/6 found in log):** 81bc440, 19be9b7, f3baff5, 2beb259, ea7bd5a, 37559c4.

**Plan-level verification checks (5/5 pass):**
1. `npm run test:run -- tests/unit/scraper/` → 4 files, 18 tests, all green
2. `npm ls cheerio zod p-queue p-retry proper-lockfile robots-parser tsx` → all resolved, no UNMET
3. `grep -c "+http" src/lib/scraper/fetcher.ts` → 2 (ING-02 invariant)
4. `grep -c "=== 'true'" src/lib/scraper/gate.ts` → 2 (D-21 fail-closed)
5. Rate-limiter timing test duration: 5017ms (≥4500ms real-timer enforcement)

**Acceptance criteria (Task 1/2/3):** All met. See inline `<acceptance_criteria>` on each task + verification commands run during execution.

---

*Phase: 01-ingest-store*
*Plan: 02*
*Completed: 2026-04-24*
