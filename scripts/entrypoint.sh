#!/bin/bash
# Plan 00 (scaffold) entrypoint.
# Plan 01 (Litestream, OPS-03) replaces this with:
#   litestream restore -if-db-not-exists -if-replica-exists -config /etc/litestream.yml "$DB_PATH"
#   exec litestream replicate -config /etc/litestream.yml -exec "node build/index.js"
set -euo pipefail

: "${DB_PATH:=/data/fishcount.sqlite3}"

echo "[boot] fishcount starting (scaffold entrypoint — Litestream not yet wired)"
exec node build/index.js
