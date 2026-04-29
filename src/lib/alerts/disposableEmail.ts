// src/lib/alerts/disposableEmail.ts
// Phase 4 ALT-04: disposable-email rejection.
//
// Backed by `disposable-email-domains-js` (1.24.x) — verified active maintenance
// [04-RESEARCH.md §Standard Stack]. Auto-syncs from canonical disposable-email-domains
// GitHub repo monthly. ~106k+ domains.
//
// PURE — no I/O at function-call time. Set built once at module load via the
// package's `disposableEmailBlocklistSet()` factory (returns a JSON-backed Set).
//
// API discovery (Plan 04-02 deviation Rule 3): the package's actual public API
// is named exports {disposableEmailBlocklist, disposableEmailBlocklistSet,
// isDisposableEmailDomain, isDisposableEmail} — there is no default export.
// We import the Set factory by name (alias `disposableDomains` preserves the
// plan's intended local-binding name + grep marker) and call it once at module
// load to construct an O(1)-lookup Set.
import { disposableEmailBlocklistSet as disposableDomains } from 'disposable-email-domains-js';

// Build the Set once at module load. The package returns a fresh Set each call,
// so memoizing here keeps the hot path allocation-free.
const SET: Set<string> = disposableDomains();

/**
 * Returns true iff the email's domain (case-insensitive) is in the disposable-domain list.
 * Returns false on malformed input (no '@') — Zod email-shape validation runs upstream.
 */
export function isDisposable(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return SET.has(domain);
}
