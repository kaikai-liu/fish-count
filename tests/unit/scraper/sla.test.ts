// tests/unit/scraper/sla.test.ts
// Phase 8 Plan 03 (RTR-06 / D-21) — scraper-failure-only operator alerting.
//
// Replaces the Phase 1 row-count <50% baseline test. New contract per D-21:
//   - alert on outcome IN ('http_error', 'parse_error')
//   - no alert on outcome IN ('success', 'empty', 'killed')
//   - row counts are no longer relevant (off-season zero-row days were
//     false-positiving every winter under the old rule).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Resend at module scope — same pattern as tests/ops/operator-alert.test.ts
const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn(() => ({
    emails: { send: sendMock }
  }))
}));

describe('shouldAlert (pure, RTR-06 / D-21)', () => {
  let shouldAlert: typeof import('../../../src/lib/scraper/sla').shouldAlert;
  beforeEach(async () => {
    const mod = await import('../../../src/lib/scraper/sla');
    shouldAlert = mod.shouldAlert;
  });

  it('alerts on outcome="http_error"', () => {
    expect(shouldAlert('http_error')).toBe(true);
  });

  it('alerts on outcome="parse_error"', () => {
    expect(shouldAlert('parse_error')).toBe(true);
  });

  it('does NOT alert on outcome="success" (regardless of row count — off-season zero days are real)', () => {
    expect(shouldAlert('success')).toBe(false);
  });

  it('does NOT alert on outcome="empty"', () => {
    expect(shouldAlert('empty')).toBe(false);
  });

  it('does NOT alert on outcome="killed" (kill-switch / FIRST_SCRAPE_OK; surfaces via dead-man switch)', () => {
    expect(shouldAlert('killed')).toBe(false);
  });
});

describe('checkSlaAndAlert (side effect, D-21)', () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = {
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      OPERATOR_EMAIL: process.env.OPERATOR_EMAIL,
      OPERATOR_FROM_EMAIL: process.env.OPERATOR_FROM_EMAIL
    };
    process.env.RESEND_API_KEY = 'test-key';
    process.env.OPERATOR_EMAIL = 'ops@example.com';
    process.env.OPERATOR_FROM_EMAIL = 'alerts@fishcount.example';
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'rs_fake' }, error: null });
    vi.resetModules();
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('outcome=success → no alert', async () => {
    const { checkSlaAndAlert } = await import('../../../src/lib/scraper/sla');
    await checkSlaAndAlert('2024-08-15', 'success');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('outcome=empty → no alert', async () => {
    const { checkSlaAndAlert } = await import('../../../src/lib/scraper/sla');
    await checkSlaAndAlert('2024-08-15', 'empty');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('outcome=killed → no alert (dead-man switch handles it)', async () => {
    const { checkSlaAndAlert } = await import('../../../src/lib/scraper/sla');
    await checkSlaAndAlert('2024-08-15', 'killed');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('outcome=http_error → alert dispatched once with date + outcome in subject', async () => {
    const { checkSlaAndAlert } = await import('../../../src/lib/scraper/sla');
    await checkSlaAndAlert('2024-08-15', 'http_error');
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [args] = sendMock.mock.calls[0];
    expect(args.subject).toContain('2024-08-15');
    expect(args.subject).toContain('http_error');
    expect(args.text).toContain('2024-08-15');
  });

  it('outcome=parse_error → alert dispatched with parser-drift body copy', async () => {
    const { checkSlaAndAlert } = await import('../../../src/lib/scraper/sla');
    await checkSlaAndAlert('2024-08-15', 'parse_error');
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [args] = sendMock.mock.calls[0];
    expect(args.subject).toContain('parse_error');
    expect(args.text).toMatch(/parser|schema/i);
  });
});
