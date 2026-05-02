// tests/unit/copy/empty-states.test.ts
// Phase 8 Plan 04 — POL-03 / D-33. Verifies the 4 ticker × scenario variants
// + the compare default. Each variant interpolates the verbatim source label
// (no normalization) and produces user-facing copy that distinguishes "no
// history at all" from "no history in this range."
import { describe, it, expect } from 'vitest';
import { EMPTY_STATES } from '../../../src/lib/copy/empty-states';

describe('EMPTY_STATES', () => {
  it('exposes all 5 variant keys', () => {
    expect(typeof EMPTY_STATES.boatNoHistoryAtAll).toBe('function');
    expect(typeof EMPTY_STATES.boatNoHistoryInRange).toBe('function');
    expect(typeof EMPTY_STATES.speciesNoHistoryInRange).toBe('function');
    expect(typeof EMPTY_STATES.landingNoHistoryInRange).toBe('function');
    expect(typeof EMPTY_STATES.compareNoSelection).toBe('function');
  });

  it('boatNoHistoryAtAll: heading uses verbatim boat name + "no scraped trips yet"', () => {
    const out = EMPTY_STATES.boatNoHistoryAtAll('Premier');
    expect(out.heading).toBe('Premier has no scraped trips yet');
    expect(out.body).toMatch(/Check back/);
  });

  it('boatNoHistoryInRange: invites widening the range', () => {
    const out = EMPTY_STATES.boatNoHistoryInRange('Premier');
    expect(out.heading).toBe('No Premier trips in this range');
    expect(out.body).toMatch(/widening/i);
  });

  it('speciesNoHistoryInRange: uses verbatim species name', () => {
    const out = EMPTY_STATES.speciesNoHistoryInRange('bluefin');
    expect(out.heading).toBe('No bluefin catches in this range');
    expect(out.body).toMatch(/widening|widen/i);
  });

  it('landingNoHistoryInRange: uses verbatim landing name', () => {
    const out = EMPTY_STATES.landingNoHistoryInRange("Fisherman's Landing");
    expect(out.heading).toBe("No trips from Fisherman's Landing in this range");
  });

  it('compareNoSelection: invites picking a date and target boats', () => {
    const out = EMPTY_STATES.compareNoSelection();
    expect(out.heading).toMatch(/Pick/);
    expect(out.body).toMatch(/2 or 3 boats/);
  });

  it('boat variants distinguish "no history at all" vs "no history in range"', () => {
    const ever = EMPTY_STATES.boatNoHistoryAtAll('Premier');
    const inRange = EMPTY_STATES.boatNoHistoryInRange('Premier');
    expect(ever.heading).not.toBe(inRange.heading);
    expect(ever.body).not.toBe(inRange.body);
  });
});
