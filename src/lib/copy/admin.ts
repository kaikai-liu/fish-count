// src/lib/copy/admin.ts — Phase 8 admin trip-type aliases page copy.
//
// Single source of truth for /admin/trip-types user-facing strings (ALI-03, ALI-04).
// Strings carry operator-facing tone — neutral, plain English, no jargon
// (CLAUDE.md "trust the audience"). Generic "Invalid password" message per
// D-04 Security V7 (no leak of which field was wrong).

export const ADMIN_PAGE_TITLE = 'Trip-type aliases — FishCount admin';
export const ADMIN_HEADING = 'Trip-type aliases';
export const ADMIN_SUBTITLE = 'Map source-site label drift to canonical labels.';

export const STATUS_LABELS: Record<'aliased' | 'accepted' | 'pending', string> = {
  aliased: 'Aliased',
  accepted: 'Canonical',
  pending: 'Pending review'
};

export const ACTION_ALIAS = 'Alias to…';
export const ACTION_ACCEPT = 'Accept as canonical';
export const ACTION_RESET = 'Reset to pending';
export const ACTION_LOGOUT = 'Log out';

export const COL_SOURCE = 'Source label';
export const COL_CANONICAL = 'Canonical';
export const COL_STATUS = 'Status';
export const COL_FIRST_SEEN = 'First seen';
export const COL_LAST_SEEN = 'Last seen';
export const COL_TRIP_COUNT = 'Trips';
export const COL_ACTIONS = 'Actions';

// Login page
export const LOGIN_TITLE = 'Admin login — FishCount';
export const LOGIN_HEADING = 'Admin login';
export const LOGIN_SUBTITLE =
  'Enter the admin password to manage trip-type aliases.';
export const LOGIN_PASSWORD_LABEL = 'Password';
export const LOGIN_SUBMIT = 'Sign in';
/** D-04 / Security V7: generic message — never leak which field was wrong. */
export const LOGIN_INVALID = 'Invalid password';

// Form-level success / error toasts
export const SUCCESS_ALIAS = 'Alias saved.';
export const SUCCESS_ACCEPT = 'Marked as canonical.';
export const SUCCESS_RESET = 'Reset to pending.';
export const SUCCESS_LOGOUT = 'Signed out.';
export const ERR_NOT_AUTHORIZED = 'Not authorized.';
export const ERR_MISCONFIGURED =
  'Admin auth is not configured on this server. Set ADMIN_PASSWORD and ADMIN_COOKIE_SECRET.';
