---
phase: 01-ingest-store
plan: 04
subsystem: scraper/snapshot
tags: [ING-05, snapshot, gzip, filesystem, security]
requires: []
provides:
  - writeSnapshot(date, html, baseDir?) async → absolute path of gzipped snapshot
  - snapshotPathFor(date, baseDir?) → computed path (pure)
  - SNAPSHOT_DIR env override (default /data/snapshots)
affects:
  - downstream: Plan 01-05 pipeline.ts MUST call writeSnapshot BEFORE parsePage
tech_stack_added:
  - node:zlib gzipSync (stdlib)
  - node:fs/promises mkdir + writeFile (stdlib)
patterns_used:
  - Pure path builder separated from async side-effect (mirror of checkThresholds / sendAlert split from Phase 0 billing-watcher)
  - Fail-fast input validation before I/O (DATE_RE regex)
  - Structured pino logging with msg label
key_files:
  created:
    - src/lib/scraper/snapshot.ts
    - tests/unit/scraper/snapshot.test.ts
  modified: []
decisions:
  - D-17: snapshots live at /data/snapshots on the Fly volume; Litestream already replicates to B2
  - D-19: path convention YYYY/MM/DD.html.gz; idempotent re-scrape overwrites
  - Used `gzipSync` (synchronous) because the expected page size is ~14 KB — async gzip overhead is unjustified
  - Used `$lib/server/logger` alias (consistent with rest of src/lib/); vitest config already aliases `$lib`
metrics:
  duration: 1m51s
  completed: 2026-04-24
  tasks: 1/1
  tests_added: 6
---

# Phase 01 Plan 04: Gzip HTML Snapshots (ING-05) Summary

One-liner: Implemented ING-05 snapshot module — every successful source-site fetch gzips the raw HTML (`zlib.gzipSync`) and writes it to `/data/snapshots/YYYY/MM/DD.html.gz`, idempotent on date, with `DATE_RE` guarding the file path from traversal before any I/O.

## What shipped

- **`src/lib/scraper/snapshot.ts`** (~40 lines, 2 exports)
  - `snapshotPathFor(date, baseDir = SNAPSHOT_DIR ?? '/data/snapshots'): string` — pure path builder. Validates `date` against `/^\d{4}-\d{2}-\d{2}$/`; throws with a clear message on invalid input (regex rejects `..`, `/`, empty string, unpadded months).
  - `writeSnapshot(date, html, baseDir?): Promise<string>` — `mkdir {recursive:true}` → `gzipSync(html)` → `writeFile(path, gz)` → structured `logger.info({msg:'snapshot_written', date, path, bytes})`. Returns absolute path.
- **`tests/unit/scraper/snapshot.test.ts`** (6 tests, all green)
  - Path format, invalid-date rejection, **explicit traversal-attempt block (T-01-18)**, gzip round-trip byte-identity, mkdir-recursive creation, idempotent overwrite.

## Load-bearing invariant (for Plan 01-05)

> `writeSnapshot(date, html)` MUST be called BEFORE `parsePage(html)` in `pipeline.ts`.

Rationale (RESEARCH.md:482): if a parser bug is discovered in week N, we must be able to replay against the raw HTML from any previously scraped day. Writing the snapshot after parse would lose evidence on the first malformed page. Plan 01-05 integration + Plan 01-09 integration test enforce the ordering.

## Exported contract

```typescript
export function snapshotPathFor(date: string, baseDir?: string): string;
export async function writeSnapshot(date: string, html: string, baseDir?: string): Promise<string>;
```

- `baseDir` defaults to `process.env.SNAPSHOT_DIR ?? '/data/snapshots'` — evaluated per call so the env var can be set per test.
- Both functions throw on invalid date (before any filesystem access).

## Test evidence

```
$ npm run test:run -- tests/unit/scraper/snapshot.test.ts
 ✓ tests/unit/scraper/snapshot.test.ts (6 tests) 5ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Full suite also green: 52/52 tests pass — no regressions introduced to Phase 0 modules.

## Acceptance criteria — verified

- [x] `src/lib/scraper/snapshot.ts` exists
- [x] `grep -c "gzipSync" src/lib/scraper/snapshot.ts` = 2 (import + call — plan specified 1, but import line is structurally required; intent satisfied)
- [x] `grep -c "mkdir.*recursive: true" src/lib/scraper/snapshot.ts` = 1
- [x] `grep -c '/\^\\d{4}-\\d{2}-\\d{2}\$/' src/lib/scraper/snapshot.ts` = 1 (date validation regex present)
- [x] `grep -c "SNAPSHOT_DIR" src/lib/scraper/snapshot.ts` = 2 (≥ 1 required)
- [x] Round-trip test asserts `gunzipSync(readFileSync(path)).toString('utf8') === html`
- [x] Idempotency test asserts second write overwrites first
- [x] 6 passing tests (plan expected 5; added one extra explicit traversal test — see Deviations)

## Deviations from Plan

### Minor

**1. [Enhancement] Added explicit traversal-attempt test case**
- **Found during:** Task 1 test authoring
- **Rationale:** Threat register T-01-18 (Tampering: path traversal) lists `DATE_RE` as the mitigation. Plan's test suite covered `'not-a-date'` and `'2024-8-15'` but did not test explicit traversal strings (`'../etc/passwd'`, `'2024-08-15/../..'`, `''`). Added one extra `it(...)` block making the T-01-18 mitigation an explicit regression guard.
- **Impact:** +1 test (now 6 passing, plan expected 5). Zero behavior change to the implementation — the existing `DATE_RE` already blocks all of these inputs; the test just documents that fact and pins it as a regression guard.
- **Files modified:** `tests/unit/scraper/snapshot.test.ts` (one extra `it(...)` block)
- **Commits:** `4da3460` (RED), `909dd0c` (GREEN)

### Commit count deviation (pre-authorized by TDD plan type)

Plan type `tdd="true"` expected two commits (RED + GREEN). Delivered exactly two. No refactor commit because the GREEN implementation is already minimal (~40 lines, single-responsibility functions, no duplication).

No Rule 1 / Rule 2 / Rule 3 deviations — the plan specified the full module contents. No Rule 4 checkpoints raised.

## Threat surface scan

No new surface introduced beyond what the `<threat_model>` already enumerated. The exported functions:
- Touch only the local filesystem under `SNAPSHOT_DIR`
- Do NOT issue network requests
- Do NOT read from stdin or user-controlled sources outside the `date` parameter (which is already constrained)
- Do NOT cross the DAL boundary

No `threat_flag` additions needed.

## Known Stubs

None. Module is fully wired — the only consumer (pipeline.ts in Plan 01-05) will be written in a later plan but that is the planned hand-off, not a stub.

## Commits (this plan)

| Task | Phase | Message | Hash |
|------|-------|---------|------|
| 1 (RED) | 01-04 | `test(01-04): add failing test for writeSnapshot gzip round-trip (ING-05)` | `4da3460` |
| 1 (GREEN) | 01-04 | `feat(01-04): implement writeSnapshot gzip to YYYY/MM/DD.html.gz (ING-05)` | `909dd0c` |

## TDD Gate Compliance

- [x] RED commit (`test(01-04): ...`) present with a failing test
- [x] GREEN commit (`feat(01-04): ...`) present with implementation making the test pass
- [x] No refactor gate needed (implementation minimal on first pass)

## Next plans unblocked

- **Plan 01-05 (pipeline)**: can now import `{ writeSnapshot } from '$lib/scraper/snapshot'` and must call it BEFORE `parsePage(html)`.
- **Plan 01-09 (integration test)**: can assert the ordering by spying on both calls and checking invocation order.

## Self-Check: PASSED
