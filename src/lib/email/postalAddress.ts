// src/lib/email/postalAddress.ts
// Phase 4 ALT-07 + UI-SPEC §"<ComplianceFooter>": single source of truth for the
// CAN-SPAM-mandated physical address. Fail-closed: if POSTAL_ADDRESS is unset,
// the email composer throws and the caller (dispatch.ts) treats the alert as
// failed (better to drop one alert than send a non-compliant email).
//
// Operator decision (04-RESEARCH.md §Open Question 2): virtual mailbox / P.O. Box / etc.
// Phase 4 wave 4 blocker — must be confirmed before first prod send.
import { env } from '$env/dynamic/private';

export function POSTAL_ADDRESS(): string {
  const a = env.POSTAL_ADDRESS;
  if (!a || a.trim().length === 0) {
    throw new Error('POSTAL_ADDRESS env var is unset — cannot build a CAN-SPAM-compliant email');
  }
  return a.trim();
}
