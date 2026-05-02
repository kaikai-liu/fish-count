// tests/unit/shared/urlState.test.ts
// Unit tests for src/lib/shared/urlState.ts
// Verifies: Zod parse/validation + round-trip property tests + error cases.
import { describe, it, expect } from 'vitest';
import {
  parseDateFilters,
  serializeDateFilters,
  parseCompareFilters,
  serializeCompareFilters,
  parseExplorerFilters,
  serializeExplorerFilters,
  type ExplorerFilters
} from '../../../src/lib/shared/urlState';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSp(obj: Record<string, string | string[]>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      for (const item of v) sp.append(k, item);
    } else {
      sp.set(k, v);
    }
  }
  return sp;
}

// ---------------------------------------------------------------------------
// Date filters
// ---------------------------------------------------------------------------

describe('urlState.parseDateFilters', () => {
  it('returns empty object for empty searchParams', () => {
    const result = parseDateFilters(new URLSearchParams());
    expect('error' in result).toBe(false);
  });

  it('round-trip: serialize -> parse -> same values', () => {
    const original = { tripType: 'Full Day', species: 'dorado' };
    const sp = serializeDateFilters(original);
    const parsed = parseDateFilters(sp);
    expect('error' in parsed).toBe(false);
    if (!('error' in parsed)) {
      expect(parsed.tripType).toBe('Full Day');
      expect(parsed.species).toBe('dorado');
    }
  });
});

// ---------------------------------------------------------------------------
// Compare filters
// ---------------------------------------------------------------------------

describe('urlState.parseCompareFilters', () => {
  it('returns {error} when fewer than 2 boatIds', () => {
    const sp = toSp({
      tripType: 'Full Day',
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      boatIds: ['1']
    });
    const result = parseCompareFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('returns {error} when more than 3 boatIds', () => {
    const sp = toSp({
      tripType: 'Full Day',
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      boatIds: ['1', '2', '3', '4']
    });
    const result = parseCompareFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('accepts exactly 2 and 3 boatIds', () => {
    const sp2 = toSp({ tripType: 'Full Day', fromDate: '2024-06-01', toDate: '2024-06-30', boatIds: ['1', '2'] });
    const sp3 = toSp({ tripType: 'Full Day', fromDate: '2024-06-01', toDate: '2024-06-30', boatIds: ['1', '2', '3'] });
    expect('error' in parseCompareFilters(sp2)).toBe(false);
    expect('error' in parseCompareFilters(sp3)).toBe(false);
  });

  it('accepts comma-separated boatIds (?boatIds=28,29) as well as repeated keys', () => {
    const sp = new URLSearchParams('tripType=Full+Day&fromDate=2024-06-01&toDate=2024-06-30&boatIds=28,29');
    const result = parseCompareFilters(sp);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.boatIds).toEqual([28, 29]);
    }
    const sp3 = new URLSearchParams('tripType=Full+Day&fromDate=2024-06-01&toDate=2024-06-30&boatIds=1,2,3');
    const r3 = parseCompareFilters(sp3);
    expect('error' in r3).toBe(false);
    if (!('error' in r3)) {
      expect(r3.boatIds).toEqual([1, 2, 3]);
    }
  });

  it('serializeCompareFilters with boatIds=[1,2] produces "boatIds=1&boatIds=2"', () => {
    const sp = serializeCompareFilters({
      tripType: 'Full Day',
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      boatIds: [1, 2]
    });
    const str = sp.toString();
    expect(str).toContain('boatIds=1');
    expect(str).toContain('boatIds=2');
    // Confirm they appear as separate params (not "boatIds=1%2C2")
    expect(str.split('boatIds=')).toHaveLength(3); // "" + "1&" + "2..."
  });

  it('round-trip: serialize -> parse -> same values', () => {
    const original = {
      tripType: 'Full Day',
      fromDate: '2024-06-01',
      toDate: '2024-06-30',
      boatIds: [1, 2, 3]
    };
    const sp = serializeCompareFilters(original);
    const parsed = parseCompareFilters(sp);
    expect('error' in parsed).toBe(false);
    if (!('error' in parsed)) {
      expect(parsed.tripType).toBe(original.tripType);
      expect(parsed.fromDate).toBe(original.fromDate);
      expect(parsed.toDate).toBe(original.toDate);
      expect(parsed.boatIds).toEqual(original.boatIds);
    }
  });
});

// ---------------------------------------------------------------------------
// Explorer filters ( /explorer )
// Discriminated union: boat | species | landing ticker.
// ---------------------------------------------------------------------------

describe('ExplorerFiltersSchema', () => {
  // ---- valid inputs ----

  it('parses boat ticker with valid slug and range', () => {
    const sp = toSp({ ticker: 'boat', slug: 'pacific-voyager', range: '1y' });
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.ticker).toBe('boat');
      if (result.ticker === 'boat') {
        expect(result.slug).toBe('pacific-voyager');
      }
      expect(result.range).toBe('1y');
    }
  });

  it('parses species ticker with name and range', () => {
    const sp = toSp({ ticker: 'species', name: 'bluefin', range: '3m' });
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.ticker).toBe('species');
      if (result.ticker === 'species') {
        expect(result.name).toBe('bluefin');
      }
      expect(result.range).toBe('3m');
    }
  });

  it('parses landing ticker with URL-encoded name', () => {
    const sp = new URLSearchParams("ticker=landing&name=Fisherman's+Landing&range=all");
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.ticker).toBe('landing');
      if (result.ticker === 'landing') {
        expect(result.name).toBe("Fisherman's Landing");
      }
    }
  });

  it('defaults range to 1y when not provided (boat ticker)', () => {
    const sp = toSp({ ticker: 'boat', slug: 'my-boat' });
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.range).toBe('1y');
    }
  });

  it('parses custom range with valid fromDate and toDate', () => {
    const sp = toSp({
      ticker: 'boat',
      slug: 'pacific-voyager',
      range: 'custom',
      fromDate: '2025-01-01',
      toDate: '2025-06-30'
    });
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.range).toBe('custom');
      expect(result.fromDate).toBe('2025-01-01');
      expect(result.toDate).toBe('2025-06-30');
    }
  });

  // ---- invalid inputs — should return {error} ----

  it('returns {error} for empty URLSearchParams (ticker is required)', () => {
    const result = parseExplorerFilters(new URLSearchParams());
    expect('error' in result).toBe(true);
  });

  it('returns {error} when ticker=boat has no slug', () => {
    const sp = toSp({ ticker: 'boat', range: '1y' });
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('returns {error} when ticker=species has no name', () => {
    const sp = toSp({ ticker: 'species', range: '1y' });
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('returns {error} when ticker=unknown (invalid discriminant)', () => {
    const sp = toSp({ ticker: 'unknown', slug: 'pacific-voyager', range: '1y' });
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('returns {error} when slug has uppercase letters (regex violation)', () => {
    // ticker=boat&slug=Pacific%20Voyager → uppercase + space → invalid
    const sp = new URLSearchParams('ticker=boat&slug=Pacific+Voyager&range=1y');
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('returns {error} when slug has spaces', () => {
    const sp = toSp({ ticker: 'boat', slug: 'pacific voyager', range: '1y' });
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('returns {error} when slug exceeds 80 chars', () => {
    const slug = 'a'.repeat(81);
    const sp = toSp({ ticker: 'boat', slug, range: '1y' });
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('accepts slug at exactly 80 chars', () => {
    // Max length slug: must match ^[a-z0-9]+(-[a-z0-9]+)*$ AND be ≤80 chars
    const slug = 'a'.repeat(80);
    const sp = toSp({ ticker: 'boat', slug, range: '1y' });
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(false);
  });

  it('returns {error} when range=custom but no fromDate/toDate', () => {
    const sp = toSp({ ticker: 'boat', slug: 'pacific-voyager', range: 'custom' });
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('returns {error} when range=custom and fromDate > toDate', () => {
    const sp = toSp({
      ticker: 'boat',
      slug: 'pacific-voyager',
      range: 'custom',
      fromDate: '2025-02-01',
      toDate: '2025-01-01'
    });
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('returns {error} when date format is invalid', () => {
    const sp = toSp({
      ticker: 'boat',
      slug: 'valid-slug',
      range: 'custom',
      fromDate: '01-01-2025',
      toDate: '2025-06-30'
    });
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(true);
  });

  // ---- round-trip property tests ----

  it('round-trip: boat ticker parse(serialize(f)) == f', () => {
    const f: ExplorerFilters = { ticker: 'boat', slug: 'pacific-voyager', range: '1y', moon: false };
    const sp = serializeExplorerFilters(f);
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result).toEqual(f);
    }
  });

  it('round-trip: species ticker parse(serialize(f)) == f', () => {
    const f: ExplorerFilters = { ticker: 'species', name: 'yellowtail', range: '3m', moon: false };
    const sp = serializeExplorerFilters(f);
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result).toEqual(f);
    }
  });

  it('round-trip: landing ticker parse(serialize(f)) == f', () => {
    const f: ExplorerFilters = { ticker: 'landing', name: "Fisherman's Landing", range: 'all', moon: false };
    const sp = serializeExplorerFilters(f);
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result).toEqual(f);
    }
  });

  it('round-trip: custom range parse(serialize(f)) == f', () => {
    const f: ExplorerFilters = {
      ticker: 'boat',
      slug: 'pacific-voyager',
      range: 'custom',
      fromDate: '2025-01-01',
      toDate: '2025-06-30',
      moon: false
    };
    const sp = serializeExplorerFilters(f);
    const result = parseExplorerFilters(sp);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result).toEqual(f);
    }
  });
});

describe('ExplorerFiltersSchema — moon field (Phase 7, MOON-01)', () => {
  const baseBoat = { ticker: 'boat', slug: 'pacific-voyager', range: '1y' };

  it('defaults moon to false when param absent', () => {
    const result = parseExplorerFilters(new URLSearchParams(baseBoat));
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.moon).toBe(false);
    }
  });

  it('parses moon=1 as true', () => {
    const result = parseExplorerFilters(new URLSearchParams({ ...baseBoat, moon: '1' }));
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.moon).toBe(true);
  });

  it('parses moon=true as true', () => {
    const result = parseExplorerFilters(new URLSearchParams({ ...baseBoat, moon: 'true' }));
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.moon).toBe(true);
  });

  it('parses moon=0 as false', () => {
    const result = parseExplorerFilters(new URLSearchParams({ ...baseBoat, moon: '0' }));
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.moon).toBe(false);
  });

  it('parses moon=false as false', () => {
    const result = parseExplorerFilters(new URLSearchParams({ ...baseBoat, moon: 'false' }));
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.moon).toBe(false);
  });

  it('rejects moon=garbage', () => {
    const result = parseExplorerFilters(new URLSearchParams({ ...baseBoat, moon: 'garbage' }));
    expect('error' in result).toBe(true);
  });

  it('serializeExplorerFilters omits moon param when off', () => {
    const sp = serializeExplorerFilters({
      ticker: 'boat', slug: 'pacific-voyager', range: '1y', moon: false
    });
    expect(sp.toString()).not.toContain('moon=');
  });

  it('serializeExplorerFilters emits moon=1 when on', () => {
    const sp = serializeExplorerFilters({
      ticker: 'boat', slug: 'pacific-voyager', range: '1y', moon: true
    });
    expect(sp.get('moon')).toBe('1');
  });

  it('round-trips moon=true', () => {
    const original = { ticker: 'boat' as const, slug: 'pacific-voyager', range: '1y' as const, moon: true };
    const sp = serializeExplorerFilters(original);
    const parsed = parseExplorerFilters(sp);
    expect('error' in parsed).toBe(false);
    if (!('error' in parsed)) expect(parsed.moon).toBe(true);
  });

  it('round-trips moon=false (omitted on serialize, defaults to false on parse)', () => {
    const original = { ticker: 'boat' as const, slug: 'pacific-voyager', range: '1y' as const, moon: false };
    const sp = serializeExplorerFilters(original);
    expect(sp.toString()).not.toContain('moon=');
    const parsed = parseExplorerFilters(sp);
    expect('error' in parsed).toBe(false);
    if (!('error' in parsed)) expect(parsed.moon).toBe(false);
  });
});
