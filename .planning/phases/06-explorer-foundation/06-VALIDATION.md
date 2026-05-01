---
phase: 6
slug: explorer-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-30
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Drawn from `06-RESEARCH.md` §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.x (already installed; `vitest.config.ts` at repo root) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run --reporter=dot` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~15s for unit, ~25s with route loaders |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run --reporter=dot src/lib/db/queries/explorer.test.ts src/lib/shared/urlState.test.ts` (or the closest scoped path for the task)
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green AND a manual smoke at 375px must be recorded in UAT.md
- **Max feedback latency:** 30 seconds for the scoped run

---

## Per-Task Verification Map

> Filled in during planning. Each plan must populate one row per task with a `<test_type>` and `<automated>` command (or mark `manual`).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _to be filled by planner_ | | | | | | | | | |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test files to create or extend in Wave 0 (per RESEARCH §"Validation Architecture"):

- [ ] `src/lib/db/queries/explorer.test.ts` — new file; stubs for boat-ticker overlay shape, species-ticker top-6 cap, landing-ticker cross-species aggregation, per-bucket `n` carry-through
- [ ] `src/lib/db/queries/trends.test.ts` — extend with daily-bucket case (`%Y-%m-%d`) for the 1M range
- [ ] `src/lib/shared/urlState.test.ts` — extend with `ExplorerFiltersSchema` round-trip + custom-range validation (fromDate ≤ toDate, clamping to `[earliest_scrape, today()]`)
- [ ] `src/lib/db/slug.test.ts` — new file; deterministic slug generation, collision suffix (`-2`, `-3`), freeze-at-first-seen behavior on update path
- [ ] `src/lib/db/migrations.test.ts` — extend with `boats.slug` additive migration + backfill assertion
- [ ] `src/lib/db/boats.test.ts` — extend with `findBySlug()` and `listBoatsByActivity()`
- [ ] `src/routes/explorer/page.server.test.ts` — new file; loader contract (auto-widen note, default-boat selection, range-window mapping, cache-control header)

*Existing infrastructure (vitest + better-sqlite3 in-memory pattern) covers all phase requirements; no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sticky top bar holds at 375px on real iOS Safari | EXPL (mobile usability) | iOS Safari sticky-header behavior diverges from headless browsers; reduced-motion only inspectable in real UA | Open `/explorer` on iPhone (or 375×812 device emulation in Safari Technology Preview), scroll the chart, confirm pills + selector + range strip stay pinned, no z-index flicker |
| Tap-to-pin tooltip on iOS | EXPL chart UX | ECharts tap-to-pin parity differs across mobile browsers | Tap a chart point → tooltip pins; tap elsewhere → tooltip dismisses |
| Legend "+N more" expand/collapse interaction | EXPL chart UX | Custom Svelte pill drives `dispatchAction({type:'legendToggleSelect'})` — needs end-to-end smoke | Switch ticker to `species` with a high-volume species in a wide window; confirm 6 visible series + "+N more" pill; tap pill, confirm hidden series toggle on |
| Native `<input type="date">` on Android Chrome | EXPL custom range UX | Native picker varies by OS | Pick custom range on Android, confirm `fromDate <= toDate` validation displays the inline clamp note |
| ECharts dynamic-import keeps SSR bundle small | Performance | Bundle inspection is build-time, not unit-testable in vitest | `npm run build` then verify `chunks/Chart-*.js` is split (not in the route's server chunk) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (slug.test.ts, explorer.test.ts, page.server.test.ts)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] Manual smokes documented in UAT.md before phase verification
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
