---
spike: 001
name: phase-7.5-data-exploration
type: standard
validates: "Given the dev sqlite DB, when we run quantitative queries against the past 7/30/90 days of catch_reports, then concrete numbers, viable trip-type lists, and threshold recommendations emerge to scope the Phase 7.5 home page"
verdict: VALIDATED
related: []
tags: [data, phase-7.5, home, exploration]
---

# Spike 001: Phase 7.5 data exploration

## What This Validates

**Given** `data/dev.sqlite3` (17,337 catch_reports rows spanning
2025-02-26 → 2026-04-30, today = 2026-05-01),
**When** we run aggregate queries answering the 17 questions in
`.planning/notes/phase-7.5-data-spike-prompt.md` against past-7/30/90-day
windows,
**Then** Phase 7.5 plan-phase has concrete numbers (trip-type counts,
fish/angler distributions, species volumes), viable-trip-type filters,
and threshold recommendations to scope the home page.

## Research

No external libraries researched — the spike is pure SQL against the
project's existing `better-sqlite3` dependency. Schema reviewed in
`src/lib/db/migrations.ts` (catch_reports row = one
`(date, boat, trip_type, species)` tuple; `angler_count` is duplicated
across species rows of one trip, so collapse with `MAX`).

## How to Run

```bash
npx tsx .planning/spikes/001-phase-7.5-data-exploration/analyze.ts
```

Reproducible: `TODAY` is hardcoded to `2026-05-01` in the script. Output
goes to `data.json` (raw numbers) and console (summary). Findings narrative
lives in `report.md` (also copied to `.planning/notes/`).

## What to Expect

Console output ends with the viable trip-type list:

```
Viable trip types 7d (≥5): [
  '1/2 Day AM (17)',
  'Full Day Coronado Islands (10)',
  '1/2 Day PM (8)',
  '1.5 Day (6)',
  'Full Day (5)',
  '3 Day (5)',
  '2 Day (5)'
]
```

Every count above is reproducible from the same dev DB.

## Investigation Trail

1. **First pass** — wrote `analyze.ts` to answer Q1-Q17 in one script.
   Hardcoded `TODAY = 2026-05-01` so the spike is reproducible from this
   snapshot of the dev DB. All queries read-only.
2. **Surprise #1 (Q4)** — "Full Day Coronado Islands" appeared in the 7d
   viable list with 10 trips, but the same 10 trips also covered the
   90d window. That's impossible for a normal trip type. Probed
   `MIN(source_date)` for every trip type and confirmed the label is
   only 4 days old (first seen 2026-04-27).
3. **Smoking gun (Q4 follow-up)** — joined `catch_reports` to `boats`
   for the three boats now running "Full Day Coronado Islands"
   (San Diego, Grande, Mission Belle) and found they ran "Full Day" up
   to 2026-04-26. Source site relabeled mid-stream. This is a real
   data-integrity issue Phase 7.5 must handle.
4. **Surprise #2 (Q4)** — "Long Range" is in CLAUDE.md domain language
   but does not appear in 14 months of scraped data under any obvious
   variant. Could be off-season, naming mismatch, or absent from the
   source site for SD landings. Flagged for operator confirmation.
5. **Q10 reframe** — initial expectation: "top species this week" is a
   useful section. Data showed 9/10 overlap with 30d top-10, so the
   leaderboard framing is dull. Reframed in the report as a rank-shift
   signal (which IS interesting — yellowtail moved past bluefin in 7d)
   or recommended omission for v1.
6. **Q5/Q6 scale check** — fish/angler scale spans Overnight ≈1 to
   3.5 Day ≈35. Per-section bar normalization is necessary; a global
   axis would compress short trips to invisibility. Promoted to a
   Requirements bullet in MANIFEST.md.
7. **Q12/Q13/Q15 zero results** — checked thoroughly anyway. Zero
   zero-angler trips, zero skunked trips, zero data-quality issues in
   the entire 14-month dataset. Phase 6 ingest hardening is doing its
   job. Phase 7.5 can trust shape.

## Results

**Verdict: VALIDATED ✓** — every question answered with a concrete number
or short ranked list. Findings are in `report.md` (the artifact Phase 7.5
plan-phase should `<files_to_read>`).

Headline findings (full detail in report.md):

- **7 viable trip types** at the operator's chosen 7d/≥5 threshold;
  4 sparse types should be hidden in 7d view.
- **30 rows total** for "top-5 boats per viable trip type, past 7d,
  fish/angler" — a focused, scrollable home page.
- **Per-trip-type bar normalization is required** (~30× scale variance
  between trip types).
- **Source-label drift is real and just happened** — "Full Day" → "Full
  Day Coronado Islands" rename on 2026-04-27. Phase 7.5 must model
  trip-type labels as non-stable.
- **"Long Range" gap** between operator vocab and source data needs
  operator confirmation before plan-phase relies on it.
- **Data quality is clean** across 14 months — no skunked-trip or
  zero-angler defensive code needed in v1.

Three Requirements promoted to MANIFEST.md from these findings:
viable-trip-type filter, per-trip-type bar normalization,
source-label-drift handling, released-species-stay-separate.
