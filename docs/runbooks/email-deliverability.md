# FishCount Email Deliverability Runbook

> Phase 4 ALT-08 + ALT-12 operator procedure. Run BEFORE the first production
> subscriber email is sent. Review at +24h, +7d, +14d during warm-up.

Owner: project operator (single-person team — see CLAUDE.md).
Last updated: 2026-04-29 (Phase 4 Wave 4 sign-off).

---

## OPERATOR ACTION REQUIRED

The following sections require manual operator execution that Claude cannot
automate (DNS provider login, real-mailbox checks, external scoring services,
+24h wall-clock waits):

| Section | Why Manual | Estimated Time |
|---------|------------|----------------|
| §1 DMARC TXT record | DNS provider login + 5–60 min propagation wait | 15 min + propagation |
| §2 Mail-Tester drill | Score evaluated by external service mail-tester.com | 10 min |
| §3 Real-mailbox drill | Receiving-side filtering only testable with real Gmail/iCloud/Outlook accounts | 20 min |
| §4 Warm-up day-1 production smoke | Sets `WARMUP_START_DATE` in production secrets; first batch fires on next nightly tick | 10 min + wait for tick |
| §5 First 50/day postmortem | Resend dashboard review at +24h after first batch | 10 min @ +24h |

Engineering deliverables that ARE automated (and already committed in this plan):
- `scripts/email-tester-drill.ts` — `tsx` CLI sending 4 templates via the prod Resend wrapper
- `tests/integration/alerts/warm-up-drill.test.ts` — automated 50/200/drain cap drill
- `.env.example` — every Phase 4 env var documented with comments + example value

---

## Prerequisites (one-time, before first send)

1. **Env vars set in Fly.io secrets** (NOT in `.env`; see `.env.example` for the
   full list with comments):
   - `PROJECT_SECRET` — `openssl rand -base64 32` (>= 32 chars)
   - `POSTAL_ADDRESS` — virtual mailbox / P.O. Box, deliverable, NOT operator's home address
   - `RESEND_API_KEY` — same key Phase 0 ops alerts use (send-only scope)
   - `SUBSCRIBER_FROM_EMAIL` — `alerts@fishcount.app` (or your verified subdomain)
   - `PUBLIC_BASE_URL` — `https://fishcount.app`
   - `HOT_DAY_MIN_ANGLERS` — leave at default 8 unless operator-tuned
   - `WARMUP_START_DATE` — UNSET until §4 (warm-up day 1)
2. **Resend domain verification GREEN** for `fishcount.app`:
   - SPF record present and resolving: `dig TXT fishcount.app +short | grep v=spf1`
   - DKIM record present: `dig TXT resend._domainkey.fishcount.app +short`
   - Both flags green in Resend dashboard → Domains
3. **Virtual mailbox procured** for POSTAL_ADDRESS. Real address; CAN-SPAM
   15 U.S.C. § 7704(a)(5) requires deliverability if a recipient mails it.
   Recommended: iPostal1, Anytime Mailbox, UPS Store Mail Box (≈$10–20/mo).

---

## 1. DMARC TXT record  *(OPERATOR ACTION REQUIRED)*

DMARC closes the SPF/DKIM-aligned-with-from-domain loop and is required by
Gmail/Yahoo bulk-sender rules (Feb 2024 rolling enforcement; permanent
Nov 2025+). Resend dashboard does NOT verify DMARC — the operator must do it.

**Add a TXT record to your DNS provider for the host `_dmarc.fishcount.app`:**

```
v=DMARC1; p=none; rua=mailto:dmarc-reports@fishcount.app; pct=100; adkim=s; aspf=s
```

Why `p=none` initially: observe DMARC reports for 30 days before tightening to
`p=quarantine`. `adkim=s` + `aspf=s` enforce strict alignment (sub-domains
cannot pass under a parent-domain SPF/DKIM).

**Verify (dig + mxtoolbox):**

```sh
dig TXT _dmarc.fishcount.app +short
# expected: a single quoted line matching the record above
```

Then run [mxtoolbox.com SuperTool](https://mxtoolbox.com/SuperTool.aspx) →
DMARC Lookup against `fishcount.app`. Confirm policy = `none`, alignment = strict.

**Acceptance:** dig returns the record verbatim AND mxtoolbox shows no errors.
If either fails, re-check the TXT record name (`_dmarc` not `dmarc`) and value
quoting (some DNS providers require outer quotes).

---

## 2. Mail-Tester drill  *(OPERATOR ACTION REQUIRED)*

Mail-Tester is the canonical "score this email" service. ROADMAP Phase 4
success criterion #2: score >= 9.0/10 per template.

**Run the drill:**

```sh
tsx --import ./scripts/_sveltekit-env-loader.mjs scripts/email-tester-drill.ts \
  --to <THE-MAIL-TESTER-ADDRESS>
```

The script sends all 4 templates (confirmation, hot-day, starting-to-run,
unsubscribe-success) to the address mail-tester gives you. Then visit the
score URL mail-tester provides and check each template tab.

**Per-template floor:** 9.0/10. Common deductions to remediate:

| Deduction | Cause | Fix |
|-----------|-------|-----|
| "no DMARC" | TXT record not propagated yet | Wait 5–60 min, retry |
| "List-Unsubscribe missing" | Header not set | Plan 03 send.ts — verify the wrapper sets both URI methods |
| "image without alt" | A logo image was added | UI-SPEC #9 forbids images — remove |
| "click-tracking redirect" | Resend tracking on | Plan 03 send.ts must pass `tracking: { click_tracking: false }` |
| "open-tracking pixel" | Resend tracking on | Same as above |
| "no plain-text variant" | Multipart broken | buildEmail.ts must produce both `html` and `text` |

**Acceptance:** all 4 templates >= 9.0. If any template scores < 9, remediate
BEFORE proceeding to §3.

---

## 3. Real-mailbox delivery drill  *(OPERATOR ACTION REQUIRED)*

Mail-tester scores deliverability heuristics; real mailboxes prove inbox
placement. Send to one address per provider:

- Gmail: a fresh test account (NOT operator's primary)
- iCloud: a fresh test account
- Outlook: outlook.com or live.com test account

**Run:**

```sh
tsx --import ./scripts/_sveltekit-env-loader.mjs scripts/email-tester-drill.ts --to your-test@gmail.com
tsx --import ./scripts/_sveltekit-env-loader.mjs scripts/email-tester-drill.ts --to your-test@icloud.com
tsx --import ./scripts/_sveltekit-env-loader.mjs scripts/email-tester-drill.ts --to your-test@outlook.com
```

For each test inbox, confirm:

1. Mail arrives within 5 minutes.
2. Mail lands in **Inbox** (not Spam, not Promotions, not Junk).
3. Open the email, click "Show original" (Gmail) / "Source" (Apple Mail) /
   "View source" (Outlook) — confirm:
   - `SPF: PASS`
   - `DKIM: PASS`
   - `DMARC: PASS`
4. The mail-client UI shows a one-click **Unsubscribe** link/button at the
   top (RFC 8058 List-Unsubscribe rendered).
5. The visible body shows the postal address + reason-for-receipt block.
6. Click the inline Unsubscribe link in the body — confirm `/alerts/unsubscribe`
   page renders "You're unsubscribed" without a JavaScript-required interstitial.

**Acceptance:** all 4 templates × 3 mailboxes (12 sends) all pass criteria 1–6.

---

## 4. Warm-up day-1 production smoke  *(OPERATOR ACTION REQUIRED)*

Once §1–§3 are green, set `WARMUP_START_DATE` to TODAY's date in Fly.io
secrets. The next nightly `_scrapeTick` will dispatch up to 50 alerts.

```sh
fly secrets set WARMUP_START_DATE=$(date -u +%Y-%m-%d)
```

Verify the env reached the running machine (or wait for the next deploy /
restart). The next scrape tick (23:00 PT) will run the dispatcher with
`dailyCap = 50`.

**Watch for the first batch:**

- `fly logs -a fishcount` — look for `alerts_dispatch_complete` log line.
- Resend dashboard → Emails — confirm send count <= 50.
- SQLite (or Litestream-restored copy on local):
  `SELECT COUNT(*) FROM alerts_sent WHERE status='sent' AND sent_at >= datetime('now', '-1 day')` returns <= 50.

---

## 5. First 50/day postmortem (review at +24h)  *(OPERATOR ACTION REQUIRED)*

The two halt levers are **bounce rate** and **complaint rate**. Compute each
from the Resend dashboard email counts for the trailing 24h window:
`bounce rate = bounces / total_sent`, `complaint rate = complaints / total_sent`.

Halt criteria — if ANY of these trip, set `WARMUP_START_DATE=` (unset) to halt
further sends and investigate before resuming:

| Metric | Threshold | Action if Tripped |
|--------|-----------|-------------------|
| Bounce rate | > 5% | Halt. Audit pending subscribers; remove unconfirmed > 24h. Re-check `disposable-email-domains-js` version + signup form Zod validation. |
| Complaint rate | > 0.3% | Halt. Audit confirmed subscribers; check if disposable-email-rejection silently broke. |
| List-Unsubscribe header missing on a received email | any occurrence | Halt. Plan 03 send.ts regression — re-run mail-tester drill. |
| Mail-tester score drops below 9.0 on retest | any | Halt. DNS or template regression — re-run §1 + §2. |

Otherwise, proceed to Day 8 (week 2) — cap auto-rolls to 200/day via Plan 02
`dailyCap` pure-fn (no operator action; the `WARMUP_START_DATE` anchor + today's
date determine the cap).

---

## 6. Recovery procedures

**If first production send goes to Gmail spam:**

1. STOP further sends immediately (`fly secrets unset WARMUP_START_DATE`).
2. Wait 24h. Re-run mail-tester drill from a different IP / different test inbox.
3. If still failing: SPF/DKIM/DMARC alignment issue — re-run §1 dig commands.
4. Worst case (sender reputation poisoned): switch to a fresh sending subdomain
   (e.g. `mail.fishcount.app`); update `SUBSCRIBER_FROM_EMAIL`; re-verify
   in Resend; re-run §1–§3. Cost: ~1 week.

**If complaint rate spikes mid-warmup:**

1. Halt warm-up.
2. Audit alerts_sent for the spike window — query
   `SELECT subscriber_id, kind, trigger_key, sent_at FROM alerts_sent WHERE sent_at BETWEEN ? AND ?`.
3. Identify if a single trigger key is over-firing — if so, MIN_ANGLERS / RUN_RATIO
   calibration may need tightening (see `HOT_DAY_MIN_ANGLERS` env override).
4. Manually unsubscribe the complaining recipients (Resend dashboard →
   Suppressions → Add) and document in this runbook.

**If POSTAL_ADDRESS env was set to operator's home address:**

1. STOP. Procure a virtual mailbox immediately.
2. Until corrected, the home address is rendered in every email — operator
   physical-safety risk. UI-SPEC §FLAG #10 explicitly flags this.

**If a `/alerts/confirmed` URL with a manage-purpose token leaks (browser history, screenshare, etc.):**

1. Rotate `PROJECT_SECRET` in Fly.io secrets:
   ```sh
   fly secrets set PROJECT_SECRET=$(openssl rand -base64 32)
   ```
2. All in-flight tokens (24h confirm + 30d manage + no-expiry unsubscribe) become invalid;
   in-progress users will see "This link is no longer valid" and must re-sign-up.
3. Communicate the rotation in a brief operator-facing post; honor any one-click
   unsubscribe attempts that fail by manually adding the address to `suppression_list`
   (Plan 01 DAL: `suppressionList.add(db, email, 'operator_remove')`).
4. I2 note: token-rotation is the only lever for revoking a leaked manage-link in v1.
   Hitless dual-key rotation is documented as a v2 follow-up in
   04-RESEARCH.md §"Open Questions" Q6.

---

## 7. Reference

- `CLAUDE.md` non-negotiable rule #5 — every compliance item enumerated
- `.planning/phases/04-email-alerts/04-RESEARCH.md` §"Common Pitfalls" —
  Pitfall 2 (SPF/DKIM/DMARC), 3 (List-Unsubscribe-Post one-click),
  4 (tracking pixels), 6 (PII leak via subscriber rows), 7 (queued not silently dropped)
- `.planning/phases/04-email-alerts/04-VALIDATION.md` §"Manual-Only Verifications" —
  the rows this runbook automates as drill scripts
- RFC 8058 — List-Unsubscribe-Post one-click
- [Gmail bulk-sender requirements](https://support.google.com/mail/answer/81126) (Feb 2024 / Nov 2025 enforcement)
