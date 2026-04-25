// tests/unit/lint/per-angler-discipline.test.ts
// Phase 2 + CLAUDE.md non-negotiable #4: per-angler metric must always render
// through <PerAnglerMetric> AND every "fish/angler" / "per angler" string surface
// (chart axis labels, aria-labels, tooltips, headings) must come from the canonical
// constants module src/lib/copy/metrics.ts (Plan 02-02). The literal may NOT be
// inlined in any route or component file outside the 3 allowlisted files.
//
// ALLOWLIST (exactly 3 files):
//   1. src/lib/components/PerAnglerMetric.svelte — the component owns the visible string
//   2. src/routes/about/+page.svelte           — verbatim UI-SPEC copy explaining the metric
//   3. src/lib/copy/metrics.ts                  — constants module (single source of truth)
//
// Adding a 4th allowlisted file requires explicit justification in the SUMMARY.md
// for the plan that adds it.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = [
  join(ROOT, 'src', 'routes'),
  join(ROOT, 'src', 'lib', 'components'),
  join(ROOT, 'src', 'lib', 'copy') // include constants module in scan so it's explicitly allowlisted
];
const ALLOWLIST = new Set([
  join(ROOT, 'src', 'lib', 'components', 'PerAnglerMetric.svelte'),
  join(ROOT, 'src', 'routes', 'about', '+page.svelte'),
  join(ROOT, 'src', 'lib', 'copy', 'metrics.ts')
]);

function walk(dir: string, files: string[] = []): string[] {
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) walk(full, files);
      else if (full.endsWith('.svelte') || full.endsWith('.ts')) files.push(full);
    }
  } catch {
    // Tolerate missing directories (e.g., src/lib/copy not yet created)
  }
  return files;
}

// Patterns that are NOT violations (component references, imports, tags):
// - Import statements: `import PerAnglerMetric ...`
// - SVG/component tags: `<PerAnglerMetric`, `</PerAnglerMetric`, `<PerAnglerFramingProvider`
// - Comments: lines starting with // or * (after trim)
// Only the literal string used as display text matters — e.g. axis labels, tooltips, copy.
const SKIP_LINE_RE =
  /^\s*(\/\/|\/\*|\*|<!--|-->)|import\s+|<\/?PerAngler|setContext\(['"]per-angler/;

describe('per-angler discipline (CLAUDE.md non-negotiable #4)', () => {
  it('no "fish/angler" or "per angler" outside PerAnglerMetric, /about, and src/lib/copy/metrics.ts', () => {
    const violations: { file: string; line: number; text: string }[] = [];
    const re = /fish\s*\/\s*angler|per[\s-]?angler/i;
    for (const dir of SCAN_DIRS) {
      for (const f of walk(dir)) {
        if (ALLOWLIST.has(f)) continue;
        const lines = readFileSync(f, 'utf-8').split('\n');
        for (let i = 0; i < lines.length; i++) {
          // Skip comment lines and import/tag lines — only catch literal display strings
          if (SKIP_LINE_RE.test(lines[i])) continue;
          if (re.test(lines[i])) {
            violations.push({ file: f, line: i + 1, text: lines[i].trim() });
          }
        }
      }
    }
    if (violations.length > 0) {
      console.error('PER-ANGLER DISCIPLINE VIOLATIONS:');
      for (const v of violations)
        console.error(`  ${v.file}:${v.line}  ${v.text}`);
    }
    expect(violations).toEqual([]);
  });

  it('the constants module exists and exports the expected canonical strings', () => {
    const metricsFile = readFileSync(join(ROOT, 'src', 'lib', 'copy', 'metrics.ts'), 'utf-8');
    for (const expected of [
      'FISH_PER_ANGLER_AXIS',
      'FISH_PER_ANGLER_ARIA',
      'FISH_PER_ANGLER_TOOLTIP_UNIT',
      'WEEKLY_FISH_PER_ANGLER_HEADING',
      'BEST_DAY_UNIT',
      'HEATMAP_LEGEND_HIGH'
    ]) {
      expect(metricsFile, `Missing export: ${expected}`).toMatch(
        new RegExp(`export const ${expected}`)
      );
    }
  });
});
