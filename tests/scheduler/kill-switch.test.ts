// tests/scheduler/kill-switch.test.ts
// Covers OPS-05 unit acceptance from 00-VALIDATION.md.
import { describe, it, expect } from 'vitest';
import { scrapingEnabled } from '../../src/lib/server/kill-switch';

describe('scrapingEnabled (OPS-05 kill switch gate)', () => {
  it('returns false when SCRAPER_ENABLED is exactly "false"', () => {
    expect(scrapingEnabled({ SCRAPER_ENABLED: 'false' })).toBe(false);
  });

  it('returns true when SCRAPER_ENABLED is unset', () => {
    expect(scrapingEnabled({})).toBe(true);
  });

  it('returns true when SCRAPER_ENABLED is "true"', () => {
    expect(scrapingEnabled({ SCRAPER_ENABLED: 'true' })).toBe(true);
  });

  it('returns true when SCRAPER_ENABLED is empty string', () => {
    expect(scrapingEnabled({ SCRAPER_ENABLED: '' })).toBe(true);
  });

  it('is case-sensitive — "FALSE" does NOT halt (operator must use lowercase)', () => {
    // Documented fail-open: only exact 'false' halts. Capitalized variants
    // are treated as "unknown value → allow" per 00-RESEARCH.md §Q1.
    expect(scrapingEnabled({ SCRAPER_ENABLED: 'FALSE' })).toBe(true);
  });

  it('returns true for unrelated values like "0", "off", "no"', () => {
    expect(scrapingEnabled({ SCRAPER_ENABLED: '0' })).toBe(true);
    expect(scrapingEnabled({ SCRAPER_ENABLED: 'off' })).toBe(true);
    expect(scrapingEnabled({ SCRAPER_ENABLED: 'no' })).toBe(true);
  });

  it('defaults to reading process.env when no arg given', () => {
    // Smoke: the zero-arg call exists and returns a boolean.
    const result = scrapingEnabled();
    expect(typeof result).toBe('boolean');
  });
});
