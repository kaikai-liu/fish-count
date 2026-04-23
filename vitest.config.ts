import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Resolve SvelteKit's `$lib` alias in vitest. When running via vitest (not `vite dev`),
// the SvelteKit plugin is not active, so its built-in `$lib -> src/lib` alias is absent.
// Mirror it here so unit tests of modules that import from `$lib/...` work out of the box.
const lib = fileURLToPath(new URL('./src/lib', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      $lib: lib
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
