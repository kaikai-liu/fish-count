---
status: partial
phase: 07-moon-phase-overlay
source: [07-VERIFICATION.md]
started: 2026-05-01T21:18:00Z
updated: 2026-05-01T21:25:00Z
---

## Current Test

[awaiting human testing — items 5 and 7 only]

## Tests

### 1. Moon toggle adds 36px sine-curve row flush below catch chart
expected: Click "Moon" toggle on /explorer; URL becomes /explorer?ticker=boat&slug=...&range=1y&moon=1; second chart row visible immediately below catch chart with no gap; sine curve has thin slate line + light shading; toggle button shows accent (filled) state
result: passed (browser-verified by Claude via preview tools — URL gained `&moon=1`, aria-checked=true, second canvas height exactly 36px, button bg `rgb(30, 64, 175)` accent + white text)

### 2. Moon row repositions on range change with no extra network request
expected: With moon on, click 3M → 1M → 6M; both charts update in same SvelteKit navigation tick; no flicker; no extra HTTP request in DevTools (loader recomputes server-side, all in SSR response); moon row stays vertically aligned with catch chart x-axis at every step
result: passed (browser-verified — clicking 3M triggered ONE `__data.json?...&range=3m&moon=1` request that piggybacks moon + catch data on the loader response. No separate moon API endpoint. Both charts re-rendered with correct heights [280, 36])

### 3. ?moon=1 persists across cross-axis ticker switches (boat → species → landing)
expected: Each ticker switch preserves ?moon=1 in the URL; moon row continues to render aligned with the new chart's x-axis; moon toggle remains in "on" (accent-filled) state
result: passed (browser-verified — switching from `?ticker=boat&slug=new-seaforth` to `?ticker=species` preserved `&moon=1`; both canvases continued rendering at [280, 36])

### 4. Off-state drops moon param + row with no leftover artifacts
expected: Clicking Moon to turn off removes the moon param entirely from the URL; the 36px row disappears completely (no hidden div, no 0-height placeholder, no separator); page below catch chart looks byte-identical to Phase 6
result: passed (browser-verified — URL has no `moon=` substring at all (clean URL, not even `moon=0`); DOM canvas count went 2 → 1; aria-checked=false)

### 5. Keyboard accessibility — tab order, focus ring, screen reader announcement
expected: Tab order matches UI-SPEC §Accessibility Contract position 3-m (between last range button and from-date input when range=custom); 4px accent focus ring visible; VoiceOver/NVDA announces "switch, Show moon phases, on/off"; Space/Enter toggles moon
result: pending (Claude verified DOM contract: `role="switch"`, `aria-label="Show moon phases"`, `aria-checked` reflects state, `tabindex=0`. Runtime announcement by VoiceOver/NVDA still requires assistive-tech testing on macOS or Windows.)

### 6. Mobile responsive at 375px wraps Moon toggle below RangeStrip
expected: RangeStrip and MoonToggle stack vertically with 8px gap on mobile; toggle is min-44px tall touch target; on ≥768px desktop, toggle sits inline to the right of RangeStrip with 8px gap
result: passed (browser-verified — at 375px viewport: moon button below last range button (mt-2), 44px height confirmed; at 1280px viewport: moon inline-right with exactly 8px horizontal gap)

### 7. 5Y / All range fuzzy band with lttb sampling
expected: Per UI-SPEC D-06: at long ranges with monthly buckets, the sine becomes near-flat / fuzzy. Honest resolution-loss behavior, not a bug. No fake smoothing, no visible artifacts at year boundaries
result: pending (subjective visual judgment — operator should confirm "looks honest, not broken" at 5Y and All)

## Summary

total: 7
passed: 5
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
