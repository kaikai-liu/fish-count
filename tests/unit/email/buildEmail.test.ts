import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildEmail, escapeHtml } from '../../../src/lib/email/buildEmail';

describe('escapeHtml', () => {
  it('escapes the dangerous HTML metacharacters', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a "b" \'c\' & d')).toBe('a &quot;b&quot; &#39;c&#39; &amp; d');
  });
});

describe('buildEmail', () => {
  const baseArgs = {
    subject: 'Subject',
    preheader: 'Preheader',
    h1: 'Heading',
    bodyHtml: '<p>Body</p>',
    bodyText: 'Body',
    reasonForReceipt: 'You signed up',
    unsubscribeUrl: 'https://fishcount.app/alerts/unsubscribe?token=t1',
    manageUrl: 'https://fishcount.app/alerts/manage?token=m1'
  };

  beforeEach(() => {
    process.env.POSTAL_ADDRESS = '123 Test St, San Diego CA 92101';
  });
  afterEach(() => {
    delete process.env.POSTAL_ADDRESS;
  });

  it('throws when POSTAL_ADDRESS is unset (ALT-07 fail-closed)', () => {
    delete process.env.POSTAL_ADDRESS;
    expect(() => buildEmail(baseArgs)).toThrow(/POSTAL_ADDRESS/);
  });

  it('throws when POSTAL_ADDRESS is whitespace-only (ALT-07 fail-closed)', () => {
    process.env.POSTAL_ADDRESS = '   ';
    expect(() => buildEmail(baseArgs)).toThrow(/POSTAL_ADDRESS/);
  });

  it('returns html + text with preheader hidden', () => {
    const out = buildEmail(baseArgs);
    expect(out.html).toContain('display:none');
    expect(out.html).toContain('Preheader');
    expect(out.text).toContain('Body');
    expect(out.text).toContain('Unsubscribe: https://fishcount.app/alerts/unsubscribe?token=t1');
  });

  it('renders postal address verbatim in both html and text', () => {
    const out = buildEmail(baseArgs);
    expect(out.html).toContain('123 Test St, San Diego CA 92101');
    expect(out.text).toContain('123 Test St, San Diego CA 92101');
  });

  it('renders compliance brand line', () => {
    const out = buildEmail(baseArgs);
    expect(out.html).toContain('Public San Diego charter-boat dock-totals aggregator');
    expect(out.text).toContain('Public San Diego charter-boat dock-totals aggregator');
  });

  it('escapes XSS attempts in subject/preheader/h1', () => {
    const out = buildEmail({ ...baseArgs, h1: '<script>alert(1)</script>' });
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).not.toContain('<script>alert(1)</script>');
  });

  it('renders unsubscribe URL in compliance footer block', () => {
    const out = buildEmail(baseArgs);
    expect(out.html).toContain('https://fishcount.app/alerts/unsubscribe?token=t1');
  });

  it('emits the manage URL in plain text when provided', () => {
    const out = buildEmail(baseArgs);
    expect(out.text).toContain('Manage alerts: https://fishcount.app/alerts/manage?token=m1');
  });

  it('omits manage line in plain text when manageUrl absent', () => {
    const { manageUrl: _omit, ...noManage } = baseArgs;
    void _omit;
    const out = buildEmail(noManage);
    expect(out.text).not.toContain('Manage alerts:');
  });
});
