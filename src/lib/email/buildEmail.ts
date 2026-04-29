// src/lib/email/buildEmail.ts
// Phase 4 ALT-05 + ALT-07: server-side HTML+text email composer.
//
// Pure function — no DB, no I/O (besides fail-closed env read for POSTAL_ADDRESS
// delegated via postalAddress.ts). Returns { html, text } so the caller (send.ts)
// owns transport.
//
// Inline-style discipline: every <td> has `style="..."` because email clients strip
// classes and <head> styles inconsistently (UI-SPEC §"Email-client safety").
//
// Hand-built table-based 600px container per UI-SPEC §<EmailLayout>. NOT a Svelte
// component — Resend templates are HTML strings; no Svelte runtime in email.
//
// Decimal/precision discipline: per-angler values rendered via formatPerAngler
// from $lib/shared/format (UI-SPEC §FLAG #9 — single source of truth shared with
// PerAnglerMetric.svelte to prevent web/email drift).
import { POSTAL_ADDRESS } from './postalAddress';

/** HTML-escape user-supplied values to defend against injection in subscriber-facing emails (T-04-A9). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface BuildEmailArgs {
  subject: string;
  preheader: string;
  h1: string;
  bodyHtml: string; // pre-rendered, already-escaped content blocks
  bodyText: string; // plain-text equivalent of bodyHtml
  reasonForReceipt: string; // verbatim text, must be safe (no html injection — caller's job)
  reasonForReceiptHtml?: string; // optional HTML version with manage/unsubscribe inline links
  unsubscribeUrl: string;
  manageUrl?: string;
}

export function buildEmail(args: BuildEmailArgs): { html: string; text: string } {
  const postal = POSTAL_ADDRESS(); // fail-closed
  const safeSubject = escapeHtml(args.subject);
  const safePreheader = escapeHtml(args.preheader);
  const safeH1 = escapeHtml(args.h1);
  const safePostal = escapeHtml(postal);
  const safeReason = args.reasonForReceiptHtml ?? escapeHtml(args.reasonForReceipt);
  // URLs are signed; escapeHtml on URLs would mis-escape & in querystrings — caller
  // is responsible for producing a valid URL (signToken returns ASCII-safe base64url).
  const unsubUrl = args.unsubscribeUrl;

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${safePreheader}</div>
<table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;margin:0 auto;border-collapse:collapse;">
  <tr><td style="padding:24px 24px 0 24px;font-size:16px;color:#1d4ed8;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">FishCount</td></tr>
  <tr><td style="padding:24px;font-size:24px;line-height:1.25;font-weight:600;color:#1d4ed8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">${safeH1}</td></tr>
  <tr><td style="padding:0 24px 24px 24px;font-size:16px;line-height:1.5;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">${args.bodyHtml}</td></tr>
  <tr><td style="background:#f8fafc;padding:16px 24px;font-size:14px;line-height:1.5;color:#475569;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">${safeReason}</td></tr>
  <tr><td style="padding:32px 24px 24px 24px;font-size:14px;line-height:1.5;color:#475569;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
    FishCount · Public San Diego charter-boat dock-totals aggregator<br>
    ${safePostal}
  </td></tr>
  <tr><td style="padding:0 24px 32px 24px;font-size:14px;line-height:1.5;color:#475569;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
    Unsubscribe: <a href="${unsubUrl}" style="color:#1d4ed8;text-decoration:underline;">${unsubUrl}</a>
  </td></tr>
</table>
</body></html>`;

  const text = [
    'FishCount',
    '',
    args.h1.toUpperCase(),
    '='.repeat(Math.min(args.h1.length, 60)),
    '',
    args.bodyText,
    '',
    '--- Why am I getting this email? ---',
    args.reasonForReceipt,
    '',
    '--',
    'FishCount · Public San Diego charter-boat dock-totals aggregator',
    postal,
    '',
    `Unsubscribe: ${unsubUrl}`,
    ...(args.manageUrl ? [`Manage alerts: ${args.manageUrl}`] : [])
  ].join('\n');

  return { html, text };
}
