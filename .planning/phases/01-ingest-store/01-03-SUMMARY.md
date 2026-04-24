---
phase: 01-ingest-store
plan: 03
subsystem: scraper

tags: [zod, cheerio, parser, fixtures, tdd, ing-06]

# Dependency graph
requires:
  - phase: 01-ingest-store
    plan: 01
    provides: parseFailures DAL repository (ParseFailure shape shared with parser.ts)
provides:
  - "CatchRowSchema — Zod schema normalizing species (lowercase+trim) and preserving trip_type verbatim"
  - "CatchRow type — inferred from schema, consumed by Plan 01-05 upsert pipeline"
  - "parsePage(html) — pure HTML→{rows, failures} transform, never throws"
  - "ParseFailure interface (row_index + raw_html_snippet + zod_error) — feeds DAL parse_failures table"
  - "4 HTML fixtures (typical, empty-day, released-qualifier, parse-edge-mangled) + golden expected.json"
affects: [01-04-fetcher, 01-05-pipeline, 01-07-sla, 02-browse-ui]

# Tech tracking
tech-stack:
  added: [cheerio@1.2.0, zod@3.25.76]
  patterns:
    - "Per-row Zod safeParse + quarantine-continue (D-07)"
    - "Cheerio load wrapped in try/catch for non-throw contract defense-in-depth"
    - "Global row counter across panels for unique failure row_index"
    - "Schema transform as single source of truth for D-03 normalization"

key-files:
  created:
    - src/lib/scraper/schema.ts
    - src/lib/scraper/parser.ts
    - tests/unit/scraper/schema.test.ts
    - tests/unit/scraper/parser.test.ts
    - tests/fixtures/scraper/2024-08-15-typical.html
    - tests/fixtures/scraper/2024-08-15-typical.expected.json
    - tests/fixtures/scraper/2026-12-25-empty-day.html
    - tests/fixtures/scraper/2024-01-15-released-qualifier.html
    - tests/fixtures/scraper/parse-edge-mangled.html
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Species D-03 normalization lives in the schema transform, not the parser (single source of truth)"
  - "Released qualifier stored verbatim as distinct species row per OQ-1 resolution"
  - "source_url / landing_source_url added now (OQ-2) to unblock Phase 2 BRW-02 without migration"
  - "Empty-day fixture synthesized because live endpoint falls back to today's data for future dates"
  - "Global row_index counter across the whole page so failures are uniquely identifiable"

patterns-established:
  - "Pure-function scraper modules: no I/O, no DB, no network — trivially fixture-testable"
  - "RED→GREEN commit sequence per task (test commit precedes feat commit for parser)"
  - "SHA256-pinned HTML fixtures committed under tests/fixtures/scraper/ for regression"

requirements-completed: [ING-06]

# Metrics
duration: ~15min
completed: 2026-04-24
---

# Phase 01 Plan 03: Parser + Zod Schema + Fixtures Summary

**Pure HTML → CatchRow[] transform with per-row Zod quarantine — 4 real/synthetic fixtures green, 74 valid rows from live 2024-08-15 capture with zero parse failures.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-24T15:23:00Z
- **Completed:** 2026-04-24T15:32:32Z
- **Tasks:** 2
- **Files created:** 9
- **Files modified:** 2 (package.json, package-lock.json)

## Accomplishments

- **CatchRowSchema** (Zod) wired to D-03 (species lowercased+trimmed) and D-08 (trip_type verbatim) with optional `source_url` / `landing_source_url` for Phase 2 BRW-02 backlinks.
- **parsePage** walks `div.panel > table.table-stripped > tbody > tr`, expands each row's dock-totals cell into N species-fragments, Zod-validates each candidate, and quarantines shape/Zod failures with `row_index + raw_html_snippet + zod_error`. Zero `throw` statements in the module; `cheerio.load()` additionally wrapped in try/catch for defense-in-depth.
- **4 fixtures committed:** 2024-08-15 typical (live capture, 20KB, 28 tr rows → 74 valid CatchRows), 2024-01-15 released-qualifier (live capture, 2 distinct "released" variants seen), 2026-12-25 empty-day (synthesized; see deviation), parse-edge-mangled (synthesized 2-row mix).
- **Golden snapshot** `2024-08-15-typical.expected.json` with 6 representative rows, `min_rows=10`, `failures_expected=0` — subset-match regression anchor for Plan 01-05 integration test.
- **"Released" resolution** verified end-to-end: "15 Spiny Lobster Released" parses to a distinct row `{species: "spiny lobster released", species_count: 15}` alongside the non-released "spiny lobster" rows.
- **All 32 new tests green** (16 schema + 16 parser); full suite 118/118.

## Task Commits

1. **Task 1: schema.ts + 4 fixtures + expected.json** — `79de661` (feat; includes schema.test.ts)
2. **Task 2 RED: parser.test.ts failing** — `261ab0c` (test)
3. **Task 2 GREEN: parser.ts implementation** — `83f9454` (feat)

Total: 3 commits. Task 2 followed a strict RED→GREEN TDD sequence with independent commits.

## Fixture Manifest

| File | Origin | Size | SHA256 |
|------|--------|------|--------|
| `2024-08-15-typical.html` | live curl 2026-04-23 | 20,417 B | `8f332637a608aeebb50fd32356ac00c7b0452fb40c00e66defa83ab36e081c86` |
| `2024-08-15-typical.expected.json` | manually curated | 1,500 B | `41d71783dc35b21822f4905ec1743658da54da76d037f7f6a185a9b4b5482a39` |
| `2024-01-15-released-qualifier.html` | live curl 2026-04-23 | 11,783 B | `0dee55139506b8ed4eb446fc962404fa779fe6078836b80077eac79027d60ad8` |
| `2026-12-25-empty-day.html` | synthesized | 998 B | `fc4e91f23040dcb5bfe4b2fb644251fb496d094922adb8768eb513ab87730345` |
| `parse-edge-mangled.html` | synthesized | 1,094 B | `8f72c09c5a63825fc1996eed42844b67c96dfe459fd0f2c08a7cfe7649601d7e` |

Polite scraping honored: 3 live fetches with 6s sleep between each, custom User-Agent `FishCountBot/0.1 (+https://github.com/kaikai/fish-count; contact: liukk1211@gmail.com)`.

## Parsed-Row Counts (for Plan 01-05 integration-test assertions)

| Fixture | parsePage().rows.length | parsePage().failures.length |
|---------|------------------------:|-----------------------------:|
| 2024-08-15-typical.html | **74** | 0 |
| 2024-01-15-released-qualifier.html | **15** | 0 |
| 2026-12-25-empty-day.html (synth) | 0 | 0 |
| parse-edge-mangled.html (synth) | 2 | ≥1 |

Distinct "released" species variants observed in 2024-01-15 capture: `spiny lobster released`, `sand bass released`.

## "Released" Qualifier Handling (Open Question 1 resolution, locked)

Source cells contain fragments like `"15 Spiny Lobster Released"` (after Cheerio `.text()` strips `<font color="red">`). The parser:

1. Splits `td[2].text()` on commas.
2. Matches each fragment against `/^(\d+)\s+(.+)$/`.
3. Feeds `m[2]` (the remainder — which may end in `" Released"`) as the `species` field.
4. The schema's `.toLowerCase().trim()` transform converts it to e.g. `"spiny lobster released"`.

Result: `"spiny lobster"` and `"spiny lobster released"` are **distinct species rows** in `catch_reports`, preserving the source data verbatim. Merging (if ever wanted) is a Phase 2 display-layer concern.

## Files Created/Modified

- `src/lib/scraper/schema.ts` — Zod CatchRowSchema + CatchRow type (52 lines)
- `src/lib/scraper/parser.ts` — parsePage + ParseFailure interface (141 lines)
- `tests/unit/scraper/schema.test.ts` — 16 Zod tests (199 lines)
- `tests/unit/scraper/parser.test.ts` — 16 parser tests (178 lines)
- `tests/fixtures/scraper/{2024-08-15-typical,2024-01-15-released-qualifier,2026-12-25-empty-day,parse-edge-mangled}.html` — 4 fixtures
- `tests/fixtures/scraper/2024-08-15-typical.expected.json` — golden snapshot
- `package.json` + `package-lock.json` — added cheerio@1.2.0 and zod@3.25.76

## Decisions Made

1. **Schema transform over parser normalization** — D-03 lowercase+trim lives in `CatchRowSchema.species.transform`, not in the parser. Parser feeds raw strings; schema is the single source of truth. Rationale: anyone hand-building a CatchRow candidate outside the parser still gets the transform for free.
2. **Optional source_url / landing_source_url on the schema** — planner-authorized in OQ-2; populated from row anchors in the parser. Future-proofs BRW-02 without a Phase 2 migration.
3. **Global row_index counter** — continues across panels (not per-panel) so every `ParseFailure.row_index` is globally unique on a given page. Matches the plan's action spec.
4. **Synthetic empty-day fixture** — see Deviation #1.
5. **Cheerio.load wrapped in try/catch** — Cheerio's tolerant parser shouldn't throw, but the parser's non-throw contract is load-bearing (Pitfall 2: silent failure). Defense-in-depth costs nothing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Synthesized the 2026-12-25-empty-day fixture**
- **Found during:** Task 1 fixture capture
- **Issue:** The plan's action script assumed a future date (`?date=2026-12-25`) would return a zero-row page. Live probe proved otherwise: the source site falls back to today's data (11 boat-rows) for future/invalid dates. Capturing that verbatim would have produced a second "typical" fixture, not an empty-day fixture.
- **Fix:** Synthesized `2026-12-25-empty-day.html` per the plan's own fallback clause ("executor MUST synthesize the fixtures from the verbatim HTML structure"). The synthetic fixture has well-formed HTML, a `<div class='panel'>` pager panel (matching real-site structure for non-data panels), and zero `<tr>` rows. This correctly exercises the parser's empty-page branch.
- **Files modified:** `tests/fixtures/scraper/2026-12-25-empty-day.html` (synthesized)
- **Verification:** `parsePage(empty_day_html)` returns `{rows: [], failures: []}` — asserted by 2 tests.
- **Committed in:** `79de661` (part of Task 1)

**2. [Rule 3 - Blocking] Installed cheerio + zod dependencies**
- **Found during:** Task 1 setup
- **Issue:** Neither cheerio nor zod was in `package.json` — STACK.md declares them but Phase 0 didn't install them.
- **Fix:** `npm install cheerio@^1.2.0 zod@^3.24.0` → installed cheerio@1.2.0 and zod@3.25.76.
- **Files modified:** `package.json`, `package-lock.json`
- **Verification:** Schema imports from `zod`, parser imports from `cheerio`; full test suite green.
- **Committed in:** `79de661` (part of Task 1)

**3. [Rule 2 - Missing Critical] `cheerio.load()` try/catch wrapper in parser.ts**
- **Found during:** Task 2 GREEN implementation
- **Issue:** The plan's verbatim code (from RESEARCH §Code Examples) calls `cheerio.load(html)` unguarded. Cheerio is documented as tolerant, but the parser's non-throw contract is load-bearing for Pitfall 2 (silent-failure detection). If cheerio ever throws on truly pathological input, the whole scrape pipeline would turn a page-level issue into an unhandled rejection and lose the scrape_runs ledger row.
- **Fix:** Wrapped `cheerio.load()` in a try/catch that returns `{rows: [], failures: []}` on any throw. Pipeline's "non-empty HTML, zero rows" heuristic in Plan 01-05 will still classify this as `parse_error` outcome — strictly better than a thrown exception.
- **Files modified:** `src/lib/scraper/parser.ts`
- **Verification:** 3 robustness tests cover empty string, minimal HTML skeleton, and non-HTML garbage; none throw.
- **Committed in:** `83f9454` (Task 2 GREEN commit)

---

**Total deviations:** 3 auto-fixed (1 missing dependency, 1 blocking fixture synthesis, 1 defense-in-depth addition)
**Impact on plan:** Every auto-fix was either anticipated by the plan itself (dep install, fixture synthesis fallback) or a tightening of the non-throw contract. Zero scope creep; all changes serve Plan 01-03's ING-06 silent-failure goal.

## Issues Encountered

- **Network path through the worktree:** The worktree has its own `node_modules` so package install is idempotent per worktree. No issue after `npm install` in the correct cwd.
- **svelte-kit sync required:** First `npm run test:run` failed with "Cannot find module './.svelte-kit/tsconfig.json'". Resolved by running `npx svelte-kit sync` once to generate the SvelteKit-managed tsconfig extension.

## TDD Gate Compliance

Task 2 followed a strict plan-level RED→GREEN sequence visible in `git log`:

```
83f9454 feat(01-03): implement parsePage ...   # GREEN
261ab0c test(01-03): add failing tests ...     # RED
79de661 feat(01-03): add CatchRowSchema ...    # Task 1 (schema+fixtures+tests as one cohesive unit)
```

Task 1 grouped its failing schema tests + fixtures + schema.ts into a single commit per the plan's Task 1 scope (the plan lists schema.ts AND the fixture files AND the expected.json as Task 1 artifacts). The schema tests failed against the non-existent `../src/lib/scraper/schema` import before schema.ts was written, then passed — this was verified by the `vitest` run showing "Cannot find module ../src/lib/scraper/schema" for the exact test file, followed by 16/16 green.

## Verification

All plan verification steps pass:

1. `npm run test:run -- tests/unit/scraper/parser.test.ts` → **16/16 green**
2. `ls tests/fixtures/scraper/*.html | wc -l` → **4** (≥4 required)
3. `grep -c "throw " src/lib/scraper/parser.ts` → **0** (quarantine-only contract)
4. `grep -c "safeParse" src/lib/scraper/parser.ts` → **1**
5. `grep -c "failures.push" src/lib/scraper/parser.ts` → **2** (shape + Zod)
6. Full suite: **118/118 green** (15 test files)

## Next Phase Readiness

- Plan 01-04 (fetcher) can import `parsePage` from `./parser.ts` via relative path.
- Plan 01-05 (pipeline integration) has:
  - `parsePage` signature locked.
  - Fixture file paths + expected row counts for integration-test assertions.
  - `ParseFailure` shape matching the DAL's `parseFailures.recordMany` input.
- Plan 01-07 (SLA) should be aware: `outcome='parse_error'` is triggered by pipeline (not parser) when `rows.length === 0 && failures.length === 0 && !looksLikeStructuredPage`. The parser itself is structurally silent about "looks-wrong-but-parsed-zero" — that's intentional.

## Self-Check: PASSED

- ✓ `src/lib/scraper/schema.ts` exists
- ✓ `src/lib/scraper/parser.ts` exists
- ✓ 4 fixture HTML files + 1 expected.json on disk at `tests/fixtures/scraper/`
- ✓ `tests/unit/scraper/schema.test.ts` + `parser.test.ts` exist
- ✓ Commit `79de661` in git log (Task 1)
- ✓ Commit `261ab0c` in git log (Task 2 RED)
- ✓ Commit `83f9454` in git log (Task 2 GREEN)
- ✓ `npm run test:run` exits 0, 118/118 tests pass
- ✓ STATE.md / ROADMAP.md NOT modified (per parallel-execution contract)

---
*Phase: 01-ingest-store*
*Completed: 2026-04-24*
