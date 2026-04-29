// tests/unit/alerts/honeypot.test.ts
// Phase 4 Plan 02 Wave-0 anchor: pure honeypot field check.
import { describe, it, expect } from 'vitest';
import { isFilled } from '../../../src/lib/alerts/honeypot';

describe('honeypot.isFilled', () => {
  it('returns false for empty / whitespace / nullish', () => {
    expect(isFilled('')).toBe(false);
    expect(isFilled('   ')).toBe(false);
    expect(isFilled(undefined)).toBe(false);
    expect(isFilled(null)).toBe(false);
  });
  it('returns true for any non-empty string after trim', () => {
    expect(isFilled('https://example.com')).toBe(true);
    expect(isFilled('a')).toBe(true);
    expect(isFilled('  filled  ')).toBe(true);
  });
});
