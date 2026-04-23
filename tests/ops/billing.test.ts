import { describe, it, expect } from 'vitest';
import {
  checkThresholds,
  emptyState,
  loadOrResetState,
  currentMonthKey,
  type ThresholdState
} from '../../src/lib/ops/billing';

describe('checkThresholds (OPS-01 idempotent threshold state machine)', () => {
  const fresh = (): ThresholdState => emptyState();

  it('returns no crossings when spend below smallest threshold', () => {
    const r = checkThresholds(5, fresh());
    expect(r.crossed).toEqual([]);
    expect(r.newState).toEqual({ 20: false, 50: false, 100: false });
  });

  it('crosses $20 when spend exactly 20', () => {
    const r = checkThresholds(20, fresh());
    expect(r.crossed).toEqual([20]);
    expect(r.newState).toEqual({ 20: true, 50: false, 100: false });
  });

  it('crosses $20 (and only $20) when spend is 25', () => {
    const r = checkThresholds(25, fresh());
    expect(r.crossed).toEqual([20]);
    expect(r.newState).toEqual({ 20: true, 50: false, 100: false });
  });

  it('crosses $20 and $50 together when spend is 60 and no thresholds previously crossed', () => {
    const r = checkThresholds(60, fresh());
    expect(r.crossed).toEqual([20, 50]);
    expect(r.newState).toEqual({ 20: true, 50: true, 100: false });
  });

  it('crosses all three when spend is 150 from a fresh state', () => {
    const r = checkThresholds(150, fresh());
    expect(r.crossed).toEqual([20, 50, 100]);
    expect(r.newState).toEqual({ 20: true, 50: true, 100: true });
  });

  it('IDEMPOTENT: re-running with same spend produces zero crossings', () => {
    const after = checkThresholds(25, fresh()).newState;
    const r2 = checkThresholds(25, after);
    expect(r2.crossed).toEqual([]);
    expect(r2.newState).toEqual(after);
  });

  it('IDEMPOTENT: re-running with slightly higher spend but still below next threshold is a no-op', () => {
    const after = checkThresholds(25, fresh()).newState;
    const r2 = checkThresholds(30, after);
    expect(r2.crossed).toEqual([]);
  });

  it('advances to $50 when state has $20 marked and spend crosses $50', () => {
    const after20 = checkThresholds(25, fresh()).newState; // { 20: true, ... }
    const r = checkThresholds(55, after20);
    expect(r.crossed).toEqual([50]);
    expect(r.newState).toEqual({ 20: true, 50: true, 100: false });
  });

  it('does not un-mark a threshold on a spend decrease', () => {
    // Spend can theoretically decrease (credits, refunds). We never downgrade state.
    const after = checkThresholds(60, fresh()).newState;
    const r = checkThresholds(10, after);
    expect(r.crossed).toEqual([]);
    expect(r.newState).toEqual({ 20: true, 50: true, 100: false });
  });
});

describe('loadOrResetState (OPS-01 month rollover)', () => {
  it('returns fresh state when stored is null', () => {
    const r = loadOrResetState(null);
    expect(r.thresholds).toEqual({ 20: false, 50: false, 100: false });
    expect(r.month).toBe(currentMonthKey());
  });

  it('resets when stored month is prior month', () => {
    const priorMonth = '1999-01';
    const r = loadOrResetState({
      month: priorMonth,
      thresholds: { 20: true, 50: true, 100: true }
    });
    expect(r.thresholds).toEqual({ 20: false, 50: false, 100: false });
    expect(r.month).not.toBe(priorMonth);
  });

  it('preserves state when stored month matches current month', () => {
    const state = { 20: true, 50: false, 100: false };
    const r = loadOrResetState({ month: currentMonthKey(), thresholds: state });
    expect(r.thresholds).toEqual(state);
  });
});
