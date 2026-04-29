import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Resolve SvelteKit's `$lib` alias in vitest. When running via vitest (not `vite dev`),
// the SvelteKit plugin is not active, so its built-in `$lib -> src/lib` alias is absent.
// Mirror it here so unit tests of modules that import from `$lib/...` work out of the box.
const lib = fileURLToPath(new URL('./src/lib', import.meta.url));

// Phase 4 Plan 02: SvelteKit's `$env/dynamic/private` virtual module is not
// resolved by vitest (no SvelteKit plugin in test runtime). Alias it to a
// process.env-backed shim so server-side modules importing `env` (tokens.ts)
// load cleanly under unit tests.
const sveltekitEnvShim = fileURLToPath(new URL('./tests/helpers/sveltekit-env-shim.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      $lib: lib,
      '$env/dynamic/private': sveltekitEnvShim
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
