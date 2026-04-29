// tests/helpers/sveltekit-env-shim.ts
// Vitest shim for SvelteKit's `$env/dynamic/private` virtual module.
//
// In production, SvelteKit's bundler resolves `$env/dynamic/private` to a
// run-time object backed by process.env. Vitest doesn't run the SvelteKit
// plugin, so the import fails to resolve. This shim aliased via
// vitest.config.ts → resolve.alias provides the same `{ env: { KEY: value } }`
// shape so tests can mutate process.env to drive `env.KEY` reads.
//
// Used by: tests/unit/alerts/tokens.test.ts (PROJECT_SECRET fail-closed test).

export const env: Record<string, string | undefined> = new Proxy(
  {},
  {
    get(_target, key: string): string | undefined {
      return process.env[key];
    },
    set(_target, key: string, value: string | undefined): boolean {
      if (value === undefined) {
        delete process.env[key as string];
      } else {
        process.env[key as string] = String(value);
      }
      return true;
    }
  }
) as Record<string, string | undefined>;
