import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Resolve SvelteKit's `$lib` alias in vitest. When running via vitest (not `vite dev`),
// the SvelteKit plugin is not active, so its built-in `$lib -> src/lib` alias is absent.
// Mirror it here so unit tests of modules that import from `$lib/...` work out of the box.
const lib = fileURLToPath(new URL('./src/lib', import.meta.url));

// Same problem with SvelteKit's `$env/dynamic/private` virtual module — synthesized by
// the SvelteKit vite plugin at runtime, absent under bare vitest. Shim re-exports
// `process.env` as `env`, matching SvelteKit's server-side behavior. See
// tests/helpers/env-dynamic-private-shim.ts for rationale.
const envDynamicPrivateShim = fileURLToPath(
  new URL('./tests/helpers/env-dynamic-private-shim.ts', import.meta.url)
);

export default defineConfig({
  resolve: {
    alias: {
      $lib: lib,
      '$env/dynamic/private': envDynamicPrivateShim
    }
  },
  test: {
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    environment: 'node',
    globals: false,
    exclude: ['build/**', 'node_modules/**', '.svelte-kit/**'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/routes/**', 'src/app.d.ts']
    }
  }
});
