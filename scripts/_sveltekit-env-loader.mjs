// scripts/_sveltekit-env-loader.mjs
// Phase 4 ALT-08 drill support: Node ESM loader that synthesizes the
// SvelteKit virtual module `$env/dynamic/private` for tsx-run scripts.
//
// SvelteKit's vite plugin resolves `$env/dynamic/private` to a process.env-backed
// `{ env }` object at runtime. tsx (used by scripts/email-tester-drill.ts) is NOT
// running inside SvelteKit, so the import would fail. This loader hooks Node's
// module resolution to return an in-memory module with the same shape — analogous
// to tests/helpers/sveltekit-env-shim.ts (which is wired into vitest via
// resolve.alias in vitest.config.ts).
//
// Usage:
//   tsx --import ./scripts/_sveltekit-env-loader.mjs scripts/email-tester-drill.ts
//
// The loader registers itself via module.register() at import time, so any
// downstream `import ... from '$env/dynamic/private'` resolves to the synthetic
// CommonJS-shaped ES module exported below.
import { register } from 'node:module';

// `import.meta.url` is already a file:// URL — pass it as the parent URL so the
// relative resolver path resolves against this file's directory.
register('./_sveltekit-env-resolver.mjs', import.meta.url);
