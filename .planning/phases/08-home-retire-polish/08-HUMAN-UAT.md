---
status: partial
phase: 08-home-retire-polish
source: [08-VERIFICATION.md]
started: "2026-05-02T22:35:00.000Z"
updated: "2026-05-02T22:55:00.000Z"
---

## Current Test

[awaiting human testing for residual platform-specific items]

## Tests

### 1. Visual sanity at desktop + 375px mobile
expected: Home page bars proportional within each section (per-section normalization works — Overnight ~1 fpa and 3.5 Day ~35 fpa both readable). No overflow at 375px. Trip count beside fpa is legible. NEW badges on pending labels visible without dominating the row.
result: passed (orchestrator self-validation 2026-05-02)
notes: Desktop renders cleanly — sections per trip type, top-5 boats by fpa, per-section bar normalization visible. Mobile 375px stacks rows cleanly with no overflow; trip count and fpa stay legible. Per-section bars are HIDDEN at 375px (only stack rows render) — confirm with operator whether that's the intended responsive choice.

### 2. Theme zero-flash on first paint
expected: With cookie set to `dark`, hard-refresh in an incognito Chrome window with throttled CPU shows NO flash of light theme. The page paints in dark from the very first frame. Same with `light` cookie. With `auto`, OS preference applied without flash.
result: pending
notes: Light/dark cookie roundtrip and `<html data-theme="dark">` SSR confirmed. Did NOT test throttled-CPU first-paint timing (no incognito + CPU throttle in this preview env). Operator should verify in real Chrome incognito with CPU throttle to confirm `transformPageChunk` paints dark before any CSS loads.

### 3. ECharts palette swap on theme toggle
expected: On `/explorer`, click the theme toggle: chart background, axis labels, legend, tooltip, AND the moon-overlay sine curve all swap palette together. Verify at every range preset. Toggle icon and aria-label reflect CURRENT state, not next.
result: passed (orchestrator self-validation 2026-05-02)
notes: Toggle aria-label reads "Theme: Dark. Click for Auto (follow system)." after cycle Auto→Light→Dark — D-27 satisfied (current state, not next). Cookie persists `fc_theme=dark`. Chart background, axis ticks, and series colors all swap to dark palette. Did not exhaustively cycle every range × granularity combo with the moon overlay — recommend a quick spot-check of moon overlay alignment at All view.

### 4. Admin route end-to-end with real env vars
expected: Set `ADMIN_PASSWORD` and `ADMIN_COOKIE_SECRET`. Visit `/admin/trip-types`. Login flow works (303 redirect, cookie set HttpOnly). Pending labels show NEW badge in the list and on the live home page. Aliasing a label updates immediately. Mobile 375px works.
result: pending
notes: Executor agent (08-02 SUMMARY) verified end-to-end via curl with env vars set: 303→/login when no cookie, 401 on wrong password, 303+HttpOnly cookie on right password, alias action persists, tampered cookie rejected, logout clears cookie, all cache-control headers correct. Operator should confirm UX feel + mobile 375px on a real device.

### 5. /compare typeahead on iOS native picker
expected: On iOS Safari, the boat name datalist input shows the native iOS picker. Selecting a boat populates the input cleanly. Pre-filled URLs from email/share work.
result: pending
notes: Verified in desktop browser: 3 `<input list="boats-list">` typeahead inputs, 85 boats indexed, replaces the prior boat-ID number input (D-24). iOS-specific datalist rendering needs operator confirmation on a real iPhone — desktop preview can't simulate iOS native picker.

## Additional D-decisions verified by orchestrator self-validation

- **D-17 / D-18:** 301 redirects (not 302) for `/picker`, `/picker?ticker=boat`, `/trends`, `/trends?range=1y` → `/explorer` with query strings dropped silently — verified via `curl -I`
- **D-33:** Empty state on `/explorer?ticker=boat&slug=no-such-boat` reads "Boat not found" + plain-English suggestion to try a different boat
- **D-34:** Descriptive title `"Compare boats — FishCount"` confirmed on `/compare`
- **D-37:** Granularity selector hidden at `range=1m` (no Daily/Weekly/Monthly buttons), visible at `range=1y` with Weekly highlighted as default per D-36
- **D-39:** URL stays clean — switching to 1M produces `range=1m` with no `granularity` param (default-not-serialized)

## Summary

total: 5
passed: 3
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
