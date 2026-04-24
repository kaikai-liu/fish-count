# Deferred Items — Phase 01 Ingest + Store

Items discovered during execution that are out-of-scope for the current plan
but should be addressed in a later plan or phase.

## From 01-01 (DAL bootstrap)

| Discovered | File | Issue | Disposition |
|------------|------|-------|-------------|
| 2026-04-24 | `vite.config.ts` | `svelte-check` reports "No overload matches this call" for the `test:` key on `defineConfig`'s `UserConfigExport`. Runtime works (vitest picks it up via its own config) but typecheck fails. Pre-existing from Phase 0. | Defer — unrelated to Phase 1 DAL work; fix by switching to `vitest/config` or a dedicated `vitest.config.ts` in a later phase. |
| 2026-04-24 | `src/lib/ops/billing.ts:11` | `import { today } from '../shared/dates.ts'` triggers `svelte-check` error "An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled." Pre-existing — the `.ts` suffix is intentional per billing-watcher CLI context comment. | Defer — deliberate Phase 0 convention; either enable `allowImportingTsExtensions` in tsconfig or refactor to avoid `.ts` suffix in a later plan. |
