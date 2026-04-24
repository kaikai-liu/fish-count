// tests/unit/scraper/schema.test.ts
// Covers D-03 (species lowercased+trimmed) and D-08 (trip_type verbatim) for CatchRowSchema.
// Plan 01-03 Task 1 — RED gate for schema.ts + fixture manifest.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CatchRowSchema } from '../../../src/lib/scraper/schema';

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'scraper');

describe('CatchRowSchema (D-03 species normalize, D-08 trip_type verbatim)', () => {
  it('accepts a well-formed catch row and lowercases+trims the species (D-03)', () => {
    const result = CatchRowSchema.safeParse({
      source_name: 'Grande',
      landing_source_name: 'Pt Loma Sportfishing',
      trip_type: 'Full Day Coronado Islands',
      angler_count: 30,
      species: '  Yellowtail  ',
      species_count: 30
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.species).toBe('yellowtail');
      // D-08: trip_type preserved verbatim (no normalization)
      expect(result.data.trip_type).toBe('Full Day Coronado Islands');
    }
  });

  it('preserves mixed-case and whitespace in trip_type (D-08)', () => {
    const r = CatchRowSchema.safeParse({
      source_name: 'Dolphin',
      landing_source_name: "Fisherman's Landing",
      trip_type: '1/2 Day AM', // exact domain string from CLAUDE.md
      angler_count: 37,
      species: 'Calico Bass',
      species_count: 109
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.trip_type).toBe('1/2 Day AM');
      expect(r.data.species).toBe('calico bass');
    }
  });

  it('rejects zero-length source_name', () => {
    const r = CatchRowSchema.safeParse({
      source_name: '',
      landing_source_name: "Fisherman's Landing",
      trip_type: 'Full Day',
      angler_count: 30,
      species: 'yellowtail',
      species_count: 10
    });
    expect(r.success).toBe(false);
  });

  it('rejects zero-length landing_source_name', () => {
    const r = CatchRowSchema.safeParse({
      source_name: 'Grande',
      landing_source_name: '',
      trip_type: 'Full Day',
      angler_count: 30,
      species: 'yellowtail',
      species_count: 10
    });
    expect(r.success).toBe(false);
  });

  it('rejects zero-length trip_type', () => {
    const r = CatchRowSchema.safeParse({
      source_name: 'Grande',
      landing_source_name: "Fisherman's Landing",
      trip_type: '',
      angler_count: 30,
      species: 'yellowtail',
      species_count: 10
    });
    expect(r.success).toBe(false);
  });

  it('rejects zero-length species', () => {
    const r = CatchRowSchema.safeParse({
      source_name: 'Grande',
      landing_source_name: "Fisherman's Landing",
      trip_type: 'Full Day',
      angler_count: 30,
      species: '',
      species_count: 10
    });
    expect(r.success).toBe(false);
  });

  it('rejects NaN angler_count (parseInt returned NaN)', () => {
    const r = CatchRowSchema.safeParse({
      source_name: 'Grande',
      landing_source_name: "Fisherman's Landing",
      trip_type: 'Full Day',
      angler_count: NaN,
      species: 'yellowtail',
      species_count: 10
    });
    expect(r.success).toBe(false);
  });

  it('rejects negative angler_count', () => {
    const r = CatchRowSchema.safeParse({
      source_name: 'Grande',
      landing_source_name: "Fisherman's Landing",
      trip_type: 'Full Day',
      angler_count: -1,
      species: 'yellowtail',
      species_count: 10
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-integer species_count', () => {
    const r = CatchRowSchema.safeParse({
      source_name: 'Grande',
      landing_source_name: "Fisherman's Landing",
      trip_type: 'Full Day',
      angler_count: 30,
      species: 'yellowtail',
      species_count: 1.5
    });
    expect(r.success).toBe(false);
  });

  it('accepts optional source_url and landing_source_url', () => {
    const r = CatchRowSchema.safeParse({
      source_name: 'Grande',
      landing_source_name: 'Pt Loma Sportfishing',
      trip_type: 'Full Day',
      angler_count: 30,
      species: 'yellowtail',
      species_count: 30,
      source_url: '/charter_boats/grande.php',
      landing_source_url: '/landings/pt-loma-sportfishing'
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.source_url).toBe('/charter_boats/grande.php');
      expect(r.data.landing_source_url).toBe('/landings/pt-loma-sportfishing');
    }
  });

  it('preserves "released" qualifier verbatim in species (lowercased by transform)', () => {
    const r = CatchRowSchema.safeParse({
      source_name: 'Alicia',
      landing_source_name: 'H&M Landing',
      trip_type: '1/2 Day Twilight',
      angler_count: 7,
      species: 'Spiny Lobster Released', // verbatim from source — transform lowercases
      species_count: 15
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.species).toBe('spiny lobster released');
    }
  });
});

describe('fixture manifest (D-09)', () => {
  it('typical fixture is a real non-empty capture', () => {
    const path = join(FIXTURE_DIR, '2024-08-15-typical.html');
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeGreaterThan(1000);
  });

  it('empty-day fixture exists', () => {
    expect(existsSync(join(FIXTURE_DIR, '2026-12-25-empty-day.html'))).toBe(true);
  });

  it('released-qualifier fixture exists and contains "Released"', () => {
    const path = join(FIXTURE_DIR, '2024-01-15-released-qualifier.html');
    expect(existsSync(path)).toBe(true);
    const html = readFileSync(path, 'utf8');
    expect(html).toMatch(/Released/i);
  });

  it('parse-edge-mangled fixture exists and contains BrokenBoat', () => {
    const path = join(FIXTURE_DIR, 'parse-edge-mangled.html');
    expect(existsSync(path)).toBe(true);
    const html = readFileSync(path, 'utf8');
    expect(html).toContain('BrokenBoat');
  });

  it('typical fixture has paired expected.json with required keys', () => {
    const path = join(FIXTURE_DIR, '2024-08-15-typical.expected.json');
    expect(existsSync(path)).toBe(true);
    const obj = JSON.parse(readFileSync(path, 'utf8'));
    expect(Array.isArray(obj.rows)).toBe(true);
    expect(obj.rows.length).toBeGreaterThanOrEqual(3);
    expect(typeof obj.min_rows).toBe('number');
    expect(obj.min_rows).toBeGreaterThanOrEqual(10);
    expect(typeof obj.failures_expected).toBe('number');
    expect(obj.failures_expected).toBe(0);
  });
});
