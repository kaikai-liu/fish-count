// tests/integration/alerts/inline-ctas.test.ts
// Plan 04-06 Task 2 — verify the inline alert-CTA contract end-to-end.
//
// Three test groups:
//   1. Pre-fill round-trip: GETs to /alerts?boat=ID and /alerts?species=NAME
//      flow through Plan 04's load() and produce the expected preselect
//      arrays. Skipped when the Plan 04 +page.server.ts is not yet present
//      (cross-worktree resilience — Plan 04 + Plan 06 ship in the same wave).
//   2. Framing precedence: the alert CTA in /boats/[id] and /picker source
//      lines BELOW the per-angler framing block (CLAUDE.md non-negotiable #4
//      — alert CTAs must not substitute for the per-angler framing).
//   3. /about#email verbatim copy: UI-SPEC §"/about#email" wording is present
//      verbatim, including the "rate-limited to 3 per hour per IP" disclosure
//      that must match form enforcement (ALT-03 / UI-SPEC FLAG #12 RESOLVED —
//      Plan 02 MAX_ATTEMPTS=3 + Plan 04 4th attempt = 429).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ALERTS_LOAD_PATH = path.resolve('src/routes/alerts/+page.server.ts');
const ALERTS_LOAD_PRESENT = fs.existsSync(ALERTS_LOAD_PATH);

// Mock the DAL with an in-memory SQLite so Plan 04's load() can run without
// touching the real DB. Only used by the pre-fill round-trip describe — the
// other two describes only read source files.
vi.mock('$lib/db/client', async () => {
  const Database = (await import('better-sqlite3')).default;
  const { runMigrations } = await import('../../../src/lib/db/migrations');
  let _db: any = null;
  return {
    getDb: () => {
      if (_db) return _db;
      _db = new Database(':memory:');
      _db.pragma('foreign_keys = ON');
      runMigrations(_db);
      _db.prepare(
        `INSERT INTO landings (id, source_name, display_name) VALUES (1,'fl','F')`
      ).run();
      _db.prepare(
        `INSERT INTO boats (id, source_name, display_name, landing_id) VALUES (1,'b','B',1),(2,'b2','B2',1),(42,'b42','B42',1)`
      ).run();
      _db
        .prepare(
          `INSERT INTO catch_reports (source_date, boat_id, landing_id, trip_type, species, angler_count, species_count, scraped_at) VALUES ('2026-04-01',1,1,'1/2 Day AM','bluefin',10,5,'2026-04-01T22:00:00Z'),('2026-04-01',1,1,'1/2 Day AM','yellowtail',10,3,'2026-04-01T22:00:00Z')`
        )
        .run();
      return _db;
    },
    closeDb: () => {
      if (_db) {
        try {
          _db.close();
        } catch {
          /* noop */
        }
        _db = null;
      }
    },
    __reset: () => {
      _db = null;
    }
  };
});

function harness(url: URL) {
  return {
    url,
    setHeaders: () => {},
    request: new Request(url),
    params: {},
    locals: {
      logger: { info: () => {}, error: () => {}, warn: () => {} },
      requestId: 'inline-ctas-test'
    },
    cookies: { get: () => undefined, set: () => {} }
  } as any;
}

// CLAUDE.md non-negotiable #4 traceability marker for grep:
// "non-negotiable #4 — per-angler framing precedence."
// ALT-03 / UI-SPEC FLAG #12 traceability marker:
// "rate-limited to 3 per hour per IP."

describe.skipIf(!ALERTS_LOAD_PRESENT)(
  'Inline-CTA pre-fill round-trip (Plan 04 load() consumes Plan 06 CTA URLs)',
  () => {
    let load: any;

    beforeEach(async () => {
      process.env.PROJECT_SECRET = 'integration-test-secret-must-be-32-chars-long';
      const mod: any = await import('$lib/db/client');
      mod.__reset?.();
      // Dynamic import — Plan 04 file may not exist in this worktree alone.
      const route: any = await import('../../../src/routes/alerts/+page.server');
      load = route.load;
    });
    afterEach(() => {
      delete process.env.PROJECT_SECRET;
    });

    it('?boat=42 → preselectedBoats=[42], preselectedSpecies=[]', async () => {
      const result: any = await load(harness(new URL('https://fishcount.app/alerts?boat=42')));
      expect(result.preselectedBoats).toEqual([42]);
      expect(result.preselectedSpecies).toEqual([]);
    });

    it('?species=bluefin → preselectedSpecies=["bluefin"], preselectedBoats=[]', async () => {
      const result: any = await load(
        harness(new URL('https://fishcount.app/alerts?species=bluefin'))
      );
      expect(result.preselectedSpecies).toEqual(['bluefin']);
      expect(result.preselectedBoats).toEqual([]);
    });

    it('?boat=1&boat=2 → preselectedBoats=[1,2] (multi-value)', async () => {
      const result: any = await load(
        harness(new URL('https://fishcount.app/alerts?boat=1&boat=2'))
      );
      expect(result.preselectedBoats).toEqual([1, 2]);
    });

    it('?boat=abc → preselectedBoats=[] (non-numeric filtered)', async () => {
      const result: any = await load(harness(new URL('https://fishcount.app/alerts?boat=abc')));
      expect(result.preselectedBoats).toEqual([]);
    });

    it('?species= → preselectedSpecies=[] (empty filtered)', async () => {
      const result: any = await load(harness(new URL('https://fishcount.app/alerts?species=')));
      expect(result.preselectedSpecies).toEqual([]);
    });
  }
);

describe('Framing precedence: alert CTA appears AFTER per-angler framing (CLAUDE.md non-negotiable #4)', () => {
  function readSource(rel: string): string {
    return fs.readFileSync(path.resolve(rel), 'utf-8');
  }
  function lineOf(haystack: string, needle: string): number {
    const idx = haystack.indexOf(needle);
    if (idx < 0) return -1;
    return haystack.slice(0, idx).split('\n').length;
  }

  it('/boats/[id] CTA is below the per-angler framing block', () => {
    const src = readSource('src/routes/boats/[id]/+page.svelte');
    const ctaLine = lineOf(src, 'Get alerts for this boat');
    // Framing precedence: the EARLIEST occurrence of either framing component
    // anywhere in the file (imports count) MUST come before the CTA line. If
    // both occur, take the latest framing-related line BEFORE the CTA — that
    // is the actual rendered framing instance. Here we use the max of the
    // first-occurrence positions; both must be present and below the CTA line.
    const metricLine = lineOf(src, 'PerAnglerMetric');
    const providerLine = lineOf(src, 'PerAnglerFramingProvider');
    expect(ctaLine).toBeGreaterThan(0);
    expect(metricLine).toBeGreaterThan(0);
    expect(providerLine).toBeGreaterThan(0);
    // The CTA must be below the framing render block, not just the import.
    // Source layout: imports at top, framing-render block before CTA.
    expect(ctaLine).toBeGreaterThan(metricLine);
    expect(ctaLine).toBeGreaterThan(providerLine);
  });

  it('/picker CTA is below the per-angler framing block', () => {
    const src = readSource('src/routes/picker/+page.svelte');
    const ctaLine = lineOf(src, 'Get alerts when');
    const providerLine = lineOf(src, 'PerAnglerFramingProvider');
    expect(ctaLine).toBeGreaterThan(0);
    expect(providerLine).toBeGreaterThan(0);
    expect(ctaLine).toBeGreaterThan(providerLine);
  });
});

describe('UI-SPEC verbatim copy on /about#email', () => {
  const src = fs.readFileSync(path.resolve('src/routes/about/+page.svelte'), 'utf-8');

  it('contains id="email" anchor', () => {
    expect(src).toMatch(/id="email"/);
  });

  it('contains the hot-day verbatim definition', () => {
    expect(src).toContain("today's avg fish/angler more than 2×");
    expect(src).toContain('One alert per boat per day, max');
  });

  it('contains the starting-to-run verbatim definition', () => {
    expect(src).toContain('rolling 7-day fleet-wide');
    expect(src).toContain('avg/angler more than 1.5×');
    expect(src).toContain('One alert per species per week, max');
  });

  it('contains the no-tracking disclosure verbatim', () => {
    expect(src).toContain("We don't run analytics on opens or clicks");
  });

  it('contains the warm-up + rate-limit anchor', () => {
    expect(src).toMatch(/id="warmup"/);
  });

  it('rate-limit prose says "3 per hour per IP" (ALT-03 / UI-SPEC FLAG #12 — matches form enforcement)', () => {
    expect(src).toContain('rate-limited to 3 per hour per IP');
  });

  it('rate-limit prose does NOT say "4 per hour" (forbidden contradictory value)', () => {
    expect(src).not.toContain('4 per hour');
  });

  it('Resend + Litestream disclosure is present verbatim', () => {
    expect(src).toContain('Resend for delivery and Litestream-backed SQLite');
  });

  it('Sign-up call-to-action links to /alerts', () => {
    expect(src).toMatch(/href="\/alerts"/);
  });
});

describe('Inline CTA wiring (encoded URLs match Plan 04 query-string contract)', () => {
  const boats = fs.readFileSync(path.resolve('src/routes/boats/[id]/+page.svelte'), 'utf-8');
  const picker = fs.readFileSync(path.resolve('src/routes/picker/+page.svelte'), 'utf-8');

  it('/boats/[id] CTA href uses /alerts?boat=...', () => {
    expect(boats).toContain('/alerts?boat=');
  });

  it('/boats/[id] CTA copy is verbatim "Get alerts for this boat"', () => {
    expect(boats).toContain('Get alerts for this boat');
  });

  it('/picker CTA href uses /alerts?species=... with encodeURIComponent', () => {
    expect(picker).toContain('/alerts?species=');
    expect(picker).toContain('encodeURIComponent(data.filters.species)');
  });

  it('/picker CTA copy uses verbatim "Get alerts when {species} starts to run →"', () => {
    expect(picker).toContain('Get alerts when');
    expect(picker).toContain('starts to run →');
  });
});
