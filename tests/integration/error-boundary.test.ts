// tests/integration/error-boundary.test.ts
// Phase 8 Plan 04 — POL-01. Verifies the page-level error boundary
// (src/routes/+error.svelte) renders friendly copy without leaking the raw
// error. We verify the COPY (the actual rendering happens via SvelteKit's
// runtime which we don't boot here); the boundary's behavior — preserve
// status, render heading/body — is a function of <page.status> + the
// imported strings.
//
// The behavioral assertion: the file imports ERROR_HEADINGS / ERROR_BODIES
// and uses page.status to branch. If a future edit accidentally inlines
// the strings or drops the status branch, this test catches it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ERROR_HEADINGS, ERROR_BODIES } from '../../src/lib/copy/error-page';

const errorSveltePath = resolve(
  process.cwd(),
  'src/routes/+error.svelte'
);

describe('+error.svelte page-level error boundary', () => {
  const source = readFileSync(errorSveltePath, 'utf8');

  it('imports the canonical copy module (not inlined strings)', () => {
    expect(source).toMatch(/from\s+['"]\$lib\/copy\/error-page['"]/);
    expect(source).toMatch(/ERROR_HEADINGS/);
    expect(source).toMatch(/ERROR_BODIES/);
  });

  it('branches on page.status (preserves the HTTP code from the loader)', () => {
    expect(source).toMatch(/page\.status/);
    expect(source).toMatch(/404/);
  });

  it('does NOT render the raw error (no page.error.message reference)', () => {
    // T-08-04-04: never expose the raw error message to the user. We only
    // render static copy from the copy module + the status code.
    expect(source).not.toMatch(/page\.error\.message/);
    expect(source).not.toMatch(/page\.error\?\.stack/);
  });

  it('emits a descriptive <title> per the POL-04 pattern', () => {
    expect(source).toMatch(/<title>[^<]*— FishCount<\/title>/);
  });

  it('includes a "Back to home" link', () => {
    expect(source).toMatch(/href="\/"/);
    expect(source).toMatch(/Back to home/);
  });
});

describe('error-page copy module', () => {
  it('has notFound + generic variants for both heading and body', () => {
    expect(ERROR_HEADINGS.notFound).toBe('Page not found');
    expect(ERROR_HEADINGS.generic).toMatch(/broke|wrong/i);
    expect(ERROR_BODIES.notFound).toMatch(/couldn't find|can't find|not found/i);
    expect(ERROR_BODIES.generic).toMatch(/try again|persists|home/i);
  });

  it('does not contain any leaked stack-trace placeholders', () => {
    expect(ERROR_BODIES.notFound).not.toMatch(/\$\{/);
    expect(ERROR_BODIES.generic).not.toMatch(/\$\{/);
  });
});
