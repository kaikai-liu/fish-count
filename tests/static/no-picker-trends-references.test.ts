// tests/static/no-picker-trends-references.test.ts
// Phase 8 Plan 03 (RTR-01, RTR-02, RTR-09 / D-22) — static-grep regression guard.
//
// Fails if any source/test/script file (outside .planning, milestones, and the
// summary docs) re-introduces references to the retired v1 surfaces:
//   - /picker, /picker/* — replaced by /explorer (301 redirect in hooks.server.ts)
//   - /trends, /trends/* — replaced by /explorer (301 redirect in hooks.server.ts)
//   - the forecast pipeline (recomputeForecasts, $lib/forecast/*, forecasts table)
//
// Why static-grep (not import-graph): some references live in comments and
// dead-code branches that wouldn't show in a type-graph; the visual literal
// "/picker" anywhere outside an excluded path is the regression signal.
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

function gitGrep(pattern: string, extraExcludes: string[] = []): string {
  const baseExcludes = [
    ":!.planning",
    ":!node_modules",
    ":!milestones",
    ":!**/*-SUMMARY.md",
    ":!CLAUDE.md", // historical "v1's trip picker, statistical forecasts… are retiring" framing
    ":!tests/static/no-picker-trends-references.test.ts" // self-reference
  ];
  const excludes = [...baseExcludes, ...extraExcludes];
  try {
    return execSync(
      `git grep -nE ${JSON.stringify(pattern)} -- ${excludes.map((e) => JSON.stringify(e)).join(' ')}`,
      { encoding: 'utf8' }
    );
  } catch (err) {
    // git grep exits 1 when no matches found — that's the desired path.
    const e = err as { status?: number; stdout?: string };
    if (e.status === 1) return '';
    throw err;
  }
}

describe('static-grep retirement guards (Phase 8 RTR-01/02/09)', () => {
  it('no /picker or /trends references survive in src/, tests/, scripts/', () => {
    // Allowed exceptions:
    //   - hooks.server.ts (the redirect handler IS allowed to mention /picker, /trends)
    //   - tests/integration/redirects.test.ts (the test that asserts the redirect)
    //   - tests/integration/phase2-routes.test.ts (the comment marker that v1 routes were retired here)
    const hits = gitGrep('/(picker|trends)', [
      ':!src/hooks.server.ts',
      ':!tests/integration/redirects.test.ts',
      ':!tests/integration/phase2-routes.test.ts',
      ':!src/lib/db/queries/trends.ts', // DAL still consumed by /compare
      ':!src/lib/db/queries/browse.ts', // historical comment about retired /picker default
      ':!src/routes/+layout.svelte', // header comment notes nav retired /picker /trends
      ':!src/routes/compare/+page.server.ts', // imports from queries/trends DAL
      ':!tests/unit/db/queries/trends.test.ts', // DAL tests for queries/trends
      ':!tests/unit/db/aliases-translation.test.ts', // historical comment
      ':!scripts/backfill.ts', // historical comment about retired forecast hook
      ':!scripts/seed-dev-db.ts' // historical comment about retired /trends, /picker, /heatmap surfaces
    ]);
    if (hits.trim() !== '') {
      // eslint-disable-next-line no-console
      console.error('\nUnexpected /picker or /trends references:\n' + hits);
    }
    expect(hits.trim()).toBe('');
  });

  it('no recomputeForecasts references survive', () => {
    // scheduler.test.ts legitimately mentions the removed symbol in describe/it
    // strings asserting its absence — that's the regression guard, not a leak.
    const hits = gitGrep('recomputeForecasts', [
      ':!tests/integration/scheduler.test.ts'
    ]);
    expect(hits.trim()).toBe('');
  });

  it('no $lib/forecast imports survive', () => {
    // scheduler.test.ts asserts the absence of $lib/forecast imports — its
    // describe/it text legitimately contains the path string.
    const hits = gitGrep('\\$lib/forecast', [
      ':!tests/integration/scheduler.test.ts'
    ]);
    expect(hits.trim()).toBe('');
  });

  it('forecast/heatmap survivors are limited to historical comments + the migration drop', () => {
    // forecast/heatmap can legitimately appear in:
    //   - migrations.ts (the DROP TABLE forecasts statement is the canonical retire)
    //   - migration tests (verify the DROP behavior)
    //   - scheduler.test.ts (asserts the absence of forecast imports)
    //   - historical comment markers in scrapeRuns.ts, scheduler.ts, copy/metrics.ts
    //   - app.css comment marker for the retired heatmap palette
    //   - PerAnglerMetric.svelte / about page comment markers
    //   - the redirects test + this test file itself
    //   - Chart.svelte comment marker about HeatmapChart removal
    //   - browse.ts and seed-dev-db.ts retire markers
    // What MUST NOT appear: a live `import` from $lib/forecast or a live forecasts-table query.
    const hits = gitGrep('import.*forecast|FROM forecasts|INTO forecasts|UPDATE forecasts', [
      ':!src/lib/db/migrations.ts',
      ':!tests/unit/db/migrations.test.ts',
      ':!tests/unit/db/migrations-aliases.test.ts',
      ':!tests/integration/scheduler.test.ts'
    ]);
    expect(hits.trim()).toBe('');
  });
});
