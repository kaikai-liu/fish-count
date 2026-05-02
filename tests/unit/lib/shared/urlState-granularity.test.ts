// tests/unit/lib/shared/urlState-granularity.test.ts
// Phase 8 Plan 04 — GRN-01 / D-39. Granularity round-trip on the explorer
// URL state schema, including default-stripping.
import { describe, it, expect } from 'vitest';
import {
  parseExplorerFilters,
  serializeExplorerFilters,
  defaultGranularityForRange,
  type ExplorerFilters
} from '../../../../src/lib/shared/urlState';

function parse(qs: string): ExplorerFilters {
  const sp = new URLSearchParams(qs);
  const r = parseExplorerFilters(sp);
  if ('error' in r) throw new Error('parse failed: ' + r.error.message);
  return r;
}

describe('defaultGranularityForRange', () => {
  it('1m / 3m / 6m → daily', () => {
    expect(defaultGranularityForRange('1m')).toBe('daily');
    expect(defaultGranularityForRange('3m')).toBe('daily');
    expect(defaultGranularityForRange('6m')).toBe('daily');
  });

  it('1y / 2y / 5y / all → weekly', () => {
    expect(defaultGranularityForRange('1y')).toBe('weekly');
    expect(defaultGranularityForRange('2y')).toBe('weekly');
    expect(defaultGranularityForRange('5y')).toBe('weekly');
    expect(defaultGranularityForRange('all')).toBe('weekly');
  });

  it('custom → daily (loader can refine after clamp)', () => {
    expect(defaultGranularityForRange('custom')).toBe('daily');
  });
});

describe('parseExplorerFilters: granularity', () => {
  it('round-trips a valid granularity', () => {
    const f = parse('ticker=boat&slug=premier&granularity=weekly');
    expect(f.granularity).toBe('weekly');
  });

  it('round-trips daily', () => {
    const f = parse('ticker=boat&slug=premier&granularity=daily');
    expect(f.granularity).toBe('daily');
  });

  it('round-trips monthly', () => {
    const f = parse('ticker=boat&slug=premier&granularity=monthly');
    expect(f.granularity).toBe('monthly');
  });

  it('absent → undefined', () => {
    const f = parse('ticker=boat&slug=premier');
    expect(f.granularity).toBeUndefined();
  });

  it('rejects garbage value', () => {
    const sp = new URLSearchParams('ticker=boat&slug=premier&granularity=garbage');
    const r = parseExplorerFilters(sp);
    expect('error' in r).toBe(true);
  });

  it('rejects mixed case (case-sensitive enum)', () => {
    const sp = new URLSearchParams('ticker=boat&slug=premier&granularity=Weekly');
    const r = parseExplorerFilters(sp);
    expect('error' in r).toBe(true);
  });
});

describe('serializeExplorerFilters: granularity', () => {
  it('emits the granularity param when set', () => {
    const f: ExplorerFilters = {
      ticker: 'boat',
      slug: 'premier',
      range: '1y',
      moon: false,
      granularity: 'daily'
    };
    const sp = serializeExplorerFilters(f);
    expect(sp.get('granularity')).toBe('daily');
  });

  it('omits the param when granularity is undefined', () => {
    const f: ExplorerFilters = {
      ticker: 'boat',
      slug: 'premier',
      range: '1y',
      moon: false,
      granularity: undefined
    };
    const sp = serializeExplorerFilters(f);
    expect(sp.has('granularity')).toBe(false);
  });

  it('always emits if filters.granularity is set — default-stripping is the page layer', () => {
    // The schema does NOT strip defaults (Pitfall 3 lives in the page-side
    // navigate() call, not the serializer). This keeps the serializer pure
    // and makes round-trip behavior predictable.
    const f: ExplorerFilters = {
      ticker: 'boat',
      slug: 'premier',
      range: '1y',
      moon: false,
      granularity: 'weekly' // weekly is the default for 1y
    };
    const sp = serializeExplorerFilters(f);
    expect(sp.get('granularity')).toBe('weekly');
  });
});
