# Spike Manifest

## Idea

Inform Phase 7.5 (Home & Discovery) scope by exploring the actual scraped
catch data before plan-phase. Designing "top boats per trip type" lists
without first looking at real data distributions risks shipping a list with
2 boats in it because some trip types only run twice a week. Each spike
answers concrete questions whose answers shape the home page.

## Requirements

Design decisions that emerged from the spikes. Non-negotiable for the
Phase 7.5 build.

- **Viable-trip-type filter:** the home page must filter trip types by a
  minimum trip count in the chosen window. Sparse trip types (1-3 trips/7d)
  must be hidden or rolled into a longer window, not rendered with 1-row
  sections.
- **Per-trip-type bar normalization:** fish/angler scales differ by ~30×
  across trip types (Overnight ≈1, 3.5 Day ≈35). Bar widths must be
  normalized within each trip-type section, not on a global scale.
- **Source-label drift is real:** the source site renamed "Full Day" to
  "Full Day Coronado Islands" mid-window for some boats. The home page
  query must not treat brand-new trip-type labels as established —
  surface a "first seen" indicator or require N days of history before
  inclusion.
- **Released-species treatment:** released variants must stay as separate
  rows (per Phase 6 decision); released share varies by species (calico
  bass 38% released, white seabass 88% released), so collapsing them
  would mislead.

## Spikes

| #   | Name                          | Type     | Validates                                                                                          | Verdict      | Tags |
|-----|-------------------------------|----------|----------------------------------------------------------------------------------------------------|--------------|------|
| 001 | phase-7.5-data-exploration    | standard | Given dev DB, when answering 17 home-page questions, then concrete numbers + thresholds emerge     | ✓ VALIDATED  | data, phase-7.5, home |
