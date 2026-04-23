# Pitfalls Research

**Domain:** Public web app — third-party scraping + sparse-data forecasting + email alerts (FishCount)
**Researched:** 2026-04-22
**Confidence:** HIGH (synthesized from current scraping/forecasting/email-deliverability literature plus fisheries-specific CPUE research)

---

## Critical Pitfalls

### Pitfall 1: Backfill that hammers the source site

**What goes wrong:**
On day one you point a backfill loop at `sandiegofishreports.com/dock_totals/boats.php?date=YYYY-MM-DD` and walk back years of dates as fast as your machine will go. You discover that "as fast as your machine will go" is hundreds of requests per minute — far higher than the site's normal organic traffic. The site's host detects the spike, the operator notices in their logs, and you get IP-blocked, Cloudflare-challenged, or sent a cease-and-desist. The very first run permanently sours the relationship before you have a single chart to show.

**Why it happens:**
Backfill feels like a one-time "just get it done" operation, so the rate-limit instincts that govern the nightly scrape get suspended. There's also no obvious feedback loop: requests succeed, you don't see the harm, and you keep going. Asyncio + a list of dates is the obvious shape, and the obvious shape is dangerous.

**How to avoid:**
- Treat backfill as a multi-day batch job, not a one-shot script. Conservative starting point: **1 request every 5–10 seconds** (~6–12/min, well under any reasonable threshold).
- Make backfill **resumable**: persist "last successfully scraped date" so a kill + restart picks up where it left off. Removes the temptation to "just run it again from the top."
- Use the **same rate limiter** the nightly scraper uses — don't fork a separate fast path for backfill.
- Add a **hard daily cap** (e.g., max 2,000 historical pages/day) so a runaway loop can't burn through a year of dates in an hour.
- Run backfill **off-peak** for the source (San Diego is Pacific time; charter reports are read in the morning — backfill overnight Pacific).

**Warning signs:**
- Backfill script that completes in under an hour for thousands of dates → you're going too fast.
- 429s, 503s, or sudden 403s appearing in scraper logs.
- Response times suddenly jump (the site is slowing you down before blocking).
- Cloudflare challenge HTML coming back instead of the page you expected.

**Phase to address:** **ingest** (Phase 1 — must ship with backfill).
**Severity:** **deal-breaker** — get blocked once and the entire project's data source is gone.

---

### Pitfall 2: Silent scraper failure (HTTP 200 but the data is wrong)

**What goes wrong:**
Six weeks after launch, a user emails: "the trip picker hasn't updated since March." You check — the scheduled scrape is "succeeding" every night. It's been writing zero rows for 40 days because the source site renamed a CSS class, and your `BeautifulSoup` selector silently matches nothing. No exception was ever raised. Forecasts are stale. Alerts are based on dead data. Trust is gone.

**Why it happens:**
The scraper's success criterion is "HTTP 200 + no parse exception," not "rows actually extracted." Empty result sets aren't errors in the type system. Most third-party sites change markup unannounced — sometimes a wrapper `<div>` rename, sometimes a class refactor, sometimes a full template swap. Modern anti-bot defenses also sometimes serve "soft" failure pages (200 OK with substituted content), which look healthy at the HTTP layer.

**How to avoid:**
- **Row-count assertion per scrape.** Compare extracted row count to a rolling 7-day average; alert if today's count is <50% of expected. (Most reliable single signal — record-count monitoring catches more silent failures than any other metric.)
- **Schema validation** on every parsed row (Pydantic / dataclass with strict types). Fail loud if a field that should be an int is a string or missing.
- **Freshness SLA:** dashboard or status row showing "last successful scrape: N hours ago," with an alert if N > 36h. A freshness check catches failures that row-count checks don't.
- **Snapshot the raw HTML** for every scrape (gzip + S3/disk, cheap). Lets you replay parsing against historical pages when selectors break — instead of needing to wait for the next bug to reproduce.
- **Diff detection:** compare today's parsed result to yesterday's. If the schema changes (new column, missing field, drastically different distribution), alert.
- **Specific selectors > clever selectors.** Prefer `<table id="dock-totals"> tr` over generic CSS chains; if the ID survives a redesign you survive too.

**Warning signs:**
- Row counts dropping with no obvious source-site reason (weather day vs. structural failure).
- Parse-success rate drops from 100% to anything less.
- A field you expected to be present is `None` for all rows in a scrape.
- The scraper "succeeds" but the database has no new rows for the latest date.

**Phase to address:** **ingest** (Phase 1 must include row-count + freshness monitoring; raw-HTML snapshotting is acceptable to defer to Phase 2 but never to "later").
**Severity:** **deal-breaker** — silent failure poisons every downstream feature.

---

### Pitfall 3: Forecast that looks confident but is statistical noise

**What goes wrong:**
The trip picker shows "Boat X: 12.4 yellowtail per angler predicted" with three decimal places of false precision. The user books the trip, catches one yellowtail, and tells their fishing buddies that FishCount is garbage. Behind the number was an average of three trips from 2019, two of which were exceptional days. There were no error bars. There was no honesty about sample size. The model communicated "I am sure" when it should have communicated "I have almost no idea."

**Why it happens:**
- Point estimates are easy to render; intervals are not.
- Averages always produce a number, even when the input is two data points.
- Designers/PMs prefer clean UIs; "12.4 ± 9.8 (n=3)" feels ugly and nerdy.
- Devs trained on ML demos optimize for "looks like a real prediction" rather than calibrated honesty.
- Fishing data is **inherently sparse and seasonal** — most boat/species pairs have <30 data points for a given week-of-year.

**How to avoid:**
- **Always show prediction intervals**, not just the point estimate. Even for the heatmap, color by "expected range" not "expected mean."
- **Show n.** A small "(based on 4 trips)" subscript next to every estimate. Users self-calibrate when n is visible.
- **Hard floor on confidence.** If n < 5, refuse to render a forecast number; show "not enough history" instead. False precision is worse than no answer.
- **Benchmark against seasonal naïve** — the model should beat "what was the average for this week of year last year" before you ship it. If it doesn't, ship the seasonal naïve and call it that.
- **Use prediction intervals (not confidence intervals)** for forecasts — and don't conflate them in copy. Prediction intervals capture future observation uncertainty; confidence intervals capture mean uncertainty. Users care about the former.
- **Calibrate visually.** A wide grey band around a thin line communicates uncertainty in a way "±" notation does not.
- **Avoid decimal-place inflation.** "12 fish" not "12.4 fish." The data isn't precise enough to justify decimals.

**Warning signs:**
- Forecasts displayed without an interval, error bar, or sample-size annotation.
- Decimals beyond what the underlying data supports (catch counts are integers — averaging them shouldn't produce 12.437).
- Predictions that don't degrade gracefully when there are <10 historical samples.
- A user asks "how sure are you?" and you can't answer from the UI alone.

**Phase to address:** **forecast** + **UI** (the math AND the rendering must collaborate).
**Severity:** **deal-breaker** for credibility — a single high-profile bad recommendation can kill the project's reputation in a tight community like San Diego sportfishing.

---

### Pitfall 4: "Fish per angler" misread as personal skill metric

**What goes wrong:**
A user sees "Boat A: 4.2 yellowtail/angler vs Boat B: 2.1 yellowtail/angler" and concludes Boat A is the better skipper. In reality, Boat A had 6 anglers split a 25-fish total (high per-angler because the boat was less crowded); Boat B had 30 anglers share a 60-fish total (lower per-angler because conditions limit how many lines fit). Boat B might actually be the more reliable producer — it just had a fuller load. The metric **"boat total ÷ anglers"** systematically penalizes popular boats and rewards boats that struggled to fill seats.

This is the recreational-fisheries version of the well-documented **CPUE bias problem**: catch-per-unit-effort is rarely proportional to actual abundance or skill, because it conflates fish availability, gear efficiency, crowding, and angler experience.

**Why it happens:**
- The math is intuitive ("divide total by people, get per-person") but the semantics aren't.
- The source provides only boat-aggregate data — you have no way to see whether the 25-fish boat had 6 expert anglers or 6 newbies.
- Trip type and duration matter enormously (a half-day trip will always have lower per-angler counts than a 2-day trip targeting tuna), and naïve averaging across trip types compounds the bias.
- Crowded boats vs. uncrowded boats target different conditions — a boat that left with 30 anglers did so because the captain expected a hot bite; comparing it to a 6-angler trip from a slow Tuesday isn't apples-to-apples.

**How to avoid:**
- **Never compare per-angler metrics across trip types.** Filter/segment so "1/2 Day AM yellowtail" only ever compares against "1/2 Day AM yellowtail."
- **UI copy that names the metric honestly.** "Average catch-per-angler (this is a derived average from boat totals — not individual skill)" beneath the first occurrence on every page. Tooltip on every chart axis.
- **Show absolute boat totals alongside per-angler numbers.** Lets the user see "Boat B caught 60 fish, just had more anglers" rather than just the ratio.
- **Show angler count per trip in detail views.** A boat's 4.2/angler with n=30 anglers is a stronger signal than 4.2/angler with n=6.
- **Document the metric formally** in an "About the data" page that the trip picker links to. Reduces the surface area for misinterpretation in social-media screenshots.
- **Consider median or trimmed mean**, not just mean — one boat-of-the-year trip can drag the average up by 40%. A median per-angler value is more honest about "what should I expect on a typical trip."

**Warning signs:**
- A boat with very few trips ranks #1 on the leaderboard (small-sample artifact).
- The UI shows per-angler numbers without trip-type filtering.
- No tooltip / explanatory text near the metric.
- Users in feedback referring to the number as if it were "fish you personally caught."

**Phase to address:** **UI** (primarily — the math is fine; the framing is the risk) + **forecast** (median/trimmed-mean choices).
**Severity:** **important** — won't break the product, but will erode trust in a community that knows fishing better than you do.

---

### Pitfall 5: Email signup as an open spam relay / list-bombing target

**What goes wrong:**
Three weeks after launch, a botnet uses your signup form as part of a **list-bombing attack** — submitting victims' real email addresses to thousands of newsletter signup forms simultaneously to bury a real email (often a fraud confirmation) in noise. Your domain sends thousands of "Confirm your FishCount alerts subscription" emails to people who never heard of you. Spam complaints spike. Gmail starts filing every FishCount email — including your existing real users — to spam. Your sender reputation is destroyed; recovery takes weeks; legitimate users stop getting alerts.

**Why it happens:**
- Public, unauthenticated signup forms are scanned and abused at internet scale.
- "Just collect the email and start sending" is the obvious MVP path.
- Single opt-in means a bot can submit 10,000 addresses and they all get welcome emails — every one is potential abuse.
- Side-project devs underestimate how fast abuse arrives (often hours after the form is indexed).

**How to avoid:**
- **Double opt-in, no exceptions.** Email is added to the alerts list only after the recipient clicks a confirmation link. Bots don't click; legitimate subscribers do. This is also the strongest single defense against list-bombing.
- **Rate-limit by IP at the form layer.** Max 3 signups per IP per hour. Prevents bot floods.
- **Honeypot field** in the signup form (hidden via CSS, real users don't fill it; bots do). Cheap, no UX cost, blocks low-effort bots.
- **CAPTCHA** (Turnstile / hCaptcha — both have free tiers and don't require Google account) only if abuse persists past honeypot.
- **Disposable-email rejection** at signup time — block `@mailinator.com`, `@10minutemail`, `@guerrillamail`, etc. via a maintained list (e.g., `disposable-email-domains`).
- **Suppression list** that survives unsubscribes — once someone opts out, they stay out even if they're re-signed-up later.
- **One-click unsubscribe** in every email's `List-Unsubscribe` header (RFC 8058). Required by Gmail/Yahoo bulk-sender rules since 2024 — non-compliance tanks deliverability.
- **CAN-SPAM compliance**: physical mailing address in every email, clear sender identity, honor unsubscribes within 10 business days (do it instantly, but the legal limit is 10).

**Warning signs:**
- Signup rate orders of magnitude above your traffic (a side project with 100 visitors/day getting 5,000 signups in an hour is being abused).
- Confirmation click-through rate <20% (bots submit; victims don't confirm).
- Spam complaint rate >0.1% — Gmail throttles at 0.3%.
- Bounce rate >2% — indicates signups using fake/random addresses.

**Phase to address:** **alerts** (the entire alerts feature must ship with these protections; do not ship signup-then-add-protections-later).
**Severity:** **deal-breaker** for the alerts feature — a damaged sender domain is hard to recover and affects every email you ever send.

---

### Pitfall 6: TOS / robots.txt non-compliance leading to legal pressure

**What goes wrong:**
Several months in, FishCount becomes locally known. The owner of sandiegofishreports.com discovers it, reads the TOS they wrote ("no automated data collection"), and sends a takedown letter. Or worse: they don't send a letter, they just notice the project competing for attention with their site and feel adversarial about it. You suddenly need to either negotiate retroactively (much weaker position) or take the project down.

**Why it happens:**
- "Public data on a public website" feels like fair game; it isn't always, especially when redistributed.
- robots.txt is easy to ignore because nothing technical enforces it.
- TOS is rarely read, especially on small/regional sites.
- The project's value depends entirely on one upstream relationship, but no relationship was ever established.

**How to avoid:**
- **Read the TOS and robots.txt before writing the scraper.** If TOS prohibits scraping, the project is a different conversation — proceed only after reaching out to the operator.
- **Identify yourself in User-Agent.** Format: `FishCountBot/1.0 (+https://fishcount.example/about; contact@fishcount.example)`. The site operator should always be able to find a contact for the bot hitting them.
- **Reach out proactively.** A short email: "I'm building a tool for SD anglers that aggregates your dock totals into trip recommendations; here's how I'm scraping (rate, frequency); happy to add backlinks to your site / pause if it's a problem." Most small-site operators are flattered, not threatened. The 5 minutes of outreach buys enormous goodwill and legal cover.
- **Cache aggressively.** Each date should be scraped once and stored — never re-scrape data you already have. Reduces load and reduces the impression of being a scraper.
- **Honor robots.txt** (use `urllib.robotparser` or the `protego` library). Even if not legally binding everywhere, it's the universally-recognized signal of compliance.
- **Don't strip attribution.** Display source attribution prominently ("Data from sandiegofishreports.com") with a link to the source. This is both ethical and legally protective.
- **Avoid bypassing access controls.** No login bypassing, no captcha solvers, no rotating proxies to evade IP bans (those are evidence of bad faith and shift the legal calculus).

**Warning signs:**
- TOS mentions "no automated access" / "no scraping" / "no commercial use" — you found this *after* writing the scraper.
- robots.txt disallows the path you're scraping.
- Your User-Agent is the Python `requests` default or a fake browser string.
- You've never communicated with the source-site operator.

**Phase to address:** **ingest** (Phase 1 — must be settled before the first production scrape) + **ops** (ongoing relationship management).
**Severity:** **deal-breaker** — entire project is built on this one data source.

---

### Pitfall 7: Cost creep from scraping, storage, and email

**What goes wrong:**
Six months in you check the cloud bill: $180/month. The scraper VM is $25, but it's been running 24/7 retrying a broken endpoint with no backoff. Database egress is $40 because your forecast endpoint queries are unindexed and pull full table scans. You added a residential proxy after getting blocked once ($60/mo, never disabled). Email provider went from free tier to paid because of bot signups. You're losing $180/month on a project with zero revenue and 200 users.

**Why it happens:**
- Side projects rarely have a budget; "free tier" thinking lasts until something tips over.
- A scraper that retries forever with no backoff is the most common runaway cost.
- Storing raw HTML "just in case" multiplies storage 10–100x vs. parsed data.
- Adding a paid proxy "just for the backfill" and never removing it.
- Email-list bloat from bot signups → tier upgrade.

**How to avoid:**
- **Budget alerts FIRST.** Whatever cloud you're on, set a billing alert at $20, $50, $100 *before* deploying anything.
- **Hard caps**, not soft ones — set actual spend limits where the platform supports them (GCP supports this; AWS doesn't, so use CloudWatch alerts + Lambda kill).
- **Exponential backoff with a ceiling** on every external call. A loop without a max-delay and max-attempts will burn money on its own.
- **Parsed data is cheap; raw HTML is not.** Compress (gzip), tier (move >90 days old to cheap object storage), and prune (delete >2 years old unless explicitly needed for replay).
- **No always-on VMs for this workload.** A nightly scrape should be a serverless function or a cron-triggered container, not a 24/7 box.
- **Cap the email list size** programmatically — if you blow past expected scale, something is wrong (likely abuse).
- **Single-machine deployment is fine.** $5/mo VPS + SQLite + cron handles this entire project's load. Resist adding managed services until the load demands them.

**Warning signs:**
- Bill changes month-over-month without you adding features.
- Egress charges higher than compute charges (sign of inefficient queries).
- A "temporary" paid service that's been running for months.
- Scraper logs show the same endpoint being retried hundreds of times.

**Phase to address:** **ops** (set up budget alerts before any other phase) + **ingest** (backoff/cap design).
**Severity:** **important** — won't kill the project on day one but will make you resent it; resentment kills side projects faster than failure does.

---

### Pitfall 8: Data gaps that break forecasts silently

**What goes wrong:**
The source site was down for 3 days in November 2024. Your scraper logged the failures but didn't backfill them later. Your forecast model treats Nov 5–7 as "zero fish caught" rather than "no data." The model's confidence interval for early November shrinks (wrongly) because it has more "evidence" of low catches. Users in early November next year see a misleadingly pessimistic forecast.

Variant: A boat takes a 2-week mechanical break. Your "Boat X average for July" silently uses 0 catches for those days — making the boat look bad when in reality the boat just wasn't fishing.

**Why it happens:**
- "Missing record" and "zero catch" look identical in a naïve schema (no row for the date).
- Aggregations (`SUM(catch)/COUNT(days)`) silently divide by an incomplete count.
- No formal distinction between "we tried to scrape and got nothing" vs. "we never tried."
- Backfill on resume doesn't notice gaps, only resumes from "last successful date."

**How to avoid:**
- **Distinguish missing-data from zero-data in schema.** A `scrape_attempts` table separate from `catch_records`: every scrape attempt is logged (success/failure/no-data); a missing day in `catch_records` only means "no fish reported" if there's a successful `scrape_attempt` row for that day.
- **Per-boat trip table** — a boat's "average catch" is per-trip-it-ran, not per-calendar-day. A boat that didn't run on a given day shouldn't drag down its average.
- **Gap audit on every aggregation.** Before computing forecasts, check: "are there scrape gaps in the input window? If yes, surface that in the forecast UI ('forecast based on 87 of 90 days')."
- **Backfill missing dates periodically.** Weekly job: find all dates in the last 30 days where `scrape_attempts` shows failure → retry them.
- **Forward-fill / interpolation should be explicit, not implicit.** If you fill a gap with neighbor values, mark it as imputed in the data model.

**Warning signs:**
- A boat or species shows a sudden zero-catch streak that aligns with known site downtime.
- Forecast confidence narrows during periods you remember being scrape-flaky.
- The forecast model can't explain "how many days of data went into this estimate."

**Phase to address:** **store** (schema) + **forecast** (gap-aware aggregation).
**Severity:** **important** — degrades forecast accuracy and credibility, especially in early months when gaps haven't been found yet.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single `parse_page()` function with hardcoded selectors | Ship scraper in a day | Every selector change requires hunting through code; can't unit-test parsing without HTTP | **Never** — separate "fetch" from "parse" from day one; both functions should be testable independently |
| Skip schema validation ("the data is what the data is") | No Pydantic boilerplate | Garbage rows in DB, downstream queries crash on `None`, forecasts skew on outliers | **Never** for ingest; even minimal `assert isinstance(...)` checks are worth the 10 minutes |
| Single opt-in for email signup | Faster signup flow, fewer drop-offs | List-bombing abuse, sender reputation damage, can't recover deliverability | **Never** — double opt-in is non-negotiable for a public form |
| Hardcoded rate limit constant in code | One less config file | Can't tune without redeploy; tempting to crank up "just for backfill" and forget | OK in MVP if it's a single named constant at top of module; refactor to env var by Phase 2 |
| Storing parsed JSON only, not raw HTML | Less storage cost | When parsing breaks, can't replay against historical pages — must wait for next bug to reproduce | OK only if storage cost is genuinely a concern; gzip raw HTML is ~5KB/day, trivial cost |
| In-process scheduler (`while True: sleep(86400)`) instead of cron / systemd timer | One less moving part | Process restart kills the schedule; no observability into "did it run last night?" | **Never** — use the OS scheduler or a cloud cron; tie a "last run" timestamp to a healthcheck endpoint |
| No "About the data" page | Fewer pages to write | Every misinterpretation of per-angler metrics damages trust irreversibly | **Never** — even one paragraph is enough; write it before launch |
| Forecast point estimates without intervals | Cleaner UI | Once users see point estimates, retroactively adding "± 8" intervals feels like the model "got worse" | **Never** — ship intervals from day one or don't ship forecasts |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| sandiegofishreports.com (scrape source) | Default `python-requests/2.x` User-Agent; no contact info | Custom UA: `FishCountBot/1.0 (+https://fishcount.example/about; you@email)`. Reach out to operator. |
| sandiegofishreports.com (scrape source) | One scrape per page-load, no caching of unchanged pages | Cache ETags / Last-Modified; only re-fetch when changed. Historical dates never need re-scraping after first success. |
| Email service provider (e.g., Resend, Postmark, AWS SES) | Sending from `noreply@yourdomain` without SPF/DKIM/DMARC records | Configure SPF + DKIM + DMARC before first send. DMARC `p=none` to start, escalate to `p=quarantine` after 30 days of clean reports. Without these, Gmail/Yahoo bulk-send rules (effective 2024) reject your mail. |
| Email service provider | Sending from a brand-new domain at full volume on day one | "Warm up" the domain — 50 emails/day for week 1, 200/day for week 2, then scale. Cold-start sending = spam folder. |
| Cron / scheduler | No alerting if the job fails to run at all | Use a "dead-man's switch" service (cron-job.org, healthchecks.io free tier) — your scraper pings on success; absence-of-ping triggers alert. Catches "scheduler died" cases that internal alerts can't. |
| Database (likely SQLite for MVP) | No `WAL` mode → web reads block writes during scrape | `PRAGMA journal_mode=WAL` on connection setup. Critical for any concurrent read/write workload. |
| Forecast library (Prophet, statsmodels, etc.) | Using package defaults without understanding what they assume about seasonality | Read the docs for the seasonality assumptions; many libs assume daily granularity with no gaps. Validate against the seasonal naïve baseline. |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Forecast computed on every page load | Page slow as data grows; CPU spikes | **Pre-compute forecasts** in a nightly job after scrape; serve cached results | When historical dataset crosses ~10K rows or page load >500ms |
| Trip picker queries unindexed `(species, date, boat)` triple | Query latency grows linearly with row count | Index on `(species, date)` and `(boat, date)` from day one | At ~50K rows; SQLite slows noticeably here |
| Loading all historical data into pandas on every request | Memory grows with dataset; eventually OOMs the VM | Query only the date window you need; aggregate in SQL not pandas | At ~100K rows or 512MB VM |
| Heatmap renders 30 dates × N boats with one query each | N+1 query pattern; page-load O(boats × dates) | Single windowed aggregate query, render in client | At ~20+ boats shown simultaneously |
| Email batch sent serially, one HTTP call per recipient | Send takes minutes; partial failures are unrecoverable | Use ESP's batch API; handle bounces async | When subscriber list crosses ~100 |
| Storing raw HTML in main DB instead of object storage | DB size balloons; backups become slow | gzip + write to disk/S3, store filename only in DB | When raw HTML exceeds ~1GB |

This project's expected scale (one source site, hundreds-of-anglers audience) means most of these break at hobby-not-startup thresholds. Don't pre-optimize for 1M users; do prevent the trivially-avoidable issues above.

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing email addresses in a public-readable backup or in committed `.sql` dumps | PII leak; subscribers get spammed by the leaker; reputational damage | Email column encrypted at rest (or at minimum, backups in private storage with restricted access). Never commit any DB dump, even "just for testing." |
| No rate-limit on signup form | List-bombing abuse (see Pitfall 5) | Per-IP rate limit + double opt-in + honeypot |
| Unsubscribe token is the user's email or a sequential ID | Anyone can unsubscribe anyone else (or worse, enumerate the list) | Cryptographically random per-subscriber token (e.g., `secrets.token_urlsafe(32)`); single-use or time-limited |
| Confirmation token leaks via referer header | Account hijack possible (in this project: subscribing as someone else) | Use POST for confirmation, not GET; or set `Referrer-Policy: no-referrer` on the confirmation page |
| Scraper credentials / API keys committed to git | Site operator can revoke; in extreme cases legal exposure | `.env` + `.gitignore` from day one; pre-commit hook scanning for secrets (`gitleaks` or `detect-secrets`) |
| Allowing arbitrary user input into forecast date queries without validation | SQL injection, query-time DoS via massive ranges | Parameterized queries; validate date ranges against a maximum window (e.g., max 1-year window per request) |
| Public scraper-status / admin endpoints with no auth | Anyone can trigger backfill, drain DB, etc. | Auth gate any admin functionality; or simply don't expose these to the public web (run them via SSH/CLI only) |
| User emails in URLs (e.g., `?email=foo@bar.com` in confirmation links) | Email leaks in server logs, browser history, referrer headers | Use opaque tokens that map to email server-side, never put the email in the URL |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing a forecast number for a boat that has fished the target species twice ever | User books based on a number with n=2 sample; bad trip; loses trust permanently | Refuse to render forecast when n < threshold; show "not enough history" with an honest explanation |
| Heatmap colored by raw catch totals (instead of normalized) | Days with more boats out look hotter just because more boats were out | Color by per-trip or per-angler (within trip type), not by absolute boat-day total |
| "Best boat" leaderboard with no minimum-trips filter | A boat that ran one lucky trip ranks #1; user books and is disappointed | Require minimum trip count (e.g., n ≥ 10 in the date range) before a boat appears on a leaderboard |
| Trip picker doesn't disclose its reasoning | User can't tell if "Boat A" is recommended because of recent hot streak, all-time average, or matching past conditions; can't override their own preference | Show the "why": "Top per-angler average for yellowtail in May, last 3 years (n=18 trips)" beside each ranking |
| Alert email arrives but doesn't link back to the data that triggered it | User can't verify or explore — has to log in / search manually | Every alert email links to a deep URL showing the relevant data point and trend |
| Per-angler metric shown without trip-type segmentation | User compares half-day vs. 2-day boats and concludes wrongly | Trip-type filter is mandatory in any per-angler comparison; default to "1/2 Day AM" or whatever's most common |
| Calendar heatmap with no legend | User sees colors but doesn't know what they mean ("is darker = more or less?") | Always include a legend with units ("fish per angler"); pick a colorblind-safe palette (viridis, not red-green) |
| No "last updated" timestamp visible | When scraper breaks, user has no way to know the data is stale | Footer or header on every page: "Data current as of [timestamp]" — pulls directly from latest successful scrape |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but commonly miss critical pieces:

- [ ] **Scraper:** Runs successfully — verify it actually wrote the expected number of rows (not just "exited 0"). Check row count vs. 7-day moving average.
- [ ] **Scraper:** Has a User-Agent — verify it includes contact info, not a fake browser or default `requests` UA.
- [ ] **Scraper:** Handles errors — verify behavior when source returns 500, 429, Cloudflare challenge, or partial HTML (each should be a distinct, monitored failure mode).
- [ ] **Backfill:** Walks all historical dates — verify no gaps in the resulting data; verify a random sample of dates actually parsed correctly.
- [ ] **Forecast:** Produces a number — verify it includes a prediction interval and sample size; verify it refuses to forecast when n is too low.
- [ ] **Forecast:** Beats baseline — verify it actually outperforms the seasonal naïve forecast on a hold-out period; otherwise ship the baseline.
- [ ] **Trip picker:** Recommends a boat — verify the recommendation includes the "why" (sample size, date range, trip type filter).
- [ ] **Per-angler metric:** Displayed — verify the page includes the disclaimer that it's a derived average; verify trip-type filtering is enforced.
- [ ] **Email signup:** Form submits — verify double opt-in is wired (email lands in DB only after click); verify rate-limit + honeypot are active.
- [ ] **Email send:** Email delivered — verify SPF/DKIM/DMARC pass at the recipient (check via mail-tester.com or send-to-self with "show original"); verify `List-Unsubscribe` header is present.
- [ ] **Unsubscribe:** Link works — verify it actually removes from the list (don't just show a "you're unsubscribed" page); verify it works without login.
- [ ] **Monitoring:** Scraper has alerts — verify alert fires when scrape fails AND when scrape succeeds with abnormally low row count AND when scrape doesn't run at all (dead-man's switch).
- [ ] **Database:** Has backups — verify a backup actually restores; verify backups don't include PII in plaintext if they're stored anywhere accessible.
- [ ] **TOS/legal:** Compliance — verify robots.txt is honored; verify TOS reviewed; verify source attribution is visible on every public page.
- [ ] **Cost:** Budget alerts — verify a billing alert exists and a test trigger fires.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Scraper IP-blocked by source site | **HIGH** | (1) Stop the scraper immediately. (2) Email the site operator, apologize, explain the rate-limit fix. (3) Wait for unblock — could be days or never. (4) If unblocked: deploy fixed scraper with conservative limits. (5) If not: project may need to pivot or end. |
| Silent scraper drift discovered late | MEDIUM | (1) Snapshot current source HTML. (2) Mark all data since suspected break date as "needs revalidation." (3) Update parser, re-scrape affected window from raw HTML if snapshotted, or from the source if not (carefully, respecting rate limits). (4) Add row-count + schema-validation monitoring so it can't recur silently. |
| Sender reputation damaged by spam complaints | **HIGH** | (1) Pause all bulk sending immediately. (2) Audit list — remove anyone unconfirmed, anyone bouncing, anyone who hasn't engaged in 90+ days. (3) Restart sending from cold-warm-up volumes (50/day, slowly increase). (4) Consider switching to a fresh sender subdomain (the parent domain reputation persists; subdomain can be a fresh start). (5) Investigate root cause (was it bot signups? broken unsubscribe?) and fix before resuming. |
| Forecast publicly criticized as misleading | MEDIUM | (1) Review the specific call-out — is it a bug or a UX framing issue? (2) If framing: add explanatory copy + confidence intervals immediately. (3) If bug: fix model, add backtests for that scenario. (4) Acknowledge openly to the community ("you're right, here's what we changed"). Defensive posture in a tight community = death; humility is the recovery move. |
| Cloud bill surprise ($X you didn't plan to spend) | LOW–MEDIUM | (1) Identify the runaway resource (egress? compute? proxy?). (2) Kill it. (3) Add a billing alert at half the surprise level. (4) Most providers will refund first-time billing-surprise charges if you ask politely. |
| Gap discovered in historical data after forecasts have been served | MEDIUM | (1) Mark the gap explicitly in the data model (`scrape_attempts` table with explicit failure rows for the gap dates). (2) Try to backfill from the source. (3) If unrecoverable, update forecast aggregations to be gap-aware (don't divide by total days, divide by days-with-data). (4) Update UI to show "based on N of M expected days." |
| TOS complaint / takedown request from source operator | **HIGH** | (1) Comply immediately — pause scraping. (2) Respond promptly and respectfully; offer to discuss. (3) Negotiate (backlinks, attribution, slower rate, paid data feed). (4) If no agreement possible, the project ends — accept that gracefully. |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls. Phases shown are the **earliest** phase that must address each pitfall — later phases may need to reinforce.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Backfill hammers source | **ingest** (Phase 1) | Backfill takes >24h for full history; logs show ≤12 req/min; resumable across restarts |
| Silent scraper failure | **ingest** (Phase 1) | Row-count monitoring active; freshness SLA defined; alert fires when test row-count drops |
| Forecast looks confident but isn't | **forecast** + **UI** (Phase 3) | Prediction intervals on every forecast; n shown; refuses to forecast at n < 5; beats seasonal naïve |
| Per-angler misread as skill metric | **UI** (Phase 2 — first time the metric is shown) | "About the data" page exists; tooltip on every chart; trip-type filter mandatory; absolute totals shown alongside |
| Email signup abuse | **alerts** (Phase 4) | Double opt-in works; rate-limit + honeypot active; disposable-email check active; SPF/DKIM/DMARC pass |
| TOS / robots.txt non-compliance | **ingest** (Phase 1, before first scrape) | TOS reviewed in writing; robots.txt parsed and honored; custom UA with contact deployed; source operator notified |
| Cost creep | **ops** (Phase 0 — before any deployment) | Billing alert configured at $20/$50/$100; backoff + cap on every external call; nightly job not 24/7 process |
| Data gaps break forecasts | **store** (Phase 1 schema) + **forecast** (Phase 3) | `scrape_attempts` table separate from data; aggregations are gap-aware; UI shows "based on N of M days" when gaps exist |

**Phase ordering implication:** **ops** (cost alerts, dead-man's switch) is a prerequisite for **ingest**, even though it has no user-facing output. Don't start scraping into the cloud without budget + monitoring guardrails.

---

## Sources

**Web scraping ethics, legality, and resilience:**
- [Web Scraping Laws And Ethics 2026 — DataDwip](https://www.datadwip.com/blog/web-scraping-laws-and-ethics/)
- [Is Web Scraping Legal in 2026? The Complete Compliance Guide — PromptCloud](https://www.promptcloud.com/blog/is-web-scraping-legal/)
- [Ethical Web Scraping: Principles and Practices — DataCamp](https://www.datacamp.com/blog/ethical-web-scraping)
- [How to Effectively Use User Agents for Web Scraping — Scrapfly](https://scrapfly.io/blog/posts/user-agent-header-in-web-scraping)
- [Best Practices and Guidelines for Scraping — Pluralsight](https://www.pluralsight.com/guides/best-practices-and-guidelines-for-scraping)

**Silent failure detection in scraping pipelines:**
- [The Silent Data Crisis: Is Your Web Scraping Working? — Medium](https://medium.com/@patryk_b/the-silent-data-crisis-is-your-web-scraping-working-b87f2c7ad1b5)
- [Why Most Web Scraping Systems Fail Silently (And How to Design Around It) — DEV](https://dev.to/anna_6c67c00f5c3f53660978/why-most-web-scraping-systems-fail-silently-and-how-to-design-around-it-40o6)
- [Web Scraping Monitoring & Failure Detection Guide 2026 — PromptCloud](https://www.promptcloud.com/blog/web-scraping-monitoring-challenges/)
- [How to Detect Scraper Failures — Ficstar](https://www.ficstar.com/how-to-detect-scraper-failures)
- [Most Web Scrapers Break for the Same Reasons — Medium](https://yagneshmangali.medium.com/most-web-scrapers-break-for-the-same-reasons-656da4833b2f)

**Forecasting on small/sparse datasets:**
- [Common Mistakes in Time-Series Forecasting (and How to Avoid Them) — Medium](https://medium.com/@gayatrishetti1/common-mistakes-in-time-series-forecasting-and-how-to-avoid-them-56e9a33a987d)
- [An Alternative Methodology for Demand Forecasting with Small Data Sets — Bain](https://www.bain.com/insights/an-alternative-methodology-for-demand-forecasting-with-small-data-sets/)
- [Forecast evaluation for data scientists: common pitfalls and best practices — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9718476/)
- [Mastering Prediction Intervals — Number Analytics](https://www.numberanalytics.com/blog/mastering-prediction-intervals-best-practices-forecasting)
- [Very long and very short time series — Hyndman, Forecasting: Principles and Practice](https://otexts.com/fpp2/long-short-ts.html)

**Catch-per-unit-effort (fisheries-specific bias):**
- [Interpreting catch per unit effort data — ICES Journal of Marine Science](https://academic.oup.com/icesjms/article/63/8/1373/710477)
- [Catch per unit effort modelling for stock assessment: A summary of good practices — ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0165783623002539)
- [Catch per unit effort — Wikipedia](https://en.wikipedia.org/wiki/Catch_per_unit_effort)
- [Reliability of self-reported catch and effort data via a smartphone application — ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0165783625002395)

**Email signup abuse, deliverability, and CAN-SPAM:**
- [Battling Spam Sign-Ups: Why Email Verification Isn't Enough — EmailListVerify](https://emaillistverify.com/blog/battling-spam-sign-ups/)
- [How to prevent email list-bombing and bot sign-up attacks — Suped](https://www.suped.com/knowledge/email-deliverability/sender-reputation/how-to-prevent-email-listbombing-and-bot-sign-up-attacks)
- [How can I prevent nefarious email signups using rate limiting, reCAPTCHA, and double opt-in? — Suped](https://www.suped.com/knowledge/email-deliverability/compliance/how-can-i-prevent-nefarious-email-signups-using-rate-limiting-recaptcha-and-double-opt-in)
- [Email Marketing Compliance in 2026: GDPR, CAN-SPAM & Privacy Laws Explained — Hustler Marketing](https://www.hustlermarketing.com/email-marketing-compliance-in-2026-gdpr-can-spam-privacy-laws-explained/)
- [Email Deliverability Issues: Diagnose, Fix, Prevent — Mailtrap](https://mailtrap.io/blog/email-deliverability-issues/)
- [Single Opt-in vs. Double Opt-in — Mailchimp](https://mailchimp.com/help/single-opt-in-vs-double-opt-in/)

**Side-project cost / sustainability:**
- [How much does it cost to run your side project? — Indie Hackers](https://www.indiehackers.com/post/how-much-does-it-cost-to-run-your-side-project-6811b201e5)
- [The Hidden Cost of Building Your Own Web Scraping Team — DEV](https://dev.to/loopsthings/the-hidden-cost-of-building-your-own-web-scraping-team-1b0i)
- [Project Red Flags for the Solo Dev — Delicious Brains](https://deliciousbrains.com/project-red-flags-for-the-solo-dev/)

**Misleading visualizations:**
- [Misleading Data Visualization — Coupler.io](https://blog.coupler.io/misleading-data-visualization-examples/)
- [Bad Data Visualization: 5 Examples of Misleading Data — HBS Online](https://online.hbs.edu/blog/post/bad-data-visualization)
- [Misleading Data Visualizations — Critical Data Literacy (Toronto Metropolitan U)](https://pressbooks.library.torontomu.ca/criticaldataliteracy/chapter/misleading-data-visualizations/)

**Time-series gaps:**
- [Handling Missing Data in Time Series: 5 Methods — growth-onomics](https://growth-onomics.com/handling-missing-data-in-time-series-5-methods/)
- [Forecasting time series with missing values — Skforecast Docs](https://skforecast.org/0.6.0/faq/forecasting-time-series-with-missing-values)
- [How to Identify Missing Data in Time-Series Datasets — KDnuggets](https://www.kdnuggets.com/how-to-identify-missing-data-in-timeseries-datasets)

---
*Pitfalls research for: FishCount — public web app scraping a third-party fishing-reports site, deriving forecasts and per-angler metrics, sending email alerts*
*Researched: 2026-04-22*
