// src/routes/alerts/confirm/+page.server.ts
// Phase 4 ALT-02: double-opt-in confirmation handler.
//
// Token-gated. Verifies the 'confirm' purpose token, activates the subscriber,
// and 303s to /alerts/confirmed with a fresh manage-purpose token so the next
// page can render the subscription summary without persisting session state.
//
// Anti-enumeration (Pitfall 8): "already activated" and "valid token but row deleted"
// both return success-shaped responses. Only signature/expiry failures render
// "no longer valid" — and even those are intentionally vague.
//
// T-04-A4: Referrer-Policy: same-origin to prevent token leak via clicked links.
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getDb } from '$lib/db/client';
import { verifyToken, signToken } from '$lib/alerts/tokens';
import * as subscribers from '$lib/db/subscribers';
import { logger } from '$lib/server/logger';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
  setHeaders({
    'cache-control': 'no-store',
    'referrer-policy': 'same-origin'
  });
  const token = url.searchParams.get('token');
  if (!token) {
    logger.info({ msg: 'confirm_token_missing' });
    return { invalid: true };
  }

  const verified = verifyToken('confirm', token);
  if (!verified.ok) {
    logger.info({ msg: 'confirm_token_invalid', reason: verified.reason });
    return { invalid: true };
  }

  const db = getDb();
  const sub = subscribers.findById(db, verified.subjectId);
  if (!sub) {
    // Row deleted (already unsubscribed). Render generic invalid (Pitfall 8).
    logger.info({ msg: 'confirm_subscriber_missing', subscriberId: verified.subjectId });
    return { invalid: true };
  }

  const wasAlreadyActive = sub.status === 'active';
  if (sub.status === 'pending') {
    subscribers.activate(db, verified.subjectId);
    logger.info({ msg: 'confirm_activated', subscriberId: verified.subjectId });
  } else {
    // Already active — Pitfall 8 path. Same redirect shape, just include `already` flag.
    logger.info({ msg: 'confirm_already_active', subscriberId: verified.subjectId });
  }

  // Issue a fresh manage token so /alerts/confirmed can show the subscription summary
  // without persisting session state. 30-day TTL matches manage-link policy.
  const manageToken = signToken('manage', verified.subjectId, 30 * 24 * 3600);
  const alreadyParam = wasAlreadyActive ? '&already=1' : '';
  throw redirect(303, `/alerts/confirmed?t=${encodeURIComponent(manageToken)}${alreadyParam}`);
};
