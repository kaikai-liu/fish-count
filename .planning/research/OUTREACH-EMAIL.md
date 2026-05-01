# Courtesy Outreach Email — Source Site Operator

**Phase:** 1 (Ingest + Store) — ING-11 deliverable
**Gate:** This email MUST be sent before `FIRST_SCRAPE_OK=true` is set in Fly secrets.
**Sent date:** 2026-05-01
**Recipient:** sandiegofishreports.com site operator
**Reply received:** pending — proceeding under presumed permissive consent (no TOS, permissive robots.txt; will halt if reply asks us to)

---

## Draft Email

**To:** {operator_contact_email}
**From:** liukk1211@gmail.com
**Subject:** Courtesy heads-up: San Diego angler project reading your dock totals page

Hi {operator_name},

I'm a San Diego recreational angler building a small hobby project called FishCount that summarizes dock-total counts into more useful views for fellow anglers — things like "which boat had the best yellowtail odds this week on 3/4 Day trips." The primary audience is a handful of friends, not a public launch.

FishCount reads `sandiegofishreports.com/dock_totals/boats.php?date=YYYY-MM-DD` and nothing else from your site. I wanted to give you a heads-up proactively before I start a historical backfill, because I respect that this is your work and your bandwidth.

Concretely:

- **Rate limit:** FishCount sends at most one HTTP request per 5 seconds, shared between the nightly incremental scrape and any backfill — so even during the initial historical load, outbound traffic is ≤ 17,280 requests per day to your site, and in steady state it's one request per day.
- **User-Agent:** `FishCountBot/0.1 (+https://github.com/kaikai/fish-count; contact: liukk1211@gmail.com)` — your logs will see that string with a contact email you can reach me at.
- **robots.txt:** honored. (Your current `robots.txt` has an empty `Disallow:`, so all paths are allowed — if that changes, FishCount will honor the new rules within 24 hours.)
- **Attribution:** every data row FishCount displays links back to the corresponding page on your site.

If any of this gives you concern, or you'd prefer I stop entirely, please reply and I'll halt immediately. I can also reduce frequency, skip specific date ranges, or scrape from cached HTML I've stored locally if you'd prefer zero ongoing load once I have the historical backfill done.

Thank you for running such a valuable resource for the San Diego angler community — this project would not be possible without it.

Best,
{operator_name}
liukk1211@gmail.com
https://github.com/kaikai/fish-count

---

## Operator Notes

- **Send via:** Gmail or similar personal email client. NOT Resend (the Resend sender domain is reserved for transactional operator alerts).
- **Wait period before flipping FIRST_SCRAPE_OK:** at least 7 calendar days from send date, OR an affirmative reply (whichever is sooner).
- **If the operator replies with concerns:** pause the plan to flip FIRST_SCRAPE_OK; update CONTEXT.md with the operator's requested constraints and re-plan.
- **If the email bounces:** try the "contact us" form on the site. If both fail, document the attempts in this file before flipping the gate.
