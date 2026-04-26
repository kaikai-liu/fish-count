// tests/unit/scripts/forecast-benchmark.test.ts
// FCT-04 smoke tests for the benchmark script (D-19).
//
// Verifies:
//   1. --help returns 0 and prints usage
//   2. invalid --year value returns exit code 2
//   3. empty DB returns exit code 1 (no held-out data — gate fails honestly)
//   4. seeded DB writes Markdown report to the locked path and returns 0
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('scripts/forecast-benchmark.ts (FCT-04, D-19)', () => {
  let tmp: string;
  let originalDbPath: string | undefined;
  const REPORT_PATH = join(
    process.cwd(),
    '.planning/phases/03-forecast-layer/03-VALIDATION-BENCHMARK.md'
  );
  let originalReport: string | null = null;

  beforeEach(() => {
    originalDbPath = process.env.DB_PATH;
    tmp = mkdtempSync(join(tmpdir(), 'fc-forecast-benchmark-'));
    process.env.DB_PATH = join(tmp, 'test.sqlite3');
    if (existsSync(REPORT_PATH)) {
      originalReport = readFileSync(REPORT_PATH, 'utf8');
    } else {
      originalReport = null;
    }
    vi.resetModules();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      const { closeDb } = await import('../../../src/lib/db/client');
      closeDb();
    } catch {
      /* ignore */
    }
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    // Restore the original report file so the test does not leave the artifact
    // in an unexpected state for the operator.
    if (originalReport !== null) {
      writeFileSync(REPORT_PATH, originalReport, 'utf8');
    }
    if (originalDbPath !== undefined) {
      process.env.DB_PATH = originalDbPath;
    } else {
      delete process.env.DB_PATH;
    }
  });

  it('main(["--help"]) returns 0 and prints usage', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { main } = await import('../../../scripts/forecast-benchmark');
    const code = await main(['--help']);
    expect(code).toBe(0);
    const allLog = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allLog).toMatch(/Usage:/);
  });

  it('main(["--year=999"]) returns exit code 2 (invalid year)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { main } = await import('../../../scripts/forecast-benchmark');
    const code = await main(['--year=999']);
    expect(code).toBe(2);
  });

  it('main([]) on an empty DB returns exit code 1 (no held-out data)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { main } = await import('../../../scripts/forecast-benchmark');
    const code = await main(['--quiet']);
    expect(code).toBe(1);
  });

  it('seeded DB writes Markdown report to the locked path and returns 0', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getDb } = await import('../../../src/lib/db/client');
    const { seedBoat, seedTrip } = await import('../../helpers/seedTestDb');
    const db = getDb();
    const { boatId, landingId } = seedBoat(db, {
      boatName: 'Grande',
      landingName: 'Point Loma Sportfishing'
    });
    // Seed >= 8 prior-year (2024) trips on the same calendar slot so n>=5
    // cells in the held-out year (2025) clear the floor.
    for (let i = 0; i < 8; i++) {
      seedTrip(db, {
        boatId,
        landingId,
        date: `2024-05-${String(10 + i).padStart(2, '0')}`,
        tripType: 'Full Day',
        species: 'yellowtail',
        anglers: 20,
        count: 30
      });
    }
    // Seed at least one held-out year cell to evaluate.
    seedTrip(db, {
      boatId,
      landingId,
      date: '2025-05-15',
      tripType: 'Full Day',
      species: 'yellowtail',
      anglers: 20,
      count: 35
    });

    const { main } = await import('../../../scripts/forecast-benchmark');
    const code = await main(['--year=2025', '--quiet']);
    expect(code).toBe(0);
    expect(existsSync(REPORT_PATH)).toBe(true);
    const md = readFileSync(REPORT_PATH, 'utf8');
    expect(md).toContain('# Forecast Benchmark');
    expect(md).toContain('## Methodology');
    expect(md).toContain('## Point Estimate Accuracy');
    expect(md).toContain('## Prediction Interval Calibration');
    expect(md).toContain('## Conclusion');
    expect(md).toContain('Held-out year:** 2025');
  });
});
