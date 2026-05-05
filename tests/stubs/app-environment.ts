// tests/stubs/app-environment.ts
// Stub for SvelteKit's `$app/environment` virtual module under vitest.
// SvelteKit's plugin injects this at runtime; in tests we alias to this file
// (see vitest.config.ts). dev=true matches the local test-run shape — server
// modules that gate `secure: !dev` cookies behave as in dev (Secure=false),
// which is fine for assertions about other cookie flags (httpOnly, sameSite).
export const dev = true;
export const browser = false;
export const building = false;
export const version = 'test';
