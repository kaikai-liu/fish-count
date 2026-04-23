# Litestream Runbook (OPS-03)

FishCount replicates its SQLite database continuously from the Fly volume at `/data/fishcount.sqlite3` to a Backblaze B2 bucket. Litestream runs as PID 1 inside the container, supervising Node.

## Prerequisites

- `flyctl` installed and authenticated
- `b2` CLI installed and authenticated (optional, for manual bucket inspection): `brew install b2-tools`
- Fly secrets set (see `.env.example`):
  - `LITESTREAM_ACCESS_KEY_ID`
  - `LITESTREAM_SECRET_ACCESS_KEY`
  - `LITESTREAM_BUCKET`
  - `LITESTREAM_ENDPOINT`

## Daily-ish checks

### Is replication running?

```
fly ssh console -a fishcount -C "litestream replicas -config /etc/litestream.yml"
```

Expected: one replica listed with a recent `last sync` timestamp (within the last few minutes).

### Are bytes actually in B2?

```
b2 ls b2://fishcount-backup/fishcount.sqlite3/
```

Expected: a `generations/<id>/` prefix with `wal/` files having recent mtimes.

## Verification scripts

- `scripts/verify-replication.sh` — writes a known row, waits, checks both sides. Safe to re-run.
- `scripts/restore-drill.sh` — DESTRUCTIVE — deletes the DB and confirms restore works. Run at least once before Phase 1 exit; repeat quarterly.

## Disaster recovery

If `/data/fishcount.sqlite3` is corrupted or the volume is lost:

1. (If volume still exists) `rm /data/fishcount.sqlite3*` on the machine.
2. `fly machine restart -a fishcount` — entrypoint.sh runs `litestream restore` automatically.
3. Verify row counts against the last-known-good logs.

If the replica itself is compromised (bucket deleted, keys leaked):

1. Rotate the B2 application key immediately.
2. `fly secrets set LITESTREAM_ACCESS_KEY_ID=... LITESTREAM_SECRET_ACCESS_KEY=...`
3. The running app continues replicating under the new keys on the next machine restart.
4. Accept that the window between the last good snapshot and now is lost if the bucket was destroyed.

## Known landmines

- **Missing `-if-replica-exists` on first boot = crash loop.** Already handled in `scripts/entrypoint.sh`. Do not edit the restore line without re-reading Pitfall 1 in 00-RESEARCH.md.
- **B2 application key scoped too broadly.** Always scope the key to the single `fishcount-backup` bucket, never to the whole account.
- **Retention and snapshot settings.** `retention: 720h` (30 days of WAL) and `snapshot-interval: 24h` (daily full snapshot) are chosen for Phase 0. Phase 1's backfill ingestion may require bumping snapshot interval down to 6h if writes become heavier.

## Known risk (documented, not mitigated in Phase 0)

The sync-interval default is 1s. A hard machine crash in that 1s window can lose the last second of writes on restore. Phase 1 will add `litestream wait -path $DB_PATH` after critical scrape writes to narrow this to ~0s. Phase 0 accepts <1s potential loss (00-RESEARCH.md §Pitfall 3).
