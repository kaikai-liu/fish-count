# Phase 7: Moon-phase Overlay - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-01
**Phase:** 07-moon-phase-overlay
**Mode:** discuss
**Areas discussed:** Visual style

---

## Gray-area selection

User selected one area to discuss out of four offered:

| Option | Description | Selected |
|--------|-------------|----------|
| Visual style | How moon phases appear on the chart — vertical lines, background shading, or icons on the time axis | ✓ |
| Which phases shown | All four quarters, or just full + new, or all four with full/new emphasized | |
| Long-range density | Cap density on long ranges, switch to full-only, or accept the visual density | |
| Toggle placement & URL state | Where the toggle lives and whether it persists in the share URL | |

**Rationale for narrow selection:** Phase scope is small. Operator delegated the unselected areas to Claude's discretion via planning defaults.

---

## Visual style

### Marker type

| Option | Description | Selected |
|--------|-------------|----------|
| Vertical lines (Recommended) | Thin lines at each moon-phase date via ECharts markLine | |
| Background shading bands | Light shaded vertical bands centered on each phase via ECharts markArea | |
| Icons on the axis | Small moon icons below the time axis labels | |
| **Other (free-text)** | **"a sine curve with shade"** | ✓ |

**User's choice:** Continuous sine curve representing moon illumination
over time, with low-opacity shading.

**Follow-up clarification (plain text):**
- Where does the curve live vertically? → **Below the chart, in its own row**
- Long-range degradation behavior? → **Accept the fuzzy band at 5Y / All —
  anglers reading long ranges aren't moon-watching at the daily level**

### Phase differentiation

| Option | Description | Selected |
|--------|-------------|----------|
| Full and new stand out, quarters muted (Recommended) | Visual hierarchy — full + new are bold, quarters quieter | ✓ |
| All four phases visually identical | One color, one weight | |
| All four distinct | Four different visual treatments | |

**User's choice:** Full and new stand out; quarters muted.
**Notes:** With the sine-curve direction, this is satisfied automatically
— peaks and troughs are loud by virtue of being extrema; quarters are just
zero-crossings through the midline.

### Color

| Option | Description | Selected |
|--------|-------------|----------|
| Muted gray, low opacity (Recommended) | Sits behind the catch line; uses --color-border-strong or --color-text-muted | |
| A distinct accent color | Soft blue or similar, signals "moon stuff" | |
| You decide | Claude picks for accessibility (contrast, color-blind safety) | ✓ |

**User's choice:** You decide (Claude's discretion).
**Notes:** Decision deferred to planning/UI-SPEC. Default candidates: muted
existing palette tokens, no new color introduced.

### Mobile density

| Option | Description | Selected |
|--------|-------------|----------|
| Same markers, same density (Recommended) | Mobile sees what desktop sees | ✓ |
| Drop quarter phases on mobile | Reduce clutter; means viewport-dependent visuals | |
| Hide markers entirely below 6M on mobile | Conservative density-based gating | |

**User's choice:** Same markers, same density on mobile.

---

## Wrap-up gate

| Option | Description | Selected |
|--------|-------------|----------|
| Wrap up — ready for context (Recommended) | Phase scope small; sine-curve direction answers other areas naturally | ✓ |
| Discuss toggle placement & URL state | Lock down toggle location and URL persistence | |
| Discuss long-range density | Lock the exact behavior | |

**User's choice:** Wrap up.

---

## Claude's Discretion

Areas user delegated to Claude (in addition to the unselected gray areas):

- Color of the sine curve and shading
- Toggle placement in the explorer (likely ExplorerHeader.svelte adjacent
  to range strip)
- URL state persistence (planning default: yes, consistent with Phase 6
  share-the-chart pattern)
- Tooltip integration (planning default: don't add unless required)
- Sub-chart implementation approach — second `Chart.svelte` instance vs
  ECharts grid extension
- Resolution of the sine — daily samples are fine, no need to go finer
- Whether to use a small library or hand-roll the moon-illumination math

## Deferred Ideas

None — discussion stayed within phase scope. Unselected gray areas were
explicitly delegated rather than deferred.
