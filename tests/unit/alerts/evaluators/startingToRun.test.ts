// tests/unit/alerts/evaluators/startingToRun.test.ts
// Phase 4 ALT-10 starting-to-run evaluator unit tests.
//
// Pure-function contract mirrors hotDay: DAL-injected db, no I/O.
// Tests assert the four honesty floors (year_ago.n_trips>=5, year_ago_avg>0,
// rolling7.n_boats>=3, no modal trip_type ⇒ refuse) + the trigger-key shape
// (Open Question 5 + research §A3 modal-trip_type heuristic) + ISO-week math.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../../src/lib/db/migrations';
import {
  evaluateStartingToRun,
  isoWeekMonday,
  RUN_RATIO,
  RUN_BASELINE_MIN_TRIPS,
  RUN_MIN_REPORTING_BOATS
} from '../../../../src/lib/alerts/evaluators/startingToRun';
import { seedSubscriber } from '../../../helpers/seedTestDb';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  db.prepare(`INSERT INTO landings (id, source_name, display_name) VALUES (1, 'fl', 'F')`).run();
  db.prepare(
    `INSERT INTO boats (id, source_name, display_name, landing_id) VALUES (1, 'b1', 'Boat 1', 1), (2, 'b2', 'Boat 2', 1), (3, 'b3', 'Boat 3', 1), (4, 'b4', 'Boat 4', 1)`
  ).run();
  return db;
}

function seedRow(
  db: Database.Database,
  args: { date: string; boatId: number; tripType: string; species: string; speciesCount: number; anglers: number }
) {
  db.prepare(
    `INSERT OR REPLACE INTO catch_reports (source_date, boat_id, landing_id, trip_type, species, species_count, angler_count, scraped_at)
     VALUES (?, ?, 1, ?, ?, ?, ?, datetime('now'))`
  ).run(args.date, args.boatId, args.tripType, args.species, args.speciesCount, args.anglers);
}

function dateOffset(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const TODAY = '2026-04-30'; // Thursday → ISO-week Monday = 2026-04-27

describe('isoWeekMonday', () => {
  it('returns the ISO-week Monday for a Thursday', () => {
    expect(isoWeekMonday('2026-04-30')).toBe('2026-04-27');
  });
  it('returns same date when input is Monday', () => {
    expect(isoWeekMonday('2026-04-27')).toBe('2026-04-27');
  });
  it('returns previous Monday for a Sunday', () => {
    expect(isoWeekMonday('2026-05-03')).toBe('2026-04-27');
  });
  it('handles year boundary correctly', () => {
    // Sunday Jan 3 2027 -> ISO Mon Dec 28 2026
    expect(isoWeekMonday('2027-01-03')).toBe('2026-12-28');
  });
});

describe('evaluateStartingToRun', () => {
  it('exports RUN_RATIO=1.5, RUN_BASELINE_MIN_TRIPS=5, RUN_MIN_REPORTING_BOATS=3', () => {
    expect(RUN_RATIO).toBe(1.5);
    expect(RUN_BASELINE_MIN_TRIPS).toBe(5);
    expect(RUN_MIN_REPORTING_BOATS).toBe(3);
  });

  it('emits a candidate when rolling7 > 1.5x year-ago AND n_boats >= 3 AND year-ago.n_trips >= 5', () => {
    const db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'active', species: ['bluefin'] });
    // Modal trip_type anchor: bluefin on Overnight in last 30 days.
    for (let i = 1; i <= 30; i++)
      seedRow(db, {
        date: dateOffset(TODAY, -i),
        boatId: 1,
        tripType: 'Overnight',
        species: 'bluefin',
        speciesCount: 5,
        anglers: 10
      });
    // Rolling 7-day window (today-6..today): 4 reporting boats, high yield.
    for (let i = 0; i <= 6; i++) {
      for (const bid of [1, 2, 3, 4]) {
        seedRow(db, {
          date: dateOffset(TODAY, -i),
          boatId: bid,
          tripType: 'Overnight',
          species: 'bluefin',
          speciesCount: 30,
          anglers: 10
        });
      }
    }
    // Same-week-last-year: 7 days × 2 boats at low yield (14 trips total → n_trips >=5).
    for (let i = 0; i <= 6; i++) {
      for (const bid of [1, 2]) {
        seedRow(db, {
          date: dateOffset(TODAY, -365 + i - 3),
          boatId: bid,
          tripType: 'Overnight',
          species: 'bluefin',
          speciesCount: 5,
          anglers: 10
        });
      }
    }
    const subs = [
      {
        id: sid,
        email: 'a@b.com',
        status: 'active' as const,
        created_at: '2026-04-01T00:00:00Z',
        confirmed_at: '2026-04-01T00:00:00Z',
        signup_ip: '127.0.0.1',
        paused_until: null,
        boats: [],
        species: ['bluefin']
      }
    ];
    const out = evaluateStartingToRun({ today: TODAY, subscribers: subs, db });
    expect(out).toHaveLength(1);
    expect(out[0].subscriberId).toBe(sid);
    expect(out[0].species).toBe('bluefin');
    expect(out[0].tripType).toBe('Overnight');
    expect(out[0].triggerKey).toBe('species:bluefin:Overnight');
    expect(out[0].triggerDate).toBe('2026-04-27'); // ISO-week Monday of TODAY=2026-04-30
    expect(out[0].rolling7Avg).toBeCloseTo(3.0, 5);
    expect(out[0].yearAgoAvg).toBeCloseTo(0.5, 5);
    expect(out[0].multiplier).toBeCloseTo(6.0, 5);
    expect(out[0].nBoats).toBe(4);
  });

  it('refuses when year-ago window has <5 trips (CLAUDE.md non-negotiable #3 floor)', () => {
    const db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'active', species: ['bluefin'] });
    for (let i = 1; i <= 30; i++)
      seedRow(db, {
        date: dateOffset(TODAY, -i),
        boatId: 1,
        tripType: 'Overnight',
        species: 'bluefin',
        speciesCount: 5,
        anglers: 10
      });
    for (let i = 0; i <= 6; i++) {
      for (const bid of [1, 2, 3]) {
        seedRow(db, {
          date: dateOffset(TODAY, -i),
          boatId: bid,
          tripType: 'Overnight',
          species: 'bluefin',
          speciesCount: 30,
          anglers: 10
        });
      }
    }
    // Year-ago window has only 4 trips total — under the n>=5 floor.
    for (let i = 0; i <= 3; i++) {
      seedRow(db, {
        date: dateOffset(TODAY, -365 + i - 3),
        boatId: 1,
        tripType: 'Overnight',
        species: 'bluefin',
        speciesCount: 5,
        anglers: 10
      });
    }
    const subs = [
      {
        id: sid,
        email: 'a@b.com',
        status: 'active' as const,
        created_at: '2026-04-01T00:00:00Z',
        confirmed_at: '2026-04-01T00:00:00Z',
        signup_ip: '127.0.0.1',
        paused_until: null,
        boats: [],
        species: ['bluefin']
      }
    ];
    expect(evaluateStartingToRun({ today: TODAY, subscribers: subs, db })).toEqual([]);
  });

  it('refuses when n_boats < 3 (single-boat tear is not "the run")', () => {
    const db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'active', species: ['bluefin'] });
    for (let i = 1; i <= 30; i++)
      seedRow(db, {
        date: dateOffset(TODAY, -i),
        boatId: 1,
        tripType: 'Overnight',
        species: 'bluefin',
        speciesCount: 5,
        anglers: 10
      });
    // Rolling 7-day window: only 2 boats reporting — under the n_boats>=3 floor.
    for (let i = 0; i <= 6; i++) {
      for (const bid of [1, 2]) {
        seedRow(db, {
          date: dateOffset(TODAY, -i),
          boatId: bid,
          tripType: 'Overnight',
          species: 'bluefin',
          speciesCount: 30,
          anglers: 10
        });
      }
    }
    for (let i = 0; i <= 6; i++) {
      for (const bid of [1, 2]) {
        seedRow(db, {
          date: dateOffset(TODAY, -365 + i - 3),
          boatId: bid,
          tripType: 'Overnight',
          species: 'bluefin',
          speciesCount: 5,
          anglers: 10
        });
      }
    }
    const subs = [
      {
        id: sid,
        email: 'a@b.com',
        status: 'active' as const,
        created_at: '2026-04-01T00:00:00Z',
        confirmed_at: '2026-04-01T00:00:00Z',
        signup_ip: '127.0.0.1',
        paused_until: null,
        boats: [],
        species: ['bluefin']
      }
    ];
    expect(evaluateStartingToRun({ today: TODAY, subscribers: subs, db })).toEqual([]);
  });

  it('refuses when species has no rows in the last 30 days (no modal trip_type)', () => {
    const db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'active', species: ['wahoo'] });
    const subs = [
      {
        id: sid,
        email: 'a@b.com',
        status: 'active' as const,
        created_at: '2026-04-01T00:00:00Z',
        confirmed_at: '2026-04-01T00:00:00Z',
        signup_ip: '127.0.0.1',
        paused_until: null,
        boats: [],
        species: ['wahoo']
      }
    ];
    expect(evaluateStartingToRun({ today: TODAY, subscribers: subs, db })).toEqual([]);
  });

  it('refuses when year-ago avg <= 0 (zero-baseline guard)', () => {
    const db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'active', species: ['bluefin'] });
    for (let i = 1; i <= 30; i++)
      seedRow(db, {
        date: dateOffset(TODAY, -i),
        boatId: 1,
        tripType: 'Overnight',
        species: 'bluefin',
        speciesCount: 5,
        anglers: 10
      });
    for (let i = 0; i <= 6; i++) {
      for (const bid of [1, 2, 3]) {
        seedRow(db, {
          date: dateOffset(TODAY, -i),
          boatId: bid,
          tripType: 'Overnight',
          species: 'bluefin',
          speciesCount: 30,
          anglers: 10
        });
      }
    }
    // Year-ago: 7 trips with zero catches.
    for (let i = 0; i <= 6; i++) {
      seedRow(db, {
        date: dateOffset(TODAY, -365 + i - 3),
        boatId: 1,
        tripType: 'Overnight',
        species: 'bluefin',
        speciesCount: 0,
        anglers: 10
      });
    }
    const subs = [
      {
        id: sid,
        email: 'a@b.com',
        status: 'active' as const,
        created_at: '2026-04-01T00:00:00Z',
        confirmed_at: '2026-04-01T00:00:00Z',
        signup_ip: '127.0.0.1',
        paused_until: null,
        boats: [],
        species: ['bluefin']
      }
    ];
    expect(evaluateStartingToRun({ today: TODAY, subscribers: subs, db })).toEqual([]);
  });
});
