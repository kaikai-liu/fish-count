---
status: partial
phase: 04-email-alerts
source: [04-VERIFICATION.md, 04-VALIDATION.md]
started: 2026-04-29T21:15:00Z
updated: 2026-04-29T21:15:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. DMARC TXT record resolves and policy is observed
expected: `dig TXT _dmarc.fishcount.app +short` returns the v=DMARC1 record verbatim and mxtoolbox.com SuperTool DMARC Lookup against fishcount.app shows policy=none/quarantine with strict alignment.
result: [pending]
runbook: docs/runbooks/email-deliverability.md §1

### 2. SPF + DKIM + DMARC all PASS via Gmail show-original on a real send
expected: Gmail's show-original on each of the 4 templates lists SPF=PASS, DKIM=PASS, DMARC=PASS in the authentication-results header. mxtoolbox SPF/DKIM/DMARC lookups all green.
result: [pending]
runbook: docs/runbooks/email-deliverability.md §1–§3

### 3. Mail-Tester score >= 9.0/10 per template (4 sends)
expected: Each of confirmation, hot-day, starting-to-run, unsubscribe-success scores ≥ 9.0/10 via mail-tester.com; any deduction <0.5 is documented; any deduction ≥0.5 triggers the §2 remediation table.
result: [pending]
runbook: docs/runbooks/email-deliverability.md §2
drill: `tsx scripts/email-tester-drill.ts --to <mail-tester-address> --templates all`

### 4. Real-mailbox deliverability test (Gmail + iCloud + Outlook) for all 4 templates
expected: Each template arrives in the inbox (not spam), the One-Click Unsubscribe link is rendered by the mail client UI (List-Unsubscribe header honored), and the visible unsubscribe link in the email body is clickable. Per the 7-check inbox checklist in §3.
result: [pending]
runbook: docs/runbooks/email-deliverability.md §3

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
