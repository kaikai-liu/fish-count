# TOS Review — sandiegofishreports.com

**Phase:** 1 (Ingest + Store) — ING-10 deliverable
**Gate:** This document MUST be completed before `FIRST_SCRAPE_OK=true` is set in Fly secrets.
**Reviewer:** {operator_name}
**Date reviewed:** {YYYY-MM-DD}

---

## Source Site

- **URL:** https://www.sandiegofishreports.com
- **Primary page we scrape:** https://www.sandiegofishreports.com/dock_totals/boats.php
- **Date parameter:** `?date=YYYY-MM-DD`
- **Historical depth confirmed:** 2009-06-15 onward (verified via live probe 2026-04-23)

---

## Terms of Service Summary

{Operator: read the TOS linked from the site footer. Summarize the key clauses here in 3+ sentences. Specifically address:
- Is automated access permitted?
- Are there rate-limit requirements stated?
- Is attribution required?
- Is there a prohibition on republishing / derivative works?}

**Link to TOS as of review date:** {paste URL}

**Verbatim excerpt relevant to scraping:**

> {paste the 1–3 sentences most relevant to automated access here}

---

## robots.txt State

**URL:** https://www.sandiegofishreports.com/robots.txt

**State as of 2026-04-23 (live probe during Phase 1 research):**
```
User-agent: *
Disallow:
```
(Empty `Disallow:` → all paths allowed for all user-agents.)

**State as of review date ({YYYY-MM-DD}):**

> {paste current robots.txt content verbatim}

**Interpretation:** {still permissive / new restrictions added / check what changed}

---

## Scraping Activity Permitted

Based on the TOS + robots.txt review above:

- [ ] Scraping `/dock_totals/boats.php?date=YYYY-MM-DD` is permitted
- [ ] Historical backfill (multiple sequential date requests) is permitted
- [ ] Re-scraping the same date (idempotency) is permitted
- [ ] Storing the raw HTML snapshots locally is permitted
- [ ] Redistributing parsed data with attribution is permitted

If ANY box above is unchecked, DO NOT flip FIRST_SCRAPE_OK. Escalate to outreach first.

---

## Rate Limit Commitment

FishCount enforces the following limits (per CLAUDE.md non-negotiable rule #1):

- **Global rate limit:** ≤ 1 outbound HTTP request per 5 seconds, shared between backfill CLI and nightly scheduled scrape (enforced by `src/lib/scraper/rate-limiter.ts` + cross-process file mutex at `/data/scrape.lock`).
- **User-Agent:** `FishCountBot/0.1 (+https://github.com/kaikai/fish-count; contact: liukk1211@gmail.com)` — contains a contact URL and contact email (per ING-02).
- **robots.txt:** honored, cached 24h per host.
- **Scheduled cadence:** one fetch per 24h (nightly at 23:00 America/Los_Angeles — just one page per tick).

---

## Attribution Plan

- Every data row rendered in the Phase 2 UI will link back to the corresponding source-site page (BRW-02).
- The "About the data" page (BRW-09) will name the source site prominently.
- The Phase 2 trip-picker + boat-detail pages include "source" attribution for every per-angler number.

---

## Sign-off

- [ ] TOS reviewed and summarized above
- [ ] robots.txt verified (re-checked on review date, not trusting cached 2026-04-23 state)
- [ ] No clause prohibits our planned activity
- [ ] Rate limit + UA + attribution commitments are in place in the Phase 1 codebase

**Reviewer signature:** {operator_name}
**Date:** {YYYY-MM-DD}
