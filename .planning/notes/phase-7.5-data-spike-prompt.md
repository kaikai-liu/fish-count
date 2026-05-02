---
title: Phase 7.5 data-exploration spike prompt
date: 2026-05-01
context: /gsd-explore session after Phase 7 ship — operator wants real scraped data informing Phase 7.5 (Home & Discovery) scope before plan-phase
related_phases: [7.5]
status: ready for /gsd-spike
---

# Phase 7.5 data-exploration spike prompt

The operator wants to see the real scraped data before locking Phase 7.5
scope. Designing "top boats per trip type" lists without first looking at
the actual data distributions is how you ship a list with 2 boats in it
because Long Range only runs twice a week.

This note is the prompt for a `/gsd-spike` session that should run **before**
Phase 7.5 plan-phase.

## Spike goals

Answer questions whose answers shape the home page design. Each question
below should produce either a number, a small table, or a throwaway
chart/screenshot in the spike report.

### Trip-type volume

1. How many distinct trip types appear in the past 7 / 30 / 90 days?
2. For each trip type, how many trips landed in the past 7 days? In the
   past 30?
3. Which trip types have **enough trips for a meaningful top-N list** in a
   7-day window? (rough threshold: ≥5 trips, but the spike confirms.) Which
   trip types are too sparse and need a longer window — or should be
   omitted entirely from the home page?
4. Are there any trip types with surprising names — typos, edge cases, or
   one-offs we should normalize or filter?

### Fish-per-angler distributions per trip type

For each "viable" trip type identified above:

5. What's the median fish/angler in the past 7 days? The 90th percentile?
   The max?
6. What's the typical row scale? (e.g. 1/2 Day AM might run 0.5–8
   fish/angler; Long Range might run 5–80.) Knowing the scale shapes the
   display — do we need bar widths normalized per trip type, or is one
   global scale OK?
7. Are there outliers we'd want to flag (e.g. a single-trip "best of" that
   would dominate a top-N list because n=1)? What's the right minimum-trip
   threshold per row?

### Species data richness

8. How many distinct species appear in the past 7 days fleet-wide?
9. What's the catch-volume distribution across species? Are there 5 species
   that dominate, or a long tail?
10. Is "top species this week" meaningful as a section, or is it always the
    same 3–5 species (calico bass, calico bass released, whitefish, …)?
11. Are released species worth a separate treatment? (Phase 6 already
    distinguishes "calico bass" vs "calico bass released" as separate
    species rows.)

### Edge cases

12. Boats with 0 anglers — do they exist in the data? How do we handle them?
13. Boats with anglers but 0 caught — should they appear in top lists at all?
14. Trip types that overlap in meaning ("1/2 Day" vs "1/2 Day AM" vs "1/2
    Day PM") — are they distinct in our data?
15. Any data quality issues we should know about before building?

### Cross-cutting

16. What's a sensible "recent" window for the *first* version of the home
    page? (Operator picked past 7 days; the spike confirms or pushes back.)
17. Sample composition: if we did "top 5 boats per trip type, past 7 days,
    fish/angler ranked," roughly how big is the resulting page (number of
    sections × rows)? Worth a screenshot of a static mock to gauge feel.

## Spike output

A spike report at `.planning/notes/phase-7.5-spike-report.md` (or wherever
`/gsd-spike` writes its output) covering each question above with a short
answer and supporting evidence (queries used, sample numbers, screenshots
of throwaway charts).

That report then becomes a `<files_to_read>` input for the eventual Phase
7.5 plan-phase session.

## Out of scope for the spike

- Final UI design (that's Phase 7.5 plan-phase + UI-spec)
- Performance optimization (raw queries are fine for the spike)
- Production-ready code (throwaway notebook-style is the point)
- Anything about `/compare` UX, v1 retirement timing — those are separate
  notes
