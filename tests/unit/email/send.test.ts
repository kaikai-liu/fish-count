import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_k?: string) {}
  }
}));
vi.mock('$lib/server/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}));

// Re-import after mocking. (vi.mock is hoisted, so this static import is fine.)
import { sendUserEmail } from '../../../src/lib/email/send';

describe('sendUserEmail', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'mock-id-123' }, error: null });
    process.env.RESEND_API_KEY = 'rk_test';
    process.env.SUBSCRIBER_FROM_EMAIL = 'alerts@fishcount.app';
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.SUBSCRIBER_FROM_EMAIL;
  });

  it('passes List-Unsubscribe + List-Unsubscribe-Post headers (RFC 8058)', async () => {
    await sendUserEmail({
      to: 'a@b.com',
      subject: 'Confirm your FishCount alerts',
      html: '<p>x</p>',
      text: 'x',
      unsubscribeMailto: 'unsubscribe+T@fishcount.app',
      unsubscribeUrl: 'https://fishcount.app/alerts/unsubscribe?token=T'
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0][0];
    expect(payload.headers['List-Unsubscribe']).toBe(
      '<mailto:unsubscribe+T@fishcount.app>, <https://fishcount.app/alerts/unsubscribe?token=T>'
    );
    expect(payload.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('disables open + click tracking per send (Pitfall 4)', async () => {
    await sendUserEmail({
      to: 'a@b.com',
      subject: 'x',
      html: 'x',
      text: 'x',
      unsubscribeMailto: 'u@x.com',
      unsubscribeUrl: 'https://x.com/u'
    });
    const payload = sendMock.mock.calls[0][0];
    expect(payload.tracking).toEqual({ open_tracking: false, click_tracking: false });
  });

  it('sends both html and text (multipart)', async () => {
    await sendUserEmail({
      to: 'a@b.com',
      subject: 'x',
      html: '<p>html</p>',
      text: 'text body',
      unsubscribeMailto: 'u@x.com',
      unsubscribeUrl: 'https://x.com/u'
    });
    const payload = sendMock.mock.calls[0][0];
    expect(payload.html).toBe('<p>html</p>');
    expect(payload.text).toBe('text body');
  });

  it('uses SUBSCRIBER_FROM_EMAIL in the From: header (DMARC isolation)', async () => {
    await sendUserEmail({
      to: 'a@b.com',
      subject: 'x',
      html: 'x',
      text: 'x',
      unsubscribeMailto: 'u@x.com',
      unsubscribeUrl: 'https://x.com/u'
    });
    const payload = sendMock.mock.calls[0][0];
    expect(payload.from).toContain('alerts@fishcount.app');
  });

  it('throws when RESEND_API_KEY unset', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(
      sendUserEmail({
        to: 'a@b.com',
        subject: 'x',
        html: 'x',
        text: 'x',
        unsubscribeMailto: 'u@x.com',
        unsubscribeUrl: 'https://x.com/u'
      })
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it('throws when SUBSCRIBER_FROM_EMAIL unset', async () => {
    delete process.env.SUBSCRIBER_FROM_EMAIL;
    await expect(
      sendUserEmail({
        to: 'a@b.com',
        subject: 'x',
        html: 'x',
        text: 'x',
        unsubscribeMailto: 'u@x.com',
        unsubscribeUrl: 'https://x.com/u'
      })
    ).rejects.toThrow(/SUBSCRIBER_FROM_EMAIL/);
  });

  it('returns the Resend message id', async () => {
    const id = await sendUserEmail({
      to: 'a@b.com',
      subject: 'x',
      html: 'x',
      text: 'x',
      unsubscribeMailto: 'u@x.com',
      unsubscribeUrl: 'https://x.com/u'
    });
    expect(id).toBe('mock-id-123');
  });

  it('throws on Resend error', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: 'rate limited' } });
    await expect(
      sendUserEmail({
        to: 'a@b.com',
        subject: 'x',
        html: 'x',
        text: 'x',
        unsubscribeMailto: 'u@x.com',
        unsubscribeUrl: 'https://x.com/u'
      })
    ).rejects.toThrow(/rate limited/);
  });

  it('B3 fix: Resend success without data.id throws (audit-trail mitigation T-04-DISPATCH-01)', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      sendUserEmail({
        to: 'a@b.com',
        subject: 'x',
        html: 'x',
        text: 'x',
        unsubscribeMailto: 'u@x.com',
        unsubscribeUrl: 'https://x.com/u'
      })
    ).rejects.toThrow(/without message id/);
  });
});
