// tests/unit/routes/explorer-handlers.test.ts
// Phase 8 Plan 04 — GRN-02 / D-38. Pure URL-handler contracts. The
// behaviors under test (range-switch reset, default-stripping) are critical
// to the URL "feels right" experience but live in /explorer/+page.svelte
// originally; we extract to $lib/shared/explorerHandlers.ts so they're
// testable without a SvelteKit page render.
import { describe, it, expect } from 'vitest';
import {
  nextFiltersOnRangeChange,
  nextFiltersOnGranularityChange
} from '../../../src/lib/shared/explorerHandlers';
import type { ExplorerFilters } from '../../../src/lib/shared/urlState';

const baseBoat: ExplorerFilters = {
  ticker: 'boat',
  slug: 'premier',
  range: '1y',
  moon: false,
  granularity: undefined
};

describe('nextFiltersOnRangeChange — D-38 range-switch reset', () => {
  it('strips granularity (so URL drops the param) on range change', () => {
    const current: ExplorerFilters = { ...baseBoat, range: '1y', granularity: 'daily' };
    const next = nextFiltersOnRangeChange(current, '5y');
    expect(next.range).toBe('5y');
    expect(next.granularity).toBeUndefined();
  });

  it('preserves ticker, slug, and moon flag', () => {
    const current: ExplorerFilters = { ...baseBoat, moon: true, granularity: 'monthly' };
    const next = nextFiltersOnRangeChange(current, '3m');
    expect(next.ticker).toBe('boat');
    expect((next as { slug: string }).slug).toBe('premier');
    expect(next.moon).toBe(true);
  });

  it('works for species ticker (preserves name, not slug)', () => {
    const current: ExplorerFilters = {
      ticker: 'species',
      name: 'bluefin',
      range: '1y',
      moon: true,
      granularity: 'monthly'
    };
    const next = nextFiltersOnRangeChange(current, '3m');
    expect(next.ticker).toBe('species');
    expect((next as { name: string }).name).toBe('bluefin');
    expect(next.granularity).toBeUndefined();
  });
});

describe('nextFiltersOnGranularityChange — D-39 default-stripping', () => {
  it('emits granularity when picked value differs from range default', () => {
    const current: ExplorerFilters = { ...baseBoat, range: '1y' };
    // 1y default is weekly; user picks daily → not default → emit
    const next = nextFiltersOnGranularityChange(current, 'daily');
    expect(next.granularity).toBe('daily');
  });

  it('strips granularity when picked value equals range default', () => {
    const current: ExplorerFilters = { ...baseBoat, range: '1y', granularity: 'daily' };
    // 1y default is weekly; user picks weekly → default → strip
    const next = nextFiltersOnGranularityChange(current, 'weekly');
    expect(next.granularity).toBeUndefined();
  });

  it('strips daily on a 3M range (3M default is daily)', () => {
    const current: ExplorerFilters = { ...baseBoat, range: '3m', granularity: 'monthly' };
    const next = nextFiltersOnGranularityChange(current, 'daily');
    expect(next.granularity).toBeUndefined();
  });

  it('emits monthly on 1Y (override)', () => {
    const current: ExplorerFilters = { ...baseBoat, range: '1y' };
    const next = nextFiltersOnGranularityChange(current, 'monthly');
    expect(next.granularity).toBe('monthly');
  });
});
