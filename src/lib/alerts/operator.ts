// src/lib/alerts/operator.ts
// OPS-01 (billing) + Phase 1 ING-07 (row-count SLA) + Phase 4 ops alerts all use this.
// Source: 00-RESEARCH.md §Q6 "Why not a single channel" — Resend is the templated
// operator channel; healthchecks.io is the dead-man's switch channel (separate).
//
// Phase 0 scope: transactional operator emails only (SPF+DKIM required; DMARC deferred to Phase 4).
import { Resend } from 'resend';
import { logger } from '$lib/server/logger';

export interface OperatorAlert {
  subject: string;
  body: string; // plain text — required
  html?: string; // HTML variant — optional
}

const OPERATOR_FROM_EMAIL_FALLBACK = 'alerts@example.invalid'; // never actually reached — env must be set

export async function sendOperatorAlert(alert: OperatorAlert): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.OPERATOR_EMAIL;
  const from = process.env.OPERATOR_FROM_EMAIL ?? OPERATOR_FROM_EMAIL_FALLBACK;

  if (!apiKey) {
    throw new Error('sendOperatorAlert: RESEND_API_KEY is not set');
  }
  if (!to) {
    throw new Error('sendOperatorAlert: OPERATOR_EMAIL is not set');
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: `FishCount Ops <${from}>`,
    to: [to],
    subject: alert.subject,
    text: alert.body,
    ...(alert.html ? { html: alert.html } : {})
  });

  if (result.error) {
    logger.error({ err: result.error, subject: alert.subject }, 'operator alert send failed');
    throw new Error(`Resend error: ${result.error.message}`);
  }

  logger.info({ id: result.data?.id, subject: alert.subject }, 'operator alert sent');
}
