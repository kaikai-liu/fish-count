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

/**
 * Sanitize a subject line before it lands in Better Stack.
 *
 * WR-03 rationale: today all subjects are static ops templates ("Billing spend
 * crossed $20"). Phase 4 will introduce subscriber-facing alert subjects that
 * can contain emails / boat names / user-supplied species strings. Better Stack
 * retains logs for 30 days, so letting raw subjects through creates a slow PII
 * accumulation.
 *
 * Strategy: strip any email-looking substring, truncate to 60 chars. This keeps
 * the log line useful for ops debugging ("billing $20 crossed…") while
 * defusing the common Phase 4 leak shapes.
 */
export function safeSubject(s: string): string {
  return s.replace(/[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]').slice(0, 60);
}

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

  // WR-03: log a sanitized subject (not alert.subject) so emails/PII never
  // reach Better Stack. Field renamed to subjectTemplate to signal "not raw."
  if (result.error) {
    logger.error(
      { err: result.error, subjectTemplate: safeSubject(alert.subject) },
      'operator alert send failed'
    );
    throw new Error(`Resend error: ${result.error.message}`);
  }

  logger.info(
    { id: result.data?.id, subjectTemplate: safeSubject(alert.subject) },
    'operator alert sent'
  );
}
