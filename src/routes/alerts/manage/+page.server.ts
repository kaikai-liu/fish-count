// src/routes/alerts/manage/+page.server.ts
// Phase 4 ALT-06 (manage path) + UI-SPEC §"Manage-preferences page".
//
// Token-gated. Each action re-verifies ?token from URL because form-action calls
// re-enter load-flow with the same querystring. Invalid → generic "no longer valid"
// (Pitfall 8 anti-enumeration: don't reveal whether the email exists).
//
// Manage updates do NOT trigger a confirmation email (UI-SPEC §"Manage-preferences
// interactions" — manage updates use the in-page success state).
//
// T-04-A4: Referrer-Policy: same-origin to prevent token leak via clicked links.
// T-04-MANAGE-AUTHZ: Subject id is derived from the verified token, never from
// client-supplied form fields. updatePreferences operates on `verified.subjectId`.
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { getDb } from '$lib/db/client';
import { verifyToken, signToken } from '$lib/alerts/tokens';
import * as subscribers from '$lib/db/subscribers';
import { listForSelect } from '$lib/db/boats';
import { distinctSpecies } from '$lib/db/queries/browse';
import { logger } from '$lib/server/logger';

function tokenFromUrl(url: URL): string | null {
  return url.searchParams.get('token');
}

function verifySubject(
  token: string | null
): { ok: false } | { ok: true; subjectId: number } {
  if (!token) return { ok: false };
  const v = verifyToken('manage', token);
  if (!v.ok) return { ok: false };
  return { ok: true, subjectId: v.subjectId };
}

export const load: PageServerLoad = async ({ url, setHeaders }) => {
  setHeaders({
    'cache-control': 'no-store',
    'referrer-policy': 'same-origin'
  });
  const token = tokenFromUrl(url);
  const v = verifySubject(token);
  if (!v.ok) return { invalid: true };

  const db = getDb();
  const summary = subscribers.getSummary(db, v.subjectId);
  const sub = subscribers.findById(db, v.subjectId);
  if (!summary || !sub) return { invalid: true };

  const baseUrl = env.PUBLIC_BASE_URL ?? '';
  // Unsubscribe tokens never expire (RFC 8058 + ALT-05): a six-month-old email
  // must still let the user one-click unsubscribe.
  const unsubToken = signToken('unsubscribe', v.subjectId, null);
  const unsubscribeUrl = `${baseUrl}/alerts/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

  return {
    invalid: false as const,
    summary,
    pausedUntil: sub.paused_until,
    boats: listForSelect(db),
    species: distinctSpecies(db),
    unsubscribeUrl,
    // Re-render uses the same token; we do NOT re-sign on every load (link in email is static).
    currentToken: token
  };
};

const UpdateSchema = z.object({
  boats: z.array(z.coerce.number().int().positive()).default([]),
  species: z.array(z.string().trim().min(1)).default([]),
  pause: z.enum(['off', '1w', '2w', '1m', 'until-on']).optional().default('off')
});

function pausedUntilFor(pause: 'off' | '1w' | '2w' | '1m' | 'until-on'): string | null {
  const now = Date.now();
  if (pause === 'off') return null;
  if (pause === 'until-on') return '9999-12-31';
  const days = pause === '1w' ? 7 : pause === '2w' ? 14 : 30;
  return new Date(now + days * 86400_000).toISOString().slice(0, 10);
}

function fdToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const key of new Set([...fd.keys()])) {
    if (key === 'boats' || key === 'species') obj[key] = fd.getAll(key).map(String);
    else obj[key] = String(fd.get(key) ?? '');
  }
  return obj;
}

export const actions: Actions = {
  default: async ({ request, url }) => {
    const v = verifySubject(tokenFromUrl(url));
    if (!v.ok) return fail(401, { invalid: true });

    const fd = await request.formData();
    const parsed = UpdateSchema.safeParse(fdToObject(fd));
    if (!parsed.success) {
      return fail(400, { fieldErrors: parsed.error.flatten().fieldErrors });
    }

    const db = getDb();
    subscribers.updatePreferences(db, v.subjectId, {
      boats: parsed.data.boats,
      species: parsed.data.species,
      pausedUntil: pausedUntilFor(parsed.data.pause)
    });
    logger.info({ msg: 'manage_updated', subscriberId: v.subjectId });
    return { ok: true, message: 'Preferences updated.' };
  },

  removeBoat: async ({ request, url }) => {
    const v = verifySubject(tokenFromUrl(url));
    if (!v.ok) return fail(401);
    const fd = await request.formData();
    const removeBoatId = Number(fd.get('boatId') ?? 0);
    if (!Number.isFinite(removeBoatId) || removeBoatId <= 0) return fail(400);

    const db = getDb();
    const summary = subscribers.getSummary(db, v.subjectId);
    if (!summary) return fail(404);
    const remainingBoats = summary.boats
      .map((b) => b.id)
      .filter((id) => id !== removeBoatId);
    subscribers.updatePreferences(db, v.subjectId, {
      boats: remainingBoats,
      species: summary.species
    });
    logger.info({ msg: 'manage_remove_boat', subscriberId: v.subjectId, boatId: removeBoatId });
    throw redirect(303, `/alerts/manage?token=${encodeURIComponent(tokenFromUrl(url) ?? '')}`);
  },

  removeSpecies: async ({ request, url }) => {
    const v = verifySubject(tokenFromUrl(url));
    if (!v.ok) return fail(401);
    const fd = await request.formData();
    const removeSpecies = String(fd.get('label') ?? '').trim();
    if (!removeSpecies) return fail(400);

    const db = getDb();
    const summary = subscribers.getSummary(db, v.subjectId);
    if (!summary) return fail(404);
    const remaining = summary.species.filter((s) => s !== removeSpecies);
    subscribers.updatePreferences(db, v.subjectId, {
      boats: summary.boats.map((b) => b.id),
      species: remaining
    });
    logger.info({
      msg: 'manage_remove_species',
      subscriberId: v.subjectId,
      species: removeSpecies
    });
    throw redirect(303, `/alerts/manage?token=${encodeURIComponent(tokenFromUrl(url) ?? '')}`);
  }
};
