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
  - homeSections(db, args): two-pass DAL query — viable canonicals (≥minTrips after alias merge), then top-N boats by fpa per section
  - per-section bar normalization (D-10) — Overnight (~1 fpa) and 3.5 Day (~35 fpa) sections both fill their own scale
  - NewLabelBadge component + per-row pending flag (D-05 / HOME-04)
  - HMAC-signed-cookie admin gate (D-04, ALI-03) — fc_admin cookie, 24h TTL, timing-safe verify
  - /admin/trip-types route — operator UI to alias / accept / reset every distinct source_label (ALI-04)
  - /admin/trip-types/login route — single-password gate; generic "Invalid password" copy (Security V7)
  - barWidthPct pure helper in src/lib/shared/normalize.ts — used by BoatBarRow + tested for zero / overflow edges
affects: [phase-08-plan-03-retire, phase-08-plan-04-polish]

# Tech tracking
tech-stack:
  added: []   # No new packages — Node `crypto` (HMAC + timingSafeEqual), Svelte 5 runes, better-sqlite3.
  patterns:
    - HMAC-signed-cookie auth (no JWT library) — Node crypto only; payload `{admin: true, iat}`, 24h TTL
    - Per-route auth gate (defense in depth) — load() and every form action re-verify cookie before mutating
    - Read-time alias-aware queries via ALIAS_JOIN_SQL + CANONICAL_TRIP_TYPE_EXPR (Wave 1 contract)
    - Two-pass aggregation: Pass 1 viable canonicals, Pass 2 top-N per canonical (mirrors explorer.speciesAcrossBoats)
    - Per-section bar normalization for variable-scale data (no global axis to crush small-scale sections)
    - NODE_ENV gate (rather than $app/environment) for vitest-compatibility on cookie Secure flag
    - Datalist-based typeahead (no JS reimplementation) for canonical-label suggestions in admin UI

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
    - src/routes/+page.server.ts   # replaced v1 today's-counts loader with homeSections() loader
    - src/routes/+page.svelte      # replaced v1 dashboard with PageHeader + HomeSectionCard list

key-decisions:
  - "Read NODE_ENV directly in /admin/trip-types/login server instead of `import { dev } from '$app/environment'`. Same gate at runtime; the SvelteKit virtual module isn't resolvable under vitest (the SvelteKit plugin doesn't load there) and aliasing it via vitest.config.ts didn't take. Smallest viable fix; removes a vitest-only failure mode without changing prod behavior."
  - "Per-section bar normalization (D-10) lives in BoatBarRow via $derived(barWidthPct(row.fpa, sectionMax)). barWidthPct is a pure function in src/lib/shared/normalize.ts so it gets unit tests for the degenerate-zero and overflow-clamp cases."
  - "Section-level `status` resolution: derive from a single SELECT on trip_type_aliases WHERE canonical_label = source_label, then look up in JS — keeps the Pass 1 SQL a single GROUP BY with a HAVING. Per-row `pending` flag uses MAX(CASE WHEN tta.status='pending' THEN 1 ELSE 0 END) so it trips when ANY constituent raw label is pending (D-04 surface accuracy)."
  - "Admin form actions use SvelteKit named actions (`?/alias`, `?/accept`, `?/reset`, `?/logout`) with per-action auth re-check — load gate alone isn't enough; actions are independent entry points."
  - "Datalist <input list='canonical-options'> over a JS typeahead — RESEARCH §'Don't Hand-Roll' applies; the platform's typeahead is what we want."

patterns-established:
  - "Pattern: HMAC-signed cookie with 24h TTL via Node crypto (createHmac + timingSafeEqual). No external JWT library. Payload `{admin: true, iat}` base64url-encoded; signature appended after `.`. verifyAdminCookie returns false on any malformed input — never throws."
  - "Pattern: per-route auth gate redirects to /admin/trip-types/login on bad/missing cookie; cache-control: private, no-store on every admin response (RESEARCH §'Admin Auth' gotcha — admin pages must not be CDN-cached)."
  - "Pattern: defense-in-depth re-check — every form action calls verifyAdminCookie on cookies.get('fc_admin') before mutating. The load() gate alone wouldn't protect direct POST to action endpoints."
  - "Pattern: two-pass home query mirrors explorer.speciesAcrossBoats — Pass 1 finds viable buckets (HAVING trip_count >= @minTrips), Pass 2 runs once per Pass-1 row to fetch top-N by fpa. JS does the loop; SQL does the aggregation."
  - "Pattern: Cache-Control discipline by trust boundary — '/' is public + max-age=300 (Phase 6 hot path); '/admin/*' is private + no-store always."
  - "Pattern: cookie name fc_admin with HttpOnly + SameSite=Strict + Path=/admin + Max-Age=86400; Secure only when NODE_ENV='production' (so localhost dev doesn't need https)."

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
- **Files modified/created (this plan total):** 19 (12 src files + 7 test/stub files; 2 src/routes files replaced rather than created)

## Accomplishments

- **Home page front door:** `/` renders 6 trip-type sections in current data (1/2 Day AM 17 trips, Full Day 15, 1/2 Day PM 8, 1.5 Day 6, 2 Day 5, 3 Day 5) — sorted by trip count DESC, top-5 boats by fish/angler per section, with per-section bar normalization. Curl-confirmed 27 boat rows linking to `/explorer?ticker=boat&slug=…`.
- **Admin trip-types adjudication UI:** `/admin/trip-types` shows all 25 distinct source_labels in dev DB with status (Aliased / Canonical / Pending review). 12 NEW badges visible against pending labels. Alias / accept / reset / logout form actions all functional end-to-end (verified by POSTing through curl + reading rows back from sqlite).
- **Auth surface complete:** HMAC-signed `fc_admin` cookie with 24h TTL. Wrong password → 401 + "Invalid password". Tampered cookie → 401, no DB write. Logout clears cookie + redirects.
- **All 36 plan tests green** (7 home query unit + 11 admin auth unit + 4 bar-normalize unit + 5 home integration + 9 admin integration).

## Task Commits

Each task was committed atomically across resume runs:

1. **Task 1: Home query DAL + auth helper + Wave-0 unit tests** — RED `a2f5e65` (test) + GREEN `1beb773` (feat)
2. **Task 2: Home page UI — replace v1 root +page; ship NewLabelBadge / HomeSectionCard / BoatBarRow / copy** — `075041d` (feat)
3. **Task 3: Admin route — /admin/trip-types login + list/CRUD + integration test** — `fedeb87` (wip — initial scaffolding) + `b577dcf` (this run — finishing fixes)

**Plan metadata:** This SUMMARY commit (next).

## Files Created/Modified

### Created in this plan

- `src/lib/db/queries/home.ts` — homeSections(db, args): two-pass query (Pass 1 viable canonicals; Pass 2 top-N boats by fpa per canonical). Alias-aware via Wave-1's ALIAS_JOIN_SQL + CANONICAL_TRIP_TYPE_EXPR. Returns HomeSection[] with status + per-row pending flag.
- `src/lib/auth/admin.ts` — checkPassword (timing-safe compare on ADMIN_PASSWORD), signAdminCookie (HMAC-SHA256 over ADMIN_COOKIE_SECRET; base64url payload `{admin: true, iat}`), verifyAdminCookie (timing-safe sig check + 24h TTL).
- `src/lib/copy/home.ts` — HOME_PAGE_TITLE / HEADING / SUBTITLE; sectionHeading; ROW_FPA_LINE; ROW_TOTALS_LINE; EMPTY_HOME_*. CLAUDE.md domain-language verbatim ("fish/angler", trip-type labels never collapsed).
- `src/lib/copy/admin.ts` — ADMIN_PAGE_TITLE / HEADING / SUBTITLE; STATUS_LABELS; ACTION_*; LOGIN_INVALID; etc.
- `src/lib/shared/normalize.ts` — barWidthPct(rowFpa, sectionMax): pure helper. Returns 0 on sectionMax<=0; clamps overflow to 100; tested.
- `src/lib/components/NewLabelBadge.svelte` — D-05 NEW pill, reuses --color-provisional / -bg from ProvisionalBadge.svelte.
- `src/lib/components/HomeSectionCard.svelte` — Per-canonical section heading + N BoatBarRows. $derived sectionMax for normalization.
- `src/lib/components/BoatBarRow.svelte` — Single row: relative-positioned bar bg + boat-name link + fpa/trip-count headline + anglers/total context. NewLabelBadge inline when pending.
- `src/routes/admin/trip-types/+page.server.ts` — load() = listAllLabelsWithStatus + canonicalChoices for typeahead. Actions: alias / accept / reset / logout, each re-verifying fc_admin cookie.
- `src/routes/admin/trip-types/+page.svelte` — Mobile-first table-becomes-stacked-cards UI; per-row inline form actions; datalist typeahead.
- `src/routes/admin/trip-types/login/+page.server.ts` — Login form action; sets fc_admin cookie on success; 401 + "Invalid password" on failure; 503 if ADMIN_COOKIE_SECRET unset.
- `src/routes/admin/trip-types/login/+page.svelte` — Single password input, mobile-friendly form.
- `tests/unit/db/queries/home.test.ts` — H1..H7 (7 cases): viable filter, alias merge, fpa sort, n=1 cells, pending flag, section sort.
- `tests/unit/auth/admin.test.ts` — A1..A5 (11 cases): password equality, length-mismatch fast-fail, sig roundtrip, tamper rejection, 24h TTL.
- `tests/unit/lib/bar-normalize.test.ts` — B1..B3 (4 cases): standard ratios, zero-max degenerate, overflow clamp.
- `tests/integration/routes/home.test.ts` — I1..I5 (5 cases): section ordering, no URL state, empty-DB shape, n=1 visibility, cache-control header.
- `tests/integration/admin/trip-types.test.ts` — T1..T9 (9 cases): redirect-when-unauth, list-when-auth, login wrong/right, alias/accept/reset/logout actions, cookie-absent rejection.

### Modified in this plan

- `src/routes/+page.server.ts` — REPLACED v1 today's-counts loader with homeSections() loader. Past-7-day window, no URL state, public + max-age=300 cache, locals.logger.info on every load.
- `src/routes/+page.svelte` — REPLACED v1 dashboard with PageHeader + per-section HomeSectionCard list + EmptyState fallback. svelte:head title = HOME_PAGE_TITLE.

## Decisions Made

See `key-decisions` in frontmatter for the full list. Highlights:

- **NODE_ENV instead of `$app/environment`** for the Secure-cookie gate — prevents the login server module from being unloadable under vitest.
- **Per-route auth gate** (Wave 4 will hoist to hooks.server.ts) — keeps Wave 2 self-contained; every form action re-verifies the cookie before mutating (defense in depth).
- **Datalist typeahead** for the canonical-label input in the admin UI — uses the platform's `<input list>` rather than a JS reimplementation.
- **Pass 2 single prepared statement** run once per Pass-1 row — typically 6-7 iterations (current data) so the JS loop cost is trivial; keeps each SQL statement readable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Replaced `import { dev } from '$app/environment'` with `process.env.NODE_ENV === 'production'` in admin login server**

- **Found during:** Task 3 verification (integration test execution)
- **Issue:** vitest reports `Failed to load url $app/environment (resolved id: $app/environment) … Does the file exist?` because the SvelteKit plugin isn't active under vitest. Two of the nine admin integration tests (T3, T4) couldn't even load the login module. Aliasing `$app/environment` in `vitest.config.ts` to a stub file (both as a string alias and as a regex alias) didn't take — vite-node appears to bypass plain alias resolution for `$`-prefixed virtual identifiers in some cases.
- **Fix:** Stop importing the SvelteKit virtual module. Read `process.env.NODE_ENV` directly. The Secure-cookie gate is unchanged at runtime: `secure: isProd` where `isProd = process.env.NODE_ENV === 'production'`. NODE_ENV is set by Node and by hosts (Vercel, etc.) in prod; in dev/test it's undefined so `secure: false`, which is what we want for localhost http.
- **Files modified:** `src/routes/admin/trip-types/login/+page.server.ts`
- **Verification:** All 9 admin integration tests now green; manual self-validation (curl through the login flow) confirms cookie flags are correct in dev (httpOnly + sameSite=Strict + Path=/admin + Max-Age=86400; Secure absent because !isProd).
- **Committed in:** `b577dcf`

**2. [Rule 1 — Bug] Type-narrowing on `form` prop in admin trip-types page**

- **Found during:** Task 3 verification (`npm run check`)
- **Issue:** `+page.svelte` checked `form?.success && form?.message` but svelte-check generates `form: { success: boolean; message: string } | { error: string } | null` (the action-return union shape). Optional-chaining doesn't narrow; svelte-check rightly errored "Property 'success' does not exist on type '{}'" for the failure branch.
- **Fix:** Use explicit `'success' in form` / `'error' in form` discriminators so the narrowing works in both the success-path and the failure-path branches of the `{#if}`/`{:else if}`.
- **Files modified:** `src/routes/admin/trip-types/+page.svelte`
- **Verification:** `npm run check` no longer flags this file; the visible behavior is identical (success and error toasts both render).
- **Committed in:** `b577dcf`

**3. [Rule 1 — Bug] `load()` return-type narrowing in admin integration test**

- **Found during:** Task 3 verification (`npm run check`)
- **Issue:** SvelteKit generates `load`'s return type as `void | PageData` because the loader can `throw redirect()` in some branches. The test's `result.labels.length` access was invalid against `void`.
- **Fix:** Cast the awaited return to `{ labels: unknown[] }` at the call site — the test only exercises the non-redirect branch (the cookie is valid in T2), so the cast is sound.
- **Files modified:** `tests/integration/admin/trip-types.test.ts`
- **Verification:** `npm run check` no longer flags this file; T2 still passes.
- **Committed in:** `b577dcf`

**4. [Rule 3 — Blocking, environmental] Generated `.svelte-kit/tsconfig.json`**

- **Found during:** Task 1 verification (vitest can't transform tsx without it)
- **Issue:** Worktree was reset to a base before any svelte-kit sync had run, so `tsconfig.json` extends a non-existent `./.svelte-kit/tsconfig.json`. Vitest fails to transform any test file with `TSConfckParseError`.
- **Fix:** `npx svelte-kit sync` once. Generates `.svelte-kit/{ambient.d.ts, non-ambient.d.ts, tsconfig.json}`.
- **Verification:** All 36 plan tests run green afterward.
- **Committed in:** N/A — `.svelte-kit/` is gitignored; this is a worktree-local prereq.

---

**Total deviations:** 4 auto-fixed (1 blocking environmental, 1 blocking Rule 3, 2 type-narrowing Rule 1 bugs). All in service of getting test/check to green; none change runtime behavior in prod.
**Impact on plan:** No scope creep. The NODE_ENV switch is the most behaviorally-equivalent `$app/environment` replacement for cookie gating.

## Issues Encountered

- **Rate-limit pause across two sessions.** Prior session shipped Tasks 1, 2, and Task 3 scaffolding (commits `a2f5e65`, `1beb773`, `075041d`, `fedeb87`). This resume session ran `npx svelte-kit sync`, fixed three small type/import issues uncovered by the full test + check pass, and shipped this SUMMARY.
- **Edit/Write tool returned success but content didn't persist for `src/routes/admin/trip-types/login/+page.server.ts` (twice).** Worked around with a shell heredoc (`cat > path << 'EOF' … EOF`) which persisted correctly. Worth noting if it recurs — possibly an in-flight buffering issue on this specific file path. Did not block completion.
- **Pre-existing failures in unrelated tests** (Phase 2 today's-counts route tests, Phase 3 forecast scrape-tick hooks, explorer.test.ts series-name expectations) are out of scope for 08-02 — they're 08-03's retirement-sweep concerns. Logged here for traceability; left for the parallel 08-03 worktree.

## User Setup Required

**External services require manual configuration to run the admin route.** The plan's `user_setup` block calls these out; documented here for completeness:

- `ADMIN_PASSWORD` — operator chooses a strong password and sets in `.env` (not committed). Used by `/admin/trip-types/login`.
- `ADMIN_COOKIE_SECRET` — operator runs `openssl rand -hex 32` and sets in `.env` (not committed). Used to HMAC-sign the `fc_admin` cookie.
- Both are required at boot for the admin route to function. Without `ADMIN_COOKIE_SECRET`, login returns 503 "Admin auth is not configured on this server. Set ADMIN_COOKIE_SECRET." rather than a stack trace.

Home page `/` requires no operator setup.

## Cache-Control + Cookie Inventory (per plan output spec)

| Route | Cache-Control | Why |
|-------|---------------|-----|
| `/` | `public, max-age=300` | D-15 hot-path discipline; matches Phase 6 explorer cache |
| `/admin/trip-types` | `private, no-store` | RESEARCH §"Admin Auth" gotcha — admin pages must not be CDN-cached |
| `/admin/trip-types/login` | `private, no-store` | Same — never let a CDN cache a login form |

| Cookie name | Flags | Notes |
|-------------|-------|-------|
| `fc_admin` | `HttpOnly`, `SameSite=Strict`, `Path=/admin`, `Max-Age=86400` (24h), `Secure` only when `NODE_ENV=production` | HMAC-SHA256 signed with `ADMIN_COOKIE_SECRET`; payload `{admin: true, iat}` base64url. 24h TTL enforced server-side in `verifyAdminCookie`. `Path=/admin` means the cookie isn't sent on `/` or `/explorer` requests — keeps admin trust scoped tight. |

## Manual Self-Validation (D-40)

Run by curl + sqlite3 against the local dev server (`DB_PATH=…/data/dev.sqlite3 ADMIN_PASSWORD=test ADMIN_COOKIE_SECRET=$(openssl rand -hex 32) npm run dev -- --port 5180`).

| Check | Outcome | Evidence |
|-------|---------|----------|
| `GET /` returns 200 with title "What's been biting — FishCount" | PASS | `<title>What's been biting — FishCount</title>` in response body |
| Sections render and sort by trip_count DESC | PASS | 6 sections present: 1/2 Day AM (17), Full Day (15), 1/2 Day PM (8), 1.5 Day (6), 2 Day (5), 3 Day (5). Each h2 carries the verbatim canonical label (CLAUDE.md domain-language compliance). |
| Per-row links go to `/explorer?ticker=boat&slug=…` | PASS | 27 such links in HTML across the 6 sections |
| `Cache-Control: public, max-age=300` set on `/` | PASS | Header inspected via `curl -sSI` |
| `GET /admin/trip-types` without cookie redirects to login | PASS | 303 + Location: /admin/trip-types/login |
| Login with wrong password → 401 + generic "Invalid password" | PASS | JSON failure: `{"type":"failure","status":401,"data":"[{\"error\":1},\"Invalid password\"]"}` |
| Login with right password → 303 to /admin/trip-types + sets fc_admin cookie | PASS | Set-Cookie: fc_admin=…; Max-Age=86400; Path=/admin; HttpOnly; SameSite=Strict |
| `GET /admin/trip-types` with valid cookie → 25 distinct labels rendered | PASS | 25 distinct `name="source_label" value="…"` hidden inputs |
| 12 NEW badges visible (one per pending label in seed) | PASS | 12 `aria-label="New trip-type label, awaiting review"` matches |
| `?/alias` action persists row with status='aliased' | PASS | curl POST → row written; `SELECT * FROM trip_type_aliases WHERE source_label='TestLabelXYZ'` returns `TestLabelXYZ\|Full Day\|aliased` |
| Tampered cookie → 401 + no DB write | PASS | curl with `Cookie: fc_admin=fake.signature` → `{"type":"failure","status":401,"data":"[{\"error\":1},\"Not authorized.\"]"}`; row count = 0 |
| `?/logout` clears cookie + redirects to login | PASS | Set-Cookie: fc_admin=; Max-Age=0; redirect 303 to /admin/trip-types/login |
| `Cache-Control: private, no-store` on both admin routes | PASS | Header inspected via `curl -sSI` |

**Browser screenshots at desktop and 375px:** Not captured in this resume run because the tool environment (curl-based) cannot drive a headless browser at a specific viewport. The HTML response shape is correct (Tailwind classes ship `min-h-11`, `flex flex-wrap`, mobile-first stacked-card layout in admin route, no overflow-causing fixed widths). Operator should run `npm run dev` locally and self-validate per D-40 — a future polish-pass plan (Wave 4) can capture screenshots into `.planning/phases/08-home-retire-polish/screenshots/` if the operator wants them in version control.

## Deferred / Out-of-Scope Issues

Tracked here so they don't get lost (see deferred-items.md if present in phase dir):

- `tests/integration/phase2-routes.test.ts` (3 cases) tests the v1 `/` shape we replaced. Will fail until 08-03 retires it.
- `tests/scheduler/scrape-tick.test.ts` (2 cases) tests the Phase 3 forecast recompute hook. Wave 1 dropped forecasts; these tests need to be retired by 08-03 (or by Wave 1's retirement sweep if not already).
- `tests/unit/routes/explorer.test.ts:7` expects `'Full Day Coronado Islands'` as a series label. Wave 1's alias merge collapses this to `'Full Day'` per the seed; the test expectation is stale. Out of 08-02 scope (explorer test, not home test).
- 90 `npm run check` errors total — almost all in retired-route tests (`tests/unit/routes/{compare,date,boats,landings,trips,etc}.test.ts`). Plan 08-03 retires these tests + routes.

None of the above touch `/`, `/admin/trip-types`, or `/admin/trip-types/login` paths. Plan 08-02 surface is clean.

## Threat Flags

None. No new trust boundaries beyond those declared in the plan's `<threat_model>`.

## Next Phase Readiness

- Home page mounted at `/` is shareable (per CLAUDE.md "shareable with a fishing buddy" bar) — sections stack vertically on mobile, bars show the right relative-fpa story.
- Admin route is operator-ready. The 12 pending labels in the seed (1.75 Day, 4 Day, 4.5 Day, 5 Day, 6 Day, 7 Day, 7.5 Day, 8 Day, 9 Day, 10 Day, Lobster, Long Range) are sitting in `/admin/trip-types` waiting for adjudication. Operator can alias them to canonicals (e.g., 4.5 Day → 4 Day if they prefer) or accept them as their own canonical. Whichever the operator chooses, the home page picks up the change on next load (no rebuild required).
- Wave 4 (polish) can hoist the per-route auth gate into `hooks.server.ts` — the `verifyAdminCookie` helper is already the only auth primitive, so the migration is a one-line `hooks.server.ts` addition + per-route gate removal.
- Wave 3 (retire) needs to handle the deferred test failures listed above. No 08-02 surface area to clean up.

## Self-Check: PASSED

Verified before commit:
- `[ -f src/lib/db/queries/home.ts ]` → FOUND
- `[ -f src/lib/auth/admin.ts ]` → FOUND
- `[ -f src/lib/components/NewLabelBadge.svelte ]` → FOUND
- `[ -f src/lib/components/HomeSectionCard.svelte ]` → FOUND
- `[ -f src/lib/components/BoatBarRow.svelte ]` → FOUND
- `[ -f src/lib/shared/normalize.ts ]` → FOUND
- `[ -f src/lib/copy/home.ts ]` → FOUND
- `[ -f src/lib/copy/admin.ts ]` → FOUND
- `[ -f src/routes/admin/trip-types/+page.server.ts ]` → FOUND
- `[ -f src/routes/admin/trip-types/+page.svelte ]` → FOUND
- `[ -f src/routes/admin/trip-types/login/+page.server.ts ]` → FOUND
- `[ -f src/routes/admin/trip-types/login/+page.svelte ]` → FOUND
- `[ -f tests/unit/db/queries/home.test.ts ]` → FOUND
- `[ -f tests/unit/auth/admin.test.ts ]` → FOUND
- `[ -f tests/unit/lib/bar-normalize.test.ts ]` → FOUND
- `[ -f tests/integration/routes/home.test.ts ]` → FOUND
- `[ -f tests/integration/admin/trip-types.test.ts ]` → FOUND
- Commit `a2f5e65` (test RED) → in `git log`
- Commit `1beb773` (feat GREEN — DAL + auth + bar-normalize) → in `git log`
- Commit `075041d` (feat — replace v1 home) → in `git log`
- Commit `fedeb87` (wip — admin scaffolding) → in `git log`
- Commit `b577dcf` (fix — finishing touches) → at HEAD
- 36 plan tests green: `npm run test:run -- tests/unit/db/queries/home.test.ts tests/unit/lib/bar-normalize.test.ts tests/unit/auth/admin.test.ts tests/integration/routes/home.test.ts tests/integration/admin/trip-types.test.ts` exits 0

---
*Phase: 08-home-retire-polish, Plan: 02*
*Completed: 2026-05-02*
