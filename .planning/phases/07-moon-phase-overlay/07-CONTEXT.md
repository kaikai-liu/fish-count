# Phase 7: Moon-phase Overlay - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

A toggle on the explorer that draws a moon-phase visualization on the chart's
time axis so anglers can eyeball whether catch days line up with new / first-
quarter / full / last-quarter moons.

In scope (from ROADMAP Phase 7 + MOON-01..03):
- A user-controlled toggle that shows/hides the moon overlay on the explorer
- Moon-phase visualization on the time axis, computed deterministically from
  the date (no API call, no DB column)
- Markers stay correctly positioned across all range presets (1M / 3M / 6M /
  1Y / 2Y / 5Y / All / custom) and across all three tickers (boat / species /
  landing) — no extra page load or API call when range or ticker changes
- With the overlay off, the chart renders identically to Phase 6 (no leftover
  artifacts)

Out of scope:
- Anything beyond visual overlay — no aggregates "by moon phase," no
  "moon-correlation" stats, no predictions
- Persisting the toggle in user preferences server-side (separate scope)

</domain>

<decisions>
## Implementation Decisions

### Visual style — moon-illumination sine curve below the chart
- **D-01:** The overlay is a smooth sine curve representing moon illumination
  over time. Peaks = full moon, troughs = new moon. The four quarter phases
  are *inferred from the curve* (peak = full, trough = new, ascending zero-
  crossing = first quarter, descending zero-crossing = last quarter) — they
  are NOT drawn as separate marker glyphs.
- **D-02:** The curve lives in its own row **below** the main catch chart,
  approximately 30–40px tall. It does NOT overlay the catch line and does
  NOT share the catch chart's y-axis. The two charts share an x-axis (same
  time domain, same bucket alignment).
- **D-03:** The curve is rendered with a thin line plus low-opacity area
  shading (fill under the curve, or between the curve and a midline — exact
  shading geometry is Claude's discretion at planning time).
- **D-04:** Full and new are the visually loudest points by virtue of being
  the curve's extrema (peak/trough). Quarters are quieter — the curve simply
  crosses through midline, no extra emphasis. This satisfies the "full and
  new stand out, quarters muted" intent without drawing four separate marker
  styles.

### Mobile behavior
- **D-05:** Mobile (< 768px, 280px chart height) shows the **same** moon-row
  density as desktop. No phase-dropping, no range-thresholded hiding. The
  sine row is ~30–40px regardless of viewport.

### Long-range degradation
- **D-06:** At 5Y / All ranges on monthly buckets, the curve naturally
  squashes to a near-flat fuzzy band. **Accept that.** No auto-dim, no
  range-conditional hiding, no smoothing kicks in. Anglers looking at 5Y
  ranges aren't moon-watching at the daily level; the band is honest about
  resolution loss.

### Computation
- **D-07:** Moon phases (or moon illumination fraction) are computed
  deterministically from the date, in TypeScript, in `src/lib/shared/`
  alongside `dates.ts`. No external API. No new DB column. No package
  dependency unless the audit shows the bundle/correctness tradeoff is
  worth it (Claude's discretion at planning — a 30-line custom Conway-style
  algorithm is acceptable; so is a small library if it's tiny).

### Claude's Discretion
The following are explicitly delegated to Claude at planning time. The user
trusts these to follow Phase 6 patterns:

- **Color of the sine curve and shading.** Pick for accessibility (contrast
  against `--color-surface-muted` chart background, color-blind safety).
  Reuse existing palette tokens (`--color-text-muted`, `--color-border-strong`,
  or a low-opacity tint of an existing accent) before introducing a new color.
- **Toggle placement.** Most likely in `ExplorerHeader.svelte` adjacent to
  the range strip; alternative is a chart-row checkbox near the new sine
  row. Pick what's cleanest given the existing header layout.
- **URL state persistence.** Default to YES (consistent with Phase 6's
  share-the-chart URL pattern — `ExplorerFiltersSchema` should gain a
  `moon: boolean` field). Off by default.
- **Tooltip integration.** When the angler hovers a bucket on the catch
  chart, whether the tooltip surfaces the moon phase that fell in that
  bucket is Claude's call. Default: don't add complexity unless the
  presentation feels incomplete without it.
- **Sub-chart implementation.** Two reasonable approaches: (a) a second
  small `Chart.svelte` instance below the main one with a synced x-axis,
  or (b) extend the existing chart's grid with a second sub-grid below for
  the moon row. Pick whichever causes less ECharts plumbing.
- **Resolution of the sine.** Daily samples (one point per day across the
  visible range) is fine. Higher resolution offers no readability gain.

### Folded Todos
None — no pending todos matched Phase 7 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Vision, scope, and requirements
- `.planning/PROJECT.md` — v2 vision, "trust the audience" principle, moon-
  phase overlay listed as a target v2 feature
- `.planning/REQUIREMENTS.md` §MOON — MOON-01 (toggle on/off), MOON-02 (four
  quarter phases shown via markers — note D-01 satisfies this via continuous
  sine where the quarters are visually present as zero-crossings, not glyphs),
  MOON-03 (deterministic from date, no API/DB)
- `.planning/ROADMAP.md` §"Phase 7: Moon-phase Overlay" — goal + 3 success
  criteria (toggle works, markers reposition on range/ticker change without
  re-fetch, off-state is identical to Phase 6)
- `CLAUDE.md` — "trust the audience" framing; show data, let anglers judge

### Phase 6 carry-forward (the foundation this overlay attaches to)
- `.planning/phases/06-explorer-foundation/06-CONTEXT.md` — explorer
  architecture, URL state schema, chart conventions
- `src/lib/components/Chart.svelte` — ECharts dynamic-import wrapper. Read
  before extending. Key constraints: ~800KB ECharts must stay out of SSR
  bundle (dynamic import), reduced-motion honored, ariaLabel required,
  tooltipFormatter passed client-side because functions don't survive SSR
  serialization.
- `src/routes/explorer/+page.svelte` — current explorer page; renders the
  chart, holds the form state, navigates on filter change
- `src/routes/explorer/+page.server.ts` — loader: parses URL via Zod,
  resolves cross-axis defaults, returns `chartOption`. Whatever moon-state
  the URL carries flows through here.
- `src/lib/components/ExplorerHeader.svelte` — sticky header with ticker
  pills, selector slot, and range strip. Most likely home of the moon toggle.
- `src/lib/shared/urlState.ts` — `ExplorerFiltersSchema` (Zod). Untrusted-
  input boundary. Adding `moon: boolean` follows the existing pattern.
- `src/lib/shared/dates.ts` — single date producer (`today()`, `addDays()`,
  PT canonical). Moon computation lives next to this.
- `src/lib/copy/metrics.ts` — canonical copy module pattern; moon-related
  copy (toggle label, aria-label, sub-chart caption) belongs in a copy
  module, not inlined.

### Architecture rules carrying forward (non-negotiable)
- **DAL boundary** — moon overlay does not touch the DAL (no DB column per
  MOON-03). Pure function in `src/lib/shared/`.
- **Date discipline** — moon math uses dates from `src/lib/shared/dates.ts`,
  in PT, `YYYY-MM-DD`. No ad-hoc `new Date()`.
- **Per-angler / domain language** — toggle copy uses plain English; no
  "lunar" jargon. "Moon phases" / "Show moon phases" matches the operator's
  voice in PROJECT.md and ROADMAP.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Chart.svelte` (`src/lib/components/`) — ECharts wrapper. The moon sub-
  chart can either be a second `<Chart>` instance with a small height (e.g.
  `height="36px"`) or an extension of the same chart's `grid` array. Either
  way, ECharts dynamic import is already wired and reduced-motion is honored.
- `ExplorerHeader.svelte` (`src/lib/components/`) — already holds the range
  strip and selector slot. Adding a checkbox/toggle here keeps the
  controls consolidated.
- `urlState.ts` (`src/lib/shared/`) — Zod-based URL parsing. The pattern
  `ExplorerFiltersSchema → parseExplorerFilters → serializeExplorerFilters`
  extends naturally to a `moon` boolean.
- `dates.ts` (`src/lib/shared/`) — `today()`, `addDays()`, `toPtTimeLabel()`.
  Use these for moon computation date inputs; never `new Date()`.
- `metrics.ts` (`src/lib/copy/`) — copy-constants pattern. A new
  `src/lib/copy/moon.ts` (or extension of `metrics.ts`) is the natural home
  for the toggle label and aria-label.

### Established Patterns
- **URL-as-state** — explorer state lives in the URL. Toggle persistence
  follows this; share-the-chart links carry moon state.
- **Loader-does-shape, DAL-stays-pure** — moon math is a pure function; the
  loader (`+page.server.ts`) calls it for the visible range and adds the
  resulting series to `chartOption`.
- **ECharts dynamic import** — must remain. Don't bundle ECharts (or any
  moon-related charting helper that pulls ECharts) into the SSR path.
- **Reactive on filter change** — Phase 6 ships chart re-render on form
  state change (D-19). Moon toggle slots into the same reactive flow.
- **Cache-Control discipline** — adding moon overlay should not change the
  cache headers; moon computation is cheap and deterministic.

### Integration Points
- `src/lib/shared/urlState.ts` — extend `ExplorerFiltersSchema` with
  `moon: boolean` (default `false`)
- `src/routes/explorer/+page.server.ts` — branch on `filters.moon`; when
  true, compute the moon series for the visible range and attach to the
  chart option (or a second chart option for the sub-row)
- `src/routes/explorer/+page.svelte` — render the moon row when
  `data.moonOption` (or whatever shape the loader returns) is present;
  pass through to a sub-`Chart.svelte` if approach (a) is chosen
- `src/lib/components/ExplorerHeader.svelte` — add the moon toggle (most
  likely a checkbox or pill); wire `onMoonChange` into the existing
  `navigate()` flow
- New file: `src/lib/shared/moon.ts` — pure moon-illumination /
  moon-phase function. Deterministic from a date. Tested.

</code_context>

<specifics>
## Specific Ideas

- **"A sine curve with shade"** — the operator's exact framing for the
  marker style. Continuous illumination wave, not discrete glyphs. Captures
  the feel of the lunar cycle as a smooth thing, not four checkpoints.
- **"Fuzzy band on long ranges is fine"** — explicit acceptance that the
  curve squashes to noise at 5Y/All on monthly buckets. Honest about
  resolution loss; no fake smoothing.
- **"Anglers reading 5Y aren't moon-watching"** — the rationale anchoring
  D-06. Moon overlay is a short-range exploration aid, not a long-range
  analysis tool.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 7 scope.

Items the planner / researcher should treat as **planner contingencies**
(decisions to be made during planning, not deferred to a later phase):

- **Specific palette token for the sine curve.** Defer to UI-SPEC / planning
  time. Default candidates: `--color-text-muted` line + low-opacity
  `--color-border-strong` shading.
- **Toggle copy.** "Moon phases" or "Show moon phases" — pick the shorter
  fit for the header.
- **Tooltip moon-phase line.** Add only if it doesn't bloat the existing
  tooltip; otherwise the visual is enough.
- **Library vs hand-rolled moon math.** Audit during research. A 30-line
  Conway-style algorithm is acceptable; so is a < 5KB library. Don't add a
  large astronomy package.

</deferred>

---

*Phase: 07-moon-phase-overlay*
*Context gathered: 2026-05-01*
