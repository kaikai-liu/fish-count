# FishCount — Retrospective

A living retrospective of what worked, what didn't, and patterns worth carrying forward across milestones.

---

## Milestone: v1.0 — Browse + Picker + Forecast (early-closed)

**Shipped:** 2026-04-30 (4 of 6 planned phases; pivot to v2)
**Phases:** 4 | **Plans:** 28 | **Tasks:** 81+ | **Commits:** 212 | **Timeline:** 8 days

### What Was Built

- Cost/kill/backup/observability guardrails before any cloud traffic (Phase 0)
- Polite, idempotent, resumable scraper writing to a canonical SQLite store (Phase 1)
- Public read surfaces (`/`, `/picker`, `/boats/[id]`, `/compare`, `/trends`, `/about`) with mandatory per-angler honesty framing (Phase 2)
- Statistical forecast layer (seasonal-naïve baseline + 80% PI + n + 30-day cap + n<5 refusal) powering calendar heatmap (Phase 3)

Retired without execution: Email Alerts (Phase 4) and Polish (Phase 5) — see "What Was Inefficient" below.

### What Worked

- **Guardrails before traffic.** Phase 0 (kill switch, Litestream, dead-man's, billing alerts) shipping before Phase 1 paid for itself when CR-01 (litestream `${VAR}` interpolation bug) surfaced during Phase 0 review — the bug is silent in production (replication writes nothing while the app starts normally) and would have been caught months later if guardrails had been retrofitted post-scraping.
- **DAL boundary as a static-grep test.** Forcing every SQL through `lib/db/` and enforcing it with `dal-boundary.test.ts` meant Phase 2's six routes and Phase 3's forecast engine never had to debate where to put a query. The boundary survived four phases of growth without leaks.
- **Single date producer (`lib/shared/dates.ts`) with grep enforcement.** Catching DST bugs at write time instead of runtime caught two latent issues in Phase 3 alone (today() called twice per request; Feb-29 anchor mismatch).
- **TDD scaffolding in Phase 3 Wave 0.** Writing all six failing test scaffolds *before* compute.ts was implemented produced a clean dev loop where each plan's GREEN was visible from the failing test names. Especially clean for percentile + year-boundary edge cases.
- **Per-angler discipline lint.** A 3-file allowlist (`PerAnglerMetric.svelte` + `about/+page.svelte` + `copy/metrics.ts`) enforced inline-not-tooltip framing across 7+ caller sites without per-PR review burden. Structural enforcement of CLAUDE.md non-negotiable #4.
- **GSD verification loop catches real bugs.** Phase 2's UAT walkthrough on 2026-04-25 caught 5 issues (Tailwind v4 token migration, `$state` misuse, comma-form boatIds, etc.) that the static lint + test suite missed. Operator UAT is load-bearing, not theatre.
- **Forecast honesty over ML temptation.** Shipping the seasonal-naïve baseline labeled-as-such (per CLAUDE.md non-negotiable #3) instead of an opaque model meant the FCT-04 honesty benchmark was a 1-day artifact, not a 3-week distraction.

### What Was Inefficient

- **Core value didn't survive contact with the operator's actual decision flow.** v1.0 was scoped around "trip picker" but the operator wanted a multi-axis explorer view ("like a stock chart"). The realisation came at the end of Phase 3, after the picker + heatmap + forecast layer had all been built. The pivot retired roughly half the v1 read surfaces (picker + heatmap + forecasts) and the entire v1 alerts trigger logic. Lesson: a Socratic pass on core-value framing earlier (`/gsd-explore` against the operator's actual decision flow before Phase 2 design) would have surfaced the explorer framing before 19 plans were committed.
- **Phase 3 advisory warnings re-cycled.** Five WR-class warnings landed in `03-REVIEW.md` (gap_days_expected, Feb-29, today()-twice, future-date stub, benchmark perf). Three were fixed; two (gap_days_expected, Feb-29) deferred. The review-then-fix cycle ran in the same week as the phase itself, suggesting the code reviewer caught issues the verifier should have raised — duplicate work between agents.
- **Picker `/+page.svelte:180` rankings short-circuit shipped despite Wave-0 tests passing.** The forecast layer was specifically designed to support future-only / low-historical-data targets, but the rendering layer was never re-checked against the empty-rankings case. The defect is logged in `03-HUMAN-UAT.md` Gap 2 — caught by the operator only because they tried the exact scenario the feature was built for. Lesson: when a phase's purpose is to handle an edge case, the final UAT should explicitly include that edge case.
- **One-liner extraction failed at milestone close.** SUMMARY.md frontmatter doesn't include a structured `one-liner` field, so the gsd-sdk query for accomplishments returned nothing and the milestone summary had to be assembled from VERIFICATION.md tables instead. Worth adding to the summary template.
- **Phase 0 Plan 00-06 deferred (autonomous: false) but the workflow tracked it as "missing".** The audit-open scanner reported "verification gap: Phase 00 (gaps_found)" instead of "deferred-by-design". Operator ergonomics gap — `autonomous: false` plans should be visually distinct from incomplete plans in audit reports.

### Patterns Established

- **`recordAndReturn` invariant for orchestrator-style code.** Phase 1 pipeline.ts sets exactly one `scrape_runs` row per invocation by routing every code path through `recordAndReturn`. This pattern (named-helper-as-invariant) is structurally honest about idempotency and shows up cleanly in the verification table.
- **Pure-math compute engines with injected db handles.** Phase 3's `compute.ts` is purely functional with the db handle as a parameter; per-cell try/catch isolation means one bad cell never aborts the nightly recompute. Same pattern fits any per-row computation that wants to survive partial failures.
- **`'pi_low' in cell` as a structural discriminant.** Phase 3 hybrid heatmap composer merges past actuals + future forecasts in one array and discriminates by presence of `pi_low` field in the tooltip formatter. Avoids a "type" enum or sentinel; field-presence is a natural carrier.
- **Verbatim copy constants in `lib/copy/metrics.ts`.** Single-source-of-truth string constants imported at every render site means the per-angler-discipline lint can scan source files without false positives, and copy changes are atomic (one file edit, no grep-for-strings).
- **Phase-archive-as-historical-record.** v1.0's `milestones/v1.0-phases/` retains every PLAN/SUMMARY/RESEARCH/VERIFICATION untouched. Future readers can audit decisions without re-running anything.

### Key Lessons

1. **Validate core-value framing before designing read surfaces.** v1.0's picker design committed Phase 2 + Phase 3 to a frame the operator didn't end up wanting. A 30-minute Socratic pass would have flipped to the explorer framing before 13 plans were drafted.
2. **Verifier and code reviewer cover overlapping ground.** Phase 3's WR-warnings would have been higher-leverage if surfaced as part of verification, not as a separate review pass. Worth thinking about whether code review should run *during* phase execution rather than after.
3. **UAT must include the edge case the phase exists to support.** Phase 3 verified n<5 refusal in unit tests (correctly) but the rendering integration was never UAT'd against the future-only / no-rankings case. Verification by purpose-of-phase.
4. **Scope pivots are normal; archive cleanly.** v1.0 closing at 4 of 6 phases isn't failure if the audit + archive captures *why* clearly. The cost of a clean pivot is one milestone-close pass; the cost of a dirty pivot is years of "what's this code doing here" archaeology.

### Cost Observations

- Model mix: ~95% Opus 4.7 (1M context); occasional Sonnet for verification subagents
- Sessions: ~30 across 8 calendar days
- Notable: parallel orchestration paid off in Phase 1 (DAL + scraper + parser landing within one day) and Phase 3 (Wave-0 scaffolds across 6 plans). Phase 2 was sequential because UI work was inherently single-threaded.

---

## Cross-Milestone Trends

*Will populate after v2 close. v1.0 is the first milestone — no cross-milestone data yet.*
