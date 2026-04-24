---
phase: 01-ingest-store
plan: 08
subsystem: docs
tags: [tos, outreach, polite-scraping, gate, operator-runbook, fly-secrets]

# Dependency graph
requires:
  - phase: 00-ops-guardrails
    provides: "SCRAPER_ENABLED kill switch pattern, Fly secrets workflow, operator-email Resend wrapper"
provides:
  - "TOS review template for operator to complete (ING-10)"
  - "Courtesy outreach email draft for operator to send (ING-11)"
  - "FIRST_SCRAPE_OK gate runbook with pre-flight checklist + Fly CLI commands + rollback paths"
affects: [01-02-scraper-gate, 01-05-scheduler-scrape-tick, 01-06-backfill-cli, first-production-scrape]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-closed environment-variable gate documented for human action prerequisites"
    - "Artifact templates with {curly_brace} placeholders for operator fill-in"

key-files:
  created:
    - ".planning/research/TOS-REVIEW.md"
    - ".planning/research/OUTREACH-EMAIL.md"
    - ".planning/research/FIRST-SCRAPE-RUNBOOK.md"
  modified: []

key-decisions:
  - "Pre-filled robots.txt state (Disallow: empty) as of 2026-04-23 live probe in TOS template — operator re-verifies on review day"
  - "Outreach email sent via personal Gmail, NOT Resend (transactional domain reserved for operator alerts per Phase 0)"
  - "Two independent rollback paths documented: `fly secrets unset FIRST_SCRAPE_OK` and `fly secrets set SCRAPER_ENABLED=false` — either halts the next tick"
  - "7-day wait window codified as `7 calendar days OR affirmative reply (whichever is sooner)` — captures D-21 implicit consent policy"

patterns-established:
  - "Human-action gate: code refuses to proceed on a fail-closed env var until a written artifact exists + a real-world action (email sent + wait) has occurred"
  - "Cross-referenced operator artifact set: runbook links to TOS-REVIEW.md and OUTREACH-EMAIL.md; runbook also links to the gate.ts/scheduler.ts/backfill.ts code consumers for future readers"

requirements-completed: [ING-10, ING-11]

# Metrics
duration: 4min
completed: 2026-04-23
---

# Phase 01 Plan 08: TOS/Outreach/FIRST_SCRAPE_OK Operator Documentation Summary

**Three markdown artifacts under `.planning/research/` that gate the first production scrape: TOS review template, courtesy outreach email draft, and FIRST_SCRAPE_OK runbook with exact `fly secrets set FIRST_SCRAPE_OK=true` command**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-24T05:08:26Z
- **Completed:** 2026-04-24T05:12:22Z
- **Tasks:** 3
- **Files created:** 3
- **Files modified:** 0

## Accomplishments
- `.planning/research/TOS-REVIEW.md` — 7-section operator template (Source Site, TOS Summary, robots.txt State, Scraping Permitted, Rate Limit Commitment, Attribution Plan, Sign-off) with `{operator_name}` / `{YYYY-MM-DD}` placeholders and pre-filled 2026-04-23 robots.txt state
- `.planning/research/OUTREACH-EMAIL.md` — ready-to-send courtesy email with Subject line, four-paragraph body covering rate limit / UA / robots.txt / attribution, explicit opt-out ("reply and I'll halt immediately"), and 7-day wait-period guidance in Operator Notes
- `.planning/research/FIRST-SCRAPE-RUNBOOK.md` — operator checklist explaining the FIRST_SCRAPE_OK fail-closed gate, pre-flight checklist referencing TOS-REVIEW.md + OUTREACH-EMAIL.md, exact `fly secrets set FIRST_SCRAPE_OK=true --app fishcount` command, full backfill invocation with env vars, and two independent rollback paths

## Task Commits

Each task was committed atomically with `--no-verify` per parallel-executor worktree protocol:

1. **Task 1: TOS-REVIEW.md template** — `d91112b` (docs)
2. **Task 2: OUTREACH-EMAIL.md draft** — `f413923` (docs)
3. **Task 3: FIRST-SCRAPE-RUNBOOK.md operator checklist** — `2e71e97` (docs)

**Plan metadata commit:** (this SUMMARY.md) — docs(01-08): complete TOS/outreach/runbook plan

## Files Created/Modified
- `.planning/research/TOS-REVIEW.md` (3.3KB) — ING-10 operator-fill template; gates `FIRST_SCRAPE_OK=true` on reviewer signature
- `.planning/research/OUTREACH-EMAIL.md` (3.1KB) — ING-11 courtesy email draft; gates `FIRST_SCRAPE_OK=true` on email sent + 7d wait or reply
- `.planning/research/FIRST-SCRAPE-RUNBOOK.md` (4.8KB) — D-21 operator runbook; cross-references gate.ts (Plan 01-02), scheduler.ts (Plan 01-05), backfill.ts (Plan 01-06)

## Decisions Made
- **Pre-filled robots.txt excerpt in TOS template:** The 2026-04-23 live probe (`User-agent: * / Disallow:`) is documented in the template as a convenience reference; operator still re-verifies on review day and captures the current state in the second excerpt block. This avoids the template pretending no prior research exists while preserving the operator's responsibility to confirm current state.
- **Personal-Gmail-not-Resend for outreach:** Called out explicitly in OUTREACH-EMAIL.md §Operator Notes because the Resend sender domain (per Phase 0 OPS-01) is reserved for transactional operator alerts — using it for first contact with a third party would muddy the domain reputation.
- **Two independent rollback mechanisms:** Runbook documents both `fly secrets unset FIRST_SCRAPE_OK` (removes the gate prerequisite) and `fly secrets set SCRAPER_ENABLED=false` (OPS-05 kill switch). Either halts the next tick; both are safe to set simultaneously. This satisfies T-01-42 (DoS mitigation) from the plan's threat model.

## Deviations from Plan

None — plan executed exactly as written. All three files were created with the verbatim content specified in each task's `<action>` block. All acceptance criteria grep checks passed on first write (8/8 for Task 1, 7/7 for Task 2, 6/6 for Task 3).

## Issues Encountered

**One procedural hiccup (no impact on output):** The initial `Write` call for Task 1 resolved to the main repo path `/Users/zen/Documents/code/fish-count/.planning/research/` rather than the worktree path `/Users/zen/Documents/code/fish-count/.claude/worktrees/agent-a66eba41/.planning/research/`. Discovered when `test -f` in the verify step found the file missing from the worktree. Resolved by `mv` into the correct worktree path and committed from there. Tasks 2 and 3 used absolute worktree paths in the Write call to avoid recurrence. The final file contents and commits are identical to what the plan specified; no content drift.

## User Setup Required

**Three operator actions remain before first production scrape can execute:**

1. **Fill `.planning/research/TOS-REVIEW.md`** — read source-site TOS and current robots.txt, summarize in ≥3 sentences, verify no clause blocks our planned activity, check all Sign-off boxes, and record reviewer signature + date.
2. **Send `.planning/research/OUTREACH-EMAIL.md`** — substitute `{operator_name}` / `{operator_contact_email}` / `{YYYY-MM-DD}` placeholders, send from `liukk1211@gmail.com` via Gmail (not Resend). Record sent date + reply outcome back in the file's header.
3. **Flip the gate** — after (a) TOS-REVIEW.md signed AND (b) OUTREACH-EMAIL.md sent AND (c) ≥7 calendar days elapsed OR affirmative reply received:
   ```bash
   fly secrets set FIRST_SCRAPE_OK=true --app fishcount
   ```

Per the plan frontmatter `user_setup` block, these are human-action prerequisites; code in Plan 01-02 (`src/lib/scraper/gate.ts`) will enforce the gate, and the nightly scheduler (Plan 01-05) + backfill CLI (Plan 01-06) both call the gate before any outbound HTTP.

## Next Phase Readiness

- **ING-10 and ING-11 requirement-completion evidence in place** — ready to be marked complete in REQUIREMENTS.md by the orchestrator once all wave-1 plans finish.
- **No code changes** — `npm run test:run` remains unaffected; this plan is docs-only and does not touch the build.
- **Downstream plans (01-02 gate, 01-05 scheduler tick, 01-06 backfill CLI) can reference these artifacts** — the runbook's cross-reference section anchors the human-action contract for the code-level gate being written in those later plans.
- **Per plan's `verification` block:** `ls .planning/research/TOS-REVIEW.md .planning/research/OUTREACH-EMAIL.md .planning/research/FIRST-SCRAPE-RUNBOOK.md` confirms all three exist. Each passes its grep-based acceptance checks.

## Self-Check: PASSED

Verified post-write:
- FOUND: `.planning/research/TOS-REVIEW.md` (3,265 bytes) — 8/8 acceptance grep checks passed
- FOUND: `.planning/research/OUTREACH-EMAIL.md` (3,063 bytes) — 7/7 acceptance grep checks passed
- FOUND: `.planning/research/FIRST-SCRAPE-RUNBOOK.md` (4,780 bytes) — 6/6 acceptance grep checks passed
- FOUND commit: `d91112b` (Task 1)
- FOUND commit: `f413923` (Task 2)
- FOUND commit: `2e71e97` (Task 3)
- Verified: runbook contains exact command `fly secrets set FIRST_SCRAPE_OK=true --app fishcount`
- Verified: no modifications to STATE.md or ROADMAP.md (parallel-executor worktree contract)

---
*Phase: 01-ingest-store*
*Completed: 2026-04-23*
