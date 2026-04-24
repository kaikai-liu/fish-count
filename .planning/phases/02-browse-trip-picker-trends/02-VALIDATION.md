---
phase: 2
slug: browse-trip-picker-trends
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-24
revised: 2026-04-24
revision_iteration: 1
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populated during planning from RESEARCH.md Validation Architecture; finalized by planner.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.1.x (already installed from Phase 1) |
| **Config file** | `vite.config.ts` (test block — see `tests/**/*.{test,spec}.{js,ts}`) |
| **Quick run command** | `npm run test:run -- tests/unit` |
| **Full suite command** | `npm run test:run` |
| **Estimated runtime** | ~15 seconds (projected for Phase 2 test volume) |

---

## Sampling Rate

- **After every task commit:** Run quick test command for the affected module (e.g., `npm run test:run -- tests/unit/queries`).
- **After every plan wave:** Run `npm run test:run` (full suite).
- **Before `/gsd-verify-work`:** Full suite must be green AND manual UAT list completed.
- **Max feedback latency:** 30 seconds (includes typecheck).

---

## Per-Task Verification Map

*Populated by planner during plan creation. Each REQ-ID must have at least one row.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T1 | 02-01 | 1 | BRW-05, BRW-08 | T-02-07 | dates helpers + boundary tests scan routes/components | unit | `npm run test:run -- tests/unit/shared/dates.test.ts tests/unit/shared/dates-boundary.test.ts tests/unit/db/dal-boundary.test.ts` | ⬜ pending | ⬜ pending |
| 02-01-T2 | 02-01 | 1 | BRW-01, BRW-02, BRW-05, BRW-06, TRP-01..03, TRP-07..08, BOAT-01..02 | T-02-01, T-02-05 | DAL queries (browse incl. getDateBounds, tripPicker weighted yield, boatDetail with optional cutoffDate) | unit | `npm run test:run -- tests/unit/db/queries/browse.test.ts tests/unit/db/queries/tripPicker.test.ts tests/unit/db/queries/boatDetail.test.ts` | ⬜ pending | ⬜ pending |
| 02-01-T3 | 02-01 | 1 | TRN-01..03, BRW-07 | T-02-02, T-02-06, T-02-38 | trends (species optional), compare (max-3 bound check), urlState round-trip | unit | `npm run test:run -- tests/unit/db/queries/trends.test.ts tests/unit/db/queries/compare.test.ts tests/unit/shared/urlState.test.ts` | ⬜ pending | ⬜ pending |
| 02-02-T1 | 02-02 | 1 | BRW-08 | — | Tailwind 4 design tokens + reduced-motion CSS | unit | `npm run check` | ⬜ pending | ⬜ pending |
| 02-02-T2 | 02-02 | 1 | TRP-04, BRW-09 | T-02-09 | Constants module — single source of truth for per-angler copy | unit | `test -f src/lib/copy/metrics.ts && grep -c '^export const' src/lib/copy/metrics.ts` | ⬜ pending | ⬜ pending |
| 02-02-T3 | 02-02 | 1 | TRP-04, BRW-04 | T-02-09, T-02-10, T-02-11 | PerAnglerMetric + Chart + provisional/last-scraped + LowDataBadge | unit | `npm run check` | ⬜ pending | ⬜ pending |
| 02-02-T4 | 02-02 | 1 | BRW-08, BOAT-02, TRP-06 | T-02-08, T-02-13 | PageHeader/EmptyState/FilterBar/BoatRow/BoatCard (BoatCard's best-day uses BEST_DAY_UNIT constant) | unit | `npm run check` | ⬜ pending | ⬜ pending |
| 02-03-T1 | 02-03 | 2 | BRW-01..04, BRW-06, BRW-08 | T-02-16, T-02-17 | Layout + home route load | unit | `npm run test:run -- tests/unit/routes/home.test.ts` | ⬜ pending | ⬜ pending |
| 02-03-T2 | 02-03 | 2 | BRW-05, BRW-07 | T-02-14, T-02-15 | Date route 404 + getDateBounds clamp (no hardcoded sentinel) | unit | `npm run test:run -- tests/unit/routes/date.test.ts` | ⬜ pending | ⬜ pending |
| 02-04-T1 | 02-04 | 2 | TRP-01..03, TRP-05..08 | T-02-19, T-02-20, T-02-22 | Picker loader: TRP-05 guidance, TRP-07 retention, defaultTripType from mostCommonTripType | unit | `npm run test:run -- tests/unit/routes/picker.test.ts` | ⬜ pending | ⬜ pending |
| 02-04-T2 | 02-04 | 2 | TRP-04, TRP-06, TRP-09 | T-02-23 | Pure heatmap option helper + UI; runtime gray-override assertion on n<5 cells | unit | `npm run test:run -- tests/unit/routes/picker-heatmap-option.test.ts && npm run check` | ⬜ pending | ⬜ pending |
| 02-05-T1 | 02-05 | 2 | BOAT-01, BOAT-02 | T-02-24, T-02-27, T-02-28 | Boat detail load (3-arg getBoatProfile call with cutoffDate) | unit | `npm run test:run -- tests/unit/routes/boats.test.ts` | ⬜ pending | ⬜ pending |
| 02-05-T2 | 02-05 | 2 | TRN-03 | T-02-25, T-02-26, T-02-29 | Compare load (consumes boatTrend(species: undefined) all-species path) | unit | `npm run test:run -- tests/unit/routes/compare.test.ts` | ⬜ pending | ⬜ pending |
| 02-06-T1 | 02-06 | 2 | TRN-01, TRN-02 | T-02-30, T-02-31, T-02-32 | Trends route — guidance + gap-fill + ISO-week + chart copy from $lib/copy/metrics | unit | `npm run test:run -- tests/unit/routes/trends.test.ts` | ⬜ pending | ⬜ pending |
| 02-06-T2 | 02-06 | 2 | BRW-09 | T-02-33 | About page verbatim copy + cache-control max-age=3600 | unit | `grep "derived boat-aggregate average\|low data\|provisional\|fish/angler" src/routes/about/+page.svelte` | ⬜ pending | ⬜ pending |
| 02-07-T1 | 02-07 | 3 | BRW-08 | T-02-34, T-02-35 | seed-dev-db CLI — gates on NODE_ENV + DB_PATH; idempotent fixture replay | unit | `npm run test:run -- tests/unit/scripts/seed-dev-db.test.ts` | ⬜ pending | ⬜ pending |
| 02-07-T2 | 02-07 | 3 | TRP-04, BRW-04, BRW-09 | T-02-36, T-02-37 | Integration smoke + per-angler-discipline lint (3-file allowlist) + anti-feature lint | integration + unit | `npm run test:run -- tests/integration/phase2-routes.test.ts tests/unit/lint/per-angler-discipline.test.ts tests/unit/lint/anti-feature.test.ts` | ⬜ pending | ⬜ pending |
| 02-07-T3 | 02-07 | 3 | BRW-04, BRW-08, TRP-04, TRP-09 | — | Manual UAT 30-item checklist | uat | (operator-driven) | ⬜ pending | ⬜ pending |

---

## Wave 0 Requirements

Fixture seed + test scaffolding must exist before any test can run against realistic data:

- [ ] `scripts/seed-dev-db.ts` — fixture replay through Phase 1 parser into dev DB (D-33 in CONTEXT.md) — Plan 02-07 Task 1
- [ ] `tests/helpers/seedTestDb.ts` — in-memory better-sqlite3 factory + deterministic fixture seeder (reusable across query tests) — Plan 02-01 Task 1
- [ ] `tests/unit/db/queries/` — directory exists; at least one passing smoke test per query module (`browse.test.ts`, `tripPicker.test.ts`, `boatDetail.test.ts`, `trends.test.ts`, `compare.test.ts`) — Plan 02-01 Tasks 2+3
- [ ] `tests/unit/shared/urlState.test.ts` — round-trip parse/serialize tests — Plan 02-01 Task 3
- [ ] `tests/unit/routes/picker-heatmap-option.test.ts` — pure-function gray-override assertion — Plan 02-04 Task 2
- [ ] `src/lib/copy/metrics.ts` — canonical per-angler copy constants module — Plan 02-02 Task 2
- [ ] `tests/integration/routes/` — page load tests per route using `setup` with in-memory DB — Plans 02-03..06 Task tests
- [ ] `date-fns@^4` installed (needed for gap-aware trend bucketing, per RESEARCH.md) — Plan 02-01 Task 1
- [ ] `echarts@^6.0` installed (client-only dynamic import; bundle-test covers tree-shaking) — Plan 02-01 Task 1

---

## Manual-Only Verifications

Behaviors that cannot be fully automated without a real browser / viewport simulation:

| Behavior | Requirement | Why Manual | Test Instructions | Status |
|----------|-------------|------------|-------------------|--------|
| 375px viewport — no horizontal page scroll | BRW-08 | Requires real viewport; Tailwind classes can regress without visual verification | Open Chrome DevTools → device toolbar → iPhone SE (375×667) → visit `/`, `/picker`, `/trends`, `/compare`, `/boats/[id]` → confirm no `overflow-x: scroll` on `<body>` | ⬜ pending |
| Per-angler framing displayed inline (not tooltip-only) | TRP-04 + BRW-09 + CLAUDE.md non-negotiable #4 | Tooltip-only framing is a compliance fail; human must see rendered output | Visit `/picker` with real query → confirm "derived boat-aggregate average" text visible without hover → confirm link to `/about` visible | ⬜ pending |
| Provisional badge visible on today's rows | BRW-04 | Renders only when source_date == today() — integration test with time-travel is brittle | Visit `/` → confirm "provisional" badge at header → visit `/date/[past-date]` → confirm no badge | ⬜ pending |
| Heatmap gray cells for n<5 (not green/red) | TRP-09 | ECharts render output; pixel-accurate assertion is brittle (runtime gray override unit-tested in 02-04 picker-heatmap-option.test.ts; visual confirmation still required) | Seed dev DB with sparse species-date combinations → visit `/picker` with that query → confirm insufficient-data cells render in neutral gray, not color scale | ⬜ pending |
| Source-site links open to correct dated page | BRW-02 | External URL check; cannot assert target content | Click row link on `/` → confirm target is `https://www.sandiegofishreports.com/dock_totals/boats.php?date=<today>` | ⬜ pending |
| URL round-trip shareability | BRW-07 | Copy-paste flow involves user clipboard | Set filters on `/picker` → copy URL → open in new tab/incognito → confirm same state reproduces | ⬜ pending |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (vitest runs in `run` mode)
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
</content>
