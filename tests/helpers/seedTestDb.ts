// tests/helpers/seedTestDb.ts
// Phase 2: Shared seeding helpers for query/route tests.
// Factored from inline helpers in catchReports.test.ts and scrapeRuns.test.ts.
import type Database from 'better-sqlite3';
import * as boats from '../../src/lib/db/boats';
import * as catchReports from '../../src/lib/db/catchReports';
import type { CatchReportRow } from '../../src/lib/db/catchReports';

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
