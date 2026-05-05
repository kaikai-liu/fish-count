// tests/integration/routes/all-routes-title.test.ts
// Phase 8 Plan 04 — POL-04 / D-34. Verifies every public route's
// <svelte:head> emits a <title> matching the {Page} — FishCount pattern.
// We assert against the .svelte source files (not a running server) since
// the boilerplate is static.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('Per-route <title> contract (POL-04 / D-34)', () => {
  it('home: "What\'s been biting — FishCount"', () => {
    const home = read('src/routes/+page.svelte');
    expect(home).toMatch(/<title>\{HOME_PAGE_TITLE\}<\/title>/);
    const homeCopy = read('src/lib/copy/home.ts');
    expect(homeCopy).toMatch(/What's been biting — FishCount/);
  });

  it('about: "About FishCount"', () => {
    const about = read('src/routes/about/+page.svelte');
    expect(about).toMatch(/<title>About FishCount<\/title>/);
  });

  it('compare: "Compare boats — FishCount"', () => {
    const compare = read('src/routes/compare/+page.svelte');
    expect(compare).toMatch(/<title>Compare boats — FishCount<\/title>/);
  });

  it('explorer: derives title from data.pageTitle (verbatim source label)', () => {
    const explorer = read('src/routes/explorer/+page.svelte');
    // The explorer's title interpolates data.pageTitle so the rendered
    // string is "{Boat-name|Species|Landing} — FishCount" per ticker.
    expect(explorer).toMatch(/<title>\{data\.pageTitle[^<]*— FishCount<\/title>/);
  });

  it('error boundary: title matches the per-status pattern', () => {
    const err = read('src/routes/+error.svelte');
    expect(err).toMatch(/<title>[^<]*— FishCount<\/title>/);
  });

  it('admin trip-types: existing title preserved', () => {
    // Plan 02 set this via the ADMIN_PAGE_TITLE constant; we assert the
    // constant resolves to a "— FishCount" pattern.
    const adminCopy = read('src/lib/copy/admin.ts');
    expect(adminCopy).toMatch(/— FishCount/);
  });
});
