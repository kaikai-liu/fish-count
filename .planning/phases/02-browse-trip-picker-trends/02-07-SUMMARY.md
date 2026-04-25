---
phase: "02-browse-trip-picker-trends"
plan: "07"
subsystem: "integration"
status: "awaiting-uat"
tags: ["seed-dev-db", "integration-test", "lint", "per-angler-discipline", "anti-feature"]
dependency_graph:
  requires: ["02-01", "02-02", "02-03", "02-04", "02-05", "02-06"]
  provides: ["seed-dev-db", "integration-smoke", "per-angler-discipline-lint", "anti-feature-lint"]
  affects: ["phase-3-forecast"]
tech_stack:
  added: []
  patterns: ["fixture-replay seed", "static-grep lint", "cross-route integration smoke", "vi.resetModules env isolation"]
key_files:
  created:
    - scripts/seed-dev-db.ts
    - tests/unit/scripts/seed-dev-db.test.ts
    - tests/integration/phase2-routes.test.ts
    - tests/unit/lint/per-angler-discipline.test.ts
    - tests/unit/lint/anti-feature.test.ts
  modified:
    - package.json
decisions:
  - "Per-angler discipline lint uses Approach C (3-file allowlist) per checker feedback. SKIP_LINE_RE excludes comment/import/tag lines to avoid false positives on component names (PerAnglerMetric, PerAnglerFramingProvider) — only display-text literals are caught."
  - "Anti-feature lint skips comment lines — developer notes about what NOT to build (e.g. 'no sponsored slots') are compliance intent, not violations."
  - "Integration test seeds 90 days (2024-01-01 to 2024-04-01) for sufficient trends/compare/picker data density."
  - "Compare test uses URLSearchParams.append for boatIds (repeated keys) per parseCompareFilters sp.getAll contract."
  - "Picker test uses windowDays=7 not 30 (Zod schema caps at 14)."
metrics:
  duration: "10m"
  completed: "2026-04-25"
  tasks_completed: "2/3"
  files_created: 5
  files_modified: 1
  tests_added: 29
---

# Phase 02 Plan 07: Final Integration, Lint Guards, and UAT — Summary

**One-liner:** Dev fixture replay CLI (seed-dev-db.ts) + 18-test cross-route integration smoke + per-angler discipline lint (3-file allowlist, Approach C) + anti-feature lint, all green against full 368-test suite. UAT checkpoint pending operator sign-off.

---

## What Was Built

### Task 1: Dev Seed CLI (`scripts/seed-dev-db.ts`)

Replays committed HTML fixtures from `tests/fixtures/scraper/*.html` (4 files: `2024-01-15-released-qualifier.html`, `2024-08-15-typical.html`, `2026-12-25-empty-day.html`, `parse-edge-mangled.html`) through Phase 1's `parsePage()` → `upsertBoatsAndLandings()` → `upsertCatchReports()` → `recordOutcome()` pipeline across synthetic dates.

**parsePage adaptation:** `parsePage(html)` returns `{ rows: CatchRow[], failures: ParseFailure[] }` where each `CatchRow` has `source_name`, `landing_source_name`, `trip_type`, `angler_count`, `species`, `species_count`, `source_url?`, `landing_source_url?`. The script:
1. Calls `upsertBoatsAndLandings(db, rows)` → gets `{ boatIds, landingIds }` Maps
2. Maps `CatchRow → CatchReportRow` with synthetic `source_date = cursor`, resolving IDs via the Maps
3. Calls `upsertCatchReports(db, catchRows)` for the batch
4. Calls `recordOutcome(db, { ..., outcome: 'success', runId: 'seed-{date}' })`

**Security gates (T-02-34, T-02-35):**
- Refuses when `NODE_ENV === 'production'` (exit 1 + error log)
- Refuses when `DB_PATH === '/data/fishcount.sqlite3'` unless `ALLOW_SEED_ON_PROD_PATH=1`
- Zero network calls — fixture-only replay (T-02-35 accepted: no `fetch`/`undici`/`axios`)
- Zero SQL in this file — full DAL boundary compliance

**8 unit tests** covering: production gate, prod-DB-path gate, allow-prod-path override, successful 3-day run, idempotent re-run, invalid date, from>to, --help.

**`package.json` change:** Added `"seed:dev": "tsx scripts/seed-dev-db.ts"` entry.

### Task 2: Integration Test + Lint Guards

**`tests/integration/phase2-routes.test.ts` (18 tests):** Seeds a tmp DB with 90 days of fixture replay (2024-01-01 to 2024-04-01), then dynamically imports each route's `load()` function and asserts expected shapes:
- `/` — shape keys, cache-control, filterOptions populated
- `/date/[date]` — rows shape for known past date, 404 for invalid format, cache-control 86400
- `/picker` — guidance without filters, rankings+30-cell heatmap with valid filters, sorted desc
- `/boats/[id]` — profile shape, 404 for non-numeric/non-existent id
- `/compare` — guidance without filters, chartOption with valid 2-boat+tripType+range
- `/trends` — guidance without filters, chartOption with species+tripType+1y range
- `/about` — returns `{}`, sets cache-control 3600

**`tests/unit/lint/per-angler-discipline.test.ts` (2 tests, Approach C):**
- Scans `src/routes`, `src/lib/components`, `src/lib/copy` for `/fish\s*\/\s*angler|per[\s-]?angler/i`
- ALLOWLIST: `PerAnglerMetric.svelte`, `about/+page.svelte`, `src/lib/copy/metrics.ts`
- SKIP_LINE_RE excludes comment lines (`//`, `/*`, `*`, `<!--`, `-->`), import statements, component tags (`<PerAnglerMetric`, `</PerAnglerMetric`, `<PerAnglerFramingProvider`), and Svelte `setContext` calls — only display-text literals are caught
- Verifies all 6 canonical constants exist in `metrics.ts` (FISH_PER_ANGLER_AXIS, FISH_PER_ANGLER_ARIA, FISH_PER_ANGLER_TOOLTIP_UNIT, WEEKLY_FISH_PER_ANGLER_HEADING, BEST_DAY_UNIT, HEATMAP_LEGEND_HIGH)

**`tests/unit/lint/anti-feature.test.ts` (1 test):**
- Scans `src/routes` and `src/lib/components` for 13 forbidden patterns (ON FIRE, HOT BITE, flame/trophy/star/medal emojis, Sponsored, Featured, Promoted, Leaderboard, Top N this season, live update polling, manual scrape trigger)
- Skips comment lines to avoid false positives on developer compliance notes

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Per-angler discipline lint regex over-matched component names**

- **Found during:** Task 2 first test run
- **Issue:** Regex `/per[\s-]?angler/i` matched `PerAnglerMetric`, `PerAnglerFramingProvider` in import statements and JSX tags across multiple route/component files (false positives)
- **Fix:** Added `SKIP_LINE_RE` to exclude comment lines, import statements, SVG/component tags, and `setContext` calls — only catches display-text violations as intended
- **Files modified:** `tests/unit/lint/per-angler-discipline.test.ts`
- **Commit:** bc14c47

**2. [Rule 1 - Bug] Anti-feature lint flagged comment line in picker/+page.svelte**

- **Issue:** Line `// No SQL. No banned date idiom. No hype badges, no sponsored slots.` matched `Sponsored` pattern
- **Fix:** Added `COMMENT_RE` skip to anti-feature lint — developer compliance notes are not violations
- **Files modified:** `tests/unit/lint/anti-feature.test.ts`
- **Commit:** bc14c47

**3. [Rule 1 - Bug] Integration test picker test used windowDays=30 which fails Zod validation**

- **Issue:** `PickerFiltersSchema` has `z.coerce.number().int().min(0).max(14)` — passing `windowDays=30` causes Zod parse failure → guidance state returned instead of rankings
- **Fix:** Changed to `windowDays=7` (within Zod schema bounds)
- **Files modified:** `tests/integration/phase2-routes.test.ts`
- **Commit:** bc14c47

**4. [Rule 1 - Bug] Compare test passed boatIds as comma-separated value instead of repeated keys**

- **Issue:** `parseCompareFilters` uses `sp.getAll('boatIds')` expecting repeated keys like `?boatIds=1&boatIds=2`, not `?boatIds=1,2`
- **Fix:** Changed to `params.append('boatIds', ...)` pattern
- **Files modified:** `tests/integration/phase2-routes.test.ts`
- **Commit:** bc14c47

**5. [Rule 3 - Blocking] Missing `.svelte-kit/tsconfig.json` on fresh worktree**

- **Issue:** `.svelte-kit/tsconfig.json` was not present in the worktree (worktrees don't inherit `.svelte-kit/` generated files)
- **Fix:** Ran `npx svelte-kit sync` to generate the file; tests ran successfully after
- **Not a code change:** No files modified; the generated file is gitignored

---

## Test Results

```
Test Files  43 passed (43)
Tests       368 passed (368)
Duration    ~37s
```

**svelte-check:** 115 errors (unchanged from pre-plan baseline — all pre-existing in `src/lib/scraper/parser.ts`, `vite.config.ts`, `tests/unit/routes/*.test.ts`; plan 02-07 did not add new errors to source files)

---

## Task 3: UAT Status

**PENDING** — Operator manual walkthrough required (30-item checklist in VALIDATION.md).

See checkpoint below for instructions.

---

## Known Stubs

None introduced by this plan.

---

## Threat Flags

None introduced by this plan — no new network endpoints, auth paths, or file access patterns.

---

## Self-Check

Files created:
- scripts/seed-dev-db.ts — FOUND
- tests/unit/scripts/seed-dev-db.test.ts — FOUND
- tests/integration/phase2-routes.test.ts — FOUND
- tests/unit/lint/per-angler-discipline.test.ts — FOUND
- tests/unit/lint/anti-feature.test.ts — FOUND

Commits:
- 97388f9 (Task 1: seed-dev-db + test + package.json)
- bc14c47 (Task 2: integration + lint tests)
