import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the resend module before any imports of src/lib/alerts/operator
const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn(() => ({
    emails: { send: sendMock }
  }))
}));

describe('sendOperatorAlert (OPS-01 Resend wrapper)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'rs_123' }, error: null });
    process.env.RESEND_API_KEY = 'test-key';
    process.env.OPERATOR_EMAIL = 'ops@example.com';
    process.env.OPERATOR_FROM_EMAIL = 'alerts@fishcount.example';
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;
    const { sendOperatorAlert } = await import('../../src/lib/alerts/operator');
    await expect(sendOperatorAlert({ subject: 's', body: 'b' })).rejects.toThrow(/RESEND_API_KEY/);
  });

  it('throws when OPERATOR_EMAIL is missing', async () => {
    delete process.env.OPERATOR_EMAIL;
    const { sendOperatorAlert } = await import('../../src/lib/alerts/operator');
    await expect(sendOperatorAlert({ subject: 's', body: 'b' })).rejects.toThrow(/OPERATOR_EMAIL/);
  });

  it('calls Resend.emails.send with correct args', async () => {
    const { sendOperatorAlert } = await import('../../src/lib/alerts/operator');
    await sendOperatorAlert({ subject: 'Test', body: 'hello' });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [args] = sendMock.mock.calls[0];
    expect(args.to).toEqual(['ops@example.com']);
    expect(args.from).toContain('alerts@fishcount.example');
    expect(args.subject).toBe('Test');
    expect(args.text).toBe('hello');
  });

  it('includes html when provided', async () => {
    const { sendOperatorAlert } = await import('../../src/lib/alerts/operator');
    await sendOperatorAlert({ subject: 's', body: 'b', html: '<p>b</p>' });
    const [args] = sendMock.mock.calls[0];
    expect(args.html).toBe('<p>b</p>');
  });

  it('throws when Resend returns an error', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'rate limited' } });
    const { sendOperatorAlert } = await import('../../src/lib/alerts/operator');
    await expect(sendOperatorAlert({ subject: 's', body: 'b' })).rejects.toThrow(/rate limited/);
  });
});
