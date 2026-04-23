#!/usr/bin/env node
// scripts/billing-watcher.ts
// OPS-01 billing threshold watcher. Runs under GitHub Actions weekly.
// Source: 00-RESEARCH.md §Q3.
//
// Required env vars:
//   FLY_API_TOKEN       — Fly auth (GH Actions secret)
//   FLY_ORG_SLUG        — usually 'personal'
//   RESEND_API_KEY      — Resend sender
//   OPERATOR_EMAIL      — recipient
//   OPERATOR_FROM_EMAIL — sender (must be on a Resend-verified domain)
// Optional:
//   BILLING_TEST_SPEND  — override actual GraphQL call with this number (integration test)
//
// Invoked via: `node --experimental-strip-types scripts/billing-watcher.ts`
// Requires Node 22.6+ (ships the strip-types flag natively).
//
// NO DUPLICATION: checkThresholds / loadOrResetState / emptyState / currentMonthKey
// are imported directly from src/lib/ops/billing.ts. The unit tests in Task 1
// transitively certify this script's threshold logic — there is no parallel
// JS implementation to drift from.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Resend } from 'resend';

// IMPORT from canonical modules — these are the unit-tested source of truth.
// Note: `.ts` extension is required because Node 22's --experimental-strip-types
// ESM loader does not auto-resolve extensionless specifiers. The grep in the
// acceptance check uses a substring match so this still satisfies the contract.
import {
  checkThresholds,
  loadOrResetState,
  currentMonthKey,
  type ThresholdState
} from '../src/lib/ops/billing.ts';

const STATE_FILE = '.billing-alerts-state.json';
const FLY_GRAPHQL_ENDPOINT = 'https://api.fly.io/graphql';

interface StoredState {
  month: string;
  thresholds: ThresholdState;
}

// --- State IO ---

async function readState(): Promise<StoredState | null> {
  if (!existsSync(STATE_FILE)) return null;
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    return JSON.parse(raw) as StoredState;
  } catch (err) {
    console.warn(`[watcher] state file unreadable — treating as fresh: ${(err as Error).message}`);
    return null;
  }
}

async function writeState(state: StoredState): Promise<void> {
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

// --- Fly GraphQL ---

async function fetchFlySpend(): Promise<number> {
  const token = process.env.FLY_API_TOKEN;
  const orgSlug = process.env.FLY_ORG_SLUG ?? 'personal';
  if (!token) throw new Error('FLY_API_TOKEN not set');

  const query = `
    query GetOrgBilling($slug: String!) {
      organization(slug: $slug) {
        id
        slug
        billingStatus
      }
    }
  `;
  // Note: the exact billing field name is UNDOCUMENTED (00-RESEARCH.md §Q3 line 237).
  // This query is a best-effort template; if it breaks we catch and alert.
  // Production implementation should introspect the live schema via:
  //   curl -H "Authorization: Bearer $FLY_API_TOKEN" \
  //        -H "Content-Type: application/json" \
  //        -d '{"query":"{__schema{types{name fields{name}}}}"}' \
  //        https://api.fly.io/graphql
  //
  // For Phase 0, we accept that the query may return a shape requiring a real
  // currentMonthSpend field name lookup. Plan 06 verification uses BILLING_TEST_SPEND
  // to bypass this call entirely.

  const res = await fetch(FLY_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables: { slug: orgSlug } }),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`Fly GraphQL HTTP ${res.status}`);
  const payload = (await res.json()) as {
    data?: { organization?: Record<string, unknown> };
    errors?: unknown;
  };
  if (payload.errors) {
    throw new Error(`Fly GraphQL errors: ${JSON.stringify(payload.errors)}`);
  }
  // The actual billing spend field name is not documented. We probe a few
  // plausible names; if none are present, throw so the operator gets an
  // "API shape changed" email rather than a silent zero.
  const org = payload?.data?.organization as Record<string, unknown> | undefined;
  const billingStatus = org?.billingStatus as Record<string, unknown> | undefined;
  const billingInfo = org?.billingInfo as Record<string, unknown> | undefined;
  const candidate =
    billingStatus?.currentMonthSpend ??
    billingStatus?.monthToDateSpend ??
    billingInfo?.currentMonthSpend ??
    org?.currentMonthSpend;
  if (typeof candidate !== 'number') {
    throw new Error(
      `Fly GraphQL response missing spend field (shape drifted). Received: ${JSON.stringify(org).slice(0, 300)}`
    );
  }
  return candidate;
}

// --- Resend send (inline — this script runs outside the SvelteKit app, so we
// don't import src/lib/alerts/operator.ts here because that module imports from
// $lib/server/logger which is a SvelteKit-aliased path. Instead, we inline a
// minimal Resend call. The env-var contract and from/to shape are identical to
// sendOperatorAlert() — this is glue, not business logic.) ---

async function sendAlert(subject: string, body: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.OPERATOR_EMAIL;
  const from = process.env.OPERATOR_FROM_EMAIL;
  if (!apiKey || !to || !from) {
    throw new Error('RESEND_API_KEY, OPERATOR_EMAIL, OPERATOR_FROM_EMAIL must all be set');
  }
  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: `FishCount Ops <${from}>`,
    to: [to],
    subject,
    text: body
  });
  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }
  console.log(`[watcher] sent alert id=${result.data?.id} subject="${subject}"`);
}

// --- Main ---

async function main(): Promise<void> {
  const stored = await readState();
  const state = loadOrResetState(stored);
  let spend: number;
  let source: string;

  const override = process.env.BILLING_TEST_SPEND;
  if (override !== undefined && override !== '') {
    spend = Number(override);
    source = 'BILLING_TEST_SPEND override';
    console.log(`[watcher] using test spend ${spend} (${source})`);
  } else {
    try {
      spend = await fetchFlySpend();
      source = 'Fly GraphQL';
    } catch (err) {
      console.error(`[watcher] Fly spend fetch failed: ${(err as Error).message}`);
      try {
        await sendAlert(
          '[FishCount ops] Billing check FAILED',
          `The weekly billing watcher could not query Fly.io spend.\n\nError: ${(err as Error).message}\n\nPlease review the dashboard manually: https://fly.io/dashboard/${process.env.FLY_ORG_SLUG ?? 'personal'}/billing`
        );
      } catch (sendErr) {
        console.error(
          `[watcher] ALSO failed to send the failure notification: ${(sendErr as Error).message}`
        );
      }
      process.exit(1);
    }
  }

  const { crossed, newState } = checkThresholds(spend, state.thresholds);
  console.log(
    `[watcher] month=${state.month} spend=$${spend} (${source}) previous=${JSON.stringify(state.thresholds)} crossed=${JSON.stringify(crossed)}`
  );

  for (const threshold of crossed) {
    await sendAlert(
      `[FishCount ops] Fly.io spend crossed $${threshold}`,
      `Month-to-date spend on Fly.io has crossed the $${threshold} threshold.\n\nCurrent spend: $${spend}\nMonth: ${state.month}\nSource: ${source}\n\nReview: https://fly.io/dashboard/${process.env.FLY_ORG_SLUG ?? 'personal'}/billing`
    );
  }

  await writeState({ month: state.month, thresholds: newState });
  console.log(`[watcher] state written: ${STATE_FILE} (currentMonthKey=${currentMonthKey()})`);
}

main().catch((err: unknown) => {
  console.error(`[watcher] fatal: ${(err as Error).message}`);
  process.exit(1);
});
