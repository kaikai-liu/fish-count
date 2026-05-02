---
phase: 08-home-retire-polish
plan: 02
subsystem: ui
tags: [phase-8, home, admin, alias, ui, svelte5, sqlite, hmac, sveltekit]

# Dependency graph
requires:
  - phase: 08-home-retire-polish-plan-01
    provides: ALIAS_JOIN_SQL + CANONICAL_TRIP_TYPE_EXPR — SQL fragments for alias-aware reads; upsertAlias / listAllLabelsWithStatus DAL CRUD; trip_type_aliases seed (3 aliased + 11 accepted + 12 pending)
  - phase: 06-explorer-foundation
    provides: PageHeader / EmptyState / BoatRow / BoatCard component shapes; explorer.ts speciesAcrossBoats two-pass top-N pattern
  - phase: 07-moon-phase-overlay
    provides: src/lib/copy/moon.ts module-header convention; cache-control discipline on hot loaders
provides:
  - "/" home loader returning per-trip-type sections (HOME-01..05) — replaces v1 today's-counts dashboard
  - homeSections(db, args) — two-pass alias-aware DAL query
  - Per-section bar normalization (D-10) — Overnight (~1 fpa) and 3.5 Day (~35 fpa) sections both fill their own scale
  - NewLabelBadge component + per-row pending flag (D-05 / HOME-04)
  - HMAC-signed-cookie admin gate (D-04, ALI-03) — fc_admin cookie, 24h TTL, timing-safe verify
  - /admin/trip-types route — operator UI to alias / accept / reset every distinct source_label (ALI-04)
  - /admin/trip-types/login route — single-password gate; generic "Invalid password" copy (Security V7)
  - barWidthPct pure helper in src/lib/shared/normalize.ts
affects: [phase-08-plan-03-retire, phase-08-plan-04-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - HMAC-signed-cookie auth (Node crypto only) — no JWT library
    - Per-route auth gate with defense-in-depth re-check on every form action
    - Read-time alias-aware queries via Wave-1 ALIAS_JOIN_SQL + CANONICAL_TRIP_TYPE_EXPR
    - Two-pass aggregation: viable canonicals, then top-N per canonical (mirrors explorer.speciesAcrossBoats)
    - Per-section bar normalization for variable-scale data
    - NODE_ENV gate (rather than $app/environment) for vitest-compatibility on cookie Secure flag
    - Datalist-based typeahead (no JS reimplementation)

key-files:
  created:
    - src/lib/db/queries/home.ts
    - src/lib/auth/admin.ts
    - src/lib/copy/home.ts
    - src/lib/copy/admin.ts
    - src/lib/shared/normalize.ts
    - src/lib/components/NewLabelBadge.svelte
    - src/lib/components/HomeSectionCard.svelte
    - src/lib/components/BoatBarRow.svelte
    - src/routes/admin/trip-types/+page.server.ts
    - src/routes/admin/trip-types/+page.svelte
    - src/routes/admin/trip-types/login/+page.server.ts
    - src/routes/admin/trip-types/login/+page.svelte
    - tests/unit/db/queries/home.test.ts
    - tests/unit/auth/admin.test.ts
    - tests/unit/lib/bar-normalize.test.ts
    - tests/integration/routes/home.test.ts
    - tests/integration/admin/trip-types.test.ts
  modified:
    - src/routes/+page.server.ts
    - src/routes/+page.svelte

key-decisions:
  - "Read NODE_ENV directly in /admin/trip-types/login server instead of `import { dev } from '$app/environment'`. Same gate at runtime; the SvelteKit virtual module isn't resolvable under vitest and aliasing it via vitest.config.ts didn't take. Smallest viable fix; removes a vitest-only failure mode."
  - "Per-section bar normalization (D-10) lives in BoatBarRow via $derived(barWidthPct(row.fpa, sectionMax)). barWidthPct is a pure function in src/lib/shared/normalize.ts so it gets unit tests for the degenerate-zero and overflow-clamp cases."
  - "Section-level `status` resolution: derive from a single SELECT on trip_type_aliases WHERE canonical_label = source_label, then look up in JS — keeps the Pass 1 SQL a single GROUP BY with a HAVING. Per-row `pending` flag uses MAX(CASE WHEN tta.status='pending' THEN 1 ELSE 0 END)."
  - "Admin form actions use SvelteKit named actions (?/alias, ?/accept, ?/reset, ?/logout) with per-action auth re-check — load gate alone isn't enough; actions are independent entry points."
  - "Datalist <input list='canonical-options'> over a JS typeahead — RESEARCH 'Don't Hand-Roll' applies; the platform's typeahead is what we want."

patterns-established:
  - "Pattern: HMAC-signed cookie with 24h TTL via Node crypto. No external JWT library. Payload {admin: true, iat} base64url; signature appended after `.`. verifyAdminCookie returns false on any malformed input — never throws."
  - "Pattern: per-route auth gate redirects to /admin/trip-types/login on bad/missing cookie; cache-control: private, no-store on every admin response."
  - "Pattern: defense-in-depth re-check — every form action calls verifyAdminCookie before mutating. Load gate alone wouldn't protect direct POST to action endpoints."
  - "Pattern: two-pass home query mirrors explorer.speciesAcrossBoats — Pass 1 finds viable buckets (HAVING trip_count >= @minTrips), Pass 2 runs once per Pass-1 row to fetch top-N by fpa."
  - "Pattern: Cache-Control discipline by trust boundary — / is public + max-age=300; /admin/* is private + no-store always."
  - "Pattern: cookie name fc_admin with HttpOnly + SameSite=Strict + Path=/admin + Max-Age=86400; Secure only when NODE_ENV='production'."

requirements-completed: [HOME-01, HOME-02, HOME-03, HOME-04, HOME-05, ALI-03, ALI-04]

# Metrics
duration: ~25min (resume run); plus prior partial runs (~45min total wall-clock across rate-limit pauses)
completed: 2026-05-02
---

# Phase 8 Plan 02: Home Page + Admin Trip-Types Summary

**"What's been biting" front door at `/` (per-trip-type sections, top-5 by fish/angler, NEW badges) plus password-gated `/admin/trip-types` (HMAC-signed cookie, 25-row alias adjudication UI).**

## Performance

- **Duration (resume run):** ~25 minutes
- **Started (resume):** 2026-05-02T14:30:00Z (after rate-limit reset)
- **Completed:** 2026-05-02T14:42:00Z
- **Tasks completed across runs:** 3 (Task 1: DAL + auth + bar-normalize; Task 2: home page UI + replace; Task 3: admin route + login + integration)
- **Files modified/created (this plan total):** 19 (12 src files + 7 test files; 2 src/routes files replaced rather than created)

## Accomplishments

- **Home page front door:** `/` renders 6 trip-type sections in current dev-DB data (1/2 Day AM 17 trips, Full Day 15, 1/2 Day PM 8, 1.5 Day 6, 2 Day 5, 3 Day 5) — sorted by trip count DESC, top-5 boats by fish/angler per section, with per-section bar normalization. Curl-confirmed 27 boat rows linking to `/explorer?ticker=boat&slug=…`.
- **Admin trip-types adjudication UI:** `/admin/trip-types` shows all 25 distinct source_labels in dev DB with status (Aliased / Canonical / Pending review). 12 NEW badges visible against pending labels. Alias / accept / reset / logout form actions all functional end-to-end (verified by POSTing through curl + reading rows back from sqlite).
- **Auth surface complete:** HMAC-signed `fc_admin` cookie with 24h TTL. Wrong password → 401 + "Invalid password". Tampered cookie → 401, no DB write. Logout clears cookie + redirects.
- **All 36 plan tests green** (7 home query unit + 11 admin auth unit + 4 bar-normalize unit + 5 home integration + 9 admin integration).

## Task Commits

Each task was committed atomically across resume runs:

1. **Task 1: Home query DAL + auth helper + Wave-0 unit tests** — RED `a2f5e65` (test) + GREEN `1beb773` (feat)
2. **Task 2: Home page UI — replace v1 root +page** — `075041d` (feat)
3. **Task 3: Admin route — /admin/trip-types login + list/CRUD + integration test** — `fedeb87` (wip — initial scaffolding) + `b577dcf` (this run — finishing fixes)

**Plan metadata:** Next commit (this SUMMARY).

## Files Created/Modified

### Created in this plan

- `src/lib/db/queries/home.ts` — homeSections(db, args) two-pass query. Alias-aware via Wave-1's ALIAS_JOIN_SQL + CANONICAL_TRIP_TYPE_EXPR. Returns HomeSection[] with status + per-row pending flag.
- `src/lib/auth/admin.ts` — checkPassword (timing-safe compare), signAdminCookie (HMAC-SHA256 over ADMIN_COOKIE_SECRET; base64url payload), verifyAdminCookie (timing-safe sig check + 24h TTL).
- `src/lib/copy/home.ts` — HOME_PAGE_TITLE / HEADING / SUBTITLE; sectionHeading; ROW_FPA_LINE; ROW_TOTALS_LINE; EMPTY_HOME_*. CLAUDE.md domain-language verbatim.
- `src/lib/copy/admin.ts` — ADMIN_PAGE_TITLE / HEADING / SUBTITLE; STATUS_LABELS; ACTION_*; LOGIN_INVALID; etc.
- `src/lib/shared/normalize.ts` — barWidthPct(rowFpa, sectionMax) pure helper. Returns 0 on sectionMax<=0; clamps overflow to 100.
- `src/lib/components/NewLabelBadge.svelte` — D-05 NEW pill, reuses --color-provisional / -bg.
- `src/lib/components/HomeSectionCard.svelte` — Per-canonical section heading + N BoatBarRows. $derived sectionMax for normalization.
- `src/lib/components/BoatBarRow.svelte` — Single row: relative-positioned bar bg + boat-name link + fpa/trip-count headline + anglers/total context. NewLabelBadge inline when pending.
- `src/routes/admin/trip-types/+page.server.ts` — load() + alias / accept / reset / logout actions, each re-verifying fc_admin cookie.
- `src/routes/admin/trip-types/+page.svelte` — Mobile-first table-becomes-stacked-cards UI; per-row inline form actions; datalist typeahead.
- `src/routes/admin/trip-types/login/+page.server.ts` — Login form action.
- `src/routes/admin/trip-types/login/+page.svelte` — Single password input.
- `tests/unit/db/queries/home.test.ts` — H1..H7 (7 cases).
- `tests/unit/auth/admin.test.ts` — A1..A5 (11 cases).
- `tests/unit/lib/bar-normalize.test.ts` — B1..B3 (4 cases).
- `tests/integration/routes/home.test.ts` — I1..I5 (5 cases).
- `tests/integration/admin/trip-types.test.ts` — T1..T9 (9 cases).

### Modified in this plan

- `src/routes/+page.server.ts` — REPLACED v1 today's-counts loader with homeSections() loader. Past-7-day window, no URL state, public + max-age=300 cache.
- `src/routes/+page.svelte` — REPLACED v1 dashboard with PageHeader + per-section HomeSectionCard list + EmptyState fallback.

## Decisions Made

See `key-decisions` in frontmatter for the full list. Highlights:

- **NODE_ENV instead of `$app/environment`** for the Secure-cookie gate.
- **Per-route auth gate** (Wave 4 will hoist to hooks.server.ts) — every form action re-verifies the cookie before mutating.
- **Datalist typeahead** for the canonical-label input — uses platform's `<input list>`.
- **Pass 2 single prepared statement** run once per Pass-1 row — typically 6-7 iterations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Replaced `import { dev } from '$app/environment'` with `process.env.NODE_ENV === 'production'`**

- **Found during:** Task 3 verification (integration test execution)
- **Issue:** vitest reports `Failed to load url $app/environment` — SvelteKit plugin not active under vitest. Two of the nine admin integration tests (T3, T4) couldn't load the login module. Aliasing `$app/environment` in `vitest.config.ts` (string and regex) did not take.
- **Fix:** Stop importing the SvelteKit virtual module. Read `process.env.NODE_ENV` directly. Secure-cookie gate unchanged at runtime: `secure: isProd` where `isProd = process.env.NODE_ENV === 'production'`.
- **Files modified:** `src/routes/admin/trip-types/login/+page.server.ts`
- **Verification:** All 9 admin integration tests now green; manual self-validation confirms cookie flags are correct in dev (HttpOnly + SameSite=Strict + Path=/admin + Max-Age=86400; Secure absent because !isProd).
- **Committed in:** `b577dcf`

**2. [Rule 1 — Bug] Type-narrowing on `form` prop in admin trip-types page**

- **Found during:** Task 3 verification (`npm run check`)
- **Issue:** `+page.svelte` checked `form?.success && form?.message` but svelte-check generates a discriminated-union shape; optional-chaining doesn't narrow.
- **Fix:** Use explicit `'success' in form` / `'error' in form` discriminators.
- **Files modified:** `src/routes/admin/trip-types/+page.svelte`
- **Verification:** `npm run check` no longer flags this file; visible behavior identical.
- **Committed in:** `b577dcf`

**3. [Rule 1 — Bug] `load()` return-type narrowing in admin integration test**

- **Found during:** Task 3 verification (`npm run check`)
- **Issue:** SvelteKit generates `load`'s return type as `void | PageData` (loader can `throw redirect()`). The test's `result.labels.length` access was invalid against `void`.
- **Fix:** Cast the awaited return to `{ labels: unknown[] }` at the call site — T2 only exercises the non-redirect branch.
- **Files modified:** `tests/integration/admin/trip-types.test.ts`
- **Verification:** `npm run check` no longer flags this file; T2 still passes.
- **Committed in:** `b577dcf`

**4. [Rule 3 — Blocking, environmental] Generated `.svelte-kit/tsconfig.json`**

- **Found during:** Task 1 verification (vitest can't transform without it)
- **Issue:** Worktree was reset to a base before any svelte-kit sync had run. `tsconfig.json` extends a non-existent `./.svelte-kit/tsconfig.json`. Vitest fails with `TSConfckParseError`.
- **Fix:** `npx svelte-kit sync` once.
- **Verification:** All 36 plan tests run green afterward.
- **Committed in:** N/A — `.svelte-kit/` is gitignored; this is a worktree-local prereq.

---

**Total deviations:** 4 auto-fixed (1 blocking environmental, 1 blocking Rule 3, 2 type-narrowing Rule 1 bugs). All in service of getting test/check to green; none change runtime behavior in prod.
**Impact on plan:** No scope creep.

## Issues Encountered

- **Rate-limit pause across two sessions.** Prior session shipped Tasks 1, 2, and Task 3 scaffolding. This resume session ran `npx svelte-kit sync`, fixed three small type/import issues uncovered by the full test + check pass, and shipped this SUMMARY.
- **Edit/Write tool returned success but content didn't persist for `src/routes/admin/trip-types/login/+page.server.ts` and the SUMMARY itself (twice).** Worked around with shell heredoc (`cat > path << 'EOF' … EOF`). Did not block completion.
- **Pre-existing failures in unrelated tests** (Phase 2 today's-counts route tests, Phase 3 forecast scrape-tick hooks, explorer.test.ts series-name expectations) are out of 08-02 scope — they're 08-03's retirement-sweep concerns. Logged here for traceability; left for the parallel 08-03 worktree.

## User Setup Required

**Admin route requires two env vars (operator-set, not committed):**

- `ADMIN_PASSWORD` — operator chooses a strong password.
- `ADMIN_COOKIE_SECRET` — operator runs `openssl rand -hex 32`. Used to HMAC-sign the `fc_admin` cookie.

Without `ADMIN_COOKIE_SECRET`, login returns 503 "Admin auth is not configured on this server. Set ADMIN_COOKIE_SECRET." rather than a stack trace.

Home page `/` requires no operator setup.

## Cache-Control + Cookie Inventory (per plan output spec)

| Route | Cache-Control | Why |
|-------|---------------|-----|
| `/` | `public, max-age=300` | D-15 hot-path discipline |
| `/admin/trip-types` | `private, no-store` | Admin pages must not be CDN-cached |
| `/admin/trip-types/login` | `private, no-store` | Same — never cache a login form |

| Cookie name | Flags | Notes |
|-------------|-------|-------|
| `fc_admin` | `HttpOnly`, `SameSite=Strict`, `Path=/admin`, `Max-Age=86400` (24h), `Secure` only when `NODE_ENV=production` | HMAC-SHA256 signed with `ADMIN_COOKIE_SECRET`. 24h TTL enforced server-side. `Path=/admin` keeps admin trust scoped tight. |

## Manual Self-Validation (D-40)

Run by curl + sqlite3 against the local dev server (`DB_PATH=…/data/dev.sqlite3 ADMIN_PASSWORD=test ADMIN_COOKIE_SECRET=$(openssl rand -hex 32) npm run dev -- --port 5180`).

| Check | Outcome | Evidence |
|-------|---------|----------|
| `GET /` returns 200 with title "What's been biting — FishCount" | PASS | Title in response body |
| Sections render and sort by trip_count DESC | PASS | 6 sections: 1/2 Day AM (17), Full Day (15), 1/2 Day PM (8), 1.5 Day (6), 2 Day (5), 3 Day (5) |
| Per-row links go to /explorer?ticker=boat&slug=… | PASS | 27 such links across 6 sections |
| Cache-Control: public, max-age=300 set on / | PASS | Header inspected via curl -sSI |
| GET /admin/trip-types without cookie redirects to login | PASS | 303 + Location: /admin/trip-types/login |
| Login with wrong password → 401 + generic "Invalid password" | PASS | failure JSON: status=401, error="Invalid password" |
| Login with right password → 303 + sets fc_admin cookie | PASS | Set-Cookie: fc_admin=…; Max-Age=86400; Path=/admin; HttpOnly; SameSite=Strict |
| GET /admin/trip-types with valid cookie → 25 distinct labels | PASS | 25 distinct hidden source_label inputs |
| 12 NEW badges visible (one per pending label in seed) | PASS | 12 aria-label="New trip-type label, awaiting review" matches |
| ?/alias action persists row with status='aliased' | PASS | sqlite SELECT confirms TestLabelXYZ\|Full Day\|aliased |
| Tampered cookie → 401 + no DB write | PASS | 401 + sqlite COUNT(*) = 0 |
| ?/logout clears cookie + redirects to login | PASS | Set-Cookie: fc_admin=; Max-Age=0; redirect 303 |
| Cache-Control: private, no-store on both admin routes | PASS | Header inspected via curl -sSI |

**Browser screenshots at desktop and 375px:** Not captured in this resume run (curl-based environment). The HTML response shape is correct (Tailwind ships min-h-11, flex flex-wrap, mobile-first stacked-card layout in admin route, no overflow-causing fixed widths). Operator should run `npm run dev` locally and self-validate per D-40 if visual screenshots are wanted in version control — Wave 4 polish-pass plan can capture them.

## Deferred / Out-of-Scope Issues

Tracked here so they don't get lost:

- `tests/integration/phase2-routes.test.ts` (3 cases) — tests v1 `/` shape we replaced. Will fail until 08-03 retires it.
- `tests/scheduler/scrape-tick.test.ts` (2 cases) — tests Phase 3 forecast recompute hook. Wave 1 dropped forecasts.
- `tests/unit/routes/explorer.test.ts:7` — expects `'Full Day Coronado Islands'` as a series label. Wave 1's alias merge collapses to `'Full Day'`. Stale expectation.
- 90 `npm run check` errors total — almost all in retired-route tests (`tests/unit/routes/{compare,date,boats,landings,trips}.test.ts`). Plan 08-03 retires these tests + routes.

None of the above touch `/`, `/admin/trip-types`, or `/admin/trip-types/login` paths. Plan 08-02 surface is clean.

## Threat Flags

None. No new trust boundaries beyond those declared in the plan's `<threat_model>`.

## Next Phase Readiness

- Home page mounted at `/` is shareable.
- Admin route is operator-ready. The 12 pending labels in the seed are sitting in `/admin/trip-types` waiting for adjudication. Operator can alias them or accept them; home page picks up changes on next load (no rebuild).
- Wave 4 (polish) can hoist the per-route auth gate into `hooks.server.ts`.
- Wave 3 (retire) needs to handle the deferred test failures listed above. No 08-02 surface area to clean up.

## Self-Check: PASSED

Verified before commit:
- All 17 created files exist on disk
- All 2 modified files (root +page.server.ts, +page.svelte) reflect the home-page replacement
- Commits a2f5e65, 1beb773, 075041d, fedeb87, b577dcf all in `git log`
- 36 plan tests green: `npm run test:run -- tests/unit/db/queries/home.test.ts tests/unit/lib/bar-normalize.test.ts tests/unit/auth/admin.test.ts tests/integration/routes/home.test.ts tests/integration/admin/trip-types.test.ts` exits 0

---
*Phase: 08-home-retire-polish, Plan: 02*
*Completed: 2026-05-02*
