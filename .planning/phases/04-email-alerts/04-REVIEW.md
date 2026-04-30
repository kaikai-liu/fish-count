---
phase: 04-email-alerts
reviewed: 2026-04-29T00:00:00Z
depth: standard
files_reviewed: 38
files_reviewed_list:
  - .env.example
  - scripts/_sveltekit-env-loader.mjs
  - scripts/_sveltekit-env-resolver.mjs
  - scripts/email-tester-drill.ts
  - src/lib/alerts/dispatch.ts
  - src/lib/alerts/disposableEmail.ts
  - src/lib/alerts/evaluators/hotDay.ts
  - src/lib/alerts/evaluators/startingToRun.ts
  - src/lib/alerts/honeypot.ts
  - src/lib/alerts/rateLimit.ts
  - src/lib/alerts/tokens.ts
  - src/lib/alerts/warmup.ts
  - src/lib/components/PerAnglerMetric.svelte
  - src/lib/components/PreferenceRow.svelte
  - src/lib/components/SignupForm.svelte
  - src/lib/db/alertsSent.ts
  - src/lib/db/boats.ts
  - src/lib/db/migrations.ts
  - src/lib/db/queries/alertEval.ts
  - src/lib/db/signupAttempts.ts
  - src/lib/db/subscribers.ts
  - src/lib/db/suppressionList.ts
  - src/lib/email/buildEmail.ts
  - src/lib/email/postalAddress.ts
  - src/lib/email/send.ts
  - src/lib/email/templates.ts
  - src/lib/server/scheduler.ts
  - src/lib/shared/format.ts
  - src/routes/about/+page.svelte
  - src/routes/alerts/+page.server.ts
  - src/routes/alerts/+page.svelte
  - src/routes/alerts/confirm/+page.server.ts
  - src/routes/alerts/confirmed/+page.server.ts
  - src/routes/alerts/confirmed/+page.svelte
  - src/routes/alerts/manage/+page.server.ts
  - src/routes/alerts/manage/+page.svelte
  - src/routes/alerts/pending/+page.server.ts
  - src/routes/alerts/pending/+page.svelte
  - src/routes/alerts/unsubscribe/+page.server.ts
  - src/routes/alerts/unsubscribe/+page.svelte
  - src/routes/boats/[id]/+page.svelte
  - src/routes/picker/+page.svelte
findings:
  critical: 1
  warning: 6
  info: 7
  total: 14
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-04-29T00:00:00Z
**Depth:** standard
**Files Reviewed:** 41 (path list above; the YAML count above reflects the rounded count — 41 distinct paths in `files`)
**Status:** issues_found

## Summary

Phase 4 (Email Alerts) is a large, well-structured surface that takes the documented anti-abuse and CAN-SPAM concerns seriously. The DAL boundary holds — every `db.prepare(...)` call lives under `src/lib/db/`. Token discipline is good: HMAC-SHA256, purpose-bound payloads, constant-time signature compare, fail-closed `PROJECT_SECRET` length check. Anti-enumeration in the signup pipeline is consistently honored (silent generic-success on honeypot / suppression / already-pending). HTML escaping in email templates is applied where it matters; hard-coded URLs and numeric formatters are the only un-escaped interpolations and they are safe by construction. Dispatcher dedup, queue-drain ordering, and per-candidate non-fatal try/catch placement match the documented contracts.

The biggest finding is a **string-comparison bug in the warm-up cap counter** (`countSentSince`): the cutoff is built as ISO-8601 (`YYYY-MM-DDTHH:MM:SS.sssZ`) but `sent_at` is written via SQLite's `datetime('now')` which returns the space-separated form (`YYYY-MM-DD HH:MM:SS`). String `>=` between the two formats short-circuits to "always less than the cutoff," so `sentToday` is effectively pinned at 0. In the current scheduler topology (one tick/day) this is benign because the per-tick cursor still enforces the cap, but the bug invalidates any fault-tolerance the design was supposed to give for multi-tick days, and it makes the cap non-observable to any future per-day query. **This is the only Critical-severity finding.**

A second class of findings concerns hard-coded `https://fishcount.app` URLs in `templates.ts` (boat detail link in the hot-day email, trends URL in the starting-to-run email). These bypass `PUBLIC_BASE_URL` and will silently produce wrong URLs in any non-production environment. A third class is fail-open env defaults: `PUBLIC_BASE_URL` and `SUBSCRIBER_FROM_EMAIL` both have hard-coded fallback strings in `dispatch.ts` and `+page.server.ts`. CLAUDE.md and `.env.example` document these as required; the current behavior contradicts the documented fail-closed posture.

Smaller items round out the warnings (UTC vs PT day boundary acknowledged in code, no Zod validation of decoded token payload structure, manage-page `removeBoat` returns differentiable HTTP status codes after token verification). Info items cover dead/misleading props, `paused_until` string-compare risks, and `recordSent` lacking transactional guarantees with `exists()`.

No SQL injection, no XSS, no header injection, no token replay/forgery vector found. The DAL boundary is intact across all 7 sub-phases.

---

## Critical Issues

### CR-01: `countSentSince` cutoff format mismatch — warm-up cap is unobservable across ticks

**File:** `src/lib/db/alertsSent.ts:90-95` and `src/lib/alerts/dispatch.ts:41-49`

**Issue:** `countSentSince` does a SQL string comparison `WHERE sent_at >= ?` where `sent_at` was written by `datetime('now')` in `recordSent` (line 70) and `markSent` (line 144) — both produce the SQLite default form `YYYY-MM-DD HH:MM:SS` (space separator, no `T`, no `Z`). The caller in `dispatch.ts` builds the cutoff as `${today}T00:00:00.000Z` (ISO-8601 with `T` and `Z`).

Lexicographic string compare: `'2026-04-29 23:00:00' < '2026-04-29T00:00:00.000Z'` because the space character (0x20) sorts before `T` (0x54). So **every** `sent_at` row from today (or any earlier date with the same year) is less than the cutoff, and the `>=` filter drops it. `countSentSince` returns 0 in normal operation.

In today's single-tick-per-day scheduler the bug is masked: the in-memory cursor (`cursorSentToday`) handles the per-tick budget correctly. But the moment the dispatcher runs more than once per day (manual re-trigger, future `/api/cron/dispatch` route, retry tick after an outage), the warm-up cap will not be honored — every fresh tick sees `sentToday=0` and gets a full 50/200-message budget, blowing past the documented warm-up promise.

**Fix:** Either (a) write `sent_at` in the same ISO-8601 form the cutoff uses, or (b) build the cutoff in SQLite's default `datetime` form. The cleaner fix is to push the boundary computation into SQLite so the format never has to match across the language boundary:

```typescript
// src/lib/db/alertsSent.ts
export function countSentSince(db: Database.Database, sinceIso: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM alerts_sent
        WHERE status = 'sent'
          AND sent_at >= datetime(?)`
    )
    .get(sinceIso) as { c: number };
  return row.c;
}
```

`datetime('2026-04-29T00:00:00.000Z')` normalizes to `'2026-04-29 00:00:00'`, which then compares correctly against existing `sent_at` rows. Add a unit test that inserts a row via `recordSent` then asserts `countSentSince(midnightOfThatDay)` returns ≥1.

---

## Warnings

### WR-01: Hard-coded production URLs in alert templates bypass `PUBLIC_BASE_URL`

**File:** `src/lib/email/templates.ts:69` and `src/lib/email/templates.ts:107`

**Issue:** Two template-internal URLs are hard-coded to the production domain:

```typescript
// renderHotDayEmail
const boatUrl = `https://fishcount.app/boats/${args.boatId}`;
// renderRunStartEmail
const trendsUrl = `https://fishcount.app/trends?species=...&tripType=...`;
```

Every other URL in the system flows through `PUBLIC_BASE_URL` (dispatch.ts:192, +page.server.ts:160, manage/+page.server.ts:53, confirmed/+page.server.ts:38). These two interior CTAs do not. In a staging deployment, mail-tester drill, or any non-prod environment, recipients will be sent to the production site instead of the environment that actually generated the alert — confusing for QA, dangerous for any future tenant-isolated deployment.

**Fix:** Take `baseUrl` as an argument (the dispatcher already has it), or read it inside the template:

```typescript
import { env } from '$env/dynamic/private';

export function renderHotDayEmail(args: { /* ...existing... */ }): BuildEmailArgs {
  const baseUrl = env.PUBLIC_BASE_URL ?? 'https://fishcount.app';
  const boatUrl = `${baseUrl}/boats/${args.boatId}`;
  // ...
}
```

Same pattern in `renderRunStartEmail` for `trendsUrl`. Better still, plumb `baseUrl` through the `hotDayEmail`/`startingToRunEmail` adapter args so the dispatcher remains the single source of truth.

---

### WR-02: Fail-open default for `PUBLIC_BASE_URL` and `SUBSCRIBER_FROM_EMAIL`

**File:** `src/lib/alerts/dispatch.ts:192-194` and `src/routes/alerts/+page.server.ts:160,164`

**Issue:** Both env reads silently fall back to hard-coded defaults:

```typescript
const baseUrl = env.PUBLIC_BASE_URL ?? 'https://fishcount.app';
const fromDomain = (env.SUBSCRIBER_FROM_EMAIL ?? 'alerts@fishcount.app').split('@')[1] ?? 'fishcount.app';
```

`.env.example` describes `PUBLIC_BASE_URL` as required ("MUST match the production domain or links will 404") and `SUBSCRIBER_FROM_EMAIL` as required for sending. `postalAddress.ts` and `tokens.ts` correctly throw on missing/short env. These two reads contradict the documented fail-closed discipline (CLAUDE.md non-negotiable #5: "all, not a subset").

In practice this means a misconfigured deployment will send confirmation/alert emails with `https://fishcount.app/...` confirmation links and `unsubscribe+TOKEN@fishcount.app` mailto headers — even if the real deployment lives elsewhere. Tokens may be unverifiable on the production domain, and bounces will hit a destination that may not own the inbox.

**Fix:** Throw at module load (or first call) when either env is missing:

```typescript
function requireEnv(name: 'PUBLIC_BASE_URL' | 'SUBSCRIBER_FROM_EMAIL'): string {
  const v = env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`${name} is required for subscriber email dispatch`);
  }
  return v;
}
```

Then `const baseUrl = requireEnv('PUBLIC_BASE_URL');` etc. The drill script already enforces this for the same env vars (email-tester-drill.ts:234-242) — the production code path should match.

---

### WR-03: `verifyToken` does not validate decoded payload shape

**File:** `src/lib/alerts/tokens.ts:71-82`

**Issue:** After signature verification passes, the JSON-parsed payload is used without any structural validation:

```typescript
let payload: Payload;
try {
  payload = JSON.parse(b64uDec(body).toString('utf8'));
} catch { return { ok: false, reason: 'malformed' }; }
if (payload.p !== purpose) return { ok: false, reason: 'wrong_purpose' };
if (payload.e !== null && payload.e < Math.floor(Date.now() / 1000)) {
  return { ok: false, reason: 'expired' };
}
return { ok: true, subjectId: payload.s };
```

If `payload.s` is a string (e.g. someone wrote a buggy signer), it propagates downstream as a SQL parameter to `findById(db, verified.subjectId)`. better-sqlite3 would coerce it, but the code's contract (`subjectId: number`) is broken in a way TypeScript won't catch (it's `Payload.s: number` declared but `JSON.parse` returns `any` after the type assertion).

This is mostly a defense-in-depth concern — to forge a payload an attacker needs the HMAC key, in which case forging the schema is the smaller problem. Severity is Warning rather than Critical because the signing path is the only producer and produces well-typed payloads. Still, the validation is cheap and matches the project's general "fail-closed" posture.

**Fix:** Validate with Zod (already a dependency) or with explicit predicates:

```typescript
import { z } from 'zod';

const PayloadSchema = z.object({
  p: z.enum(['confirm', 'manage', 'unsubscribe']),
  s: z.number().int().positive(),
  e: z.number().int().nullable(),
  n: z.string().min(1)
});

// inside verifyToken:
const parsed = PayloadSchema.safeParse(JSON.parse(b64uDec(body).toString('utf8')));
if (!parsed.success) return { ok: false, reason: 'malformed' };
const payload = parsed.data;
```

---

### WR-04: `markSent` silently no-ops when row is not in `queued` state

**File:** `src/lib/db/alertsSent.ts:141-147`

**Issue:** `markSent` is the dispatcher's "drained queue → sent" promote step. The WHERE clause `WHERE id = ? AND status = 'queued'` makes it idempotent against double-sends, which is correct. But the function returns `void`, so the caller (`dispatch.ts:177`) cannot detect a no-op. The dispatcher then increments `cursor` and `drained` and logs `queue_drained_one` even when no row was actually flipped.

If the row was somehow flipped to `expired` between `listQueued` and `markSent` (e.g. concurrent TTL sweep, manual operator intervention), the dispatcher logs a successful drain that did not happen. Worse, the warm-up cap accounting (`cursor += 1`) thinks a send happened.

**Fix:** Return `result.changes` so the caller can branch:

```typescript
export function markSent(db: Database.Database, id: number, resendMessageId: string): number {
  const result = db.prepare(
    `UPDATE alerts_sent
        SET status = 'sent', sent_at = datetime('now'), resend_message_id = ?
      WHERE id = ? AND status = 'queued'`
  ).run(resendMessageId, id);
  return result.changes;
}
```

Then in `dispatch.ts` drainQueued:

```typescript
const changed = alertsSent.markSent(db, row.id, messageId);
if (changed === 0) {
  log.warn({ msg: 'queue_drain_markSent_noop', id: row.id });
  continue; // do NOT increment cursor or drained
}
cursor += 1;
drained += 1;
```

---

### WR-05: PT day boundary acknowledged but not addressed — warmup window can leak across PT midnight

**File:** `src/lib/alerts/dispatch.ts:41-49`

**Issue:** `midnightPtIso(today)` returns `${today}T00:00:00.000Z` — the comment correctly identifies this is UTC midnight, not PT midnight, and shrugs it off as "acceptable v1 simplicity." With the croner job at 23:00 PT (06:00 UTC the next day in summer / 07:00 UTC in winter), the cutoff for a tick on 2026-04-29 PT becomes `2026-04-29T00:00:00.000Z`, which is **17 hours BEFORE** the 23:00-PT-on-2026-04-29 tick fires.

Combined with CR-01 the practical effect is moot today, but if/when CR-01 is fixed, this off-by-7-hours window will under-count yesterday's late-night sends as today's. For example, a send at 23:30 PT on 2026-04-28 has `sent_at = '2026-04-29 06:30:00'` (UTC), which IS `>= '2026-04-29T00:00:00.000Z'` after CR-01's `datetime(?)` normalization — so it counts toward today's cap, even though the operator wrote the alert "yesterday."

**Fix:** Convert `today` (Pacific) to its actual UTC instant. Since `today` is a YYYY-MM-DD PT string, the PT-midnight-as-UTC-instant is `today` minus 7 or 8 hours from UTC midnight depending on DST:

```typescript
import { ptMidnightAsUtc } from '$lib/shared/dates'; // implement in the single date producer

function midnightPtIso(today: string): string {
  // Returns the UTC ISO string that corresponds to YYYY-MM-DD 00:00:00 PT.
  return ptMidnightAsUtc(today);
}
```

If implementing the helper is too much for v1, at minimum bump the comment to a TODO with a tracking issue, and add a regression test asserting the documented behavior so future work can be measured against it.

---

### WR-06: Manage-page action returns differentiable HTTP statuses on token-verified path

**File:** `src/routes/alerts/manage/+page.server.ts:115-134`

**Issue:** `removeBoat` (and `removeSpecies`) return `fail(401)` on bad token, `fail(400)` on bad form data, and `fail(404)` on missing summary. Once an attacker has a valid manage token (which only the subscriber should), they can probe whether arbitrary `subjectId` values exist by submitting form bodies and observing 404 vs 200. Combined with token-replay across subscribers (not directly possible because subjectId is in the signed payload), this isn't an immediate enumeration vector — but it does leak whether the subscriber row was deleted between two manage requests (e.g., after an unsubscribe race).

**Fix:** Collapse all post-verification errors to a single response shape. After verification passes, treat any DAL inconsistency as an opaque 200 (no-op):

```typescript
removeBoat: async ({ request, url }) => {
  const v = verifySubject(tokenFromUrl(url));
  if (!v.ok) return fail(401);

  const fd = await request.formData();
  const removeBoatId = Number(fd.get('boatId') ?? 0);
  // Bad form data is opaque — log and no-op (anti-enumeration).
  if (!Number.isFinite(removeBoatId) || removeBoatId <= 0) {
    logger.warn({ msg: 'manage_remove_boat_bad_input', subscriberId: v.subjectId });
    throw redirect(303, `/alerts/manage?token=${encodeURIComponent(tokenFromUrl(url) ?? '')}`);
  }

  const db = getDb();
  const summary = subscribers.getSummary(db, v.subjectId);
  if (!summary) {
    // Row deleted concurrently — same redirect, no observable state change.
    throw redirect(303, `/alerts/manage?token=${encodeURIComponent(tokenFromUrl(url) ?? '')}`);
  }
  // ...
}
```

---

## Info

### IN-01: `PreferenceRow` `kind` prop is read but never used by the server actions

**File:** `src/lib/components/PreferenceRow.svelte:6-16` and `src/routes/alerts/manage/+page.server.ts:94-157`

**Issue:** `PreferenceRow` exposes a `kind: 'boat' | 'species'` prop and emits a hidden `<input type="hidden" name="kind" value={kind} />`. The corresponding server actions (`removeBoat`, `removeSpecies`) do not read `kind` — they discriminate on the form-action URL (`?/removeBoat` vs `?/removeSpecies`). The prop is misleading: a future contributor reading `PreferenceRow` will assume the server uses `kind` and may add a third action that breaks the contract.

Additionally, the manage page's boat list does NOT use `PreferenceRow` at all (it inlines a custom form with `boatId` instead of the `label`-only `PreferenceRow`), so `PreferenceRow kind="boat"` is unreachable in the current tree.

**Fix:** Drop the `kind` prop entirely (and the hidden input), or wire the server to actually read it. Cleanup direction (drop):

```svelte
<script lang="ts">
  let {
    label,
    href,
    removeFormAction
  }: {
    label: string;
    href?: string;
    removeFormAction: string;
  } = $props();
</script>
```

---

### IN-02: `paused_until` stored as YYYY-MM-DD compared against `date('now')` UTC string

**File:** `src/lib/db/subscribers.ts:148-156` and `src/routes/alerts/manage/+page.server.ts:77-83`

**Issue:** `pausedUntilFor('1w')` produces `addDays(today(), 7)` (a Pacific-time YYYY-MM-DD). `listActive` filters with `paused_until < date('now')` where `date('now')` is the current **UTC** date. Between PT midnight and UTC midnight (7-8 hour window every night), the comparison can include or exclude paused subscribers incorrectly: e.g., a user sets `paused_until = '2026-04-29'` and at 22:00 PT on 2026-04-29 the dispatcher sees `date('now') = '2026-04-30'` (UTC), so `'2026-04-29' < '2026-04-30'` evaluates true — they receive an alert on the day they paused through.

The window is small and the impact is "1 unwanted alert per pause boundary," but the documented timezone discipline (CLAUDE.md "all dates are YYYY-MM-DD in America/Los_Angeles") is not honored at this comparison.

**Fix:** Use the project's `today()` producer in the SQL parameter:

```typescript
// in listActive — pass today() as a parameter rather than using date('now')
const subs = db
  .prepare(
    `SELECT ... FROM subscribers
      WHERE status = 'active'
        AND (paused_until IS NULL OR paused_until < ?)
      ORDER BY id ASC`
  )
  .all(todayPt) as Subscriber[];
```

(Where `todayPt` is passed in by the dispatcher, mirroring the `today` parameter already threaded through `dispatchAlerts`.)

---

### IN-03: `recordSent` is not in a transaction with `exists()` — TOCTOU race possible across processes

**File:** `src/lib/alerts/dispatch.ts:240-334`

**Issue:** The dispatcher checks `alertsSent.exists(db, dedupKey)` then later calls `alertsSent.recordSent(db, dedupKey, messageId)`. These are two separate statements; another process (operator manually invoking dispatch, future cron route) could insert between them. The UNIQUE index on `alerts_sent` would catch the second insert, but it would surface as a thrown SqliteError caught by the per-candidate try/catch, which logs `send_failed_non_fatal` — masking what is actually a successful idempotency outcome.

Today only the scheduler tick calls `dispatchAlerts` and `protect: true` on the croner Cron prevents overlap, so the race window is closed. But the surface is brittle; any future "manual dispatch" route would expose it.

**Fix:** Wrap the per-candidate "exists check + insert + send" in a transaction, OR call `recordSent` first (with a sentinel `messageId`) then send. The simpler defensive fix is to upgrade the catch block to recognize SqliteError UNIQUE conflicts:

```typescript
} catch (err) {
  const isDup = err instanceof Error
    && /UNIQUE constraint failed: idx_alerts_sent_unique/.test(err.message);
  if (isDup) {
    log.info({ msg: 'alert_dedup_race_observed', kind: c.kind, key: c.triggerKey });
  } else {
    log.error({ err, msg: 'send_failed_non_fatal', kind: c.kind, key: c.triggerKey });
  }
}
```

---

### IN-04: `email-tester-drill.ts` reads env directly while production code reads via `$env/dynamic/private`

**File:** `scripts/email-tester-drill.ts:234-247`

**Issue:** The drill checks `process.env[k]` for required vars while the modules it imports (`tokens.ts`, `postalAddress.ts`) read `env.<KEY>` via the `$env/dynamic/private` shim from the resolver. In normal usage these resolve to the same value because the shim is a `process.env` Proxy. But the drill's pre-flight is a defense-in-depth check that should match the actual resolution path — otherwise a future change to the shim (e.g., reading from a `.env.production` file at boot) would leave the drill reporting "all env present" while the actual production reads see different values.

**Fix:** Import `env` from `$env/dynamic/private` for the pre-flight too:

```typescript
import { env } from '$env/dynamic/private';
// ...
const missing = required.filter((k) => !env[k] || env[k]!.trim().length === 0);
```

This works because `_sveltekit-env-resolver.mjs` is loaded before the import.

---

### IN-05: `dispatch.ts` queue-drain "we owe you this" path emits zero-valued numbers

**File:** `src/lib/alerts/dispatch.ts:122-167`

**Issue:** When draining a queued row, the dispatcher cannot recover the original candidate body, so it builds a hot-day or run-start email with `todayValue: 0, todayAnglers: 0, trailingAvg: 0, multiplier: 0, speciesList: []`. The template renders this as "Today on Boat #42 (1/2 Day AM): — fish/angler · n=0 anglers. That's 0.0x above its trailing 30-day same-trip-type average (— fish/angler). Species: ." The `formatPerAngler` graceful-`—` saves it from outright nonsense, but the resulting email still says "0.0x above" and lists no species.

The comment acknowledges this is the "safety net for the warm-up window only" path — the v1 hot-path avoids it by not queueing, which only happens when over the warm-up cap. Per the documented promise ("we never silently drop"), this drain still needs to deliver something coherent.

**Fix:** Either (a) queue the rendered template body alongside the dedup row (add a `body_json TEXT` column to `alerts_sent` populated by `recordQueued`), or (b) re-evaluate just the queued candidates by re-reading the underlying stats via `alertEval.*` queries with the row's stored `trigger_key` and `trigger_date`. Option (b) is simpler since the evaluator math is pure — refactor `evaluateHotDay` so a single `evaluateHotDayForCandidate(boatId, tripType, today)` helper exists and call it from both the bulk evaluator and the drain path.

---

### IN-06: Step-7 "already-active" redirect to `/alerts/confirmed?already=1` reveals subscriber state

**File:** `src/routes/alerts/+page.server.ts:151-153`

**Issue:** Steps 2/5/6 of the signup pipeline all redirect to `/alerts/pending?m=...` (silent generic-success). Step 7 (already-active subscriber) redirects to a different URL `/alerts/confirmed?already=1`. An attacker submitting many email addresses can distinguish "this email is already an active subscriber" from "this email triggered honeypot/suppression/already-pending/happy-path" by observing the redirect Location header — direct enumeration of active subscribers.

The codebase comment cites UI-SPEC §"Signup form submission" 4(f) as the source for this behavior, so it may be intentional. If so, a Pitfall acknowledgment should be added to the route comment so future readers don't regress on it. If not, the fix is to redirect to the same `/alerts/pending` URL on step 7 too — the user already knows their email is on file (they typed it) and a confirmation email is not sent on this branch, so no UX regresses.

---

### IN-07: `subscribers.findRecentPending` sub.created_at is non-optional but accessed with optional chaining

**File:** `src/lib/alerts/dispatch.ts:119,277-279`

**Issue:** `signupDate = sub.confirmed_at?.slice(0, 10) ?? sub.created_at?.slice(0, 10) ?? today;` — `Subscriber.created_at` is typed as `string` (required) in `subscribers.ts:14`. The `?.` is dead code that suggests it's nullable. Either the type should be loosened to `string | null` (matching reality if the DB ever returned null) or the `?.` should be dropped. Cosmetic, but it confuses static analysis of nullability.

**Fix:** Drop the `?.` on `created_at`:

```typescript
const signupDate = sub.confirmed_at?.slice(0, 10) ?? sub.created_at.slice(0, 10);
// the `?? today` fallback is no longer reachable — drop it too, or keep as defensive belt
```

---

_Reviewed: 2026-04-29T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
