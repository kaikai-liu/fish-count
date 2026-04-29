// src/lib/email/templates.ts
// Phase 4 ALT-02 + ALT-09 + ALT-10: per-email template builders.
//
// Each render fn returns BuildEmailArgs that buildEmail() wraps with the layout
// shell + compliance footer. Subject + preheader + h1 strings come VERBATIM from
// UI-SPEC §"Per-Email Layouts" — do not paraphrase.
//
// Per-angler decimal rule (CLAUDE.md non-negotiable #3): formatPerAngler shared
// with web component (UI-SPEC §FLAG #9). Trip-type discipline (CLAUDE.md
// non-negotiable #4): every alert body renders the verbatim trip_type label.
//
// T-04-A9 mitigation: all caller-supplied display values (boatName, species,
// tripType) flow through escapeHtml before HTML interpolation.
import { formatPerAngler } from '$lib/shared/format';
import { escapeHtml, type BuildEmailArgs } from './buildEmail';

/** Email 1: Confirmation (ALT-02). UI-SPEC §"Email 1: Confirmation". */
export function renderConfirmationEmail(args: {
  confirmUrl: string;
  signupDate: string; // YYYY-MM-DD PT
  maskedIp: string; // e.g. "73.x.x.x"
  unsubscribeUrl: string;
  manageUrl?: string;
}): BuildEmailArgs {
  // confirmUrl is signed (token in querystring) — do NOT escapeHtml URLs (would
  // mis-escape `&` separators). Caller is responsible for valid URL shape.
  const safeUrl = args.confirmUrl;
  const bodyHtml = `<p style="margin:0 0 16px 0;">Click the button below to confirm your subscription. The link expires in 24 hours. If you didn't sign up, ignore this email — your address won't be added to anything.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;border-collapse:collapse;"><tr><td style="background:#1d4ed8;border-radius:4px;">
  <a href="${safeUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;width:200px;text-align:center;">Confirm subscription</a>
</td></tr></table>
<p style="margin:0;color:#475569;font-size:14px;">Or paste this link in your browser: <a href="${safeUrl}" style="color:#1d4ed8;">${safeUrl}</a></p>`;
  const bodyText = `Click this link to confirm your subscription. The link expires in 24 hours.\n\n${args.confirmUrl}\n\nIf you didn't sign up, ignore this email — your address won't be added to anything.`;
  const reasonText = `You're getting this because you signed up at fishcount.app/alerts on ${args.signupDate} from IP ${args.maskedIp}. If that wasn't you, ignore this email.`;
  return {
    subject: 'Confirm your FishCount alerts',
    preheader: "One click to activate. We won't email until you do.",
    h1: 'Confirm your alerts',
    bodyHtml,
    bodyText,
    reasonForReceipt: reasonText,
    unsubscribeUrl: args.unsubscribeUrl,
    manageUrl: args.manageUrl
  };
}

/** Email 2: Hot-day Alert (ALT-09, ALT-11). UI-SPEC §"Email 2". */
export function renderHotDayEmail(args: {
  boatName: string;
  boatId: number;
  tripType: string; // verbatim domain language
  todayValue: number; // raw — will pass through formatPerAngler
  todayAnglers: number;
  trailingAvg: number; // raw — will pass through formatPerAngler
  multiplier: number; // pre-computed = todayValue / trailingAvg
  speciesList: string[]; // verbatim names
  signupDate: string;
  unsubscribeUrl: string;
  manageUrl: string; // hot-day always includes manage link
}): BuildEmailArgs {
  const safeBoat = escapeHtml(args.boatName);
  const safeTrip = escapeHtml(args.tripType);
  const safeSpeciesList = args.speciesList.map(escapeHtml).join(', ');
  const todayFmt = formatPerAngler(args.todayValue, args.todayAnglers);
  // trailingAvg is a derived ratio; nTrips proxy keeps formatPerAngler from
  // returning '—' when args.todayAnglers happens to be 0 in edge cases.
  const trailingFmt = formatPerAngler(args.trailingAvg, Math.max(args.todayAnglers, 1));
  const xLabel = `${args.multiplier.toFixed(1)}x`;
  const boatUrl = `https://fishcount.app/boats/${args.boatId}`;

  const bodyHtml = `<p style="margin:0 0 16px 0;">Today on <strong>${safeBoat}</strong> (${safeTrip}): <strong>${todayFmt}</strong> fish/angler · n=${args.todayAnglers} anglers. That's ${xLabel} above its trailing 30-day same-trip-type average (${trailingFmt} fish/angler). Species: ${safeSpeciesList}.</p>
<p style="margin:0;"><a href="${boatUrl}" style="color:#1d4ed8;text-decoration:underline;">View ${safeBoat} on FishCount →</a></p>`;
  const bodyText = `Today on ${args.boatName} (${args.tripType}): ${todayFmt} fish/angler. n=${args.todayAnglers} anglers. That's ${xLabel} above its trailing 30-day same-trip-type average (${trailingFmt} fish/angler).\nSpecies: ${args.speciesList.join(', ')}.\n\nView this boat: ${boatUrl}`;
  const reasonHtml = `You're getting this because you followed <strong>${safeBoat}</strong> on fishcount.app on ${args.signupDate}. <a href="${args.manageUrl}" style="color:#1d4ed8;text-decoration:underline;">Manage alerts</a> · <a href="${args.unsubscribeUrl}" style="color:#1d4ed8;text-decoration:underline;">Unsubscribe</a>`;
  const reasonText = `You're getting this because you followed ${args.boatName} on fishcount.app on ${args.signupDate}. Manage: ${args.manageUrl}`;

  return {
    subject: `Hot day: ${args.boatName}`,
    preheader: `${todayFmt} fish/angler today on ${args.tripType} — ${xLabel} above its 30-day average.`,
    h1: `Hot day on ${args.boatName}`,
    bodyHtml,
    bodyText,
    reasonForReceipt: reasonText,
    reasonForReceiptHtml: reasonHtml,
    unsubscribeUrl: args.unsubscribeUrl,
    manageUrl: args.manageUrl
  };
}

/** Email 3: Starting-to-run Alert (ALT-10, ALT-11). UI-SPEC §"Email 3". */
export function renderRunStartEmail(args: {
  species: string; // verbatim domain language
  tripType: string;
  rolling7Avg: number;
  yearAgoAvg: number;
  multiplier: number; // = rolling7Avg / yearAgoAvg
  nBoats: number;
  signupDate: string;
  unsubscribeUrl: string;
  manageUrl: string;
}): BuildEmailArgs {
  const safeSp = escapeHtml(args.species);
  const safeTrip = escapeHtml(args.tripType);
  const todayFmt = formatPerAngler(args.rolling7Avg, Math.max(args.nBoats, 1));
  const baselineFmt = formatPerAngler(args.yearAgoAvg, Math.max(args.nBoats, 1));
  const xLabel = `${args.multiplier.toFixed(1)}x`;
  const trendsUrl = `https://fishcount.app/trends?species=${encodeURIComponent(args.species)}&tripType=${encodeURIComponent(args.tripType)}`;

  const bodyHtml = `<p style="margin:0 0 16px 0;"><strong>${safeSp}</strong> rolling 7-day fleet-wide avg on ${safeTrip} is now <strong>${todayFmt}</strong> fish/angler — ${xLabel} above same-week last year (${baselineFmt} fish/angler). Across ${args.nBoats} reporting boats.</p>
<p style="margin:0;"><a href="${trendsUrl}" style="color:#1d4ed8;text-decoration:underline;">View ${safeSp} trends →</a></p>`;
  const bodyText = `${args.species} rolling 7-day fleet-wide avg on ${args.tripType} is now ${todayFmt} fish/angler — ${xLabel} above same-week last year (${baselineFmt} fish/angler). Across ${args.nBoats} reporting boats.\n\nView trends: ${trendsUrl}`;
  const reasonHtml = `You're getting this because you followed <strong>${safeSp}</strong> on fishcount.app on ${args.signupDate}. <a href="${args.manageUrl}" style="color:#1d4ed8;text-decoration:underline;">Manage alerts</a> · <a href="${args.unsubscribeUrl}" style="color:#1d4ed8;text-decoration:underline;">Unsubscribe</a>`;
  const reasonText = `You're getting this because you followed ${args.species} on fishcount.app on ${args.signupDate}. Manage: ${args.manageUrl}`;

  return {
    subject: `${args.species} starting to run`,
    preheader: `Fleet-wide 7-day avg is ${xLabel} above same-week last year on ${args.tripType} trips.`,
    h1: `${args.species} is starting to run`,
    bodyHtml,
    bodyText,
    reasonForReceipt: reasonText,
    reasonForReceiptHtml: reasonHtml,
    unsubscribeUrl: args.unsubscribeUrl,
    manageUrl: args.manageUrl
  };
}
