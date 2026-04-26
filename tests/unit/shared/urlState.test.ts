// tests/unit/shared/urlState.test.ts
// Unit tests for src/lib/shared/urlState.ts
// Verifies: Zod parse/validation + round-trip property tests + error cases.
import { describe, it, expect } from 'vitest';
import {
  parseHomeFilters,
  serializeHomeFilters,
  parseDateFilters,
  serializeDateFilters,
  parsePickerFilters,
  serializePickerFilters,
  parseCompareFilters,
  serializeCompareFilters,
  parseTrendsFilters,
  serializeTrendsFilters
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
// Home filters
// ---------------------------------------------------------------------------

describe('urlState.parseHomeFilters', () => {
  it('returns empty object for empty searchParams', () => {
    const result = parseHomeFilters(new URLSearchParams());
    expect('error' in result).toBe(false);
    // All fields optional — empty parse is valid
  });

  it('round-trip: serialize -> parse -> same values', () => {
    const original = { tripType: '1/2 Day AM', landing: 'Seaforth', species: 'yellowtail' };
    const sp = serializeHomeFilters(original);
    const parsed = parseHomeFilters(sp);
    expect('error' in parsed).toBe(false);
    if (!('error' in parsed)) {
      expect(parsed.tripType).toBe(original.tripType);
      expect(parsed.landing).toBe(original.landing);
      expect(parsed.species).toBe(original.species);
    }
  });
});

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
// Picker filters
// ---------------------------------------------------------------------------

describe('urlState.parsePickerFilters', () => {
  it('returns {error} when tripType is missing (D-10)', () => {
    const sp = toSp({ date: '2024-07-04', species: 'yellowtail' });
    const result = parsePickerFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('returns {error} when species is missing', () => {
    const sp = toSp({ date: '2024-07-04', tripType: '1/2 Day AM' });
    const result = parsePickerFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('returns {error} when date is missing', () => {
    const sp = toSp({ tripType: '1/2 Day AM', species: 'yellowtail' });
    const result = parsePickerFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('returns {error} when windowDays > 14 (T-02-03 clamp)', () => {
    const sp = toSp({ date: '2024-07-04', tripType: '1/2 Day AM', species: 'yellowtail', windowDays: '15' });
    const result = parsePickerFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('returns {error} when windowDays < 0', () => {
    const sp = toSp({ date: '2024-07-04', tripType: '1/2 Day AM', species: 'yellowtail', windowDays: '-1' });
    const result = parsePickerFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('accepts windowDays at boundary values 0 and 14', () => {
    const sp0 = toSp({ date: '2024-07-04', tripType: '1/2 Day AM', species: 'yellowtail', windowDays: '0' });
    const sp14 = toSp({ date: '2024-07-04', tripType: '1/2 Day AM', species: 'yellowtail', windowDays: '14' });
    expect('error' in parsePickerFilters(sp0)).toBe(false);
    expect('error' in parsePickerFilters(sp14)).toBe(false);
  });

  it('defaults windowDays to 3 when not provided', () => {
    const sp = toSp({ date: '2024-07-04', tripType: '1/2 Day AM', species: 'yellowtail' });
    const result = parsePickerFilters(sp);
    if (!('error' in result)) {
      expect(result.windowDays).toBe(3);
    }
  });

  it('returns {error} when date format is invalid', () => {
    const sp = toSp({ date: '07-04-2024', tripType: '1/2 Day AM', species: 'yellowtail' });
    const result = parsePickerFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('round-trip: serialize -> parse -> same values', () => {
    const original = {
      date: '2024-07-04',
      species: 'yellowtail',
      tripType: '1/2 Day AM',
      windowDays: 7,
      rangeMode: false
    };
    const sp = serializePickerFilters(original);
    const parsed = parsePickerFilters(sp);
    expect('error' in parsed).toBe(false);
    if (!('error' in parsed)) {
      expect(parsed.date).toBe(original.date);
      expect(parsed.species).toBe(original.species);
      expect(parsed.tripType).toBe(original.tripType);
      expect(parsed.windowDays).toBe(original.windowDays);
      expect(parsed.rangeMode).toBe(original.rangeMode);
    }
  });

  it('rangeMode=false from URL parses as boolean false (regression: z.coerce.boolean() turns string "false" into true)', () => {
    const sp = toSp({
      date: '2024-07-04',
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      rangeMode: 'false'
    });
    const result = parsePickerFilters(sp);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.rangeMode).toBe(false);
    }
  });

  it('rangeMode=true from URL parses as boolean true', () => {
    const sp = toSp({
      date: '2024-07-04',
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      rangeMode: 'true',
      fromDate: '2024-07-01',
      toDate: '2024-07-10'
    });
    const result = parsePickerFilters(sp);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.rangeMode).toBe(true);
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
// Trends filters
// ---------------------------------------------------------------------------

describe('urlState.parseTrendsFilters', () => {
  it('returns {error} when species is missing', () => {
    const sp = toSp({ tripType: 'Full Day' });
    const result = parseTrendsFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('returns {error} when tripType is missing', () => {
    const sp = toSp({ species: 'yellowtail' });
    const result = parseTrendsFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('defaults range to "1y" when not provided', () => {
    const sp = toSp({ species: 'yellowtail', tripType: 'Full Day' });
    const result = parseTrendsFilters(sp);
    if (!('error' in result)) {
      expect(result.range).toBe('1y');
    }
  });

  it('returns {error} when range is an invalid value', () => {
    const sp = toSp({ species: 'yellowtail', tripType: 'Full Day', range: '2y' });
    const result = parseTrendsFilters(sp);
    expect('error' in result).toBe(true);
  });

  it('accepts all valid range values', () => {
    for (const range of ['3mo', '6mo', '1y', 'all'] as const) {
      const sp = toSp({ species: 'yellowtail', tripType: 'Full Day', range });
      expect('error' in parseTrendsFilters(sp)).toBe(false);
    }
  });

  it('round-trip: serialize -> parse -> same values', () => {
    const original = {
      species: 'yellowtail',
      tripType: 'Full Day',
      boatId: 42,
      range: '6mo' as const,
      granularity: 'weekly' as const
    };
    const sp = serializeTrendsFilters(original);
    const parsed = parseTrendsFilters(sp);
    expect('error' in parsed).toBe(false);
    if (!('error' in parsed)) {
      expect(parsed.species).toBe(original.species);
      expect(parsed.tripType).toBe(original.tripType);
      expect(parsed.boatId).toBe(original.boatId);
      expect(parsed.range).toBe(original.range);
      expect(parsed.granularity).toBe(original.granularity);
    }
  });
});
