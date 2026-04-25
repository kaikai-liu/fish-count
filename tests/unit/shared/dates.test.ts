// tests/unit/shared/dates.test.ts
// Unit tests for Phase 2 date helpers added to src/lib/shared/dates.ts.
import { describe, it, expect } from 'vitest';
import {
  today,
  addDays,
  daysBetween,
  clampDate,
  isToday,
  isPast,
  isoWeekKey,
  monthKey,
  toPtTimeLabel
} from '../../../src/lib/shared/dates';

describe('addDays', () => {
  it('advances by 1 day', () => {
    expect(addDays('2024-01-01', 1)).toBe('2024-01-02');
  });

  it('handles year boundary', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
  });

  it('handles leap year backward', () => {
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('handles non-leap year backward', () => {
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28');
  });

  it('adds multiple days', () => {
    expect(addDays('2024-01-15', 7)).toBe('2024-01-22');
  });

  it('subtracts multiple days', () => {
    expect(addDays('2024-01-15', -5)).toBe('2024-01-10');
  });
});

describe('daysBetween', () => {
  it('returns positive count from a to b', () => {
    expect(daysBetween('2024-01-01', '2024-01-08')).toBe(7);
  });

  it('returns negative count when b < a', () => {
    expect(daysBetween('2024-01-08', '2024-01-01')).toBe(-7);
  });

  it('returns 0 for same date', () => {
    expect(daysBetween('2024-06-15', '2024-06-15')).toBe(0);
  });

  it('handles year boundaries', () => {
    expect(daysBetween('2024-12-31', '2025-01-01')).toBe(1);
  });
});

describe('clampDate', () => {
  it('returns unchanged date within bounds', () => {
    expect(clampDate('2024-06-15', '2024-01-01', '2024-12-31')).toBe('2024-06-15');
  });

  it('clamps to min when date is below range', () => {
    expect(clampDate('2023-12-31', '2024-01-01', '2024-12-31')).toBe('2024-01-01');
  });

  it('clamps to max when date is above range', () => {
    expect(clampDate('2025-01-01', '2024-01-01', '2024-12-31')).toBe('2024-12-31');
  });

  it('returns min when date equals min', () => {
    expect(clampDate('2024-01-01', '2024-01-01', '2024-12-31')).toBe('2024-01-01');
  });

  it('returns max when date equals max', () => {
    expect(clampDate('2024-12-31', '2024-01-01', '2024-12-31')).toBe('2024-12-31');
  });
});

describe('isToday', () => {
  it('returns true for today()', () => {
    expect(isToday(today())).toBe(true);
  });

  it('returns false for a past date', () => {
    expect(isToday('2020-01-01')).toBe(false);
  });

  it('returns false for a future date', () => {
    expect(isToday('2099-01-01')).toBe(false);
  });
});

describe('isPast', () => {
  it('returns true for a clearly past date', () => {
    expect(isPast('1990-01-01')).toBe(true);
  });

  it('returns false for today()', () => {
    expect(isPast(today())).toBe(false);
  });

  it('returns false for a future date', () => {
    expect(isPast(addDays(today(), 1))).toBe(false);
  });
});

describe('isoWeekKey', () => {
  it('returns a key matching /^\\d{4}-W\\d{2}$/ format', () => {
    expect(isoWeekKey('2024-06-15')).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('handles ISO week year boundary: 2024-12-30 -> 2025-W01', () => {
    expect(isoWeekKey('2024-12-30')).toBe('2025-W01');
  });

  it('handles 2024-12-29 -> 2024-W52 (still in 2024 ISO week)', () => {
    expect(isoWeekKey('2024-12-29')).toBe('2024-W52');
  });

  it('handles 2024-12-31 -> 2025-W01 (also in next ISO year)', () => {
    expect(isoWeekKey('2024-12-31')).toBe('2025-W01');
  });

  it('handles normal mid-year week', () => {
    // 2024-01-01 is in ISO week 2024-W01 (Monday)
    expect(isoWeekKey('2024-01-01')).toBe('2024-W01');
  });
});

describe('monthKey', () => {
  it('returns YYYY-MM format', () => {
    expect(monthKey('2024-06-15')).toBe('2024-06');
  });

  it('returns last month of year', () => {
    expect(monthKey('2024-12-31')).toBe('2024-12');
  });

  it('returns first month of year', () => {
    expect(monthKey('2024-01-01')).toBe('2024-01');
  });
});

describe('toPtTimeLabel', () => {
  it('returns a string matching /^\\d{2}:\\d{2} PT$/', () => {
    // 2026-04-24T19:30:00Z => 12:30 PT (UTC-7 in PDT)
    expect(toPtTimeLabel('2026-04-24T19:30:00Z')).toMatch(/^\d{2}:\d{2} PT$/);
  });

  it('converts UTC timestamp to PT correctly (PDT offset: UTC-7)', () => {
    // 2026-04-24T19:30:00Z = 12:30 PT (PDT is UTC-7)
    expect(toPtTimeLabel('2026-04-24T19:30:00Z')).toBe('12:30 PT');
  });

  it('handles midnight UTC', () => {
    // 2026-01-15T08:00:00Z = midnight PT (PST is UTC-8)
    expect(toPtTimeLabel('2026-01-15T08:00:00Z')).toBe('00:00 PT');
  });
});
