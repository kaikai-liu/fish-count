# Feature Research

**Domain:** Angler-facing fishing-data / charter trip-picker for San Diego sportfishing
**Researched:** 2026-04-22
**Confidence:** HIGH (extensive ecosystem coverage; SD sportfishing nuance verified across multiple sources)

## Executive Summary

The angler-facing fishing-data ecosystem splits into three camps:

1. **Raw count aggregators** (sandiegofishreports.com, sportfishingreport.com, 976-tuna.com, individual landing sites like fishermanslanding.com) — they show today's numbers and let you flip backward one date at a time. Source of truth, but flat: no cross-date analysis, no per-angler normalization, no recommendations.
2. **Social / community fishing apps** (FishBrain, Fishidy, FISHSURFING) — UGC-heavy, leaderboards, social feeds, photo logbooks, ML-based "BiteTime." Optimized for individual anglers on their own boats, not charter customers picking a boat.
3. **Booking marketplaces** (FishingBooker, FishAnywhere, GetMyBoat, Captain Experiences) — filter by trip length / target species / price, but they sell trips; they don't surface objective historical performance.

FishCount sits in a real, unoccupied gap: **objective, normalized, cross-date analysis of an existing public dataset, oriented around the "which boat should I book?" decision.**

The biggest risks aren't missing features — they're (a) over-building social/gamification features that drift toward FishBrain territory, (b) implying false precision on derived per-angler averages, and (c) cluttering the trip picker with features unrelated to the booking decision.

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Per-boat fish count display (boat, landing, anglers, trip type, species, counts) | Mirrors 30+ years of SD count sites; baseline literacy | LOW | Already in Active. Use source schema literally — anglers know it |
| Filter by trip type with SD-native names (1/2 Day AM/PM, 3/4 Day, Full Day, Full Day Coronado Islands, Overnight, 1.5/2/2.5/3 Day, Long Range) | SD anglers shop by trip type first, often before species | LOW | Pull labels verbatim from source — do not invent or normalize |
| Filter by landing (Fisherman's Landing, Point Loma Sportfishing, H&M Landing, Seaforth, Helgren's, Dana Wharf, Oceanside) | Anglers commute to a landing; many filter by "which I can reach by 5am" | LOW | Already in Active |
| Filter by species (Bluefin, Yellowfin, Yellowtail, Dorado, Wahoo, Calico/Sand Bass, Rockfish, Lingcod, Bonito, Barracuda, Halibut) | Trip decisions are species-driven and seasonal | LOW | Already in Active |
| Date navigation beyond today (calendar picker; jump-to-date) | Source has it; anglers expect to compare last weekend, last year same week | LOW | Already in Active via heatmap & history |
| Per-angler average = fish ÷ anglers, shown alongside raw totals | SD anglers' default mental model for comparing 25-angler 1/2 day vs 12-angler overnight | LOW | Already in Active. **Critical:** label as "avg fish/angler — boat aggregate, not individual" |
| Boat profile / detail page (recent trips, season totals, trip types, landing, source link) | Anglers narrow to 2-3 boats then drill in; without a boat page the workflow breaks | MEDIUM | Implied by boat comparison; worth its own row |
| Mobile-readable layout | SD bookings happen on phones | LOW | Just don't break responsive defaults |
| Honest data freshness ("Last scraped: [time]"; mark today as provisional until evening) | Source updates as boats return through the evening; missing this makes early-morning numbers look like a finished day | LOW | Trivial UI, high trust |
| Link back to source page for each row/boat | Anglers verify; charter operators expect attribution; ethical scraping norm | LOW | One link per row |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Trip Picker (date/range + species → ranked boats) | Collapses "open 30 source pages and skim" into one query — the whole reason FishCount exists | MEDIUM | Already in Active. Show the math (n trips, avg fish/angler, last trip date) so users can override rankings |
| 30-day calendar heatmap (predicted catch rate by date) | Captures the "I have flexibility on date, when's the best window?" decision | MEDIUM | Already in Active. Clear color legend; gray (not green/red) for thin-data dates |
| Trend charts (catches over weeks/months/seasons by species and/or boat) | Makes seasonal arc legible — "is bluefin starting earlier this year?" | MEDIUM | Already in Active. Default views: species-over-time, boat-over-time, species-by-month across years |
| Side-by-side boat comparison across user-selected date range | Booking is often a 2-3 boat decision; comparison is the closer | MEDIUM | Already in Active. Allow same-trip-type comparison toggle to compare like-with-like |
| Statistical projection with confidence bands | Forecasts are differentiating IF presented honestly; source has none | MEDIUM | Already in Active. Show bands wide when n is small — refusing to predict is a feature |
| Email alerts on followed species/boat (run start, hot day) | Captures anglers who'd otherwise check the site daily; turns tool into service | MEDIUM | Already in Active. Threshold logic must be defensible — false alarms kill alert trust faster than misses |
| "Why this boat?" explainer on each Trip Picker result (n trips in window, avg/angler, last hot day, comparable trip type) | Lifts the experience from "ranked list" to "decision support" | MEDIUM | Tooltip or expandable row; cheap UX, big trust delta |
| Same-week last-year overlay on trends | Anglers' mental baseline is "vs. last year"; one chart toggle | LOW | Cheap once trend infra exists |
| Trip-type-aware normalization (don't compare long-range bluefin to 1/2-day calico counts) | Prevents the most common misuse of fish-count data | MEDIUM | Default Trip Picker filter to a single trip type |
| Anonymous shareable URL state (filters, date, species → URL) | Anglers text URLs to buddies — supports "shareable with friends" | LOW | Just use query strings; no auth needed |
| Species seasonality cheatsheet (small "when does this species show?" sidebar) | Bridges newer anglers without dumbing down the data | LOW–MED | Derived from existing data; no extra source |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Per-angler individual catch attribution | Looks like FishBrain; users assume data supports it | Source is boat-aggregate only — building this requires fabricating per-person numbers; false precision destroys trust with informed SD anglers | Already Out of Scope. Repeatedly label as "boat avg" |
| Social feed / posts / comments / photos | Every "fishing app" has it | Pulls product into FishBrain/Fishidy territory; requires moderation, accounts, image storage; orthogonal to "pick a boat" | Link out to BDOutdoors / SDfish.org |
| Leaderboards / gamification | Common in fishing apps (FishBrain, GoFree Hooked) | Data isn't per-angler, so leaderboards would incentivize meatlocker boats over quality fishing | Show median + range alongside top counts so distribution is visible |
| ML-based bite-time / weather-fused forecasts | FishBrain BiteTime, BiteCast expectation | Data-hungry; black-box; misaligned with PROJECT.md transparency constraint; one upstream source can't support honest ML | Already Out of Scope. Statistical projection with bands |
| Real-time push / SMS / in-app notifications | "Modern apps push" | Email is sufficient; push requires apps, device tokens, on-call alerting | Already Out of Scope. Email-only |
| Mandatory account / login to browse | Standard SaaS pattern | Public charter data should be browsable; account friction kills share-a-URL workflow | Already Out of Scope. Email only for alerts |
| Booking / payment / reservation integration | FishingBooker model; monetization temptation | Regulatory exposure (PCI); source already links to operators; FishCount stays informational | Link out to landing/operator booking pages |
| Weather, tides, moon, SST/chlorophyll overlays | Every angler app has them; FishDope leans on them | 3+ more data sources to maintain; weather-as-causal-overlay invites pseudo-correlations on small samples | Defer to v2+ only if real demand emerges |
| Bait/tackle/technique recommendations | FishBrain Pro has them | Data doesn't capture bait/tackle; would be guesswork | Defer; out of scope |
| Map view of fishing spots / GPS coordinates | Navionics / Fish Atlas pattern | Source doesn't publish trip GPS; captains zealously protect spots | Landing-locator map is fine; "where the fish are" map is not |
| Catch logging / personal logbook | FishBrain core feature | Off-mission; FishCount is a decision tool, not a catch journal | Out of scope |
| AI-generated fishing reports / chat assistant | Trendy, easy to ship | Hallucination on a domain anglers can verify; erodes trust faster than it adds value | Stick to deterministic analytics over real data |
| "Hot bite" badges / "ON FIRE" labels | Engagement-bait; mimics marketing-style charter sites | SD audience is sophisticated — overstating a 3-fish day looks amateur | Show numbers with neutral framing |
| Premium / paywall / subscription tier | Standard SaaS | PROJECT.md says free/anonymous; data is publicly sourced; paywalling would be ethically dubious | Free, anonymous browsing; alerts free |
| Fake precision in projections (e.g., "73.4% chance") | Looks impressive | Statistical reality is wide bands on thin data; precise-looking numbers mislead | Show ranges, n-of-trips, low-confidence labels |
| Sponsored / promoted boat slots | Source has "Sponsored Counts"; obvious revenue model | Compromises picker integrity — the whole value prop is objective ranking | Never. Monetize elsewhere if needed later |

## Feature Dependencies

```
[Scheduled scrape] (Active)
    └──required by──> [Historical backfill] (Active)
                          └──required by──> [Per-day per-boat storage] (Active)
                                              ├──required by──> [Per-angler avg derivation]
                                              │   └──required by──> [Trip Picker ranking]
                                              │                         ├──required by──> [Calendar heatmap]
                                              │                         └──required by──> [Statistical projection]
                                              ├──required by──> [Trend charts]
                                              ├──required by──> [Boat comparison]
                                              ├──required by──> [Filters/search]
                                              └──required by──> [Email alerts]

[Trip Picker]    ──enhances──> [Calendar heatmap]   (same data, different lens)
[Trend charts]   ──enhances──> [Statistical projection]   (forecast = trend + uncertainty)
[Email alerts]   ──requires──> [Email signup]   (only account-gated feature)
[Email alerts]   ──requires──> [Alert threshold logic]   (implicit but not in Active)
[Boat profile]   ──enhances──> [Trip Picker]   (drill-down from ranked list)
[Trip-type bucketing] ──required by──> [Trip Picker honesty]  (else rankings mislead)
[Shareable URL state] ──enhances──> [All views]
```

### Dependency Notes

- **Scrape → backfill → storage** is the critical foundation. Everything downstream is dead weight without a stable, complete dataset. Schema must include: scrape_timestamp, source_date, boat, landing, trip_type (verbatim), angler_count, species, species_count.
- **Per-angler avg → Trip Picker ranking**: raw-total ranking favors high-passenger boats; avg/angler is the honest default. Show both; default to avg/angler.
- **Trend charts → Projection**: don't ship projection as a separate surface before trends exist; projection is trends + confidence bands.
- **Trip-type normalization → Trip Picker honesty**: ranking a Coronado Islands trip's bluefin next to a 1/2-day bluefin (always 0) is meaningless; default the Trip Picker to a single trip type.
- **Alert threshold logic** is implicit but missing from Active — define "hot day" / "starting to run" before building alerts.
- **Boat profile pages** are implied by comparison but not explicit in Active — recommend surfacing as its own item.

## MVP Definition

### Launch With (v1)

- [ ] Scheduled scrape + historical backfill — foundation, everything else depends on it
- [ ] Per-boat per-day storage with trip-type/landing/species detail — the dataset
- [ ] Per-angler average derivation, prominently labeled as boat-aggregate — honest core metric
- [ ] Trip Picker: date + species → ranked boats with avg/angler and trip count — core value
- [ ] 30-day calendar heatmap — date-flexibility decision
- [ ] Trend charts (species, boat, season) — seasonal pattern literacy
- [ ] Boat comparison across date ranges — closes the booking decision
- [ ] Filters: species, boat, landing, trip type — navigability
- [ ] Statistical projection with visible confidence bands — honest forecast
- [ ] Anonymous browsing — accessibility
- [ ] Email signup + alerts (hot day / run start) — retention loop
- [ ] Source attribution link per row — trust & ethical scraping
- [ ] Last-scrape-timestamp + "today is provisional" badge — prevents mid-day misreads
- [ ] "Why this boat?" Trip Picker explainer — decision support over ranking
- [ ] Trip-type bucketing default in Trip Picker — prevents apples-to-oranges
- [ ] Shareable URL state (filter/date/species in query string) — the "share with friends" loop

### Add After Validation (v1.x)

- [ ] Boat profile page — drill-down surface; trigger = users asking for boat-detail view
- [ ] Same-week last-year overlay on trend charts — trigger = users asking "how does this compare to last year?"
- [ ] Species seasonality cheatsheet — trigger = newer-angler traffic growing
- [ ] Median + range distribution view alongside top counts — trigger = informed users asking for distribution literacy
- [ ] CSV / JSON export of filtered queries — trigger = power-user requests

### Future Consideration (v2+)

- [ ] Multi-source aggregation beyond sandiegofishreports.com — defer unless source becomes unreliable
- [ ] Weather/SST/tide overlays — defer until causal value can be shown on this dataset specifically
- [ ] Landing locator map — defer; only if users ask
- [ ] Push notifications — defer unless email engagement plateaus

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Scrape + backfill + storage | HIGH | MEDIUM | P1 |
| Per-angler avg (labeled honestly) | HIGH | LOW | P1 |
| Trip Picker (ranked list view) | HIGH | MEDIUM | P1 |
| Filters: species, boat, landing, trip type | HIGH | LOW | P1 |
| Honest data-freshness labeling | HIGH | LOW | P1 |
| Source attribution link | MEDIUM | LOW | P1 |
| Calendar heatmap | HIGH | MEDIUM | P1 |
| Trend charts | HIGH | MEDIUM | P1 |
| Boat comparison | HIGH | MEDIUM | P1 |
| Statistical projection w/ confidence bands | MEDIUM | MEDIUM | P1 |
| Email alerts (followed species/boat) | MEDIUM | MEDIUM | P1 |
| Anonymous browsing | HIGH | LOW | P1 |
| "Why this boat?" Trip Picker explainer | HIGH | LOW | P1 |
| Trip-type bucketing default in Trip Picker | HIGH | LOW | P1 |
| Shareable URL state | MEDIUM | LOW | P1 |
| Boat profile page | MEDIUM | MEDIUM | P2 |
| Same-week last-year overlay | MEDIUM | LOW | P2 |
| Species seasonality cheatsheet | MEDIUM | LOW | P2 |
| Median/range distribution view | LOW–MED | LOW | P2 |
| CSV/JSON export | LOW | LOW | P3 |
| Landing locator map | LOW | LOW–MED | P3 |
| Weather/SST overlays | LOW (here) | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | sandiegofishreports.com | 976-tuna.com | FishingBooker | FishBrain | FishCount Approach |
|---------|-------------------------|--------------|---------------|-----------|-------------------|
| Daily fish counts by boat | Yes (source) | Yes | No | No | Yes (sourced from #1) |
| Cross-date analysis / trends | No | No | No | Limited | **Yes — core diff** |
| Per-angler normalization | No | No | No | N/A | **Yes — labeled honestly** |
| Trip picker (date+species → boats) | No | No | Filter UI for booking | No | **Yes — core feature** |
| Calendar heatmap | No | No | No | No | **Yes** |
| Statistical forecast | No | No | No | ML BiteTime (black box) | **Yes — transparent + bands** |
| Email alerts | Newsletter only | Audio reports | Booking confirmations | Push | **Yes — species/boat run** |
| Side-by-side boat comparison | No | No | No | No | **Yes** |
| Social feed / posts | No | Forum-style posts | Captain messaging | Yes (large) | **No (anti-feature)** |
| Leaderboards | No | No | No | Yes | **No (anti-feature)** |
| Booking integration | Links out | Links out | Yes (core) | No | **No (links out only)** |
| Account required | No | No | Yes (book) | Yes (most) | **No (only for alerts)** |
| Sponsored / paid placement | Yes ("Sponsored Counts") | Yes | Marketplace | Pro tier | **No — never in rankings** |
| Mobile-first | OK | OK | Yes | App-only | Yes |

## SD-Specific UI Patterns (Domain-Language Quality Gates)

1. **Trip type names verbatim** — "1/2 Day AM," "1/2 Day PM," "3/4 Day," "Full Day," "Full Day Coronado Islands," "Overnight," "1.5 Day," "2 Day," "2.5 Day," "3 Day," "Long Range." Don't normalize to "half-day" lowercase or invent buckets.
2. **Landing names** verbatim: "Fisherman's Landing," "Point Loma Sportfishing" (never "Pt Loma"), "H&M Landing," "Seaforth," "Helgren's," "Dana Wharf," "Oceanside."
3. **Species names** anglers use: "bluefin," "yellowtail," "yellowfin," "dorado" (not "mahi-mahi" in SD), "wahoo," "calicos" or "calico bass" (sand bass distinction matters), "rockfish," "lingcod."
4. **"Per angler"** is more honest than "per rod" or "per person" (which implies attribution).
5. **Seasonal context** — bluefin now nearly year-round in SD; yellowtail spring/summer; dorado mid-July+; rockfish has closed seasons. "0 catches" in a closed season ≠ poor boat performance.
6. **"Jackpot fish"** matters to anglers but source doesn't expose it — don't fabricate.
7. **Trip-time labels** must be visible everywhere a count is shown (Full Day Coronado Islands ≠ 1/2 Day).

## Open Questions for Roadmap / Requirements

- **Alert threshold definition:** Recommend `hot day` = boat's avg/angler today > 2× boat's trailing 30-day avg same trip type AND ≥ N anglers; `starting to run` = species rolling-7-day avg across fleet > 1.5× same-week-last-year baseline. Confirm with target users.
- **Forecast horizon:** Trip booking is usually 1-4 weeks ahead; projecting beyond ~30 days will have unusable bands. Suggest 30-day max.
- **Confidence threshold for ranking inclusion:** Hide boats with < N trips, or show with "low data" flag? Recommend the flag.
- **Rockfish closed season handling:** Show "season closed [dates]" inline, not empty list.

## Sources

- [San Diego Fish Reports — Dock Totals](https://www.sandiegofishreports.com/dock_totals/boats.php)
- [Sportfishing Report (CA west coast)](https://www.sportfishingreport.com/)
- [976-TUNA Fish Counts](https://976-tuna.com/counts)
- [Fisherman's Landing Fish Counts](https://www.fishermanslanding.com/fishcounts.php)
- [H&M Landing Trip Calendar](https://www.hmlanding.com/trip-calendar)
- [Point Loma Sportfishing](https://www.pointlomasportfishing.com/)
- [San Diego Sportfishing Council](https://sportfishing.org/sportfishing-fishing-trips/)
- [BDOutdoors — SD Long Range forum](https://www.bdoutdoors.com/forums/forum/san-diego-long-range-sportfishing-reports/)
- [SDFish.org community](https://www.sdfish.org/)
- [FishBrain features](https://fishbrain.com/features) / [BiteTime](https://fishbrain.com/blog/fishbrain/bitetime-is-the-right-time)
- [FishingBooker search filters](https://fishingbooker.helpjuice.com/360010227614-How-do-I-use-search-filters-)
- [FishingBooker — San Diego season guide](https://fishingbooker.com/blog/san-diego-fishing-season/)
- [FishDope Hot Bite Reports](https://www.fishdope.com/guest/hot-bite-fishing-report-chart/)
- [San Diego Tuna Fishing seasonal calendar](https://www.sandiegotunafishing.com/species/seasonal-fishing-calendar)
- [NOAA Recreational Fishing Data Glossary](https://www.fisheries.noaa.gov/recreational-fishing-data/recreational-fishing-data-glossary)
- [Fishidy](https://www.fishidy.com/), [Navionics Boating](https://www.navionics.com/apps/navionics-boating)

---
*Feature research for: SD charter-fishing trip-picker / data-aggregation product*
*Researched: 2026-04-22*
