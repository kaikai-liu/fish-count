// tests/unit/components/PerAnglerMetric-forecast.test.ts
// D-25 / D-30 / D-08: verifies the locked verbatim copy constants exist and the
// kind='forecast' / kind='historical' branches use the correct strings.
//
// This is a constants-and-contract test, not a DOM render test, because Svelte 5
// component testing infra is not yet wired in this project. The component file
// is greppable for the literal strings — see acceptance criteria.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FORECAST_LABEL, NOT_ENOUGH_HISTORY, PI_LABEL } from '../../../src/lib/copy/metrics';

const PER_ANGLER_PATH = join(process.cwd(), 'src/lib/components/PerAnglerMetric.svelte');

describe('PerAnglerMetric forecast extension (D-25, D-30, D-08)', () => {
  it('FORECAST_LABEL is verbatim "forecast" (D-25)', () => {
    expect(FORECAST_LABEL).toBe('forecast');
  });

  it('NOT_ENOUGH_HISTORY is verbatim "not enough history" (D-08)', () => {
    expect(NOT_ENOUGH_HISTORY).toBe('not enough history');
  });

  it('PI_LABEL is verbatim "80% PI" (D-04)', () => {
    expect(PI_LABEL).toBe('80% PI');
  });

  it('PerAnglerMetric.svelte imports the three forecast copy constants', () => {
    const src = readFileSync(PER_ANGLER_PATH, 'utf8');
    expect(src).toMatch(/FORECAST_LABEL/);
    expect(src).toMatch(/NOT_ENOUGH_HISTORY/);
    expect(src).toMatch(/PI_LABEL/);
  });

  it('PerAnglerMetric.svelte declares kind prop with default "historical" (D-25)', () => {
    const src = readFileSync(PER_ANGLER_PATH, 'utf8');
    expect(src).toMatch(/kind\s*=\s*'historical'/);
  });

  it('PerAnglerMetric.svelte uses Math.round for forecast value display (D-23 integer-only)', () => {
    const src = readFileSync(PER_ANGLER_PATH, 'utf8');
    // Forecast kind branch must contain Math.round(value)
    expect(src).toMatch(/Math\.round\(value/);
  });

  it('PerAnglerMetric.svelte links forecast kind to /about#forecasts anchor (D-30)', () => {
    const src = readFileSync(PER_ANGLER_PATH, 'utf8');
    expect(src).toContain('/about#forecasts');
  });

  it('PerAnglerMetric.svelte renders pi bounds with Math.round and PI_LABEL (D-23 + D-04)', () => {
    const src = readFileSync(PER_ANGLER_PATH, 'utf8');
    expect(src).toMatch(/Math\.round\(pi\.low\)/);
    expect(src).toMatch(/Math\.round\(pi\.high\)/);
    expect(src).toMatch(/PI_LABEL/);
  });
});
