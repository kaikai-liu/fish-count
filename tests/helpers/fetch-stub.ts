// tests/helpers/fetch-stub.ts
// Monkey-patch globalThis.fetch for test scope. Modeled on the inline pattern
// in tests/scheduler/heartbeat.test.ts (analog: "exact" match quality).
//
// Usage:
//   const mock = stubFetch({ status: 200, body: '<html>...</html>' });
//   // ... run code under test ...
//   expect(mock.mock.calls[0][0]).toContain('boats.php');
//   restoreFetch();  // in afterEach
//
// If an array of responses is passed, each call consumes one; when exhausted,
// the LAST response is sticky (so background robots.txt fetches can keep working).
import { vi } from 'vitest';

export interface StubResponse {
  status?: number;
  body?: string;
  delayMs?: number;
}

let originalFetch: typeof globalThis.fetch | null = null;

export function stubFetch(
  responses: StubResponse | StubResponse[]
): ReturnType<typeof vi.fn> {
  if (originalFetch === null) {
    originalFetch = globalThis.fetch;
  }
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const fallback: StubResponse = Array.isArray(responses)
    ? (responses[responses.length - 1] ?? { status: 200, body: 'OK' })
    : responses;
  const mock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const spec = queue.shift() ?? fallback;
    if (spec.delayMs) await new Promise((r) => setTimeout(r, spec.delayMs));
    return new Response(spec.body ?? '', { status: spec.status ?? 200 });
  });
  globalThis.fetch = mock as unknown as typeof globalThis.fetch;
  return mock;
}

export function restoreFetch(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
}
