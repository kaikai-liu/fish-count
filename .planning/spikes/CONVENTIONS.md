# Spike Conventions

Patterns and stack choices established across spike sessions. New spikes
follow these unless the question specifically requires otherwise.

## Stack

- **Language:** TypeScript via `tsx` (no build step, no transpilation).
- **DB access:** `better-sqlite3` directly against `data/dev.sqlite3` in
  read-only mode. Hardcode the path; do not import the production
  `$lib/db/client.ts` (carries SvelteKit-specific config).
- **Output:** dual — write `data.json` (raw numbers for downstream use) and
  `report.md` (human-readable answers).
- **Charts:** if a spike needs a quick visual, use `echarts` (already a
  project dependency) inside a single static HTML file; no Vite, no UI
  framework.

## Structure

```
.planning/spikes/NNN-descriptive-name/
  README.md     -- frontmatter, what/how/results
  analyze.ts    -- the spike script
  data.json     -- raw output
  report.md     -- copy of human-readable answers (also copied to .planning/notes/)
```

If the spike's report is consumed by a downstream phase plan (e.g. Phase 7.5),
also copy the report to `.planning/notes/<phase>-spike-report.md` so
plan-phase can `<files_to_read>` it without spelunking the spikes tree.

## Patterns

- **Date math:** hardcode `TODAY` from project context (CLAUDE.md
  `currentDate`) rather than `new Date()` so spike runs are reproducible.
- **"Trip" definition:** in `catch_reports`, a trip is the unique tuple
  `(source_date, boat_id, trip_type)`. Species rows are sub-rows.
  `angler_count` is duplicated across the species rows of one trip so use
  `MAX(angler_count)` (not `SUM`) when collapsing.
- **Sparse-data handling:** when n is small (≤5 trips), percentile metrics
  collapse to the single max value. Always print n alongside any
  percentile so readers can judge.

## Tools & Libraries

- `better-sqlite3@^12` — sync, no callback boilerplate, ideal for spikes.
- `tsx` — already a devDep; run with `npx tsx .planning/spikes/NNN-*/analyze.ts`.
- Avoid: full Vite preview servers, route handlers, anything that requires
  starting the dev app. Spikes should be runnable in a single command.
