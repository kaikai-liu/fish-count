---
phase: 2
slug: browse-trip-picker-trends
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-24
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
| TBD     | TBD  | TBD  | BRW-01..09, TRP-01..09, BOAT-01..02, TRN-01..03 | — | per RESEARCH.md | unit/integration/uat | TBD | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

Fixture seed + test scaffolding must exist before any test can run against realistic data:

- [ ] `scripts/seed-dev-db.ts` — fixture replay through Phase 1 parser into dev DB (D-33 in CONTEXT.md)
- [ ] `tests/helpers/seedTestDb.ts` — in-memory better-sqlite3 factory + deterministic fixture seeder (reusable across query tests)
- [ ] `tests/unit/queries/` — directory exists; at least one passing smoke test per query module (`browse.test.ts`, `tripPicker.test.ts`, `boatDetail.test.ts`, `trends.test.ts`, `compare.test.ts`)
- [ ] `tests/unit/urlState.test.ts` — round-trip parse/serialize tests
- [ ] `tests/unit/components/PerAnglerMetric.test.ts` — renders metric + inline framing + link to /about
- [ ] `tests/integration/routes/` — page load tests per route using `setup` with in-memory DB
- [ ] `date-fns@^4` installed (needed for gap-aware trend bucketing, per RESEARCH.md)
- [ ] `echarts@^6.0` installed (client-only dynamic import; bundle-test covers tree-shaking)

*If none needed after planning: replace with "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

Behaviors that cannot be fully automated without a real browser / viewport simulation:

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 375px viewport — no horizontal page scroll | BRW-08 | Requires real viewport; Tailwind classes can regress without visual verification | Open Chrome DevTools → device toolbar → iPhone SE (375×667) → visit `/`, `/picker`, `/trends`, `/compare`, `/boats/[id]` → confirm no `overflow-x: scroll` on `<body>` |
| Per-angler framing displayed inline (not tooltip-only) | TRP-04 + BRW-09 + CLAUDE.md non-negotiable #4 | Tooltip-only framing is a compliance fail; human must see rendered output | Visit `/picker` with real query → confirm "derived boat-aggregate average" text visible without hover → confirm link to `/about` visible |
| Provisional badge visible on today's rows | BRW-04 | Renders only when source_date == today() — integration test with time-travel is brittle | Visit `/` → confirm "provisional" badge at header → visit `/date/[past-date]` → confirm no badge |
| Heatmap gray cells for n<5 (not green/red) | TRP-09 | ECharts render output; pixel-accurate assertion is brittle | Seed dev DB with sparse species-date combinations → visit `/picker` with that query → confirm insufficient-data cells render in neutral gray, not color scale |
| Source-site links open to correct dated page | BRW-02 | External URL check; cannot assert target content | Click row link on `/` → confirm target is `https://www.sandiegofishreports.com/dock_totals/boats.php?date=<today>` |
| URL round-trip shareability | BRW-07 | Copy-paste flow involves user clipboard | Set filters on `/picker` → copy URL → open in new tab/incognito → confirm same state reproduces |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (vitest runs in `run` mode)
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
