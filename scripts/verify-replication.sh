#!/bin/bash
# scripts/verify-replication.sh
# Verifies OPS-03 Success Criterion 4: SQLite file observably replicated.
# Implements the Check A + Check B procedure from 00-RESEARCH.md §Q4.
# Runs against a deployed Fly machine; requires flyctl + b2 CLI.
set -euo pipefail

: "${APP_NAME:=fishcount}"
: "${BUCKET:=fishcount-backup}"

MARKER="verify-replication-$(date +%s)"

echo "[1/4] Writing replication-probe row with marker=$MARKER to deployed app"
# Phase 1: the Phase 0 scaffolding table was removed when the real DAL shipped.
# This script now creates and writes to a dedicated replication_probe table
# that lives alongside the real schema purely for operational checks.
fly ssh console -a "$APP_NAME" -C "node -e \"const Database=require('better-sqlite3'); const db=new Database('/data/fishcount.sqlite3'); db.pragma('journal_mode = WAL'); db.exec(\\\"CREATE TABLE IF NOT EXISTS replication_probe (id INTEGER PRIMARY KEY AUTOINCREMENT, marker TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))\\\"); db.prepare('INSERT INTO replication_probe(marker) VALUES(?)').run('$MARKER'); console.log('wrote', '$MARKER');\""

echo "[2/4] Waiting 20 seconds for Litestream to flush (sync-interval default is 1s; allow margin)"
sleep 20

echo "[3/4] Check A — Litestream status from the Fly machine:"
REPLICAS_OUTPUT=$(fly ssh console -a "$APP_NAME" -C "litestream replicas -config /etc/litestream.yml")
echo "$REPLICAS_OUTPUT"

# CR-01 guard: confirm env templates expanded (catches `${VAR}` / `{{ env }}` regression).
# If the output contains a literal `${` or `{{` substring, Litestream did not expand the
# template — replication is broken and B2 auth will silently fail (see 00-REVIEW.md §CR-01).
if echo "$REPLICAS_OUTPUT" | grep -qE '\$\{|\{\{'; then
  echo "FAIL: Litestream config template did not expand — replication is broken."
  echo "      Expected {{ env \"VAR\" }} references to be substituted from Fly secrets."
  echo "      Check: fly secrets list -a $APP_NAME"
  exit 1
fi
if ! echo "$REPLICAS_OUTPUT" | grep -q .; then
  echo "FAIL: Litestream reported no replicas — config parse error or missing DB."
  exit 1
fi

echo "[4/4] Check B — Backblaze B2 bucket listing:"
if command -v b2 >/dev/null 2>&1; then
  b2 ls "b2://${BUCKET}/fishcount.sqlite3/" | tail -20
  echo ""
  echo "PASS if the listing above shows generations/<id>/wal/ files with mtimes in the last few minutes."
else
  echo "[SKIP] b2 CLI not installed. Install via: brew install b2-tools"
  echo "Alternatively, check the B2 web console at https://secure.backblaze.com/b2_buckets.htm"
fi

echo ""
echo "Verification marker written: $MARKER"
echo "Log this marker into the Phase 0 verification artifact for traceability."
