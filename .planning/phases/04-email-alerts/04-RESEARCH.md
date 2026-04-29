# Phase 4: Email Alerts — Research

**Researched:** 2026-04-27
**Domain:** Email-driven user-write surface (signup, double opt-in, deliverability, abuse-resistant alerts) on top of an existing modular SvelteKit monolith with shared SQLite + croner scheduler + Resend wrapper
**Confidence:** HIGH on every load-bearing area (existing wrappers verified, RFC 8058 + Gmail/Yahoo bulk-sender rules verified against current sources, npm versions verified by cross-reference with STACK.md). Only Open Question: physical postal address sourcing (operator decision, blocks first send).

---

## Summary

Phase 4 ships v1's only user-write path: a public email signup form, double opt-in, alert dispatch (`hot day` and `starting to run`), manage-preferences, suppression list, and SPF/DKIM/DMARC + warm-up gating. UI design is fully locked in `04-UI-SPEC.md`. The stack is fully locked: Resend 6.12.x (already wrapped at `src/lib/alerts/operator.ts`), croner 10.0.x scheduler (already running, `_scrapeTick` in `src/lib/server/scheduler.ts`), better-sqlite3 12.9.x + `migrations.ts` schema-bootstrap pattern, SvelteKit form actions for endpoints, Zod for validation, `disposable-email-domains-js` for the disposable list.

The hard part of Phase 4 is **not** any single technology — it's that **CLAUDE.md non-negotiable #5 lists ALL of**: double opt-in, per-IP rate limit, honeypot, disposable-email rejection, suppression list, List-Unsubscribe header (RFC 8058 one-click), physical postal address, SPF+DKIM+DMARC, and warm-up. **Every single one is required**. Skipping any one would erode sender reputation past the point of cheap recovery (`PITFALLS.md §5`).

**Primary recommendation:** Build top-down from the schema (3 new tables: `subscribers`, `suppression_list`, `alerts_sent` + a small `signup_attempts` rate-limit ledger), then tokens module (HMAC-SHA256 over `{purpose, subscriber_id, expires_at}`), then signup endpoint with all anti-abuse layers in declared order, then alert evaluators as pure functions reading existing forecasts + catch_reports, then composer + Resend wrapper extension that disables tracking + sets List-Unsubscribe headers, then warm-up cap as a cron-evaluated counter — finally wire alert dispatch into `_scrapeTick` after the existing forecast recompute. **Reuse `sendOperatorAlert` as the implementation reference, not as the dispatcher** (operator alerts have one recipient, no compliance footer, no List-Unsubscribe; subscriber emails need their own send wrapper).

---

## User Constraints

(No CONTEXT.md exists yet for Phase 4 — phase requirements come from REQUIREMENTS.md ALT-01..12 + UI-SPEC.md + ROADMAP.md success criteria. CONTEXT.md will be authored from this research.)

### Locked Decisions (from project-level docs and approved UI-SPEC)

These cannot be questioned during planning:

1. **Stack is locked** [VERIFIED: `.planning/research/STACK.md` 2026-04-22]: Resend 6.12.x, croner 10.0.x, better-sqlite3 12.9.x, SvelteKit 2.57.x, Tailwind 4.2.x, Zod 4.3.x, date-fns 4.x, pino 10.3.x. Phase 4 does not introduce a new framework, ORM, queue, or Redis.
2. **Architecture: modular monolith, single SQLite file, in-process croner** [CITED: `.planning/research/ARCHITECTURE.md`, `CLAUDE.md` Architecture Rules]. No new deployable. No worker tier.
3. **DAL is the only SQL surface** [CITED: `CLAUDE.md` Architecture Rules, STO-03]. Subscriber, suppression-list, signup-attempt, alerts-sent queries all live in `src/lib/db/` and `src/lib/db/queries/`.
4. **All `YYYY-MM-DD` strings via `src/lib/shared/dates.ts`** [CITED: `CLAUDE.md` Architecture Rules, STO-04]. New rate-limit window math, alert dedup `date` columns, token expiry comparisons all route through this module.
5. **Cron jobs run in-process via croner; the existing `_scrapeTick` in `src/lib/server/scheduler.ts` is the integration point** [CITED: `src/lib/server/scheduler.ts`, Phase 1 D-13/D-14, Phase 3 D-13/D-14].
6. **Reuse, don't duplicate, the Resend client from `src/lib/alerts/operator.ts`** [CITED: `src/lib/alerts/operator.ts`]. The operator wrapper is for transactional ops alerts (single recipient, no compliance footer). Phase 4 adds a *subscriber-facing* send wrapper alongside it that disables tracking, sets List-Unsubscribe headers, and embeds the compliance footer — but both consume the same `Resend` client and the same `RESEND_API_KEY` env var.
7. **UI design is locked in `04-UI-SPEC.md` (approved 2026-04-27)** — every copywriting string, color, validation behavior, anti-enumeration discipline, and email-template block is specified verbatim.
8. **CLAUDE.md non-negotiable rule #5: ALL of** double opt-in, per-IP rate limit, honeypot, disposable-email rejection, suppression list, `List-Unsubscribe` header (one-click), physical postal address, SPF+DKIM+DMARC, warm-up. **Each is required; the planner cannot defer any.**
9. **Anti-features carried forward from CLAUDE.md**: no SMS/push, no social feed, no leaderboards, no "ON FIRE" hype badges, no manual-scrape trigger in UI, no per-angler individual attribution. UI-SPEC §"Anti-Feature Guards" enumerates 16 specific Phase 4 anti-features.
10. **Per-angler framing rule extends to alert emails** [CITED: `CLAUDE.md` non-negotiable #4, UI-SPEC §"Inline framing for follow this CTAs"]. Hot-day alerts that quote a per-angler value MUST keep the "derived boat-aggregate average" framing, integer/one-decimal rule, mandatory trip-type segmentation, and `n=X anglers` annotation.
11. **`commit_docs: true`** [CITED: `.planning/config.json`]. Research and plan files are committed to git.
12. **`workflow.nyquist_validation: true`** [CITED: `.planning/config.json`]. The Validation Architecture section below is required and consumed by the orchestrator's VALIDATION.md scaffolding step.

### Claude's Discretion

- Exact module file naming under `src/lib/alerts/subscribers/` vs `src/lib/email/` vs splitting differently — planner picks for cohesion.
- Whether `signup_attempts` lives as its own DAL repo or as an internal helper inside `src/lib/alerts/rateLimit.ts`. Either is acceptable as long as the SQL is in `src/lib/db/`.
- Whether the per-IP rate-limit window is implemented as fixed-bucket (simpler) or sliding (more accurate). UI-SPEC §FLAG #12 says fixed-window. Default is fixed-window 1h × 4 attempts.
- Exact algorithm for the warm-up cap counter (single-row config table vs counting `alerts_sent` rows where `sent_at >= today`'s midnight PT). Counting from `alerts_sent` is simpler and self-healing on restart; recommended.
- Disposable-email package choice between `disposable-email-domains-js` (newer, version 1.20.0, monthly updates) and the original `disposable-email-domains` (older, 4-year-stale lifecycle but still complete). Recommended: `disposable-email-domains-js` for freshness.
- Exact subject-line wording within the UI-SPEC-locked templates is fixed; the *preheader* text content per alert is templatable.

### Deferred Ideas (OUT OF SCOPE — Phase 4 must not address these)

- **Web push, SMS, in-app notifications** — anti-feature per `CLAUDE.md`.
- **Account creation, login, social auth** — anti-feature; manage-preferences is reached via a signed magic link only (UI-SPEC §"Manage-preferences page").
- **CAPTCHA** — UI-SPEC §"Anti-Feature Guards" #11: honeypot + rate-limit + disposable-email rejection are sufficient at v1 traffic.
- **A/B testing of subject lines** — UI-SPEC §"Anti-Feature Guards" #3.
- **Open/click tracking pixels** — UI-SPEC §"Anti-Feature Guards" #5; explicitly disabled in the Resend send call.
- **Win-back / re-engagement emails to suppressed addresses** — UI-SPEC §"Anti-Feature Guards" #2.
- **Referral / "your friend signed you up"** — UI-SPEC §"Anti-Feature Guards" #6.
- **AMP for Email / inline forms** — UI-SPEC §"Anti-Feature Guards" #10.
- **Image-based content blocks in emails** — UI-SPEC §"Anti-Feature Guards" #9.
- **Generic preference-confirmation email** — UI-SPEC §FLAG #7: v1 omits Email 4 (Manage-page in-line success message is sufficient).
- **Per-boat forecasts as alert input** — `02-CONTEXT.md` D-08 (historical actual) and `03-CONTEXT.md` D-15 (forecasts table is fleet-wide only, no per-boat) constrain this. Hot-day alerts compare today's actual catch_reports against rolling 30-day same-trip-type historical average — fleet-wide forecast is not the input.
- **Continuous backtest / weekly re-validation of alert thresholds** — out of scope, deferred.
- **Multi-language emails** — English only.
- **HTML email designer / WYSIWYG** — hand-built table-based HTML, no third-party email builder.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ALT-01 | Anonymous signup form collects email and (optional) followed boat(s) / species | UI-SPEC `<SignupForm>` contract; SvelteKit form actions; Zod schema; existing `landings`/`boats` DAL provides multi-select source |
| ALT-02 | Double opt-in via signed verification link before activation | `tokens.ts` module: HMAC-SHA256 over `{purpose='confirm', subscriber_id, expires_at=24h}`; pending → active state machine on `subscribers` table |
| ALT-03 | Signup rate-limits to 3 signups/h/IP; honeypot rejects obvious bots | Fly-Client-IP header [VERIFIED: Fly.io request-headers docs]; `signup_attempts(ip, attempted_at)` ledger; UI-SPEC §"Anti-enumeration rule" forces silent-success behavior on honeypot |
| ALT-04 | Disposable-email domains rejected at signup | `disposable-email-domains-js` package [VERIFIED: npm registry — v1.20.0, monthly updates] |
| ALT-05 | Every email has `List-Unsubscribe` header + visible one-click unsubscribe link | RFC 8058 + RFC 2369 [CITED: datatracker.ietf.org/doc/html/rfc8058]; Resend supports custom headers via `headers` field; UI-SPEC mandates BOTH `mailto:` and `https:` URI |
| ALT-06 | Unsubscribe writes to suppression list; cannot be re-subscribed via signup | `suppression_list` table; signup endpoint silently no-ops on suppressed addresses (UI-SPEC anti-enumeration); `subscribers` row deleted/anonymized on unsub |
| ALT-07 | Every email includes physical postal address + plain-language reason for receipt | UI-SPEC §"Email body structure" Block 5 (reason-for-receipt) + Block 6 (compliance footer); `POSTAL_ADDRESS` env var; fail-closed if unset |
| ALT-08 | SPF, DKIM, DMARC configured before first production email | Resend domain verification [CITED: `00-RESEARCH.md` §"Resend sandbox caveat"]; SPF + DKIM done in Phase 0 (operator alerts already work); DMARC `p=none` added in Phase 4 |
| ALT-09 | "Hot day" alert: followed boat's today avg/angler > 2× trailing 30-day same-trip-type avg, ≥ N anglers | `evaluateHotDay()` pure function reading `catch_reports` via DAL; sample-size floor recommended N=8 (PITFALLS §3 spirit); idempotent via `alerts_sent` |
| ALT-10 | "Starting to run": followed species' rolling 7-day fleet-wide avg > 1.5× same-week-last-year baseline | `evaluateStartingToRun()` pure function reading `catch_reports`; Phase 3 D-08 weighted-yield math reused; idempotent via `alerts_sent` |
| ALT-11 | `alerts_sent` dedup table prevents duplicate alerts | UNIQUE index on `(subscriber_id, kind, trigger_key, trigger_date)`; same idempotent-upsert pattern as Phase 1 D-06 |
| ALT-12 | Alert dispatch warmed up: 50/day week 1 → 200/day week 2 → full | `daily_send_cap` env var or table-based config; pre-send check against `COUNT(alerts_sent WHERE sent_at >= midnight_PT)`; over-cap alerts persist in `alerts_sent` with `status='queued'` and dispatch on the next tick |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Signup form rendering | Frontend Server (SSR via SvelteKit `+page.svelte`) | Browser (progressive-enhancement fetch) | UI-SPEC §`<SignupForm>` requires no-JS fallback (works as plain `<form method="POST">`); JS hijacks for inline-error rendering. Both sides hit the same form-action endpoint. |
| Signup processing (anti-abuse layers, double-opt-in dispatch) | API / Backend (SvelteKit form action `/alerts/+page.server.ts` `actions`) | DAL | All anti-abuse checks (honeypot, rate-limit, disposable-email, suppression, already-pending, already-active) run server-side in declared order; DAL handles the writes. |
| Token signing & verification | API / Backend (`src/lib/alerts/tokens.ts`) | — | HMAC over `PROJECT_SECRET` + claims; pure server-side. Never exposed to client. |
| Per-IP rate limiting | API / Backend (`src/lib/alerts/rateLimit.ts` + DAL) | — | `Fly-Client-IP` header read in form action; ledger persists across process restarts via SQLite. No Redis. |
| Disposable-email check | API / Backend (`src/lib/alerts/disposableEmail.ts`) | — | Pure function: domain ∈ `disposable-email-domains-js` set. No I/O. |
| Confirmation page rendering (`/alerts/confirm`, `/alerts/unsubscribe`, `/alerts/manage`) | Frontend Server (SSR) | API / Backend (token verification) | All three routes MUST work without JS (RFC 8058 one-click + UI-SPEC explicit no-JS contract). Token verification happens in `+page.server.ts` `load()`. Suppression-write on unsubscribe is server-side. |
| Email composition (HTML + plain-text) | API / Backend (`src/lib/email/buildEmail.ts`) | — | Pure server-side HTML-string builder per UI-SPEC §`<EmailLayout>`. NOT a Svelte component (Resend templates are HTML strings; no Svelte runtime in email). |
| Email dispatch (Resend API call) | API / Backend (`src/lib/email/send.ts`) | External (Resend) | Wraps `Resend.emails.send` with: tracking disabled, `List-Unsubscribe` + `List-Unsubscribe-Post` headers, multipart `text` + `html`. Reuses the `Resend` client construction pattern from `src/lib/alerts/operator.ts`. |
| Hot-day evaluator | API / Backend (`src/lib/alerts/evaluators/hotDay.ts`) | DAL | Pure function: takes `(today, db)` → `HotDayCandidate[]`. Reads `catch_reports` and joins `subscribers.preferences`. No SQL inside the evaluator — DAL only. |
| Starting-to-run evaluator | API / Backend (`src/lib/alerts/evaluators/startingToRun.ts`) | DAL | Same shape as hot-day. Reads weekly aggregates over `catch_reports`. Integer/discipline-rule applied at composition. |
| Alert dispatch + dedup + warm-up gating | API / Backend (`src/lib/alerts/dispatch.ts`) | DAL + Email send | Composes evaluators' candidates → dedup against `alerts_sent` → warm-up cap check → render via `buildEmail` → send via `send.ts` → record in `alerts_sent`. Wired into `_scrapeTick` after forecast recompute. |
| Suppression-list write | API / Backend (`/alerts/unsubscribe/+page.server.ts` `load()` and `actions`) | DAL | GET (link click) and POST (List-Unsubscribe-Post) both write before rendering. |
| Stored email & subscriber data | Database / Storage (SQLite tables `subscribers`, `suppression_list`, `alerts_sent`, `signup_attempts`) | — | All four are new tables; all writes go through new DAL repos. |
| Postal-address sourcing | API / Backend (env var `POSTAL_ADDRESS`) | — | Read at email-build time. **Fail closed** if unset (UI-SPEC §`<ComplianceFooter>` mandate). |

---

## Standard Stack

### Core (already locked, reused as-is)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Resend | 6.12.x | Transactional email (subscriber + ops) | [VERIFIED: STACK.md 2026-04-22; existing wrapper at `src/lib/alerts/operator.ts`]. Free tier 3,000/mo permanent; supports custom headers (List-Unsubscribe), tracking-disable per send, multipart text+html. |
| better-sqlite3 | 12.9.x | DB driver | [VERIFIED: STACK.md]. Synchronous, in-process. New tables added to `src/lib/db/migrations.ts` `SCHEMA_SQL`. |
| SvelteKit | 2.57.x (Svelte 5.55.x) | Web framework | [VERIFIED: STACK.md]. Form actions provide the standard server-side write surface; load functions handle SSR for confirmation pages. No `+server.ts` REST endpoints needed. |
| Zod | 4.3.x | Runtime validation | [VERIFIED: STACK.md]. Validates form input shape (email, boats[], species[]); catches malformed payloads before they hit any handler. |
| croner | 10.0.x | Scheduler | [VERIFIED: STACK.md; existing `src/lib/server/scheduler.ts`]. Phase 4 wires alert dispatch into `_scrapeTick` (post-forecast). No new cron entries needed unless warm-up reset cron is added (recommended: derive from `alerts_sent` query, no separate cron). |
| pino | 10.3.x | Structured logging | [VERIFIED: package.json]. New child loggers under `job: 'alerts-dispatch'`, `job: 'subscriber-signup'`. PII redaction (email addresses) follows `operator.ts::safeSubject` pattern. |
| date-fns | 4.x | Date math | [VERIFIED: package.json]. Used inside `dates.ts` and evaluators for week-of-year arithmetic. |
| Tailwind | 4.2.x | Styling | [VERIFIED: STACK.md, existing `src/app.css` `@theme` block]. Phase 4 adds zero new tokens (UI-SPEC mandate). |

### New (Phase 4 only)

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `disposable-email-domains-js` | 1.20.x | Disposable-email rejection (ALT-04) | [VERIFIED: npmjs.com/package/disposable-email-domains-js, monthly updates as of Sept 2025+] Active maintenance; pulls from the canonical `disposable-email-domains` GitHub repo with auto-sync. The original `disposable-email-domains` package (v1.0.62) is 4 years stale — avoid. |

**Rejected alternatives:**
- `email-disposable`, `@usex/disposable-email-domains` — both viable but smaller adoption/less verifiable maintenance cadence than `disposable-email-domains-js`. Not worth the deviation from the recommended choice.
- MX-record lookup as a complement — adds DNS dependency on signup latency for marginal accuracy gain. Skipped; domain-list check is sufficient at v1.
- Cloudflare Turnstile / hCaptcha — UI-SPEC §"Anti-Feature Guards" #11 explicitly defers CAPTCHA; honeypot + rate-limit + disposable-list is the v1 contract.

### Alternatives Considered (and rejected for Phase 4)

| Instead of | Could Use | Why Rejected |
|------------|-----------|--------------|
| In-process croner alert dispatch (post-scrape inline) | BullMQ + Redis queue | `ARCHITECTURE.md` §"Push vs pull alerts" + scaling considerations: at <1k subscribers a queue is over-engineering. `_scrapeTick` already runs once/day; alert eval + dispatch is seconds of additional work. |
| SQLite `signup_attempts` table for rate limiting | Redis with TTL | Same: adds a service for one feature. SQLite ledger is restart-safe. |
| HMAC-SHA256 signed tokens | JWT (e.g., `jose`) | JWT adds claims-spec overhead Phase 4 doesn't need. Plain HMAC over `purpose|subscriber_id|expires_at|nonce` is auditable and ~30 lines. UI-SPEC's token shapes (24h confirm, no-expiry unsubscribe, 30-day manage) all fit a single signing function. |
| React Email / MJML for templates | Hand-built HTML strings | UI-SPEC §"Component Contracts" #3 mandates server-side HTML builder (NOT Svelte component). React Email pulls in React; we are SvelteKit. Hand-built table-HTML following UI-SPEC's exact block structure is the chosen path. The plain-text variant is mechanically derived from the same builder. |
| Svelte SSR-render to HTML for emails | Hand-built HTML | Email clients strip CSS classes and `<style>` blocks; Svelte SSR output is class-heavy. Inline-style HTML is required. Hand-built avoids fighting the framework. |
| PostgreSQL for `subscribers` | SQLite | `ARCHITECTURE.md` §"SQLite vs Postgres" + `STACK.md` §"Hosting & Cost Profile". Single-writer, low volume — SQLite is the canonical choice. |
| Vercel/Render serverless cron for warm-up reset | In-process eval-time check from `alerts_sent` | We don't need a midnight-PT cron because the cap is computed by counting `alerts_sent` rows where `sent_at >= midnight_PT(today)`. Self-healing, no scheduler entry needed. |
| `node-cron` for any new scheduled job | croner (already in use) | Phase 0+1+3 standardized on croner; no second scheduler. |

### Verified Versions (npm registry, 2026-04-27)

- `resend@6.12.2` [VERIFIED: STACK.md cross-check + existing package.json]
- `disposable-email-domains-js@1.20.0` [VERIFIED: npmjs.com/package/disposable-email-domains-js — latest publish ~1 month ago as of search]
- `croner@10.0.1` [VERIFIED: STACK.md + package.json]
- `better-sqlite3@12.9.0`, `zod@4.3.6`, `pino@10.3.1`, `date-fns@4.1.0` — all confirmed in package.json.

**Installation (only one new package):**
```bash
npm install disposable-email-domains-js
```

---

## Architecture Patterns

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                          User signup write-path (browser)                          │
│                                                                                    │
│   /alerts page (SSR)                /boats/[id], /picker (existing)               │
│        │                                  │                                        │
│        ▼                                  ▼                                        │
│   <SignupForm>  ──── pre-fill query string ───┐                                   │
│        │                                       │                                   │
└────────│───────────────────────────────────────│──────────────────────────────────┘
         │ POST (FormData) — works without JS    │
         ▼                                       │
┌─────────────────────────────────────────────────────────────────────────────────┐
│            SvelteKit form action: /alerts/+page.server.ts ::actions::default     │
│                                                                                  │
│  Anti-abuse pipeline (declared order — UI-SPEC §"Signup form submission"):      │
│   1. Zod parse(formData)                                                         │
│   2. honeypot.check(field='website')        → if filled: render generic success │
│   3. rateLimit.check(flyClientIp)            → if 4th in 1h: page-level error   │
│   4. disposableEmail.check(email)            → if matched: inline error          │
│   5. suppressionList.has(email)              → if yes: render generic success    │
│   6. subscribers.findPending(email,<24h)     → if yes: render generic success    │
│   7. subscribers.findActive(email)           → if yes: redirect to /confirmed    │
│   8. (happy path) writePending + sendConfirmEmail + render generic success      │
└──────────────────────────┬──────────────────────────────────────────────────────┘
                           │
                           ▼
                   ┌──────────────────┐
                   │ DAL: subscribers │
                   │ DAL: suppression │
                   │ DAL: signup_atts │
                   └────────┬─────────┘
                            │
                            ▼
                ┌──────────────────────┐
                │  src/lib/email/      │
                │   • buildEmail()     │  → table-based HTML + plain text
                │   • send()           │  → Resend.emails.send w/ headers
                └──────────┬───────────┘
                           │
                           ▼
                       Resend API
                           │
                           ▼ (SPF/DKIM/DMARC-signed)
                    Subscriber inbox

╔════════════════════════════════════════════════════════════════════════════════╗
║                    User confirmation read-path (browser)                       ║
║                                                                                ║
║  Email link → /alerts/confirm?token=…                                          ║
║                          │                                                     ║
║                          ▼                                                     ║
║  +page.server.ts load()  ──── tokens.verify('confirm', token) ────────         ║
║       │                          (HMAC-SHA256 + expiry check)                  ║
║       │ valid                                                                  ║
║       ▼                                                                        ║
║  subscribers.activate(id)  →  render /alerts/confirmed                         ║
║                                                                                ║
║  Same pattern: /alerts/manage?token=…  (verify → render preferences page)      ║
║  Same pattern: /alerts/unsubscribe?token=…  (verify → write suppression →     ║
║                                              delete subscriber → render)       ║
╚════════════════════════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════════════════════════╗
║                  Alert dispatch (server, post-scrape inline)                   ║
║                                                                                ║
║  croner _scrapeTick (existing, src/lib/server/scheduler.ts)                    ║
║   │ outcome ∈ {success, empty}                                                 ║
║   ├──> checkSlaAndAlert (Phase 1, existing)                                    ║
║   ├──> recomputeForecasts (Phase 3, existing)                                  ║
║   └──> dispatchAlerts(today, db)  ← NEW Phase 4 hook (try/catch, non-fatal)   ║
║          │                                                                     ║
║          ├─ evaluateHotDay(today, activeSubs) → HotDayCandidate[]              ║
║          ├─ evaluateStartingToRun(today, activeSubs) → RunCandidate[]          ║
║          ├─ filter via alertsSent.exists(subId, kind, key, date)               ║
║          ├─ filter via warmupCap (count alerts_sent today)                     ║
║          ├─ for each remaining: build → send → record in alerts_sent           ║
║          └─ over-cap entries: insert with status='queued' (sent next day)     ║
╚════════════════════════════════════════════════════════════════════════════════╝
```

### Recommended Project Structure

```
src/
├── lib/
│   ├── alerts/
│   │   ├── operator.ts                     # EXISTING — Phase 0 ops alerts (DO NOT MODIFY)
│   │   ├── rateLimit.ts                    # NEW — per-IP signup rate-limit (calls DAL)
│   │   ├── honeypot.ts                     # NEW — pure check; field name "website"
│   │   ├── disposableEmail.ts              # NEW — pure check via disposable-email-domains-js
│   │   ├── tokens.ts                       # NEW — HMAC sign/verify for confirm/manage/unsubscribe
│   │   ├── dispatch.ts                     # NEW — orchestrates evaluators → dedup → warmup → send
│   │   ├── warmup.ts                       # NEW — pure cap check + queue rule
│   │   └── evaluators/
│   │       ├── hotDay.ts                   # NEW — ALT-09 pure function
│   │       └── startingToRun.ts            # NEW — ALT-10 pure function
│   ├── db/
│   │   ├── migrations.ts                   # EXTEND — append subscribers, suppression_list,
│   │   │                                   #          alerts_sent, signup_attempts DDL
│   │   ├── subscribers.ts                  # NEW — DAL: createPending, activate, findByEmail,
│   │   │                                   #          listActive, deleteForUnsubscribe
│   │   ├── suppressionList.ts              # NEW — DAL: add, has, list
│   │   ├── signupAttempts.ts               # NEW — DAL: recordAttempt, countWithinWindow
│   │   ├── alertsSent.ts                   # NEW — DAL: exists, recordSent, countToday, listQueued
│   │   └── queries/
│   │       └── alertEval.ts                # NEW — cross-table reads for evaluators
│   │                                       #       (subscribers + catch_reports aggregates)
│   ├── email/
│   │   ├── buildEmail.ts                   # NEW — HTML + plain-text composer (UI-SPEC §3 spec)
│   │   ├── send.ts                         # NEW — Resend wrapper (tracking off, headers set)
│   │   ├── templates.ts                    # NEW — block strings: confirmation, hotDay, run
│   │   └── postalAddress.ts                # NEW — env var read + fail-closed guard
│   ├── shared/
│   │   ├── format.ts                       # NEW — formatPerAngler(value, n) shared by
│   │   │                                   #        PerAnglerMetric.svelte AND email composer
│   │   │                                   #        (UI-SPEC §FLAG #9 mitigation)
│   │   └── (existing dates.ts, urlState.ts unchanged)
│   └── components/
│       ├── SignupForm.svelte               # NEW — UI-SPEC §"Component Contracts" #1
│       ├── PreferenceRow.svelte            # NEW — UI-SPEC §"Component Contracts" #2
│       └── (existing components unchanged)
├── routes/
│   ├── alerts/
│   │   ├── +page.svelte                    # NEW — signup landing
│   │   ├── +page.server.ts                 # NEW — load (warmup banner state) + actions:default
│   │   ├── pending/+page.svelte            # NEW — generic "check your email" success
│   │   ├── confirmed/+page.svelte          # NEW — post-confirmation success
│   │   ├── confirm/+page.server.ts         # NEW — handles ?token= → activates subscriber → 302
│   │   ├── manage/+page.svelte             # NEW — preferences UI
│   │   ├── manage/+page.server.ts          # NEW — token-gated load + actions
│   │   └── unsubscribe/+page.server.ts     # NEW — token-gated, writes suppression, no JS
│   │   └── unsubscribe/+page.svelte        # NEW — confirmation render
│   ├── about/
│   │   └── +page.svelte                    # EXTEND — append "Email alerts" section per UI-SPEC
│   ├── boats/[id]/
│   │   └── +page.svelte                    # EXTEND — add "Get alerts for this boat" CTA
│   └── picker/
│       └── +page.svelte                    # EXTEND — add "Get alerts when this picks up" link
└── (no /api/cron/* routes needed — alert dispatch hooks into existing _scrapeTick)
```

### Pattern 1: Anti-abuse pipeline as a single ordered checklist

**What:** Every signup POST runs through a fixed-order list of guards. Each guard returns one of `{accept, silent_succeed, inline_error, page_error}`. The first non-`accept` outcome short-circuits.

**When to use:** Always for the signup endpoint — order is load-bearing because earlier guards (honeypot, rate-limit) are cheap and prevent later guards (disposable check, DB write) from being abused.

**Source:** UI-SPEC §"Signup form submission" enumerates the order.

**Example:**
```typescript
// src/routes/alerts/+page.server.ts (sketch)
import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { honeypot } from '$lib/alerts/honeypot';
import { rateLimit } from '$lib/alerts/rateLimit';
import { disposableEmail } from '$lib/alerts/disposableEmail';
import * as suppressionList from '$lib/db/suppressionList';
import * as subscribers from '$lib/db/subscribers';
import { sendConfirmEmail } from '$lib/email/send';
import { signToken } from '$lib/alerts/tokens';
import { getDb } from '$lib/db/client';

const SignupSchema = z.object({
  email: z.string().email(),
  website: z.string(),                                  // honeypot
  boats: z.array(z.coerce.number()).default([]),
  species: z.array(z.string()).default([])
}).refine(d => d.boats.length > 0 || d.species.length > 0,
          { message: 'Pick at least one boat or species to follow.' });

export const actions: Actions = {
  default: async ({ request, getClientAddress }) => {
    const fd = await request.formData();
    const parsed = SignupSchema.safeParse(/* …convert FormData… */);
    if (!parsed.success) return fail(400, { fieldErrors: parsed.error.flatten() });
    const { email, website, boats, species } = parsed.data;

    // 1. Honeypot — silent-success per UI-SPEC anti-enumeration
    if (honeypot.isFilled(website)) return { ok: true, masked: maskEmail(email) };

    // 2. Per-IP rate limit — page-level error
    const ip = request.headers.get('fly-client-ip') ?? getClientAddress();
    if (rateLimit.exceeded(getDb(), ip, /* window */ 3600, /* max */ 4)) {
      return fail(429, { pageError: 'rate_limited' });
    }
    rateLimit.record(getDb(), ip);

    // 3. Disposable email — inline error
    if (disposableEmail.isDisposable(email)) {
      return fail(400, { fieldErrors: { email: ['disposable_address'] } });
    }

    // 4. Suppression list — silent-success (anti-enumeration)
    if (suppressionList.has(getDb(), email)) return { ok: true, masked: maskEmail(email) };

    // 5. Already-pending — silent-success (avoids confirm-spam)
    if (subscribers.findRecentPending(getDb(), email, 24 * 3600)) {
      return { ok: true, masked: maskEmail(email) };
    }

    // 6. Already-active — short-circuit to /confirmed
    if (subscribers.findActive(getDb(), email)) {
      throw redirect(303, `/alerts/confirmed?already=1`);
    }

    // 7. Happy path
    const id = subscribers.createPending(getDb(), { email, boats, species, ip });
    const token = signToken('confirm', id, /* expires */ 24 * 3600);
    await sendConfirmEmail(email, token, { signupDate: today(), maskedIp: mask(ip) });
    return { ok: true, masked: maskEmail(email) };
  }
};
```

### Pattern 2: HMAC-signed token, single-key, three purposes

**What:** One `signToken(purpose, subjectId, expiresInSec?)` and one `verifyToken(purpose, token)` function. `purpose ∈ {'confirm','manage','unsubscribe'}`. Token format: `base64url(payload).base64url(hmac)`, where payload is `JSON({p:purpose, s:subjectId, e:expiresAtUnix|null, n:nonce})`.

**Why:** UI-SPEC §"Token signing/verification" specifies different expiries: 24h for confirm, 30 days for manage, never-expires for unsubscribe. One signer with an `expiresAt|null` field handles all three. `purpose` is part of the signed payload so a confirm token cannot be replayed as an unsubscribe token.

**Sources:** Standard HMAC-SHA256 pattern. RFC 8058 §3 requires the unsubscribe URL to be authenticated against forgery — HMAC over a per-subscriber claim suffices.

**Example:**
```typescript
// src/lib/alerts/tokens.ts (sketch)
import { createHmac, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

type Purpose = 'confirm' | 'manage' | 'unsubscribe';
type Payload = { p: Purpose; s: number; e: number | null; n: string };

const SECRET = () => {
  const s = env.PROJECT_SECRET;
  if (!s || s.length < 32) throw new Error('PROJECT_SECRET missing or too short (>=32 chars)');
  return s;
};

const b64u = {
  enc: (b: Buffer) => b.toString('base64url'),
  dec: (s: string) => Buffer.from(s, 'base64url')
};

export function signToken(purpose: Purpose, subjectId: number, ttlSec: number | null): string {
  const payload: Payload = {
    p: purpose, s: subjectId,
    e: ttlSec === null ? null : Math.floor(Date.now() / 1000) + ttlSec,
    n: randomBytes(8).toString('hex')
  };
  const body = b64u.enc(Buffer.from(JSON.stringify(payload)));
  const sig = b64u.enc(createHmac('sha256', SECRET()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(purpose: Purpose, token: string): { ok: false; reason: string }
                                                            | { ok: true; subjectId: number } {
  const [body, sig] = token.split('.');
  if (!body || !sig) return { ok: false, reason: 'malformed' };
  const expected = b64u.enc(createHmac('sha256', SECRET()).update(body).digest());
  // constant-time compare
  if (sig.length !== expected.length) return { ok: false, reason: 'bad_signature' };
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return { ok: false, reason: 'bad_signature' };
  let payload: Payload;
  try { payload = JSON.parse(b64u.dec(body).toString()); }
  catch { return { ok: false, reason: 'malformed' }; }
  if (payload.p !== purpose) return { ok: false, reason: 'wrong_purpose' };
  if (payload.e !== null && payload.e < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, subjectId: payload.s };
}
```

### Pattern 3: Idempotent alert dispatch via UNIQUE-key dedup

**What:** `alerts_sent (subscriber_id, kind, trigger_key, trigger_date)` has a UNIQUE index. Every alert is `INSERT OR IGNORE`-ed *before* the email is sent; the row is updated with `sent_at` *after* successful send. Re-running the dispatch (e.g., scrape ran twice on the same day) cannot duplicate emails because `INSERT OR IGNORE` returns 0 rows for already-recorded triggers.

**When to use:** Always for any cron-driven email — a scheduler retrying a failed tick must not produce duplicate sends.

**Source:** Phase 1 D-06 idempotent-upsert pattern, extended with the post-send `sent_at` update.

**Trigger keys:**
- Hot day: `trigger_key = "boat:" + boat_id + ":" + trip_type`, `trigger_date = today()`. Sample size floor: ≥ N=8 anglers (recommended; planner may tighten).
- Starting to run: `trigger_key = "species:" + species + ":" + trip_type`, `trigger_date = monday_of_iso_week(today())`. One alert per species/trip-type per ISO week max.

### Pattern 4: Warm-up cap as derived count, not separate counter

**What:** The daily cap (50/day week 1, 200/day week 2, then unlimited) is enforced by a query: `SELECT COUNT(*) FROM alerts_sent WHERE sent_at >= midnight_PT(today)`. If `count >= cap`, queue the new candidate (`status='queued'`); the next dispatch tick picks them up.

**Why this beats a separate counter table:**
1. Self-healing across restarts — no in-memory counter to lose.
2. Retroactive cap-changes (operator pushes the env var) take effect immediately on next tick.
3. Eliminates a midnight-PT cron to reset the counter (the count is naturally bounded by `sent_at` filtering).

**Source:** Standard "rate-limit by counting source-of-truth events" pattern. UI-SPEC §"Warm-up disclosure" specifies the volumes (50/200/full).

**Cap configuration:** Read from a `WARMUP_DAILY_CAP` env var, falls back to a constant table:
```typescript
// src/lib/alerts/warmup.ts (sketch)
function dailyCap(now: string /* YYYY-MM-DD */): number | null {
  const start = env.WARMUP_START_DATE; // YYYY-MM-DD
  if (!start) return null; // not in warm-up
  const days = daysBetween(start, now);
  if (days < 7) return 50;
  if (days < 14) return 200;
  return null; // unlimited
}
```

### Pattern 5: Alert evaluator = pure function reading DAL

**What:** `evaluateHotDay(db, today, activeSubscribers)` and `evaluateStartingToRun(db, today, activeSubscribers)` are pure functions returning `Candidate[]`. They issue zero SQL — they call DAL functions exclusively (`src/lib/db/queries/alertEval.ts`). Easy to unit-test with `seedTestDb` (Phase 2 fixture pattern).

**Source:** Phase 3 `compute.ts` model — pure-math module, DAL-injected, no module-scope getDb. Same shape works for evaluators.

**Hot-day math (ALT-09):**
```
For each (subscriber, followed_boat, trip_type) where today's catch_reports has rows:
  todayValue   = SUM(species_count) / SUM(angler_count) over today × boat × trip_type [all species]
  trailingAvg  = SUM(species_count) / SUM(angler_count) over (today-30d, today-1d)
                                                          × boat × trip_type [all species]
  todayAnglers = SUM(angler_count) over today × boat × trip_type
  if todayValue > 2.0 * trailingAvg AND todayAnglers >= MIN_ANGLERS (recommend 8):
    emit HotDayCandidate(subscriber, boat, trip_type, todayValue, trailingAvg, anglers, species_list)
```

**Starting-to-run math (ALT-10):**
```
For each (subscriber, followed_species, trip_type[primary]):
  rolling7Avg  = SUM(species_count) / SUM(angler_count) over (today-6d, today)
                                                          × species × trip_type [fleet-wide]
  yearAgoStart = today - 1y - 3d
  yearAgoEnd   = today - 1y + 3d
  yearAgoAvg   = SUM/SUM over [yearAgoStart, yearAgoEnd] × species × trip_type
  if rolling7Avg > 1.5 * yearAgoAvg AND yearAgoAvg > 0 AND nReportingBoats >= 3:
    emit RunCandidate(subscriber, species, trip_type, rolling7Avg, yearAgoAvg, nBoats)
```

(`trip_type` for the species-level alert: planner picks. Reasonable default = species' modal trip_type in the trailing 30 days. Alternative: emit one alert per `(species, trip_type)` pair the subscriber has hit, but that fires multiple emails. v1: use modal trip_type, single alert per species per ISO week.)

### Anti-Patterns to Avoid

- **Sending the confirmation email synchronously inside the form action without a try/catch** — a Resend outage would surface as a 500 to the signup user. **Do this instead:** wrap `sendConfirmEmail` in try/catch; on send failure, leave the pending row + log to operator-alert; render generic success regardless (the user can re-sign-up later).
- **Using `+server.ts` REST endpoints for the signup form** — UI-SPEC mandates progressive enhancement (works without JS). SvelteKit form actions on `+page.server.ts` are the right surface; `+server.ts` requires a fetch loop on the client to be useful.
- **Storing the confirmation token in the database** — UI-SPEC § patterns + RFC 8058 standard practice: tokens are stateless (HMAC-signed claims). Storing them adds a session table and a revocation problem. Keep them stateless; revocation comes from comparing against `subscribers.status` at verify time.
- **Embedding email rendering inside the alert dispatcher** — `ARCHITECTURE.md` §Anti-Pattern 3. Keep `evaluators/` (rules) → `dispatch.ts` (orchestration) → `email/buildEmail.ts` (rendering) → `email/send.ts` (transport) as four single-responsibility seams.
- **Using `text/plain` only without HTML, or HTML only without text/plain** — multipart/alternative with both is mandatory (PITFALLS §5 + UI-SPEC §"Plain-text email variants"). Spam filters score multipart higher; plain-text-only loses brand recognition; HTML-only flags as bulk.
- **Adding `Authorization: Bearer` headers to subscriber emails** (e.g., logging full token in pino) — pino redact paths must include `*.token`, `*.email`. Operator wrapper already redacts; extend to alert dispatcher.
- **Allowing `+page.server.ts` `load()` for `/alerts/unsubscribe` to render before the suppression-write succeeds** — UI-SPEC §"Unsubscribe page" mandates write-then-render; if the write fails, render the contact-pointer error instead. Order matters for compliance honesty.
- **A single shared cron route that handles "all scheduled work"** — `_scrapeTick` already orchestrates kill-switch → ping-start → scrape → SLA → forecast → ping-end. Phase 4 adds one more sequential step (`dispatchAlerts`); does NOT add a new cron entry.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Disposable-email rejection | Maintaining your own block list | `disposable-email-domains-js` (1.20.x) | List has 79k+ domains [VERIFIED: package readme]; auto-syncs from canonical source twice daily. Hand-maintaining will lag attackers within weeks. |
| Email HTML cross-client compat | A cleverly-classed CSS-grid layout | Hand-built table-based 600px container per UI-SPEC §`<EmailLayout>` | Outlook 2007–2019 (still ~15% of inbox share for older corporate users) renders modern CSS unpredictably. Tables with inline styles work everywhere. |
| Plain-text variant generation | Auto-stripping HTML tags ad-hoc | Same builder produces both variants from a structured block list | Mechanical text rendering (per UI-SPEC §"Plain-text email variants") avoids drift between HTML and text. Stripping `<a>`-tag URL→text loses bare URLs that plain-text users can copy. |
| Token signing | Inventing a homegrown signing scheme | HMAC-SHA256 over a JSON payload (Pattern 2 above) — Node `node:crypto` ships it | One std-lib import, ~30 LOC, unit-testable. JWT lib is overkill; bespoke signing risks side-channel mistakes. |
| Constant-time signature compare | `===` on the signature strings | `crypto.timingSafeEqual` or hand-rolled XOR loop (Pattern 2) | `===` is not constant-time; an attacker can leak HMAC bytes via timing. |
| Per-IP rate limiting | Promise-based in-memory throttle | SQLite `signup_attempts(ip, attempted_at)` ledger with index on (ip, attempted_at) | In-memory state dies on restart; SQLite ledger is restart-safe. ~3 LOC of SQL. |
| List-Unsubscribe URL signing | Sequential or unsigned IDs in unsubscribe URLs | HMAC-signed tokens (same `tokens.ts` module) | PITFALLS §"Security Mistakes": "Unsubscribe token is the user's email or a sequential ID → anyone can unsubscribe anyone else." Signed token = cryptographic identity. |
| Email masking on success page | Custom regex per call site | Single `maskEmail(s)` helper in `src/lib/shared/format.ts` | UI-SPEC §"Email masking rule" specifies exact format `f***@d***.com`; one helper, used in both `/alerts/pending` and `/alerts/unsubscribe` pages. |
| Per-angler formatting in email composer | Re-implementing `PerAnglerMetric.svelte` formatting | Extract `formatPerAngler(value, n)` to `src/lib/shared/format.ts`; both Svelte component AND email composer import it | UI-SPEC §FLAG #9: prevent drift between web and email decimal/integer rules. |
| Postal-address validation | Free-text input | Single env var `POSTAL_ADDRESS`, fail-closed if unset | Operator decision (UI-SPEC §FLAG #10), validation is "is the env var set?" — not the address shape. |

**Key insight:** Email compliance is a domain where *every* hand-rolled component creates a new failure mode that erodes sender reputation. Reuse hardened libraries (Resend's header support, the disposable-email package, Node's HMAC) at every junction; the components we *do* hand-roll (HTML composer, evaluators) are deliberately specified by UI-SPEC and have unit-test surfaces.

---

## Common Pitfalls

### Pitfall 1: List-bombing via the public signup form

**What goes wrong:** Bots submit thousands of victim emails to FishCount's signup form to bury a real fraud-confirmation in noise. FishCount sends thousands of "Confirm your subscription" emails to non-consenting recipients. Spam complaints spike. Sender reputation tanks. Existing user alerts go to spam.

**Why it happens:** The signup form is a public, unauthenticated POST endpoint. Bots find it within hours of being indexed.

**How to avoid (defense in depth — every layer required):**
1. Honeypot field `website` (UI-SPEC contract — silent success).
2. Per-IP rate limit (4/h fixed bucket).
3. Disposable-email rejection (catches abuse-as-a-service email burner addresses).
4. Double opt-in (the canonical defense — bots don't click confirmation links).
5. Suppression-list anti-enumeration (silent success on suppressed addresses prevents iteration).
6. Don't auto-resend confirmation emails on duplicate signup attempts (UI-SPEC §"Signup form submission" 4(e) — already-pending → silent success, no second email).

**Warning signs:**
- Signup rate >50× normal traffic baseline.
- Confirmation click-through rate <20% over a 7-day window.
- Spam-complaint rate >0.1% reported by Resend.
- Bounce rate >2%.

**Recovery if breached:** Pause new signups; audit pending subscribers; remove unconfirmed > 24h; switch to a fresh sending subdomain if reputation is unsalvageable. Cost: weeks.

[CITED: PITFALLS.md §Pitfall 5; UI-SPEC §"Anti-enumeration rule"]

### Pitfall 2: SPF/DKIM/DMARC misconfiguration → silent spam-filing

**What goes wrong:** Domain verification looks "green" in Resend dashboard, but DMARC alignment fails on Gmail because SPF says `_spf.mailerlite.com` (left over) instead of `_spf.resend.com`. Every Phase 4 email goes to Gmail spam. Operator notices weeks later via low confirmation rate.

**Why it happens:**
- DNS records are easy to set, hard to verify-end-to-end.
- Resend's domain-verified status checks SPF + DKIM but not DMARC alignment.
- Gmail/Yahoo enforcement (Nov 2025+) is permanent rejection, not soft-fail. [VERIFIED: Gmail bulk-sender rules 2026]

**How to avoid:**
1. **Test BEFORE first send** with mail-tester.com — score must be >9/10. UI-SPEC §"Validation Architecture" requires this.
2. Verify each record with `dig` from a clean shell: `dig TXT fishcount.app +short`, `dig TXT resend._domainkey.fishcount.app +short`, `dig TXT _dmarc.fishcount.app +short`.
3. DMARC starts at `p=none; rua=mailto:dmarc-reports@fishcount.app` for the first 30 days, then `p=quarantine` after observing clean reports.
4. Test send to a Gmail account, click "show original" → confirm `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.

**Warning signs:**
- Resend domain card shows "verified" for SPF + DKIM but no DMARC indicator.
- Mail-tester.com score <9/10.
- Test send to Gmail lands in spam folder on first send.

**Phase to address:** Phase 4 (DMARC; SPF + DKIM already done in Phase 0 per `00-RESEARCH.md` §"Resend sandbox caveat").

[VERIFIED: Gmail/Yahoo bulk-sender requirements 2026; `00-RESEARCH.md` §Q6]

### Pitfall 3: List-Unsubscribe-Post not honoring one-click within 48h

**What goes wrong:** A Gmail user clicks the inbox-level "Unsubscribe" button (which uses RFC 8058 List-Unsubscribe-Post). The user expects an immediate, no-confirmation unsubscribe. FishCount's handler shows an "Are you sure?" interstitial → Gmail flags FishCount as non-compliant → mail to all FishCount subscribers throttled.

**Why it happens:** Developers default to a confirmation step ("are you sure you want to unsubscribe?"). RFC 8058 explicitly forbids any user interaction beyond the one click.

**How to avoid:**
1. UI-SPEC §"Unsubscribe page" mandates: GET handler MUST write to suppression table BEFORE rendering. NO interstitial. NO "are you sure?".
2. List-Unsubscribe-Post URL accepts POST (from mail-client one-click) AND GET (from the in-email link). Both write suppression and 200 OK.
3. Process suppression within 48h [VERIFIED: Gmail/Yahoo rules 2026]. Phase 4's instant-write design satisfies this.
4. Both header values present:
   - `List-Unsubscribe: <mailto:unsubscribe+TOKEN@fishcount.app>, <https://fishcount.app/alerts/unsubscribe?token=TOKEN>`
   - `List-Unsubscribe-Post: List-Unsubscribe=One-Click`

**Warning signs:**
- Resend logs show "List-Unsubscribe header missing" warnings on send.
- Mail-tester.com flags missing one-click compliance.
- Gmail postmaster tools shows "user-reported spam rate climbing".

[VERIFIED: RFC 8058; Gmail/Yahoo bulk-sender rules 2026]

### Pitfall 4: Tracking pixels and click-rewriting break deliverability for transactional emails

**What goes wrong:** Resend's default sends include open-tracking (1×1 pixel) and click-rewriting (link-redirect domain). For transactional emails (confirmation, hot-day alerts), this triggers more spam-filter heuristics than it provides analytics value. Confirmation emails go to spam; users never click; sender reputation rots.

**Why it happens:** Resend tracking is **on** by default; opting out is per-send (or per-domain via API).

**How to avoid:**
1. UI-SPEC §"Anti-Feature Guards" #5: tracking explicitly disabled.
2. In `src/lib/email/send.ts` Resend call: pass `tracking: { open_tracking: false, click_tracking: false }` per send (the per-send param overrides domain default).
3. Alternatively: PATCH the domain via Resend API to globally disable tracking. [VERIFIED: Resend changelog "Update Click/Open Tracking via API"]
4. Document in `/about#email` that we don't track opens/clicks (UI-SPEC §"/about#email" already includes this).

**Warning signs:**
- Confirmation links rendered in the email body have `https://email.resend.com/click/...` redirector URLs (means click_tracking is on).
- Email source shows `<img src="...resend.com/o/...">` 1×1 pixel before the closing `</body>` (means open_tracking is on).

[VERIFIED: Resend Open and Click Tracking docs (Nov 2024+ API support)]

### Pitfall 5: "Hot day" alert fires on a 1-angler trip with 1 lucky catch

**What goes wrong:** A boat had one angler reporting in via "1/2 Day AM" today; that angler caught 4 yellowtail. Trailing 30-day average is 0.6 fish/angler. Today's 4.0/angler is >2× the baseline. Alert fires. Subscriber gets excited, books the boat tomorrow, finds the boat had unrepresentative data. Trust erodes.

**Why it happens:** Without a sample-size floor, single-angler trips dominate the per-angler metric.

**How to avoid:**
1. ALT-09 explicitly says "≥ N anglers" — Phase 4 sets N=8 as the recommended floor (planner can tighten). 8 is a typical SD half-day boat angler-count baseline.
2. Apply the same `n<5` "low data" / `n<8` "trip-too-small" honesty discipline that PITFALLS §3 + Phase 3 D-08 enshrined for forecasts.
3. Surface `n=X anglers` inline in the alert body (UI-SPEC §"Email body structure" Block 4 hot-day): `n=[anglers] anglers`.

**Warning signs:**
- Alert dispatch counts are higher than expected during weekday slow days.
- Subscribers ask "why did you tell me this boat was hot when 1 person was on it?"

### Pitfall 6: Subscriber rows survive unsubscribe (PII leak surface)

**What goes wrong:** A subscriber unsubscribes; their `subscribers` row is set to `status='unsubscribed'` but their email + preferences remain in the DB. Six months later, an admin debug script dumps the subscribers table to a Slack message; unsubscribed-user emails leak.

**Why it happens:** "Soft delete" is the easy default; PII discipline requires "hard delete + irrevocable signal" (the suppression list).

**How to avoid:**
1. On unsubscribe: `INSERT INTO suppression_list (email_hash, suppressed_at)` then `DELETE FROM subscribers WHERE id = ?`. The subscriber row is gone; the suppression_list row stores a hash (or canonicalized email — see below) so future signup attempts can detect it.
2. **Suppression list stores normalized email lower-cased + trimmed**, NOT the raw user input. Canonical form prevents `User@Gmail.com` resubmission from bypassing the check.
3. Optionally store SHA-256(`email + PROJECT_SECRET`) instead of plaintext email in suppression_list — provides one more PII layer if backups leak. v1 recommendation: store the canonicalized email plain in suppression_list (need to compare on signup; hash-then-compare adds salt-management complexity for marginal gain at our scale). Revisit if subscriber count grows.
4. `alerts_sent` references `subscriber_id`; on subscriber delete, either CASCADE delete history (loses dedup ability for re-ups, but the suppression list prevents re-ups anyway) OR set FK `ON DELETE SET NULL` and retain anonymized history. v1: CASCADE delete for simpler model.

**Warning signs:**
- Suppression-list table contains raw user-entered case-sensitive emails.
- A "list active subscribers" query returns rows with `status='unsubscribed'`.

[CITED: PITFALLS.md §Security Mistakes "Storing email addresses in a public-readable backup"]

### Pitfall 7: Warm-up cap silently drops alerts instead of queuing them

**What goes wrong:** Day 3, the cap is 50/day, the system has dispatched 50, the 51st alert is *silently discarded*. Day 4 the same alert (same trigger key, same date) — but `trigger_date` has rolled — fires. Or worse: the trigger condition no longer holds on day 4, and the alert is permanently lost. UI-SPEC §"Ramp-up disclosure" promises "We never silently drop alerts."

**Why it happens:** The natural implementation is "if cap exceeded, return early" — drops the alert.

**How to avoid:**
1. Insert the alert into `alerts_sent` with `status='queued'` when over-cap. Successful dispatch UPDATEs `status='sent'` + `sent_at`.
2. Each `dispatchAlerts` invocation:
   1. Selects fresh candidates (from evaluators).
   2. UNIONs with `status='queued'` rows from prior ticks.
   3. Filters for triggers where condition still holds (e.g., yesterday's hot day on Boat X is no longer relevant if today's catch_reports doesn't reproduce the trigger — but UI-SPEC contract is "alerts queue and send the next morning," not "queue forever". Recommended: queued alerts have a 24h TTL; after that, drop with `status='expired'` + log.).
   4. Dispatches up to (`cap` - already-sent-today) candidates.
3. Periodically log `count(status='queued')` so the operator sees backlog.

**Warning signs:**
- Subscribers report that an alert they expected (based on a public hot day) didn't arrive.
- `alerts_sent` shows zero rows for a day with known triggers.

### Pitfall 8: Token expiry copy is incorrectly "your link expired" when actually the email was already used

**What goes wrong:** Subscriber clicks an old confirmation link. The token signature is still valid, but `subscribers.status === 'active'` already. Token verification fails to distinguish "stale-but-valid token, already-used flow" from "expired token". Subscriber sees "this link expired" and thinks they need to re-sign-up.

**Why it happens:** Lazy token verification only checks signature + expiry; doesn't cross-check subscriber state.

**How to avoid:**
- `/alerts/confirm/+page.server.ts` `load()` flow:
  1. `verifyToken('confirm', t)` — if fail (signature/expired): render "link no longer valid, sign up again".
  2. Look up `subscribers.findById(subjectId)`:
     - If `status === 'pending'`: activate, render `/alerts/confirmed`.
     - If `status === 'active'`: render `/alerts/confirmed?already=1` (UI-SPEC §"Generic success page" already specifies redirecting active subscribers to the post-confirmation summary).
     - If row deleted (unsubscribed): render "this link is no longer valid".
- Same shape for `manage` token: invalid signature/expired vs subscriber-deleted-since-token-issued render the same message ("magic link is no longer valid"); UI-SPEC §"Manage-preferences page" explicitly enforces this anti-enumeration rule.

**Warning signs:**
- Confirmation completion rate < ~40% on first-time signups.
- Support inbox mentions "I already confirmed".

### Pitfall 9: Email H1 / brand line / preheader leak through old preview cache (Outlook image-blocked)

**What goes wrong:** First-week emails use a brand-image-as-logo. Outlook 2016 image-blocked recipients see a blank preview pane and red-X placeholder. They report as spam.

**How to avoid:** UI-SPEC §"Anti-Feature Guards" #9 + `<EmailLayout>` §"Block 2 Brand header": text-only "FishCount" — never an image. The `<title>` is set to the subject for clients that show it. Preheader is a hidden first-line `<div>` (UI-SPEC mandates).

[CITED: UI-SPEC §"Anti-Feature Guards" #9]

### Pitfall 10: SQLite write contention under heavy signup load

**What goes wrong:** Bot floods signup with 100 POSTs/sec. The signup endpoint writes to `signup_attempts`, `subscribers`, and (for the rate-limit check) reads `signup_attempts`. SQLite under WAL mode is fine until the writes serialize through one writer.

**How to avoid:**
1. WAL mode is already enabled (Phase 1 D-06 + `src/lib/db/client.ts`).
2. Per-IP rate limit kicks in BEFORE the subscriber write — bot floods from one IP serialize into 4-then-blocked, capping write pressure per attacker.
3. If a bot uses 1000 IPs: the rate-limit ledger writes are still cheap (~indexed insert); subscriber writes are gated on disposable-email + suppression checks (no write yet).
4. Real backstop: Fly.io machine concurrency limit. Beyond that, scale horizontally (deferred — `ARCHITECTURE.md` §"Scaling Considerations").

[CITED: ARCHITECTURE.md §"Scaling Priorities"]

---

## Code Examples

### Confirmation email composition

```typescript
// src/lib/email/buildEmail.ts (sketch, simplified)
// Source: UI-SPEC §"Component Contracts" #3 EmailLayout
import { POSTAL_ADDRESS } from './postalAddress';

interface BuildOpts {
  subject: string;
  preheader: string;
  h1: string;
  bodyHtml: string;
  reasonForReceipt: string;
  unsubscribeUrl: string;
  manageUrl?: string;
}

export function buildEmail(opts: BuildOpts): { html: string; text: string } {
  const addr = POSTAL_ADDRESS();    // throws if env unset → fail-closed
  const html = `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <title>${escape(opts.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">
<div style="display:none;max-height:0;overflow:hidden;">${escape(opts.preheader)}</div>
<table role="presentation" width="600" align="center" style="width:600px;max-width:100%;margin:0 auto;padding:24px;border-collapse:collapse;">
  <tr><td style="font-size:16px;color:#1d4ed8;font-weight:600;padding-bottom:24px;">FishCount</td></tr>
  <tr><td style="font-size:24px;line-height:1.25;font-weight:600;color:#1d4ed8;padding-bottom:16px;">
    ${escape(opts.h1)}
  </td></tr>
  <tr><td style="font-size:16px;line-height:1.5;color:#0f172a;padding-bottom:24px;">
    ${opts.bodyHtml /* trusted: built by templates.ts */}
  </td></tr>
  <tr><td style="background:#f8fafc;font-size:14px;line-height:1.5;color:#475569;padding:16px;">
    ${escape(opts.reasonForReceipt)}
    ${opts.manageUrl ? ` <a href="${opts.manageUrl}" style="color:#1d4ed8;text-decoration:underline;">Manage alerts</a> ·` : ''}
    <a href="${opts.unsubscribeUrl}" style="color:#1d4ed8;text-decoration:underline;">Unsubscribe</a>
  </td></tr>
  <tr><td style="font-size:14px;line-height:1.5;color:#475569;padding-top:32px;">
    FishCount · Public San Diego charter-boat dock-totals aggregator<br>
    ${escape(addr)}<br><br>
    Unsubscribe: <a href="${opts.unsubscribeUrl}" style="color:#1d4ed8;text-decoration:underline;">${opts.unsubscribeUrl}</a>
  </td></tr>
</table>
</body></html>`;

  const text = renderText(opts, addr);
  return { html, text };
}

function renderText(o: BuildOpts, addr: string): string {
  return [
    'FishCount',
    '',
    o.h1.toUpperCase(),
    '='.repeat(o.h1.length),
    '',
    htmlToText(o.bodyHtml, 72),       // strip tags, wrap at 72 chars
    '',
    '--- Why am I getting this email? ---',
    o.reasonForReceipt,
    '',
    '--',
    'FishCount · Public San Diego charter-boat dock-totals aggregator',
    addr,
    '',
    `Unsubscribe: ${o.unsubscribeUrl}`,
    o.manageUrl ? `Manage alerts: ${o.manageUrl}` : ''
  ].filter(Boolean).join('\n');
}
```

### Resend send wrapper with List-Unsubscribe + tracking off

```typescript
// src/lib/email/send.ts (sketch)
// Source: UI-SPEC §"Email body structure" + Resend headers/tracking docs
import { Resend } from 'resend';
import { env } from '$env/dynamic/private';
import { buildEmail } from './buildEmail';
import { signToken } from '$lib/alerts/tokens';

const FROM = 'FishCount <alerts@fishcount.app>'; // SPF/DKIM/DMARC-authorized

export async function sendSubscriberEmail(opts: {
  subscriberId: number;
  email: string;
  subject: string;
  preheader: string;
  h1: string;
  bodyHtml: string;
  reasonForReceipt: string;
  includeManageLink?: boolean;
}) {
  const unsubToken = signToken('unsubscribe', opts.subscriberId, null);
  const manageToken = opts.includeManageLink
    ? signToken('manage', opts.subscriberId, 30 * 24 * 3600)
    : null;
  const baseUrl = env.PUBLIC_BASE_URL ?? 'https://fishcount.app';
  const unsubUrl = `${baseUrl}/alerts/unsubscribe?token=${unsubToken}`;
  const manageUrl = manageToken ? `${baseUrl}/alerts/manage?token=${manageToken}` : undefined;
  const mailtoUnsub = `unsubscribe+${unsubToken}@fishcount.app`;

  const { html, text } = buildEmail({ ...opts, unsubscribeUrl: unsubUrl, manageUrl });

  const resend = new Resend(env.RESEND_API_KEY!);
  const result = await resend.emails.send({
    from: FROM,
    to: [opts.email],
    subject: opts.subject,
    html,
    text,
    headers: {
      // RFC 8058 / RFC 2369 — both URI methods, one-click POST capability
      'List-Unsubscribe': `<mailto:${mailtoUnsub}>, <${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    },
    // UI-SPEC §"Anti-Feature Guards" #5: no tracking
    tracking: { open_tracking: false, click_tracking: false }
  });

  if (result.error) throw new Error(`Resend send failed: ${result.error.message}`);
  return result.data;
}
```

### Hot-day evaluator (pure function)

```typescript
// src/lib/alerts/evaluators/hotDay.ts (sketch)
// Source: ALT-09; PITFALLS §3 sample-size discipline; Phase 3 D-08 weighted-yield math
import type Database from 'better-sqlite3';
import * as alertEval from '$lib/db/queries/alertEval';

const MIN_ANGLERS = 8;        // Pitfall 5 mitigation; planner may tighten
const HOT_DAY_RATIO = 2.0;    // ALT-09: today > 2× trailing 30d

export interface HotDayCandidate {
  subscriberId: number;
  boatId: number;
  boatName: string;
  tripType: string;
  todayValue: number;
  trailingAvg: number;
  anglers: number;
  speciesList: string[];
  date: string;          // today, YYYY-MM-DD PT
  triggerKey: string;    // `boat:${boatId}:${tripType}`
}

export function evaluateHotDay(db: Database.Database, today: string): HotDayCandidate[] {
  // DAL provides the joined view; evaluator is pure JS over the result set.
  const rows = alertEval.getTodayPerBoatTripStats(db, today);
  // rows: [{ subscriberId, boatId, boatName, tripType, todayValue, trailingAvg, anglers, speciesList }]
  return rows.flatMap((r) => {
    if (r.todayValue <= HOT_DAY_RATIO * r.trailingAvg) return [];
    if (r.anglers < MIN_ANGLERS) return [];
    if (!Number.isFinite(r.trailingAvg) || r.trailingAvg <= 0) return [];
    return [{
      ...r, date: today,
      triggerKey: `boat:${r.boatId}:${r.tripType}`
    }];
  });
}
```

### Dispatch with dedup + warm-up + queue

```typescript
// src/lib/alerts/dispatch.ts (sketch)
import { evaluateHotDay } from './evaluators/hotDay';
import { evaluateStartingToRun } from './evaluators/startingToRun';
import * as alertsSent from '$lib/db/alertsSent';
import { dailyCap } from './warmup';
import { sendSubscriberEmail } from '$lib/email/send';
import { renderHotDayBody, renderRunBody } from '$lib/email/templates';
import { logger } from '$lib/server/logger';
import type Database from 'better-sqlite3';

export async function dispatchAlerts(db: Database.Database, today: string): Promise<void> {
  const log = logger.child({ job: 'alerts-dispatch', day: today });
  const cap = dailyCap(today); // null = unlimited
  const sentToday = alertsSent.countSentToday(db, today);
  let budget = cap === null ? Infinity : Math.max(0, cap - sentToday);

  const fresh = [
    ...evaluateHotDay(db, today),
    ...evaluateStartingToRun(db, today)
  ];
  const queued = alertsSent.listQueued(db);  // status='queued', revalidate triggers
  const candidates = [...queued, ...fresh];

  for (const c of candidates) {
    const exists = alertsSent.exists(db, c.subscriberId, c.kind, c.triggerKey, c.triggerDate);
    if (exists?.status === 'sent') continue;     // already delivered; skip
    if (budget <= 0) {
      alertsSent.upsertQueued(db, c);            // reserve dedup slot, dispatch tomorrow
      continue;
    }
    try {
      const body = c.kind === 'hot_day' ? renderHotDayBody(c) : renderRunBody(c);
      await sendSubscriberEmail({
        subscriberId: c.subscriberId,
        email: c.email,
        subject: body.subject,
        preheader: body.preheader,
        h1: body.h1,
        bodyHtml: body.html,
        reasonForReceipt: body.reason,
        includeManageLink: true
      });
      alertsSent.upsertSent(db, c);
      budget--;
    } catch (err) {
      log.error({ err, candidate: { kind: c.kind, key: c.triggerKey } }, 'send_failed');
      // Leave row as queued (or absent) so next tick retries; do not record sent.
    }
  }
  log.info({ candidates: candidates.length, sent: sentToday + (cap ? cap - budget : -budget) }, 'dispatch_complete');
}
```

---

## Schema (new tables)

Append to `src/lib/db/migrations.ts` `SCHEMA_SQL`. Idempotent (`IF NOT EXISTS`). Same convention as Phase 1 D-06 + Phase 3.

```sql
-- ALT-01/02: subscribers — pending → active state machine.
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,             -- canonicalized lowercase + trimmed
  status TEXT NOT NULL CHECK (status IN ('pending', 'active')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT,                      -- set when status flips to active
  signup_ip TEXT,                         -- masked for the reason-for-receipt block
  paused_until TEXT                       -- UI-SPEC §"Manage-preferences page" pause feature
);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);

-- Followed boats / species are 1:N tables (a subscriber can follow N boats and N species).
CREATE TABLE IF NOT EXISTS subscriber_boats (
  subscriber_id INTEGER NOT NULL,
  boat_id INTEGER NOT NULL,
  PRIMARY KEY (subscriber_id, boat_id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE,
  FOREIGN KEY (boat_id) REFERENCES boats(id)
);

CREATE TABLE IF NOT EXISTS subscriber_species (
  subscriber_id INTEGER NOT NULL,
  species TEXT NOT NULL,
  PRIMARY KEY (subscriber_id, species),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

-- ALT-06: suppression_list — irrevocable; ON DELETE CASCADE on subscribers means
-- a subscriber row is deleted on unsubscribe; suppression_list outlives it.
CREATE TABLE IF NOT EXISTS suppression_list (
  email TEXT PRIMARY KEY,                 -- canonicalized lowercase + trimmed
  suppressed_at TEXT NOT NULL DEFAULT (datetime('now')),
  reason TEXT NOT NULL CHECK (reason IN ('user_unsub','operator_remove'))
);

-- ALT-03: signup_attempts — per-IP rate-limit ledger.
CREATE TABLE IF NOT EXISTS signup_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_ip_time
  ON signup_attempts(ip, attempted_at);

-- ALT-09/10/11/12: alerts_sent — dedup + dispatch ledger + warm-up counter source.
CREATE TABLE IF NOT EXISTS alerts_sent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hot_day','starting_to_run')),
  trigger_key TEXT NOT NULL,              -- e.g. "boat:42:1/2 Day AM" or "species:bluefin:Overnight"
  trigger_date TEXT NOT NULL,             -- YYYY-MM-DD PT (today for hot_day, ISO-week-monday for run)
  status TEXT NOT NULL CHECK (status IN ('queued','sent','expired')),
  queued_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,                           -- set when status→sent
  resend_message_id TEXT,                 -- audit trail
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);
-- Idempotency: same trigger never duplicates per subscriber.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_sent_unique
  ON alerts_sent(subscriber_id, kind, trigger_key, trigger_date);
-- For warm-up cap counting: WHERE sent_at >= midnight_PT(today).
CREATE INDEX IF NOT EXISTS idx_alerts_sent_sent_at ON alerts_sent(sent_at);
```

**Notes:**
- `email UNIQUE` on subscribers + suppression_list catches Pitfall 6.
- `subscriber_boats` / `subscriber_species` are 1:N — UI-SPEC's "Boats to follow (optional)" and "Species to follow (optional)" both yield arrays.
- `paused_until TEXT` is YYYY-MM-DD; alert dispatcher filters `WHERE paused_until IS NULL OR paused_until < today()`.
- `signup_attempts` retention: not pruned in v1 (rows are tiny). Plan can add a 90-day prune cron later if storage becomes a concern.
- `alerts_sent.status='expired'` reserved for queued alerts older than 24h that should not resend (Pitfall 7 mitigation).
- WAL mode + `PRAGMA synchronous=NORMAL` already in `client.ts`; no changes needed.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single opt-in with welcome email | Double opt-in mandatory for any public signup | Gmail/Yahoo bulk-sender rules (Feb 2024) → permanent reject (Nov 2025) [VERIFIED: 2026 enforcement] | Phase 4 cannot ship single-opt-in. |
| `List-Unsubscribe: <https://...>` (RFC 2369 only) | RFC 8058 List-Unsubscribe-Post one-click required | Feb 2024 (Yahoogle) → Nov 2025 permanent enforcement | Phase 4 must include List-Unsubscribe-Post header AND a no-confirmation server endpoint. |
| Open/click tracking enabled by default | Disabled per send for transactional/security emails | 2024+ deliverability research | Resend's `tracking: { open_tracking: false, click_tracking: false }` per send. |
| SPF + DKIM sufficient for transactional | DMARC alignment required for any bulk sender (>5k/day Gmail; lower thresholds creeping) | Feb 2024+ | Phase 4 must add `_dmarc.fishcount.app` TXT record before first send (already on the Phase 4 checklist via ALT-08). |
| `disposable-email-domains` (npm) as the disposable list | `disposable-email-domains-js` (auto-syncs from canonical repo, monthly) | 2024+ as original package fell stale | Phase 4 picks the actively-maintained variant. |

**Deprecated/outdated:**
- Pre-2024 SendGrid/MailChimp guides about welcome-email-on-signup without confirmation — actively harmful in the 2026 enforcement environment.
- "Hide unsubscribe link in tiny text at the bottom" — Gmail downranks emails where the unsubscribe link isn't prominent.
- Tracking pixels on transactional emails — actively flagged as spam-heuristic input by Gmail/Yahoo.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `disposable-email-domains-js` v1.20.x covers >95% of common throwaway-email domains used in list-bombing attacks | Standard Stack / ALT-04 | False rejects on legitimate niche domains (low risk; rejection is just a friendly inline error, not a permanent block). False accepts on novel disposable domains (medium risk; double opt-in catches the rest because bots don't click). |
| A2 | MIN_ANGLERS = 8 is a sensible floor for hot-day (ALT-09) sample-size honesty | Pitfall 5; Hot-day evaluator | Too low: noisy alerts on slow weekdays. Too high: misses real hot days on small-boat trips. **Planner should confirm with operator who knows SD charter angler counts; safe to revisit during Phase 4 plan-time.** |
| A3 | Starting-to-run alert uses species-modal `trip_type` for the comparison | Starting-to-run evaluator | If species modal trip_type changes mid-season, baseline comparison may compare across trip-types unintentionally. Mitigation: compute modal trip_type from trailing-30-day fleet activity, not all-time. |
| A4 | Hot-day MIN_REPORTING_BOATS isn't separately required (single-boat-per-alert is the primary subject) | Hot-day evaluator | Single-boat hot-day alerts will fire even if it's the only boat that ran today. Not a bug — that's the intent. Just noting. |
| A5 | Per-IP rate limit window of 1h is sufficient (vs sliding window) | Pattern 1 / ALT-03 | An attacker waiting 1h between bursts could send 4-and-go indefinitely. v1 acceptable; upgrade to sliding-window if abuse observed. |
| A6 | Postal address will be a real maildrop / virtual mailbox (not the operator's home address) | Postal-address sourcing | If operator publishes home address, real-world physical safety concern. UI-SPEC §FLAG #10 explicitly flags this; plan-time decision. |
| A7 | Resend's `tracking` send-level parameter exists and overrides domain default | Pattern: Resend send wrapper | If only domain-level tracking control exists, the Phase 4 send wrapper PATCHes the domain at boot to disable globally. [VERIFIED: Resend changelog shows API support for this] |
| A8 | DMARC `p=none` initially is operator-acceptable for the first 30 days | Pitfall 2 | If operator wants `p=quarantine` from day one, no harm — just less observability. |
| A9 | Hot-day alert subscribers actually want the alert (not "I followed boat X to *track* not be *spammed*") | UI-SPEC contract | Mitigation: UI-SPEC §"Manage-preferences page" includes a pause-alerts feature; users can opt for follow-without-alert by simply not signing up here. |
| A10 | Subscribers won't follow >50 boats individually — bulk-list-of-followed-boats query for evaluator stays cheap | Hot-day evaluator | With 100 subscribers × 5 boats average, candidate set is 500/day — trivially fast in SQLite. Reconsider only at >10k subscribers. |

**These claims should be confirmed in CONTEXT.md (the discuss-phase artifact) before plan-time.**

---

## Open Questions (RESOLVED)

1. **MIN_ANGLERS floor for hot-day evaluator (Assumption A2)**
   - What we know: ALT-09 specifies "≥ N anglers"; UI-SPEC §"Email body structure" Block 4 expects `n=[anglers] anglers` rendered.
   - What's unclear: The exact value of N. PITFALLS §3 spirit is "n<5 is unhonest"; for a per-boat per-trip-type metric, N=8 is a reasonable floor below typical SD half-day boat counts.
   - RESOLVED: Default 8 (env override HOT_DAY_MIN_ANGLERS). Implemented in Plan 07 Task 1.

2. **Postal address sourcing (Assumption A6 / UI-SPEC §FLAG #10)**
   - What we know: CAN-SPAM 15 U.S.C. § 7704(a)(5) requires a "valid physical postal address". UI-SPEC mandates the address render in every email and plan-time blocks until procured.
   - What's unclear: Operator's choice — virtual mailbox service (UPS Store, iPostal1, ~$10–20/mo) vs. P.O. Box vs. operator's actual address.
   - RESOLVED: Operator procures virtual mailbox before first prod send. Plan 08 Task 4 (manual UAT checkpoint) blocks first send until POSTAL_ADDRESS env is set + verified.

3. **Rate-limit window: fixed-bucket 1h vs. sliding 1h (Assumption A5)**
   - What we know: UI-SPEC §FLAG #12 says fixed-window for v1 simplicity.
   - What's unclear: Whether attackers will exploit boundary timing in practice.
   - RESOLVED: Fixed 1h bucket (Plan 02 MAX_ATTEMPTS=3, WINDOW_SECONDS=3600). Sliding window deferred to v2 if abuse observed.

4. **Cap-rollover for queued alerts (Pattern 4 / Pitfall 7 mitigation)**
   - What we know: UI-SPEC promises "alerts queue and send the next morning. We never silently drop alerts."
   - What's unclear: How to handle queued alerts whose triggers are stale (e.g., boat had a hot day Monday, queue overflowed, by Tuesday the boat's avg is back to normal — do we still send the Monday alert?).
   - RESOLVED: Queue and drain next dispatch tick (Plan 07 Task 3 drainQueued); 24h TTL via markExpired (Plan 01 alertsSent.markExpired). Per Blocker B1 fix.

5. **Hot-day alert for boats running multiple trip-types same day (e.g., 1/2 Day AM AND 1/2 Day PM)**
   - What we know: `trigger_key = "boat:" + boat_id + ":" + trip_type` allows two alerts per boat per day if both trip types fire.
   - What's unclear: Whether a subscriber following the boat wants 2 emails.
   - RESOLVED: Two distinct candidates (Plan 07 evaluator emits per (boat, trip_type), trigger_key includes trip_type).

6. **PROJECT_SECRET rotation strategy**
   - What we know: HMAC tokens are signed with `PROJECT_SECRET`. If rotated, all in-flight tokens (24h confirm, 30-day manage, no-expiry unsubscribe) become invalid.
   - What's unclear: Operator policy on secret rotation.
   - RESOLVED: Single secret v1; rotation invalidates active manage links — documented in Plan 08 runbook §Recovery.

---

## Environment Availability

Phase 4 depends entirely on existing tooling — no new external services beyond the Resend account already created in Phase 0 and the DNS records that will be added.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Resend account + verified domain (SPF + DKIM) | All email sends | ✓ (Phase 0 done) | n/a | — |
| Resend API key (`RESEND_API_KEY` env) | `src/lib/email/send.ts` | ✓ (Phase 0 wired into operator.ts) | n/a | — |
| `OPERATOR_EMAIL` env | (Reused for postal-address fallback notification?) | ✓ | n/a | — |
| `PROJECT_SECRET` env (≥32 chars random) | `src/lib/alerts/tokens.ts` | ✗ — must add to Fly secrets | n/a | None — required before any token issued |
| `POSTAL_ADDRESS` env | `src/lib/email/postalAddress.ts` | ✗ — operator decision (Open Question 2) | n/a | None — fail-closed; no email sends without it |
| `WARMUP_START_DATE` env (YYYY-MM-DD) | `src/lib/alerts/warmup.ts` | ✗ — set on first production deploy | n/a | If unset: no warm-up gating (treat as "past warm-up window"). Recommended set on first deploy. |
| DNS access for `_dmarc.fishcount.app` TXT record | ALT-08 DMARC | ✓ (operator owns DNS) | n/a | — |
| `fly-client-ip` header | ALT-03 rate limiting | ✓ (Fly proxy already adds it) [VERIFIED: Fly docs] | n/a | `event.getClientAddress()` (SvelteKit fallback; less accurate behind proxies) |
| `disposable-email-domains-js` | ALT-04 | ✗ — `npm install` step | 1.20.x | None |
| Better Stack log sink | Existing (Phase 0) — picks up new pino child loggers | ✓ | n/a | — |
| Healthchecks.io ping | Existing (Phase 0) — `_scrapeTick` heartbeat unaffected | ✓ | n/a | — |

**Missing dependencies blocking execution:**
- `PROJECT_SECRET` — must be set as Fly secret before deploy.
- `POSTAL_ADDRESS` — must be confirmed before first send (Open Question 2).
- `_dmarc` DNS TXT record — must be added before first send (ALT-08).

**Missing dependencies with fallback:**
- `WARMUP_START_DATE` — falls back to "warm-up disabled" if unset; operator should set on first deploy.

---

## Validation Architecture

(`workflow.nyquist_validation: true` is enabled in `.planning/config.json`.)

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.x |
| Config file | `vite.config.ts` (existing, project-wide) |
| Quick run command | `npm run test -- --run <pattern>` |
| Full suite command | `npm run test:run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ALT-01 | Signup form with optional boats/species; at-least-one validation | unit + integration | `npm run test -- --run tests/unit/alerts/signup-validation.test.ts` | ❌ Wave 0 |
| ALT-02 | HMAC token sign/verify round-trip; expiry rejection; wrong-purpose rejection; tampered-signature rejection (constant-time) | unit | `npm run test -- --run tests/unit/alerts/tokens.test.ts` | ❌ Wave 0 |
| ALT-02 | Confirmation flow: pending → active state machine; already-active → /confirmed redirect | integration | `npm run test -- --run tests/integration/alerts/confirm-flow.test.ts` | ❌ Wave 0 |
| ALT-03 | Per-IP rate limiter: 4th attempt within 1h → page error; resets after 1h | unit | `npm run test -- --run tests/unit/alerts/rate-limit.test.ts` | ❌ Wave 0 |
| ALT-03 | Honeypot: filled field → silent success (UI-SPEC anti-enumeration) | unit | `npm run test -- --run tests/unit/alerts/honeypot.test.ts` | ❌ Wave 0 |
| ALT-04 | Disposable-email rejection (sample list of known domains) + accepts gmail/yahoo/icloud | unit | `npm run test -- --run tests/unit/alerts/disposable-email.test.ts` | ❌ Wave 0 |
| ALT-05 | Email send wrapper sets List-Unsubscribe + List-Unsubscribe-Post headers; tracking disabled | unit (mock Resend) | `npm run test -- --run tests/unit/email/send.test.ts` | ❌ Wave 0 |
| ALT-05 | One-click unsubscribe endpoint (GET + POST) writes suppression and renders without JS | integration | `npm run test -- --run tests/integration/alerts/unsubscribe.test.ts` | ❌ Wave 0 |
| ALT-06 | Suppression list: signup with suppressed email → silent success, no DB write | integration | `npm run test -- --run tests/integration/alerts/suppression-anti-enumeration.test.ts` | ❌ Wave 0 |
| ALT-07 | Email composer fails closed when POSTAL_ADDRESS unset; emits compliance footer when set | unit | `npm run test -- --run tests/unit/email/build-email.test.ts` | ❌ Wave 0 |
| ALT-08 | (Manual) SPF/DKIM/DMARC verification via mail-tester.com; > 9/10 score before first send | manual UAT | `scripts/email-deliverability-check.md` (runbook) | ❌ Wave 0 |
| ALT-09 | Hot-day evaluator: today/trailing comparison fixture; below-threshold cases skipped; min-anglers floor | unit | `npm run test -- --run tests/unit/alerts/hot-day.test.ts` | ❌ Wave 0 |
| ALT-10 | Starting-to-run evaluator: rolling-7d vs same-week-last-year fixture; threshold sensitivity | unit | `npm run test -- --run tests/unit/alerts/starting-to-run.test.ts` | ❌ Wave 0 |
| ALT-11 | `alerts_sent` dedup: same trigger second dispatch → INSERT OR IGNORE no-ops | integration | `npm run test -- --run tests/integration/alerts/dedup.test.ts` | ❌ Wave 0 |
| ALT-12 | Warm-up cap: at cap → over-cap candidates queue; next tick drains queue | unit | `npm run test -- --run tests/unit/alerts/warmup.test.ts` | ❌ Wave 0 |
| ALT-12 | (Manual) End-to-end: trigger a synthetic hot-day, verify email arrives at operator's gmail/icloud, click confirm, check headers | manual UAT | `scripts/alerts-e2e-drill.md` (runbook) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test -- --run <relevant-pattern>` (sub-second feedback).
- **Per wave merge:** `npm run test:run` (full suite green).
- **Phase gate:** Full suite green + `scripts/email-deliverability-check.md` + `scripts/alerts-e2e-drill.md` both signed off in `04-VALIDATION.md` before `/gsd-verify-work`.

### Wave 0 Gaps

All test files below are NEW for Phase 4. The pattern is: pure-function units in `tests/unit/`, multi-module integration in `tests/integration/`. Reuse the `seedTestDb` helper from Phase 2 Plan 02-01 and the `vi.doMock` `$lib`-alias-correctly pattern from Phase 3.

- [ ] `tests/unit/alerts/tokens.test.ts` — sign/verify, expiry, purpose mismatch, tamper resistance
- [ ] `tests/unit/alerts/rate-limit.test.ts` — record + count-within-window, 4th attempt blocked, 1h-later resets
- [ ] `tests/unit/alerts/honeypot.test.ts` — empty / whitespace / filled discrimination
- [ ] `tests/unit/alerts/disposable-email.test.ts` — known disposable + permanent + edge cases (case, subdomain)
- [ ] `tests/unit/alerts/signup-validation.test.ts` — Zod schema rejects malformed; at-least-one boats-or-species
- [ ] `tests/unit/alerts/hot-day.test.ts` — fixture-driven trigger / non-trigger; min-anglers floor; baseline=0 guard
- [ ] `tests/unit/alerts/starting-to-run.test.ts` — fixture-driven; ISO-week math
- [ ] `tests/unit/alerts/warmup.test.ts` — cap evolution by day index; queue-when-over
- [ ] `tests/unit/email/send.test.ts` — Resend mock; verify headers + tracking off + multipart text+html
- [ ] `tests/unit/email/build-email.test.ts` — fail-closed on missing POSTAL_ADDRESS; HTML+text mirror block content
- [ ] `tests/integration/alerts/confirm-flow.test.ts` — POST signup → load `/alerts/confirm?token=…` → subscriber.status='active'
- [ ] `tests/integration/alerts/unsubscribe.test.ts` — GET and POST both write suppression and delete subscriber, no-JS shape
- [ ] `tests/integration/alerts/suppression-anti-enumeration.test.ts` — silent-success across honeypot / suppression / already-pending paths
- [ ] `tests/integration/alerts/dedup.test.ts` — second dispatch same trigger → no second email
- [ ] `tests/conftest.ts`-equivalent: extend `seedTestDb` to seed subscribers + active alert preferences (added to existing helper)
- [ ] `scripts/email-deliverability-check.md` — runbook for mail-tester + Gmail + iCloud send
- [ ] `scripts/alerts-e2e-drill.md` — runbook for synthetic-trigger production drill

(No Vitest framework install — already wired since Phase 0.)

---

## Project Constraints (from CLAUDE.md)

These directives apply to Phase 4. Plans MUST verify compliance.

### Required (must implement)

1. **Polite scraping is unchanged** — Phase 4 doesn't add scraping; the existing rate-limited Phase 1 fetcher is untouched.
2. **Silent-failure detection** — alert dispatch failures must surface via the existing operator-alert channel (`sendOperatorAlert`); a Resend outage during dispatch should email the operator, not silently fail.
3. **Forecast honesty** — alerts that quote per-angler numbers MUST follow the same integer/decimal rules, the `n=X anglers` annotation, and trip-type segmentation. The `formatPerAngler(value, n)` helper is the single source of truth for both web and email.
4. **Per-angler metric framing** — alert email bodies are subject to the same "derived boat-aggregate average" framing rule as web pages. Hot-day email's body Block 4 explicitly includes `n=[anglers] anglers` per UI-SPEC.
5. **Email compliance — ALL of the following ship in Phase 4 (none can be deferred):**
   - Double opt-in (ALT-02)
   - Per-IP rate limit (ALT-03)
   - Honeypot (ALT-03)
   - Disposable-email rejection (ALT-04)
   - Suppression list, no re-subscribe via public form (ALT-06)
   - `List-Unsubscribe` header + one-click unsubscribe (ALT-05; RFC 8058)
   - Physical postal address (ALT-07)
   - SPF + DKIM (Phase 0 done) + DMARC (Phase 4 ALT-08)
   - Warm-up: 50/day → 200/day → full (ALT-12)

### Forbidden (must NOT implement)

1. **No social feed, comments, photos** — anti-feature per CLAUDE.md.
2. **No leaderboards / gamification** — anti-feature.
3. **No ML-based bite-time forecasts** — anti-feature; alert thresholds use deterministic rules over historical data only.
4. **No SMS / push (v1)** — email only.
5. **No mandatory account to browse** — alerts is opt-in via email; no login required to use signup form or unsubscribe.
6. **No booking / payment** — anti-feature.
7. **No "ON FIRE" / hype badges** — UI-SPEC anti-feature #4: subject is "Hot day: [Boat Name]" with no flame emoji, no exclamation point, no ALL CAPS.
8. **No paywalls** — alerts are free.
9. **No sponsored boat slots in rankings** — alerts ranking-free; trigger fires on whichever followed boat hits the threshold.
10. **No fake-precision projections** — alerts use integer per-angler values per UI-SPEC.
11. **No manual scrape trigger in UI** — Phase 4 doesn't expose any operator endpoint via UI.
12. **No non-San-Diego data** — the alert pipeline reads only `catch_reports` (single source).

### Architecture rules (apply to Phase 4)

1. **DAL is the only SQL surface** — Phase 4 adds `src/lib/db/{subscribers,suppressionList,signupAttempts,alertsSent}.ts` + `src/lib/db/queries/alertEval.ts`; no SQL elsewhere.
2. **Idempotent upsert** — `alerts_sent` UNIQUE index doubles as dedup key; signup endpoint is *not* idempotent (a new signup creates a new pending row), but the user-facing behavior is anti-enumeration silent-success on every collision.
3. **All dates `YYYY-MM-DD` America/Los_Angeles via `src/lib/shared/dates.ts`** — `trigger_date`, `paused_until`, `WARMUP_START_DATE`, midnight-PT comparisons all route through `dates.ts`.
4. **Backfill is CLI, not cron** — Phase 4 doesn't add backfill; existing CLI is unchanged.
5. **Precompute aggregates** — alert evaluators read existing `catch_reports` aggregates; `forecasts` table is NOT input to alerts (per `03-CONTEXT.md` deferred §"Email alert payload uses forecast values").

---

## Sources

### Primary (HIGH confidence)

- `CLAUDE.md` (project root) — Non-negotiable Rule #5 (email compliance); architecture rules; anti-features list. Verified 2026-04-27.
- `.planning/research/STACK.md` (verified 2026-04-22) — Resend 6.12.x, croner 10.0.x, better-sqlite3 12.9.x, Zod 4.3.x.
- `.planning/research/ARCHITECTURE.md` — Modular monolith pattern; idempotent upsert; precompute-aggregates; Anti-Pattern 3 (don't embed email rendering in dispatcher); Critical Contracts.
- `.planning/research/PITFALLS.md` §Pitfall 5 (list-bombing); §Security Mistakes (PII handling, unsubscribe tokens); §Pitfall 3 (forecast honesty extends to alerts that quote per-angler).
- `.planning/research/FEATURES.md` §Email alerts; SD domain language verbatim.
- `.planning/phases/04-email-alerts/04-UI-SPEC.md` (approved 2026-04-27) — Every visual, interactional, and copy contract.
- `.planning/phases/00-ops-guardrails/00-RESEARCH.md` §Q6 (Resend operator-alert channel; SPF+DKIM done; DMARC deferred to Phase 4); §"Resend sandbox caveat".
- `src/lib/alerts/operator.ts` — Existing Resend client wrapper with PII-safe logging (`safeSubject`); reference implementation pattern.
- `src/lib/server/scheduler.ts` — Existing `_scrapeTick` integration point; non-fatal try/catch discipline for downstream alerts.
- `src/lib/db/migrations.ts` — Schema bootstrap pattern; idempotent DDL.
- `src/lib/shared/dates.ts` — Sole producer of YYYY-MM-DD; `today()`, `addDays()`, `daysBetween()`, `isoWeekKey()`.
- `src/lib/copy/metrics.ts` — Verbatim copy constants; `FORECAST_LABEL`, `NOT_ENOUGH_HISTORY`, `PI_LABEL` patterns.
- [Resend API docs — Update Click/Open Tracking via API](https://resend.com/changelog/update-click-open-tracking-via-api) — Per-domain and per-send tracking control.
- [Resend Open and Click Tracking blog](https://resend.com/blog/open-and-click-tracking) — Disabling improves transactional deliverability.
- [RFC 8058 — Signaling One-Click Functionality for List Email Headers](https://datatracker.ietf.org/doc/html/rfc8058) — Authoritative spec.
- [Fly.io Request Headers docs](https://fly.io/docs/networking/request-headers/) — `Fly-Client-IP` header semantics.
- [Mailgun: What is RFC 8058?](https://www.mailgun.com/blog/deliverability/what-is-rfc-8058/) — One-click unsubscribe practical guide.

### Secondary (MEDIUM confidence — current ecosystem reporting; verified against multiple sources)

- [Gmail and Yahoo Bulk Sender Requirements (Updated For 2026)](https://emailwarmup.com/blog/gmail-and-yahoo-bulk-sender-requirements/) — 48h unsubscribe processing; permanent rejection enforcement Nov 2025.
- [Chronos: Gmail & Yahoo Sender Requirements 2026](https://chronos.agency/blog/gmail-yahoo-email-sender-requirements-2026/) — Cross-confirms.
- [npm: disposable-email-domains-js v1.20.0](https://www.npmjs.com/package/disposable-email-domains-js) — Active maintenance, monthly updates.
- [GitHub: ivolo/disposable-email-domains](https://github.com/ivolo/disposable-email-domains) — Canonical disposable-domain source list.

### Tertiary (LOW confidence / noted but not load-bearing)

- General Node-crypto HMAC docs — well-known std-lib usage; no specific URL.
- General Zod docs — well-known; no specific URL.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version verified against STACK.md (already locked), npm registry, or existing `package.json`.
- Architecture: HIGH — extends established Phase 0/1/2/3 patterns (DAL boundary, `_scrapeTick` orchestration, idempotent upsert, pure-function evaluators with DAL injection).
- Schema: HIGH — straightforward extension of `migrations.ts` with the same idempotent-DDL pattern.
- Anti-abuse pipeline: HIGH — UI-SPEC dictates the exact order; each layer maps to a verified pattern.
- Tokens: HIGH — standard HMAC-SHA256 over JSON claims; UI-SPEC and RFC 8058 align.
- Resend integration: HIGH — existing wrapper proves the pattern; only new piece is per-send `tracking: false` + `headers: List-Unsubscribe*`.
- Hot-day / starting-to-run thresholds: MEDIUM — math is settled; `MIN_ANGLERS=8` is a recommendation not a verified domain constant (Open Question 1).
- Postal address: BLOCKED — operator decision (Open Question 2). Plan must include a Wave 0 task to procure before first send.
- DMARC: HIGH — established 2024+ requirement; Phase 0 already wired SPF+DKIM, Phase 4 adds the TXT record.
- Warm-up cap: HIGH — derived-count pattern is simpler and more robust than a separate counter.
- UI: HIGH — fully locked in `04-UI-SPEC.md` (approved 2026-04-27).

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (30 days for stable, foundational research; revisit if Gmail/Yahoo enforcement rules change or if Resend tracking-API deprecates).

---

*Phase 4 research consolidates the locked stack (STACK.md), the architectural patterns (ARCHITECTURE.md), the abuse pitfalls (PITFALLS.md §5), and the visual/copy contract (UI-SPEC.md) into a single planner-consumable artifact. The hard-line CLAUDE.md non-negotiable #5 is encoded as nine specific Phase 4 deliverables, none of which can be deferred. Total new code surface: ~12 module files, ~17 test files, 5 new tables, 0 new external services.*
