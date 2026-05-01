// tests/unit/shared/slug.test.ts
// Unit tests for slug utility helpers.
// D-13 (06-CONTEXT.md): slug is frozen-at-first-seen; slugify determines the shape.
import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlug } from '../../../src/lib/shared/slug';

describe('slugify', () => {
  it('lowercases and hyphenates a simple name', () => {
    expect(slugify('Pacific Voyager')).toBe('pacific-voyager');
  });

  it('handles trailing numbers', () => {
    expect(slugify('Sea Adventure 80')).toBe('sea-adventure-80');
  });

  it('strips punctuation and collapses to single hyphen', () => {
    expect(slugify('Tomahawk!!!')).toBe('tomahawk');
  });

  it('strips diacritics via NFKD normalize (café olé)', () => {
    expect(slugify('Café Olé')).toBe('cafe-ole');
  });

  it('returns "boat" for empty string (never empty)', () => {
    expect(slugify('')).toBe('boat');
  });

  it('returns "boat" when input collapses to only hyphens', () => {
    expect(slugify('---')).toBe('boat');
  });

  it('truncates at 60 chars for very long input', () => {
    const long = 'a'.repeat(128);
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(60);
  });

  it('output matches ^[a-z0-9][a-z0-9-]*$ pattern', () => {
    const result = slugify('Pacific Voyager 2025!');
    expect(result).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });
});

describe('uniqueSlug', () => {
  it('returns base slug when not in taken set', () => {
    expect(uniqueSlug('pacific-voyager', new Set())).toBe('pacific-voyager');
  });

  it('returns base-2 when base is taken', () => {
    expect(uniqueSlug('pacific-voyager', new Set(['pacific-voyager']))).toBe('pacific-voyager-2');
  });

  it('returns base-3 when base and base-2 are both taken', () => {
    expect(
      uniqueSlug('pacific-voyager', new Set(['pacific-voyager', 'pacific-voyager-2']))
    ).toBe('pacific-voyager-3');
  });

  it('is deterministic — same inputs produce same output', () => {
    const taken = new Set(['pacific-voyager', 'pacific-voyager-2']);
    expect(uniqueSlug('pacific-voyager', taken)).toBe('pacific-voyager-3');
    // Call again — same result
    expect(uniqueSlug('pacific-voyager', taken)).toBe('pacific-voyager-3');
  });

  it('handles an empty taken set and returns base immediately', () => {
    expect(uniqueSlug('grande', new Set())).toBe('grande');
  });

  it('skips to next available when multiple suffixes are taken', () => {
    const taken = new Set(['boat', 'boat-2', 'boat-3', 'boat-4']);
    expect(uniqueSlug('boat', taken)).toBe('boat-5');
  });
});
