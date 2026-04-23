# Phase 00 Deferred Items

Items discovered during Phase 00 execution that are OUT OF SCOPE of the task that found them.
These must be addressed in a later plan or deliberately accepted as known-low-risk.

## From Plan 00-02 (Logger, 2026-04-23)

### vite.config.ts svelte-check error (pre-existing)

- **Discovered during:** Task 2 verification (`npm run check`)
- **File:** `vite.config.ts` (line 7)
- **Error:** `"No overload matches this call. The last overload gave the following error. Object literal may only specify known properties, and 'test' does not exist in type 'UserConfigExport'."`
- **Cause:** The config imports from `vite` instead of `vitest/config`, so the top-level `test` property isn't recognized by Vite's `UserConfigExport`. Runtime still works because Vitest reads the same file.
- **Scope:** Pre-existing from Plan 00-00; not introduced or touched by Plan 00-02. Does NOT affect `npm run build` or `npm run test:run`.
- **Deferred to:** A later ops cleanup plan (probably as part of a CI-green pass). Either split the config into `vite.config.ts` + `vitest.config.ts`, or use `defineConfig` from `vitest/config` with Vite plugin merging.
- **Status:** Known, not fixed.
