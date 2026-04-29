// tests/helpers/env-dynamic-private-shim.ts
// Vitest shim for SvelteKit's `$env/dynamic/private` virtual module.
//
// SvelteKit's vite plugin synthesizes `$env/dynamic/private` at runtime from
// `process.env` (server-only). When tests run under bare `vitest` (no
// `@sveltejs/kit/vite` plugin loaded — see vitest.config.ts), that virtual
// module does not exist, so any module under test that does
// `import { env } from '$env/dynamic/private'` fails to resolve.
//
// This shim mirrors SvelteKit's behavior: re-export `process.env` as `env`.
// Aliased in vitest.config.ts. Server-only file — never bundled to client.

export const env: Record<string, string | undefined> = process.env;
