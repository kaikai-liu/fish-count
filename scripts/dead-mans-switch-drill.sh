#!/bin/bash
# scripts/dead-mans-switch-drill.sh
# Verifies OPS-04 Success Criterion 2: >36h silence fires alert.
# Adapted to a short grace (5 min) for drill purposes — see 00-VALIDATION.md.
# After drill, restores the original HEALTHCHECKS_PING_URL.
# REQUIRES operator ack + operator email access to confirm receipt.
set -euo pipefail

: "${APP_NAME:=fishcount}"

echo "== OPS-04 Dead-Man's Switch Drill =="
echo ""
echo "This drill temporarily removes the HEALTHCHECKS_PING_URL from $APP_NAME,"
echo "waits for the configured grace period, and confirms the alert email arrives."
echo ""
echo "PREREQ: On https://healthchecks.io, set the 'FishCount nightly scrape'"
echo "check's grace period to 5 minutes and period to 1 minute for this drill."
echo "After the drill, restore grace=36h and period=1 day."
echo ""
read -r -p "Grace period set to 5 min on healthchecks.io dashboard? Type 'yes' to continue: " ACK
if [ "$ACK" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo ""
echo "[1/5] Capturing current HEALTHCHECKS_PING_URL (for restore later)"
CURRENT_URL=$(fly secrets list -a "$APP_NAME" | grep HEALTHCHECKS_PING_URL || true)
if [ -z "$CURRENT_URL" ]; then
  echo "WARN: HEALTHCHECKS_PING_URL not currently set. Drill cannot simulate outage."
  echo "Set it first: fly secrets set -a $APP_NAME HEALTHCHECKS_PING_URL=https://hc-ping.com/<uuid>"
  exit 1
fi
echo "Captured digest (value hidden): $CURRENT_URL"

echo ""
echo "[2/5] Unsetting HEALTHCHECKS_PING_URL — next tick will stop pinging"
fly secrets unset -a "$APP_NAME" HEALTHCHECKS_PING_URL

echo "[3/5] Waiting 7 minutes (5 min grace + 2 min margin) for alert to fire"
for i in $(seq 1 7); do
  echo "  ...minute $i/7"
  sleep 60
done

echo ""
echo "[4/5] CHECK YOUR EMAIL NOW"
echo "   - Expected sender: healthchecks.io (NOT Resend)"
echo "   - Expected subject: contains 'FishCount nightly scrape' and 'DOWN' / 'is down'"
read -r -p "   Did the alert email arrive? Type 'yes' or 'no': " GOT_EMAIL

echo ""
echo "[5/5] Restoring HEALTHCHECKS_PING_URL"
echo "   Enter the original ping URL (format: https://hc-ping.com/<uuid>)"
read -r -p "   URL: " RESTORE_URL
if [[ "$RESTORE_URL" == https://hc-ping.com/* ]]; then
  fly secrets set -a "$APP_NAME" HEALTHCHECKS_PING_URL="$RESTORE_URL"
  echo "   Secret restored. Machine will restart momentarily; next tick will ping again."
else
  echo "   URL format invalid. You must manually restore: fly secrets set -a $APP_NAME HEALTHCHECKS_PING_URL=<url>"
  exit 1
fi

echo ""
if [ "$GOT_EMAIL" = "yes" ]; then
  echo "PASS: OPS-04 dead-man's switch verified end-to-end."
else
  echo "FAIL: No email received within grace + margin. Investigate:"
  echo "  - Is the healthchecks.io check configured with an email integration?"
  echo "  - Is the grace period actually 5 minutes? (Dashboard → Check → Schedule)"
  echo "  - Check healthchecks.io activity log for the check."
  exit 2
fi

echo ""
echo "REMEMBER: restore grace=36h and period=1 day on healthchecks.io dashboard!"
