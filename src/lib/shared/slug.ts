// src/lib/shared/slug.ts — Pure slugify + collision-resolution helpers used at boat ingestion.
// D-13 (06-CONTEXT.md): slug is frozen-at-first-seen. This module is consumed by
// src/lib/db/boats.ts and src/lib/db/migrations.ts only.
// CLAUDE.md Architecture Rule: this module issues no SQL.

/** Lowercase, hyphenated, ASCII slug. Max 60 chars. Never empty. */
export function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      // strip Unicode combining marks (diacritics)
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'boat'
  );
}

/** Returns first of {base, base-2, base-3, ...} not in `taken`. Deterministic. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
