# Dead-Man's Switch Runbook (OPS-04)

FishCount uses healthchecks.io as an external absence-detector. The scheduler's heartbeat tick pings a check URL on each successful tick. If pings stop for longer than the grace period, healthchecks.io sends the operator a native email.

**Why external, not self-polling:** A self-polling check cannot fire when the whole machine is dead. Absence detection requires an external witness. See 00-RESEARCH.md §Q2 for the full comparison.

## Setup (done once)

1. Create a free account at https://healthchecks.io/.
2. Create a check named `FishCount nightly scrape`.
3. Schedule:
   - **Production (Phase 1 onward):** period 1 day, grace 36 hours, timezone America/Los_Angeles
   - **Phase 0 stub testing:** period 1 minute, grace 5 minutes (heartbeat ticks every minute)
4. Add an email integration → operator email address. Verify the email by responding to the confirmation.
5. Copy the ping URL from the check detail page. Format: `https://hc-ping.com/<uuid>`.
6. Treat this URL as a secret — anyone who has it can silence the alert by pinging it.
7. Store on Fly: `fly secrets set -a fishcount HEALTHCHECKS_PING_URL=https://hc-ping.com/<uuid>`.

## Grace period rules (from 00-RESEARCH.md §Pitfall 6)

Grace = 1.5× the scrape interval minimum. Examples:
- Daily scrape at 03:00 PT → grace 36h (= 1.5 × 24h).
- Hourly scrape → grace 1.5h.
- Phase 0 stub heartbeat (1 min) → grace 5 min.

If you tighten grace below 1.5×, platform hiccups (a 10-min Fly restart, a DST skip) will false-positive the alert.

## Email receipt

Alert source: **healthchecks.io** (NOT Resend). This is deliberate — Resend is used for operator billing alerts (OPS-01); the dead-man's switch must NOT depend on the same channel it's meant to alert about.

Alert subject format: `FishCount nightly scrape is DOWN` (or similar — see healthchecks.io templates).

## Verification drill

Run `scripts/dead-mans-switch-drill.sh` at least once before Phase 0 exit, then quarterly. The drill:

1. Captures the current ping URL secret (to restore after).
2. Unsets the secret → next tick stops pinging.
3. Waits 7 minutes (5-min grace + 2-min margin).
4. Prompts the operator to confirm email receipt.
5. Prompts for and restores the ping URL secret.

## Grace period tuning

Before running Plan 06 verification, set grace=5 min on the healthchecks.io dashboard to accelerate the drill. After the drill passes, restore grace=36h and period=1 day for production.

## When the alert fires for real

Likely causes (ordered by frequency):
1. Fly machine down (check `fly status -a fishcount`).
2. Scheduler crashed inside Node (check `fly logs -a fishcount` for errors).
3. Kill switch was set (`fly secrets list -a fishcount | grep SCRAPER_ENABLED` — if `false`, the halt is intentional; the alert is a reminder to flip it back on).
4. Egress to `hc-ping.com` blocked (unlikely on Fly, but possible).
5. Phase 1+ scraper is crashing inside the try/catch (check `heartbeat tick failed` log lines).

## Silencing during planned maintenance

On the healthchecks.io dashboard, pause the check before starting work and resume after. Do NOT unset the Fly secret — that requires a machine restart, which is itself a change you're trying to avoid during maintenance.
