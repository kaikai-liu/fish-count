import { defineConfig } from 'vitest/config';

export default defineConfig({
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
