// tests/unit/db/boats.test.ts
// D-01: boats repository upserts by source_name with stable surrogate id.
// Also verifies landings repository since catch_reports FKs to both.
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDb } from '../../helpers/in-memory-db';
import * as boats from '../../../src/lib/db/boats';
import * as landings from '../../../src/lib/db/landings';

describe('boats + landings repositories (D-01, D-02)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('landings.upsertByName returns stable id on repeated calls', () => {
    db = openTestDb();
    const id1 = landings.upsertByName(
      db,
      'Point Loma Sportfishing',
      'Point Loma Sportfishing',
      'https://example.com/landings/plsf'
    );
    const id2 = landings.upsertByName(db, 'Point Loma Sportfishing', 'Point Loma Sportfishing');
    expect(id1).toBe(id2);
    const count = db.prepare(`SELECT COUNT(*) AS c FROM landings`).get() as { c: number };
    expect(count.c).toBe(1);
  });

  it('landings.getById returns the row by id', () => {
    db = openTestDb();
    const id = landings.upsertByName(db, "Fisherman's Landing", "Fisherman's Landing");
    const row = landings.getById(db, id);
    expect(row?.source_name).toBe("Fisherman's Landing");
    expect(row?.display_name).toBe("Fisherman's Landing");
  });

  it('boats.upsertByName returns stable id on repeated calls and links to landing', () => {
    db = openTestDb();
    const landingId = landings.upsertByName(db, 'H&M Landing', 'H&M Landing');
    const id1 = boats.upsertByName(db, 'Grande', landingId, 'Grande', '/charter_boats/grande.php');
    const id2 = boats.upsertByName(db, 'Grande', landingId, 'Grande', '/charter_boats/grande.php');
    expect(id1).toBe(id2);
    const row = boats.getById(db, id1);
    expect(row?.source_name).toBe('Grande');
    expect(row?.landing_id).toBe(landingId);
    expect(row?.source_url).toBe('/charter_boats/grande.php');
  });

  it('boats.upsertByName updates landing_id on conflict but preserves existing source_url when new is null', () => {
    db = openTestDb();
    const landingA = landings.upsertByName(db, 'Seaforth', 'Seaforth');
    const landingB = landings.upsertByName(db, 'Oceanside', 'Oceanside');
    const id = boats.upsertByName(db, 'Pacific Queen', landingA, 'Pacific Queen', '/orig.php', 'pacific-queen');
    // Second upsert with different landing, no url — url should be preserved.
    boats.upsertByName(db, 'Pacific Queen', landingB, 'Pacific Queen', undefined, 'pacific-queen');
    const row = boats.getById(db, id);
    expect(row?.landing_id).toBe(landingB);
    expect(row?.source_url).toBe('/orig.php');
  });
});

describe('upsertByName slug (Phase 6 — D-13 frozen-at-first-seen)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('new boat receives the slug passed at INSERT', () => {
    db = openTestDb();
    const landingId = landings.upsertByName(db, 'H&M Landing', 'H&M Landing');
    boats.upsertByName(db, 'Grande', landingId, 'Grande', null, 'grande');
    const row = boats.getById(db, boats.upsertByName(db, 'Grande', landingId, 'Grande', null, 'grande'));
    expect(row?.slug).toBe('grande');
  });

  it('re-upserting same source_name with a different slug does NOT change the stored slug (frozen)', () => {
    db = openTestDb();
    const landingId = landings.upsertByName(db, 'H&M Landing', 'H&M Landing');
    const id = boats.upsertByName(db, 'Pacific Voyager', landingId, 'Pacific Voyager', null, 'pacific-voyager');
    // Second upsert — try to change slug to something else
    boats.upsertByName(db, 'Pacific Voyager', landingId, 'Pacific Voyager', null, 'different-slug');
    const row = boats.getById(db, id);
    // slug should still be the original 'pacific-voyager'
    expect(row?.slug).toBe('pacific-voyager');
  });
});

describe('upsertBoatsAndLandings slug batch (Phase 6)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('two new boats with identical display_name get distinct slugs in same batch', () => {
    db = openTestDb();
    boats.upsertBoatsAndLandings(db, [
      { source_name: 'Redfish-A', landing_source_name: 'Seaforth' },
      { source_name: 'Redfish-B', landing_source_name: 'Seaforth' }
    ]);
    const allBoats = db.prepare(`SELECT source_name, slug FROM boats ORDER BY id ASC`).all() as Array<{ source_name: string; slug: string }>;
    const slugs = allBoats.map((b) => b.slug);
    // Both slugs must be non-null
    expect(slugs.every((s) => s != null)).toBe(true);
    // Slugs must be unique
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('existing boat retains its slug even if display_name changes in a re-ingestion', () => {
    db = openTestDb();
    // First ingestion
    boats.upsertBoatsAndLandings(db, [
      { source_name: 'Pacific Queen', landing_source_name: 'Seaforth' }
    ]);
    const originalSlug = (db.prepare(`SELECT slug FROM boats WHERE source_name = 'Pacific Queen'`).get() as { slug: string }).slug;
    expect(originalSlug).toBeTruthy();

    // Re-ingest with updated display_name — slug must be frozen
    boats.upsertBoatsAndLandings(db, [
      { source_name: 'Pacific Queen', landing_source_name: 'Seaforth' }
    ]);
    const afterSlug = (db.prepare(`SELECT slug FROM boats WHERE source_name = 'Pacific Queen'`).get() as { slug: string }).slug;
    expect(afterSlug).toBe(originalSlug);
  });
});

describe('findBySlug (Phase 6)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('returns the boat row for a known slug', () => {
    db = openTestDb();
    const landingId = landings.upsertByName(db, 'H&M Landing', 'H&M Landing');
    boats.upsertByName(db, 'Grande', landingId, 'Grande', null, 'grande');
    const row = boats.findBySlug(db, 'grande');
    expect(row).toBeDefined();
    expect(row?.slug).toBe('grande');
    expect(row?.display_name).toBe('Grande');
  });

  it('returns undefined for an unknown slug', () => {
    db = openTestDb();
    const row = boats.findBySlug(db, 'nonexistent-slug');
    expect(row).toBeUndefined();
  });
});

describe('listBoatsByActivity (Phase 6 — D-09, D-11)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('returns all boats including those with no recent rows (D-11)', () => {
    db = openTestDb();
    const landingId = landings.upsertByName(db, 'H&M Landing', 'H&M Landing');
    boats.upsertByName(db, 'Active Boat', landingId, 'Active Boat', null, 'active-boat');
    boats.upsertByName(db, 'Inactive Boat', landingId, 'Inactive Boat', null, 'inactive-boat');

    // Insert catch report only for Active Boat
    const activeId = db.prepare(`SELECT id FROM boats WHERE source_name = 'Active Boat'`).get() as { id: number };
    db.prepare(`INSERT INTO catch_reports (source_date, boat_id, landing_id, trip_type, species, angler_count, species_count, scraped_at)
                VALUES (date('now', '-5 days'), ?, ?, 'Full Day', 'yellowtail', 10, 20, datetime('now'))`).run(activeId.id, landingId);

    const result = boats.listBoatsByActivity(db, 90);
    expect(result.length).toBe(2);
    // Active Boat should be first (more activity)
    expect(result[0].source_name).toBe('Active Boat');
  });

  it('sorts by activity DESC then alpha tie-break ASC', () => {
    db = openTestDb();
    const landingId = landings.upsertByName(db, 'H&M Landing', 'H&M Landing');
    boats.upsertByName(db, 'Zebra', landingId, 'Zebra', null, 'zebra');
    boats.upsertByName(db, 'Alpha', landingId, 'Alpha', null, 'alpha');

    const result = boats.listBoatsByActivity(db, 90);
    // Both have zero activity — tie breaks by name alpha
    expect(result[0].display_name).toBe('Alpha');
    expect(result[1].display_name).toBe('Zebra');
  });
});

describe('mostActiveBoatLast30Days (Phase 6 — D-01)', () => {
  let db: Database.Database | null = null;
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  it('returns null when catch_reports is empty', () => {
    db = openTestDb();
    const result = boats.mostActiveBoatLast30Days(db);
    expect(result).toBeNull();
  });

  it('returns the boat with the most distinct trip-days in last 30 days', () => {
    db = openTestDb();
    const landingId = landings.upsertByName(db, 'H&M Landing', 'H&M Landing');
    boats.upsertByName(db, 'Hot Boat', landingId, 'Hot Boat', null, 'hot-boat');
    boats.upsertByName(db, 'Cold Boat', landingId, 'Cold Boat', null, 'cold-boat');
    const hotId = (db.prepare(`SELECT id FROM boats WHERE source_name = 'Hot Boat'`).get() as { id: number }).id;
    const coldId = (db.prepare(`SELECT id FROM boats WHERE source_name = 'Cold Boat'`).get() as { id: number }).id;

    // Hot Boat has 2 trip-days; Cold Boat has 1
    db.prepare(`INSERT INTO catch_reports (source_date, boat_id, landing_id, trip_type, species, angler_count, species_count, scraped_at)
                VALUES (date('now', '-2 days'), ?, ?, 'Full Day', 'yellowtail', 10, 5, datetime('now'))`).run(hotId, landingId);
    db.prepare(`INSERT INTO catch_reports (source_date, boat_id, landing_id, trip_type, species, angler_count, species_count, scraped_at)
                VALUES (date('now', '-5 days'), ?, ?, 'Full Day', 'yellowtail', 10, 5, datetime('now'))`).run(hotId, landingId);
    db.prepare(`INSERT INTO catch_reports (source_date, boat_id, landing_id, trip_type, species, angler_count, species_count, scraped_at)
                VALUES (date('now', '-3 days'), ?, ?, 'Full Day', 'yellowtail', 8, 3, datetime('now'))`).run(coldId, landingId);

    const result = boats.mostActiveBoatLast30Days(db);
    expect(result).not.toBeNull();
    expect(result?.source_name).toBe('Hot Boat');
  });
});
