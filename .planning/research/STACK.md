# Stack Research

**Domain:** Public data-aggregation web app (scheduled scraper + historical store + charts/heatmaps + email alerts)
**Researched:** 2026-04-22
**Confidence:** HIGH on database / scraper / mailer; HIGH on frontend; MEDIUM on hosting (depends on personal preference between $0–5/mo options)

---

## Executive Recommendation

**One-line stack:** SvelteKit (Node adapter) + Drizzle ORM + better-sqlite3 (Litestream-backed) + Cheerio scraper running under SvelteKit's Node server, scheduled by `node-cron` in-process, ECharts for charts/heatmaps, Resend for email, deployed as a single container on Fly.io with a persistent volume.

**Why this shape:** The source site is server-rendered PHP (no JS to execute), the data volume is tiny (per-boat-per-day rows, single source, San Diego only — easily under 1M rows lifetime), there is one user-personal feature (email alerts), and the hard constraint is "shareable with friends, cheap to run." A single Node process holding both the web app and the scheduler is the right size; you do not need a queue, a managed Postgres, or a separate worker tier for this.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Node.js** | 22.x LTS | Runtime | Current LTS through 2027; native `fetch`/`undici`, stable test runner, no need for Bun/Deno here |
| **TypeScript** | 5.7.x | Type system | Standard; Drizzle + SvelteKit are TS-first and pay dividends on a data-shape-heavy app |
| **SvelteKit** | 2.57.x (Svelte 5.55.x) | Full-stack web framework | SSR + file-based routing + server endpoints in one process; ships ~50–70% less JS than React for the same UI which matters for a charts page; `+page.server.ts` model maps cleanly to "load this from SQLite, render"; built-in `sv add drizzle` scaffolds the DB layer |
| **better-sqlite3** | 12.9.x | SQLite driver | Synchronous, fastest Node SQLite binding; perfect for in-process queries with no network hop; the "boring, well-supported" choice |
| **SQLite** | 3.46+ (bundled with better-sqlite3) | Database | One file, zero ops, perfect for a single-source aggregator with low write volume (1 scrape/night) and read-heavy traffic; supports the date-range queries and aggregations the trip picker needs |
| **Drizzle ORM** | 0.45.x (drizzle-kit 0.31.x) | Query builder + migrations | TypeScript-first, generates the schema types you'll use everywhere, migrations are plain SQL files you can read; thin enough to drop to raw SQL when you need a window function for forecast bands |
| **Cheerio** | 1.2.x | HTML parser | The source is static PHP-rendered HTML — Cheerio (jQuery-like API on htmlparser2) is the right tool; avoids the cost and fragility of running a real browser |
| **undici / native fetch** | bundled with Node 22 | HTTP client for the scraper | Built into Node, fastest in its class (~3x axios in benchmarks), supports keep-alive pools and per-request headers for User-Agent and a contact email |
| **ECharts** | 6.0.x | Charts + calendar heatmap | The only mainstream lib with a **first-class native calendar heatmap** (Recharts does not have one, Chart.js does not, Visx requires hand-rolling). Also handles trends, comparisons, and large datasets via canvas renderer |
| **Resend** | 6.12.x | Transactional email | 3,000 emails/month permanently free, modern DX, JSX/Svelte-friendly templates; the right size for "alerts to a handful of friends" |
| **Tailwind CSS** | 4.2.x | Styling | Avoids a CSS bikeshed; pairs naturally with SvelteKit's `class:` directive; v4 is config-light |
| **Zod** | 4.3.x | Runtime validation | Validate scraped HTML shape before it hits the DB (catches "site changed its layout" before silent data corruption); also validates the email-alert signup form |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **node-cron** or **croner** | croner 10.0.x | In-process scheduler | Trigger nightly scrape and alert-evaluation jobs from inside the SvelteKit Node server; croner is the modern pick (smaller, supports seconds, better TZ handling) |
| **p-queue** | 9.1.x | Concurrency-limited request queue | Wrap the backfill crawler in a `PQueue({ concurrency: 1, interval: 3000, intervalCap: 1 })` to enforce one request per 3 seconds — non-negotiable for the one-time backfill |
| **p-retry** | 6.x | Retries with exponential backoff | For transient network errors during scraping; do NOT retry on 4xx (except 429) |
| **date-fns** | 4.x | Date math | The trip picker, heatmap, and historical aggregations are date-heavy; date-fns is tree-shakable and timezone-aware (you'll need `America/Los_Angeles` consistency) |
| **Litestream** | 0.3.x (binary, not npm) | Continuous SQLite replication to S3/B2 | Hourly streaming backup of the SQLite file to a cheap object store; the "I can lose my server and not lose the dataset I spent a week scraping" insurance |
| **pino** | 9.x | Structured logging | The scraper needs logs you can grep — pino is the boring, fast, JSON-line standard |
| **@sveltejs/adapter-node** | 5.x | SvelteKit adapter | Builds the app as a Node server (not serverless) so the scheduler and SQLite file can live in the same process |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **drizzle-kit** | Schema migrations | `drizzle-kit generate` then `drizzle-kit migrate`; commit the SQL files |
| **Vite** | Bundler | Comes with SvelteKit — no config needed |
| **Vitest** | Test runner | SvelteKit-native; use it for parser tests (HTML fixtures from the source site) |
| **Prettier + ESLint** | Formatting / linting | Use SvelteKit's `npx sv create` defaults, do not bikeshed |
| **dotenv** (or SvelteKit's `$env`) | Env vars | SvelteKit has built-in `$env/static/private` — prefer that over a third-party loader |

---

## Installation

```bash
# Scaffold project (use the official CLI)
npx sv create fish-count
# Choose: SvelteKit minimal, TypeScript, Prettier, ESLint, Vitest, Tailwind
cd fish-count

# Add Drizzle + SQLite (official SvelteKit recipe)
npx sv add drizzle
# Choose: sqlite, better-sqlite3

# Core scraper / runtime libs
npm install cheerio zod date-fns croner p-queue p-retry pino

# Email
npm install resend

# Charts (ECharts core + the React-free wrapper for Svelte)
npm install echarts svelte-echarts

# Adapter (replaces adapter-auto)
npm install -D @sveltejs/adapter-node
# Then in svelte.config.js: import adapter from '@sveltejs/adapter-node'

# (No npm install for Litestream — install the static binary in your Dockerfile)
```

**Verified versions (npm, 2026-04-22):**
- `@sveltejs/kit@2.57.1`, `svelte@5.55.4`
- `better-sqlite3@12.9.0`, `drizzle-orm@0.45.2`, `drizzle-kit@0.31.x`
- `cheerio@1.2.0`, `croner@10.0.1`, `p-queue@9.1.2`
- `echarts@6.0.0`, `resend@6.12.2`, `zod@4.3.6`, `tailwindcss@4.2.4`

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **SvelteKit** | **Next.js 16** (App Router) | If you already know React deeply or expect to hire collaborators — the React talent pool is much larger. Penalty: ~2–3x bigger JS bundle for the dashboard pages |
| **SvelteKit** | **Astro 5 + React/Svelte islands** | If the app were 80% static content and 20% interactive. FishCount has dynamic charts and forms on every important page, so a full SSR framework wins |
| **SvelteKit** | **Remix / React Router v7** | Equivalent capability, similar ergonomics; the Remix→React Router merger in 2025 left the brand in an awkward place — pick one of the others unless you have strong React-Router muscle memory |
| **better-sqlite3 + SQLite** | **Postgres on Neon free tier** | If you ever need >1 writer (e.g. a multi-region deploy), or want the richer Postgres feature set (window functions, full-text). For one nightly writer + read-heavy traffic, SQLite is faster and cheaper |
| **better-sqlite3 + SQLite** | **Turso (libSQL)** | If you want SQLite semantics but managed (no Litestream setup); 5 GB / 500M reads free tier is more than enough. Penalty: another vendor, network latency on every query, and you lose the "queries are nanoseconds away" property that makes SQLite shine |
| **Cheerio** | **Playwright** | Only if the source site moves to a JS-rendered SPA. As of 2026 `sandiegofishreports.com/dock_totals/boats.php` is server-rendered PHP — Playwright would be 50x more resource-intensive for zero benefit |
| **Cheerio + undici** | **Crawlee (CheerioCrawler)** | If you start scraping multiple sites or need built-in proxy rotation, request queue persistence, and stealth. For one polite, single-source crawl, Crawlee is overkill — you'd inherit a queue + storage abstraction you don't need |
| **In-process croner** | **Render Cron Jobs / GitHub Actions cron** | If you cannot afford an always-on Node process. Tradeoff: cron-job-style runs cold-start each time and can't share an in-memory cache or DB connection. For a $3/mo always-on Fly machine, in-process is simpler |
| **ECharts** | **Visx** + custom calendar component | If you want pixel-perfect, brand-bespoke charts. Penalty: 2–3x development time per chart per the 2026 surveys |
| **Resend** | **Postmark** | If reliability of *transactional* delivery is mission-critical (Postmark separates transactional and broadcast IP pools). For "alert when fishing is good" emails, Resend's 3k/mo free is plenty |
| **Resend** | **Amazon SES** | If you ever exceed 3,000 emails/month. SES is ~15x cheaper at scale ($0.10/1k vs $1.50/1k). Not worth the IAM and SMTP setup pain for a side project |
| **Fly.io** | **Render** | Render has the cleanest free-tier story for a web service + cron, but the free web service auto-suspends and the persistent disk story is weaker. Pick Render if you want zero-ops and don't mind the cold-start |
| **Fly.io** | **Hetzner / DigitalOcean $5 droplet** | If you're comfortable with a VPS and want predictable flat pricing. You'll set up systemd, the firewall, and TLS yourself |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Puppeteer / Playwright for scraping** | The source is static HTML; running Chromium adds 300+ MB RAM, 10–50x latency, and a flaky surface area for nothing | Cheerio + undici |
| **`request` (the npm package)** | Deprecated since 2020, security advisories | undici / native `fetch` |
| **`axios` for the scraper** | Fine, but slower than undici and you don't get HTTP/2 or connection pool tuning; also adds a dep when Node already has `fetch` | undici / native `fetch` |
| **Prisma** | Heavier than Drizzle, separate query engine binary (annoying in Docker), worse TypeScript inference for complex selects, and the migration story is more opaque | Drizzle ORM |
| **Mongoose / MongoDB** | Document store is the wrong shape for date-range aggregations across boats/species; SQL JOINs are exactly what the trip picker needs | SQLite + Drizzle |
| **Recharts / Chart.js for the heatmap** | No native calendar heatmap component; you'd be hand-rolling SVG grids and re-implementing date-bucket logic | ECharts (`series.type: 'heatmap'` with `coordinateSystem: 'calendar'`) |
| **`react-calendar-heatmap`** | Solves only the heatmap, doesn't help with your other charts → you'd ship two charting libs. Also React-only, and you're on Svelte | ECharts (one lib for everything) |
| **SendGrid** | Killed its free tier in 2024; setup friction is high; deliverability issues frequently reported | Resend |
| **Vercel for the whole app** | Serverless functions can't host an in-process cron or hold a SQLite file on a persistent volume. Separating into Vercel + scheduler + managed DB triples your moving parts | Fly.io / Render Node service with a volume |
| **Cloudflare Workers + D1 (initial)** | D1 is great but enforces row-size and query-time limits that constrain the analytical queries you'll write; Workers don't fit a long-running scrape job | Reconsider only after MVP if you outgrow Fly |
| **GitHub Actions as your only scheduler** | 6-hour timeout cap is fine for the scraper, but you'd need a second deploy target for the web app and a hosted DB for both to share — three things instead of one | Use GHA only as a *backup* trigger if your Fly machine dies |
| **A message queue (BullMQ / Redis)** | You have one job that runs once a night. A queue is over-engineered until you have multiple workers or retry persistence requirements | A single `croner` schedule + p-retry inside the same Node process |

---

## Stack Patterns by Variant

**If you want the absolute simplest deploy (one box, one Dockerfile):**
- SvelteKit (Node adapter) + better-sqlite3 + croner + Litestream all in one container on Fly.io with a 1 GB volume.
- Single `Dockerfile`, single process (use `s6-overlay` or just run Litestream and Node side by side via `concurrently`).
- Total cost: ~$2–4/month (Fly shared-cpu-1x always-on) + ~$0.50/month (Backblaze B2 for Litestream backups).

**If you want zero-ops at the cost of cold starts:**
- SvelteKit on Vercel (or Cloudflare Pages) + Turso (libSQL) for the DB + Vercel Cron / GitHub Actions for the scraper.
- Probably free until you hit Turso's 5 GB.
- Penalty: scraper cold-start every night (fine), and your queries pay network latency (annoying for the trip picker).

**If you want to never run a server:**
- Astro (static-generated dashboards) + GitHub Action that scrapes nightly, writes a SQLite file to the repo (or to R2), and re-builds the site.
- Email alerts become a separate small Worker.
- Cheapest possible, but rebuilding the entire site nightly is a hack and the alert flow gets weird.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@sveltejs/kit@2.57+` | `svelte@5.x`, `vite@6.x` | Svelte 5 runes are required for SvelteKit 2.20+ — do not start on Svelte 4 |
| `drizzle-orm@0.45+` | `better-sqlite3@12.x`, `drizzle-kit@0.31.x` | Bump them together; `drizzle-kit` versions move faster than `drizzle-orm` |
| `better-sqlite3@12.x` | Node 20, 22, 24 | Native module — your Docker base image must match the build target. Use `node:22-bookworm-slim` for both build and runtime stages |
| `cheerio@1.2.x` | Any Node 20+ | The 1.0 release in 2024 was a major API stabilization; ignore older `cheerio@0.22` tutorials |
| `echarts@6.0` | Browser only | Render charts client-side — do not try to SSR them. Lazy-load the chart component with SvelteKit's dynamic `import()` to keep the initial bundle small |
| `resend@6.x` | Node 20+ | Use `process.env.RESEND_API_KEY` via `$env/static/private` in SvelteKit |

---

## Hosting & Cost Profile

| Component | Service | Monthly Cost (est.) |
|-----------|---------|---------------------|
| Node app (SvelteKit + scraper + scheduler) | Fly.io shared-cpu-1x, 256 MB, always-on, 1 GB volume | ~$2.00 + ~$0.15 = **$2.15** |
| SQLite backups | Backblaze B2 (Litestream target), <1 GB | **<$0.01** |
| Email | Resend free tier, 3k emails/mo | **$0** |
| DNS | Cloudflare | **$0** |
| Domain | (optional, since "share-with-friends" scope) | $0–$12/year |
| **Total** | | **~$2–3/month** |

If you want a true $0 path: Render free web service + Render Cron + Turso free tier + Resend free tier. Tradeoff: Render free auto-spins-down (cold starts) and your DB lives at a different vendor.

---

## Scraping Ethics & Rate Limiting (Hard Rules for This Project)

Because the entire app is downstream of one site that can disappear if you're rude, treat these as engineering constraints, not suggestions:

1. **Identify yourself.** Set a stable, descriptive User-Agent like `FishCountBot/0.1 (+https://fishcount.example/about; contact@example.com)`. The contact link must be a real page that explains what you're doing and how to stop you.
2. **Read robots.txt.** Honor `/robots.txt` on every run — fetch it, parse it (`robots-parser` npm package), and respect any `Disallow` for `/dock_totals/`. Cache it for the duration of the run, re-fetch each night.
3. **Rate limit at one request per 3–5 seconds during backfill.** Use `p-queue` with `{ concurrency: 1, interval: 4000, intervalCap: 1 }`. The historical backfill is a one-time operation — stretching it over hours or days is fine. Do not parallelize it.
4. **Cache aggressively.** Once you've scraped a past date successfully, never refetch it. Old dates don't change.
5. **Back off on errors.** On any 429, 503, or 5xx: exponential backoff starting at 60 seconds, max 5 retries, then stop the entire run and log loudly. Don't keep hammering.
6. **Run the nightly scrape at off-peak hours** for the source's audience (they're San Diego anglers, so scrape ~3am Pacific when nobody is checking dock totals).
7. **Validate every parse with Zod.** If the HTML shape changes, fail fast and notify yourself by email — do not write garbage rows into the DB.
8. **Don't scrape behind logins or paywalls.** This site is public; keep it that way. No cookie-jar gymnastics.
9. **Keep a kill switch.** A single env var (`SCRAPER_ENABLED=false`) that pauses all scraping without redeploying. The site owner emailing you should result in a same-day stop.

---

## Confidence Assessment

| Area | Confidence | Why |
|------|------------|-----|
| **SQLite + Drizzle + better-sqlite3** | HIGH | Verified versions on npm; this is the canonical 2026 SvelteKit recipe (`npx sv add drizzle`); volume profile (1 writer, single source, <1 M rows lifetime) is squarely in SQLite's sweet spot |
| **SvelteKit** | HIGH | Verified 2.57.1 + Svelte 5.55.4 on npm 2026-04-22; the SSR + server-endpoints + in-process model is exactly what this app needs |
| **Cheerio + undici scraper** | HIGH | Source confirmed server-rendered PHP; Cheerio is the right tool; undici is in core Node 22 |
| **ECharts for charts + heatmap** | HIGH | Verified ECharts 6.0 has native `coordinateSystem: 'calendar'`; Recharts/Chart.js do not have first-class calendar heatmaps (verified via Recharts issue #237 and library comparisons) |
| **Resend for email** | HIGH | Free tier (3k/mo) confirmed across multiple 2026 sources; right-sized for the alert volume |
| **Fly.io as primary host** | MEDIUM | Free tier is gone (verified — 2024 cut), but pay-as-you-go for a single shared-cpu always-on machine is ~$2/mo. Render free tier is the alternative if you want truly $0 |
| **In-process croner scheduler** | MEDIUM | Sound architecturally for this scale; the only reason it would be wrong is if you decided to deploy serverless, in which case the whole stack shape changes |
| **Litestream for backup** | MEDIUM | Mature tool, widely used with SQLite-on-disk deployments; the only caveat is you must run it as a sidecar process and configure the S3-compatible target carefully |

---

## Sources

- [SvelteKit + Drizzle official docs](https://svelte.dev/docs/cli/drizzle) — verified `sv add drizzle` recipe — HIGH
- [Drizzle ORM docs (Context7: /drizzle-team/drizzle-orm)](https://orm.drizzle.team) — HIGH
- [Playwright docs (Context7: /microsoft/playwright)](https://playwright.dev) — verified browser-only use case — HIGH
- [Crawlee docs](https://crawlee.dev/js/) — confirmed CheerioCrawler is the right tool only when you need queue/proxy infra — MEDIUM
- [npm registry queries 2026-04-22](https://www.npmjs.com) — versions verified for cheerio, playwright, drizzle-orm, better-sqlite3, sveltekit, svelte, next, resend, recharts, echarts, zod, tailwindcss, croner, p-queue, undici, crawlee — HIGH
- [Web Scraping With Node.js in 2026 — DEV.to](https://dev.to/vhub_systems_ed5641f65d59/web-scraping-with-nodejs-in-2026-axios-cheerio-playwright-crawlee-4f4g) — MEDIUM
- [Database Free Tier Comparison 2026](https://agentdeals.dev/database-free-tier-comparison-2026) — Neon/Turso/Supabase free tiers — MEDIUM
- [Neon vs Turso for Solo Developers 2026](https://solodevstack.com/blog/neon-vs-turso-solo-developers) — MEDIUM
- [Email API Pricing Comparison April 2026 — Resend, SendGrid, Postmark](https://www.buildmvpfast.com/api-costs/email) — verified Resend 3k/mo permanent free tier — HIGH
- [Fly.io Pricing](https://fly.io/docs/about/pricing/) — official, verified pay-as-you-go model + 2024 free-tier removal — HIGH
- [Fly.io Free Tier 2026: What's Left](https://www.saaspricepulse.com/tools/flyio) — MEDIUM
- [Render Pricing 2026: Workers, Cron Jobs & Free Tier](https://www.saaspricepulse.com/tools/render) — MEDIUM
- [Recharts vs Chart.js vs Nivo 2026 — PkgPulse](https://www.pkgpulse.com/blog/recharts-vs-chartjs-vs-nivo-vs-visx-react-charting-2026) — MEDIUM
- [Recharts heatmap support issue #237](https://github.com/recharts/recharts/issues/237) — confirmed Recharts has no heatmap — HIGH
- [Apache ECharts calendar heatmap demo](https://echarts.apache.org/examples/en/editor.html?c=calendar-heatmap) — confirmed native support — HIGH
- [Hono vs Express vs Fastify vs Elysia 2026 — PkgPulse](https://www.pkgpulse.com/blog/hono-vs-express-vs-fastify-vs-elysia-2026) — MEDIUM
- [SvelteKit vs Next.js vs Remix vs Astro 2026 — Pockit](https://pockit.tools/blog/nextjs-vs-remix-vs-astro-vs-sveltekit-2026-comparison/) — MEDIUM
- [Ethical Web Scraping — DataCamp](https://www.datacamp.com/blog/ethical-web-scraping) — MEDIUM
- [Web Scraping Best Practices ’26 — AIMultiple](https://research.aimultiple.com/web-scraping-best-practices/) — MEDIUM
- [Robots.txt Scraping Rules — PromptCloud](https://www.promptcloud.com/blog/robots-txt-scraping-compliance-guide/) — MEDIUM
- [Litestream docs](https://litestream.io/) — HIGH

---

*Stack research for: public San Diego fishing-report aggregator (FishCount)*
*Researched: 2026-04-22*
