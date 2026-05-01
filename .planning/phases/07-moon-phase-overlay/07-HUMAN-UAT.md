---
status: partial
phase: 07-moon-phase-overlay
source: [07-VERIFICATION.md]
started: 2026-05-01T21:18:00Z
updated: 2026-05-01T21:18:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Moon toggle adds 36px sine-curve row flush below catch chart
expected: Click "Moon" toggle on /explorer; URL becomes /explorer?ticker=boat&slug=...&range=1y&moon=1; second chart row visible immediately below catch chart with no gap; sine curve has thin slate line + light shading; toggle button shows accent (filled) state
result: [pending]

### 2. Moon row repositions on range change with no extra network request
expected: With moon on, click 3M → 1M → 6M; both charts update in same SvelteKit navigation tick; no flicker; no extra HTTP request in DevTools (loader recomputes server-side, all in SSR response); moon row stays vertically aligned with catch chart x-axis at every step
result: [pending]

### 3. ?moon=1 persists across cross-axis ticker switches (boat → species → landing)
expected: Each ticker switch preserves ?moon=1 in the URL; moon row continues to render aligned with the new chart's x-axis; moon toggle remains in "on" (accent-filled) state
result: [pending]

### 4. Off-state drops moon param + row with no leftover artifacts
expected: Clicking Moon to turn off removes the moon param entirely from the URL; the 36px row disappears completely (no hidden div, no 0-height placeholder, no separator); page below catch chart looks byte-identical to Phase 6
result: [pending]

### 5. Keyboard accessibility — tab order, focus ring, screen reader announcement
expected: Tab order matches UI-SPEC §Accessibility Contract position 3-m (between last range button and from-date input when range=custom); 4px accent focus ring visible; VoiceOver/NVDA announces "switch, Show moon phases, on/off"; Space/Enter toggles moon
result: [pending]

### 6. Mobile responsive at 375px wraps Moon toggle below RangeStrip
expected: RangeStrip and MoonToggle stack vertically with 8px gap on mobile; toggle is min-44px tall touch target; on ≥768px desktop, toggle sits inline to the right of RangeStrip with 8px gap
result: [pending]

### 7. 5Y / All range fuzzy band with lttb sampling
expected: Per UI-SPEC D-06: at long ranges with monthly buckets, the sine becomes near-flat / fuzzy. Honest resolution-loss behavior, not a bug. No fake smoothing, no visible artifacts at year boundaries
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
