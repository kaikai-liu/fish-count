# First Scrape Runbook — Operator Checklist

**Phase:** 1 (Ingest + Store) — D-21 gate documentation
**Audience:** Operator (single-person project; the human holding the Fly CLI credentials)

---

## What Is FIRST_SCRAPE_OK?

`FIRST_SCRAPE_OK` is a fail-closed environment variable checked by both the nightly scheduler tick and the backfill CLI *before any outbound request is made*.

- **Default (unset or any value other than the literal string `true`):** scraping is BLOCKED. The pipeline writes `outcome='killed'` with `errorMessage='FIRST_SCRAPE_OK not set'` to the `scrape_runs` ledger and returns. Zero outbound HTTP.
- **Set to `true`:** scraping is allowed to proceed through the subsequent gates (`SCRAPER_ENABLED` kill-switch, file mutex, rate limiter, robots.txt, fetch).

Implementation: `src/lib/scraper/gate.ts::firstScrapeAllowed(env)`.

This exists because CLAUDE.md non-negotiable rule #1 (polite scraping) requires that the source-site TOS be reviewed in writing AND a courtesy outreach email be sent BEFORE the first production scrape. Those are human actions; the gate ensures a code-only deploy can't accidentally shortcut them.

---

## Pre-flight Checklist

Before flipping `FIRST_SCRAPE_OK=true` in Fly secrets, ALL of the following must be true:

- [ ] `.planning/research/TOS-REVIEW.md` has been filled in, reviewed, and signed off by the operator (ING-10).
- [ ] `.planning/research/OUTREACH-EMAIL.md` has been sent to the source-site operator (ING-11).
- [ ] At least 7 calendar days have elapsed since the email was sent, **OR** an affirmative reply has been received (whichever is sooner).
- [ ] The reply (if any) did not ask us to stop or add constraints the code doesn't currently honor. If the reply imposes new requirements (e.g. slower rate limit, specific hours), update `CONTEXT.md` and re-plan BEFORE flipping the gate.
- [ ] `SCRAPER_ENABLED` is either unset or set to anything other than `false` (the OPS-05 kill switch is independent but MUST allow scraping for the scheduler to actually tick).
- [ ] `HEALTHCHECKS_PING_URL`, `RESEND_API_KEY`, `OPERATOR_EMAIL`, `OPERATOR_FROM_EMAIL` are all set (inherited from Phase 0). Without these, a broken scrape will be silent.
- [ ] `npm run test:run` is green on the current commit.

---

## Flipping the Gate

```bash
# From the machine with `fly` CLI auth
fly secrets set FIRST_SCRAPE_OK=true --app fishcount

# Fly will restart the app automatically after a secrets set.
# Verify the new secret is visible (value is not printed, but the name is):
fly secrets list --app fishcount | grep FIRST_SCRAPE_OK
```

After the restart, the next 23:00 PT nightly tick will scrape the current date.

To run the historical backfill from the local dev machine (recommended for the initial run, so output is visible in your terminal):

```bash
# Export the same env vars the Fly app uses — but point DB_PATH at a
# staging file if you want to validate without touching prod, OR hit the
# actual /data path via `fly ssh console` and run inside the app:
FIRST_SCRAPE_OK=true \
SCRAPER_ENABLED=true \
DB_PATH=/data/fishcount.sqlite3 \
SNAPSHOT_DIR=/data/snapshots \
SCRAPE_LOCK_PATH=/data/scrape.lock \
npm run backfill -- --from 2009-06-15 --to $(date +%Y-%m-%d)
```

Expected duration: ~(today - 2009-06-15) × 5 seconds = ~24 hours for the full backfill. Use a tmux session or `nohup` so ssh disconnect doesn't abort. The D-12 resume logic means you can rerun after any interrupt and it picks up where it left off.

---

## Rollback

If something goes wrong (rate limit accidentally bypassed, source-site operator reports a problem, data looks corrupted):

```bash
# Immediate halt — the OPS-05 kill switch
fly secrets set SCRAPER_ENABLED=false --app fishcount

# OR remove the FIRST_SCRAPE_OK gate entirely
fly secrets unset FIRST_SCRAPE_OK --app fishcount
```

Either command stops the next tick. Both are safe to set simultaneously.

Post-rollback:
- Check `scrape_runs` in the DB for the date range of concern: look at `outcome` distribution and `error_message` fields.
- The OPS-04 dead-man's switch will fire a healthchecks.io alert 36h after the last successful tick — acknowledge or resolve in healthchecks.io while the issue is being fixed to avoid alert fatigue.
- If the source-site operator has complained: reply to their email ASAP, delete any locally-stored snapshots they object to (unlikely but possible), and re-plan before re-enabling.

---

## Related Artifacts

- `.planning/research/TOS-REVIEW.md` — the TOS review template (ING-10)
- `.planning/research/OUTREACH-EMAIL.md` — the outreach email draft (ING-11)
- `src/lib/scraper/gate.ts` — the code-level gate
- `src/lib/server/scheduler.ts::_scrapeTick` — the consumer
- `scripts/backfill.ts` — the CLI consumer
