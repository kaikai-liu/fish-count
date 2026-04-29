// src/routes/alerts/unsubscribe/+page.server.ts
// Phase 4 ALT-05 + ALT-06: one-click unsubscribe (RFC 8058 + CAN-SPAM).
//
// Critical contract (UI-SPEC §"Unsubscribe page" + §"Anti-Feature Guards" #1):
//   - GET (link click) and POST (List-Unsubscribe-Post) BOTH write suppression
//     and hard-delete the subscriber row (CASCADE removes follows + alerts_sent).
//   - NO confirmation interstitial — one click means one click.
//   - Suppression write happens BEFORE rendering. If the write fails, the page
//     renders the contact-pointer error.
//   - No JS required.
//
// Pitfall 6: hard-delete subscribers row, suppression_list survives. Email is
// canonicalized inside the DAL — case-mixed re-signup is silent-failed by the
// suppression-list lookup (Plan 04 step 5).
//
// T-04-A4: Referrer-Policy: same-origin to prevent token leak via clicked links.
// T-04-A8: write-then-render order — suppression succeeds before subscriber row
// is deleted, so a partial failure preserves the user's record.
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/db/client';
import { verifyToken } from '$lib/alerts/tokens';
import * as subscribers from '$lib/db/subscribers';
import * as suppressionList from '$lib/db/suppressionList';
import { maskEmail } from '$lib/shared/format';
import { logger } from '$lib/server/logger';

interface UnsubResult {
  invalid: boolean;
  maskedEmail: string | null;
  writeFailed?: boolean;
}

function performUnsubscribe(token: string | null): UnsubResult {
  if (!token) return { invalid: true, maskedEmail: null };
  const v = verifyToken('unsubscribe', token);
  if (!v.ok) {
    logger.info({ msg: 'unsubscribe_token_invalid', reason: v.reason });
    return { invalid: true, maskedEmail: null };
  }

  const db = getDb();
  const sub = subscribers.findById(db, v.subjectId);
  if (!sub) {
    // Already unsubscribed (row deleted). UI-SPEC: render success-shaped page either way —
    // the user's intent is satisfied and we can't reveal whether they were subscribed.
    return { invalid: false, maskedEmail: null };
  }

  // Write suppression FIRST, then delete subscriber (UI-SPEC §"Server contract" order).
  try {
    suppressionList.add(db, sub.email, 'user_unsub');
    subscribers.deleteForUnsubscribe(db, sub.id);
    logger.info({ msg: 'unsubscribe_completed', subscriberId: sub.id });
    return { invalid: false, maskedEmail: maskEmail(sub.email) };
  } catch (err) {
    logger.error({ err, msg: 'unsubscribe_write_failed', subscriberId: sub.id });
    return { invalid: false, maskedEmail: maskEmail(sub.email), writeFailed: true };
  }
}

export const load: PageServerLoad = async ({ url, setHeaders }) => {
  setHeaders({
    'cache-control': 'no-store',
    'referrer-policy': 'same-origin'
  });
  return performUnsubscribe(url.searchParams.get('token'));
};

export const actions: Actions = {
  default: async ({ url }) => {
    // RFC 8058 §3: POST one-click. Same write-then-render flow as GET.
    // SvelteKit returns the action result as JSON; mail clients only need 2xx.
    const result = performUnsubscribe(url.searchParams.get('token'));
    return { ok: true, ...result };
  }
};
