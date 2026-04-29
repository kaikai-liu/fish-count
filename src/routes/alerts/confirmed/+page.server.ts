// src/routes/alerts/confirmed/+page.server.ts
// Phase 4 ALT-02: post-confirmation summary page.
//
// ?t carries a manage-purpose token issued by /alerts/confirm. Verifying it lets
// us render the subscription summary without session state. Missing/invalid `t`
// renders a generic success page (anti-enumeration; user just refreshed an old URL).
//
// T-04-A4: Referrer-Policy: same-origin to prevent token leak via clicked links.
import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { getDb } from '$lib/db/client';
import { verifyToken, signToken } from '$lib/alerts/tokens';
import * as subscribers from '$lib/db/subscribers';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
  setHeaders({
    'cache-control': 'no-store',
    'referrer-policy': 'same-origin'
  });
  const t = url.searchParams.get('t');
  const already = url.searchParams.get('already') === '1';

  if (!t) {
    return { summary: null, manageUrl: null, already };
  }
  const verified = verifyToken('manage', t);
  if (!verified.ok) {
    return { summary: null, manageUrl: null, already };
  }

  const db = getDb();
  const summary = subscribers.getSummary(db, verified.subjectId);
  if (!summary) {
    return { summary: null, manageUrl: null, already };
  }
  // Re-issue the manage token so the "Manage your alerts" link is fresh and 30-day-valid.
  const manageToken = signToken('manage', verified.subjectId, 30 * 24 * 3600);
  const baseUrl = env.PUBLIC_BASE_URL ?? '';
  const manageUrl = `${baseUrl}/alerts/manage?token=${encodeURIComponent(manageToken)}`;
  return { summary, manageUrl, already };
};
