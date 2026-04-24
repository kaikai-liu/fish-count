// tests/unit/scraper/gate.test.ts
// Covers D-21 FIRST_SCRAPE_OK fail-closed semantics. Mirrors kill-switch.test.ts
// structure but inverts the default (kill-switch defaults to allow; gate defaults
// to block). See .planning/phases/01-ingest-store/01-PATTERNS.md lines 197-231.
import { describe, it, expect, afterEach } from 'vitest';
import { firstScrapeAllowed } from '../../../src/lib/scraper/gate';

describe('firstScrapeAllowed (D-21 fail-closed)', () => {
  const originalEnv = process.env.FIRST_SCRAPE_OK;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.FIRST_SCRAPE_OK;
    else process.env.FIRST_SCRAPE_OK = originalEnv;
  });

  it('returns true only when FIRST_SCRAPE_OK === "true"', () => {
    expect(firstScrapeAllowed({ FIRST_SCRAPE_OK: 'true' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('returns false when FIRST_SCRAPE_OK === "false"', () => {
    expect(firstScrapeAllowed({ FIRST_SCRAPE_OK: 'false' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('returns false when FIRST_SCRAPE_OK is unset (fail-closed)', () => {
    expect(firstScrapeAllowed({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('returns false for any non-"true" value (no truthy coercion)', () => {
    expect(firstScrapeAllowed({ FIRST_SCRAPE_OK: 'TRUE' } as NodeJS.ProcessEnv)).toBe(false);
    expect(firstScrapeAllowed({ FIRST_SCRAPE_OK: '1' } as NodeJS.ProcessEnv)).toBe(false);
    expect(firstScrapeAllowed({ FIRST_SCRAPE_OK: 'yes' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('returns false for empty string (not truthy-coerced)', () => {
    expect(firstScrapeAllowed({ FIRST_SCRAPE_OK: '' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('defaults to reading process.env when no arg given', () => {
    const result = firstScrapeAllowed();
    expect(typeof result).toBe('boolean');
  });
});
