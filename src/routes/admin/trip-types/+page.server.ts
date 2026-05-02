// src/routes/admin/trip-types/+page.server.ts — Phase 8 ALI-03/ALI-04 admin route.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Sources:
//   .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-04 (auth, mobile)
//   .planning/phases/08-home-retire-polish/08-RESEARCH.md §Pattern 5 (Admin Auth gate)
//   .planning/phases/08-home-retire-polish/08-PATTERNS.md §"Admin Trip-Types"
//
// Behavior:
//   - load: verifies fc_admin cookie via verifyAdminCookie. Unauthed → 303 to
//     /admin/trip-types/login. cache-control: private, no-store (RESEARCH §Pattern 5).
//   - actions.alias / accept / reset: each re-verifies the cookie before
//     mutating (defense in depth — load gate alone is not enough; actions
//     receive the same request only after the form POST). DAL writes via
//     upsertAlias (parameterized; SQL-injection-safe by construction).
//   - actions.logout: clears fc_admin and redirects to login.
//
// Wave 4 will hoist the gate into hooks.server.ts; Wave 2 ships per-route as
// a self-contained fallback that doesn't depend on other phases shipping first.
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/db/client';
import {
  listAllLabelsWithStatus,
  upsertAlias,
  type AliasRow
} from '$lib/db/aliases';
import { verifyAdminCookie } from '$lib/auth/admin';
import {
  ERR_NOT_AUTHORIZED,
  SUCCESS_ALIAS,
  SUCCESS_ACCEPT,
  SUCCESS_RESET
} from '$lib/copy/admin';

export const load: PageServerLoad = async ({ cookies, setHeaders }) => {
  if (!verifyAdminCookie(cookies.get('fc_admin'))) {
    throw redirect(303, '/admin/trip-types/login');
  }
  // RESEARCH §"Admin Auth" gotcha — admin pages must never be cached at
  // a public CDN. private, no-store keeps the alias list fresh + private.
  setHeaders({ 'cache-control': 'private, no-store' });

  const labels = listAllLabelsWithStatus(getDb());

  // Build distinct canonical-label list for the typeahead. Drops empty/null.
  const canonicalSet = new Set<string>();
  for (const l of labels) {
    if (l.canonical_label) canonicalSet.add(l.canonical_label);
    canonicalSet.add(l.source_label); // source labels themselves are valid canonical targets
  }
  const canonicalChoices = Array.from(canonicalSet).sort();

  return { labels, canonicalChoices };
};

function requireAuth(cookies: { get: (name: string) => string | undefined }): true | ReturnType<typeof fail> {
  if (!verifyAdminCookie(cookies.get('fc_admin'))) {
    return fail(401, { error: ERR_NOT_AUTHORIZED });
  }
  return true;
}

export const actions: Actions = {
  alias: async ({ request, cookies }) => {
    const auth = requireAuth(cookies);
    if (auth !== true) return auth;
    const fd = await request.formData();
    const source_label = String(fd.get('source_label') ?? '').trim();
    const canonical_label = String(fd.get('canonical_label') ?? '').trim();
    const notes = fd.get('notes') ? String(fd.get('notes')) : null;
    if (!source_label || !canonical_label) {
      return fail(400, { error: 'source_label and canonical_label are required.' });
    }
    upsertAlias(getDb(), {
      source_label,
      canonical_label,
      status: 'aliased' satisfies AliasRow['status'],
      notes
    });
    return { success: true, message: SUCCESS_ALIAS };
  },

  accept: async ({ request, cookies }) => {
    const auth = requireAuth(cookies);
    if (auth !== true) return auth;
    const fd = await request.formData();
    const source_label = String(fd.get('source_label') ?? '').trim();
    if (!source_label) return fail(400, { error: 'source_label is required.' });
    // 'accepted' means "this IS its own canonical" — canonical_label = source_label.
    upsertAlias(getDb(), {
      source_label,
      canonical_label: source_label,
      status: 'accepted' satisfies AliasRow['status']
    });
    return { success: true, message: SUCCESS_ACCEPT };
  },

  reset: async ({ request, cookies }) => {
    const auth = requireAuth(cookies);
    if (auth !== true) return auth;
    const fd = await request.formData();
    const source_label = String(fd.get('source_label') ?? '').trim();
    if (!source_label) return fail(400, { error: 'source_label is required.' });
    upsertAlias(getDb(), {
      source_label,
      canonical_label: source_label,
      status: 'pending' satisfies AliasRow['status']
    });
    return { success: true, message: SUCCESS_RESET };
  },

  logout: async ({ cookies }) => {
    cookies.delete('fc_admin', { path: '/admin' });
    throw redirect(303, '/admin/trip-types/login');
  }
};
