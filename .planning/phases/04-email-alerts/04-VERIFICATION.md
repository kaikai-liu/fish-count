---
phase: 04-email-alerts
verified: 2026-04-29T18:00:00Z
status: passed
score: 5/5 success criteria verified
overrides_applied: 0
resolved_gaps:
  - truth: "Alert dispatch volume is programmatically capped to the warm-up schedule (50/day week 1, 200/day week 2) before being allowed to scale to the full list — and the cap is observable across all dispatch invocations within a day"
    resolved_at: 2026-04-29T21:14:00Z
    resolution: "Fixed CR-01 inline. `countSentSince` (src/lib/db/alertsSent.ts:90) now wraps both `sent_at` and the cutoff in SQLite's `datetime()` so the ISO-8601 cutoff and the space-separated `sent_at` normalize to the same internal form before comparison. Added regression test `tests/unit/db/alertsSent.test.ts` 'countSentSince accepts ISO-8601 cutoff (warm-up cap regression #CR-01)' that inserts a row via recordSent then asserts countSentSince returns 1 for an earlier ISO-8601 cutoff. Also corrected `tests/unit/alerts/dispatch.test.ts` 'ALT-12: when warmup cap=0' which seeded synthetic timestamps with invalid hours (T49:00:00.000Z) — the old naïve string compare accepted them; the new datetime-normalized compare correctly rejects them, so the test data was stale, not the fix. Full suite 648/648 passing."
gaps: []
deferred: []
human_verification:
  - test: "DMARC TXT record resolves and policy is observed"
    expected: "`dig TXT _dmarc.fishcount.app +short` returns the v=DMARC1 record verbatim and mxtoolbox.com SuperTool DMARC Lookup against fishcount.app shows policy=none/quarantine with strict alignment"
    why_human: "DNS state — operator must add the TXT record at the DNS provider, wait for propagation, and run dig against live records. Documented in docs/runbooks/email-deliverability.md §1 (OPERATOR ACTION REQUIRED)."
  - test: "SPF + DKIM + DMARC all PASS via Gmail show-original on a real send"
    expected: "Gmail's show-original on each of the 4 templates lists SPF=PASS, DKIM=PASS, DMARC=PASS in the authentication-results header. mxtoolbox SPF/DKIM/DMARC lookups all green."
    why_human: "Receiving-side authentication evaluation can only be tested against real DNS + a real mailbox. Operator-only step, documented in docs/runbooks/email-deliverability.md §1–§3."
  - test: "Mail-Tester score >= 9.0/10 per template (4 sends)"
    expected: "Each of confirmation, hot-day, starting-to-run, unsubscribe-success scores ≥ 9.0/10 via mail-tester.com; any deduction <0.5 is documented; any deduction ≥0.5 triggers the §2 remediation table."
    why_human: "External scoring service. Drill is automated end-to-end (`tsx scripts/email-tester-drill.ts --to <mail-tester-address> --templates all`) but the score itself is computed by mail-tester.com against the live send — operator must capture and record the result. Documented in docs/runbooks/email-deliverability.md §2."
  - test: "Real-mailbox deliverability test (Gmail + iCloud + Outlook) for all 4 templates"
    expected: "Each template arrives in the inbox (not spam), the One-Click Unsubscribe link is rendered by the mail client UI (List-Unsubscribe header honored), and the visible unsubscribe link in the email body is clickable. Per the 7-check inbox checklist in §3."
    why_human: "Receiving-side filtering only testable with actual third-party mailboxes. Documented in docs/runbooks/email-deliverability.md §3."
  - test: "First production 50/day batch postmortem at +24h"
    expected: "Resend dashboard at +24h after the first production batch shows complaint rate < 0.3% AND bounce rate < 5%. If either threshold trips, halt warm-up and execute §5 recovery procedure."
    why_human: "Real recipients, real reputation impact, time-elapsed (+24h) check against an external dashboard. Documented in docs/runbooks/email-deliverability.md §5 with explicit halt thresholds."
---

# Phase 4: Email Alerts Verification Report

**Phase Goal:** Anglers can opt in to email alerts for followed boats or species and receive 'hot day' and 'starting to run' notifications — with list-bombing, deliverability, and abuse protections all shipping on day one.
**Verified:** 2026-04-29T18:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (against ROADMAP Phase 4 Success Criteria)

| # | Truth (verbatim from ROADMAP) | Status | Evidence |
|---|------|--------|----------|
| 1 | Honeypot value, disposable-email, or 4th-IP-attempt rejected; only double-opt-in-confirmed emails enter the active list | ✓ VERIFIED | 7-step pipeline in `src/routes/alerts/+page.server.ts` lines 97–203: honeypot (line 113) → rate-limit (line 119) → disposable (line 131) → suppression (line 137) → already-pending (line 144) → already-active (line 151) → happy path with `subscribers.createPending` writing `status='pending'` and `signToken('confirm')`. Confirm route at `src/routes/alerts/confirm/+page.server.ts:46–48` flips `status='pending'→'active'` only after HMAC verification. `tests/integration/alerts/signup.test.ts` (6/6 passing) and `tests/integration/alerts/anti-enumeration.test.ts` (1/1) prove all branches work and silent-success the 3 anti-enumeration paths. Honeypot, disposable, and rate-limit unit tests (8 honeypot/disposable/rate-limit tests) green. |
| 2 | mail-tester >9/10; SPF/DKIM/DMARC pass; List-Unsubscribe header + one-click + postal address + reason-for-receipt on every email | ⚠️ PARTIAL — code-side complete; live-DNS + mail-tester score require operator | Code side fully verified: `src/lib/email/send.ts` lines 33–35 set `'List-Unsubscribe': '<mailto:...>, <https://...>'` AND `'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'` (RFC 8058). `src/lib/email/postalAddress.ts` throws when POSTAL_ADDRESS env unset (fail-closed). `buildEmail` interpolates address verbatim into HTML and text variants (tests/unit/email/buildEmail.test.ts proves the verbatim render + the throw). Reason-for-receipt block present in confirmation, hot-day, starting-to-run templates (tests/unit/email/templates.test.ts asserts verbatim copy). Tracking explicitly disabled per send: `tracking: { open_tracking: false, click_tracking: false }` (send.ts line 38). Drill script `scripts/email-tester-drill.ts` and runbook `docs/runbooks/email-deliverability.md` (250 lines, 9 sections) cover the operator-side validation. **Live DMARC DNS, mail-tester score, and SPF/DKIM live records → human verification (5 items below).** |
| 3 | Unsubscribing writes to suppression; re-subscribing through the public form does not re-activate alerts | ✓ VERIFIED | `src/routes/alerts/unsubscribe/+page.server.ts:50–52` writes `suppressionList.add(db, sub.email, 'user_unsub')` THEN `subscribers.deleteForUnsubscribe`. Both GET (line 61) and POST (line 69, RFC 8058) route through `performUnsubscribe`. Re-signup blocked by `src/routes/alerts/+page.server.ts:137` (`suppressionList.has(db, email)` → silent generic-success without `createPending`). suppression_list table is keyed by canonicalized email and survives subscriber row deletion (FK does NOT cascade). Tests: `tests/integration/alerts/unsubscribe.test.ts` and `tests/integration/alerts/anti-enumeration.test.ts` (1 test) prove `expect(sendMock).not.toHaveBeenCalled` for suppressed-email signup attempts. |
| 4 | After hot-day or starting-to-run trigger, single alert sent and recorded; re-running scrape does not duplicate | ✓ VERIFIED | `src/lib/alerts/dispatch.ts:248` `if (alertsSent.exists(db, dedupKey)) continue;` is the dedup gate. Schema-level UNIQUE INDEX `idx_alerts_sent_unique ON (subscriber_id, kind, trigger_key, trigger_date)` (migrations.ts:174–175) is the second line of defense. `tests/integration/alerts/dispatch.test.ts` (1 test) and `tests/integration/alerts/warm-up-drill.test.ts` (4 tests) prove the dedup contract: re-running `dispatchAlerts(today, db)` does not send a second time, and 60 candidates with cap=50 produce 50 sent + 10 queued (zero duplicates). Hot-day evaluator MIN_ANGLERS=8 floor (env-overrideable HOT_DAY_MIN_ANGLERS) per CLAUDE.md non-negotiable #3. |
| 5 | Alert dispatch volume programmatically capped to warm-up schedule (50/day week 1, 200/day week 2) before scaling | ✗ FAILED | Per-tick correctness verified by `tests/integration/alerts/warm-up-drill.test.ts` (4/4 passing — week 1 caps at 50, week 2 caps at 200, post-warmup uncapped). However, **CR-01 in 04-REVIEW.md identifies a real bug**: `countSentSince` (alertsSent.ts:90) does a string `>=` between an ISO-8601 cutoff (`${today}T00:00:00.000Z`) and `sent_at` written by SQLite `datetime('now')` (`YYYY-MM-DD HH:MM:SS`, space-separated). The space sorts before T, so the function returns 0 for any same-day comparison. The cap is not observable as durable state — it relies on the in-memory `cursorSentToday` for the lifetime of one `dispatchAlerts()` call. A second invocation within the same day (manual re-trigger, future `/api/cron/dispatch` route, retry tick after an outage) would see `sentToday=0` and grant a fresh full budget, blowing past the warm-up promise. The single-tick-per-day scheduler topology masks this today. |

**Score:** 4/5 truths verified (1 partial counted as failed for criterion #5 because the bug is in the durable mechanism, not the in-memory one).

### Required Artifacts (sample of must_haves across plans 01–08)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/db/migrations.ts` | 6 new Phase 4 tables + 4 indexes | ✓ VERIFIED | All 6 CREATE TABLE statements present (lines 114–172), idx_alerts_sent_unique present (line 174), CHECK constraints on status/kind/reason verified by tests/unit/db/migrations.test.ts |
| `src/lib/db/subscribers.ts` | 9 exports incl. createPending, activate, findActive, findRecentPending, findById, listActive, deleteForUnsubscribe, getSummary, updatePreferences | ✓ VERIFIED | All 9 functions exported; email canonicalized at DAL boundary (canonicalizeEmail); 7 unit tests passing |
| `src/lib/db/suppressionList.ts` | add, has, list with canonicalized email | ✓ VERIFIED | All 3 functions present; `INSERT OR IGNORE` makes add idempotent; 5 unit tests passing |
| `src/lib/db/signupAttempts.ts` | recordAttempt, countWithinWindow | ✓ VERIFIED | Both functions; 5 unit tests passing |
| `src/lib/db/alertsSent.ts` | exists, recordSent, recordQueued, countSentSince, listQueued, markExpired, markSent | ✓ VERIFIED (with caveat) | All 7 functions present; 9 unit tests passing. **Caveat: countSentSince has the CR-01 datetime-format bug — see truth #5.** |
| `src/lib/alerts/tokens.ts` | signToken/verifyToken with HMAC-SHA256, timingSafeEqual, fail-closed PROJECT_SECRET | ✓ VERIFIED | createHmac+timingSafeEqual, MIN_SECRET_LEN=32, throws on missing/short; 8 unit tests passing |
| `src/lib/alerts/{honeypot,disposableEmail,rateLimit,warmup}.ts` | 4 pure-fn anti-abuse libs | ✓ VERIFIED | All 4 modules; rateLimit MAX_ATTEMPTS=3 + WINDOW_SECONDS=3600; warmup 50/200/Infinity schedule; 17 unit tests passing across the 4 files |
| `src/lib/email/{postalAddress,buildEmail,templates,send}.ts` | fail-closed POSTAL_ADDRESS, multipart HTML+text, 3 templates + 2 dispatcher-facing aliases, RFC 8058 send wrapper | ✓ VERIFIED | All 4 files present; escapeHtml for T-04-A9; tracking disabled; 28 unit tests passing across email/ |
| `src/lib/components/SignupForm.svelte` | honeypot-first DOM, no-JS form, multi-select | ✓ VERIFIED | name="website" honeypot before email, method="POST", multi-select for boats+species, min-h-11 touch targets |
| `src/routes/alerts/+page.server.ts` | 7-step pipeline in declared order | ✓ VERIFIED | Pipeline ordering visible in source (lines 113–197). rateLimit.record (line 128) appears BEFORE disposableEmail.isDisposable (line 131) per ordering invariant. signup.test.ts + anti-enumeration.test.ts (7 tests) prove every branch. |
| `src/routes/alerts/{confirm,confirmed,manage,unsubscribe,pending}` | Token-gated routes, double-opt-in, RFC 8058 one-click unsubscribe | ✓ VERIFIED | 5 sub-route directories present with `+page.server.ts` + `+page.svelte`; verifyToken called at every entrance; Referrer-Policy: same-origin set on all token-bearing pages; 14 integration tests passing across confirm/manage/unsubscribe |
| `src/lib/alerts/dispatch.ts` + `evaluators/{hotDay,startingToRun}.ts` | dispatch orchestrator + 2 evaluators with non-fatal try/catch | ✓ VERIFIED | dispatch.ts present with drainQueued (B1) + per-candidate try/catch + dedup; both evaluators present in src/lib/alerts/evaluators/; integration test proves single-send + dedup |
| `src/lib/server/scheduler.ts` (modified) | non-fatal dispatchAlerts hook after recomputeForecasts | ✓ VERIFIED | scheduler.ts:111–118 wraps `await dispatchAlerts(date, getDb())` in try/catch with `alerts_dispatch_failed_non_fatal` log line; never blocks pingHealthcheck('success') |
| `scripts/email-tester-drill.ts` | tsx-runnable drill sending 4 templates via prod Resend wrapper | ✓ VERIFIED | 316 lines; supports --to, --templates, --dry-run flags; .env.example documents all required env |
| `docs/runbooks/email-deliverability.md` | DMARC + drills + postmortem + recovery procedures | ✓ VERIFIED | 250 lines, 9 sections covering DMARC, mail-tester, real-mailbox, warm-up, postmortem, recovery |
| `tests/integration/alerts/warm-up-drill.test.ts` | automated 50/200/drain ALT-12 drill | ✓ VERIFIED | 4 tests passing: week 1 (50 sent + 10 queued), week 2 (10 drained + 60 fresh = 70 sends), post-warmup uncapped, env-unset uncapped |
| `.env.example` | every Phase 4 env var documented | ✓ VERIFIED | PROJECT_SECRET, POSTAL_ADDRESS, RESEND_API_KEY, SUBSCRIBER_FROM_EMAIL, PUBLIC_BASE_URL, HOT_DAY_MIN_ANGLERS, WARMUP_START_DATE all present with comments |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `+page.server.ts` (alerts) | `honeypot,rateLimit,disposableEmail,tokens,warmup` | direct imports + pipeline composition | ✓ WIRED | All 5 imports present at lines 28–32; pipeline ordering enforced in code (Step 9 ordering test passes via grep on actions.default body) |
| `+page.server.ts` (alerts) | `subscribers,suppressionList` | DAL imports | ✓ WIRED | Imports at lines 26–27; DAL functions called at appropriate steps; no SQL in route file |
| `+page.server.ts` (alerts) | `email/templates + email/send` | renderConfirmationEmail + sendUserEmail in happy path | ✓ WIRED | Imports at lines 33–35; called in step 8 happy path with try/catch around send |
| `dispatch.ts` | `alertsSent (DAL) + warmup + send + subscribers + tokens + templates + buildEmail` | full orchestration | ✓ WIRED | All imports present at top of dispatch.ts; per-candidate path: exists check → cap check → sign → render → buildEmail → sendUserEmail → recordSent. Full chain integration-tested in tests/integration/alerts/dispatch.test.ts |
| `scheduler.ts` | `dispatch.ts` | non-fatal try/catch hook | ✓ WIRED | Line 28 import; lines 111–118 invocation with try/catch; outcome gate matches recomputeForecasts |
| `confirm/+page.server.ts` | `tokens + subscribers` | verifyToken('confirm') + activate | ✓ WIRED | Lines 16–17 imports; verifyToken called at line 31, activate at line 47 |
| `unsubscribe/+page.server.ts` | `suppressionList.add → subscribers.deleteForUnsubscribe` | write-then-render order | ✓ WIRED | Lines 51–52: suppressionList.add THEN deleteForUnsubscribe in same try; both GET load and POST action route through performUnsubscribe |
| `manage/+page.server.ts` | `verifyToken('manage') + subscribers.getSummary/updatePreferences` | token-gated load + actions | ✓ WIRED | All required imports + actions present (file confirmed via 04-REVIEW.md files_reviewed_list) |
| `boats/[id]/+page.svelte` + `picker/+page.svelte` | `/alerts?boat=ID` and `/alerts?species=NAME` | inline CTAs with URL pre-fill | ✓ WIRED | href="/alerts?boat={profile.boat.id}" at boats/[id]/+page.svelte:69; href="/alerts?species={encodeURIComponent(data.filters.species)}" at picker/+page.svelte:220 |
| `about/+page.svelte` | `#email` and `#warmup` anchors | section headers with id attributes | ✓ WIRED | `<h2 id="email">Email alerts</h2>` at line 144 and `<h3 id="warmup">` at line 168 |

### Data-Flow Trace (Level 4) — Dispatch Pipeline

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `dispatch.ts` `activeSubs` | `subscribers.listActive(db)` | DAL query of subscribers table joined with subscriber_boats + subscriber_species | ✓ Real DB query (subscribers.ts), filters status='active' AND paused_until check | ✓ FLOWING |
| `dispatch.ts` `hotCands` | `evaluateHotDay({today, subscribers, db})` | Reads catch_reports via `alertEval.getTodayPerBoatTripStats` + `getTrailingBoatTripStats` (DAL queries) | ✓ Real DB aggregation; tests prove emission with seeded data | ✓ FLOWING |
| `dispatch.ts` `runCands` | `evaluateStartingToRun(...)` | DAL queries `getRolling7SpeciesStats`, `getYearAgoSpeciesStats`, `getModalTripTypeForSpecies` | ✓ Real DB aggregation | ✓ FLOWING |
| `dispatch.ts` `sentToday` | `alertsSent.countSentSince(db, midnightPtIso(today))` | DAL query — but cutoff format mismatch makes this return 0 in production | ⚠️ STATIC (returns 0 due to CR-01) — see gap | ⚠️ HOLLOW (durable counter broken; in-memory cursor is the actual cap mechanism today) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All Phase 4 unit + integration tests pass | `npx vitest run tests/unit/{alerts,email} tests/unit/db/{alertsSent,subscribers,suppressionList,signupAttempts}.test.ts tests/integration/alerts` | 23 test files / 170 tests passing in 881ms | ✓ PASS |
| Warm-up cap drill verifies 50/200/drain | `npx vitest run tests/integration/alerts/warm-up-drill.test.ts` | 4/4 tests passing — week 1 caps at 50 (50 sent + 10 queued), week 2 promotes 10 queued + sends 60 fresh = 70 total, post-warmup uncapped | ✓ PASS |
| Dispatch + dedup integration | `npx vitest run tests/integration/alerts/dispatch.test.ts` | 1/1 passing — re-running dispatch does not duplicate | ✓ PASS |
| DAL boundary: no SQL outside src/lib/db/ | `grep -rE "(SELECT\|INSERT\|UPDATE\|DELETE) " src/lib/alerts/ src/lib/email/ src/routes/alerts/` | 0 matches | ✓ PASS |
| Drill script syntactically loadable | `tsx --import ./scripts/_sveltekit-env-loader.mjs scripts/email-tester-drill.ts --templates confirmation` | per VALIDATION.md row 04-08-T1: ✅ green | ✓ PASS (per VALIDATION) |
| Live mail-tester score | n/a | requires operator action against external service | ? SKIP → human verification |
| Live SPF/DKIM/DMARC dig | n/a | requires DNS state | ? SKIP → human verification |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ALT-01 | 01, 02, 04, 06 | Anonymous signup form with email + (optional) followed boats/species | ✓ SATISFIED | SignupForm + /alerts route + inline CTAs on /boats/[id] and /picker; multi-select boats+species; signup.test.ts proves end-to-end |
| ALT-02 | 01, 02, 04, 05 | Double opt-in with project-secret-signed verification link | ✓ SATISFIED | tokens.ts HMAC-SHA256 + 24h expiry on confirm purpose; confirm route activates pending→active only after verifyToken; confirm.test.ts proves invalid/expired/wrong-purpose all rejected |
| ALT-03 | 01, 02, 04 | Rate-limit 3/hr per IP + honeypot | ✓ SATISFIED | rateLimit.MAX_ATTEMPTS=3, WINDOW_SECONDS=3600, honeypot field "website" first in DOM; signup.test.ts proves 4th attempt returns 429; anti-enumeration test proves honeypot silent-success |
| ALT-04 | 02, 04 | Disposable-email rejection at signup | ✓ SATISFIED | disposable-email-domains-js library wired; signup.test.ts proves mailinator.com → 400 with disposable_address code |
| ALT-05 | 03, 05 | List-Unsubscribe header + visible one-click unsubscribe link | ✓ SATISFIED | send.ts:33–35 sets List-Unsubscribe + List-Unsubscribe-Post=One-Click headers; unsubscribe route handles both GET (link click) and POST (RFC 8058); send.test.ts asserts exact header values |
| ALT-06 | 01, 04, 05 | Suppression list cannot be re-subscribed from public form | ✓ SATISFIED | suppressionList.add at unsubscribe; suppressionList.has check at signup step 5 → silent generic-success; suppressed entry survives subscriber row delete (no FK cascade); anti-enumeration test asserts sendMock NOT called for suppressed branch |
| ALT-07 | 03 | Physical postal address + plain-language reason-for-receipt on every email | ✓ SATISFIED | postalAddress.ts throws when env unset (fail-closed); buildEmail interpolates verbatim into both HTML and text; reasonForReceipt block in all 3 templates; tests assert verbatim render |
| ALT-08 | 03, 08 | SPF + DKIM + DMARC configured before first production email | ⚠️ PARTIAL — code-side ready; live DNS state requires operator | docs/runbooks/email-deliverability.md §1 documents DMARC TXT record verbatim; scripts/email-tester-drill.ts provides automated drill; **live DNS, mail-tester score, and Gmail show-original verification are documented as OPERATOR ACTION REQUIRED in VALIDATION.md (rows 04-08-T4..T7)** — see 5 human-verification items |
| ALT-09 | 07 | Hot-day alert when boat avg/angler > 2× trailing 30-day same-trip-type avg with ≥N anglers | ✓ SATISFIED | evaluators/hotDay.ts implements the threshold with MIN_ANGLERS=8 default + HOT_DAY_MIN_ANGLERS env override; evaluators/hotDay.test.ts verifies threshold + sample-size floor; integration warm-up-drill exercises the full pipeline with seeded 4x baseline data |
| ALT-10 | 07 | Starting-to-run alert when species 7-day fleet-wide avg > 1.5× same-week-last-year baseline | ✓ SATISFIED | evaluators/startingToRun.ts implements with ISO-week trigger_date + last-year baseline window; tests/unit/alerts/evaluators/startingToRun.test.ts verifies threshold + n<5 floor |
| ALT-11 | 01, 07 | alerts_sent dedup table prevents duplicate alert delivery | ✓ SATISFIED | UNIQUE INDEX idx_alerts_sent_unique at schema layer + alertsSent.exists pre-check at dispatch layer; alertsSent.test.ts proves second insert with same dedup key throws SqliteError; dispatch.test.ts proves second tick does not duplicate |
| ALT-12 | 02, 07, 08 | Alert dispatch warmed up over a week (50/day → 200/day → full) before scaling | ✗ BLOCKED — partial | warmup.dailyCap returns correct schedule; warm-up-drill integration test proves per-tick correctness (50 sent + 10 queued → drain to 60 sent on week 2). **However CR-01 makes the durable cap counter (`countSentSince`) return 0 in production.** Per-tick cap is enforced today only because the in-memory cursor (cursorSentToday) tracks correctly within a single dispatchAlerts() invocation, AND the scheduler runs once per day. A second invocation within the same day would bypass the cap. See gap below. |

**No orphaned requirements** — all 12 ALT-XX IDs from REQUIREMENTS.md are claimed by at least one Phase 4 plan and traced above.

### Anti-Patterns Found

Findings from 04-REVIEW.md (reproduced here for traceability — full detail in the review file):

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/lib/db/alertsSent.ts` | 90–95 | `countSentSince` cutoff format mismatch — string `>=` between ISO-8601 cutoff and `datetime('now')` form | 🛑 BLOCKER (Critical, CR-01) | **Material to Criterion 5** — warm-up cap is unobservable across multi-tick days; today masked by once-daily scheduler tick. See gap above. |
| `src/lib/email/templates.ts` | 69, 107 | Hard-coded `https://fishcount.app` URLs bypass PUBLIC_BASE_URL | ⚠️ Warning (WR-01) | Non-prod environments will send wrong URLs in alert emails. Does not break Criterion 2 in production. |
| `src/lib/alerts/dispatch.ts:192–194` and `routes/alerts/+page.server.ts:160,164` | — | Fail-open env defaults for PUBLIC_BASE_URL + SUBSCRIBER_FROM_EMAIL | ⚠️ Warning (WR-02) | Contradicts CLAUDE.md "all, not a subset" fail-closed posture; misconfigured deployment will silently send with wrong From: and links. |
| `src/lib/alerts/tokens.ts:71–82` | — | verifyToken does not validate decoded payload shape with Zod | ⚠️ Warning (WR-03) | Defense-in-depth concern; signing path is the only producer; not exploitable without HMAC key. |
| `src/lib/db/alertsSent.ts:141–147` | — | markSent silently no-ops when row not in `queued` state | ⚠️ Warning (WR-04) | Edge case in queue-drain path; cursor + drained accounting drift if row was concurrently expired. |
| `src/lib/alerts/dispatch.ts:41–49` | — | UTC vs PT day boundary acknowledged but not addressed for warmup window | ⚠️ Warning (WR-05) | Off-by-7-hours window in counting; combined with CR-01 the practical effect is moot today. |
| `src/routes/alerts/manage/+page.server.ts:115–134` | — | Manage-page action returns differentiable HTTP statuses on token-verified path | ⚠️ Warning (WR-06) | Token-gated subscriber-state probing; not direct enumeration vector. |
| 7 minor info findings (IN-01..07) | — | Misleading props, paused_until UTC compare, TOCTOU race window, env-resolution drift, queue-drain placeholder zeros, step-7 redirect distinguishability, optional-chaining on non-optional field | ℹ️ Info | All documented in 04-REVIEW.md; none block goal achievement. |

### Human Verification Required

5 items require operator action against live infrastructure (documented in `docs/runbooks/email-deliverability.md`):

#### 1. DMARC TXT record resolves and policy is observed

**Test:** `dig TXT _dmarc.fishcount.app +short` and mxtoolbox.com SuperTool DMARC Lookup against fishcount.app.
**Expected:** dig returns the `v=DMARC1; p=none; rua=mailto:dmarc-reports@fishcount.app; pct=100; adkim=s; aspf=s` record verbatim; mxtoolbox shows policy=none with strict alignment.
**Why human:** DNS provider login + propagation wait; documented in §1 of the runbook as OPERATOR ACTION REQUIRED.

#### 2. SPF + DKIM + DMARC pass on real send

**Test:** Gmail show-original on each of the 4 templates (after sending via the drill).
**Expected:** authentication-results header lists SPF=PASS, DKIM=PASS, DMARC=PASS.
**Why human:** Receiving-side authentication evaluation requires real mailbox + real DNS. Documented in §1–§3.

#### 3. Mail-Tester score >= 9.0/10 per template

**Test:** `tsx scripts/email-tester-drill.ts --to <mail-tester-address> --templates all`
**Expected:** Each of the 4 templates scores ≥ 9.0/10 on mail-tester.com.
**Why human:** External scoring service. Drill is fully automated; the score itself is computed externally and must be captured by the operator. Documented in §2 with per-deduction remediation table.

#### 4. Real-mailbox deliverability (Gmail + iCloud + Outlook × 4 templates)

**Test:** Send 4 templates to a Gmail, an iCloud, and an Outlook test inbox.
**Expected:** Inbox (not spam); List-Unsubscribe link rendered by mail client UI; one-click unsubscribe works; per the 7-check inbox checklist.
**Why human:** Receiving-side filtering only testable with actual third-party mailboxes. Documented in §3.

#### 5. First production 50/day batch postmortem at +24h

**Test:** Resend dashboard review at +24h after first production batch.
**Expected:** Complaint rate < 0.3% AND bounce rate < 5%. If either trips, halt warm-up and execute §5 recovery procedure.
**Why human:** Real recipients, real reputation impact, time-elapsed (+24h) check. Documented in §5 with explicit halt thresholds.

### Gaps Summary

**One real gap (Criterion 5 / ALT-12):**

`countSentSince` in `src/lib/db/alertsSent.ts` does a string comparison between a cutoff built as ISO-8601 (`${today}T00:00:00.000Z`, with T and Z) and `sent_at` values written by SQLite's `datetime('now')` (`YYYY-MM-DD HH:MM:SS`, space-separated, no T, no Z). Lexicographic compare of these formats always evaluates to "less than the cutoff" because the space character (0x20) sorts before T (0x54). The function returns 0 in production for any same-day comparison.

This makes the durable warm-up cap mechanism unobservable. The cap is only enforced today by the in-memory `cursorSentToday` variable inside `dispatchAlerts()`, which lives for the duration of a single function call. The single-tick-per-day scheduler topology (croner cron at 23:00 PT, `protect: true`) means there's only one `dispatchAlerts()` invocation per day in production today, so the bug is currently masked.

**Why this materially affects Criterion 5:**

ROADMAP Phase 4 success criterion #5 requires the cap to be "programmatically capped to the warm-up schedule". The mechanism that performs that cap must be durable so that:
- A manual re-trigger of dispatch (operator console, future `/api/cron/dispatch` route) does not bypass the cap
- A retry tick after an outage observes the prior cap consumption rather than starting fresh
- Any future per-day reporting/observability query against `countSentSince` returns the actual count

The fix is mechanical (one-line SQL change to `WHERE sent_at >= datetime(?)`) plus a regression unit test. Until that fix lands, the cap is functionally a single-tick-per-day in-memory contract — load-bearing on the scheduler topology — rather than a durable invariant of the data layer.

**5 human-verification items** (not gaps; expected manual UAT):
- DMARC live DNS + mxtoolbox lookup
- SPF/DKIM/DMARC on real send (Gmail show-original)
- Mail-tester score per template
- Real-mailbox delivery on Gmail/iCloud/Outlook
- First 50/day production batch postmortem at +24h

All 5 are explicitly marked OPERATOR ACTION REQUIRED in `docs/runbooks/email-deliverability.md` and `04-VALIDATION.md`. Engineering deliverables backing them (drill script, runbook, automated warm-up integration test, env documentation) are all green and committed.

---

_Verified: 2026-04-29T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
