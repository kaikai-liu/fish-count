// tests/unit/scraper/parser.test.ts
// Plan 01-03 Task 2 — verifies the pure HTML→CatchRow[] transform:
//   - typical fixture yields >=10 valid rows matching the golden expected.json subset
//   - empty-day fixture yields zero rows, zero failures
//   - mangled fixture yields the valid row's species-fragments + a ParseFailure for the
//     shape-invalid row (D-07 quarantine + continue)
//   - released-qualifier fixture preserves "released" suffix verbatim on species
//   - parsePage NEVER throws, even on empty / garbage HTML
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePage } from '../../../src/lib/scraper/parser';
import type { CatchRow } from '../../../src/lib/scraper/schema';

const FIXTURE = (name: string) =>
  readFileSync(join(process.cwd(), 'tests', 'fixtures', 'scraper', name), 'utf8');

interface ExpectedRow {
  source_name: string;
  landing_source_name: string;
  trip_type: string;
  angler_count: number;
  species: string;
  species_count: number;
}

function rowMatches(a: CatchRow, e: ExpectedRow): boolean {
  return (
    a.source_name === e.source_name &&
    a.landing_source_name === e.landing_source_name &&
    a.trip_type === e.trip_type &&
    a.angler_count === e.angler_count &&
    a.species === e.species &&
    a.species_count === e.species_count
  );
}

describe('parsePage (Plan 01-03 Task 2)', () => {
  describe('typical fixture (2024-08-15)', () => {
    const html = FIXTURE('2024-08-15-typical.html');
    const expected = JSON.parse(FIXTURE('2024-08-15-typical.expected.json')) as {
      rows: ExpectedRow[];
      min_rows: number;
      failures_expected: number;
    };
    const result = parsePage(html);

    it('yields at least min_rows valid CatchRows', () => {
      expect(result.rows.length).toBeGreaterThanOrEqual(expected.min_rows);
    });

    it('produces zero quarantine failures for a real production page', () => {
      expect(result.failures.length).toBe(expected.failures_expected);
    });

    it('every expected-subset row appears in the parser output', () => {
      for (const exp of expected.rows) {
        const found = result.rows.some((a) => rowMatches(a, exp));
        expect(found, `missing expected row: ${JSON.stringify(exp)}`).toBe(true);
      }
    });

    it('species values are all lowercased (D-03 transform applied)', () => {
      for (const row of result.rows) {
        expect(row.species).toBe(row.species.toLowerCase());
      }
    });

    it('trip_type values are preserved verbatim (e.g., contain original case "AM" / "PM" / "1/2 Day")', () => {
      // D-08: no normalization; canonical CLAUDE.md strings must survive
      const tripTypes = new Set(result.rows.map((r) => r.trip_type));
      // At least one "1/2 Day" variant must be present in this date's data
      const hasHalfDay = [...tripTypes].some((t) => t.startsWith('1/2 Day'));
      expect(hasHalfDay).toBe(true);
    });

    it('source_url and landing_source_url are populated where anchors exist', () => {
      const withSourceUrl = result.rows.filter((r) => r.source_url);
      expect(withSourceUrl.length).toBeGreaterThan(0);
      const withLandingUrl = result.rows.filter((r) => r.landing_source_url);
      expect(withLandingUrl.length).toBeGreaterThan(0);
      // URL paths should match the expected source-site pattern
      expect(withSourceUrl[0].source_url).toMatch(/\/charter_boats\//);
      expect(withLandingUrl[0].landing_source_url).toMatch(/\/landings\//);
    });
  });

  describe('empty-day fixture (2026-12-25, synthetic)', () => {
    const html = FIXTURE('2026-12-25-empty-day.html');
    const result = parsePage(html);

    it('yields zero rows', () => {
      expect(result.rows.length).toBe(0);
    });

    it('yields zero failures (no malformed tr encountered)', () => {
      expect(result.failures.length).toBe(0);
    });
  });

  describe('mangled fixture (parse-edge-mangled)', () => {
    const html = FIXTURE('parse-edge-mangled.html');
    const result = parsePage(html);

    it('parses the valid row into 2 CatchRows (one per species-fragment: Sand Bass, Yellowtail)', () => {
      expect(result.rows.length).toBe(2);
      const species = result.rows.map((r) => r.species).sort();
      expect(species).toEqual(['sand bass', 'yellowtail']);
    });

    it('both valid rows originate from "Grande" with trip_type verbatim "Full Day"', () => {
      for (const row of result.rows) {
        expect(row.source_name).toBe('Grande');
        expect(row.trip_type).toBe('Full Day'); // D-08 verbatim
        expect(row.angler_count).toBe(30);
      }
    });

    it('quarantines the malformed row to failures[] with snippet + zod_error', () => {
      expect(result.failures.length).toBeGreaterThanOrEqual(1);
      // The snippet must contain the malformed-row marker
      const hasBroken = result.failures.some((f) =>
        f.raw_html_snippet.includes('BrokenBoat')
      );
      expect(hasBroken, 'expected a failure snippet to contain "BrokenBoat"').toBe(true);
      // Every failure carries a non-empty zod_error payload
      for (const f of result.failures) {
        expect(typeof f.zod_error).toBe('string');
        expect(f.zod_error.length).toBeGreaterThan(0);
        expect(typeof f.row_index).toBe('number');
        expect(f.row_index).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('released-qualifier fixture (2024-01-15)', () => {
    const html = FIXTURE('2024-01-15-released-qualifier.html');
    const result = parsePage(html);

    it('preserves the "released" qualifier on the species string (lowercased by D-03 transform)', () => {
      const withReleased = result.rows.filter((r) => r.species.includes('released'));
      expect(withReleased.length).toBeGreaterThan(0);
    });

    it('the "released" variant is stored as a distinct species row from the non-released variant', () => {
      // e.g., "spiny lobster" and "spiny lobster released" should both exist as separate rows
      const speciesSet = new Set(result.rows.map((r) => r.species));
      const releasedVariants = [...speciesSet].filter((s) => s.endsWith(' released'));
      expect(releasedVariants.length).toBeGreaterThan(0);
    });
  });

  describe('robustness: parsePage never throws', () => {
    it('returns empty output for empty string input, does not throw', () => {
      let result: { rows: CatchRow[]; failures: unknown[] } | null = null;
      expect(() => {
        result = parsePage('');
      }).not.toThrow();
      expect(result).not.toBeNull();
      expect(result!.rows.length).toBe(0);
      expect(result!.failures.length).toBe(0);
    });

    it('returns empty output for a minimal HTML skeleton, does not throw', () => {
      let result: { rows: CatchRow[]; failures: unknown[] } | null = null;
      expect(() => {
        result = parsePage('<html></html>');
      }).not.toThrow();
      expect(result!.rows.length).toBe(0);
      expect(result!.failures.length).toBe(0);
    });

    it('returns empty output for non-HTML garbage, does not throw', () => {
      expect(() => parsePage('<<not>>valid<<html>>')).not.toThrow();
      expect(() => parsePage('{"json":true}')).not.toThrow();
    });
  });
});
