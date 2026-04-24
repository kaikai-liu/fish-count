// tests/unit/scraper/rate-limiter.test.ts
// ING-03 (≤1 req per 5s) invariant, empirically enforced with real timers.
// This is load-bearing per 01-RESEARCH.md Pitfall 1 (deal-breaker severity):
// a broken rate limiter gets FishCount IP-blocked by the source site.
//
// Test takes ~5s wall time — acceptable because the 5s floor cannot be
// observed under fake timers without re-implementing p-queue's internal
// scheduling. See plan 01-02 §Task 3 rationale.
import { describe, it, expect } from 'vitest';
import { sourceQueue } from '../../../src/lib/scraper/rate-limiter';

describe('sourceQueue (ING-03: ≤1 req per 5s)', () => {
  it('enforces ≥5000ms between two consecutive queued tasks', async () => {
    const startTimes: number[] = [];
    const task = async () => {
      startTimes.push(Date.now());
      // Short work to keep test runtime bounded
      await new Promise((r) => setTimeout(r, 10));
    };

    // Kick off both together — second must wait ≥5s before starting
    const p1 = sourceQueue.add(task);
    const p2 = sourceQueue.add(task);
    await Promise.all([p1, p2]);

    expect(startTimes.length).toBe(2);
    const delta = startTimes[1] - startTimes[0];
    expect(
      delta,
      `Expected ≥5000ms between tasks, got ${delta}ms`
    ).toBeGreaterThanOrEqual(5000);
  }, 15_000); // test-case timeout: 15s (5s rate-limit + buffer)
});
