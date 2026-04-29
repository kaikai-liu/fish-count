// src/lib/email/send.ts
// Phase 4 ALT-05 + ALT-07: subscriber-facing Resend send wrapper. SIBLING to
// src/lib/alerts/operator.ts (which is the operator-only wrapper).
//
// Differences from operator.ts:
//   - tracking DISABLED per send (UI-SPEC §"Anti-Feature Guards" #5; Pitfall 4)
//   - List-Unsubscribe + List-Unsubscribe-Post headers (RFC 8058 one-click)
//   - mandatory plain-text + HTML multipart (UI-SPEC §"Plain-text email variants")
//   - compliance footer is part of the bodyHtml/bodyText built upstream by buildEmail
//
// Reuses RESEND_API_KEY env var (same Resend account as operator alerts).
// SUBSCRIBER_FROM_EMAIL env var (Phase 4 new) is the subscriber-facing From: address;
// distinct from OPERATOR_FROM_EMAIL so DMARC reports can isolate per-stream complaints.
//
// PII discipline: never log raw to/subject — use safeSubject from operator.ts (Phase 0).
import { Resend } from 'resend';
import { logger } from '$lib/server/logger';
import { safeSubject } from '$lib/alerts/operator';

export interface SendUserEmailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeMailto: string; // e.g. "unsubscribe+TOKEN@fishcount.app"
  unsubscribeUrl: string; // e.g. "https://fishcount.app/alerts/unsubscribe?token=TOKEN"
}

export async function sendUserEmail(args: SendUserEmailArgs): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SUBSCRIBER_FROM_EMAIL;
  if (!apiKey) throw new Error('sendUserEmail: RESEND_API_KEY is not set');
  if (!from) throw new Error('sendUserEmail: SUBSCRIBER_FROM_EMAIL is not set');

  const resend = new Resend(apiKey);
  // Type the payload loosely so we can include `tracking` even if the @types/resend
  // version we have doesn't yet expose it — the API accepts the field.
  const payload: Record<string, unknown> = {
    from: `FishCount <${from}>`,
    to: [args.to],
    subject: args.subject,
    html: args.html,
    text: args.text,
    headers: {
      // RFC 8058 one-click + RFC 2369 fallback. Both URI methods present.
      'List-Unsubscribe': `<mailto:${args.unsubscribeMailto}>, <${args.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    },
    // UI-SPEC §"Anti-Feature Guards" #5 + Pitfall 4: disable open + click tracking.
    // Resend supports per-send override; nested-form is the canonical shape.
    tracking: { open_tracking: false, click_tracking: false }
  };

  const result = await (
    resend.emails.send as (
      p: unknown
    ) => Promise<{ data?: { id: string } | null; error?: { message: string } | null }>
  )(payload);

  if (result.error) {
    logger.error(
      { err: result.error, subjectTemplate: safeSubject(args.subject) },
      'user_email_send_failed'
    );
    throw new Error(`Resend error: ${result.error.message}`);
  }
  // B3 fix: never return an empty messageId — the dispatcher's audit-trail mitigation
  // (T-04-DISPATCH-01: resend_message_id is the external correlation key when a
  // complaint surfaces) requires a non-empty id on every recordSent row.
  // Throwing here surfaces in dispatch.ts per-candidate try/catch — non-fatal,
  // logged, no recordSent (correct behavior).
  if (!result.data?.id) {
    throw new Error('Resend success without message id — unrecoverable');
  }
  logger.info(
    { id: result.data.id, subjectTemplate: safeSubject(args.subject) },
    'user_email_sent'
  );
  return result.data.id;
}
