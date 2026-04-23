#!/bin/bash
# Source: https://github.com/fspoettel/linkding-on-fly/blob/master/scripts/run.sh
# Verified pattern per 00-RESEARCH.md §Q4, §Pitfall 1
set -euo pipefail

: "${DB_PATH:=/data/fishcount.sqlite3}"

# Restore from replica if DB is missing.
# -if-db-not-exists: succeed if DB already exists (idempotent)
# -if-replica-exists: succeed if no replica exists (first-boot safe)
echo "[boot] checking if restore is needed for $DB_PATH"
litestream restore -if-db-not-exists -if-replica-exists -config /etc/litestream.yml "$DB_PATH"

echo "[boot] starting Litestream supervising Node"
# Litestream becomes PID 1. It starts replication, then exec's the Node app.
# When Node exits, Litestream flushes and exits.
exec litestream replicate -config /etc/litestream.yml -exec "node build/index.js"
