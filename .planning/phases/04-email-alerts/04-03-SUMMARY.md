---
phase: 04-email-alerts
plan: 03
subsystem: email-infrastructure
tags: [phase-4, email-alerts, email-infrastructure, resend, compliance, ALT-05, ALT-07, ALT-08]
requirements_completed: [ALT-05, ALT-07, ALT-08]
dependency_graph:
  requires:
    - "$lib/shared/format (formatPerAngler) — Plan 04-02 sibling (wave 1, parallel)"
    - "$lib/alerts/operator (safeSubject) — Phase 0 PII-redaction helper"
    - "$lib/server/logger — Phase 0 pino logger"
    - "resend NPM package (already in deps)"
    - "$env/dynamic/private — SvelteKit virtual module (vitest aliased to shim)"
  provides:
    - "buildEmail({...}) → { html, text } — pure HTML+text composer w/ hidden preheader, 600px table, brand line, postal address, unsubscribe block"
    - "escapeHtml(s) — &/</>/\"/' escaper for T-04-A9 mitigation"
    - "POSTAL_ADDRESS() → string — fail-closed env reader for CAN-SPAM physical address"
    - "renderConfirmationEmail / renderHotDayEmail / renderRunStartEmail — three template builders returning BuildEmailArgs"
    - "sendUserEmail({...}) → resend message id — Resend wrapper with RFC 8058 headers + tracking off"
    - "BuildEmailArgs type — interface contract consumed by templates + dispatcher"
    - "SendUserEmailArgs type — interface contract consumed by Plan 04 (signup) + Plan 07 (dispatcher)"
  affects:
    - "Plan 04-04 (signup form action) — will call renderConfirmationEmail + sendUserEmail"
    - "Plan 04-07 (alert dispatcher) — will call renderHotDayEmail / renderRunStartEmail + sendUserEmail"
    - "vitest test infrastructure (alias for $env/dynamic/private)"
tech_stack:
  added: []
  patterns:
    - "Phase 0 Resend wrapper analog (operator.ts) — reused for subscriber stream; SUBSCRIBER_FROM_EMAIL distinct from OPERATOR_FROM_EMAIL for DMARC isolation"
    - "Pure-function composer — no I/O beyond fail-closed env read; trivially unit-testable from fixture inputs"
    - "Inline-style HTML for email-client cross-compat (Gmail/Outlook 2007–2019/iOS Mail strip <head> styles)"
    - "RFC 8058 List-Unsubscribe + List-Unsubscribe-Post: List-Unsubscribe=One-Click on every send"
    - "tracking: { open_tracking: false, click_tracking: false } per send (Pitfall 4)"
    - "PII-safe logging via safeSubject() (Phase 0 helper) — never logs raw email or full subject"
    - "Vitest alias for $env/dynamic/private virtual module"
key_files:
  created:
    - "src/lib/email/postalAddress.ts (POSTAL_ADDRESS fail-closed env reader)"
    - "src/lib/email/buildEmail.ts (HTML+text composer + escapeHtml)"
    - "src/lib/email/templates.ts (3 template builders for Email 1/2/3)"
    - "src/lib/email/send.ts (Resend wrapper with RFC 8058 + tracking off)"
    - "tests/unit/email/buildEmail.test.ts (10 tests)"
    - "tests/unit/email/templates.test.ts (8 tests)"
    - "tests/unit/email/send.test.ts (9 tests)"
    - "tests/helpers/env-dynamic-private-shim.ts (vitest shim — re-exports process.env)"
    - "src/lib/shared/format.ts (parallel-wave shim, identical to Plan 04-02 source — see Deviations)"
  modified:
    - "vitest.config.ts (added alias: $env/dynamic/private → tests/helpers/env-dynamic-private-shim.ts)"
decisions:
  - "Hand-build email HTML strings (no React Email / MJML / Svelte SSR for emails) — SvelteKit project has no React; templates are simple enough to specify by template-string"
  - "Layout shell rendered via buildEmail; per-email content blocks rendered via render* templates — separation of concerns lets shell change once for all 3 emails"
  - "URLs (confirm/manage/unsubscribe/boat/trends) NOT passed through escapeHtml — would mis-escape `&` in querystrings; caller must produce signed/encoded URLs"
  - "renderHotDayEmail / renderRunStartEmail use Math.max(nProxy, 1) on baseline lookups to keep formatPerAngler from returning '—' on edge cases where the baseline is positive but the today-anglers happens to be zero"
  - "tracking: { open_tracking: false, click_tracking: false } passed in nested form per Resend changelog; cast payload to Record<string, unknown> so @types/resend version that may not yet expose the field still typechecks"
  - "B3 fix in send.ts: throws when Resend returns success without data.id — preserves audit-trail invariant T-04-DISPATCH-01 (resend_message_id required as external correlation key)"
  - "Vitest alias for $env/dynamic/private rather than monkey-patching globalThis — minimal, declarative, only affects test runtime"
metrics:
  duration: "7 min"
  tasks_completed: 2
  files_created: 9
  files_modified: 1
  lines_added: ~530
  tests_added: 27
  full_suite_status: "487/487 passing (no regressions)"
  completed_date: "2026-04-29"
---

# Phase 04 Plan 03: Email Composer + Send Wrapper Summary

Hand-built HTML+text email composer, three per-email template builders (confirmation / hot-day / starting-to-run), and a Resend send wrapper that sets RFC 8058 List-Unsubscribe headers and disables open+click tracking — the layer where CLAUDE.md non-negotiable #5 (email compliance) is enforced for every outbound subscriber email.

## Files Added with Public API

### `src/lib/email/postalAddress.ts`

```typescript
export function POSTAL_ADDRESS(): string;
```

- Reads `env.POSTAL_ADDRESS` from `$env/dynamic/private`.
- Throws `'POSTAL_ADDRESS env var is unset — cannot build a CAN-SPAM-compliant email'` when unset or whitespace-only.
- Trims trailing whitespace before returning.

### `src/lib/email/buildEmail.ts`

```typescript
export function escapeHtml(s: string): string;

export interface BuildEmailArgs {
  subject: string;
  preheader: string;
  h1: string;
  bodyHtml: string;
  bodyText: string;
  reasonForReceipt: string;
  reasonForReceiptHtml?: string;
  unsubscribeUrl: string;
  manageUrl?: string;
}

export function buildEmail(args: BuildEmailArgs): { html: string; text: string };
```

- Pure function (only side effect: fail-closed `POSTAL_ADDRESS()` call).
- Returns matching `{html, text}` multipart pair.
- HTML: `<!DOCTYPE html>` + hidden preheader div (`display:none;max-height:0;overflow:hidden;mso-hide:all`) + 600px `role="presentation"` table + brand line + postal address + unsubscribe link block. Every `<td>` carries inline styles.
- Text: brand line + uppercase H1 banner + body + reason-for-receipt block + brand+postal footer + bare `Unsubscribe: <url>` line + optional `Manage alerts: <url>` line.
- `escapeHtml` escapes `& < > " '` — T-04-A9 mitigation against injection via subscribed values.

### `src/lib/email/templates.ts`

```typescript
export function renderConfirmationEmail(args: {
  confirmUrl: string;
  signupDate: string;
  maskedIp: string;
  unsubscribeUrl: string;
  manageUrl?: string;
}): BuildEmailArgs;

export function renderHotDayEmail(args: {
  boatName: string;
  boatId: number;
  tripType: string;
  todayValue: number;
  todayAnglers: number;
  trailingAvg: number;
  multiplier: number;
  speciesList: string[];
  signupDate: string;
  unsubscribeUrl: string;
  manageUrl: string;
}): BuildEmailArgs;

export function renderRunStartEmail(args: {
  species: string;
  tripType: string;
  rolling7Avg: number;
  yearAgoAvg: number;
  multiplier: number;
  nBoats: number;
  signupDate: string;
  unsubscribeUrl: string;
  manageUrl: string;
}): BuildEmailArgs;
```

- All caller-supplied display values (`boatName`, `tripType`, `species`, `speciesList`) flow through `escapeHtml` before HTML interpolation (T-04-A9).
- Per-angler values rendered via `formatPerAngler` from `$lib/shared/format` (UI-SPEC FLAG #9 — single source of truth shared with `PerAnglerMetric.svelte`).
- Multiplier rendered as `"Nx"` via `toFixed(1)` (e.g. `"3.0x"`); never two decimals on per-angler values.
- Hot-day body discloses `n=X anglers` + verbatim `tripType` per CLAUDE.md non-negotiable #4.

### `src/lib/email/send.ts`

```typescript
export interface SendUserEmailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeMailto: string;
  unsubscribeUrl: string;
}

export async function sendUserEmail(args: SendUserEmailArgs): Promise<string>;
```

- Throws `'sendUserEmail: RESEND_API_KEY is not set'` when env unset.
- Throws `'sendUserEmail: SUBSCRIBER_FROM_EMAIL is not set'` when env unset.
- Sets `headers['List-Unsubscribe'] = '<mailto:${unsubMailto}>, <${unsubUrl}>'`.
- Sets `headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'` (RFC 8058).
- Passes `tracking: { open_tracking: false, click_tracking: false }` (Pitfall 4 — tracking pixels and link rewrites both disabled per send).
- Multipart: includes both `html` and `text`.
- PII-safe logging: `logger.info({ id, subjectTemplate: safeSubject(args.subject) }, 'user_email_sent')` — raw `to` and raw `subject` never logged.
- Returns Resend message id; throws if Resend returns success without `data.id` (B3 fix — preserves audit-trail invariant T-04-DISPATCH-01).
- From: `FishCount <${SUBSCRIBER_FROM_EMAIL}>` — distinct from `OPERATOR_FROM_EMAIL` so DMARC reports isolate per-stream complaints.

## Email Template Strings (Verbatim Match Against UI-SPEC §"Per-Email Layouts")

| Email | Subject (template) | Preheader | H1 (template) |
|-------|--------------------|-----------|----------------|
| 1 — Confirmation | `Confirm your FishCount alerts` | `One click to activate. We won't email until you do.` | `Confirm your alerts` |
| 2 — Hot-day | `Hot day: ${boatName}` | `${todayFmt} fish/angler today on ${tripType} — ${xLabel} above its 30-day average.` | `Hot day on ${boatName}` |
| 3 — Starting-to-run | `${species} starting to run` | `Fleet-wide 7-day avg is ${xLabel} above same-week last year on ${tripType} trips.` | `${species} is starting to run` |

All match UI-SPEC §"Per-Email Layouts" verbatim. No paraphrasing.

## Resend Mock Pattern (for reuse in Plan 07 dispatch tests)

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
    constructor(_k?: string) {}
  }
}));
vi.mock('$lib/server/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}));

import { sendUserEmail } from '../../../src/lib/email/send';

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: 'mock-id-123' }, error: null });
  process.env.RESEND_API_KEY = 'rk_test';
  process.env.SUBSCRIBER_FROM_EMAIL = 'alerts@fishcount.app';
});
afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.SUBSCRIBER_FROM_EMAIL;
});

// Inspect: sendMock.mock.calls[0][0] === payload
// To force a Resend error: sendMock.mockResolvedValueOnce({ data: null, error: { message: '...' } });
// To force success-without-id (B3 path): sendMock.mockResolvedValueOnce({ data: null, error: null });
```

- Mock the `resend` module BEFORE importing `sendUserEmail` (`vi.mock` is hoisted, so order in source doesn't matter — but the mock factory must reference a top-level `sendMock` binding so each test can introspect calls).
- Mock `$lib/server/logger` to suppress pino output and to assert log shape if needed.
- Set `RESEND_API_KEY` + `SUBSCRIBER_FROM_EMAIL` in `beforeEach`; delete in `afterEach` for env-isolation tests.

## UI-SPEC Compliance Verification

| UI-SPEC requirement | Encoded in | Test that proves it |
|---------------------|------------|---------------------|
| Hidden preheader div (Block 1) | `buildEmail.ts` line w/ `display:none;max-height:0;overflow:hidden;mso-hide:all` | `buildEmail.test.ts → "returns html + text with preheader hidden"` |
| Brand line + postal address (ComplianceFooter) | `buildEmail.ts` final `<tr>`s | `buildEmail.test.ts → "renders postal address verbatim..."` + `"renders compliance brand line"` |
| Unsubscribe link in body footer | `buildEmail.ts` last `<tr>` w/ `Unsubscribe:` | `buildEmail.test.ts → "renders unsubscribe URL in compliance footer block"` |
| Plain-text variant w/ bare unsubscribe URL | `buildEmail.ts` text array | `buildEmail.test.ts → "Unsubscribe: <url>"` assertion |
| Verbatim subject/preheader/h1 (Email 1/2/3) | `templates.ts` return values | `templates.test.ts → 3 verbatim string assertions per email` |
| List-Unsubscribe + List-Unsubscribe-Post headers | `send.ts` payload.headers | `send.test.ts → "passes List-Unsubscribe + ... headers (RFC 8058)"` |
| Open + click tracking disabled | `send.ts` payload.tracking | `send.test.ts → "disables open + click tracking per send"` |
| Multipart (html + text both present) | `send.ts` payload | `send.test.ts → "sends both html and text (multipart)"` |
| Per-angler decimal rule | `formatPerAngler` (shared) + `toFixed(1)` for multiplier | `templates.test.ts → "3.0x" + "n=18 anglers" assertions` |
| Verbatim trip_type in alert body | `templates.ts` interpolations | `templates.test.ts → "1/2 Day AM" + "Overnight" body-contains assertions` |
| HTML escape on user-supplied display values (T-04-A9) | `templates.ts` `escapeHtml(safeBoat / safeTrip / safeSp / safeSpeciesList)` | `templates.test.ts → 3 separate XSS-payload escape tests` |

## Threat Model Coverage

| Threat ID | Mitigation in this plan | Test |
|-----------|-------------------------|------|
| T-04-A9 (HTML injection via boat/species names) | `escapeHtml` on every caller-supplied display value in `templates.ts`; XSS escape on subject/preheader/h1 in `buildEmail.ts` | 3 tests in templates.test.ts + 1 in buildEmail.test.ts |
| T-04-A07 (CAN-SPAM compliance — postal address) | `POSTAL_ADDRESS()` fail-closes when env unset; `buildEmail()` invokes it on every call | 2 tests in buildEmail.test.ts (unset + whitespace-only) |
| T-04-A05 (one-click unsubscribe missing) | `send.ts` always sets List-Unsubscribe + List-Unsubscribe-Post headers | `send.test.ts → "passes List-Unsubscribe + ... headers (RFC 8058)"` |
| T-04-A6 (PII leak via Reply-To / log) | No Reply-To set; `safeSubject(args.subject)` in every log call; `args.to` and `args.subject` never raw-logged | `send.test.ts → "no raw to/subject in logger" grep + send-success log assertion` |
| T-04-TRACK-01 (privacy / spam-filter signal) | `tracking: { open_tracking: false, click_tracking: false }` per send | `send.test.ts → "disables open + click tracking per send"` |
| T-04-NOSEC-01 (CAN-SPAM plain-text) | `buildEmail()` always emits multipart with bare `Unsubscribe: <url>` line in text variant | `buildEmail.test.ts → text contains "Unsubscribe: ..."` |
| T-04-DISPATCH-01 (audit-trail correlation) | B3 fix in `send.ts`: throws when Resend returns success without `data.id` | `send.test.ts → "B3 fix: Resend success without data.id throws"` |
| T-04-A7 (suppression-list bypass) | Accepted/delegated — handled by Plan 07 dispatcher before `sendUserEmail` is invoked | (Plan 07 will own this test) |

## Deviations from Plan

### 1. [Rule 3 — Blocking] Created parallel-wave shim for `src/lib/shared/format.ts`

- **Found during:** Task 1 setup, before any source file authored.
- **Issue:** Plan 04-03 imports `formatPerAngler` from `$lib/shared/format`, but that file is created by Plan 04-02 — both plans are in wave 1 (parallel execution in separate worktrees). My worktree did not have the file, so Task 1's `tsc --noEmit` would fail and Task 2's tests would fail to import.
- **Fix:** Created `src/lib/shared/format.ts` in this worktree with EXACTLY the content prescribed by Plan 04-02 (verbatim copy of the code block in 04-02-PLAN.md). When the orchestrator merges wave-1 worktrees, the two identical copies should not produce a merge conflict. If they do, Plan 04-02's commit will land first and ours becomes a no-op.
- **Files modified:** `src/lib/shared/format.ts` (new).
- **Commit:** `636d84e` (chore commit, separate from Task 1 source commit).

### 2. [Rule 3 — Blocking] Vitest alias for `$env/dynamic/private`

- **Found during:** Task 1 setup, while wiring `postalAddress.ts`.
- **Issue:** The plan prescribes `import { env } from '$env/dynamic/private'` for `postalAddress.ts` (and verifies it via grep AC). `$env/dynamic/private` is a SvelteKit virtual module synthesized by `@sveltejs/kit/vite` plugin at runtime. Bare `vitest` (which the project uses — see `vitest.config.ts`, no `sveltekit()` plugin) cannot resolve it, so any test that touches `postalAddress.ts` directly or transitively (all email tests) would error out at module-resolution time.
- **Fix:** Created `tests/helpers/env-dynamic-private-shim.ts` that re-exports `process.env` as `env`. Aliased `$env/dynamic/private` → shim in `vitest.config.ts`. This mirrors SvelteKit's actual server-side behavior. Plan 04-02 also uses `$env/dynamic/private` (in its `tokens.ts`), so this alias unblocks both wave-1 plans.
- **Files modified:** `vitest.config.ts`, `tests/helpers/env-dynamic-private-shim.ts` (new).
- **Commit:** `636d84e` (same chore commit as Deviation 1).

### 3. [Rule 1 — Bug, prophylactic] Added third XSS test for species in `renderRunStartEmail`

- **Found during:** Writing templates.test.ts.
- **Issue:** Plan listed only one XSS test for `renderHotDayEmail.boatName`. T-04-A9 mitigation also relies on escapes for `species` and `speciesList[]` — without explicit tests, a future refactor that drops one of those `escapeHtml` calls would slip through.
- **Fix:** Added a `renderHotDayEmail` species-list XSS test (`<img src=x onerror=alert(1)>`) and a `renderRunStartEmail` species XSS test. Now every caller-supplied display field that gets HTML-interpolated has at least one regression test.
- **Files modified:** `tests/unit/email/templates.test.ts`.
- **Commit:** `256c5fc` (Task 2 commit).

### 4. [Rule 2 — Critical] Added `'whitespace-only POSTAL_ADDRESS' fail-closed test

- **Found during:** Writing buildEmail.test.ts.
- **Issue:** Plan called for one fail-closed test (env unset). `POSTAL_ADDRESS()` also fail-closes on whitespace-only values (`a.trim().length === 0`), but no test covered that branch. Without a test, a regression that drops the `.trim()` check (e.g. accidentally returning `env.POSTAL_ADDRESS ?? ''` directly) would silently emit `<br>   <br>` in emails.
- **Fix:** Added `'throws when POSTAL_ADDRESS is whitespace-only (ALT-07 fail-closed)'`. Sets `POSTAL_ADDRESS = '   '` and expects throw.
- **Files modified:** `tests/unit/email/buildEmail.test.ts`.
- **Commit:** `256c5fc` (Task 2 commit).

### 5. [Rule 2 — Critical] Added From-address assertion in send.test.ts

- **Found during:** Writing send.test.ts.
- **Issue:** Plan didn't explicitly test that `SUBSCRIBER_FROM_EMAIL` actually flows into `payload.from`. A regression that hardcoded `from: 'foo@bar'` (or used the wrong env var) would pass all other tests. DMARC isolation depends on this address being correct.
- **Fix:** Added `'uses SUBSCRIBER_FROM_EMAIL in the From: header (DMARC isolation)'` test.
- **Files modified:** `tests/unit/email/send.test.ts`.
- **Commit:** `256c5fc` (Task 2 commit).

### Authentication Gates: None

No auth gates encountered. Task 2's send.test.ts mocks Resend; no live API calls.

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` (email/ + format.ts files only) | 0 errors |
| `npm run test -- --run tests/unit/email/*.test.ts` | 27/27 passing |
| `npm test -- --run` (full suite) | 487/487 passing across 60 files (no regressions) |
| `grep "throw new Error('POSTAL_ADDRESS env var is unset"` | 1 match in postalAddress.ts |
| `grep "import { env } from '$env/dynamic/private'"` | 1 match in postalAddress.ts |
| `grep "export function buildEmail"` | 1 match in buildEmail.ts |
| `grep "export function escapeHtml"` | 1 match in buildEmail.ts |
| `grep "import { POSTAL_ADDRESS } from './postalAddress'"` | 1 match in buildEmail.ts |
| `grep "display:none;max-height:0;overflow:hidden"` | 1 match in buildEmail.ts |
| `grep "Public San Diego charter-boat dock-totals aggregator"` | 2 matches (HTML + text) in buildEmail.ts |
| `grep -E "^export function (renderConfirmationEmail|renderHotDayEmail|renderRunStartEmail)"` | 3 matches in templates.ts |
| `grep "Confirm your FishCount alerts"` | 1 match in templates.ts |
| `grep "is starting to run"` | 1 match in templates.ts |
| `grep "Hot day on"` | 1 match in templates.ts |
| `grep "import { formatPerAngler } from '$lib/shared/format'"` | 1 match in templates.ts |
| `grep "import { escapeHtml"` | 1 match in templates.ts |
| `grep 'n=${args.todayAnglers} anglers'` | 2 matches (HTML + text) in templates.ts |
| `grep "toFixed(2)"` (forbidden) | 0 matches |
| `grep "List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'"` | 1 match in send.ts |
| `grep "open_tracking: false, click_tracking: false"` | 1 match in send.ts |
| `grep "import { safeSubject } from '$lib/alerts/operator'"` | 1 match in send.ts |
| `grep "import { Resend } from 'resend'"` | 1 match in send.ts |
| `grep -E "user_email_sent\|user_email_send_failed"` | 2 matches in send.ts |
| `grep -E "logger\.(info\|error).*args\.(to\|subject)"` (PII leak — must be 0) | 0 matches |

All plan acceptance criteria met.

## Known Stubs

None. Every value path in this plan is wired end-to-end: `postalAddress.ts` reads real env, `buildEmail.ts` renders real HTML+text, `templates.ts` calls real `formatPerAngler` and real `escapeHtml`, `send.ts` calls real `Resend`. The only mocks are in tests, where they belong.

The single placeholder dependency — `src/lib/shared/format.ts` — is the parallel-wave shim documented in Deviation 1; it is identical to Plan 04-02's authored version, so post-merge it ceases to be a shim.

## Threat Flags

None. All threat surfaces introduced by this plan (env-sourced postal address, HTML composition of subscriber-supplied display values, Resend transport with custom headers, PII-safe logging) appear in the plan's `<threat_model>` block and are mitigated.

## Self-Check: PASSED

Verified after writing SUMMARY.md:

- `src/lib/email/postalAddress.ts` — FOUND
- `src/lib/email/buildEmail.ts` — FOUND
- `src/lib/email/templates.ts` — FOUND
- `src/lib/email/send.ts` — FOUND
- `tests/unit/email/buildEmail.test.ts` — FOUND
- `tests/unit/email/templates.test.ts` — FOUND
- `tests/unit/email/send.test.ts` — FOUND
- `tests/helpers/env-dynamic-private-shim.ts` — FOUND
- `src/lib/shared/format.ts` (parallel-wave shim) — FOUND
- `vitest.config.ts` (modified) — FOUND
- Commit `636d84e` (chore: vitest shim + format.ts parallel-wave shim) — FOUND
- Commit `3bfebd2` (feat: Task 1 source files) — FOUND
- Commit `256c5fc` (feat: Task 2 source + 3 test files) — FOUND
