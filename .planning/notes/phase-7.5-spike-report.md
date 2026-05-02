# Phase 7.5 / Phase 8 data-exploration spike report

> **Note:** v2 was restructured 2026-05-01 — the work this spike informed
> moved from "Phase 7.5 (Home & Discovery)" to a merged **Phase 8
> (Home, Retire, Polish)** that absorbed the former Phases 10 (v1
> Retirement) and 11 (Polish & Dark Mode). The spike's findings remain
> valid for the home-page portion of Phase 8. Filename and directory keep
> the original "phase-7.5" label as a historical artifact.

**Spike:** `001-phase-7.5-data-exploration`
**Run:** 2026-05-01 against `data/dev.sqlite3` (17,337 catch_reports rows,
2025-02-26 → 2026-04-30)
**Backfill addendum:** 2026-05-01 added 6 months of earlier history
(2024-08-26 → 2025-02-25, +4,968 rows = 22,305 total). See "Addendum"
section at the end for findings that change once the historical window is
wider.
**Source prompt:** `.planning/notes/phase-7.5-data-spike-prompt.md`

This report answers the 17 questions in the spike prompt. Raw numbers live
in `data.json`; this file is for human reading and is the input artifact
for Phase 8 plan-phase.

---

## TL;DR — what the home page should know

1. **7 trip types are viable for a 7-day "top boats" board** (≥5 trips):
   1/2 Day AM, Full Day Coronado Islands, 1/2 Day PM, 1.5 Day, Full Day,
   3 Day, 2 Day. Four are sparse (1-3 trips/7d) and should be hidden or
   bumped to a 14-day window.
2. **Bar widths must normalize per trip type.** The fish-per-angler scale
   spans roughly 1× (Overnight) to 35× (3.5 Day). One global axis would
   compress the short trips into invisibility.
3. **The source site renames trip-type labels mid-window.** "Full Day" was
   relabeled to "Full Day Coronado Islands" on 2026-04-27 for some boats,
   producing a 4-day-old trip type with no historical context. The home
   page should not show brand-new labels in week-over-week comparisons.
4. **"Long Range" is in the operator's vocabulary but not in the data.**
   Either off-season for the scrape window or a different label is used by
   the source. Operator should confirm before plan-phase relies on it.
5. **"Top species this week" is mostly stable** (9/10 overlap with the
   30-day list). It works as a leaderboard but not as a "what's new"
   signal. The interesting signal is rank shifts (e.g. yellowtail
   surpassing bluefin in 7d), not the membership of the list.
6. **Data quality is clean.** No nulls, no whitespace, no zero-angler
   trips, no zero-catch trips, no duplicate keys, no case-variant species
   in the 7-day window.

A "top-5 boats per viable trip type, past 7 days, fish/angler" home page
yields **7 sections × ≤5 rows = 30 rows** today. Several sections render
fewer than 5 rows because few boats run that trip type in a week.

---

## Trip-type volume

### Q1 — Distinct trip types in past 7 / 30 / 90 days

**11 distinct trip types in all three windows** (stable membership). The
12th historical type, "2.5 Day," last ran 2025-04-23 and is dormant.

### Q2 — Trips per trip type, 7d / 30d

| Trip type                  | 7d  | 30d | 90d |
|----------------------------|-----|-----|-----|
| 1/2 Day AM                 | 17  | 109 | 349 |
| Full Day Coronado Islands  | 10  | 10  | 10  |
| 1/2 Day PM                 | 8   | 44  | 134 |
| 1.5 Day                    | 6   | 66  | 216 |
| Full Day                   | 5   | 65  | 215 |
| 3 Day                      | 5   | 65  | 215 |
| 2 Day                      | 5   | 17  | 47  |
| 1/2 Day Twilight           | 3   | 26  | 86  |
| Overnight                  | 2   | 26  | 86  |
| 3.5 Day                    | 2   | 26  | 86  |
| 3/4 Day                    | 1   | 1   | 1   |

Notice "Full Day Coronado Islands" has 10 trips in 7d AND in 90d — see Q4.

### Q3 — Viable trip types for a 7-day top-N list

**Threshold ≥5 trips ⇒ 7 viable:** 1/2 Day AM, Full Day Coronado Islands,
1/2 Day PM, 1.5 Day, Full Day, 3 Day, 2 Day.

**Threshold ≥10 trips ⇒ 2 viable** (1/2 Day AM, Full Day Coronado Islands)
— too tight for a useful page.

**Sparse in 7d:** 1/2 Day Twilight (3), Overnight (2), 3.5 Day (2),
3/4 Day (1). These are real trip types with steady 30d/90d activity, just
low-frequency. The home page either:
- (a) hides them in 7d view and surfaces them only when the user expands
  to 14d/30d, or
- (b) renders them under a "low-volume — last N days" section with a
  longer window per row.

**Recommendation:** ship with (a) for v1 — 7 sections is already a tall
page (see Q17). Sparse types can be a follow-up.

### Q4 — Surprising trip-type names

Two genuine surprises:

1. **"Full Day Coronado Islands" first appeared 2026-04-27** (4 days
   before the spike date). Before that date, the boats now using this
   label (San Diego, Grande, Mission Belle) were filed under plain
   "Full Day". This is a **source-site relabeling**, not a new product.

   **Implication:** the home page query should distinguish "viable trip
   type" (enough trips) from "established trip type" (enough history).
   A 4-day-old label in a 7-day window is a half-week of data passing as
   a full week. Either backfill the relabel (treat the renamed series as
   continuous), or surface a "new label" badge.

2. **"Long Range" never appears.** It's listed as a domain term in
   CLAUDE.md but is absent from 14 months of scraped data. Possibilities:
   the source site uses day-count labels for LR trips ("5 Day", "10 Day"
   — but those don't appear either), the LR season hasn't run in this
   window, or the operator's vocabulary diverges from the source. Worth
   a 30-second check with the operator.

3. **"2.5 Day"** — last ran 2025-04-23, only 3 trips ever. Probably
   dormant rather than wrong; safe to ignore.

4. **"3/4 Day"** — only 18 trips in 14 months, 1 trip in 90d. Listed in
   CLAUDE.md but effectively a rounding-error trip type for the home page.

No data-quality typos: no whitespace padding, no case variants, no obvious
misspellings.

---

## Fish-per-angler distributions per trip type (7d)

### Q5 — Median, p90, max per viable trip type

| Trip type                  | n  | min  | median | p90   | max   | mean  |
|----------------------------|----|------|--------|-------|-------|-------|
| 1/2 Day AM                 | 17 | 0.36 | 4.63   | 9.21  | 11.60 | 4.83  |
| Full Day Coronado Islands  | 10 | 0.18 | 1.83   | 4.68  | 4.68  | 1.66  |
| 1/2 Day PM                 | 8  | 1.17 | 5.29   | 8.17  | 8.17  | 4.57  |
| 1.5 Day                    | 6  | 1.63 | 3.25   | 4.38  | 4.38  | 3.19  |
| Full Day                   | 5  | 1.25 | 2.92   | 3.58  | 3.58  | 2.66  |
| 3 Day                      | 5  | 7.75 | 12.67  | 13.11 | 13.11 | 11.28 |
| 2 Day                      | 5  | 2.17 | 2.39   | 6.95  | 6.95  | 3.52  |

For sparse trip types (n=2-3), percentiles collapse to the max value;
quoting them is misleading.

### Q6 — Typical row scale and bar normalization

The fish/angler ranges genuinely differ by **~30×** across viable trip
types. 3 Day medians around 12, Full Day Coronado around 1.8.

**Decision:** bar widths must be normalized **per trip-type section**.
The within-section reference scale should be the section's own max (or a
fixed multiple of the section median) rather than a global constant.

If a global axis is required for some other reason, log-scale would be
the only honest option — but a per-section linear scale is simpler and
reads naturally to anglers who already think of trip types as different
worlds.

### Q7 — Outliers and minimum-trip thresholds

`max / p90` ratio is ≤1.26 for every viable trip type, which sounds tame
but is misleading: with n=5-8 trips the p90 IS the max for most, so the
ratio is forced to 1.0.

**Real outlier check:** compare each boat's per-trip fpa across its own
trips that week. With most boats running 1-2 trips per week per trip
type, a "minimum trips per boat" threshold > 1 would empty most sections.

**Recommendation:**
- 7d window: minimum 1 trip per boat. Display the trip count next to the
  fpa so anglers can judge n=1 themselves (operator preference per
  CLAUDE.md: "show data with context, let anglers judge thin data").
- 30d window (alternative view): minimum 3 trips per boat. Filters out
  one-off "best of" hype while keeping enough boats for a leaderboard.

---

## Species data richness

### Q8 — Distinct species in past 7 days

**28 distinct species fleet-wide in 7d.**

### Q9 — Volume distribution

Top 6 species account for ~89% of total catch volume by count:

| Rank | Species              | trips | total caught |
|------|----------------------|-------|--------------|
| 1    | yellowtail           | 32    | 1,495        |
| 2    | bluefin tuna         | 18    | 1,291        |
| 3    | rockfish             | 19    | 1,167        |
| 4    | calico bass          | 11    | 544          |
| 5    | calico bass released | 3     | 340          |
| 6    | sand bass            | 7     | 238          |

Long tail: 6 species under 10 fish total in 7d (sheephead, lingcod,
sanddab, sand bass released, spiny lobster released, …). 28 species total.

**Pattern:** clear top-3 (yellowtail, bluefin, rockfish — pelagic +
groundfish), a strong middle tier of inshore (calico, sand bass, sculpin,
whitefish, barracuda), and a long tail.

### Q10 — Is "top species this week" a meaningful section?

Top-10 7d vs Top-10 30d **overlap on 9 of 10 species.** Membership is
nearly stable.

**Verdict:** "top species this week" as a list of species names is **not
a great section** — it's the same names as the 30d list.

**But** the **rank order shifts** in interesting ways:
- yellowtail #1 in 7d ↔ bluefin #1 in 30d (recent yellowtail bite)
- vermilion rockfish breaks into 7d top-10 (groundfish run)

So the section reads better as **"this week vs trailing month — what
moved"** (rank deltas, not raw membership). That's a different visual:
arrows or rank-change badges rather than a leaderboard.

For v1, the simpler bet is to **omit a "top species" section entirely**
and let anglers discover species via boat or trip-type pages. Revisit
once the home page settles.

### Q11 — Released-species treatment

5 released variants in 7d. Released share varies wildly:

| Released variant       | released | base     | released share |
|------------------------|----------|----------|----------------|
| calico bass released   | 340      | 544      | 38%            |
| white seabass released | 49       | 7        | 88%            |
| sand bass released     | 15       | 238      | 6%             |
| spiny lobster released | 15       | 14       | 52%            |
| halibut released       | 1        | 1        | 50%            |

These can't be safely collapsed into the base species — the share is
species-dependent and tells different stories (white seabass is mostly
released because of size limits; calico is mostly kept).

**Decision:** keep released as separate species rows on the home page,
matching the Phase 6 chart treatment. Don't try to be clever.

---

## Edge cases

### Q12 — Boats with 0 anglers (7d)

**Zero such trips in 7d.** No defensive handling needed for this case in
v1. (Worth a unit test against the query, since a future scrape change
could introduce these.)

### Q13 — Boats with anglers but 0 caught (7d)

**Zero such trips in 7d.** Skunked-trip handling is not needed for v1.

### Q14 — "1/2 Day" overlap

Three half-day variants exist: **"1/2 Day AM" (1641 trips), "1/2 Day PM"
(628), "1/2 Day Twilight" (379)** across 14 months. Bare **"1/2 Day"
does not exist** in the data — every half-day trip carries an AM/PM/
Twilight suffix. No collapsing needed; the source site already
disambiguates.

### Q15 — Data quality issues

All zero across the entire dataset:

- null/empty species: **0**
- whitespace-padded species: **0**
- whitespace-padded trip type: **0**
- negative species_count: **0**
- angler_count > 200: **0**
- duplicate `(date, boat, trip_type, species)` rows: **0**
- case-variant species (same lowercased, different originals): **0**

The Phase 1-3 ingest pipeline + Phase 6 scraper hardening are doing their
job. The home page can trust the data shape.

---

## Cross-cutting

### Q16 — Window sizing

| Window | Threshold | Viable count | Notes |
|--------|-----------|--------------|-------|
| 7 days | ≥5 trips  | **7**        | Operator's pick; loses Twilight, Overnight, 3.5 Day |
| 7 days | ≥10 trips | 2            | Too tight |
| 14 days | ≥5 trips | 10           | Catches everything except "3/4 Day" |
| 14 days | ≥10 trips| 9            | Loses 2 Day at 9 trips |
| 30 days | ≥10 trips| 10           | Same coverage as 14d/≥5 but staler |

**Recommendation: ship 7d/≥5 for v1** (matches operator's pick). It's
honest about what's "happening this week" and produces a focused page.
Stash a 14d toggle as a Phase 7.5 stretch goal — the data supports it
cleanly.

### Q17 — Page composition with operator's chosen layout

"Top-5 boats per viable trip type, past 7 days, fish/angler ranked":

- **7 sections** (one per viable trip type)
- **30 rows total** (≤5 per section)
- Some sections render only 3-4 rows because few boats ran that trip
  type that week

Real preview from today's data:

```
1/2 Day AM (17 trips this week)
  Dolphin       4 trips   5.96 fpa
  Premier       3 trips   5.79 fpa
  Southern Cal  2 trips   5.39 fpa
  Chubasco II   2 trips   4.29 fpa
  New Seaforth  5 trips   3.11 fpa

Full Day Coronado Islands (10 trips this week — NEW LABEL, see Q4)
  San Diego     4 trips   2.13 fpa
  Grande        4 trips   1.49 fpa
  Mission Belle 2 trips   0.74 fpa

1/2 Day PM (8 trips this week)
  Dolphin       3 trips   5.89 fpa
  Daily Double  1 trip    5.33 fpa
  New Seaforth  4 trips   3.53 fpa

1.5 Day (6 trips this week)
  Voyager        1 trip   4.38 fpa
  Oceanside 95   1 trip   4.04 fpa
  Jig Strike     1 trip   3.25 fpa
  Ocean Odyssey  1 trip   3.10 fpa
  El Capitan     1 trip   2.76 fpa

Full Day (5 trips this week)
  Voyager       1 trip   3.58 fpa
  San Diego     1 trip   3.31 fpa
  Sea Watch     1 trip   2.92 fpa
  Mission Belle 1 trip   2.24 fpa
  El Gato Dos   1 trip   1.25 fpa

3 Day (5 trips this week)
  New Lo-An       1 trip   13.11 fpa
  Polaris Supreme 1 trip   12.70 fpa
  Pacific Voyager 1 trip   12.67 fpa
  Islander        1 trip   10.20 fpa
  Legend          1 trip    7.75 fpa

2 Day (5 trips this week)
  Apollo          1 trip   6.95 fpa
  Pacific Voyager 2 trips  3.11 fpa
  New Lo-An       1 trip   2.23 fpa
  Polaris Supreme 1 trip   2.17 fpa
```

Notes for the design phase:

- Density feels right — scrollable but not overwhelming.
- Many cells are n=1 trip. Showing the trip count next to the fpa is
  essential context (per CLAUDE.md: "show data with context").
- The "NEW LABEL" badge for Full Day Coronado Islands is critical or
  the home page silently lies about historical context.
- 3 Day section pops visually because the values (12.67, 12.70, 13.11)
  look bunched together — a per-section bar normalization will widen
  the apparent spread.

---

## Discoveries that should bite Phase 7.5 plan-phase

1. **Source-label drift** is a real risk, and it just happened. Phase
   7.5 should explicitly model trip-type labels as not stable — at
   minimum, surface "first seen" so operators can spot drift; ideally,
   maintain a small `trip_type_aliases` table the operator can edit when
   the source renames things.
2. **"Long Range" gap** between operator vocab and source data needs
   resolution before plan-phase relies on it.
3. **Per-section bar normalization** is non-negotiable; a global axis
   would mislead.
4. **n=1 honesty** is fine to ship as long as trip count is shown
   alongside fpa. The operator's "let anglers judge thin data" rule
   means we don't need to filter aggressively.
5. **"Top species" as a leaderboard is dull** because membership is
   stable. If a species section ships, frame it as rank-shift, not
   leaderboard. Or skip it entirely for v1.
6. **Skunked-trip handling can wait** — zero such trips in 14 months.
   Don't overbuild for cases that don't exist.

---

## Addendum: findings after 6-month backfill (2026-05-01)

After the initial spike ran, we backfilled 6 months of earlier history
(2024-08-26 → 2025-02-25, +4,968 rows). The expanded dataset doesn't
change the past-7-day numbers (those windows are recent), but it changes
the **all-history** picture in three meaningful ways for Phase 8.

### "3/4 Day" and "2.5 Day" are real seasonal trip types

| Trip type | All-history trips (was) | All-history trips (now) | First seen | Last seen |
|---|---:|---:|---|---|
| 3/4 Day | 18 | **123** | 2024-08-30 | 2026-04-27 |
| 2.5 Day | 3 | **97** | 2024-08-28 | 2025-04-23 |

The original spike framed both as "rounding-error trip types." That was
wrong — they're seasonal Aug-Oct trip types that happen not to run in
April-May. Phase 8 should treat them as full-fledged trip types in the
alias / viability logic, not edge cases.

### Four additional trip-type labels surfaced in 2024 fall season

| Trip type | Trips | First seen | Last seen | Status |
|---|---:|---|---|---|
| 3/4 Day Islands | 4 | 2024-09-02 | 2024-10-04 | brief 2024 fall variant |
| 4 Day | 3 | 2024-10-18 | 2024-11-12 | brief 2024 fall variant |
| 5 Day | 1 | 2024-09-18 | 2024-09-18 | one-off |
| 3/4 Day Local | 1 | 2024-09-05 | 2024-09-05 | one-off |

The total distinct trip-type count for **all-history** is now **16**
(was 12). The 7d / 30d / 90d windows still show 11 because the new labels
are dormant — but the alias mapping table needs to cover all 16, plus
"Full Day Coronado Islands," plus whatever the source site invents next.

**Implication for Phase 8:** the trip-type alias mapping is more important
than the original spike framing implied. The source site has had multiple
label variants in the last 18 months — "3/4 Day Islands" vs "Full Day
Coronado Islands" might be the same thing under different names. Operator
needs an aliasing UI good enough to handle this kind of drift, not just a
one-off rename.

### "Long Range" still absent — confirmed

With the wider window, "Long Range" still does not appear under any
obvious variant. Per operator decision (2026-05-01), CLAUDE.md keeps the
term in the vocabulary list in case it surfaces in even older data or a
future season, but Phase 8 does not need to plan for an "LR" home-page
section.

### Headline answers unchanged

The past-7-day analysis (Q1-Q3, Q5-Q11, Q12-Q17) is unchanged because
those windows don't reach into the backfilled period. Recommendations
stand:

- 7 viable trip types at 7d/≥5
- per-trip-type bar normalization required
- skunked-trip / zero-angler defensive code unnecessary
- top-species-this-week dull as leaderboard
- 30-row home page composition

---

## Addendum 2: findings after 2-year backfill at 1s/req (2026-05-01)

A second backfill pass extended the dataset another 2 years back —
2022-08-26 → 2024-08-25, 731 dates, +28,043 rows in 9.9 min at a
temporary 1s/req rate (rate limiter reverted to 5s after). DB now spans
**2022-08-26 → 2026-04-30, 50,297 rows across 1,342 distinct dates
(~3.7 years)**.

### Trip-type label space is bigger than the 18-month view suggested

Past-7-day answers don't change. But the all-history trip-type inventory
expanded from 16 to **22 distinct labels**, several of which never
appear in the 2025-2026 data:

| Trip type | All-history trips | First seen | Last seen | Status |
|---|---:|---|---|---|
| 1.75 Day | 33 | 2022-08 | 2024-08 | dormant since 2024-08 |
| 4 Day | 31 (was 3) | 2022-08 | 2024-11 | seasonal fall variant |
| Extended 1.5 Day | 10 | 2022-08 | 2024-08 | dormant — variant of 1.5 Day |
| 3/4 Day Local | 7 | 2022-08 | 2024-09 | dormant variant |
| 3/4 Day Islands | 9 | 2022-08 | 2024-10 | dormant variant |
| Lobster | 3 | 2022-08 | 2024-08 | distinct category |
| Extended 1/2 Day | 2 | 2022-08 | 2024-08 | dormant variant |
| 3/4 Day Offshore | 2 | 2022-08 | 2024-08 | dormant variant |
| 7 Day | 1 | 2022-08 | 2024-08 | one-off |
| 6 Day | 1 | 2022-08 | 2024-08 | one-off |
| 4.5 Day | 1 | 2022-08 | 2024-08 | one-off |
| 3.25 Day | 1 | 2022-08 | 2024-08 | one-off |

The active 11-label set (1/2 Day AM, Full Day, 1.5 Day, etc.) is the
2025-2026 stable subset. The full historical span shows the source has
churned labels every 1-2 seasons.

### Implications for Phase 8

- **Alias mapping table must handle ~22 historical labels**, not the 11
  active ones. "Extended 1.5 Day" is presumably an alias of "1.5 Day";
  "3/4 Day Local" / "3/4 Day Islands" / "3/4 Day Offshore" are
  presumably regional variants of "3/4 Day"; the operator will need
  good grouping UX to alias them correctly.
- **Single-occurrence trip types** (7 Day, 6 Day, 4.5 Day, 3.25 Day,
  Lobster) likely warrant a "rare / archive" bucket rather than first-class
  trip-type sections. Phase 8 should not render them as their own
  home-page sections regardless of window.
- **Explorer's "All" range** now spans 3.7 years and includes labels
  that never appear in 7d / 30d / 90d windows. The trip-type series
  legend on a boat that ran "1.75 Day" in 2022 needs to render that
  label honestly even if it's dead today.

### "Long Range" — confirmed absent across 3.7 years

Wider window, same answer: no "Long Range" label in any form (no "LR",
no "long-range", no "extended trip"). CLAUDE.md keeps the term in vocab
per operator decision; Phase 8 does not plan an LR section.

### Headline answers still unchanged

The past-7-day analysis (Q1-Q3, Q5-Q11, Q12-Q17) is unchanged. The home
page's first-cut design (7 sections × ≤5 rows, 7d / ≥5 threshold,
per-section bar normalization, no top-species section in v1) stands.
