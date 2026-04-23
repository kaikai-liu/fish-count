#!/bin/bash
# scripts/restore-drill.sh
# DESTRUCTIVE: deletes /data/fishcount.sqlite3 on the deployed Fly machine,
# restarts the machine, and verifies Litestream restores the DB from B2.
# Implements the restore drill from 00-RESEARCH.md §Q4 lines 441–451.
# REQUIRES OPERATOR ACK.
set -euo pipefail

: "${APP_NAME:=fishcount}"

echo "!! DESTRUCTIVE OPERATION — this will delete /data/fishcount.sqlite3 on $APP_NAME !!"
read -r -p "Type 'yes' to continue: " ACK
if [ "$ACK" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

MARKER="restore-drill-$(date +%s)"

echo "[1/5] Write a known row (marker=$MARKER) and record current row count"
fly ssh console -a "$APP_NAME" -C "node -e \"const Database=require('better-sqlite3'); const db=new Database('/data/fishcount.sqlite3'); db.exec('CREATE TABLE IF NOT EXISTS smoke_test (id INTEGER PRIMARY KEY AUTOINCREMENT, marker TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime(\\\\'now\\\\')))'); db.prepare('INSERT INTO smoke_test(marker) VALUES(?)').run('$MARKER'); console.log('count_before=' + db.prepare('SELECT COUNT(*) as c FROM smoke_test').get().c);\""

echo "[2/5] Wait 20s for Litestream to flush"
sleep 20

echo "[3/5] Delete /data/fishcount.sqlite3 (and WAL + SHM siblings)"
fly ssh console -a "$APP_NAME" -C "rm -f /data/fishcount.sqlite3 /data/fishcount.sqlite3-wal /data/fishcount.sqlite3-shm"

echo "[4/5] Restart the machine — entrypoint should restore from B2"
fly machine restart -a "$APP_NAME" --select

echo "[5/5] Wait 30s for restart, then verify marker is present after restore"
sleep 30
fly ssh console -a "$APP_NAME" -C "node -e \"const Database=require('better-sqlite3'); const db=new Database('/data/fishcount.sqlite3'); console.log('count_after=' + db.prepare('SELECT COUNT(*) as c FROM smoke_test').get().c); console.log('marker_present=' + (db.prepare('SELECT 1 FROM smoke_test WHERE marker=?').get('$MARKER') ? 'yes' : 'no'));\""

echo ""
echo "PASS if count_after >= count_before AND marker_present=yes."
echo "FAIL means Litestream replication is theater — investigate before Phase 1."
