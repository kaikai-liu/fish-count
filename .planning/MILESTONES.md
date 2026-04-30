# Milestones: FishCount

Historical record of shipped versions. Each entry summarises what was delivered and links to the full archive in `.planning/milestones/`.

---

## v1.0 — Browse + Picker + Forecast (early-closed)

**Shipped:** 2026-04-30 (closed early — 4 of 6 planned phases due to scope pivot)
**Phases:** 0–3 of 5
**Plans:** 28 of 29 complete (Plan 00-06 deferred to operator)
**Tasks:** 81+ across 4 phases
**Timeline:** 2026-04-22 → 2026-04-30 (8 days, 212 commits)
**Lines of code:** 7,272 source / 9,249 tests (TypeScript + Svelte 5)
**Tag:** `v1.0`
**Archive:** [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) · [v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md) · [v1.0-MILESTONE-AUDIT.md](milestones/v1.0-MILESTONE-AUDIT.md)
**Phase artefacts:** [v1.0-phases/](milestones/v1.0-phases/)

### Delivered

A working web app for San Diego anglers to browse charter boat catch data: scheduled scraping (polite, observable, idempotent), a SvelteKit read surface (`/`, `/picker`, `/boats/[id]`, `/compare`, `/trends`, `/about`) with mandatory per-angler honesty framing, and a statistical forecast layer (seasonal-naïve baseline + 80% prediction interval + n + 30-day horizon) powering calendar heatmap colouring on `/picker`.

### Key Accomplishments

1. **Phase 0 — Ops guardrails (code-complete).** Litestream B2 replication, healthchecks.io dead-man's switch, `SCRAPER_ENABLED` kill switch, billing alerts at $20/$50/$100 thresholds via GH Actions, pino structured logging with request-ID correlation. 42/42 tests passing. Live deploy gated to operator (Plan 00-06, autonomous: false).
2. **Phase 1 — Polite scraper + canonical store.** ≤12 req/min rate-limited fetcher with `robots.txt` honor + custom UA, Cheerio + Zod parser with quarantine-continue on bad rows, gzip HTML snapshots, idempotent upsert on `(date, boat_id, trip_type, species)`, resumable `npm run backfill` CLI, `scrape_runs` ledger distinguishing "tried no rows" from "never tried", row-count SLA alert at <50% of 7-day average. 171/171 tests. DAL boundary enforced by static-grep test.
3. **Phase 2 — Public read surfaces.** Six routes plus `/about`. Mandatory trip-type segmentation; per-angler framing rendered inline (not tooltip-only) on every metric, enforced by a 3-file allowlist lint. Mobile-usable at 375px. URL filter state round-trips for shareability. 30-day calendar heatmap with n<5 gray override. Side-by-side compare for 2–3 boats within a single trip type. Operator UAT 30/30 walked + approved 2026-04-25; 5 walkthrough bugs fixed and re-verified.
4. **Phase 3 — Forecast layer.** `forecasts` table (per species, trip_type, forecast_date), pure-math compute engine (db handle injected, no module-scope SQL), seasonal-naïve weighted-yield baseline labeled as such per CLAUDE.md non-negotiable #3, FCT-04 honesty benchmark CLI (`scripts/forecast-benchmark.ts`) reporting MAE / median / 80% PI coverage, hybrid past/future heatmap composer discriminating cells via `'pi_low' in cell`, 30-day horizon cap with verbatim "horizon too far" message, n<5 hard floor rendering "not enough history". Recompute hooked into nightly scheduler post-scrape (non-fatal try/catch), backfill final step, and ad-hoc `scripts/forecasts-rebuild.ts`. 459/459 tests.

### Why early close

The operator decided mid-Phase-3 that the picker's "rank a boat for a target species" framing felt narrower than a multi-axis trend explorer (pick a species, boat, or landing as the "ticker"; overlay comparisons across the others). Phases 4 (Email Alerts) and 5 (Polish) were retired without execution. Email alerts may return in v2 with redesigned triggers; polish defers until v2 UI direction is locked.

### Known Gaps Carried Forward

- **Operator-gated:** OPS-02 (Fly deploy + 5 drills), ING-10/11 (TOS review + courtesy outreach + `FIRST_SCRAPE_OK` flip), CR-01 (`litestream.yml ${VAR}` interpolation bug must be fixed before first deploy).
- **Integration defect:** `picker/+page.svelte:180` short-circuits to EmptyState when `rankings.length===0`, blocking the heatmap branch even when forecast cells exist. Affects TRP-08, FCT-05, FCT-07 (partial). Fix decision deferred to v2 (route may be retired).
- **Tech debt:** `gap_days_expected` hardcodes `EARLIEST_YEAR=2010` (Phase 3 WR-01); pre-existing svelte-check `.ts`-suffix import errors and missing `.prettierrc`; `/about:144` literal placeholder rendering; no root `+error.svelte`.
- **Unsatisfied phases (retired):** ALT-01..12 (Phase 4), POL-01..03 (Phase 5) — re-evaluated against v2 core value.

### Known deferred items at close

7 (recorded in STATE.md Deferred Items: 2 verification gaps, 2 UAT gaps, 1 integration defect, 2 unsatisfied phases).

---

*Next milestone: v2 — direction TBD via `/gsd-new-milestone`. Anticipated core value: multi-axis catch trend explorer for SD charter boats.*
