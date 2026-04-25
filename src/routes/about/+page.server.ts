// src/routes/about/+page.server.ts — Static About-the-data page.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Sources:
//   .planning/phases/02-browse-trip-picker-trends/02-CONTEXT.md §D-17, D-29
//
// This loader has no SQL. Its only job is to set the HTTP cache header per D-29.
// The page content is verbatim static copy — no user input, no dynamic data.
// T-02-33 disposition: accept — /about contains no system internals.
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
  // D-29: /about caches 1 hour (static-ish content)
  setHeaders({ 'cache-control': 'public, max-age=3600' });
  return {};
};
