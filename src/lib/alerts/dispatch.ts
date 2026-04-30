// src/lib/alerts/dispatch.ts
// Phase 4 ALT-09/10/11/12: alert dispatch orchestrator.
//
// Wires together the four single-responsibility seams (anti-pattern: embedding
// email rendering inside the dispatcher — keep them separate):
//   1. Evaluators (rules)         — src/lib/alerts/evaluators/*.ts (pure fns)
//   2. Dispatch (orchestration)   — THIS FILE
//   3. Templates (composition)    — src/lib/email/templates.ts
//   4. Send (transport)           — src/lib/email/send.ts
//
// Pipeline per candidate (research §"Pattern 3: Idempotent alert dispatch"):
//   exists?         -> skip (ALT-11 dedup)
//   cap exceeded?   -> recordQueued (status='queued', NOT sent — ALT-12 + Pitfall 7)
//   else            -> sign tokens -> build email -> send -> recordSent
//
// Non-fatal at scheduler boundary (mirrors src/lib/scraper/sla.ts +
// src/lib/forecast/compute.ts): each candidate runs in its own try/catch so
// one failed send (Resend outage, missing POSTAL_ADDRESS, etc.) cannot abort
// the whole tick. The SCHEDULER also wraps dispatchAlerts in a try/catch.
//
// B1 drainQueued (research Pitfall 7 mitigation): runs BEFORE evaluators so
// the cap budget reflects drained sends. UI-SPEC promise: "If volume exceeds
// the cap, alerts queue and send the next morning. We never silently drop."
import type Database from 'better-sqlite3';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/server/logger';
import * as subscribers from '$lib/db/subscribers';
import * as alertsSent from '$lib/db/alertsSent';
import { dailyCap, withinCap } from './warmup';
import { signToken } from './tokens';
import { evaluateHotDay, type HotDayCandidate } from './evaluators/hotDay';
import { evaluateStartingToRun, type RunCandidate } from './evaluators/startingToRun';
import { hotDayEmail, startingToRunEmail } from '$lib/email/templates';
import { buildEmail } from '$lib/email/buildEmail';
import { sendUserEmail } from '$lib/email/send';

type Candidate =
  | (HotDayCandidate & { kind: 'hot_day' })
  | (RunCandidate & { kind: 'starting_to_run' });

function midnightPtIso(today: string): string {
  // SQLite DATETIME comparison string: countSentSince(>= '2026-04-27T00:00:00Z')
  // is conservative — PT midnight is 7-8h offset from UTC midnight; we use the
  // UTC-day boundary for warmup counting, which slightly under-counts late-night
  // sends from the prior PT day. Acceptable v1 simplicity — alerts dispatch
  // fires once per scheduled tick at 23:00 PT, so the under-count is bounded
  // to the same-tick batch.
  return `${today}T00:00:00.000Z`;
}

/**
 * B1 fix: drain queued alerts BEFORE running evaluators so cap budget
 * reflects drained sends (UI-SPEC §"Warm-up banner" promise).
 *
 * Order:
 *   1) listQueued ordered by queued_at ASC
 *   2) TTL sweep: any queued row older than 24h gets markExpired
 *   3) For each remaining queued row, while budget > 0:
 *        sign tokens, build minimal email from trigger_key, send;
 *        on success markSent(id, messageId); on failure log + leave queued
 */
async function drainQueued(args: {
  today: string;
  db: Database.Database;
  log: ReturnType<typeof logger.child>;
  baseUrl: string;
  fromDomain: string;
  cap: number;
  sentToday: number;
}): Promise<number> {
  const { today, db, log, baseUrl, fromDomain, cap, sentToday } = args;
  const queued = alertsSent.listQueued(db);
  if (queued.length === 0) return 0;

  // 24h TTL sweep — never emit a queued alert that has already exceeded its 24h TTL.
  const ttlCutoff = Date.now() - 24 * 3600 * 1000;
  const expiredIds: number[] = [];
  const drainable: typeof queued = [];
  for (const q of queued) {
    // q.queued_at is "YYYY-MM-DD HH:MM:SS" SQLite DATETIME — UTC-naive. Date.parse
    // treats space-separated form as local time on some browsers but Node parses
    // it as UTC-naive consistently. Use Date.UTC arithmetic for portability.
    const queuedAtMs = Date.parse(q.queued_at.replace(' ', 'T') + 'Z');
    if (Number.isFinite(queuedAtMs) && queuedAtMs < ttlCutoff) {
      expiredIds.push(q.id);
    } else {
      drainable.push(q);
    }
  }
  if (expiredIds.length > 0) {
    const changed = alertsSent.markExpired(db, expiredIds);
    log.info({ msg: 'queue_ttl_swept', expired: changed });
  }

  let cursor = sentToday;
  let drained = 0;
  for (const row of drainable) {
    if (!withinCap(cursor, cap)) break; // budget exhausted; remaining stay queued
    try {
      const sub = subscribers.findById(db, row.subscriber_id);
      if (!sub || sub.status !== 'active') {
        // Subscriber gone (unsubscribed). Mark expired so the queue drains.
        alertsSent.markExpired(db, [row.id]);
        continue;
      }
      const manageToken = signToken('manage', row.subscriber_id, 30 * 24 * 3600);
      const unsubToken = signToken('unsubscribe', row.subscriber_id, null);
      const manageUrl = `${baseUrl}/alerts/manage?token=${encodeURIComponent(manageToken)}`;
      const unsubscribeUrl = `${baseUrl}/alerts/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
      const unsubMailto = `unsubscribe+${unsubToken}@${fromDomain}`;
      // For queued drains we don't have the original candidate body. The trigger_key
      // encodes (boat,trip_type) or (species,trip_type) — sufficient to render a
      // "we owe you this" form of the email. v1 hot-path keeps richer state by NOT
      // queueing in the first place; this drain is the safety net for the warm-up
      // window only.
      //
      // trigger_key parse: 'boat:<id>:<tripType>'  |  'species:<species>:<tripType>'
      const parts = row.trigger_key.split(':');
      const signupDate = sub.confirmed_at?.slice(0, 10) ?? sub.created_at?.slice(0, 10) ?? today;
      let buildArgs: ReturnType<typeof hotDayEmail> | ReturnType<typeof startingToRunEmail> | null =
        null;
      if (row.kind === 'hot_day' && parts[0] === 'boat' && parts.length >= 3) {
        const boatId = Number(parts[1]);
        const tripType = parts.slice(2).join(':');
        buildArgs = hotDayEmail({
          subscriberEmail: sub.email,
          boatDisplayName: `Boat #${boatId}`,
          boatId,
          tripType,
          todayValue: 0,
          todayAnglers: 0,
          trailingAvg: 0,
          multiplier: 0,
          speciesList: [],
          signupDate,
          unsubscribeUrl,
          manageUrl
        });
      } else if (
        row.kind === 'starting_to_run' &&
        parts[0] === 'species' &&
        parts.length >= 3
      ) {
        const species = parts[1];
        const tripType = parts.slice(2).join(':');
        buildArgs = startingToRunEmail({
          subscriberEmail: sub.email,
          species,
          tripType,
          rolling7Avg: 0,
          yearAgoAvg: 0,
          multiplier: 0,
          nBoats: 0,
          signupDate,
          unsubscribeUrl,
          manageUrl
        });
      }
      if (!buildArgs) {
        log.error({
          msg: 'queue_drain_unparseable_trigger',
          id: row.id,
          key: row.trigger_key
        });
        alertsSent.markExpired(db, [row.id]);
        continue;
      }
      const { html, text } = buildEmail(buildArgs);
      const messageId = await sendUserEmail({
        to: sub.email,
        subject: buildArgs.subject,
        html,
        text,
        unsubscribeMailto: unsubMailto,
        unsubscribeUrl
      });
      alertsSent.markSent(db, row.id, messageId);
      cursor += 1;
      drained += 1;
      log.info({ msg: 'queue_drained_one', id: row.id, key: row.trigger_key, messageId });
    } catch (err) {
      // Non-fatal: log and leave the row queued for the next tick.
      log.error({ err, msg: 'queue_drain_send_failed', id: row.id, key: row.trigger_key });
    }
  }
  log.info({ msg: 'queue_drain_complete', drained, attempted: drainable.length });
  return drained;
}

export async function dispatchAlerts(today: string, db: Database.Database): Promise<void> {
  const log = logger.child({ job: 'alerts-dispatch', day: today });
  const baseUrl = env.PUBLIC_BASE_URL ?? 'https://fishcount.app';
  const fromDomain =
    (env.SUBSCRIBER_FROM_EMAIL ?? 'alerts@fishcount.app').split('@')[1] ?? 'fishcount.app';

  // 1. ALT-12 warmup cap (count subscriber-emails sent today; queued rows do not count).
  const cap = dailyCap(today, env.WARMUP_START_DATE);
  const sentToday = alertsSent.countSentSince(db, midnightPtIso(today));

  // 1.5 B1 fix: drain queued alerts FIRST so cap budget reflects drained sends.
  // UI-SPEC promise: "If volume exceeds the cap, alerts queue and send the next morning.
  // We never silently drop alerts." Without this drain, queued rows would never send
  // because exists() returns true on queued (so evaluators see them as deduped) but
  // recordSent is never called. The drain consumes them by id, not by trigger_key.
  const drainedCount = await drainQueued({
    today,
    db,
    log,
    baseUrl,
    fromDomain,
    cap,
    sentToday
  });

  // 2. Active subscribers + their follows. listActive already filters paused_until>today.
  const activeSubs = subscribers.listActive(db);
  if (activeSubs.length === 0) {
    log.info({ msg: 'no_active_subscribers' });
    return;
  }

  // 3. Evaluate. Both evaluators run regardless of cap — we still want dedup writes for queued cases.
  const hotCands = evaluateHotDay({ today, subscribers: activeSubs, db });
  const runCands = evaluateStartingToRun({ today, subscribers: activeSubs, db });
  const candidates: Candidate[] = [
    ...hotCands.map((c) => ({ ...c, kind: 'hot_day' as const })),
    ...runCands.map((c) => ({ ...c, kind: 'starting_to_run' as const }))
  ];

  log.info({
    msg: 'evaluation_complete',
    hot: hotCands.length,
    run: runCands.length,
    cap,
    sentToday,
    drained: drainedCount
  });

  let cursorSentToday = sentToday + drainedCount;
  for (const c of candidates) {
    const dedupKey = {
      subscriberId: c.subscriberId,
      kind: c.kind,
      triggerKey: c.triggerKey,
      triggerDate: c.triggerDate
    };
    // ALT-11 dedup: skip if any prior row exists for this dedup key (sent | queued | expired).
    if (alertsSent.exists(db, dedupKey)) continue;

    // ALT-12 warmup cap: queue when over budget; queued rows have status='queued', sent_at=null.
    if (!withinCap(cursorSentToday, cap)) {
      try {
        alertsSent.recordQueued(db, dedupKey);
        log.info({
          msg: 'alert_queued',
          kind: c.kind,
          key: c.triggerKey,
          subscriberId: c.subscriberId
        });
      } catch (err) {
        log.error({ err, msg: 'queued_record_failed', kind: c.kind, key: c.triggerKey });
      }
      continue;
    }

    // Per-candidate try/catch — one failed send cannot abort the whole batch
    // (analog: per-cell forecast recompute discipline).
    try {
      const manageToken = signToken('manage', c.subscriberId, 30 * 24 * 3600);
      const unsubToken = signToken('unsubscribe', c.subscriberId, null);
      const manageUrl = `${baseUrl}/alerts/manage?token=${encodeURIComponent(manageToken)}`;
      const unsubscribeUrl = `${baseUrl}/alerts/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
      const unsubMailto = `unsubscribe+${unsubToken}@${fromDomain}`;

      const subscriberRow = subscribers.findById(db, c.subscriberId);
      const signupDate =
        subscriberRow?.confirmed_at?.slice(0, 10) ??
        subscriberRow?.created_at?.slice(0, 10) ??
        today;

      const args =
        c.kind === 'hot_day'
          ? hotDayEmail({
              subscriberEmail: c.subscriberEmail,
              boatDisplayName: c.boatDisplayName,
              boatId: c.boatId,
              tripType: c.tripType,
              todayValue: c.todayValue,
              todayAnglers: c.todayAnglers,
              trailingAvg: c.trailingAvg,
              multiplier: c.multiplier,
              speciesList: c.speciesList,
              signupDate,
              unsubscribeUrl,
              manageUrl
            })
          : startingToRunEmail({
              subscriberEmail: c.subscriberEmail,
              species: c.species,
              tripType: c.tripType,
              rolling7Avg: c.rolling7Avg,
              yearAgoAvg: c.yearAgoAvg,
              multiplier: c.multiplier,
              nBoats: c.nBoats,
              signupDate,
              unsubscribeUrl,
              manageUrl
            });
      const { html, text } = buildEmail(args);
      const messageId = await sendUserEmail({
        to: c.subscriberEmail,
        subject: args.subject,
        html,
        text,
        unsubscribeMailto: unsubMailto,
        unsubscribeUrl
      });

      alertsSent.recordSent(db, dedupKey, messageId);
      cursorSentToday += 1;
      log.info({
        msg: 'alert_sent',
        kind: c.kind,
        key: c.triggerKey,
        subscriberId: c.subscriberId,
        messageId
      });
    } catch (err) {
      // Non-fatal: log and continue. Do NOT call recordSent (would break dedup) and do NOT
      // call recordQueued (the trigger is fresh; next tick will re-evaluate). This is the
      // Resend-outage path — the user gets the alert on the next scrape tick.
      log.error({ err, msg: 'send_failed_non_fatal', kind: c.kind, key: c.triggerKey });
    }
  }
}
