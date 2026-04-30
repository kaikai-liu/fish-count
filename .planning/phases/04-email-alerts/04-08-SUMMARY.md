---
phase: 04-email-alerts
plan: 08
subsystem: email, deliverability, ops
tags: [phase-4, email-alerts, deliverability, dmarc, warmup, sign-off, manual-uat, runbook, drill-script]

# Dependency graph
requires:
  - phase: 04-email-alerts/04-01
    provides: alerts_sent + suppression_list DAL (warm-up cap counter source; recordSent / recordQueued / markSent)
  - phase: 04-email-alerts/04-02
    provides: tokens (HMAC sign), warmup.dailyCap (50/200/Infinity pure-fn)
  - phase: 04-email-alerts/04-03
    provides: postalAddress (fail-closed env), buildEmail (HTML+text composer), templates (renderConfirmationEmail / hotDayEmail / startingToRunEmail), sendUserEmail (RFC 8058 wrapper)
  - phase: 04-email-alerts/04-07
    provides: dispatchAlerts orchestrator + drainQueued (cap-aware queue drain before evaluators)
provides:
  - Phase 4 sign-off artifacts (engineering close)
  - tsx-runnable email-tester drill script exercising 4 production templates through the production send wrapper
  - Operator runbook documenting DMARC + mail-tester + real-mailbox + warmup-day-1 + +24h postmortem + recovery procedures
  - Automated 50/200/drain warm-up cap drill (promotes Manual-Only Verification to integration-test)
  - .env.example extended with every Phase 4 env var (PROJECT_SECRET, POSTAL_ADDRESS, RESEND_API_KEY, SUBSCRIBER_FROM_EMAIL, PUBLIC_BASE_URL, HOT_DAY_MIN_ANGLERS, WARMUP_START_DATE)
  - 04-VALIDATION.md Per-Task Verification Map populated for plans 01-08 (22 ✅ engineering rows, 4 ⬜ pending operator UAT rows)
  - nyquist_compliant flipped to true; Approval = approved 2026-04-29 (engineering close)
  - $env/dynamic/private Node loader so tsx scripts can import production server modules outside SvelteKit
affects: [phase-05-polish (no anti-feature regression on tracking-off), production deploy (operator must complete Tasks 4-7 before first prod send)]

# Tech tracking
tech-stack:
  added: []  # No new dependencies; drill is pure tsx + Node native
  patterns:
    - "tsx CLI script registers Node loader to synthesize SvelteKit virtual modules ($env/dynamic/private) for production-server imports"
    - "Manual-only verification gets demoted to automated drill where the cap is testable end-to-end (warm-up); remaining manual checks (DMARC DNS, real mailboxes, +24h postmortem) get a runbook procedure with explicit halt thresholds"
    - "OPERATOR ACTION REQUIRED markers in both the runbook and 04-VALIDATION.md cleanly separate Claude-automatable from operator-only work"

key-files:
  created:
    - scripts/email-tester-drill.ts (316 lines) — 4-template drill via prod buildEmail+sendUserEmail with --dry-run + fail-closed env checks
    - scripts/_sveltekit-env-loader.mjs (22 lines) — Node loader entrypoint
    - scripts/_sveltekit-env-resolver.mjs (35 lines) — resolver hooks for $env/dynamic/private virtual module
    - docs/runbooks/email-deliverability.md (250 lines) — operator runbook (DMARC, mail-tester, real-mailbox, warmup, postmortem, recovery)
    - tests/integration/alerts/warm-up-drill.test.ts (231 lines) — 4-test end-to-end warm-up cap drill (week 1, week 2 drain, post-warmup, unset)
  modified:
    - .env.example — appended Phase 4 section with 7 documented env vars
    - .planning/phases/04-email-alerts/04-VALIDATION.md — Per-Task Verification Map populated; nyquist_compliant true; Approval approved 2026-04-29

key-decisions:
  - "scripts/_sveltekit-env-{loader,resolver}.mjs over installing dotenv: SvelteKit virtual modules ($env/dynamic/private) cannot be resolved by tsx alone. A Node-native module.register() loader synthesizes the virtual module at resolve time. Mirrors tests/helpers/sveltekit-env-shim.ts (vitest path) so drill ↔ test ↔ prod all read process.env identically."
  - "Drill imports the production templates + buildEmail + sendUserEmail (NOT a parallel sender) so RFC 8058 + tracking-off discipline is exercised on every send. The drill is a pre-flight, not an alternate code path."
  - "Plan author's week-2 assertion in Task 2 was wrong (expected sentFromStart=10; correct value is 60: 50 originally sent + 10 drained). Fixed inline as Rule 1 — the test is now correct and the dispatcher behavior matches it. The intent ('queued rows are NOT silently lost; they become sent') is preserved by also asserting queuedFromStart=0."
  - "Tasks 4-7 are operator-only checkpoints (DMARC DNS state, mail-tester external scoring, real mailbox provider filtering, +24h Resend dashboard review). Per the orchestrator's instructions, executed engineering deliverables (drill script, runbook, automated warm-up test) and documented the operator procedures verbatim in docs/runbooks/email-deliverability.md. Marked the 4 corresponding rows in 04-VALIDATION.md ⬜ pending operator with explicit cross-references to the runbook section that must be executed."

patterns-established:
  - "Pattern: tsx scripts that need SvelteKit virtual modules use the _sveltekit-env-loader.mjs Node loader. Reusable for any future operator CLI that imports server-only $lib code (e.g. retention purges, signup-attempt audits)."
  - "Pattern: drill script + runbook split — engineering builds the script that does the heavy lifting; the runbook tells the operator the 1-line invocation + the per-deduction remediation table. Operator never reads the script source."
  - "Pattern: 04-VALIDATION.md adds an 'Engineering Backing' column to the Manual-Only Verifications table when an automated drill (or runbook script) makes the manual check fast — keeps the manual-vs-automated boundary visible."

requirements-completed: [ALT-08, ALT-12]

# Metrics
duration: 25min
completed: 2026-04-29
---

# Phase 4 Plan 08: Deliverability Sign-Off (Drill + Runbook + Warm-up Cap Drill + Validation Map) Summary

**Phase 4 engineering close: drill script + runbook + automated warm-up cap drill + populated Per-Task Verification Map; nyquist_compliant flipped true; engineering Approval = 2026-04-29 with 4 operator UAT items still ⬜ pending operator (DMARC DNS / Mail-Tester / Real-mailbox / +24h postmortem).**

## Performance

- **Duration:** 25 min
- **Started:** 2026-04-29T17:18:00Z (worktree base reset to 908a97e)
- **Completed:** 2026-04-29T17:33:00Z
- **Tasks:** 4 of 8 executed (Tasks 1-3 + Task 8); Tasks 4-7 documented as operator-only checkpoints in `docs/runbooks/email-deliverability.md` per orchestrator instruction
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments

- Phase 4 engineering close: every automatable Phase 4 sign-off artifact ships green
- `scripts/email-tester-drill.ts`: 4 templates × prod-send-wrapper drill, fail-closed env checks, --dry-run path, exits 0/1/2 cleanly
- `tests/integration/alerts/warm-up-drill.test.ts`: 50/200/drain progression proven end-to-end with mocked Resend (T-04-A8 mitigation; promotes ALT-12 from manual to automated)
- `docs/runbooks/email-deliverability.md`: operator runbook with explicit halt thresholds (bounce > 5%, complaint > 0.3%) + recovery procedures (Gmail spam, complaint spike, POSTAL_ADDRESS leak, PROJECT_SECRET rotation)
- Pitfall 7 invariant ("never silently drop") proven by the warm-up integration test — queued rows become sent on the next-day tick, NOT silently deleted
- 04-VALIDATION.md populated: 22 ✅ green engineering rows, 4 ⬜ pending operator UAT rows, all ALT-IDs traceable

## Task Commits

Each task committed atomically:

1. **Task 1: Drill script + .env.example** — `8a85f33` (feat)
2. **Task 2: Warm-up cap drill integration test** — `1285fb5` (test)
3. **Task 3: Operator runbook** — `195ac54` (docs)
4. **Tasks 4-7: Operator-only checkpoints** — documented in `docs/runbooks/email-deliverability.md` (committed in 195ac54); marked ⬜ pending operator in 04-VALIDATION.md
5. **Task 8: Populate Per-Task Verification Map + flip nyquist_compliant + Approval** — `3fc3a44` (docs)

## Files Created/Modified

### Created

- `scripts/email-tester-drill.ts` (316 lines) — production-shaped drill exercising the 4 templates (confirmation, hot-day, starting-to-run, unsubscribe-success) through buildEmail + sendUserEmail; --dry-run path; fail-closed env validation
- `scripts/_sveltekit-env-loader.mjs` (22 lines) — Node loader entrypoint registering the resolver via `module.register()`
- `scripts/_sveltekit-env-resolver.mjs` (35 lines) — resolve+load hooks synthesizing `$env/dynamic/private` as a process.env-backed Proxy
- `docs/runbooks/email-deliverability.md` (250 lines) — operator runbook: prerequisites + DMARC + mail-tester + real-mailbox + warmup-day-1 + +24h postmortem + recovery procedures + reference
- `tests/integration/alerts/warm-up-drill.test.ts` (231 lines) — 4 tests: week 1 (cap=50), week 2 (drain), post-warmup (cap=∞), unset (steady-state)

### Modified

- `.env.example` — appended Phase 4 section with PROJECT_SECRET, POSTAL_ADDRESS, RESEND_API_KEY, SUBSCRIBER_FROM_EMAIL, PUBLIC_BASE_URL, HOT_DAY_MIN_ANGLERS, WARMUP_START_DATE (commented; UNSET = no cap)
- `.planning/phases/04-email-alerts/04-VALIDATION.md` — Per-Task Verification Map populated for all 25 task rows across plans 01-08; Wave 0 Requirements all marked [x] with delivered file paths; Manual-Only Verifications table extended with Engineering Backing column; frontmatter `nyquist_compliant: true`, `status: signed-off`, `wave_0_complete: true`; **Approval:** approved 2026-04-29

## Decisions Made

See `key-decisions` in frontmatter. Two highlights:

1. **Avoided `dotenv` install** — used a Node-native `module.register()` loader instead. Zero new dependencies; the loader is < 60 lines total and mirrors the vitest shim pattern (single source of `$env/dynamic/private` semantics across vitest, scripts, and prod).
2. **Drill imports the production templates + send wrapper** — NOT a parallel sender. Every drill send exercises RFC 8058 headers + tracking-off + the multipart HTML+text composer, so a regression there trips the drill before it trips production traffic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan task 2 week-2 assertion expected the wrong sentFromStart count**

- **Found during:** Task 2 (warm-up cap drill integration test)
- **Issue:** The plan code asserts `expect(sentFromStart).toBe(10)` after the week-2 drain. With the actual dispatcher behavior (drainQueued runs before evaluators on the week-2 tick), the 50 originally-sent rows from `startDate` REMAIN with `trigger_date=startDate`, and the 10 queued rows from `startDate` are promoted to sent (also with `trigger_date=startDate`). So the correct count is 50 + 10 = 60, not 10.
- **Fix:** Changed assertion to `expect(sentFromStart).toBe(60)` and added a comment explaining the math. The intent of the assertion ("queued rows are NOT silently lost; they all become sent") is preserved — strengthened by also asserting `queuedFromStart === 0`.
- **Files modified:** `tests/integration/alerts/warm-up-drill.test.ts`
- **Verification:** All 4 tests in the drill pass; full suite (647 tests) green
- **Committed in:** `1285fb5`

### Operator-Only Checkpoints (Tasks 4-7)

Per the orchestrator's directive ("for tasks that are PURELY checklist items the operator must execute manually... document the procedure precisely in `docs/runbooks/email-deliverability.md` and mark them as 'OPERATOR ACTION REQUIRED' in 04-VALIDATION.md"):

- **Task 4 (DMARC DNS record):** runbook §1 — verbatim TXT value, dig command, mxtoolbox cross-check. 04-VALIDATION.md row `04-08-T4` marked `⬜ pending operator`.
- **Task 5 (Mail-Tester drill):** runbook §2 — `tsx --import ./scripts/_sveltekit-env-loader.mjs scripts/email-tester-drill.ts --to <mail-tester-address>`. Per-deduction remediation table. Row `04-08-T5` marked `⬜ pending operator`.
- **Task 6 (Real-mailbox drill):** runbook §3 — Gmail/iCloud/Outlook 7-check inbox checklist. Row `04-08-T6` marked `⬜ pending operator`.
- **Task 7 (First 50/day +24h postmortem):** runbook §5 — bounce>5% / complaint>0.3% halt thresholds + Resend dashboard review procedure. Row `04-08-T7` marked `⬜ pending operator`.

These are NOT deviations from plan; they are the plan's checkpoint contract. The orchestrator owns flipping `⬜ → ✅` after the operator types `approved` at each checkpoint resume signal.

## Validation Results

- `npx vitest run` (full suite): **647 tests passed** (38.93 s)
- `npx tsc --noEmit`: 0 errors introduced by this plan (pre-existing project-wide errors are unchanged from base 908a97e — verified via `git stash` baseline comparison)
- `tsx --import ./scripts/_sveltekit-env-loader.mjs scripts/email-tester-drill.ts` (no args): exit 1 with usage (verified the --to required-arg gate)
- `... --to test@example.com --dry-run --templates confirmation` (with PROJECT_SECRET + POSTAL_ADDRESS + PUBLIC_BASE_URL set): exit 0; renders confirmation template html+text
- `... --to test@example.com --dry-run --templates confirmation` (env unset): exit 2 with `error: missing required env: PROJECT_SECRET, POSTAL_ADDRESS, PUBLIC_BASE_URL`
- `tests/integration/alerts/warm-up-drill.test.ts`: 4/4 tests pass (week 1 cap=50, week 2 drain to cap=200, post-warmup cap=∞, unset cap=∞)
- `docs/runbooks/email-deliverability.md`: 9 `^## ` sections (>=7 required); 2 `_dmarc.fishcount.app`, 4 `tsx scripts/email-tester-drill.ts` invocations, 3 `(bounce|complaint).*rate`, 1 `5%`, 1 `0.3%`, 4 `9.0`, 7 `WARMUP_START_DATE`, 2 `p=none`, 4 `POSTAL_ADDRESS|home address` (all acceptance criteria pass)
- `04-VALIDATION.md`: 25 plan rows, 22 ✅ green (acceptance criterion was ≥15), 4 ⬜ pending operator (acceptance criterion was exactly 4 — exact match), `nyquist_compliant: true`, `Approval: approved 2026-04-29`

## DMARC TXT record (verbatim, for operator reference)

```
v=DMARC1; p=none; rua=mailto:dmarc-reports@fishcount.app; pct=100; adkim=s; aspf=s
```

(Operator adds this to DNS provider per runbook §1; verifies via `dig TXT _dmarc.fishcount.app +short` + mxtoolbox.)

## Mail-Tester scores recorded per template

⬜ pending operator (Task 5). Operator records:
- confirmation: __ / 10
- hot-day: __ / 10
- starting-to-run: __ / 10
- unsubscribe-success: __ / 10

Floor: 9.0 per template.

## Real-mailbox drill outcomes per provider

⬜ pending operator (Task 6). Operator records:
- Gmail: __ (4/4 templates pass 7-check inbox checklist?)
- iCloud: __
- Outlook: __

## First 50/day batch outcome

⬜ pending operator (Task 7, +24h after `WARMUP_START_DATE` set). Operator records:
- Total sent: __ (≤ 50)
- Bounce rate: __ % (halt if > 5)
- Complaint rate: __ % (halt if > 0.3)
- Open count: __ (must be 0; non-zero = tracking-disabled regression — investigate)
- Decision: continue / halt / remediate

## nyquist_compliant flip + Approval ISO date

- `nyquist_compliant: false` → `true` flipped 2026-04-29 (this plan)
- `Approval: pending` → `Approval: approved 2026-04-29` (engineering close)
- Operator UAT close date: __ (recorded post-+24h-postmortem completion)

## Self-Check: PASSED

- All 4 created files exist on disk in the worktree:
  - `scripts/email-tester-drill.ts` ✓
  - `scripts/_sveltekit-env-loader.mjs` ✓
  - `scripts/_sveltekit-env-resolver.mjs` ✓
  - `docs/runbooks/email-deliverability.md` ✓
  - `tests/integration/alerts/warm-up-drill.test.ts` ✓
- All 4 commits exist in `git log`:
  - `8a85f33` (Task 1) ✓
  - `1285fb5` (Task 2) ✓
  - `195ac54` (Task 3) ✓
  - `3fc3a44` (Task 8) ✓
- 04-VALIDATION.md frontmatter shows `nyquist_compliant: true` ✓
- 04-VALIDATION.md Approval line shows `approved 2026-04-29` ✓
- Full test suite green (647 passed) ✓
- No new TypeScript errors introduced (verified vs base 908a97e) ✓
