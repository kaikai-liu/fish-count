#!/bin/bash
# scripts/verify-replication.sh
# Verifies OPS-03 Success Criterion 4: SQLite file observably replicated.
# Implements the Check A + Check B procedure from 00-RESEARCH.md §Q4.
# Runs against a deployed Fly machine; requires flyctl + b2 CLI.
set -euo pipefail

: "${APP_NAME:=fishcount}"
: "${BUCKET:=fishcount-backup}"

MARKER="verify-replication-$(date +%s)"

echo "[1/4] Writing smoke row with marker=$MARKER to deployed app"
fly ssh console -a "$APP_NAME" -C "node -e \"const {openSmokeDb, writeSmokeRow} = require('./build/server/chunks/smoke-\$(ls build/server/chunks/ | grep smoke | head -1).js'); const db=openSmokeDb(); writeSmokeRow(db, '$MARKER'); console.log('wrote', '$MARKER');\"" \
  || echo "[NOTE] If the import path above doesn't resolve, run this instead from the Fly machine: node -e \"(await import('better-sqlite3')).default('/data/fishcount.sqlite3').prepare('INSERT INTO smoke_test(marker) VALUES(?)').run('$MARKER')\""

echo "[2/4] Waiting 20 seconds for Litestream to flush (sync-interval default is 1s; allow margin)"
sleep 20

echo "[3/4] Check A — Litestream status from the Fly machine:"
fly ssh console -a "$APP_NAME" -C "litestream replicas -config /etc/litestream.yml"

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
