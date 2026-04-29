---
phase: 4
slug: email-alerts
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-28
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x (already installed Phase 0) |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm test` (unit + integration) |
| **Estimated runtime** | ~25 seconds (full suite, projected) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (Filled by gsd-planner — see Validation Architecture in 04-RESEARCH.md for the catalog of pure functions, integration surfaces, and manual UAT items.) | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/email/__tests__/token.test.ts` — HMAC sign/verify, purpose isolation, expiry, replay (ALT-02)
- [ ] `src/lib/email/__tests__/disposable.test.ts` — disposable-email rejection (ALT-04)
- [ ] `src/lib/email/__tests__/rate-limit.test.ts` — per-IP signup rate limit (ALT-03)
- [ ] `src/lib/alerts/__tests__/evaluators.test.ts` — hot-day + starting-to-run evaluators (ALT-09, ALT-10)
- [ ] `src/lib/alerts/__tests__/dispatch.test.ts` — dedup + warm-up cap (ALT-11, ALT-12)
- [ ] `src/lib/email/__tests__/format.test.ts` — formatPerAngler shared with web component
- [ ] `tests/integration/signup.test.ts` — anti-abuse pipeline end-to-end (ALT-01, ALT-03, ALT-04)
- [ ] `tests/integration/double-opt-in.test.ts` — confirm flow (ALT-02)
- [ ] `tests/integration/unsubscribe.test.ts` — token + List-Unsubscribe-Post (ALT-05, ALT-06)
- [ ] `tests/integration/dispatch.test.ts` — alert send with dedup (ALT-09..11)
- [ ] `tests/fixtures/disposable-emails.json` — sample disposable + non-disposable addresses

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SPF/DKIM/DMARC DNS records resolve and pass validation | ALT-08 | DNS state — operator must run `dig` against live records | Run `dig TXT alerts.fishcount.app +short`, confirm SPF v=spf1, DKIM `resend._domainkey`, DMARC `_dmarc` records present and policy=quarantine. Re-test in mxtoolbox.com SuperTool. |
| Real-mailbox deliverability test (Gmail, iCloud, Outlook) | ALT-08 | Receiving-side filtering can only be tested with actual mailboxes | Send confirmation + hot-day + starting-to-run + unsubscribe-success email to one Gmail, one iCloud, one Outlook test mailbox. Confirm: arrives in inbox (not spam), unsubscribe link in mail-client UI is visible (List-Unsubscribe rendered), one-click unsubscribe works. |
| Mail-Tester score ≥ 9.0/10 | ALT-08 | External scoring service | Send each of the 4 templates to mail-tester.com address. Score ≥ 9.0 per template; remediate any flagged item. |
| Warm-up cap drill | ALT-12 | Time-of-day dependent (cap rolls at midnight PT) | Set `WARMUP_DAY=1` env, trigger 60 candidate alerts, confirm 50 sent + 10 queued. Set `WARMUP_DAY=2`, run dispatch, confirm queued drains. |
| First production send postmortem | ALT-08, ALT-12 | Real recipients, real reputation impact | After first 50/day batch, check Resend dashboard for bounces, complaints, opens. If complaint rate > 0.3% or bounce rate > 5%, halt warm-up and investigate. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
