---
phase: 00-ops-guardrails
plan: 00
plan_number: 0
subsystem: scaffold
tags: [scaffold, sveltekit, typescript, tailwind, vitest, docker, fly]
dependency_graph:
  requires: []
  provides:
    - "SvelteKit Node adapter app (builds into build/index.js)"
    - "GET /healthz returns {ok:true} JSON"
    - "GET / renders minimal FishCount landing page"
    - "src/lib/server/logger.ts placeholder contract (info/warn/error/child)"
    - "src/lib/server/startup.ts placeholder contract (runStartup())"
    - "src/lib/shared/dates.ts sole producer of America/Los_Angeles date strings"
    - "vitest test runner + tests/{unit,fixtures,scheduler,ops,lib}/ skeleton"
    - "Dockerfile (Node 22 multi-stage, Litestream stage deferred to Plan 01)"
    - "fly.toml (sjc, 512mb, 1gb volume at /data, force_https)"
    - "scripts/entrypoint.sh scaffold entrypoint (Plan 01 replaces with Litestream wrap)"
    - ".env.example documenting every Phase 0 env var"
  affects:
    - "Plans 01-06 all build on top of this scaffold"
tech_stack:
  added:
    - "@sveltejs/kit 2.57.1"
    - "svelte 5.55.4"
    - "@sveltejs/adapter-node 5.5.4"
    - "@sveltejs/vite-plugin-svelte 5.1.1 (upgraded from plan's ^4.0.0 for vite 6 compat)"
    - "vite 6.4.2"
    - "vitest 2.1.9"
    - "typescript 5.9.3"
    - "tailwindcss 4.2.4 + @tailwindcss/vite 4.2.4"
    - "pino 10.3.1"
    - "croner 10.0.1"
    - "resend 6.12.2"
    - "pino-pretty 13.1.3 (dev-only)"
    - "@vitest/coverage-v8 2.1.9"
    - "svelte-check 4.4.6"
    - "@types/node 22.19.17"
  patterns:
    - "Modular monolith: one SvelteKit deployment, future one SQLite DB"
    - "Placeholder module contract pattern: logger/startup export shapes locked for downstream plans"
    - "Single date producer: America/Los_Angeles YYYY-MM-DD via Intl.DateTimeFormat en-CA locale"
    - "Multi-stage Docker with npm prune --omit=dev for smaller runtime image"
key_files:
  created:
    - {path: "package.json", lines: 43, purpose: "Node project manifest; SvelteKit 2.57, vitest 2, pino 10, croner 10, resend 6"}
    - {path: "package-lock.json", lines: "generated", purpose: "Reproducible install (supply-chain mitigation T-00-03)"}
    - {path: "tsconfig.json", lines: 16, purpose: "Extends .svelte-kit tsconfig; strict mode"}
    - {path: "svelte.config.js", lines: 13, purpose: "adapter-node (not adapter-auto); out=build/"}
    - {path: "vite.config.ts", lines: 13, purpose: "Tailwind 4 Vite plugin + SvelteKit + inline test block (node env)"}
    - {path: "vitest.config.ts", lines: 17, purpose: "Dedicated vitest config with v8 coverage; passWithNoTests enabled"}
    - {path: "tailwind.config.ts", lines: 4, purpose: "Tailwind 4 content scanning src/**"}
    - {path: "postcss.config.js", lines: 1, purpose: "Empty PostCSS config (Svelte scoped styles interop)"}
    - {path: "src/app.html", lines: 13, purpose: "SvelteKit shell (FishCount title, favicon, viewport)"}
    - {path: "src/app.css", lines: 1, purpose: "@import 'tailwindcss'"}
    - {path: "src/app.d.ts", lines: 14, purpose: "Global App namespace (Plan 02 will add logger/requestId to Locals)"}
    - {path: "src/hooks.server.ts", lines: 11, purpose: "Handle hook calling runStartup() and logger.info per request"}
    - {path: "src/routes/+page.svelte", lines: 11, purpose: "Minimal FishCount landing page"}
    - {path: "src/routes/healthz/+server.ts", lines: 2, purpose: "GET /healthz returning {ok:true, service, ts}"}
    - {path: "src/lib/server/logger.ts", lines: 8, purpose: "Placeholder pino-compatible logger (info/warn/error/child) — Plan 02 replaces"}
    - {path: "src/lib/server/startup.ts", lines: 11, purpose: "Placeholder runStartup() idempotent (uses `started` flag) — Plan 03 replaces"}
    - {path: "src/lib/shared/dates.ts", lines: 29, purpose: "Sole America/Los_Angeles date producer (today, toIsoDate, currentPtMonth)"}
    - {path: "Dockerfile", lines: 28, purpose: "Node 22 multi-stage (builder + runtime); Plan 01 will add Litestream stage"}
    - {path: ".dockerignore", lines: 14, purpose: "Excludes node_modules, .env, tests, .planning; keeps CLAUDE.md"}
    - {path: "scripts/entrypoint.sh", lines: 11, purpose: "Scaffold entrypoint exec node build/index.js (Plan 01 wraps with Litestream)"}
    - {path: "fly.toml", lines: 32, purpose: "Fly app config (sjc, 512mb, 1gb volume at /data, force_https, min_machines=1)"}
    - {path: ".env.example", lines: 33, purpose: "Documents all Phase 0 env vars (commented defaults; prod values via fly secrets)"}
    - {path: ".gitignore", lines: 18, purpose: "Excludes node_modules, build, .svelte-kit, .env*, *.sqlite3*, /data/, billing state"}
    - {path: "tests/unit/.gitkeep", lines: 0, purpose: "Directory skeleton for billing/kill-switch/logger unit tests"}
    - {path: "tests/fixtures/.gitkeep", lines: 0, purpose: "Directory skeleton for mock Fly GraphQL fixtures etc."}
    - {path: "tests/scheduler/.gitkeep", lines: 0, purpose: "Directory skeleton for Plan 03 scheduler tests"}
    - {path: "tests/ops/.gitkeep", lines: 0, purpose: "Directory skeleton for Plan 04/05 ops tests"}
    - {path: "tests/lib/.gitkeep", lines: 0, purpose: "Directory skeleton for general lib tests"}
    - {path: "README.md", lines: 25, purpose: "Contributor orientation: local dev + container commands + links to planning docs"}
  modified: []
decisions:
  - "@sveltejs/vite-plugin-svelte pinned to ^5.1.0 instead of plan's ^4.0.0: v4 peers vite@^5 only; vite@6 requires v5+. Verified resolved 5.1.1. (Rule 3 - blocking issue auto-fixed)"
  - "Vitest passWithNoTests: true: plan requires `npm run test:run` to exit 0 with no tests yet; vitest 2.x default is exit 1. (Rule 3 - blocking issue auto-fixed)"
  - "Dockerfile uses literal 'FROM node:22-bookworm-slim' (not ARG NODE_VERSION): the plan's must_haves.artifacts contract asserts substring 'FROM node:22-bookworm-slim'; an ARG-interpolated form would not match that string-grep assertion. (Rule 3 - blocking issue auto-fixed)"
metrics:
  duration: "~4 minutes"
  completed_date: "2026-04-23"
  tasks_completed: 3
  files_created: 29
---

# Phase 00 Plan 00: Scaffold Summary

Greenfield FishCount scaffold — SvelteKit 2.57 + Svelte 5.55 + TypeScript 5.9 + Tailwind 4.2 + vitest 2.1 + Node 22 multi-stage Dockerfile + fly.toml — builds, tests, serves `/healthz {ok:true}` and renders the FishCount landing page locally; every downstream Phase 0 plan (Litestream, logging, kill switch, dead-man's switch, billing, deploy) can now layer in.

## Files Created (29 files, 368 lines of hand-written source excluding generated lockfile)

**Project root config:**
- `package.json` (43 lines)
- `package-lock.json` (auto-generated, ~200 KB, reproducible installs)
- `tsconfig.json` (16), `svelte.config.js` (13), `vite.config.ts` (13), `vitest.config.ts` (17)
- `tailwind.config.ts` (4), `postcss.config.js` (1)
- `.gitignore` (18), `.env.example` (33)
- `README.md` (25)

**Application source (`src/`):**
- `src/app.html` (13), `src/app.css` (1), `src/app.d.ts` (14)
- `src/hooks.server.ts` (11)
- `src/routes/+page.svelte` (11), `src/routes/healthz/+server.ts` (2)
- `src/lib/server/logger.ts` (8 — placeholder)
- `src/lib/server/startup.ts` (11 — placeholder)
- `src/lib/shared/dates.ts` (29 — CLAUDE.md architecture rule enforcer)

**Container + Fly:**
- `Dockerfile` (28), `.dockerignore` (14)
- `scripts/entrypoint.sh` (11, executable)
- `fly.toml` (32)

**Test skeleton:**
- `tests/{unit,fixtures,scheduler,ops,lib}/.gitkeep` (5 empty directory markers)

## Dependency Versions Installed (from package-lock.json)

| Package | Installed | Plan Target |
|---|---|---|
| @sveltejs/kit | 2.57.1 | ^2.57.1 |
| svelte | 5.55.4 | ^5.55.4 |
| @sveltejs/adapter-node | 5.5.4 | ^5.2.0 |
| @sveltejs/vite-plugin-svelte | **5.1.1** | ^4.0.0 (adjusted to ^5.1.0 — see Deviations) |
| @tailwindcss/vite | 4.2.4 | ^4.2.4 |
| tailwindcss | 4.2.4 | ^4.2.4 |
| typescript | 5.9.3 | ^5.7.0 |
| vite | 6.4.2 | ^6.0.0 |
| vitest | 2.1.9 | ^2.1.0 |
| @vitest/coverage-v8 | 2.1.9 | ^2.1.0 |
| svelte-check | 4.4.6 | ^4.0.0 |
| @types/node | 22.19.17 | ^22.10.0 |
| pino | 10.3.1 | ^10.3.1 |
| pino-pretty | 13.1.3 | ^13.0.0 |
| croner | 10.0.1 | ^10.0.1 |
| resend | 6.12.2 | ^6.12.2 |

All versions exist on npm as of 2026-04-23.

## Build Output

```
-rw-r--r--  10,114 bytes  build/index.js
```

Produced by `npm run build` after a clean (`rm -rf node_modules build .svelte-kit && npm install && npm run build`). Server starts successfully on `PORT=3099 node build/index.js`, responds with `{"ok":true,"service":"fishcount","ts":"…"}` at `/healthz` and renders the FishCount landing page at `/`.

## Placeholder Contracts (Downstream Plans 01-06 MUST Preserve)

Plans 01-06 replace the bodies of these modules but MUST preserve the exported shapes below, otherwise `src/hooks.server.ts` and any future consumer will fail to compile.

### `src/lib/server/logger.ts`

```typescript
export const logger = {
  info: (...a: unknown[]) => void,
  warn: (...a: unknown[]) => void,
  error: (...a: unknown[]) => void,
  child: (bindings: Record<string, unknown>) => typeof logger
};
```

Plan 02 (OPS-06 structured logging) will replace the body with a full pino configuration (redaction, child loggers, async transport, dev pretty-print via pino-pretty) but must keep the same four method names and compatible signatures.

### `src/lib/server/startup.ts`

```typescript
export function runStartup(): void;  // idempotent — internally guarded by `started` flag
```

Plan 03 (OPS-05 kill switch) will replace the body with scheduler initialization (croner jobs for scraper, dead-man's switch ping, billing watcher). Idempotency guard must remain — SvelteKit may import `hooks.server.ts` more than once in dev HMR.

### `src/lib/shared/dates.ts`

```typescript
export function today(): string;                // YYYY-MM-DD in America/Los_Angeles
export function toIsoDate(d: Date): string;     // YYYY-MM-DD in America/Los_Angeles
export function currentPtMonth(): number;       // 1-12 in America/Los_Angeles
```

Per CLAUDE.md Architecture Rule: this is the **only** module allowed to format date strings. Downstream plans importing this module must not duplicate Intl.DateTimeFormat logic.

## Verification Results

| Check | Result |
|---|---|
| `npm install` on clean slate | exit 0 (290 packages) |
| `npm run build` | exit 0 — produced `build/index.js` (10,114 bytes) |
| `npm run test:run` | exit 0 ("No test files found") |
| Built server `PORT=3099 node build/index.js` + `curl /healthz` | HTTP 200 `{"ok":true,"service":"fishcount","ts":"…"}` |
| Built server `curl /` | HTTP 200, HTML contains "FishCount" |
| `docker build` | NOT RUN — Docker not installed on agent machine (see Deferred / Deviations) |
| Grep assertions from plan acceptance criteria | All passed (package.json keys, svelte.config adapter-node, vite env, dates.ts TZ, fly.toml keys, Dockerfile FROM and ENTRYPOINT, entrypoint executable, tests/ subdirs present) |

## Deviations from Plan

### Auto-fixed (Rule 3 — blocking issues)

**1. [Rule 3 - Blocking] Upgraded `@sveltejs/vite-plugin-svelte` from `^4.0.0` to `^5.1.0`**
- **Found during:** Task 1 `npm install`
- **Issue:** `npm install` failed with ERESOLVE — `@sveltejs/vite-plugin-svelte@4.0.4` declares `peer vite@"^5.0.0"`, but the plan also specified `vite@^6.0.0` (required to run the Tailwind 4 Vite plugin and current SvelteKit). There is no version of vite that satisfies both peer declarations simultaneously.
- **Fix:** Bumped to `@sveltejs/vite-plugin-svelte@^5.1.0` (latest v5 line; resolves to 5.1.1). v5.1.x peers `vite@^6.0.0` and `svelte@^5.0.0` — satisfies all constraints. v6+ of the plugin peers `vite@^7` or `^8` and would conflict with vite 6.
- **Files modified:** `package.json`
- **Commit:** `2c5b147`

**2. [Rule 3 - Blocking] Added `passWithNoTests: true` to vitest config**
- **Found during:** Task 1 verification (`npm run test:run`)
- **Issue:** Vitest 2.x exits with code 1 when no test files are found. Plan's acceptance criterion explicitly requires `npm run test:run` to exit 0 with no tests (and the message "No test files found" should be treated as success — tests are added by later plans).
- **Fix:** Added `passWithNoTests: true` to both the inline `test:` block in `vite.config.ts` (Task 1) and the dedicated `vitest.config.ts` (Task 2).
- **Files modified:** `vite.config.ts`, `vitest.config.ts`
- **Commits:** `2c5b147` (inline), `bf4ea7f` (vitest.config.ts)

**3. [Rule 3 - Blocking] Dockerfile uses literal `FROM node:22-bookworm-slim` instead of `ARG NODE_VERSION=22` + `FROM node:${NODE_VERSION}-...`**
- **Found during:** Task 2 acceptance criteria check
- **Issue:** The plan's must_haves artifacts contract asserts `contains: "FROM node:22-bookworm-slim"` as a literal substring. The ARG-interpolated form (`FROM node:${NODE_VERSION}-bookworm-slim`) is semantically equivalent for Docker but does not match that string-grep assertion. Downstream verifier / orchestrator checks would flag it as a missing contract.
- **Fix:** Dropped the `ARG NODE_VERSION=22` line and inlined `22` in both stages of the Dockerfile. Functionally identical for Node 22; trivial to reintroduce ARG later if we need to parameterise the version.
- **Files modified:** `Dockerfile`
- **Commit:** `bf4ea7f`

### Deferred (not blocking this plan)

**Docker build verification** — Docker is not installed on the agent machine (`docker --version` returns "not found"). The plan explicitly permits this deferral: "if Docker isn't installed skip this step and log DOCKER_UNAVAILABLE — Plan 06 will verify via `fly deploy --remote-only`". Plan 06 (deploy) will be the first real test of the Dockerfile.

## Threat Flags

None. No new trust boundaries or schemas introduced beyond what the plan's threat register anticipated. All Phase 0 runtime secrets remain out of the repo (`.gitignore` covers `.env*`, `*.sqlite3*`, `/data/`). Docker image avoids baking any secrets (secrets injected at runtime by Fly per T-00-02).

## Known Stubs (will be wired by downstream plans)

These stubs are intentional and documented — each corresponds to a named downstream plan that will replace it:

- `src/lib/server/logger.ts` — console.log-based placeholder; **Plan 02 (OPS-06 structured logging)** replaces with full pino configuration.
- `src/lib/server/startup.ts` — empty idempotent placeholder; **Plan 03 (OPS-05 kill switch)** replaces with scheduler initialization.
- `scripts/entrypoint.sh` — execs `node build/index.js` directly; **Plan 01 (OPS-03 Litestream)** replaces with `litestream restore -if-db-not-exists -if-replica-exists … && exec litestream replicate -exec "node build/index.js"`.
- `Dockerfile` has no Litestream binary stage yet; **Plan 01** adds it.
- `tests/*/` directories contain only `.gitkeep` markers; **Plans 01-06** will each populate their own test files per `00-VALIDATION.md`.

None of these stubs block the scaffold goal (locally-buildable/testable SvelteKit app with Node adapter + Fly config + test harness). Each is explicitly scoped to a future plan in the roadmap.

## Commits

| Hash | Task | Summary |
|---|---|---|
| `2c5b147` | Task 1 | feat(00-00): scaffold SvelteKit + TypeScript + Tailwind project root |
| `bf4ea7f` | Task 2 | feat(00-00): add Dockerfile, fly.toml, entrypoint, vitest config, test skeleton |
| `f6a3dc9` | Task 3 | docs(00-00): add README with local dev and container commands |

## Self-Check: PASSED

- Files claimed created in this SUMMARY: all 29 exist at their stated paths (`git ls-files` confirms; `test -f`/`test -d` assertions all pass for the listed paths + tests subdirectories).
- Commits claimed: `2c5b147`, `bf4ea7f`, `f6a3dc9` all present in `git log --oneline` and reachable from HEAD on branch `worktree-agent-a847253e`.
- Verification commands: clean `npm install` + `npm run build` + `npm run test:run` + `curl /healthz` all executed and passed during Task 3 verification sequence; outputs captured above.
