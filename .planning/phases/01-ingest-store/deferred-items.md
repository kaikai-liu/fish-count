# Deferred Items — Phase 01 Ingest + Store

Items discovered during execution that are out-of-scope for the current plan
but should be addressed in a later plan or phase.

## From 01-01 (DAL bootstrap)

| Discovered | File | Issue | Disposition |
|------------|------|-------|-------------|
| 2026-04-24 | `vite.config.ts` | `svelte-check` reports "No overload matches this call" for the `test:` key on `defineConfig`'s `UserConfigExport`. Runtime works (vitest picks it up via its own config) but typecheck fails. Pre-existing from Phase 0. | Defer — unrelated to Phase 1 DAL work; fix by switching to `vitest/config` or a dedicated `vitest.config.ts` in a later phase. |
| 2026-04-24 | `src/lib/ops/billing.ts:11` | `import { today } from '../shared/dates.ts'` triggers `svelte-check` error "An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled." Pre-existing — the `.ts` suffix is intentional per billing-watcher CLI context comment. | Defer — deliberate Phase 0 convention; either enable `allowImportingTsExtensions` in tsconfig or refactor to avoid `.ts` suffix in a later plan. |

## From 01-09 (phase gate)

| Discovered | File | Issue | Disposition |
|------------|------|-------|-------------|
| 2026-04-24 | `src/lib/scraper/parser.ts:40` | Same `.ts`-extension import error as `billing.ts`. `import ... from '../shared/dates.ts'` triggers `svelte-check` "allowImportingTsExtensions" error. Pre-existing from 01-03 (commit 83f9454). | Defer — part of the same CLI-import convention tracked above; single tsconfig fix resolves all sites. |
| 2026-04-24 | repo-wide (no prettier config) | `npm run lint` (`prettier --check .`) flags ~250 files. Codebase uses single-quote style but no `.prettierrc` / `prettier` key in package.json exists, so prettier defaults to double-quote and flags everything. Pre-existing since Phase 0 scaffolding. Zero files touched by Plan 01-09 were added as net-new lint violations; the style of the new 01-09 files matches the surrounding codebase convention. | Defer — add a committed `.prettierrc` (e.g., `{ "singleQuote": true, "trailingComma": "none" }`) in a dedicated housekeeping plan, then run `npm run format` once. Out-of-scope for Phase 1 functional plans. |
