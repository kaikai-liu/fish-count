// src/routes/alerts/+page.server.ts
// Phase 4 ALT-01/02/03/04/06: signup landing + form action.
//
// 7-step anti-abuse pipeline ordering (UI-SPEC §"Signup form submission" +
// 04-RESEARCH.md §"Pattern 1"):
//   1. Zod parse → 400 with fieldErrors
//   2. Honeypot filled → silent generic-success (T-04-A1)
//   3. Per-IP rate limit ≥3/h → page-level 429
//   3.5. rateLimit.record AFTER pass, BEFORE further checks so disposable
//        + suppression rejects also consume budget (T-04-A2)
//   4. Disposable-email domain → inline 400
//   5. Suppression list → silent generic-success (T-04-A1, ALT-06)
//   6. Already-pending <24h → silent generic-success (Pitfall 1, no confirm-spam)
//   7. Already-active → 303 → /alerts/confirmed
//   8. Happy path: createPending + signToken + sendUserEmail + 303 → /alerts/pending
//
// PII discipline: never log raw email; logger redact paths cover '*.email'.
// T-04-A4 mitigation — Referrer-Policy: same-origin (manage-token in QS for
// downstream pages reached from /alerts/pending).
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { getDb } from '$lib/db/client';
import { listForSelect as listBoatsForSelect } from '$lib/db/boats';
import * as subscribers from '$lib/db/subscribers';
import * as suppressionList from '$lib/db/suppressionList';
import * as honeypot from '$lib/alerts/honeypot';
import * as rateLimit from '$lib/alerts/rateLimit';
import * as disposableEmail from '$lib/alerts/disposableEmail';
import { signToken } from '$lib/alerts/tokens';
import { dailyCap } from '$lib/alerts/warmup';
import { renderConfirmationEmail } from '$lib/email/templates';
import { buildEmail } from '$lib/email/buildEmail';
import { sendUserEmail } from '$lib/email/send';
import { sendOperatorAlert } from '$lib/alerts/operator';
import { maskEmail } from '$lib/shared/format';
import { today } from '$lib/shared/dates';
import { logger } from '$lib/server/logger';
import { distinctSpecies } from '$lib/db/queries/browse';

const SignupSchema = z
  .object({
    email: z.string().min(1, 'required').email('invalid'),
    website: z.string().optional().default(''), // honeypot
    boats: z.array(z.coerce.number().int().positive()).default([]),
    species: z.array(z.string().trim().min(1)).default([])
  })
  .refine((d) => d.boats.length > 0 || d.species.length > 0, {
    message: 'Pick at least one boat or species to follow.',
    path: ['boats']
  });

function showBanner(): boolean {
  const startDate = env.WARMUP_START_DATE;
  if (!startDate) return false;
  const cap = dailyCap(today(), startDate);
  return cap < Number.POSITIVE_INFINITY;
}

export const load: PageServerLoad = async ({ url, setHeaders }) => {
  const db = getDb();
  // Tokens may flow through downstream pages; same-origin referrer policy
  // mitigates T-04-A4 (manage-token leak via referrer to third parties).
  setHeaders({
    'cache-control': 'public, max-age=300',
    'referrer-policy': 'same-origin'
  });
  // Pre-fill from inline CTAs on /boats/[id] and /picker (Plan 06).
  const preselectedBoats = url.searchParams
    .getAll('boat')
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  const preselectedSpecies = url.searchParams.getAll('species').filter(Boolean);
  return {
    boats: listBoatsForSelect(db),
    species: distinctSpecies(db),
    preselectedBoats,
    preselectedSpecies,
    showWarmupBanner: showBanner()
  };
};

function fdToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const key of new Set([...fd.keys()])) {
    const all = fd.getAll(key);
    if (key === 'boats' || key === 'species') {
      obj[key] = all.map((v) => String(v));
    } else {
      obj[key] = String(all[0] ?? '');
    }
  }
  return obj;
}

export const actions: Actions = {
  default: async ({ request, getClientAddress }) => {
    const fd = await request.formData();
    const parsed = SignupSchema.safeParse(fdToObject(fd));
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return fail(400, { fieldErrors: flat.fieldErrors });
    }
    const { email, website, boats, species } = parsed.data;
    const db = getDb();
    const ip = request.headers.get('fly-client-ip') ?? getClientAddress();
    const nowIso = new Date().toISOString();
    const masked = maskEmail(email);
    const log = logger.child({ job: 'subscriber-signup', ip });

    // 2. Honeypot — silent generic-success (T-04-A1).
    if (honeypot.isFilled(website)) {
      log.info({ msg: 'signup_honeypot_triggered' });
      throw redirect(303, `/alerts/pending?m=${encodeURIComponent(masked)}`);
    }

    // 3. Per-IP rate limit — page-level 429 (REQUIREMENTS.md ALT-03 verbatim 3/h).
    const rl = rateLimit.check(db, ip, nowIso);
    if (rl.exceeded) {
      log.warn({ msg: 'signup_rate_limited', count: rl.count });
      return fail(429, { pageError: 'rate_limited' });
    }
    // 3.5 Record this attempt BEFORE any further check so disposable-email
    //     submitters also consume rate-limit budget (T-04-A2 mitigation:
    //     blocks "burn N disposable attempts then submit a real one"
    //     attack pattern).
    rateLimit.record(db, ip, nowIso);

    // 4. Disposable-email — inline error (UI-SPEC validation copy).
    if (disposableEmail.isDisposable(email)) {
      log.info({ msg: 'signup_disposable_blocked' });
      return fail(400, { fieldErrors: { email: ['disposable_address'] } });
    }

    // 5. Suppression list — silent generic-success (ALT-06 + T-04-A1).
    if (suppressionList.has(db, email)) {
      log.info({ msg: 'signup_blocked_suppressed' });
      throw redirect(303, `/alerts/pending?m=${encodeURIComponent(masked)}`);
    }

    // 6. Already-pending <24h — silent generic-success, NO second confirm
    //    email (Pitfall 1: confirm-link spam).
    if (subscribers.findRecentPending(db, email, 86400)) {
      log.info({ msg: 'signup_already_pending' });
      throw redirect(303, `/alerts/pending?m=${encodeURIComponent(masked)}`);
    }

    // 7. Already-active — short-circuit to /alerts/confirmed
    //    (UI-SPEC §"Signup form submission" 4(f)).
    if (subscribers.findActive(db, email)) {
      log.info({ msg: 'signup_already_active' });
      throw redirect(303, `/alerts/confirmed?already=1`);
    }

    // 8. Happy path (rate-limit attempt was already recorded at step 3.5).
    const id = subscribers.createPending(db, { email, boats, species, ip });
    const confirmToken = signToken('confirm', id, 86400); // 24h
    const unsubToken = signToken('unsubscribe', id, null);
    const baseUrl = env.PUBLIC_BASE_URL ?? 'https://fishcount.app';
    const confirmUrl = `${baseUrl}/alerts/confirm?token=${encodeURIComponent(confirmToken)}`;
    const unsubscribeUrl = `${baseUrl}/alerts/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
    const fromDomain =
      (env.SUBSCRIBER_FROM_EMAIL ?? 'alerts@fishcount.app').split('@')[1] ?? 'fishcount.app';
    const unsubMailto = `unsubscribe+${unsubToken}@${fromDomain}`;
    const ipParts = ip.split('.');
    const maskedIp =
      ipParts.length >= 2 ? `${ipParts[0]}.${ipParts[1]}.x.x` : 'x.x.x.x';

    const args = renderConfirmationEmail({
      confirmUrl,
      signupDate: today(),
      maskedIp,
      unsubscribeUrl
    });
    try {
      const { html, text } = buildEmail(args);
      await sendUserEmail({
        to: email,
        subject: args.subject,
        html,
        text,
        unsubscribeMailto: unsubMailto,
        unsubscribeUrl
      });
      log.info({ msg: 'signup_confirm_sent', subscriberId: id });
    } catch (err) {
      log.error({ err, msg: 'signup_confirm_send_failed' });
      // Pending row remains; user can re-signup which will silent-succeed
      // (already-pending). Notify operator. Do NOT 500 the user —
      // anti-enumeration discipline + UX.
      try {
        await sendOperatorAlert({
          subject: 'FishCount: confirmation send failed',
          body: `Subscriber id ${id} created but confirmation email failed:\n${(err as Error).message ?? String(err)}`
        });
      } catch (opErr) {
        log.error({ err: opErr, msg: 'operator_alert_failed' });
      }
    }
    throw redirect(303, `/alerts/pending?m=${encodeURIComponent(masked)}`);
  }
};
