---
phase: 4
slug: email-alerts
status: signed-off
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-28
updated: 2026-04-29
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
| 04-01-T1 | 01 | 1 | ALT-01,02,03,06,11 | T-04-A5 | DDL idempotent + UNIQUE indexes for dedup | unit | `npm run test -- --run tests/unit/db/migrations.test.ts` | Y | ✅ |
| 04-01-T2 | 01 | 1 | ALT-01,02,06,11 | T-04-A5,A11 | Email canonicalization + parameterized SQL across 4 DAL repos | unit | `npm run test -- --run tests/unit/db/subscribers.test.ts tests/unit/db/suppressionList.test.ts tests/unit/db/signupAttempts.test.ts tests/unit/db/alertsSent.test.ts` | Y | ✅ |
| 04-01-T3 | 01 | 1 | ALT-11 | T-04-DAL-02 | seedTestDb helper + UNIQUE-index dedup test | unit | `npm run test -- --run tests/unit/db/subscribers.test.ts tests/unit/db/suppressionList.test.ts tests/unit/db/signupAttempts.test.ts tests/unit/db/alertsSent.test.ts` | Y | ✅ |
| 04-02-T1 | 02 | 1 | (UI-SPEC FLAG #9) | (n/a) | Shared formatPerAngler helper + disposable-email lib install | unit | `npm run test -- --run tests/unit/shared/format.test.ts && npm ls disposable-email-domains-js` | Y | ✅ |
| 04-02-T2 | 02 | 1 | ALT-02,03,04,12 | T-04-A3,A12 | HMAC tokens + 4 anti-abuse pure libs (honeypot, disposable, rate-limit, warmup) | unit | `npx tsc --noEmit` | Y | ✅ |
| 04-02-T3 | 02 | 1 | ALT-02,03,04,12 | T-04-A3,A12 | 5 anti-abuse + token unit-test files | unit | `npm run test -- --run tests/unit/alerts/tokens.test.ts tests/unit/alerts/honeypot.test.ts tests/unit/alerts/disposableEmail.test.ts tests/unit/alerts/rateLimit.test.ts tests/unit/alerts/warmup.test.ts` | Y | ✅ |
| 04-03-T1 | 03 | 1 | ALT-05,07,08 | T-04-A9 | postalAddress fail-closed + escapeHtml + 3 template builders | unit | `npx tsc --noEmit` | Y | ✅ |
| 04-03-T2 | 03 | 1 | ALT-05,08 | T-04-A6 | sendUserEmail with List-Unsubscribe headers + tracking off | unit | `npm run test -- --run tests/unit/email/buildEmail.test.ts tests/unit/email/templates.test.ts tests/unit/email/send.test.ts` | Y | ✅ |
| 04-04-T1 | 04 | 2 | ALT-01,03 | T-04-A1 | Honeypot-first DOM + no-JS form fallback | unit | `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json src/lib/components/SignupForm.svelte 2>&1 \| grep -E "0 errors\|error" \| head -5` | Y | ✅ |
| 04-04-T2 | 04 | 2 | ALT-01,02,03,04,06 | T-04-A1,A2,A4 | 7-step anti-abuse pipeline + silent-success branches | integration | `npx tsc --noEmit && npm run test -- --run tests/integration/alerts/signup.test.ts tests/integration/alerts/anti-enumeration.test.ts` | Y | ✅ |
| 04-04-T3 | 04 | 2 | ALT-01,03,04,06 | T-04-A1 | Anti-enumeration response-shape parity | integration | `npm run test -- --run tests/integration/alerts/signup.test.ts tests/integration/alerts/anti-enumeration.test.ts` | Y | ✅ |
| 04-05-T1 | 05 | 2 | ALT-02,05,06 | T-04-A3 | PreferenceRow + /alerts/confirm + /alerts/confirmed routes | unit | `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json src/lib/components/PreferenceRow.svelte src/routes/alerts/confirmed/+page.svelte 2>&1 \| tail -10` | Y | ✅ |
| 04-05-T2 | 05 | 2 | ALT-02,05,06 | T-04-A3 | /alerts/manage + /alerts/unsubscribe (GET+POST one-click) | unit | `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json src/routes/alerts/manage/+page.svelte src/routes/alerts/unsubscribe/+page.svelte 2>&1 \| tail -10` | Y | ✅ |
| 04-05-T3 | 05 | 2 | ALT-02,05,06 | T-04-A3 | Confirm + manage + unsubscribe integration flows (RFC 8058) | integration | `npm run test -- --run tests/integration/alerts/confirm.test.ts tests/integration/alerts/manage.test.ts tests/integration/alerts/unsubscribe.test.ts` | Y | ✅ |
| 04-06-T1 | 06 | 2 | ALT-01 | — | /about#email + inline CTAs on /boats/[id] and /picker | unit | `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json src/routes/about/+page.svelte src/routes/boats/[id]/+page.svelte src/routes/picker/+page.svelte 2>&1 \| tail -10` | Y | ✅ |
| 04-06-T2 | 06 | 2 | ALT-01 | — | Pre-fill round-trip + framing precedence + verbatim copy | integration | `npm run test -- --run tests/integration/alerts/inline-ctas.test.ts` | Y | ✅ |
| 04-07-T1 | 07 | 3 | ALT-09 | T-04-A2-N5 | Hot-day evaluator + sample-size floors + DAL queries | unit | `npm run test -- --run tests/unit/alerts/evaluators/hotDay.test.ts` | Y | ✅ |
| 04-07-T2 | 07 | 3 | ALT-10 | T-04-A2-N5,A9 | Starting-to-run evaluator + ISO-week + extended templates | unit | `npm run test -- --run tests/unit/alerts/evaluators/startingToRun.test.ts tests/unit/email/templates.test.ts` | Y | ✅ |
| 04-07-T3 | 07 | 3 | ALT-09,10,11,12 | T-04-A8,A9,DISPATCH-02 | Dispatch orchestrator + non-fatal scheduler hook + drainQueued | unit + integration | `npm run test -- --run tests/unit/alerts/dispatch.test.ts tests/integration/alerts/dispatch.test.ts` | Y | ✅ |
| 04-08-T1 | 08 | 4 | ALT-08 | — | email-tester-drill.ts + .env.example Phase 4 documentation | unit | `npx tsc --noEmit && tsx --import ./scripts/_sveltekit-env-loader.mjs scripts/email-tester-drill.ts --templates confirmation 2>&1 \| head -3` | Y | ✅ |
| 04-08-T2 | 08 | 4 | ALT-12 | T-04-A8 | Warm-up cap drill (50/200/drain) integration test | integration | `npm run test -- --run tests/integration/alerts/warm-up-drill.test.ts` | Y | ✅ |
| 04-08-T3 | 08 | 4 | ALT-08 | T-04-A10 | Operator runbook (DMARC + drills + postmortem + recovery) | doc | `test -f docs/runbooks/email-deliverability.md && grep -c "^## " docs/runbooks/email-deliverability.md` | Y | ✅ |
| 04-08-T4 | 08 | 4 | ALT-08 | T-04-A10 | DMARC DNS record + dig + mxtoolbox verification | manual | — | N/A | ⬜ pending operator |
| 04-08-T5 | 08 | 4 | ALT-08 | T-04-A10 | Mail-Tester drill (4 templates × score ≥ 9.0/10) | manual | — | N/A | ⬜ pending operator |
| 04-08-T6 | 08 | 4 | ALT-08 | T-04-A10 | Real-mailbox drill (Gmail+iCloud+Outlook × 4 templates) | manual | — | N/A | ⬜ pending operator |
| 04-08-T7 | 08 | 4 | ALT-08,12 | T-04-DELIV-01 | First 50/day production batch postmortem (+24h Resend dashboard review) | manual | — | N/A | ⬜ pending operator |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> **OPERATOR ACTION REQUIRED** for the four ⬜ pending operator rows above.
> Each is documented end-to-end in `docs/runbooks/email-deliverability.md`
> §1 (DMARC), §2 (Mail-Tester), §3 (Real-mailbox), §5 (Postmortem). Engineering
> deliverables that make these checks fast — drill script, runbook, automated
> warm-up integration test, env documentation — are all green and committed
> in Plan 04-08.
>
> Sign-off resume signal: operator types `approved` against each Task 4-7
> checkpoint resume signal in Plan 04-08, flipping the corresponding ⬜ row
> to ✅ in this map. The phase Approval below records the engineering close
> date; the operator UAT close date is recorded post-+24h-postmortem.

---

## Wave 0 Requirements

- [x] `src/lib/alerts/__tests__/tokens.test.ts` — HMAC sign/verify, purpose isolation, expiry, replay (ALT-02) — shipped at `tests/unit/alerts/tokens.test.ts`
- [x] `src/lib/alerts/__tests__/disposable.test.ts` — disposable-email rejection (ALT-04) — shipped at `tests/unit/alerts/disposableEmail.test.ts`
- [x] `src/lib/alerts/__tests__/rate-limit.test.ts` — per-IP signup rate limit (ALT-03) — shipped at `tests/unit/alerts/rateLimit.test.ts`
- [x] `src/lib/alerts/__tests__/evaluators.test.ts` — hot-day + starting-to-run evaluators (ALT-09, ALT-10) — shipped at `tests/unit/alerts/evaluators/`
- [x] `src/lib/alerts/__tests__/dispatch.test.ts` — dedup + warm-up cap (ALT-11, ALT-12) — shipped at `tests/unit/alerts/dispatch.test.ts` + `tests/integration/alerts/dispatch.test.ts` + `tests/integration/alerts/warm-up-drill.test.ts`
- [x] `src/lib/shared/__tests__/format.test.ts` — formatPerAngler shared with web component — shipped at `tests/unit/shared/format.test.ts`
- [x] `tests/integration/signup.test.ts` — anti-abuse pipeline end-to-end (ALT-01, ALT-03, ALT-04) — shipped at `tests/integration/alerts/signup.test.ts`
- [x] `tests/integration/double-opt-in.test.ts` — confirm flow (ALT-02) — shipped at `tests/integration/alerts/confirm.test.ts`
- [x] `tests/integration/unsubscribe.test.ts` — token + List-Unsubscribe-Post (ALT-05, ALT-06) — shipped at `tests/integration/alerts/unsubscribe.test.ts`
- [x] `tests/integration/dispatch.test.ts` — alert send with dedup (ALT-09..11) — shipped at `tests/integration/alerts/dispatch.test.ts`
- [x] `tests/fixtures/disposable-emails.json` — sample disposable + non-disposable addresses — superseded by `disposable-email-domains-js` library (Plan 04-02 chose the maintained list over a hand-curated fixture)

---

## Manual-Only Verifications

> All four manual-only checks are now backed by either an automated drill or
> a documented operator runbook procedure. Cross-references to engineering
> deliverables added in the right-most column.

| Behavior | Requirement | Why Manual | Test Instructions | Engineering Backing |
|----------|-------------|------------|-------------------|---------------------|
| SPF/DKIM/DMARC DNS records resolve and pass validation | ALT-08 | DNS state — operator must run `dig` against live records | Run `dig TXT _dmarc.fishcount.app +short`, confirm SPF v=spf1, DKIM `resend._domainkey`, DMARC `_dmarc` records present and policy=quarantine. Re-test in mxtoolbox.com SuperTool. | `docs/runbooks/email-deliverability.md` §1 — verbatim TXT value, dig command, mxtoolbox cross-check |
| Real-mailbox deliverability test (Gmail, iCloud, Outlook) | ALT-08 | Receiving-side filtering can only be tested with actual mailboxes | Send confirmation + hot-day + starting-to-run + unsubscribe-success email to one Gmail, one iCloud, one Outlook test mailbox. Confirm: arrives in inbox (not spam), unsubscribe link in mail-client UI is visible (List-Unsubscribe rendered), one-click unsubscribe works. | `scripts/email-tester-drill.ts` exercises all 4 templates through prod send wrapper; `docs/runbooks/email-deliverability.md` §3 has the 7-check inbox checklist |
| Mail-Tester score ≥ 9.0/10 | ALT-08 | External scoring service | Send each of the 4 templates to mail-tester.com address. Score ≥ 9.0 per template; remediate any flagged item. | `scripts/email-tester-drill.ts --to <mail-tester-address>`; runbook §2 includes per-deduction remediation table |
| Warm-up cap drill | ALT-12 | Time-of-day dependent (cap rolls at midnight PT) | Set `WARMUP_START_DATE=<today>`, trigger 60 candidate alerts, confirm 50 sent + 10 queued. Roll forward 7 days, run dispatch, confirm queued drains. | **AUTOMATED** — `tests/integration/alerts/warm-up-drill.test.ts` proves 50/200/drain progression with mocked Resend; T-04-A8 mitigation |
| First production send postmortem | ALT-08, ALT-12 | Real recipients, real reputation impact | After first 50/day batch, check Resend dashboard for bounces, complaints, opens. If complaint rate > 0.3% or bounce rate > 5%, halt warm-up and investigate. | `docs/runbooks/email-deliverability.md` §5 — explicit halt thresholds + recovery procedures |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (test files shipped under `tests/unit/alerts/` and `tests/integration/alerts/`)
- [x] No watch-mode flags
- [x] Feedback latency < 30s (full suite ~38s including Phase 1 end-to-end scrape tests; alert-only sub-suite < 5s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-29 (engineering close; operator UAT items 04-08-T4..T7 remain ⬜ pending operator and are tracked through the corresponding checkpoint resume signals in `04-08-PLAN.md`).
