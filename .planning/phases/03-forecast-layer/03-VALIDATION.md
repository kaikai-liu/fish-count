---
phase: 3
slug: forecast-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm vitest run tests/forecast` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run tests/forecast`
- **After every plan wave:** Run `pnpm vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Filled in by gsd-planner during planning. Each task's `<automated>` block lands here keyed to its requirement and threat refs.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD     | TBD  | TBD  | FCT-XX      | —          | TBD             | unit      | TBD               | ❌ W0       | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/forecast/compute.test.ts` — unit tests for recomputeForecasts + computeCell + percentile helper (FCT-01, FCT-02)
- [ ] `tests/forecast/heatmap-composer.test.ts` — past/today/future boundary in /picker loader (FCT-05)
- [ ] `tests/forecast/horizon.test.ts` — >30-day target_date renders "horizon too far — historical data only" (FCT-07)
- [ ] `tests/forecast/gap-aware.test.ts` — gap_days_present vs gap_days_expected math + "based on N of M days" copy (FCT-03 gap-aware bullet)
- [ ] `tests/forecast/year-boundary.test.ts` — January forecast date with ±7 window crossing year boundary (year-wrap edge case from RESEARCH.md)
- [ ] `tests/forecast/percentile.test.ts` — percentile interpolation matching numpy "linear" method on reference vectors

*Existing infrastructure covers all phase requirements (vitest already configured from Phase 1).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Forecast tooltip copy renders correctly in browser ECharts | FCT-05 | Tooltip is rendered inside ECharts canvas; jsdom cannot execute its renderer | Run `pnpm dev`, navigate to `/picker?species=bluefin&trip_type=Overnight&target_date={today+5}`, hover a future heatmap cell. Tooltip MUST contain `forecast: N fish/angler [L–H 80% PI] · n=N trips`. |
| /about#forecasts page renders the FCT-04 benchmark inline summary | FCT-04 | Markdown-driven copy may shift between paragraph splits; visual inspection catches layout regressions | Run `pnpm dev`, navigate to `/about#forecasts`, confirm: (1) seasonal-naïve baseline labeled as such, (2) MAE + median absolute error + PI coverage numbers visible inline, (3) link to 03-VALIDATION-BENCHMARK.md present. |
| Horizon overflow message replaces heatmap, rankings still render | FCT-07 | Layout/visibility check; jsdom assertions are brittle for "rankings still visible" | Run `pnpm dev`, navigate to `/picker?species=yellowtail&trip_type=Full+Day&target_date={today+45}`, confirm: (1) heatmap area shows `horizon too far — historical data only`, (2) historical rankings table below renders normally. |
| FCT-04 benchmark artifact accuracy | FCT-04 | The benchmark is a one-time honesty exercise; numbers must match independent recomputation | Run `pnpm tsx scripts/forecast-benchmark.ts`, open `.planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md`, sanity-check MAE/coverage match the seed data and methodology described. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
