---
status: partial
phase: 08-home-retire-polish
source: [08-VERIFICATION.md]
started: "2026-05-02T22:35:00.000Z"
updated: "2026-05-02T22:35:00.000Z"
---

## Current Test

[awaiting human testing]

## Tests

### 1. Visual sanity at desktop + 375px mobile
expected: Home page bars proportional within each section (per-section normalization works — Overnight ~1 fpa and 3.5 Day ~35 fpa both readable). No overflow at 375px. Trip count beside fpa is legible. NEW badges on pending labels visible without dominating the row.
result: [pending]

### 2. Theme zero-flash on first paint
expected: With cookie set to `dark`, hard-refresh (Cmd-Shift-R) in an incognito Chrome window with throttled CPU shows NO flash of light theme. The page paints in dark from the very first frame. Same with `light` cookie. With `auto`, OS preference applied without flash.
result: [pending]

### 3. ECharts palette swap on theme toggle
expected: On `/explorer`, click the theme toggle: chart background, axis labels, legend, tooltip, AND the moon-overlay sine curve all swap palette together. Verify at every range preset (1M / 3M / 6M / 1Y / 2Y / 5Y / All). Toggle icon and aria-label reflect CURRENT state, not next.
result: [pending]

### 4. Admin route end-to-end with real env vars
expected: Set `ADMIN_PASSWORD` and `ADMIN_COOKIE_SECRET`. Visit `/admin/trip-types`. Login flow works (303 redirect, cookie set HttpOnly). Pending labels show NEW badge in the list and on the live home page. Aliasing a label updates immediately. Mobile 375px works (operator may adjudicate from phone).
result: [pending]

### 5. /compare typeahead on iOS native picker
expected: On iOS Safari, the boat name datalist input shows the native iOS picker (or Apple's preferred fallback). Selecting a boat populates the input cleanly. Pre-filled URLs from email/share work.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
