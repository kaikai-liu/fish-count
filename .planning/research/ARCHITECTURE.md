# Architecture Research

**Domain:** Public data-aggregation app — scheduled scraper + historical store + statistical forecast + read-only web UI + email alerts
**Researched:** 2026-04-22
**Confidence:** HIGH (pattern is well-established for civic-data / dashboard-style side projects; specific stack choices are MEDIUM until cross-checked with STACK.md)

## Standard Architecture

For an app of this shape and scale (one developer, one upstream source, hundreds-to-low-thousands of daily records, public read-only UI, optional email subscriptions) the dominant pattern in the wild is a **modular monolith**: one deployable application with clearly separated internal modules, one shared database, and an external scheduler (cron / platform cron / GitHub Actions) that pokes scheduled endpoints.

This is the pattern City Bureau's `city-scrapers`, `civic-scraper`, and similar civic-data projects use. It's also what Vercel-style "small Next.js app + cron jobs" deployments look like in 2026. Microservices, queues (Kafka/RabbitMQ), and stream processors are all overkill at this scale and would slow shipping without solving any actual problem.

### System Overview

```
                          ┌──────────────────────────────────┐
                          │  External Scheduler (cron)        │
                          │  - nightly scrape tick            │
                          │  - hourly forecast recompute      │
                          │  - alert dispatch tick            │
                          └────────────┬─────────────────────┘
                                       │ HTTP POST (signed)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Application (single deployment)                    │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │   Web UI     │  │  Public API  │  │  Cron Routes │  │  Subscribe  │  │
│  │  (RSC pages) │  │  (read-only) │  │ (scrape/fc/  │  │   /Verify   │  │
│  │              │  │              │  │  alert ticks)│  │  /Unsub     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  │
│         │                 │                  │                  │        │
│         └─────────┬───────┴────┬─────────────┼──────────────────┘        │
│                   │            │             │                           │
│                   ▼            ▼             ▼                           │
│           ┌─────────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────┐    │
│           │  Query /    │ │ Forecast │ │   Scraper    │ │  Alerts  │    │
│           │  Read API   │ │  Engine  │ │   Pipeline   │ │  Engine  │    │
│           │  (services) │ │          │ │              │ │          │    │
│           └──────┬──────┘ └────┬─────┘ └──────┬───────┘ └────┬─────┘    │
│                  │             │              │               │          │
│                  └─────────────┴──────┬───────┴───────────────┘          │
│                                       ▼                                  │
│                          ┌────────────────────────┐                      │
│                          │   Data Access Layer    │                      │
│                          │   (typed repositories) │                      │
│                          └────────────┬───────────┘                      │
└───────────────────────────────────────┼──────────────────────────────────┘
                                        │
                                        ▼
                          ┌────────────────────────┐
                          │   Database (SQLite)    │
                          │   - catch_reports      │
                          │   - boats / landings   │
                          │   - forecasts          │
                          │   - subscribers        │
                          │   - scrape_runs        │
                          │   - alerts_sent        │
                          └────────────┬───────────┘
                                       │
                                       │ (outbound only)
                                       ▼
                          ┌────────────────────────┐
                          │  Email Provider API    │
                          │  (Resend / Postmark)   │
                          └────────────────────────┘
                                       ▲
                                       │
                          ┌────────────┴───────────┐
                          │  sandiegofishreports   │
                          │       .com (HTML)      │
                          └────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Scraper Pipeline** | Fetch HTML for a given date, parse boat/landing/trip/species/counts, upsert to `catch_reports`. Emits per-run telemetry to `scrape_runs`. | Pure function `scrapeDate(date) → CatchReport[]` + a writer that calls `repo.upsertReports(rows)`. Backfill is the same function in a loop with rate-limiting. |
| **Data Access Layer** | Typed repositories that own SQL. The only module that talks to the DB. | Thin functions per table (`getReportsByDateRange`, `upsertReports`, `getForecast(boatId, species, date)`). Use a query builder or hand-written SQL with prepared statements. |
| **Forecast Engine** | Reads from `catch_reports`, computes per-(boat, species, day-of-year) statistical projections (mean + confidence band), writes to `forecasts` table. | Batch job: rebuild forecasts table after each successful scrape. Pure-math module — no I/O except via the DAL. |
| **Query / Read API** | Composes data for UI views: trip-picker ranking, calendar heatmap, trend charts, boat comparisons. | Server-side service functions called directly by Server Components or by REST/route handlers. |
| **Web UI** | Renders the public read-only views. No write actions except the email-signup form. | Server Components for data-heavy pages (heatmap, trends), Client Components only for interactive filters/charts. |
| **Subscribe / Verify / Unsub Routes** | Email signup (double opt-in), confirmation, unsubscribe via signed token. The only user-input write path. | A handful of route handlers that hit `subscribers` table and dispatch confirmation emails via the email provider. |
| **Alerts Engine** | After each scrape, evaluates "did anything happen worth telling someone about?" against subscriber preferences. Writes `alerts_sent` and dispatches email. | Pure rule evaluation against fresh `catch_reports`, deduped against `alerts_sent` so the same alert never fires twice. |
| **Cron Routes** | Authenticated HTTP endpoints invoked by the external scheduler. Each is a thin wrapper that calls the right pipeline. | One endpoint per scheduled job. Auth via shared secret in `Authorization` header. |

The boundary discipline that matters: **only the DAL touches SQL**, and **only the cron routes are scheduler-facing**. Everything else is pure-ish service code that can be unit-tested without a network or a clock.

## Recommended Project Structure

```
src/
├── app/                          # Next.js App Router (or framework equivalent)
│   ├── (public)/
│   │   ├── page.tsx              # Trip picker landing
│   │   ├── boats/[id]/page.tsx   # Boat detail / comparison
│   │   ├── trends/page.tsx       # Trend charts
│   │   └── calendar/page.tsx     # 30-day heatmap
│   ├── subscribe/                # Signup, verify, unsubscribe pages
│   │   ├── page.tsx
│   │   ├── verify/[token]/route.ts
│   │   └── unsubscribe/[token]/route.ts
│   └── api/
│       ├── cron/
│       │   ├── scrape/route.ts   # Nightly scrape tick
│       │   ├── forecast/route.ts # Rebuild forecasts
│       │   └── alerts/route.ts   # Evaluate + send alerts
│       └── subscribe/route.ts    # POST: create pending subscription
├── lib/
│   ├── db/                       # DAL — the ONLY place SQL lives
│   │   ├── client.ts             # better-sqlite3 (or Drizzle) instance
│   │   ├── schema.ts             # Migrations / table definitions
│   │   ├── reports.ts            # getReports, upsertReports, ...
│   │   ├── forecasts.ts          # getForecast, writeForecasts, ...
│   │   ├── subscribers.ts        # createPending, confirm, unsubscribe, ...
│   │   └── runs.ts               # scrape_runs + alerts_sent ledgers
│   ├── scraper/
│   │   ├── fetch.ts              # HTTP fetch w/ rate limit + retry
│   │   ├── parse.ts              # HTML → CatchReport[]
│   │   ├── pipeline.ts           # scrapeDate(date) → upsert
│   │   └── backfill.ts           # walkAllDates() generator
│   ├── forecast/
│   │   ├── statistics.ts         # mean, std, percentiles, CI bands
│   │   ├── windows.ts            # day-of-year + rolling window logic
│   │   └── compute.ts            # Orchestrates: read history → write forecasts
│   ├── trip-picker/
│   │   ├── rank.ts               # Score boats for (date, species)
│   │   └── heatmap.ts            # 30-day calendar shaping
│   ├── alerts/
│   │   ├── rules.ts              # "Species started running" / "boat hot day"
│   │   ├── evaluate.ts           # Subscribers × fresh reports → AlertCandidate[]
│   │   └── dispatch.ts           # Render template → call email provider
│   ├── email/
│   │   ├── provider.ts           # Resend/Postmark client wrapper
│   │   ├── templates/            # React Email components or HTML templates
│   │   └── tokens.ts             # Signed verify/unsubscribe tokens
│   └── shared/
│       ├── types.ts              # Domain types (CatchReport, Forecast, Subscriber)
│       ├── dates.ts              # Date helpers (always work in PT)
│       └── auth.ts               # Cron route shared-secret guard
└── components/                   # UI: charts, tables, filters
    ├── trip-picker/
    ├── charts/
    └── ui/                       # shadcn/ui primitives
```

### Structure Rationale

- **`app/api/cron/*` is the only async-trigger surface.** Every scheduled job is a route. This makes scheduling pluggable (Vercel Cron, GitHub Actions, system cron — they all just POST a URL) and makes manual re-runs trivially easy ("just curl the endpoint with the secret").
- **`lib/db/` is the SQL bulkhead.** Domain modules import repositories, never the DB client directly. This is the single most important boundary — it lets you swap SQLite for Postgres later without touching scraper/forecast/alerts code.
- **`lib/scraper`, `lib/forecast`, `lib/alerts` are pure-ish.** They take inputs, call repositories, return values. Easy to unit-test without mocks. The pipelines (orchestration) are what the cron routes call.
- **`lib/shared/types.ts` is the lingua franca.** `CatchReport`, `Forecast`, `Subscriber` are defined once. Every module agrees on shapes.
- **`components/` is dumb.** Charts and tables receive already-shaped data from Server Components calling service functions. No data fetching from inside components.

## Architectural Patterns

### Pattern 1: Modular Monolith

**What:** One application, one database, internal module boundaries enforced by import discipline (the DAL bulkhead). Components communicate via direct function calls, not network hops.

**When to use:** Single developer, single source of data, predictable scale. Almost every "civic data" / "small public dashboard" project lives here forever and is fine.

**Trade-offs:**
- ✅ Trivial to develop, test, deploy. One process to reason about. One DB transaction boundary.
- ✅ Refactoring across modules is just moving code, not coordinating service rollouts.
- ❌ Can't scale individual components independently — but at this scale you don't need to.
- ❌ A bad scrape can in principle take down the web UI if you're sloppy with timeouts. Mitigation: cron routes have tight timeouts and never block on each other.

### Pattern 2: Idempotent Upsert by Natural Key

**What:** Every scrape writes via `INSERT ... ON CONFLICT (boat_id, date, trip_type) DO UPDATE`. Re-running a date — for backfill, retry after a parse fix, or just paranoia — produces the same final state.

**When to use:** Always, for any scraper writing to a persistent store. This is the single biggest reliability lever.

**Trade-offs:**
- ✅ Backfill is just "loop over dates and call `scrapeDate`." Resume is automatic.
- ✅ A bug in the parser? Fix it, re-run the affected dates. No cleanup needed.
- ✅ Schema changes: add the column with a default, re-run the scraper, done.
- ❌ Requires you to choose a real natural key up front. For FishCount: `(date, boat_id, trip_type)` is the right grain (a boat can run AM and PM on the same date).

**Example:**
```typescript
// lib/db/reports.ts
export function upsertReports(rows: CatchReport[]) {
  const stmt = db.prepare(`
    INSERT INTO catch_reports
      (date, boat_id, landing_id, trip_type, anglers, species, count, scraped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (date, boat_id, trip_type, species)
    DO UPDATE SET
      landing_id = excluded.landing_id,
      anglers    = excluded.anglers,
      count      = excluded.count,
      scraped_at = excluded.scraped_at
  `);
  const tx = db.transaction((rows: CatchReport[]) => {
    for (const r of rows) stmt.run(r.date, r.boatId, r.landingId, r.tripType,
                                    r.anglers, r.species, r.count, r.scrapedAt);
  });
  tx(rows);
}
```

### Pattern 3: Precompute Aggregates, Read Cheap

**What:** Trip-picker rankings, calendar heatmap colors, and forecasts are all derived from raw `catch_reports`. Instead of computing them per-request, compute them on a schedule (after each successful scrape) and store them in `forecasts` / `boat_rankings` tables. The web UI does cheap key-lookup reads.

**When to use:** Read-heavy app where the underlying data only changes once a day. Exactly your situation.

**Trade-offs:**
- ✅ Page renders are fast and cheap regardless of history depth. A 5-year backfill doesn't slow down the trip picker.
- ✅ Forecast logic is exercised once per day, not once per pageview — easier to monitor.
- ❌ Stale-by-up-to-one-scrape-cycle. Acceptable: the source data itself only updates once per evening.
- ❌ Schema changes to forecast tables require a recompute. Mitigation: forecast recompute is itself idempotent and cheap.

### Pattern 4: Cron-Routes-Over-HTTP for Scheduling

**What:** The scheduler (Vercel Cron, GitHub Actions, or system cron) is *external* to the app and triggers jobs by POSTing to authenticated endpoints (`/api/cron/scrape`, `/api/cron/forecast`, `/api/cron/alerts`). Auth is a shared secret in the `Authorization` header.

**When to use:** Any time you have scheduled work in a web app. Especially good for serverless/edge deployments where the runtime can't host a long-running process.

**Trade-offs:**
- ✅ Manual re-run is just `curl -H 'Authorization: Bearer …' https://app/api/cron/scrape?date=2024-06-15`. No special tooling.
- ✅ The same code path runs in dev, in tests, and in production.
- ✅ Scheduler is swappable (Vercel Cron in prod, plain cron in a self-hosted variant).
- ❌ Scheduler reliability becomes part of your dependencies. Mitigation: log every run to `scrape_runs`, alert on missed runs.
- ❌ Long-running backfill won't fit in a single function invocation (Vercel function timeouts are ~5–15 min). Mitigation: backfill is its own batch script run from the developer's machine, not a cron route.

### Pattern 5: Backfill as a Script, Incremental as a Cron

**What:** The one-time historical crawl is a long-running script (`pnpm backfill --from=2018-01-01 --to=2024-12-31`) you run locally, with checkpointing to `scrape_runs` so it resumes from where it left off after a crash or rate-limit pause. Daily incremental scraping is a cron route that scrapes "yesterday" (or the last N missing dates).

**When to use:** Whenever historical depth is part of the product but the source has finite history that doesn't change retroactively. Both scrapers share the same `scrapeDate(date)` primitive.

**Trade-offs:**
- ✅ Backfill can take hours and politely rate-limit itself; it doesn't need to fit in a function timeout.
- ✅ Daily cron stays small and predictable.
- ✅ The same `scrapeDate` function is exercised both ways, so a bug shows up in both contexts.
- ❌ Two entry points to keep coordinated. Mitigation: both entry points are 10-line wrappers around the shared pipeline.

## Data Flow

### Scrape → Store Flow (writes)

```
[Scheduler] (nightly, 02:00 PT)
    ↓ POST /api/cron/scrape (Bearer token)
[Cron route] verifies auth, picks target date(s)
    ↓ scraper.pipeline.scrapeDate(date)
[fetch.ts] GETs sandiegofishreports.com/dock_totals/boats.php?date=…
    ↓ HTML
[parse.ts] returns CatchReport[]
    ↓
[db.reports.upsertReports(rows)] — idempotent UPSERT
    ↓
[db.runs.recordRun({date, count, status})] — telemetry
    ↓
[forecast.compute.rebuildAffected(date)] — recompute forecasts touching this date
    ↓
[alerts.evaluate.run(date)] — emit candidate alerts for newly-confirmed reports
    ↓
[alerts.dispatch.send(candidates)] — for each new candidate, render template + send email + record in alerts_sent
```

### UI Read Flow (reads)

```
[User] visits /trip-picker?date=2026-05-12&species=yellowtail
    ↓
[Server Component] calls trip-picker.rank.rankBoats({date, species})
    ↓
[trip-picker.rank] calls db.forecasts.getForecastsForDate(date, species)
    ↓ (precomputed; cheap key-range scan)
[DAL] returns Forecast[] from forecasts table
    ↓
[trip-picker.rank] sorts, attaches per-boat metadata from db.boats.list()
    ↓
[Server Component] renders ranked list + heatmap with already-shaped data
    ↓
[User] sees response (no client-side fetch round-trip)
```

### Subscribe → Verify → Alert Flow (the only user-initiated write path)

```
[User] submits email + species/boat preferences on /subscribe
    ↓ POST /api/subscribe
[Subscribe route] db.subscribers.createPending(email, prefs) → returns id
    ↓ email.tokens.signVerify(id) → token
    ↓ email.provider.send("Confirm your FishCount alerts", verifyLink)
[User] receives email, clicks verify link → /subscribe/verify/[token]
    ↓
[Verify route] decodes + validates token, db.subscribers.confirm(id)
    ↓ Subscriber is now active

…(later, after a scrape)…

[Alerts engine] iterates active subscribers
    ↓ for each: rules.matches(subscriber, todays_reports, history)?
    ↓ if yes & not already in alerts_sent: render + send + record
```

### Backfill Flow (one-time, dev-machine)

```
[Developer] runs `pnpm backfill --from=2018-01-01`
    ↓
[backfill.ts] queries db.runs.completedDates() → set of done dates
    ↓
[backfill.ts] for each missing date in range:
    ↓ rate-limit (1 req per N seconds)
    ↓ scraper.pipeline.scrapeDate(date)
    ↓ db.runs.recordRun(...)
    ↓ on crash/SIGINT: resume next time picks up where it left off
```

### Key Data Flows Summary

1. **Catch report ingestion:** HTML → parser → `CatchReport[]` → idempotent upsert → forecast recompute → alert evaluation
2. **Trip-picker query:** `(date, species)` → precomputed `forecasts` table lookup → ranked list (no live computation)
3. **Email lifecycle:** signup form → pending subscriber + verification email → click → confirmed subscriber → eligible for alerts on next scrape
4. **Backfill:** local CLI script → loops dates → same `scrapeDate` → resumable via `scrape_runs` ledger

## Suggested Build Order

The build order is dictated by what depends on what. Each layer below produces the substrate the next one consumes.

1. **Schema + DAL first.** You can't write a scraper without somewhere to put the rows, and you can't ship a UI without rows to read. Define `catch_reports`, `boats`, `landings`, `scrape_runs` tables and write the repository functions. Hand-load 1–2 days of data manually (CSV or copy-paste) so the DAL is exercisable. Locks in the canonical `CatchReport` shape that everything else conforms to.

2. **Scraper pipeline.** Build `fetch.ts`, `parse.ts`, `pipeline.scrapeDate(date)`. Call it from a CLI script; verify `db.reports.upsertReports` works. Idempotency check: run the same date twice, confirm no duplicates. Don't bother with cron yet — manual invocation is fine until the parser is stable.

3. **UI read path (trip picker + raw browse).** With real data in the DB, build the trip-picker page that reads via the DAL (no forecasts yet — just sort by historical mean catch). Trends, comparisons, calendar heatmap follow. This proves the schema is queryable for the views you actually want, *before* you invest in forecast precomputation.

4. **Backfill script.** Now that you trust the parser and the schema, run the historical walk. Months of data unlock the forecast layer.

5. **Forecast layer.** Build `forecast/statistics.ts` (pure math, unit-testable in isolation) and `forecast/compute.ts` (orchestrates read → compute → write to `forecasts` table). Wire the trip picker to read from `forecasts` instead of computing live. Calendar heatmap colors flow from here too.

6. **Cron infrastructure.** Wrap `scrapeDate` and `forecast.rebuild` in `/api/cron/*` routes. Configure the scheduler. Add the `scrape_runs` ledger if you didn't in step 1.

7. **Email subscriptions (signup + verify + unsubscribe).** Schema for `subscribers`, signed tokens, transactional email provider integration, the three routes. No alerts yet — just prove the lifecycle works.

8. **Alerts engine.** Now that subscribers exist and forecasts/reports are reliable, build the rules and dispatch. Add `alerts_sent` for dedup. Wire into the post-scrape flow.

9. **Polish.** Filters, search, boat comparison niceties, loading states, error pages.

This order has a useful property: **after each step, you have a thing you can use.** After step 3 you have a usable historical-data browser. After step 5 you have the trip picker. Alerts and email are layered on at the end because they're nice-to-have, not load-bearing.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **sandiegofishreports.com** | Polite scheduled HTTP GETs from `lib/scraper/fetch.ts`. Honor `robots.txt`, set a descriptive `User-Agent` (include contact email), rate-limit (1 req per 2–5 sec for backfill, single req for nightly). Cache HTML to disk during dev to avoid re-hitting during parser iteration. | Single point of failure for the whole product. Wrap fetch in a circuit breaker that records failures to `scrape_runs` and bails after N consecutive errors so a site-side change doesn't pummel them. |
| **Email provider (Resend recommended)** | One thin wrapper at `lib/email/provider.ts`. All sends go through it. React Email templates colocated. | Resend pairs naturally with React/Next stacks (templates as JSX) and has clean error semantics. Postmark is the alternative if deliverability for transactional/alert email becomes a concern. Avoid SendGrid for a side-project — pricing and complexity overhead. |
| **Scheduler (Vercel Cron / GitHub Actions / system cron)** | External. POSTs to `/api/cron/*` with shared-secret bearer token. | Vercel Cron is cheapest if hosting on Vercel. GitHub Actions cron is free, framework-agnostic, and easy to manage. System cron if self-hosting. All three work identically against the same routes. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Cron route ↔ Pipeline | Direct function call | Cron route does auth + parameter validation, delegates to pipeline. Pipeline returns a result object the route logs. |
| Pipeline ↔ DAL | Direct function call | Pipelines compose DAL functions in transactions where appropriate. |
| Pipeline ↔ Pipeline (e.g., scrape → forecast) | Direct function call within the scrape route handler | Scrape route awaits scrape, then awaits forecast rebuild. Sync chain. If forecast becomes slow (>30s), split into a separate cron tick that reads `scrape_runs` to find new completed dates and rebuilds forecasts for them. |
| Web UI ↔ Domain services | Direct function call from Server Components | No internal HTTP fetch hop. RSC calls service code directly; service code calls DAL. |
| Alerts engine ↔ Email provider | HTTP via `lib/email/provider.ts` wrapper | Wrapper is the only place that knows which provider you're using. Swap by changing one file. |
| Anywhere ↔ Database | DAL only | This is the most important boundary in the system. Linting / convention should forbid `import db` outside `lib/db/`. |

### Critical Contracts

These are the type signatures everything orbits. Lock them down early, change them carefully.

```typescript
// lib/shared/types.ts

type CatchReport = {
  date: string;          // YYYY-MM-DD, Pacific Time
  boatId: string;
  landingId: string;
  tripType: string;      // "1/2 Day AM", "Full Day Coronado", "2 Day", ...
  anglers: number;
  species: string;       // canonical species name
  count: number;         // total fish of this species on this trip
  scrapedAt: string;     // ISO8601
};

type Forecast = {
  boatId: string;
  species: string;
  targetDate: string;    // YYYY-MM-DD
  mean: number;          // expected fish-per-angler
  ciLow: number;         // lower 80% confidence band
  ciHigh: number;        // upper 80% confidence band
  sampleSize: number;    // historical N this is based on
  computedAt: string;
};

type Subscriber = {
  id: string;
  email: string;
  status: 'pending' | 'active' | 'unsubscribed';
  preferences: { species: string[]; boats: string[]; landings: string[] };
  createdAt: string;
  confirmedAt: string | null;
};

// The contracts:
// - Scraper writes CatchReport[]; nothing else writes to that table.
// - Forecast engine reads CatchReport[], writes Forecast[]; nothing else writes forecasts.
// - Trip picker reads Forecast[] only.
// - Alerts engine reads CatchReport[] (for "today") + Subscriber[]; writes alerts_sent.
```

If these stay stable, you can rewrite any single component without touching the others.

## Trade-offs Explicitly Considered

### Monolith vs. service split
**Choice:** Modular monolith. **Why:** One developer, one DB, one upstream source. A service split would force you to invent inter-service contracts, deploy multiple things, and reason about partial failures — for zero scaling benefit at this size. The bulkhead between `lib/db/` and everything else gives you 90% of the future-flexibility of a service split with 10% of the cost.

### Sync vs. async forecast computation
**Choice:** Sync chain inside the scrape route — forecast recompute runs immediately after scrape completes, in the same request. **Why:** The whole computation for one day's worth of new data is small (seconds). Async (queue, separate worker) is real complexity; the sync version is `await rebuildForecasts(date)`. **Escape hatch:** If forecast rebuild ever exceeds the cron route's timeout, split it into its own `/api/cron/forecast` tick that reads `scrape_runs` to find unprocessed dates. This is a 30-minute refactor, not an architectural change.

### Push vs. pull alerts
**Choice:** Push, evaluated immediately after scrape. **Why:** Source data only updates once per day. Polling for "did anything happen?" from a separate cycle is wasted complexity. The scrape pipeline already knows what just changed; have it trigger alert evaluation in the same request. Dedup via `alerts_sent` ledger ensures a re-run never double-sends.

### Compute trip-picker live vs. precompute forecasts
**Choice:** Precompute. **Why:** Read traffic on a public site is unpredictable — somebody links you on a forum and you have 100 concurrent reads. Live computation against a years-deep `catch_reports` table is needless work, and the answer doesn't change between scrapes anyway. Precomputed forecasts table makes every read a single indexed lookup.

### SQLite vs. Postgres
**Choice (default):** SQLite (with `better-sqlite3` or Drizzle), unless STACK.md research dictates otherwise. **Why:** This is a read-heavy single-writer workload — exactly SQLite's wheelhouse. Using WAL mode supports many concurrent readers. No network hop, no separate process to manage, the whole DB is one file. **Caveat:** If you deploy to a serverless platform with an ephemeral filesystem (Vercel functions), SQLite-on-disk doesn't work and you'll need a managed Postgres or Turso/LiteFS-style hosted SQLite. The DAL bulkhead means this swap is contained to `lib/db/client.ts`.

### Vercel Cron vs. GitHub Actions vs. system cron
**Choice:** Defer until deployment platform is decided. All three POST to the same `/api/cron/*` routes, so the choice is operational, not architectural. GitHub Actions cron is the most portable (free, works anywhere your app is hosted). Vercel Cron is the easiest if you're on Vercel anyway.

## Anti-Patterns

### Anti-Pattern 1: Live-computing aggregates in the request path
**What people do:** Trip-picker page does `SELECT * FROM catch_reports WHERE species = ? AND date BETWEEN ?` and computes averages in JS per request.
**Why it's wrong:** Doesn't scale with history depth. After backfill loads 5 years of data, the page slows linearly. Then you cache, which means cache invalidation, which means bugs.
**Do this instead:** Precompute during the scrape cycle, store in `forecasts`/`boat_rankings` tables, read by indexed key from the request path.

### Anti-Pattern 2: Letting the scraper own the schema
**What people do:** Scraper inserts whatever shape comes out of the parser; downstream code adapts.
**Why it's wrong:** The parser is the most likely thing to break (source HTML changes). When it does, you don't want schema drift cascading through forecast/alerts/UI code.
**Do this instead:** `CatchReport` is defined in `lib/shared/types.ts` and is the contract. The parser's job is to produce it. If the source changes, the parser changes — `CatchReport` doesn't.

### Anti-Pattern 3: Embedding email rendering in the alerts engine
**What people do:** `alerts/dispatch.ts` builds HTML strings with template literals.
**Why it's wrong:** Email rendering is a separate concern (HTML for clients, plaintext fallback, branded styling). Mixing it with rule evaluation makes both harder to test and change.
**Do this instead:** Alerts engine produces an `AlertCandidate[]` (pure data: subscriber, reason, references). `lib/email/templates/` renders. `lib/email/provider.ts` sends. Three single-responsibility seams.

### Anti-Pattern 4: Inline scheduler timing in the app
**What people do:** Use a process-internal scheduler (`node-cron`, `setInterval`) inside the web app to run scrapes.
**Why it's wrong:** Couples scheduling to the web process lifetime. A redeploy mid-scrape kills the run. Doesn't survive serverless. Hidden timing logic is hard to reason about.
**Do this instead:** External scheduler (Vercel Cron / GitHub Actions / system cron) → POSTs to authenticated `/api/cron/*` routes. Scheduling becomes config, not code.

### Anti-Pattern 5: Storing email addresses unhashed in alert logs
**What people do:** `alerts_sent` table contains the recipient email for traceability.
**Why it's wrong:** Subscribers can unsubscribe and be deleted; their PII shouldn't outlive their subscription. Also: email-in-logs leaks if logs are ever exposed.
**Do this instead:** `alerts_sent` references `subscriber_id`. When a subscriber is deleted, their history is anonymized via FK action or a deletion script. Never log raw emails.

### Anti-Pattern 6: Backfill via the cron route
**What people do:** Add a `?backfill=true` query param to the scrape cron route that loops over all historical dates.
**Why it's wrong:** Cron routes have function-timeout limits (often 5–15 min on serverless). Backfill takes hours when rate-limiting respectfully. The route times out, half the work is lost, and you can't tell what was completed.
**Do this instead:** Backfill is a separate `pnpm backfill` script run from your dev machine. It calls the same `scrapeDate` function the cron uses, but without a timeout, and it checkpoints progress so it resumes from where it stopped.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **0–100 subscribers, ~50 boats, ~5 years of history** (initial / forever for most projects of this kind) | Stay with the modular monolith on SQLite. Total DB size is in the low MBs. Read traffic is trivial. Forecast recompute is seconds. No changes needed. |
| **1k subscribers, dozens of alert dispatches per scrape cycle** | Email provider rate limits become the constraint, not anything internal. Batch sends (the providers all support batched API calls). Move alert dispatch to its own cron tick if it slows the scrape route. Otherwise unchanged. |
| **10k+ subscribers or going public-launch** | First real architectural pressure. Move from SQLite to Postgres if hosting goes serverless. Consider splitting `/api/cron/alerts` into a separate worker with retry semantics. Add a small queue (just a DB table + worker, not Kafka) for alert dispatch. Add a CDN for the public read path. None of these are urgent until they are. |

### Scaling Priorities (what to fix in order)

1. **First bottleneck:** Email-provider rate limits during alert dispatch. **Fix:** batch API or rate-limited send loop.
2. **Second bottleneck:** Cron route timeout if scrape + forecast + alerts all chain in one request. **Fix:** split forecast and alerts into separate cron ticks that consume `scrape_runs` to find new work.
3. **Third bottleneck:** SQLite write contention if scrape and alert dispatch both want to write simultaneously. **Fix:** WAL mode (often enough), or move to Postgres. The DAL bulkhead means this is a one-file swap.
4. **Theoretical:** Read traffic on the public UI exceeds a single instance. **Fix:** CDN in front of public pages, since they're cacheable for 1–24 hours given the daily scrape cadence.

You will likely never hit any of these. Build for #1 only when you actually have subscribers.

## Sources

- [Web Scraping Architecture Patterns: From Prototype to Production (2026) — Apify](https://use-apify.com/blog/web-scraping-architecture-patterns) — current architectural patterns for scrapers, including upsert-by-key staging
- [Backfilling Historical Data With Idempotent Data Pipelines: A Practical Guide — ml4devs](https://www.ml4devs.com/what-is/backfilling-data/) — idempotency for re-runnable backfills
- [How to perform Incremental Web scraping — Stabler.tech](https://stabler.tech/blog/how-to-perform-incremental-web-scraping) — incremental + state tracking patterns
- [How to Build Scraping Skills for AI Agents: Incremental Runs, Stop Conditions — MindStudio](https://www.mindstudio.ai/blog/build-scraping-skills-ai-agents-incremental-parallel) — incremental runs as the default architecture
- [Vercel Cron Jobs — Vercel docs](https://vercel.com/docs/cron-jobs/quickstart) — the cron-routes-over-HTTP pattern in its canonical form
- [Cron jobs in Next.js on Vercel — Drew Bredvick](https://drew.tech/posts/cron-jobs-in-nextjs-on-vercel) — practical Next.js + cron route pattern
- [GitHub Actions cron for Next.js apps — paulphys/nextjs-cron](https://github.com/paulphys/nextjs-cron) — portable scheduler alternative
- [Job Scheduling in Node.js with Node-cron — Better Stack](https://betterstack.com/community/guides/scaling-nodejs/node-cron-scheduled-tasks/) — in-process scheduling (anti-pattern reference for why we don't use it here)
- [City Bureau city-scrapers — GitHub](https://github.com/City-Bureau/city-scrapers) — real-world civic-data scraper architecture (Python equivalent of this pattern)
- [civic-scraper — biglocalnews](https://github.com/biglocalnews/civic-scraper) — another civic-data project, modular monolith pattern
- [Choosing the Right Data Strategy: Real-Time Analytics vs. Caching — GoodData](https://www.gooddata.com/blog/real-time-analytics-vs-caching-in-data-nalytics/) — precomputed-aggregates rationale
- [Building a Next.js Dashboard with Dynamic Charts and SSR — Cube](https://cube.dev/blog/building-nextjs-dashboard-with-dynamic-charts-and-ssr) — RSC + chart dashboard data flow
- [Resend vs SendGrid vs Postmark — Vibe Coder Blog](https://blog.vibecoder.me/resend-vs-sendgrid-vs-postmark-email-services) — email provider comparison
- [Best Email Libraries for Node.js in 2026 — PkgPulse](https://www.pkgpulse.com/blog/best-email-libraries-nodejs-2026) — current Node email landscape
- [Double Opt-In With Node.js — SendGrid blog](https://sendgrid.com/blog/double-opt-email-node-js/) — verification flow reference
- [Magic Link / Token-based subscription patterns — Implementing.substack](https://implementing.substack.com/p/how-to-implement-a-magic-link-authentication) — signed-token verify/unsubscribe link pattern
- [SQLite vs PostgreSQL — DataCamp](https://www.datacamp.com/blog/sqlite-vs-postgresql-detailed-comparison) — read-heavy single-writer SQLite suitability
- [Microservices Pattern: Monolithic Architecture — microservices.io](https://microservices.io/patterns/monolithic.html) — monolith remains the right default at this scale

---
*Architecture research for: small public data-aggregation app (scheduled scraper + historical store + statistical forecast + read-only web UI + email alerts)*
*Researched: 2026-04-22*
