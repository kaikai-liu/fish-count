#!/usr/bin/env tsx
// scripts/email-tester-drill.ts
// Phase 4 ALT-08 deliverability drill.
//
// Sends each of the 4 production email templates to a target address via the
// production Resend client (or --dry-run for local iteration). Used by:
//   - mail-tester.com drill (target = the address mail-tester gives you;
//     score >= 9.0/10 per template per ROADMAP Phase 4 success #2)
//   - real-mailbox delivery drill (target = a Gmail / iCloud / Outlook
//     test inbox; verify inbox-not-spam + visible List-Unsubscribe link)
//
// Exits 0 on full success, 1 on any send failure, 2 on misconfiguration.
//
// Usage:
//   tsx --import ./scripts/_sveltekit-env-loader.mjs scripts/email-tester-drill.ts \
//     --to <email> [--templates <name|all>] [--dry-run]
//
//   --to              REQUIRED — target email address
//   --templates       confirmation | hot-day | starting-to-run | unsubscribe-success | all (default: all)
//   --dry-run         render templates locally; print html/text; no Resend call
//
// Env (loaded by the operator from .env or fly secrets):
//   PROJECT_SECRET, POSTAL_ADDRESS, RESEND_API_KEY, SUBSCRIBER_FROM_EMAIL, PUBLIC_BASE_URL
//
// SvelteKit-alias note: the production templates / send wrapper / token signer
// import from `$env/dynamic/private` (a SvelteKit virtual module). This drill is
// NOT running inside SvelteKit, so we register a process.env-backed shim via the
// `_sveltekit-env-loader.mjs` Node loader (see usage above). When invoked without
// the loader (plain `tsx scripts/email-tester-drill.ts`), the import of tokens.ts
// would fail at module-load time — that failure is intentional: the drill is
// production-shaped, NOT a parallel sender (UI-SPEC §"Anti-Feature Guards"
// rationale: keep one code path for outbound mail).
import { parseArgs } from 'node:util';
import { logger } from '../src/lib/server/logger.ts';
import { signToken } from '../src/lib/alerts/tokens.ts';
import {
  renderConfirmationEmail,
  hotDayEmail,
  startingToRunEmail
} from '../src/lib/email/templates.ts';
import { buildEmail } from '../src/lib/email/buildEmail.ts';
import { sendUserEmail } from '../src/lib/email/send.ts';

const TEMPLATE_NAMES = [
  'confirmation',
  'hot-day',
  'starting-to-run',
  'unsubscribe-success',
  'all'
] as const;
type TemplateName = (typeof TEMPLATE_NAMES)[number];

function usage(): string {
  return [
    'usage: tsx --import ./scripts/_sveltekit-env-loader.mjs scripts/email-tester-drill.ts \\',
    '         --to <email> [--templates <name|all>] [--dry-run]',
    '',
    '  --to             REQUIRED — target email address',
    `  --templates      ${TEMPLATE_NAMES.slice(0, -1).join(' | ')} | all  (default: all)`,
    '  --dry-run        render templates locally; print html/text; no Resend call'
  ].join('\n');
}

interface FixtureValues {
  // CLAUDE.md domain-language verbatim — the drill produces realistic SD-shaped emails.
  boat: { id: number; name: string; tripType: string };
  species: string;
  runTripType: string;
  hotDay: {
    todayValue: number;
    todayAnglers: number;
    trailingAvg: number;
    multiplier: number;
    speciesList: string[];
  };
  run: {
    rolling7Avg: number;
    yearAgoAvg: number;
    multiplier: number;
    nBoats: number;
  };
  signupDate: string;
  maskedIp: string;
}

const FIXTURES: FixtureValues = {
  boat: { id: 7, name: 'Pacific Dawn', tripType: '1/2 Day AM' },
  species: 'bluefin',
  runTripType: 'Overnight',
  hotDay: {
    todayValue: 4.5,
    todayAnglers: 18,
    trailingAvg: 1.5,
    multiplier: 3.0,
    speciesList: ['yellowtail', 'calico bass']
  },
  run: { rolling7Avg: 3.0, yearAgoAvg: 0.5, multiplier: 6.0, nBoats: 4 },
  signupDate: '2026-04-20',
  maskedIp: '73.x.x.x'
};

type ConcreteTemplate = Exclude<TemplateName, 'all'>;

function buildArgs(
  template: ConcreteTemplate,
  subscriberId: number,
  baseUrl: string,
  fromDomain: string
): {
  args: ReturnType<typeof renderConfirmationEmail>;
  unsubMailto: string;
  unsubscribeUrl: string;
} {
  const confirmToken = signToken('confirm', subscriberId, 24 * 3600);
  const manageToken = signToken('manage', subscriberId, 30 * 24 * 3600);
  const unsubToken = signToken('unsubscribe', subscriberId, null);
  const confirmUrl = `${baseUrl}/alerts/confirm?token=${encodeURIComponent(confirmToken)}`;
  const manageUrl = `${baseUrl}/alerts/manage?token=${encodeURIComponent(manageToken)}`;
  const unsubscribeUrl = `${baseUrl}/alerts/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
  const unsubMailto = `unsubscribe+${unsubToken}@${fromDomain}`;

  switch (template) {
    case 'confirmation':
      return {
        args: renderConfirmationEmail({
          confirmUrl,
          signupDate: FIXTURES.signupDate,
          maskedIp: FIXTURES.maskedIp,
          unsubscribeUrl,
          manageUrl
        }),
        unsubMailto,
        unsubscribeUrl
      };
    case 'hot-day':
      return {
        args: hotDayEmail({
          subscriberEmail: 'drill@example.com',
          boatDisplayName: FIXTURES.boat.name,
          boatId: FIXTURES.boat.id,
          tripType: FIXTURES.boat.tripType,
          todayValue: FIXTURES.hotDay.todayValue,
          todayAnglers: FIXTURES.hotDay.todayAnglers,
          trailingAvg: FIXTURES.hotDay.trailingAvg,
          multiplier: FIXTURES.hotDay.multiplier,
          speciesList: FIXTURES.hotDay.speciesList,
          signupDate: FIXTURES.signupDate,
          unsubscribeUrl,
          manageUrl
        }),
        unsubMailto,
        unsubscribeUrl
      };
    case 'starting-to-run':
      return {
        args: startingToRunEmail({
          subscriberEmail: 'drill@example.com',
          species: FIXTURES.species,
          tripType: FIXTURES.runTripType,
          rolling7Avg: FIXTURES.run.rolling7Avg,
          yearAgoAvg: FIXTURES.run.yearAgoAvg,
          multiplier: FIXTURES.run.multiplier,
          nBoats: FIXTURES.run.nBoats,
          signupDate: FIXTURES.signupDate,
          unsubscribeUrl,
          manageUrl
        }),
        unsubMailto,
        unsubscribeUrl
      };
    case 'unsubscribe-success': {
      // Plan 05 ships an unsubscribe-success view (HTML page). The email-side
      // archetype here exists so mail-tester can score the "you're unsubscribed"
      // confirmation shape too. Built off the confirmation template shell with
      // overridden subject/h1 so we don't add a parallel template surface.
      const base = renderConfirmationEmail({
        confirmUrl: 'about:blank', // intentionally inert; this is the unsubscribe-success archetype
        signupDate: FIXTURES.signupDate,
        maskedIp: FIXTURES.maskedIp,
        unsubscribeUrl,
        manageUrl
      });
      return {
        args: {
          ...base,
          subject: "You're unsubscribed from FishCount",
          h1: "You're unsubscribed",
          preheader: "You won't receive any more emails from us.",
          bodyText:
            "We've removed your address from all FishCount alerts. You won't receive any more emails from us.",
          bodyHtml: `<p>We've removed your address from all FishCount alerts. You won't receive any more emails from us.</p>`
        },
        unsubMailto,
        unsubscribeUrl
      };
    }
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const log = logger.child({ job: 'email-tester-drill' });
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        to: { type: 'string' },
        templates: { type: 'string', default: 'all' },
        'dry-run': { type: 'boolean', default: false }
      },
      strict: true,
      allowPositionals: false
    });
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n${usage()}\n`);
    return 1;
  }

  const to = parsed.values.to as string | undefined;
  const tplArg = (parsed.values.templates ?? 'all') as string;
  const dryRun = Boolean(parsed.values['dry-run']);
  if (!to) {
    process.stderr.write(`error: --to is required\n${usage()}\n`);
    return 1;
  }
  if (!TEMPLATE_NAMES.includes(tplArg as TemplateName)) {
    process.stderr.write(
      `error: --templates must be one of ${TEMPLATE_NAMES.join(', ')}\n${usage()}\n`
    );
    return 1;
  }

  // Fail-closed env checks — surface ALT-08 + ALT-07 contract violations BEFORE wasting a send.
  const required = ['PROJECT_SECRET', 'POSTAL_ADDRESS', 'PUBLIC_BASE_URL'];
  if (!dryRun) required.push('RESEND_API_KEY', 'SUBSCRIBER_FROM_EMAIL');
  const missing = required.filter(
    (k) => !process.env[k] || process.env[k]!.trim().length === 0
  );
  if (missing.length > 0) {
    process.stderr.write(`error: missing required env: ${missing.join(', ')}\n`);
    return 2;
  }

  const baseUrl = process.env.PUBLIC_BASE_URL!;
  const fromDomain =
    (process.env.SUBSCRIBER_FROM_EMAIL ?? 'alerts@fishcount.app').split('@')[1] ??
    'fishcount.app';
  const subscriberId = 1; // synthetic — drill is purely send-side
  const templates: ConcreteTemplate[] =
    tplArg === 'all'
      ? ['confirmation', 'hot-day', 'starting-to-run', 'unsubscribe-success']
      : [tplArg as ConcreteTemplate];

  let failures = 0;
  for (const t of templates) {
    try {
      const { args, unsubMailto, unsubscribeUrl } = buildArgs(
        t,
        subscriberId,
        baseUrl,
        fromDomain
      );
      const { html, text } = buildEmail(args);
      if (dryRun) {
        log.info(
          {
            template: t,
            subject: args.subject,
            htmlBytes: html.length,
            textBytes: text.length
          },
          'drill_dry_run'
        );
        process.stdout.write(`\n--- ${t} (dry-run) ---\nSubject: ${args.subject}\n\n${text}\n\n`);
        continue;
      }
      const messageId = await sendUserEmail({
        to,
        subject: args.subject,
        html,
        text,
        unsubscribeMailto: unsubMailto,
        unsubscribeUrl
      });
      log.info({ template: t, messageId, subject: args.subject }, 'drill_sent');
      process.stdout.write(`[ok] ${t}: ${messageId}\n`);
    } catch (err) {
      failures += 1;
      log.error({ err, template: t }, 'drill_send_failed');
      process.stderr.write(`[fail] ${t}: ${(err as Error).message}\n`);
    }
  }
  return failures === 0 ? 0 : 1;
}

// Entry-point guard mirroring scripts/backfill.ts: only self-invoke when run
// directly (via `tsx scripts/email-tester-drill.ts`). When imported by tests,
// the guard prevents triggering process.exit on import.
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === new URL(`file://${entry}`).href;
  } catch {
    return import.meta.url.endsWith(entry);
  }
})();

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      process.stderr.write(`unhandled: ${(err as Error).message}\n`);
      process.exit(1);
    });
}
