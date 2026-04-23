// src/lib/ops/billing.ts
// Source: 00-RESEARCH.md §"Billing threshold checker (unit-testable)" lines 960–979.
// OPS-01: detect newly-crossed spend thresholds, idempotent per calendar month.
//
// NOTE: uses relative import (not `$lib/`) because this module is also consumed by
// scripts/billing-watcher.ts which runs under `node --experimental-strip-types` in
// GitHub Actions — the SvelteKit `$lib` alias is not resolved in that context.
// The `.ts` extension is required because Node 22's ESM loader (with
// --experimental-strip-types) does NOT auto-resolve extensionless specifiers.
// SvelteKit/Vite strip the extension at bundle time, so this doesn't affect the app build.
import { today } from '../shared/dates.ts';

export type Threshold = 20 | 50 | 100;
export type ThresholdState = { 20: boolean; 50: boolean; 100: boolean };

export interface ThresholdResult {
  crossed: Threshold[];
  newState: ThresholdState;
}

export function checkThresholds(spendUsd: number, state: ThresholdState): ThresholdResult {
  const crossed: Threshold[] = [];
  const newState: ThresholdState = { ...state };
  for (const t of [20, 50, 100] as const) {
    if (spendUsd >= t && !state[t]) {
      crossed.push(t);
      newState[t] = true;
    }
  }
  return { crossed, newState };
}

/** Returns the Pacific-time month key in YYYY-MM format; used for state file resets. */
export function currentMonthKey(): string {
  return today().slice(0, 7); // YYYY-MM-DD → YYYY-MM
}

/** Factory for a fresh state (no thresholds crossed yet). */
export function emptyState(): ThresholdState {
  return { 20: false, 50: false, 100: false };
}

/** Decides whether the incoming stored state applies to the current month or should reset. */
export function loadOrResetState(
  stored: { month: string; thresholds: ThresholdState } | null
): { month: string; thresholds: ThresholdState } {
  const month = currentMonthKey();
  if (!stored || stored.month !== month) {
    return { month, thresholds: emptyState() };
  }
  return stored;
}
