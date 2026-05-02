// src/routes/admin/trip-types/login/+page.server.ts — Phase 8 D-04 admin login.
// Sources:
//   .planning/phases/08-home-retire-polish/08-CONTEXT.md §D-04
//   .planning/phases/08-home-retire-polish/08-RESEARCH.md §Pattern 5 (Admin Auth)
//
// Behavior:
//   - load: cache-control: private, no-store. Already-authed users redirect
//     to /admin/trip-types so the login form isn't shown twice.
//   - default action: validates ADMIN_PASSWORD; on success sets fc_admin
//     cookie (HttpOnly, Secure-when-prod, SameSite=Strict, 24h Max-Age) and
//     303-redirects to /admin/trip-types. On failure returns 401 + generic
//     error per D-04 Security V7 (no leak of which field was wrong).
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { checkPassword, signAdminCookie, verifyAdminCookie } from '$lib/auth/admin';
import { LOGIN_INVALID } from '$lib/copy/admin';

// We read NODE_ENV directly rather than `import { dev } from '$app/environment'`
// because the SvelteKit virtual module is not resolvable under vitest (the
// SvelteKit plugin doesn't run there). NODE_ENV='production' on the host
// process toggles Secure. Same gate, no plugin dependency.
const isProd = process.env.NODE_ENV === 'production';

export const load: PageServerLoad = async ({ setHeaders, cookies }) => {
  // RESEARCH §"Admin Auth" gotcha — never let a CDN cache the login form.
  setHeaders({ 'cache-control': 'private, no-store' });
  if (verifyAdminCookie(cookies.get('fc_admin'))) {
    throw redirect(303, '/admin/trip-types');
  }
  return {};
};

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const fd = await request.formData();
    const password = String(fd.get('password') ?? '');
    if (!checkPassword(password)) {
      return fail(401, { error: LOGIN_INVALID });
    }
    let signed: string;
    try {
      signed = signAdminCookie();
    } catch {
      // ADMIN_COOKIE_SECRET unset — surface a clean failure rather than crash.
      return fail(503, {
        error:
          'Admin auth is not configured on this server. Set ADMIN_COOKIE_SECRET.'
      });
    }
    cookies.set('fc_admin', signed, {
      path: '/admin',
      httpOnly: true,
      secure: isProd, // Secure cookie only in prod; localhost https isn't required.
      sameSite: 'strict',
      maxAge: 86400 // 24h, matches verifyAdminCookie TTL
    });
    throw redirect(303, '/admin/trip-types');
  }
};
