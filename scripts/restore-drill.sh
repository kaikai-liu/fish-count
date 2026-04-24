#!/bin/bash
# scripts/restore-drill.sh
# DESTRUCTIVE: deletes /data/fishcount.sqlite3 on the deployed Fly machine,
# restarts the machine, and verifies Litestream restores the DB from B2.
# Implements the restore drill from 00-RESEARCH.md §Q4 lines 441–451.
# REQUIRES OPERATOR ACK.
#
# WR-05 refactor: the previous version inlined JS into `fly ssh console -C`
# with nested `\\\\'` escapes to smuggle a single quote through bash → ssh → JS.
# That pattern is brittle (any change to the marker with a quote or newline
# breaks it, potentially as an injection) and unmaintainable. We now heredoc
# JS into a temp file on the Fly machine via stdin and execute it, with the
# marker passed as a plain argv string — no escaping layer at all.
set -euo pipefail

: "${APP_NAME:=fishcount}"

echo "!! DESTRUCTIVE OPERATION — this will delete /data/fishcount.sqlite3 on $APP_NAME !!"
read -r -p "Type 'yes' to continue: " ACK
if [ "$ACK" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

MARKER="restore-drill-$(date +%s)"

# WR-05: ship the JS helper to the Fly machine once. `fly ssh console` with no
# -C flag accepts stdin as a shell session; we `cat > /tmp/drill.js` via a
# heredoc. Single-quoted heredoc tag prevents any local expansion of $ inside
# the JS body — the marker is only substituted into the separate runner call
# as process.argv[2], never into the JS source.
echo "[1/5] Uploading drill helper to /tmp/drill.js on $APP_NAME"
fly ssh console -a "$APP_NAME" <<'REMOTE_SH'
cat > /tmp/drill.js <<'DRILL_JS'
const Database = require('better-sqlite3');
const db = new Database('/data/fishcount.sqlite3');
// Dedicated probe table for operational restore-drill checks (Phase 1+). Kept
// self-contained so the drill never depends on the real DAL schema — replication
// is an infrastructure property, not an application one.
// See WR-05 follow-up (IN-01 "drill-helper.mjs in image" is the real fix).
db.exec(
  "CREATE TABLE IF NOT EXISTS replication_probe (id INTEGER PRIMARY KEY AUTOINCREMENT, marker TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))"
);
const mode = process.argv[2];
const marker = process.argv[3];
if (mode === 'write') {
  db.prepare('INSERT INTO replication_probe(marker) VALUES(?)').run(marker);
  console.log('count_before=' + db.prepare('SELECT COUNT(*) as c FROM replication_probe').get().c);
} else if (mode === 'verify') {
  console.log('count_after=' + db.prepare('SELECT COUNT(*) as c FROM replication_probe').get().c);
  const row = db.prepare('SELECT 1 FROM replication_probe WHERE marker=?').get(marker);
  console.log('marker_present=' + (row ? 'yes' : 'no'));
} else {
  console.error('unknown mode: ' + mode);
  process.exit(2);
}
DRILL_JS
echo '[upload] /tmp/drill.js written'
REMOTE_SH

echo "[2/5] Write a known row (marker=$MARKER) and record current row count"
# $MARKER goes through a single layer of double-quoted shell expansion into
# `node` argv — no JS string interpolation, no escaping layer.
fly ssh console -a "$APP_NAME" -C "node /tmp/drill.js write $MARKER"

echo "[3/5] Wait 20s for Litestream to flush, then delete /data/fishcount.sqlite3 + WAL/SHM"
sleep 20
fly ssh console -a "$APP_NAME" -C "rm -f /data/fishcount.sqlite3 /data/fishcount.sqlite3-wal /data/fishcount.sqlite3-shm"

echo "[4/5] Restart the machine — entrypoint should restore from B2"
fly machine restart -a "$APP_NAME" --select

echo "[5/5] Wait 30s for restart, then verify marker is present after restore"
sleep 30
# drill.js survives in /tmp on the same machine (tmpfs is per-machine, not per-
# process). If the machine was fully replaced, re-upload and re-run verify.
fly ssh console -a "$APP_NAME" -C "node /tmp/drill.js verify $MARKER" \
  || {
    echo "[5/5] drill.js not found after restart — re-uploading and retrying"
    fly ssh console -a "$APP_NAME" <<'REMOTE_SH_RETRY'
cat > /tmp/drill.js <<'DRILL_JS'
const Database = require('better-sqlite3');
const db = new Database('/data/fishcount.sqlite3');
db.exec(
  "CREATE TABLE IF NOT EXISTS replication_probe (id INTEGER PRIMARY KEY AUTOINCREMENT, marker TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))"
);
const mode = process.argv[2];
const marker = process.argv[3];
if (mode === 'verify') {
  console.log('count_after=' + db.prepare('SELECT COUNT(*) as c FROM replication_probe').get().c);
  const row = db.prepare('SELECT 1 FROM replication_probe WHERE marker=?').get(marker);
  console.log('marker_present=' + (row ? 'yes' : 'no'));
}
DRILL_JS
REMOTE_SH_RETRY
    fly ssh console -a "$APP_NAME" -C "node /tmp/drill.js verify $MARKER"
  }

echo ""
echo "PASS if count_after >= count_before AND marker_present=yes."
echo "FAIL means Litestream replication is theater — investigate before Phase 1."
