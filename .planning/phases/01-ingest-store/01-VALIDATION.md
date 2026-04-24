---
phase: 1
slug: ingest-store
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-23
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (from Phase 0) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~{TBD} seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| *(populated by planner during Phase 1 planning — see 01-RESEARCH.md § Validation Architecture for invariants)* | | | | | | | | | |

---

## Wave 0 Requirements

*(populated by planner from 01-RESEARCH.md § Validation Architecture — test fixtures + negative-grep enforcement stubs)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TOS review artifact completed | ING-10 | Requires operator to read live source-site TOS | Operator reads `sandiegofishreports.com` TOS + robots.txt, fills in `.planning/research/TOS-REVIEW.md` |
| Courtesy outreach email sent | ING-11 | Requires operator to actually send the email | Operator sends draft from `.planning/research/OUTREACH-EMAIL.md` and records send date |
| `FIRST_SCRAPE_OK` flip | D-21 | Deliberately gated on human judgment | Operator sets Fly secret after ING-10 + ING-11 complete |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
