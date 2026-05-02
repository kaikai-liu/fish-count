---
phase: 8
slug: home-retire-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-02
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detail in `08-RESEARCH.md` § Validation Architecture; this file is the executor-facing contract.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.1.x |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npm run test:run -- --reporter=basic` |
| **Full suite command** | `npm run test:run && npm run check && npm run lint` |
| **Estimated runtime** | ~45 seconds quick / ~90 seconds full |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:run -- {touched_test_files}` (scoped)
- **After every plan wave:** Run `npm run test:run && npm run check`
- **Before `/gsd-verify-work`:** Full suite must be green AND manual self-validation per D-40 complete
- **Max feedback latency:** 60 seconds for scoped, 90 seconds for full

---

## Per-Task Verification Map

> Populated by gsd-planner. Each task references `<automated>` test commands wired to a test
> file listed in Wave 0 below, or to `manual: true` for the entries in the Manual-Only table.
> Plan-checker enforces Dimension 8 against this table.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _populated by planner_ | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Test stubs to create before any feature code is written. Each maps to a REQ ID surfaced in research.
> Stubs ship as `it.todo(...)` or skipped; later waves implement against the contract.

### Alias system (ALI-*)

- [ ] `tests/unit/db/aliases.test.ts` — alias DAL: lookup-by-source, list-with-status, upsert, delete
- [ ] `tests/unit/db/aliases-translation.test.ts` — read-time COALESCE/CASE pattern preserves history across renames
- [ ] `tests/unit/db/migrations-aliases.test.ts` — idempotent CREATE + idempotent seed + idempotent forecasts DROP
- [ ] `tests/integration/admin/trip-types.test.ts` — admin auth gate, list, alias, accept, leave-pending flows

### Home page (HOME-*)

- [ ] `tests/unit/db/queries/home.test.ts` — viable trip type filter (≥5/7d), top-5 fpa ranking, alias-aware grouping
- [ ] `tests/unit/lib/bar-normalize.test.ts` — per-section bar arithmetic (max-based normalization)
- [ ] `tests/integration/routes/home.test.ts` — home loader returns sections in correct order, n=1 cells render with trip count

### Compare fix (CMP-*)

- [ ] `tests/integration/routes/compare-typeahead.test.ts` — boat name typeahead replaces ID input, alias-aware results

### Theme system (THM-*)

- [ ] `tests/integration/theme/cookie-ssr.test.ts` — cookie roundtrip Auto/Light/Dark, `<html data-theme>` set pre-paint
- [ ] `tests/unit/lib/theme/cookie.test.ts` — cookie parser/serializer, default Auto, signed integrity if applicable
- [ ] `tests/integration/routes/all-routes-title.test.ts` — every route emits descriptive `<title>` (POL-*)

### Granularity + axis (GRN-*, AXS-*)

- [ ] `tests/unit/lib/shared/dates-buckets.test.ts` — Daily/Weekly/Monthly bucket boundaries in PT
- [ ] `tests/unit/lib/shared/urlState-granularity.test.ts` — schema extension, default-not-serialized, range-switch reset
- [ ] `tests/integration/routes/explorer-granularity.test.ts` — URL param resolution, header control, loader override
- [ ] `tests/unit/lib/chart/axis-time.test.ts` — time-axis tooltip date format in PT, gap-aware bucketing

### Retirement (RTR-*)

- [ ] `tests/integration/redirects.test.ts` — `/picker`, `/picker?...`, `/trends`, `/trends?...` → 301 to `/explorer`
- [ ] `tests/integration/scheduler.test.ts` — scheduler does NOT call removed forecast hook
- [ ] `tests/unit/lib/db/migrations-drop-forecasts.test.ts` — drop is idempotent and gone-from-schema after run
- [ ] `tests/static/no-picker-trends-references.test.ts` — static-grep test fails if `/picker` or `/trends` resurface

### Polish (POL-*)

- [ ] `tests/integration/error-boundary.test.ts` — `+error.svelte` renders friendly copy, no stack
- [ ] `tests/integration/empty-states.test.ts` — explorer/compare/home empty cases render explanatory copy
- [ ] `tests/unit/lib/copy/empty-states.test.ts` — copy module shape

### Framework / install

- [ ] No new test framework — vitest 2.1.x already wired (verified via package.json)

---

## Manual-Only Verifications (per D-40 self-validate-in-browser rule)

These behaviors are visual or browser-timing-dependent. Executors MUST run the dev server,
click through, and screenshot per CLAUDE.md memory `feedback_self_validate_ui.md`.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Theme zero-flash on first paint | THM-* / D-28 | Browser paint timing — jsdom can't observe FOUC | Hard refresh in Chrome with throttled CPU; confirm no flash of light theme when cookie=dark |
| ECharts theme swap on toggle | THM-* / D-30 | Browser-only ECharts render | Toggle Auto→Light→Dark on `/explorer`; chart bg/axis/legend/tooltip/moon-curve all swap; verify at every range preset |
| Home page mobile 375px | HOME-* / D-04 | Layout integrity at narrow width | Open `/` in iPhone SE viewport; per-section bars readable, no overflow, trip-count legible |
| Per-section bar normalization | HOME-* / D-10 | Visual correctness check (Overnight ~1 fpa vs 3.5 Day ~35 fpa both readable) | Compare bar widths within each section in browser; widest bar in each section ≈ section width |
| 301 status in DevTools | RTR-* / D-18 | Confirm 301 not 302, no caching surprises | Network tab on `/picker`, `/picker?ticker=boat`, `/trends`; status 301, response Location `/explorer` |
| Friendly error boundary copy | POL-* / D-31 | Tone check is subjective | Throw in a loader; confirm `+error.svelte` renders neutral copy with link home, not a stack trace |
| Loading skeleton vs spinner | POL-* / D-32 | Visual quality of skeleton shape | Throttle network; chart fetches show skeleton matching chart shape; typeahead waits show spinner |
| Empty state copy per surface | POL-* / D-33 | Tone match across explorer/compare/home | Hit `/explorer?ticker=boat&name=NoSuchBoat`; copy reads in plain English, suggests action |
| Descriptive `<title>` per route | POL-* / D-34 | Browser tab + share-card preview | Open every route; tab title matches `{Page} — FishCount` template |
| Granularity selector UX | GRN-* / D-37 | Hide-when-<3M behavior, range-switch reset feel | Switch ranges and granularities; confirm hide rule and reset rule work; control reads naturally |
| Chart x-axis time-mode | AXS-* / D-35 | Date label auto-format in PT | At every range × granularity, axis labels read in PT and auto-format sensibly; moon overlay aligns |
| Admin page mobile 375px | ALI-* / D-04 | Operator may adjudicate from phone | Open `/admin/trip-types` at 375px; typeahead, action buttons, status badges all usable |
| "NEW" badge visibility | ALI-* / D-05 | Visual signal must be obvious without being noisy | Pending labels in home + explorer; badge readable at glance, doesn't dominate row |
| Theme toggle icon reflects current state | THM-* / D-27 | Common UX bug to show next-state icon | Cycle Auto→Light→Dark→Auto; icon and aria-label reflect current, not next |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] All Manual-Only entries acknowledged in plans (each maps to at least one task with `manual_validation: true`)
- [ ] `nyquist_compliant: true` set in frontmatter after planner populates Per-Task Verification Map

**Approval:** pending
