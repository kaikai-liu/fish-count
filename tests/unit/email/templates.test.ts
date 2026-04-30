import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  renderConfirmationEmail,
  renderHotDayEmail,
  renderRunStartEmail,
  hotDayEmail,
  startingToRunEmail
} from '../../../src/lib/email/templates';

beforeEach(() => {
  process.env.POSTAL_ADDRESS = 'PO Box 1, San Diego CA 92101';
});
afterEach(() => {
  delete process.env.POSTAL_ADDRESS;
});

describe('renderConfirmationEmail', () => {
  it('uses verbatim UI-SPEC subject + preheader + h1', () => {
    const out = renderConfirmationEmail({
      confirmUrl: 'https://fishcount.app/alerts/confirm?token=tk',
      signupDate: '2026-04-27',
      maskedIp: '73.x.x.x',
      unsubscribeUrl: 'https://fishcount.app/alerts/unsubscribe?token=u'
    });
    expect(out.subject).toBe('Confirm your FishCount alerts');
    expect(out.preheader).toBe("One click to activate. We won't email until you do.");
    expect(out.h1).toBe('Confirm your alerts');
    expect(out.bodyText).toContain('https://fishcount.app/alerts/confirm?token=tk');
    expect(out.reasonForReceipt).toContain('2026-04-27');
    expect(out.reasonForReceipt).toContain('73.x.x.x');
  });

  it('emits the confirm URL in both HTML and plain-text bodies', () => {
    const out = renderConfirmationEmail({
      confirmUrl: 'https://fishcount.app/alerts/confirm?token=tk',
      signupDate: '2026-04-27',
      maskedIp: '73.x.x.x',
      unsubscribeUrl: 'https://fishcount.app/alerts/unsubscribe?token=u'
    });
    expect(out.bodyHtml).toContain('https://fishcount.app/alerts/confirm?token=tk');
    expect(out.bodyText).toContain('https://fishcount.app/alerts/confirm?token=tk');
  });
});

describe('renderHotDayEmail', () => {
  it('renders verbatim trip_type and n=X anglers + multiplier (CLAUDE.md non-negotiable #4)', () => {
    const out = renderHotDayEmail({
      boatName: 'Pacific Dawn',
      boatId: 7,
      tripType: '1/2 Day AM',
      todayValue: 4.5,
      todayAnglers: 18,
      trailingAvg: 1.5,
      multiplier: 3.0,
      speciesList: ['yellowtail', 'calico bass'],
      signupDate: '2026-04-20',
      unsubscribeUrl: 'https://fishcount.app/alerts/unsubscribe?token=u',
      manageUrl: 'https://fishcount.app/alerts/manage?token=m'
    });
    expect(out.subject).toBe('Hot day: Pacific Dawn');
    expect(out.h1).toBe('Hot day on Pacific Dawn');
    expect(out.bodyText).toContain('1/2 Day AM');
    expect(out.bodyText).toContain('n=18 anglers');
    expect(out.bodyText).toContain('3.0x');
    expect(out.bodyText).toContain('yellowtail, calico bass');
  });

  it('escapes script tags in boatName (T-04-A9)', () => {
    const out = renderHotDayEmail({
      boatName: '<script>alert(1)</script>',
      boatId: 7,
      tripType: '1/2 Day AM',
      todayValue: 4.5,
      todayAnglers: 18,
      trailingAvg: 1.5,
      multiplier: 3.0,
      speciesList: ['bluefin'],
      signupDate: '2026-04-20',
      unsubscribeUrl: 'https://fishcount.app/u',
      manageUrl: 'https://fishcount.app/m'
    });
    expect(out.bodyHtml).toContain('&lt;script&gt;');
    expect(out.bodyHtml).not.toMatch(/<script>alert/);
  });

  it('escapes user-supplied species names in HTML (T-04-A9)', () => {
    const out = renderHotDayEmail({
      boatName: 'Pacific Dawn',
      boatId: 7,
      tripType: '1/2 Day AM',
      todayValue: 4.5,
      todayAnglers: 18,
      trailingAvg: 1.5,
      multiplier: 3.0,
      speciesList: ['<img src=x onerror=alert(1)>'],
      signupDate: '2026-04-20',
      unsubscribeUrl: 'https://fishcount.app/u',
      manageUrl: 'https://fishcount.app/m'
    });
    expect(out.bodyHtml).toContain('&lt;img');
    expect(out.bodyHtml).not.toContain('<img src=x');
  });

  it('renders preheader with formatted today value + multiplier', () => {
    const out = renderHotDayEmail({
      boatName: 'Pacific Dawn',
      boatId: 7,
      tripType: 'Overnight',
      todayValue: 2.4,
      todayAnglers: 20,
      trailingAvg: 0.8,
      multiplier: 3.0,
      speciesList: ['bluefin'],
      signupDate: '2026-04-20',
      unsubscribeUrl: 'https://fishcount.app/u',
      manageUrl: 'https://fishcount.app/m'
    });
    expect(out.preheader).toContain('Overnight');
    expect(out.preheader).toContain('3.0x');
  });
});

describe('renderRunStartEmail', () => {
  it('uses verbatim domain language (species + trip_type)', () => {
    const out = renderRunStartEmail({
      species: 'bluefin',
      tripType: 'Overnight',
      rolling7Avg: 0.8,
      yearAgoAvg: 0.4,
      multiplier: 2.0,
      nBoats: 12,
      signupDate: '2026-04-20',
      unsubscribeUrl: 'https://fishcount.app/u',
      manageUrl: 'https://fishcount.app/m'
    });
    expect(out.subject).toBe('bluefin starting to run');
    expect(out.h1).toBe('bluefin is starting to run');
    expect(out.bodyText).toContain('Overnight');
    expect(out.bodyText).toContain('2.0x');
  });

  it('escapes user-supplied species in HTML (T-04-A9)', () => {
    const out = renderRunStartEmail({
      species: '<script>1</script>',
      tripType: 'Full Day',
      rolling7Avg: 0.8,
      yearAgoAvg: 0.4,
      multiplier: 2.0,
      nBoats: 12,
      signupDate: '2026-04-20',
      unsubscribeUrl: 'https://fishcount.app/u',
      manageUrl: 'https://fishcount.app/m'
    });
    expect(out.bodyHtml).toContain('&lt;script&gt;');
    expect(out.bodyHtml).not.toMatch(/<script>1<\/script>/);
  });
});

// ---------- Phase 4 ALT-09/10 template extensions (Plan 07) ----------
//
// Plan 07 prescribes export names hotDayEmail / startingToRunEmail. Plan 03
// already shipped renderHotDayEmail / renderRunStartEmail; the dispatcher (Task
// 3) imports the Plan-07 names. Templates.ts ships both: thin alias re-exports
// adapt the legacy arg shape (boatName, etc.) to the dispatcher's HotDayCandidate
// shape (boatDisplayName, subscriberEmail, etc.). These tests assert the alias
// surface fulfills the dispatcher contract — including the T-04-A9 escape
// invariants on the dispatcher-supplied raw display values.

describe('hotDayEmail (Plan 07 alias for renderHotDayEmail with HotDayCandidate-shaped args)', () => {
  it('renders verbatim UI-SPEC subject + H1 + per-angler discipline (CLAUDE.md non-negotiable #4)', () => {
    const out = hotDayEmail({
      subscriberEmail: 'a@b.com',
      boatDisplayName: 'Pacific Dawn',
      boatId: 7,
      tripType: '1/2 Day AM',
      todayValue: 4.5,
      todayAnglers: 18,
      trailingAvg: 1.5,
      multiplier: 3.0,
      speciesList: ['yellowtail', 'calico bass'],
      signupDate: '2026-04-20',
      unsubscribeUrl: 'https://fishcount.app/alerts/unsubscribe?token=u',
      manageUrl: 'https://fishcount.app/alerts/manage?token=m'
    });
    expect(out.subject).toBe('Hot day: Pacific Dawn');
    expect(out.h1).toBe('Hot day on Pacific Dawn');
    expect(out.bodyText).toContain('1/2 Day AM');
    expect(out.bodyText).toContain('n=18 anglers');
    expect(out.bodyText).toContain('3.0x');
    expect(out.bodyText).toContain('yellowtail, calico bass');
    expect(out.bodyHtml).toContain('href="https://fishcount.app/boats/7"');
  });

  it('escapes HTML metacharacters in boat display_name (T-04-A9)', () => {
    const out = hotDayEmail({
      subscriberEmail: 'a@b.com',
      boatDisplayName: '<script>alert("xss")</script>',
      boatId: 7,
      tripType: '1/2 Day AM',
      todayValue: 4.5,
      todayAnglers: 18,
      trailingAvg: 1.5,
      multiplier: 3.0,
      speciesList: ['yellowtail'],
      signupDate: '2026-04-20',
      unsubscribeUrl: 'https://fishcount.app/alerts/unsubscribe?token=u',
      manageUrl: 'https://fishcount.app/alerts/manage?token=m'
    });
    expect(out.bodyHtml).toContain('&lt;script&gt;');
    expect(out.bodyHtml).not.toContain('<script>alert("xss")</script>');
  });

  it('escapes HTML metacharacters in trip_type (T-04-A9)', () => {
    const out = hotDayEmail({
      subscriberEmail: 'a@b.com',
      boatDisplayName: 'Pacific Dawn',
      boatId: 7,
      tripType: '"><img onerror=1>',
      todayValue: 4.5,
      todayAnglers: 18,
      trailingAvg: 1.5,
      multiplier: 3.0,
      speciesList: ['yellowtail'],
      signupDate: '2026-04-20',
      unsubscribeUrl: 'https://fishcount.app/alerts/unsubscribe?token=u',
      manageUrl: 'https://fishcount.app/alerts/manage?token=m'
    });
    expect(out.bodyHtml).toContain('&quot;&gt;&lt;img');
  });
});

describe('startingToRunEmail (Plan 07 alias for renderRunStartEmail with RunCandidate-shaped args)', () => {
  it('renders verbatim UI-SPEC subject + H1 + verbatim trip_type', () => {
    const out = startingToRunEmail({
      subscriberEmail: 'a@b.com',
      species: 'bluefin',
      tripType: 'Overnight',
      rolling7Avg: 3.0,
      yearAgoAvg: 0.5,
      multiplier: 6.0,
      nBoats: 4,
      signupDate: '2026-04-20',
      unsubscribeUrl: 'https://fishcount.app/alerts/unsubscribe?token=u',
      manageUrl: 'https://fishcount.app/alerts/manage?token=m'
    });
    expect(out.subject).toBe('bluefin starting to run');
    expect(out.h1).toBe('bluefin is starting to run');
    expect(out.bodyText).toContain('Overnight');
    expect(out.bodyText).toContain('6.0x');
    expect(out.bodyHtml).toContain(
      'href="https://fishcount.app/trends?species=bluefin&tripType=Overnight"'
    );
  });

  it('escapes HTML metacharacters in species (T-04-A9)', () => {
    const out = startingToRunEmail({
      subscriberEmail: 'a@b.com',
      species: 'tuna&shark',
      tripType: 'Overnight',
      rolling7Avg: 3.0,
      yearAgoAvg: 0.5,
      multiplier: 6.0,
      nBoats: 4,
      signupDate: '2026-04-20',
      unsubscribeUrl: 'https://fishcount.app/alerts/unsubscribe?token=u',
      manageUrl: 'https://fishcount.app/alerts/manage?token=m'
    });
    expect(out.bodyHtml).toContain('tuna&amp;shark');
  });
});
