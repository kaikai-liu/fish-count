// tests/helpers/seedTestDb.ts
// Phase 2: Shared seeding helpers for query/route tests.
// Factored from inline helpers in catchReports.test.ts and scrapeRuns.test.ts.
// Phase 4: extended with seedSubscriber + seedSuppressed (Plan 04-01).
import type Database from 'better-sqlite3';
import * as boats from '../../src/lib/db/boats';
import * as catchReports from '../../src/lib/db/catchReports';
import type { CatchReportRow } from '../../src/lib/db/catchReports';
import * as subscribersDal from '../../src/lib/db/subscribers';
import * as suppression from '../../src/lib/db/suppressionList';

export function seedBoat(
  db: Database.Database,
  args: { boatName: string; landingName: string; sourceUrl?: string }
): { boatId: number; landingId: number } {
  // Use upsertBoatsAndLandings — confirms idempotency and matches Phase 1 path.
  const result = boats.upsertBoatsAndLandings(db, [
    {
      source_name: args.boatName,
      landing_source_name: args.landingName,
      source_url: args.sourceUrl
    }
  ]);
  const boatId = result.boatIds.get(args.boatName);
  const landingId = result.landingIds.get(args.landingName);
  if (boatId === undefined || landingId === undefined) {
    throw new Error('seedBoat: upsert did not return ids — schema drift?');
  }
  return { boatId, landingId };
}

export function seedTrip(
  db: Database.Database,
  args: {
    boatId: number;
    landingId: number;
    date: string;
    tripType: string;
    species: string;
    anglers: number;
    count: number;
    scrapedAt?: string;
  }
): void {
  catchReports.upsertMany(db, [
    {
      source_date: args.date,
      boat_id: args.boatId,
      landing_id: args.landingId,
      trip_type: args.tripType,
      species: args.species,
      angler_count: args.anglers,
      species_count: args.count,
      scraped_at: args.scrapedAt ?? '2026-04-24T00:00:00Z'
    }
  ]);
}

export function seedTripsBatch(db: Database.Database, rows: CatchReportRow[]): void {
  catchReports.upsertMany(db, rows);
}

/**
 * Phase 4 helper: seed a subscriber (active by default) with optional follows.
 * Returns the subscriber id so tests can then dispatch alerts to them.
 *
 * Note: when boats[] is non-empty, the caller MUST have seeded the matching
 * boats rows first — subscriber_boats has a FK to boats.
 */
export function seedSubscriber(
  db: Database.Database,
  args: {
    email: string;
    status?: 'pending' | 'active';
    boats?: number[];
    species?: string[];
    ip?: string;
  }
): number {
  const id = subscribersDal.createPending(db, {
    email: args.email,
    boats: args.boats ?? [],
    species: args.species ?? [],
    ip: args.ip ?? '127.0.0.1'
  });
  if ((args.status ?? 'active') === 'active') {
    subscribersDal.activate(db, id);
  }
  return id;
}

/**
 * Phase 4 helper: add an email to the suppression list.
 * Reason defaults to 'user_unsub' (the most common path).
 */
export function seedSuppressed(
  db: Database.Database,
  email: string,
  reason: 'user_unsub' | 'operator_remove' = 'user_unsub'
): void {
  suppression.add(db, email, reason);
}
