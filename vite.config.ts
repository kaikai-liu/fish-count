import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  test: {
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    environment: 'node',
    exclude: ['build/**', 'node_modules/**'],
    passWithNoTests: true
  }
});
