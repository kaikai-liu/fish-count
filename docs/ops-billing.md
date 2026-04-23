# Billing Watcher Runbook (OPS-01)

Fly.io has no native billing alerts (see 00-RESEARCH.md §Q3 and [Fly docs](https://fly.io/docs/about/cost-management/)). FishCount ships a DIY watcher that runs in GitHub Actions weekly, queries Fly's GraphQL API for month-to-date spend, and emails the operator via Resend when a $20/$50/$100 threshold is crossed.

## Why GitHub Actions, not in-app cron

Separation of fate — an in-app watcher would share a failure domain with the Fly app itself. If the app is what's running up the bill (scraper loop gone wrong, egress spike), we cannot trust an in-app watcher to alert us; the separation of fate between GitHub Actions cron and the Fly runtime is the whole point. GH Actions cron lives outside Fly.

## Schedule

Monday 16:00 UTC (09:00 PST / 08:00 PDT). Weekly is enough — spend can't go from $0 to $100 in under a day on a shared-cpu-1x app. DST drift (1h) is benign.

## State persistence

`.billing-alerts-state.json` is committed back to the repo each run (workflow has `contents: write` permission). Shape:

```json
{
  "month": "2026-04",
  "thresholds": { "20": false, "50": false, "100": false }
}
```

When the month rolls over, state auto-resets so thresholds can re-alert in the new month.

## Testing via BILLING_TEST_SPEND

Plan 06 verifies OPS-01 end-to-end using a simulated spend:

1. Go to GitHub repo → Actions → Billing Check → Run workflow → test_spend: `20.01`.
2. Wait for run to complete (~30 seconds).
3. Confirm operator email arrives with subject `[FishCount ops] Fly.io spend crossed $20`.
4. Pull latest — `.billing-alerts-state.json` should now have `"20": true`.
5. Re-run with `test_spend: 20.01` — verify NO second email (idempotent).
6. Manually reset state to test again: edit file, set `"20": false`, commit, re-run.

## Required GH repo secrets

| Secret                | Source                                                                                |
| --------------------- | ------------------------------------------------------------------------------------- |
| `FLY_API_TOKEN`       | `fly tokens create deploy` (or user personal access token). Rotate annually.          |
| `FLY_ORG_SLUG`        | `personal` for personal accounts; find via `fly orgs list`.                           |
| `RESEND_API_KEY`      | Resend dashboard → API Keys. Same key used elsewhere in Phase 0.                      |
| `OPERATOR_EMAIL`      | Your personal inbox (alert recipient).                                                |
| `OPERATOR_FROM_EMAIL` | Verified sender on your Resend-verified domain, e.g., `alerts@fishcount.example`.     |

## When the Fly GraphQL schema drifts

The Fly billing GraphQL fields are undocumented ([Simon Willison TIL](https://til.simonwillison.net/fly/undocumented-graphql-api)). The watcher probes a few plausible field names (`currentMonthSpend`, `monthToDateSpend`, nested under `billingStatus` or `billingInfo`). If none are present, the script emails the operator "Billing check FAILED — please review manually" and exits 1.

To re-introspect the schema when this happens:

```bash
curl -H "Authorization: Bearer $FLY_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"query":"{__schema{types{name fields{name type{name kind}}}}}"}' \
     https://api.fly.io/graphql | jq '.data.__schema.types[] | select(.name | test("[Bb]illing|[Oo]rganization"))'
```

Update `fetchFlySpend()` in `scripts/billing-watcher.ts` with the new field path, add the old name to the `candidate` fallback chain (so historical behavior still works), commit.

## Why the dead-man's switch uses healthchecks.io's native email, not Resend

Separation of concerns. If Resend is down, the healthchecks.io-channel alerts still arrive — and vice-versa. See 00-RESEARCH.md §Q6 for the rationale.

## Alternative if DIY becomes too brittle

Downgrade interpretation of OPS-01 to: "billing dashboard is the alert surface; operator reviews weekly via calendar reminder." Less automated but honest. Document in ROADMAP if we ever pivot.
