# Phase 4: Email Alerts — Pattern Map

**Mapped:** 2026-04-27
**Files analyzed:** ~32 new + 5 modified
**Analogs found:** 30 / 32 (2 with no exact analog — flagged below)

This map points each new/modified Phase 4 file at the closest existing analog and extracts the concrete excerpt to copy from. Per CLAUDE.md the load-bearing analog axis is the **DAL boundary** (only `src/lib/db/*` issues SQL); per Phase 3 the **pure-fn evaluator** axis is the second analog axis (`src/lib/forecast/compute.ts` — DB handle as parameter, no module-scope DB). UI primitives are inherited 1:1 from Phase 2 (UI-SPEC §"Design System" — zero new tokens).

---

## File Classification

### A. New DAL repositories (role=model, data-flow=CRUD)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/lib/db/subscribers.ts` | DAL repo | CRUD (pending → active state machine) | `src/lib/db/forecasts.ts` (idempotent upsert) + `src/lib/db/scrapeRuns.ts` (state-enum + lookup helpers) | exact |
| `src/lib/db/suppressionList.ts` | DAL repo | CRUD (insert + has-lookup) | `src/lib/db/landings.ts` (single-key unique upsert) + `src/lib/db/scrapeRuns.ts::recordOutcome` | exact |
| `src/lib/db/signupAttempts.ts` | DAL repo | append-only ledger | `src/lib/db/scrapeRuns.ts` (ledger w/ window query) | exact |
| `src/lib/db/alertsSent.ts` | DAL repo | append + dedup-existence + count | `src/lib/db/scrapeRuns.ts` (latestSuccessOrEmpty + countPresentDays) + `src/lib/db/forecasts.ts` (UNIQUE index for idempotency) | exact |
| `src/lib/db/queries/alertEval.ts` | cross-table DAL query | request-response (read-only) | `src/lib/db/queries/tripPicker.ts::heatmapForQuery` | exact |
| `src/lib/db/migrations.ts` | schema DDL (extended) | DDL bootstrap | `src/lib/db/migrations.ts` (existing — append new tables) | identity |

### B. New pure-fn libs (role=service, data-flow=transform)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/lib/alerts/tokens.ts` | service (HMAC sign/verify) | transform | `src/lib/scraper/schema.ts` (Zod transform discipline at I/O boundary) + new pattern (no exact analog for HMAC) | role-match |
| `src/lib/alerts/honeypot.ts` | service (pure check) | transform | `src/lib/scraper/sla.ts::shouldAlert` (pure decision fn) | exact |
| `src/lib/alerts/disposableEmail.ts` | service (pure check) | transform | `src/lib/scraper/sla.ts::shouldAlert` (pure decision fn) | exact |
| `src/lib/alerts/rateLimit.ts` | service + DAL caller | transform + CRUD | `src/lib/scraper/sla.ts` (pure `shouldAlert` + side-effect `checkSlaAndAlert` split) | exact |
| `src/lib/alerts/warmup.ts` | service (pure cap check) | transform | `src/lib/scraper/sla.ts::shouldAlert` | exact |
| `src/lib/alerts/evaluators/hotDay.ts` | service (pure evaluator) | transform | `src/lib/forecast/compute.ts::computeCell` (pure-math + DAL handle param) | exact |
| `src/lib/alerts/evaluators/startingToRun.ts` | service (pure evaluator) | transform | `src/lib/forecast/compute.ts::computeCell` | exact |
| `src/lib/alerts/dispatch.ts` | orchestrator | request-response (write-side) | `src/lib/forecast/compute.ts::recomputeForecasts` (orchestrator over pure cells) + `src/lib/scraper/sla.ts::checkSlaAndAlert` (side-effect wrapper) | exact |

### C. New email composer + send wrapper

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/lib/email/buildEmail.ts` | service (HTML+text builder) | transform (pure string-out) | `src/lib/scraper/parser.ts` (pure transform, no I/O) — but no exact email-template analog exists | role-match |
| `src/lib/email/templates.ts` | template strings | transform | new (no analog) | NO ANALOG |
| `src/lib/email/send.ts` | service (Resend wrapper) | request-response (external API) | `src/lib/alerts/operator.ts::sendOperatorAlert` | exact |
| `src/lib/email/postalAddress.ts` | service (env reader, fail-closed) | transform | `src/lib/server/kill-switch.ts::scrapingEnabled` (env-gate fail-closed) | role-match |

### D. New shared formatter

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/lib/shared/format.ts::formatPerAngler` | utility (pure formatter) | transform | `src/lib/components/PerAnglerMetric.svelte` lines 31-46 (formatter currently inlined; extract to here) | identity |

### E. New SvelteKit routes (role=controller, data-flow=request-response)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/routes/alerts/+page.server.ts` | route loader + form actions | request-response | `src/routes/picker/+page.server.ts` (form-shaped data + filterOptions) — no existing `actions:default` analog | role-match (form actions = NEW) |
| `src/routes/alerts/+page.svelte` | route view | request-response | `src/routes/picker/+page.svelte` (form scaffold + FilterBar) | role-match |
| `src/routes/alerts/pending/+page.svelte` | static success view | request-response | `src/routes/about/+page.svelte` (static prose page) | exact |
| `src/routes/alerts/confirmed/+page.svelte` | static success view | request-response | `src/routes/about/+page.svelte` | exact |
| `src/routes/alerts/confirm/+page.server.ts` | token-verification load fn | request-response | `src/routes/picker/+page.server.ts::load` (parse + branch on validity) | role-match |
| `src/routes/alerts/manage/+page.server.ts` | token-gated load + actions | request-response | `src/routes/picker/+page.server.ts::load` (filter parsing → guidance branch) | role-match (actions = NEW) |
| `src/routes/alerts/manage/+page.svelte` | preferences view | request-response | `src/routes/picker/+page.svelte` (form + sectioned layout) | role-match |
| `src/routes/alerts/unsubscribe/+page.server.ts` | one-click GET/POST handler | request-response | `src/routes/picker/+page.server.ts::load` + `src/lib/scraper/sla.ts::checkSlaAndAlert` (side-effect-before-render) | role-match |
| `src/routes/alerts/unsubscribe/+page.svelte` | static success view | request-response | `src/routes/about/+page.svelte` | exact |

### F. New Svelte components (role=component, data-flow=request-response)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/lib/components/SignupForm.svelte` | form component | request-response | `src/routes/picker/+page.svelte` lines 81-173 (FilterBar with native form inputs + actions snippet) — no embeddable form-component analog yet | role-match |
| `src/lib/components/PreferenceRow.svelte` | row component | request-response | `src/lib/components/BoatRow.svelte` (single-row primitive with link + nested action) | exact |

### G. Modified existing files

| Modified File | Role | Data Flow | Pattern Source | Notes |
|---------------|------|-----------|----------------|-------|
| `src/lib/db/migrations.ts` | DDL append | DDL | existing CREATE TABLE blocks lines 18-110 | Append 4 new `CREATE TABLE IF NOT EXISTS` + UNIQUE indexes inside `SCHEMA_SQL`. |
| `src/lib/server/scheduler.ts::_scrapeTick` | tick orchestrator | event-driven | existing `try { recomputeForecasts(getDb()); } catch …` lines 90-97 | Add `dispatchAlerts(today, getDb())` call after forecast recompute, same non-fatal try/catch. |
| `src/routes/about/+page.svelte` | static prose page | request-response | existing `<h2>` blocks lines 16-50 | Append "Email alerts" `<h2>` section (UI-SPEC §`/about#email`). |
| `src/routes/boats/[id]/+page.svelte` | route view | request-response | existing inline `<a>` links lines 22-35 | Add "Get alerts for this boat" `<a>` linking to `/alerts?boat=[id]`. |
| `src/routes/picker/+page.svelte` | route view | request-response | existing `Reset filters` action snippet lines 165-171 | Add "Get alerts when this picks up" inline link in results section. |
| `src/lib/components/PerAnglerMetric.svelte` | component | request-response | existing formatted block lines 31-46 | Replace inline format with `formatPerAngler` import from new `src/lib/shared/format.ts`. |

### H. New tests

| New File | Role | Closest Analog |
|----------|------|----------------|
| `tests/unit/db/subscribers.test.ts` | DAL unit | `tests/unit/db/forecasts.test.ts` |
| `tests/unit/db/suppressionList.test.ts` | DAL unit | `tests/unit/db/forecasts.test.ts` |
| `tests/unit/db/signupAttempts.test.ts` | DAL unit | `tests/unit/db/scrapeRuns.test.ts` |
| `tests/unit/db/alertsSent.test.ts` | DAL unit | `tests/unit/db/forecasts.test.ts` |
| `tests/alerts/tokens.test.ts` (or `tests/unit/alerts/`) | pure-fn unit | `tests/forecast/compute.test.ts` |
| `tests/alerts/evaluators/hotDay.test.ts` | pure-fn unit | `tests/forecast/compute.test.ts` |
| `tests/alerts/evaluators/startingToRun.test.ts` | pure-fn unit | `tests/forecast/compute.test.ts` |
| `tests/alerts/dispatch.test.ts` | orchestrator | `tests/forecast/compute.test.ts` (recomputeForecasts wraps cells) |
| `tests/integration/phase4-routes.test.ts` | integration | `tests/integration/phase2-routes.test.ts` |

---

## Pattern Assignments

### A.1 `src/lib/db/subscribers.ts` (DAL repo, CRUD)

**Analog:** `src/lib/db/forecasts.ts` (idempotent upsert + range read)

**Header & imports** (forecasts.ts lines 1-8):
```typescript
// src/lib/db/subscribers.ts — DAL repository for the subscribers table.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Phase 4 ALT-01/02/06: pending → active state machine.
// Idempotent upsert on (email) — re-signup of an already-pending row updates expires_at.
import type Database from 'better-sqlite3';
```

**Idempotent upsert pattern** (forecasts.ts lines 36-59):
```typescript
export function upsertMany(db: Database.Database, rows: ForecastRow[]): number {
  if (rows.length === 0) return 0;
  const stmt = db.prepare(
    `INSERT INTO forecasts (...)
     VALUES (...)
     ON CONFLICT(forecast_date, species, trip_type) DO UPDATE SET
       value = excluded.value, ...`
  );
  const tx = db.transaction((items: ForecastRow[]) => {
    for (const r of items) stmt.run(r);
  });
  tx(rows);
  return rows.length;
}
```
Adapt for `createPending(email, boats[], species[], ip)` → INSERT with ON CONFLICT(email) DO UPDATE on `boats_json`/`species_json`/`pending_token_expires_at`. Wrap multi-row writes (if any) in a single transaction.

**State-machine helper pattern** (scrapeRuns.ts lines 27-41):
```typescript
export function recordOutcome(db: Database.Database, input: ScrapeRunInput): void {
  db.prepare(
    `INSERT INTO scrape_runs (...) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(input.runId, input.runDate, ...);
}
```
Use the same shape for `activate(db, subscriberId)` (UPDATE row to status='active'), `findActive(db, email)`, `findRecentPending(db, email, ttlSec)`, `deleteForUnsubscribe(db, subscriberId)`.

**Range / lookup read pattern** (forecasts.ts lines 65-77):
```typescript
export function getCellsInRange(db: Database.Database, args: GetCellsArgs): ForecastRow[] {
  return db
    .prepare(`SELECT ... FROM forecasts WHERE ... ORDER BY forecast_date ASC`)
    .all(args) as ForecastRow[];
}
```
Use for `listActive(db)` — returns rows for the alert dispatcher.

---

### A.2 `src/lib/db/suppressionList.ts` (DAL repo, CRUD)

**Analog:** `src/lib/db/scrapeRuns.ts` for ledger-shape; landings.ts for single-key UNIQUE upsert.

**Insert + has-lookup pattern** (scrapeRuns.ts lines 27-41 + 112-124):
```typescript
// add(db, email): single INSERT OR IGNORE on UNIQUE(email).
db.prepare(`INSERT OR IGNORE INTO suppression_list (email, reason, suppressed_at) VALUES (?, ?, ?)`)
  .run(email, reason, isoNow);

// has(db, email): SELECT 1 LIMIT 1 — never returns the row, only existence.
const row = db.prepare(`SELECT 1 FROM suppression_list WHERE email = ? LIMIT 1`).get(email);
return row !== undefined;
```

**Anti-enumeration discipline:** suppression-list.has() must NEVER throw or distinguish "not found" vs "found" via timing — both branches do a single indexed lookup. Document this in the file header (UI-SPEC §"Anti-enumeration rule").

---

### A.3 `src/lib/db/signupAttempts.ts` (DAL repo, append-only ledger)

**Analog:** `src/lib/db/scrapeRuns.ts::computeSlaBaseline` (windowed COUNT)

**Append + windowed-count pattern** (scrapeRuns.ts lines 27-41 + 51-62):
```typescript
// recordAttempt(db, ip, attemptedAt):
db.prepare(`INSERT INTO signup_attempts (ip, attempted_at) VALUES (?, ?)`)
  .run(ip, attemptedAt);

// countWithinWindow(db, ip, windowSeconds, asOfIso):
const row = db
  .prepare(
    `SELECT COUNT(*) AS c
       FROM signup_attempts
      WHERE ip = ?
        AND attempted_at >= datetime(?, '-' || ? || ' seconds')`
  )
  .get(ip, asOfIso, windowSeconds) as { c: number };
return row.c;
```

**Date discipline:** attemptedAt is ISO-8601 produced by caller (`new Date().toISOString()`); not a YYYY-MM-DD producer (the STO-04 boundary applies to `today()` / `toIsoDate()` only).

---

### A.4 `src/lib/db/alertsSent.ts` (DAL repo, append + dedup-existence + count)

**Analog:** `src/lib/db/forecasts.ts` (UNIQUE index for idempotency) + `scrapeRuns.ts::countPresentDays`

**UNIQUE-index dedup pattern** (migrations.ts lines 107-110):
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_sent_unique
  ON alerts_sent(subscriber_id, kind, trigger_key, trigger_date);
```

**Existence check** (anti-pattern — see scrapeRuns.ts::latestSuccessOrEmpty lines 112-124 for the "exists or null" shape):
```typescript
export function exists(
  db: Database.Database,
  args: { subscriberId: number; kind: 'hot_day' | 'starting_to_run'; triggerKey: string; triggerDate: string }
): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM alerts_sent
        WHERE subscriber_id = ? AND kind = ? AND trigger_key = ? AND trigger_date = ?
        LIMIT 1`
    )
    .get(args.subscriberId, args.kind, args.triggerKey, args.triggerDate);
  return row !== undefined;
}
```

**Count today (warmup gate)** (scrapeRuns.ts::computeSlaBaseline shape):
```typescript
export function countSentSince(db: Database.Database, sinceIso: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM alerts_sent WHERE sent_at >= ? AND status = 'sent'`)
    .get(sinceIso) as { c: number };
  return row.c;
}
```

---

### A.5 `src/lib/db/queries/alertEval.ts` (cross-table read for evaluators)

**Analog:** `src/lib/db/queries/tripPicker.ts::heatmapForQuery` (per-date aggregate read)

**Aggregate read pattern** (tripPicker.ts lines 96-115):
```typescript
export function heatmapForQuery(db: Database.Database, args: HeatmapArgs): HeatmapCell[] {
  return db
    .prepare(
      `SELECT cr.source_date AS date,
              SUM(cr.species_count) * 1.0 / NULLIF(SUM(cr.angler_count), 0) AS value,
              COUNT(DISTINCT cr.source_date || '|' || cr.trip_type) AS n
         FROM catch_reports cr
        WHERE cr.species   = @species
          AND cr.trip_type = @tripType
          AND cr.source_date BETWEEN @fromDate AND @toDate
        GROUP BY cr.source_date
        ORDER BY cr.source_date ASC`
    )
    .all(args) as HeatmapCell[];
}
```

Adapt for:
- `getTodayBoatTripAvg(db, {today, boatId, tripType})` — boat-level today's avg (ALT-09 hot-day)
- `getTrailing30DayBoatTripAvg(db, {today, boatId, tripType})` — boat trailing baseline (ALT-09)
- `getRolling7DayFleetAvg(db, {today, species, tripType})` — fleet-wide ALT-10 numerator
- `getSameWeekLastYearFleetAvg(db, {today, species, tripType})` — ALT-10 denominator

All return `{value: number|null, n: number, ...}` shape — null when n=0 (NULLIF guard from tripPicker.ts).

---

### A.6 `src/lib/db/migrations.ts` (DDL append)

**Analog:** itself — append to existing `SCHEMA_SQL` template literal.

**Pattern (migrations.ts lines 16-111):**
```typescript
const SCHEMA_SQL = `
  -- ... existing tables ...

  -- Phase 4 ALT-01: subscribers (pending → active state machine)
  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('pending','active','paused')),
    boats_json TEXT NOT NULL,            -- JSON array of boat ids
    species_json TEXT NOT NULL,          -- JSON array of verbatim species names
    paused_until TEXT,                   -- ISO-8601 or NULL
    pending_token_expires_at TEXT,       -- ISO-8601, used while status='pending'
    confirmed_at TEXT,
    signup_ip TEXT NOT NULL,
    signup_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);

  -- Phase 4 ALT-06: suppression list (cannot be re-subscribed)
  CREATE TABLE IF NOT EXISTS suppression_list (
    email TEXT PRIMARY KEY,
    reason TEXT NOT NULL CHECK (reason IN ('user_unsubscribe','bounce','complaint','operator')),
    suppressed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Phase 4 ALT-03: per-IP signup-attempt ledger (window-based rate limit)
  CREATE TABLE IF NOT EXISTS signup_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    attempted_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_signup_attempts_ip_at ON signup_attempts(ip, attempted_at);

  -- Phase 4 ALT-11: alert dedup ledger (UNIQUE on (subscriber_id, kind, trigger_key, trigger_date))
  CREATE TABLE IF NOT EXISTS alerts_sent (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscriber_id INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('hot_day','starting_to_run','confirmation')),
    trigger_key TEXT NOT NULL,           -- e.g. boat_id|trip_type for hot_day; species|trip_type for runs
    trigger_date TEXT NOT NULL,          -- YYYY-MM-DD (PT) or YYYY-Www for run alerts
    status TEXT NOT NULL CHECK (status IN ('sent','queued','failed')),
    resend_message_id TEXT,
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_sent_unique
    ON alerts_sent(subscriber_id, kind, trigger_key, trigger_date);
  CREATE INDEX IF NOT EXISTS idx_alerts_sent_today ON alerts_sent(sent_at, status);
`;
```

Idempotent: every DDL is `IF NOT EXISTS`; safe on every boot per migrations.ts line 8 comment.

---

### B.1 `src/lib/alerts/tokens.ts` (HMAC sign/verify)

**Analog:** No exact analog — closest is `src/lib/scraper/schema.ts` for "transform pure fn at I/O boundary" discipline. Tokens module pattern is largely new.

**Header + import discipline** (operator.ts lines 1-9 — server-only env access):
```typescript
// src/lib/alerts/tokens.ts
// Phase 4 ALT-02 + ALT-05: HMAC-SHA256 signed tokens for confirm / manage / unsubscribe.
//
// Three purposes ('confirm' | 'manage' | 'unsubscribe') with different expiries
// share one signer/verifier — `purpose` is part of the signed payload so a
// confirm token cannot be replayed as an unsubscribe token (UI-SPEC §"Token signing").
//
// Server-only: PROJECT_SECRET must never reach the client. Imports from $env/dynamic/private.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
```

**Pure decision-fn discipline** (sla.ts lines 41-49 — pure helper before the side-effect wrapper):
```typescript
export function shouldAlert(
  outcome: ScrapeOutcome,
  baseline: number | null,
  todayTotal: number
): boolean {
  if (outcome !== 'success') return false;
  if (baseline === null || baseline < MIN_BASELINE_FOR_ALERT) return false;
  return todayTotal < SLA_THRESHOLD * baseline;
}
```
Apply: `signToken(purpose, subscriberId, expiresInSec?)` and `verifyToken(purpose, token)` are pure functions of input + `PROJECT_SECRET`. They MUST NOT touch the DB. `timingSafeEqual` for HMAC compare (defends against timing attacks; standard discipline for signed-token verifiers).

**Format:** `base64url(JSON({p, s, e, n})).base64url(hmac)`. Use Node 22's `Buffer.from(x).toString('base64url')`.

---

### B.2 `src/lib/alerts/honeypot.ts` (pure check)

**Analog:** `src/lib/scraper/sla.ts::shouldAlert` (pure decision)

**Pure-fn pattern** (sla.ts lines 31-49):
```typescript
// src/lib/alerts/honeypot.ts
// Phase 4 ALT-03: honeypot field check. Pure — no I/O, no DB.
//
// UI-SPEC §"Anti-enumeration rule": when filled, the SERVER renders the same
// generic-success page as a real signup. The bot cannot distinguish.

/**
 * Returns true if the honeypot was triggered (field non-empty).
 * Field name is "website" per UI-SPEC §FLAG #11.
 */
export function isFilled(websiteFieldValue: string | undefined | null): boolean {
  return typeof websiteFieldValue === 'string' && websiteFieldValue.trim().length > 0;
}
```

---

### B.3 `src/lib/alerts/disposableEmail.ts` (pure check)

**Analog:** `src/lib/scraper/sla.ts::shouldAlert` (pure decision)

**Pure-fn + module-set pattern:**
```typescript
// src/lib/alerts/disposableEmail.ts
// Phase 4 ALT-04: disposable-email rejection. Pure — backed by `disposable-email-domains-js`.
import disposableDomains from 'disposable-email-domains-js';

const SET = new Set(disposableDomains as readonly string[]);

export function isDisposable(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  return SET.has(email.slice(at + 1).toLowerCase());
}
```
Header + comment-style copies operator.ts discipline (sources cited inline).

---

### B.4 `src/lib/alerts/rateLimit.ts` (pure + side-effect split)

**Analog:** `src/lib/scraper/sla.ts` (pure `shouldAlert` + side-effect `checkSlaAndAlert` split, lines 31-94)

**Split pattern** (sla.ts lines 41-49 + 64-94):
```typescript
// src/lib/alerts/rateLimit.ts
// Phase 4 ALT-03: per-IP signup rate limit. Pure decision separated from DB I/O —
// same discipline as sla.ts::shouldAlert + checkSlaAndAlert.
import type Database from 'better-sqlite3';
import * as signupAttempts from '$lib/db/signupAttempts';

const WINDOW_SECONDS = 3600;
const MAX_ATTEMPTS = 4; // UI-SPEC §FLAG #12: fixed-window 4/h

/** Pure: takes the count, returns the decision. */
export function exceeded(countInWindow: number): boolean {
  return countInWindow >= MAX_ATTEMPTS;
}

/** Side-effect: read count + return decision. Caller records the attempt only on accept. */
export function check(db: Database.Database, ip: string, asOfIso: string): { exceeded: boolean; count: number } {
  const count = signupAttempts.countWithinWindow(db, ip, WINDOW_SECONDS, asOfIso);
  return { exceeded: exceeded(count), count };
}

export function record(db: Database.Database, ip: string, asOfIso: string): void {
  signupAttempts.recordAttempt(db, ip, asOfIso);
}
```

Critical: rateLimit.ts must NEVER inline SQL — it calls `signupAttempts.*` (DAL boundary, CLAUDE.md non-negotiable).

---

### B.5 `src/lib/alerts/warmup.ts` (pure cap check)

**Analog:** `src/lib/scraper/sla.ts::shouldAlert` (pure decision)

**Constant + pure check pattern** (sla.ts lines 26-49):
```typescript
// src/lib/alerts/warmup.ts
// Phase 4 ALT-12: warm-up daily cap. Pure decision; caller computes today's count.
//
// Schedule (UI-SPEC §"Ramp-up disclosure"):
//   week 1: 50/day
//   week 2: 200/day
//   week 3+: unlimited (returns Infinity)
//
// `WARMUP_START_DATE` env var (YYYY-MM-DD) anchors the schedule.

export function dailyCap(today: string, warmupStartDate: string): number {
  const day = daysBetween(warmupStartDate, today); // from $lib/shared/dates
  if (day < 0) return 0;            // before warm-up started: nothing sent
  if (day < 7) return 50;
  if (day < 14) return 200;
  return Number.POSITIVE_INFINITY;
}

export function withinCap(sentCountToday: number, cap: number): boolean {
  return sentCountToday < cap;
}
```
Imports `daysBetween` from `$lib/shared/dates` (STO-04 — only date producer).

---

### B.6 `src/lib/alerts/evaluators/hotDay.ts` (pure evaluator)

**Analog:** `src/lib/forecast/compute.ts::computeCell` (pure-math + DAL handle param)

**Header & imports** (compute.ts lines 1-32):
```typescript
// src/lib/alerts/evaluators/hotDay.ts — ALT-09 pure evaluator.
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL — this file
// MUST NOT contain SQL or import getDb at module scope. DB handle arrives as a parameter.
//
// Trigger (ALT-09):
//   today_avg     = SUM(species_count) / SUM(angler_count) for (boat, tripType, today)
//   trailing_avg  = same SUM/SUM over (today-30 .. today-1) for (boat, tripType) — same trip type only (per CLAUDE.md non-negotiable #4)
//   today_anglers = SUM(angler_count) on today's row
//   FIRES iff: today_avg > 2 * trailing_avg AND today_anglers >= MIN_ANGLERS (8 per RESEARCH §recommendation)
//
// Sources:
//   .planning/phases/04-email-alerts/04-RESEARCH.md §"Hot-day evaluator"
//   .planning/phases/04-email-alerts/04-UI-SPEC.md §"Email 2: Hot-day Alert"
//   CLAUDE.md non-negotiable #4 (mandatory trip-type segmentation)
import type Database from 'better-sqlite3';
import * as alertEval from '$lib/db/queries/alertEval';
```

**Pure-fn shape** (compute.ts lines 70-156):
```typescript
export interface HotDayCandidate {
  subscriberId: number;
  boatId: number;
  boatName: string;
  tripType: string;
  todayAvgPerAngler: number;
  trailing30dAvgPerAngler: number;
  multiplier: number;        // todayAvg / trailing30dAvg
  nAnglers: number;
  speciesList: string[];     // verbatim species rendered into the alert email
}

/**
 * Pure with respect to DB handle (no module-scope DB). Returns candidates;
 * dedup against alerts_sent and warm-up gating happen in dispatch.ts.
 *
 * Never throws — per-subscriber errors logged and skipped (compute.ts lines 205-213 pattern).
 */
export function evaluateHotDay(
  db: Database.Database,
  args: { today: string; activeSubscribers: ActiveSubscriber[] }
): HotDayCandidate[] {
  const out: HotDayCandidate[] = [];
  for (const sub of args.activeSubscribers) {
    for (const boatId of sub.boats) {
      try {
        // Per CLAUDE.md #4: iterate trip types — never aggregate across trip types.
        for (const tripType of TRIP_TYPES_OF_INTEREST) {
          const today = alertEval.getTodayBoatTripAvg(db, { today: args.today, boatId, tripType });
          if (today.value === null || today.nAnglers < MIN_ANGLERS) continue;
          const trailing = alertEval.getTrailing30DayBoatTripAvg(db, { today: args.today, boatId, tripType });
          if (trailing.value === null) continue;
          if (today.value > 2 * trailing.value) {
            out.push({ /* ... */ });
          }
        }
      } catch (err) {
        // log + skip; same discipline as compute.ts recomputeForecasts loop body
      }
    }
  }
  return out;
}
```

**Decimal/integer discipline:** evaluator returns raw numbers; the email composer applies `formatPerAngler` from `$lib/shared/format` (UI-SPEC §FLAG #9 mitigation).

---

### B.7 `src/lib/alerts/evaluators/startingToRun.ts` (pure evaluator)

**Analog:** Same as hotDay — `src/lib/forecast/compute.ts`. Same imports, same purity rules.

**Differences from hotDay:**
- Trigger key: species (not boat).
- Trigger date: ISO week (use `isoWeekKey` from `$lib/shared/dates` lines 74-84) — emit one alert per (subscriber, species, trip_type, ISO_week) max.
- Numerator: `getRolling7DayFleetAvg(species, tripType, today)`.
- Denominator: `getSameWeekLastYearFleetAvg(species, tripType, today)`.
- Threshold: `multiplier > 1.5` (vs hotDay's 2.0).

---

### B.8 `src/lib/alerts/dispatch.ts` (orchestrator)

**Analog:** `src/lib/forecast/compute.ts::recomputeForecasts` (orchestrator wrapping pure cells) + `src/lib/scraper/sla.ts::checkSlaAndAlert` (side-effect wrapper)

**Orchestrator scaffold** (compute.ts lines 169-225 + sla.ts lines 64-94):
```typescript
// src/lib/alerts/dispatch.ts
// Phase 4 ALT-09/10/11/12: alert dispatch orchestrator. Wired into _scrapeTick.
//
// Flow:
//   1. List active subscribers (DAL).
//   2. Run both evaluators in parallel.
//   3. For each candidate: dedup against alerts_sent (idempotency).
//   4. Warmup gate: if today's sent count >= cap, mark queued (insert as status='queued').
//   5. Otherwise: build email → send via Resend wrapper → record as status='sent'.
//
// Never throws (Sched tick wraps in try/catch; same non-fatal discipline as
// scheduler.ts::_scrapeTick lines 90-97 around recomputeForecasts).
import type Database from 'better-sqlite3';
import { logger } from '$lib/server/logger';
import { today as todayFn } from '$lib/shared/dates';
import * as subscribers from '$lib/db/subscribers';
import * as alertsSent from '$lib/db/alertsSent';
import { evaluateHotDay } from './evaluators/hotDay';
import { evaluateStartingToRun } from './evaluators/startingToRun';
import { dailyCap, withinCap } from './warmup';
import { buildEmail } from '$lib/email/buildEmail';
import { sendUserEmail } from '$lib/email/send';

export async function dispatchAlerts(db: Database.Database, opts: { today?: string } = {}): Promise<void> {
  const dispatchLogger = logger.child({ job: 'alerts-dispatch', jobId: crypto.randomUUID() });
  const today = opts.today ?? todayFn();
  const active = subscribers.listActive(db);

  const hotDay = evaluateHotDay(db, { today, activeSubscribers: active });
  const runs = evaluateStartingToRun(db, { today, activeSubscribers: active });

  const cap = dailyCap(today, process.env.WARMUP_START_DATE ?? today);
  const sentToday = alertsSent.countSentSince(db, /* midnight PT iso */);

  let used = sentToday;
  for (const candidate of [...hotDay, ...runs]) {
    try {
      if (alertsSent.exists(db, /* dedup args */)) continue;
      if (!withinCap(used, cap)) {
        alertsSent.recordQueued(db, /* args */);
        continue;
      }
      const { html, text } = buildEmail(/* … */);
      const messageId = await sendUserEmail({ /* … */ });
      alertsSent.recordSent(db, { /* … */, resendMessageId: messageId });
      used += 1;
    } catch (err) {
      dispatchLogger.error({ err, candidate }, 'alert_dispatch_failed_per_candidate');
    }
  }
  dispatchLogger.info({ msg: 'alerts_dispatch_complete', hotDay: hotDay.length, runs: runs.length, cap });
}
```

**Wire into scheduler** (scheduler.ts lines 90-97 — copy the same try/catch shape):
```typescript
if (result.outcome === 'success' || result.outcome === 'empty') {
  try {
    recomputeForecasts(getDb());
    tickLogger.info({ msg: 'forecast_recompute_complete' });
  } catch (err) {
    tickLogger.error({ err, msg: 'forecast_recompute_failed_non_fatal' });
  }
  // NEW Phase 4: dispatch alerts AFTER forecast recompute (RESEARCH §"primary recommendation").
  try {
    await dispatchAlerts(getDb(), { today: date });
    tickLogger.info({ msg: 'alerts_dispatch_complete' });
  } catch (err) {
    tickLogger.error({ err, msg: 'alerts_dispatch_failed_non_fatal' });
  }
}
```

---

### C.1 `src/lib/email/buildEmail.ts` (HTML + text composer)

**NO ANALOG** — first email-template builder in the codebase.

**Pattern source:** UI-SPEC §"Component Contracts" #3 (`<EmailLayout>` signature) verbatim. Discipline borrowed from compute.ts: pure function, no I/O, returns shape-typed result.

**Skeleton:**
```typescript
// src/lib/email/buildEmail.ts
// Phase 4 ALT-05/07: server-side HTML+text email composer.
// PURE — no DB, no I/O. Returns { html, text } so caller (send.ts) drives transport.
//
// Inline-style discipline: every <td> has `style="..."` because email clients strip
// classes and <head> styles inconsistently (UI-SPEC §"Email-client safety").
//
// Decimal/precision discipline: per-angler values rendered via formatPerAngler
// from $lib/shared/format (UI-SPEC §FLAG #9 — single source of truth shared with
// PerAnglerMetric.svelte).
import { POSTAL_ADDRESS } from './postalAddress';
import { formatPerAngler } from '$lib/shared/format';

export interface BuildEmailArgs {
  subject: string;
  preheader: string;
  h1: string;
  bodyHtml: string;            // pre-rendered content block(s)
  bodyText: string;            // pre-rendered plain-text block(s)
  reasonForReceipt: string;
  unsubscribeUrl: string;
  manageUrl?: string;
}

export function buildEmail(args: BuildEmailArgs): { html: string; text: string } {
  const postal = POSTAL_ADDRESS(); // throws if unset — fail-closed per UI-SPEC §"<ComplianceFooter>"
  // ... template-literal HTML + plain-text construction ...
  return { html, text };
}
```

**Plan must include:** snapshot tests of the rendered HTML against fixture inputs (unique to Phase 4 — no existing snapshot test pattern in this repo).

---

### C.2 `src/lib/email/templates.ts` (template strings)

**NO ANALOG** — first email-template body strings in the codebase.

**Pattern source:** UI-SPEC §"Per-Email Layouts" Email 1/2/3 verbatim. Each template returns `{ subject, preheader, h1, bodyHtml, bodyText, reasonForReceipt }` partially-rendered for `buildEmail` to wrap.

---

### C.3 `src/lib/email/send.ts` (Resend wrapper)

**Analog:** `src/lib/alerts/operator.ts::sendOperatorAlert` (lines 1-70)

**Header pattern** (operator.ts lines 1-9):
```typescript
// src/lib/email/send.ts
// Phase 4 ALT-05/07: subscriber-facing Resend send wrapper. SIBLING to
// src/lib/alerts/operator.ts (which is the operator-only wrapper).
//
// Differences from operator.ts:
//   - tracking DISABLED (UI-SPEC §"Anti-Feature Guards" #5 — no opens, no clicks)
//   - List-Unsubscribe + List-Unsubscribe-Post headers (RFC 8058 one-click)
//   - mandatory plain-text + HTML multipart
//   - compliance footer is part of the bodyHtml/bodyText built upstream
//
// Reuses RESEND_API_KEY env var (same Resend account as operator alerts).
import { Resend } from 'resend';
import { logger } from '$lib/server/logger';
import { safeSubject } from '$lib/alerts/operator';
```

**Resend invocation pattern** (operator.ts lines 35-65 — adapt for tracking + headers):
```typescript
export async function sendUserEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeMailto: string;
  unsubscribeUrl: string;
}): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SUBSCRIBER_FROM_EMAIL;
  if (!apiKey) throw new Error('sendUserEmail: RESEND_API_KEY is not set');
  if (!from)   throw new Error('sendUserEmail: SUBSCRIBER_FROM_EMAIL is not set');

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: `FishCount <${from}>`,
    to: [args.to],
    subject: args.subject,
    html: args.html,
    text: args.text,
    headers: {
      // RFC 8058 one-click + RFC 2369
      'List-Unsubscribe': `<${args.unsubscribeMailto}>, <${args.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    },
    // Disable tracking per UI-SPEC §"Anti-Feature Guards" #5
    // (Resend's API keys: `tracking: false` or `tags: []` per current docs)
  });

  if (result.error) {
    logger.error({ err: result.error, subjectTemplate: safeSubject(args.subject) }, 'user_email_send_failed');
    throw new Error(`Resend error: ${result.error.message}`);
  }
  logger.info({ id: result.data?.id, subjectTemplate: safeSubject(args.subject) }, 'user_email_sent');
  return result.data?.id ?? '';
}
```

**PII discipline:** never log raw `args.to` or `args.subject` — `safeSubject` is reused (operator.ts lines 31-33).

---

### C.4 `src/lib/email/postalAddress.ts` (env reader, fail-closed)

**Analog:** `src/lib/server/kill-switch.ts::scrapingEnabled` (env-gate; not read here but referenced in scheduler.ts)

**Fail-closed pattern:**
```typescript
// src/lib/email/postalAddress.ts
// Phase 4 ALT-07 + UI-SPEC §"<ComplianceFooter>": single source of truth for the
// CAN-SPAM-mandated physical address. Fail-closed: if POSTAL_ADDRESS is unset,
// the email composer throws and the caller (dispatch.ts) treats the alert as
// failed (better to drop one alert than send a non-compliant email).
import { env } from '$env/dynamic/private';

export function POSTAL_ADDRESS(): string {
  const a = env.POSTAL_ADDRESS;
  if (!a || a.trim().length === 0) {
    throw new Error('POSTAL_ADDRESS env var is unset — cannot build a CAN-SPAM-compliant email');
  }
  return a;
}
```

---

### D.1 `src/lib/shared/format.ts::formatPerAngler` (extracted formatter)

**Analog:** `src/lib/components/PerAnglerMetric.svelte` lines 31-46 (formatter currently inlined inside `$derived.by(() => …)`).

**Extract pattern** (PerAnglerMetric.svelte lines 31-46):
```typescript
// src/lib/shared/format.ts
// UI-SPEC §FLAG #9 mitigation: single shared formatter for per-angler values.
// Used by both <PerAnglerMetric>.svelte (web) AND $lib/email/buildEmail (email).
// Decimal rule: integer when ≥10, one-decimal when <10 (trailing .0 stripped),
// '—' when value=null/NaN or nTrips=0. Never two decimals (CLAUDE.md non-negotiable #3).

export function formatPerAngler(value: number | null, nTrips: number): string {
  if (value === null || Number.isNaN(value) || nTrips === 0) return '—';
  if (value >= 10) return String(Math.round(value));
  const fixed = value.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}
```

**Refactor PerAnglerMetric.svelte** (lines 31-46) to call `formatPerAngler` instead of inlining; preserve the `kind === 'forecast'` branch separately (still inlined or split into a sibling `formatPerAnglerForecast`).

---

### E.1 `src/routes/alerts/+page.server.ts` (signup landing — load + actions)

**Analog (load):** `src/routes/picker/+page.server.ts::load` (filter parsing → guidance branch, lines 41-86)
**Analog (actions):** **NO EXACT ANALOG** — first form-action endpoint in the codebase. Pattern from RESEARCH.md §"Pattern 1" + UI-SPEC §"Signup form submission".

**Load pattern** (picker/+page.server.ts lines 41-86 — adapt for warmup banner state):
```typescript
import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { getDb } from '$lib/db/client';
import { distinctTripTypes, distinctSpecies } from '$lib/db/queries/browse';
import { today } from '$lib/shared/dates';
// ...

export const load: PageServerLoad = async ({ url, setHeaders, locals }) => {
  const db = getDb();
  setHeaders({ 'cache-control': 'public, max-age=300' });

  return {
    // pre-fill state from query params (?boat=, ?species=) for inline-CTA navigation
    preselectedBoats: parseBoatIds(url.searchParams.get('boat')),
    preselectedSpecies: url.searchParams.get('species') ?? null,
    // option lists for the multi-selects (same source as picker)
    boats: listBoatsForSelect(db),
    species: distinctSpecies(db),
    // warm-up banner state (computed from WARMUP_START_DATE + today)
    showWarmupBanner: shouldShowBanner(today())
  };
};
```

**Actions pattern** (build from RESEARCH §"Pattern 1" + sla.ts side-effect wrapper discipline):
```typescript
const SignupSchema = z.object({
  email: z.string().email('That doesn\'t look like a valid email address.'),
  website: z.string(),                       // honeypot
  boats: z.array(z.coerce.number()).default([]),
  species: z.array(z.string()).default([])
}).refine(d => d.boats.length > 0 || d.species.length > 0, {
  message: 'Pick at least one boat or species to follow.',
  path: ['boats']
});

export const actions: Actions = {
  default: async ({ request, getClientAddress, locals }) => {
    const fd = await request.formData();
    const parsed = SignupSchema.safeParse(/* convert FormData */);
    if (!parsed.success) return fail(400, { fieldErrors: parsed.error.flatten() });
    const { email, website, boats, species } = parsed.data;
    const db = getDb();
    const ip = request.headers.get('fly-client-ip') ?? getClientAddress();
    const nowIso = new Date().toISOString();

    // 1. Honeypot — silent success (anti-enumeration)
    if (honeypot.isFilled(website)) {
      locals.logger?.info({ msg: 'signup_honeypot_triggered', ip });
      return { ok: true, masked: maskEmail(email) };
    }

    // 2. Per-IP rate limit — page-level error
    const rl = rateLimit.check(db, ip, nowIso);
    if (rl.exceeded) return fail(429, { pageError: 'rate_limited' });
    rateLimit.record(db, ip, nowIso);

    // 3. Disposable-email — inline error
    if (disposableEmail.isDisposable(email)) {
      return fail(400, { fieldErrors: { email: ['disposable_address'] } });
    }

    // 4. Suppression list — silent success (anti-enumeration)
    if (suppressionList.has(db, email)) {
      locals.logger?.info({ msg: 'signup_blocked_suppressed' });
      return { ok: true, masked: maskEmail(email) };
    }

    // 5. Already-pending — silent success
    if (subscribers.findRecentPending(db, email, 24 * 3600)) {
      return { ok: true, masked: maskEmail(email) };
    }

    // 6. Already-active — short-circuit to /alerts/confirmed
    if (subscribers.findActive(db, email)) {
      throw redirect(303, '/alerts/confirmed?already=1');
    }

    // 7. Happy path
    const id = subscribers.createPending(db, { email, boats, species, ip });
    const token = signToken('confirm', id, 24 * 3600);
    await sendConfirmEmail(/* ... */);
    return { ok: true, masked: maskEmail(email) };
  }
};
```

---

### E.2 `src/routes/alerts/+page.svelte` (signup view)

**Analog:** `src/routes/picker/+page.svelte` (form structure, FilterBar usage — lines 1-214)

**Layout pattern** (picker/+page.svelte lines 71-79):
```svelte
<svelte:head><title>Get fishing alerts — FishCount</title></svelte:head>
<PageHeader
  title="Get fishing alerts"
  subtitle="We'll email you when boats you follow have hot days, or species you follow start to run."
/>
{#if data.showWarmupBanner}
  <!-- amber banner per UI-SPEC §"Ramp-up disclosure" -->
{/if}
<SignupForm
  preselectedBoats={data.preselectedBoats}
  preselectedSpecies={data.preselectedSpecies}
  boats={data.boats}
  species={data.species}
/>
<details class="mt-6">
  <summary class="text-sm text-(--color-text-muted) cursor-pointer">What does this send me?</summary>
  <!-- expander body -->
</details>
```

---

### E.3 `src/routes/alerts/pending/+page.svelte` (static success view)

**Analog:** `src/routes/about/+page.svelte` (static prose, lines 1-50)

**Static prose pattern:**
```svelte
<script lang="ts">
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/PageHeader.svelte';
  let { data }: { data: PageData } = $props();
</script>
<svelte:head><title>Check your email — FishCount</title></svelte:head>
<PageHeader title="Check your email" />
<article class="mx-auto max-w-2xl">
  <p>We sent a verification link to {data.maskedEmail}. ...</p>
  <!-- verbatim copy from UI-SPEC §"Generic success page" -->
</article>
```

---

### E.4 / E.5 / E.7 / E.9 (other static success views, confirmed page, manage view, unsubscribe view)

Same as E.3 — pattern is `src/routes/about/+page.svelte` for static prose, `src/routes/picker/+page.svelte` for view + form. Each uses verbatim UI-SPEC copy.

---

### E.6 `src/routes/alerts/confirm/+page.server.ts` (token-verifying loader)

**Analog:** `src/routes/picker/+page.server.ts::load` (parse-and-branch, lines 41-86)

**Token-gate pattern:**
```typescript
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { verifyToken } from '$lib/alerts/tokens';
import * as subscribers from '$lib/db/subscribers';
import { getDb } from '$lib/db/client';

export const load: PageServerLoad = async ({ url, locals }) => {
  const token = url.searchParams.get('token');
  if (!token) return { invalid: true };

  const verified = verifyToken('confirm', token);
  if (!verified.ok) {
    locals.logger?.info({ msg: 'confirm_token_invalid', reason: verified.reason });
    return { invalid: true };
  }

  const db = getDb();
  subscribers.activate(db, verified.subjectId);
  const summary = subscribers.getSummary(db, verified.subjectId); // for "you're subscribed to:" list
  return { invalid: false, summary };
};
```

---

### E.8 `src/routes/alerts/manage/+page.server.ts` (token-gated load + actions)

**Analog (load):** confirm/+page.server.ts (above) for token gating + picker/+page.server.ts for option lists.
**Analog (actions):** alerts/+page.server.ts above (the form-actions pattern is the same shape — `default` action for "Update preferences" + named actions for "Remove" rows).

---

### E.9 `src/routes/alerts/unsubscribe/+page.server.ts` (one-click GET/POST)

**Analog (side-effect-before-render):** `src/lib/scraper/sla.ts::checkSlaAndAlert` lines 64-94 (pattern: side-effect happens deterministically before the response).

**Pattern:**
```typescript
import type { PageServerLoad, Actions } from './$types';
import { verifyToken } from '$lib/alerts/tokens';
import * as subscribers from '$lib/db/subscribers';
import * as suppressionList from '$lib/db/suppressionList';
import { getDb } from '$lib/db/client';

// GET: link click from email (browsers, RFC 8058 also triggers on POST)
export const load: PageServerLoad = async ({ url, locals }) => {
  const token = url.searchParams.get('token');
  if (!token) return { invalid: true };

  const verified = verifyToken('unsubscribe', token);
  if (!verified.ok) return { invalid: true };

  const db = getDb();
  const sub = subscribers.findById(db, verified.subjectId);
  if (sub) {
    // SUPPRESSION WRITE BEFORE RENDER — UI-SPEC §"Server contract".
    suppressionList.add(db, sub.email, 'user_unsubscribe');
    subscribers.deleteForUnsubscribe(db, sub.id);
  }
  return { invalid: false, maskedEmail: sub ? maskEmail(sub.email) : null };
};

// POST: one-click via List-Unsubscribe-Post (RFC 8058 §3)
export const actions: Actions = {
  default: async ({ request }) => {
    // Same logic as load() — RFC 8058 mandates 200 response on POST without UI navigation.
    // SvelteKit form actions return JSON; the mail client just needs 2xx.
    return { ok: true };
  }
};
```

---

### F.1 `src/lib/components/SignupForm.svelte` (form component)

**Analog:** `src/routes/picker/+page.svelte` lines 81-173 (FilterBar with native form inputs + actions snippet) — extracted as a reusable component. No existing form-component primitive, so this is mostly new but mirrors picker's input styling.

**Key reuse from picker:** all input classes (`min-h-11 rounded border border-(--color-border) px-2`), submit-button classes (`min-h-11 rounded bg-(--color-accent) px-4 py-2 font-semibold text-white hover:bg-(--color-accent-hover)`), disabled-state during fetch (use `aria-busy="true"`).

**Honeypot must be FIRST** in DOM order (UI-SPEC §`<SignupForm>` rendering rule #2); native `<form method="POST">` for no-JS fallback (UI-SPEC §`<SignupForm>` rendering rule 7).

---

### F.2 `src/lib/components/PreferenceRow.svelte` (row component)

**Analog:** `src/lib/components/BoatRow.svelte` (lines 1-49 — single-row primitive with link + nested action)

**Single-row pattern** (BoatRow.svelte lines 26-49):
```svelte
<script lang="ts">
  let {
    kind,
    label,
    href,
    removeFormAction
  }: {
    kind: 'boat' | 'species';
    label: string;
    href?: string;
    removeFormAction: string;  // SvelteKit form-action URL e.g. ?/removeBoat
  } = $props();
</script>

<div class="flex items-center justify-between border-b border-(--color-border) py-3">
  <div class="flex flex-1 items-center gap-2">
    {#if href}
      <a href={href} class="text-(--color-accent) underline">{label}</a>
    {:else}
      <span>{label}</span>
    {/if}
  </div>
  <form method="POST" action={removeFormAction} class="m-0">
    <input type="hidden" name="kind" value={kind} />
    <input type="hidden" name="label" value={label} />
    <button type="submit" class="text-sm text-(--color-text-muted) hover:text-(--color-destructive) underline">
      Remove
    </button>
  </form>
</div>
```

44px touch target enforced via `py-3` (12px × 2 + line-height ≈ 48px).

---

### G.5 `src/routes/picker/+page.svelte` (modify — inline alerts CTA)

**Analog:** picker's existing reset-button area lines 165-171 + about-href in PerAnglerMetric line 87-89.

**Insertion pattern (in results section, after rankings render):**
```svelte
{#if data.filters?.species}
  <p class="mt-4 text-sm text-(--color-text-muted)">
    <a href="/alerts?species={encodeURIComponent(data.filters.species)}" class="text-(--color-accent) underline">
      Get alerts when {data.filters.species} starts to run →
    </a>
  </p>
{/if}
```

Per UI-SPEC §"Inline framing for follow this CTAs" — the CTA must appear AFTER the per-angler framing has rendered. Place it below the `<PerAnglerFramingProvider>` block, not above.

---

## Shared Patterns

### S.1 Authentication / Authorization

**No formal auth in v1.** Manage and unsubscribe pages are reached via signed magic-link tokens. There is no login, no session, no cookie.

**Source:** `src/lib/alerts/tokens.ts` (NEW). Token verification happens in every `+page.server.ts::load` for `/alerts/confirm`, `/alerts/manage`, `/alerts/unsubscribe`.

**Apply to:** `src/routes/alerts/{confirm,manage,unsubscribe}/+page.server.ts`. Pattern:
```typescript
const token = url.searchParams.get('token');
if (!token) return { invalid: true };
const verified = verifyToken(EXPECTED_PURPOSE, token);
if (!verified.ok) return { invalid: true };
// proceed with verified.subjectId
```

### S.2 Error Handling / Non-Fatal Side-Effects

**Source:** `src/lib/server/scheduler.ts` lines 90-97 (existing `recomputeForecasts` try/catch).

**Apply to:** `dispatchAlerts` call site in `_scrapeTick` (same shape — err logged, never thrown).

**Source within evaluators:** `src/lib/forecast/compute.ts` lines 205-213 — per-cell try/catch logs `{err, forecastDate, species, tripType}`. New evaluators MUST do the same per-candidate.

### S.3 PII / Logging Discipline

**Source:** `src/lib/server/logger.ts` lines 31-50 — pino redact paths include `*.email`, `*.token`, `*.password`. The redact list already covers Phase 4 PII paths automatically as long as new log records use the field name `email` or `token` (not aliased).

**Source:** `src/lib/alerts/operator.ts::safeSubject` lines 31-33 — strip emails from subject lines before logging.

**Apply to:** every new log line in `subscribers.ts`, `dispatch.ts`, `tokens.ts`, `routes/alerts/*`. Never log raw email addresses; use `maskEmail()` (`f***@d***.com`) for any user-facing display, plain redaction for logs.

### S.4 Validation (Zod at I/O boundary)

**Source:** `src/lib/scraper/schema.ts` lines 21-50 — Zod schema with transforms applied at the parse boundary; no validation inside DAL or core logic.

**Apply to:** `src/routes/alerts/+page.server.ts::actions::default` — `SignupSchema.safeParse(formData)` at the top of the handler. Same discipline for `manage` action (preferences-update schema).

### S.5 Date Discipline (STO-04)

**Source:** `src/lib/shared/dates.ts` — sole producer of YYYY-MM-DD strings. Existing pattern in scrapeRuns.ts line 50-62 + sla.ts line 64+.

**Apply to:**
- `evaluators/hotDay.ts` and `evaluators/startingToRun.ts` — receive `today: string` as input; never call `new Date().toISOString().slice(0,10)` (banned idiom — `tests/unit/shared/dates-boundary.test.ts` enforces).
- `dispatch.ts` — accepts optional `today` parameter; defaults to `today()` from `$lib/shared/dates`.
- `warmup.ts::dailyCap` — uses `daysBetween(warmupStartDate, today)` from `$lib/shared/dates`.
- `signupAttempts.ts` — `attempted_at` is ISO-8601 (not YYYY-MM-DD); produced by caller via `new Date().toISOString()` — this is *timestamp* not *calendar date*, so STO-04 doesn't apply (verified by reading scrapeRuns.ts header line 8 + recordOutcome lines 27-41 which use ISO-8601 freely).

### S.6 DAL Boundary (CLAUDE.md non-negotiable)

**Source:** every existing `src/lib/db/*.ts` file header comment line 1-3:
```typescript
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
```

**Apply to:** every new `src/lib/db/*.ts` file — same header comment, no exceptions. Evaluators, dispatch, route loaders, components MUST NOT contain SQL.

**Test enforcement:** `tests/unit/db/dal-boundary.test.ts` (existing) — Phase 4 tests should add their new files to this lint allowlist if needed; do NOT introduce SQL outside `src/lib/db/`.

### S.7 Idempotency / Upsert Pattern

**Source:** `src/lib/db/catchReports.ts` lines 28-47 + `src/lib/db/forecasts.ts` lines 36-59 — `INSERT … ON CONFLICT(unique_keys) DO UPDATE SET …`. Wrap multi-row writes in `db.transaction(...)`.

**Apply to:**
- `subscribers.createPending` — `ON CONFLICT(email) DO UPDATE` (re-signup of pending updates expiry + preferences).
- `suppressionList.add` — `INSERT OR IGNORE` (suppression is permanent; never overwritten).
- `alertsSent.recordSent` / `recordQueued` — relies on UNIQUE index `(subscriber_id, kind, trigger_key, trigger_date)` for ALT-11 dedup; INSERT will fail-loud on duplicate (caller checks `exists()` first).

### S.8 Component Reuse (UI-SPEC zero new tokens)

**Source:** UI-SPEC §"Design System" + Phase 2 components.

**Apply to:** every Phase 4 web view. Reuse `<PageHeader>`, `<EmptyState>`, color tokens from `app.css` `@theme` block. Inputs use `min-h-11 rounded border border-(--color-border) px-2`. CTAs use `min-h-11 rounded bg-(--color-accent) px-4 py-2 font-semibold text-white hover:bg-(--color-accent-hover)`.

---

## No Analog Found

Files with no close existing match — planner uses RESEARCH.md `## Architecture Patterns` directly:

| File | Role | Data Flow | Reason | Source for pattern |
|------|------|-----------|--------|--------------------|
| `src/lib/email/buildEmail.ts` | service | transform | First HTML+text email composer in repo. | RESEARCH §"Email composition" + UI-SPEC §"Component Contracts" #3 |
| `src/lib/email/templates.ts` | template strings | transform | First email templates in repo. | UI-SPEC §"Per-Email Layouts" |
| `src/lib/alerts/tokens.ts` | service | transform | First HMAC token signer/verifier in repo. | RESEARCH §"Pattern 2" + Node `node:crypto` stdlib |
| `src/routes/alerts/+page.server.ts::actions` | controller | request-response | First SvelteKit form-action endpoint in repo (existing routes use URL-state, not POST). | RESEARCH §"Pattern 1" + SvelteKit docs |

---

## Metadata

**Analog search scope:**
- `src/lib/db/*` (all 8 DAL files)
- `src/lib/forecast/compute.ts` (pure-fn evaluator exemplar)
- `src/lib/alerts/operator.ts` (Resend wrapper)
- `src/lib/scraper/{sla,schema,parser}.ts` (pure-fn + decision-split + Zod patterns)
- `src/lib/server/{scheduler,logger}.ts` (tick orchestration + logging discipline)
- `src/lib/shared/dates.ts` (date producer — sole source)
- `src/lib/components/*.svelte` (UI primitives)
- `src/routes/{picker,boats/[id],about}/+page.{svelte,server.ts}` (route patterns)
- `tests/unit/db/*.test.ts` + `tests/forecast/compute.test.ts` + `tests/integration/phase2-routes.test.ts` (test patterns)

**Files scanned:** ~30 source + ~10 test files
**Pattern extraction date:** 2026-04-27

**Confidence:** HIGH on every DAL repo + evaluator + send-wrapper assignment (analogs are direct one-to-one matches in the same architectural layer). MEDIUM on form-action endpoints (no exact existing analog — first form-action in the codebase). LOW only on email-template/builder (no analog at all — pattern derives from UI-SPEC + Resend docs).

**Cross-cutting reminders for planner:**
1. Every new `src/lib/db/*` file gets the CLAUDE.md DAL-boundary header comment (S.6).
2. Every new pure-fn lib gets the "DB handle as parameter, no module-scope DB" header comment (compute.ts lines 1-32 style).
3. `dispatchAlerts` wires into `_scrapeTick` AFTER `recomputeForecasts` with the same try/catch shape (RESEARCH §"primary recommendation" + scheduler.ts lines 90-97).
4. `formatPerAngler` in `src/lib/shared/format.ts` is the single source of truth — `<PerAnglerMetric>` and `buildEmail.ts` both import it (UI-SPEC §FLAG #9).
5. `sendUserEmail` is a *sibling* of `sendOperatorAlert`, not a replacement — both consume the same Resend API key but render different templates.
