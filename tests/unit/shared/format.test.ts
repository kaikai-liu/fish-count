import { describe, it, expect } from 'vitest';
import { formatPerAngler, maskEmail } from '../../../src/lib/shared/format';

describe('formatPerAngler', () => {
  it('returns em-dash for null / NaN / zero trips', () => {
    expect(formatPerAngler(null, 5)).toBe('—');
    expect(formatPerAngler(NaN, 5)).toBe('—');
    expect(formatPerAngler(3.7, 0)).toBe('—');
  });
  it('renders one-decimal below 10 with trailing-zero strip', () => {
    expect(formatPerAngler(3.7, 5)).toBe('3.7');
    expect(formatPerAngler(3.0, 5)).toBe('3');
  });
  it('renders integer at or above 10', () => {
    expect(formatPerAngler(10.4, 5)).toBe('10');
    expect(formatPerAngler(99.9, 5)).toBe('100');
  });
  it('handles boundary of 10 exactly (≥10 branch)', () => {
    expect(formatPerAngler(10, 5)).toBe('10');
    expect(formatPerAngler(10.0, 5)).toBe('10');
  });
});

describe('maskEmail', () => {
  it('masks local + domain leaving TLD', () => {
    expect(maskEmail('kaikai@gmail.com')).toBe('k***@g***.com');
    expect(maskEmail('a@b.co')).toBe('a***@b***.co');
  });
  it('returns em-dash on malformed input', () => {
    expect(maskEmail('not-an-email')).toBe('—');
    expect(maskEmail('@no-local.com')).toBe('—');
    expect(maskEmail('no-tld@example')).toBe('—');
  });
});
