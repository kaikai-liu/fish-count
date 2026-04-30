---
status: partial
phase: 01-ingest-store
source: [01-VERIFICATION.md]
started: 2026-04-24T09:25:00-07:00
updated: 2026-04-24T09:25:00-07:00
---

## Current Test

[awaiting operator action]

## Tests

### 1. TOS review artifact completed
expected: Operator reads sandiegofishreports.com Terms of Service + robots.txt, fills in all 7 sections of `.planning/research/TOS-REVIEW.md` with excerpts + summary + signature
result: [pending]

### 2. Courtesy outreach email sent
expected: Operator sends the draft from `.planning/research/OUTREACH-EMAIL.md` via personal email to source-site operator; records send date
result: [pending]

### 3. FIRST_SCRAPE_OK Fly secret flipped
expected: After items 1-2 complete AND (7-day wait elapsed OR reply received), operator runs `fly secrets set FIRST_SCRAPE_OK=true --app fishcount`
result: [pending]

### 4. Live-scrape polite-rate + resume behavioral proof
expected: After FIRST_SCRAPE_OK is true, operator runs `npm run backfill -- --from <recent-date> --to <recent-date+2>` against live source, verifies: outbound rate ≤ 12 req/min in logs, force-kill mid-run then re-run with same args resumes from last incomplete date (zero refetches of success/empty dates)
result: [pending]

### 5. Litestream replication post-first-scrape
expected: After first live scrape, verify Litestream has replicated the new `boats/landings/catch_reports/scrape_runs/parse_failures` tables + `/data/snapshots/YYYY/MM/DD.html.gz` files to B2; restore-drill returns the expected row count
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
