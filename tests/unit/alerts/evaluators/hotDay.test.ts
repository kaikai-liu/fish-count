// tests/unit/alerts/evaluators/hotDay.test.ts
// Phase 4 ALT-09 hot-day evaluator unit tests.
//
// Pure-function contract: evaluator reads the DAL (alertEval queries) and emits
// HotDayCandidate[] without writing or sending. Tests assert the four honesty
// floors (CLAUDE.md non-negotiable #3 extended to alerts) + the trigger-key
// shape (research Open Question 5 — same boat × two trip types = two candidates).
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../../src/lib/db/migrations';
import {
  evaluateHotDay,
  HOT_DAY_RATIO,
  HOT_DAY_DEFAULT_MIN_ANGLERS,
  HOT_DAY_BASELINE_MIN_DAYS
} from '../../../../src/lib/alerts/evaluators/hotDay';
import { getTrailingBoatTripStats } from '../../../../src/lib/db/queries/alertEval';
import { seedSubscriber } from '../../../helpers/seedTestDb';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  db.prepare(`INSERT INTO landings (id, source_name, display_name) VALUES (1, 'fl', 'Fishermans')`).run();
  db.prepare(
    `INSERT INTO boats (id, source_name, display_name, landing_id) VALUES (1, 'pd', 'Pacific Dawn', 1), (2, 'es', 'Eclipse', 1)`
  ).run();
  return db;
}

function seedCatch(
  db: Database.Database,
  args: { date: string; boatId: number; tripType: string; species: string; speciesCount: number; anglers: number }
) {
  db.prepare(
    `INSERT OR REPLACE INTO catch_reports (source_date, boat_id, landing_id, trip_type, species, species_count, angler_count, scraped_at)
     VALUES (?, ?, 1, ?, ?, ?, ?, datetime('now'))`
  ).run(args.date, args.boatId, args.tripType, args.species, args.speciesCount, args.anglers);
}

function seedTrailingBaseline(
  db: Database.Database,
  args: {
    boatId: number;
    tripType: string;
    species: string;
    today: string;
    nDays: number;
    perAngler: number;
    anglers: number;
  }
) {
  // Plant nDays of trailing-window history (each day uniform per_angler ratio).
  for (let i = 1; i <= args.nDays; i++) {
    const d = new Date(`${args.today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const ds = d.toISOString().slice(0, 10);
    seedCatch(db, {
      date: ds,
      boatId: args.boatId,
      tripType: args.tripType,
      species: args.species,
      speciesCount: Math.round(args.perAngler * args.anglers),
      anglers: args.anglers
    });
  }
}

const TODAY = '2026-04-27';

describe('evaluateHotDay', () => {
  afterEach(() => {
    delete process.env.HOT_DAY_MIN_ANGLERS;
  });

  it('exports HOT_DAY_RATIO=2.0, HOT_DAY_DEFAULT_MIN_ANGLERS=8, HOT_DAY_BASELINE_MIN_DAYS=5', () => {
    expect(HOT_DAY_RATIO).toBe(2.0);
    expect(HOT_DAY_DEFAULT_MIN_ANGLERS).toBe(8);
    expect(HOT_DAY_BASELINE_MIN_DAYS).toBe(5);
  });

  it('emits a candidate when today_value > 2x trailing_avg AND today_anglers >= 8 AND n_days >= 5', () => {
    const db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    seedTrailingBaseline(db, {
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      today: TODAY,
      nDays: 7,
      perAngler: 0.5,
      anglers: 12
    });
    seedCatch(db, {
      date: TODAY,
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      speciesCount: 20,
      anglers: 10
    }); // 2.0/angler
    const subs = [
      {
        id: sid,
        email: 'a@b.com',
        status: 'active' as const,
        created_at: '2026-04-01T00:00:00Z',
        confirmed_at: '2026-04-01T00:00:00Z',
        signup_ip: '127.0.0.1',
        paused_until: null,
        boats: [1],
        species: []
      }
    ];
    const out = evaluateHotDay({ today: TODAY, subscribers: subs, db });
    expect(out).toHaveLength(1);
    expect(out[0].subscriberId).toBe(sid);
    expect(out[0].boatId).toBe(1);
    expect(out[0].boatDisplayName).toBe('Pacific Dawn');
    expect(out[0].tripType).toBe('1/2 Day AM');
    expect(out[0].triggerKey).toBe('boat:1:1/2 Day AM');
    expect(out[0].triggerDate).toBe(TODAY);
    expect(out[0].todayAnglers).toBe(10);
    expect(out[0].todayValue).toBeCloseTo(2.0, 5);
    expect(out[0].trailingAvg).toBeCloseTo(0.5, 5);
    expect(out[0].multiplier).toBeCloseTo(4.0, 5);
    expect(out[0].speciesList).toEqual(['yellowtail']);
  });

  it('refuses when trailing window has <5 days of data (CLAUDE.md non-negotiable #3 floor)', () => {
    const db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    seedTrailingBaseline(db, {
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      today: TODAY,
      nDays: 4,
      perAngler: 0.5,
      anglers: 12
    });
    seedCatch(db, {
      date: TODAY,
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      speciesCount: 20,
      anglers: 10
    });
    const subs = [
      {
        id: sid,
        email: 'a@b.com',
        status: 'active' as const,
        created_at: '2026-04-01T00:00:00Z',
        confirmed_at: '2026-04-01T00:00:00Z',
        signup_ip: '127.0.0.1',
        paused_until: null,
        boats: [1],
        species: []
      }
    ];
    expect(evaluateHotDay({ today: TODAY, subscribers: subs, db })).toEqual([]);
  });

  it('refuses when today_anglers < MIN_ANGLERS (Pitfall 5 1-angler defense)', () => {
    const db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    seedTrailingBaseline(db, {
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      today: TODAY,
      nDays: 7,
      perAngler: 0.5,
      anglers: 12
    });
    // 1-angler trip with 4 fish caught — 4.0/angler, way over baseline, but anglers=1 < 8.
    seedCatch(db, {
      date: TODAY,
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      speciesCount: 4,
      anglers: 1
    });
    const subs = [
      {
        id: sid,
        email: 'a@b.com',
        status: 'active' as const,
        created_at: '2026-04-01T00:00:00Z',
        confirmed_at: '2026-04-01T00:00:00Z',
        signup_ip: '127.0.0.1',
        paused_until: null,
        boats: [1],
        species: []
      }
    ];
    expect(evaluateHotDay({ today: TODAY, subscribers: subs, db })).toEqual([]);
  });

  it('HOT_DAY_MIN_ANGLERS env override lowers the floor', () => {
    const db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    seedTrailingBaseline(db, {
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      today: TODAY,
      nDays: 7,
      perAngler: 0.5,
      anglers: 12
    });
    seedCatch(db, {
      date: TODAY,
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      speciesCount: 18,
      anglers: 6
    }); // 3.0/angler
    const subs = [
      {
        id: sid,
        email: 'a@b.com',
        status: 'active' as const,
        created_at: '2026-04-01T00:00:00Z',
        confirmed_at: '2026-04-01T00:00:00Z',
        signup_ip: '127.0.0.1',
        paused_until: null,
        boats: [1],
        species: []
      }
    ];
    // Default 8 floors out 6-angler trip:
    expect(evaluateHotDay({ today: TODAY, subscribers: subs, db })).toEqual([]);
    // Override to 4 — alert fires.
    process.env.HOT_DAY_MIN_ANGLERS = '4';
    expect(evaluateHotDay({ today: TODAY, subscribers: subs, db })).toHaveLength(1);
  });

  it('refuses when trailing_avg <= 0 (zero-baseline guard)', () => {
    const db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    // Plant 7 days of zero-catch trips to make trailing_avg = 0 (still has rows so n_days >=5).
    seedTrailingBaseline(db, {
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      today: TODAY,
      nDays: 7,
      perAngler: 0,
      anglers: 10
    });
    seedCatch(db, {
      date: TODAY,
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      speciesCount: 20,
      anglers: 10
    });
    const subs = [
      {
        id: sid,
        email: 'a@b.com',
        status: 'active' as const,
        created_at: '2026-04-01T00:00:00Z',
        confirmed_at: '2026-04-01T00:00:00Z',
        signup_ip: '127.0.0.1',
        paused_until: null,
        boats: [1],
        species: []
      }
    ];
    expect(evaluateHotDay({ today: TODAY, subscribers: subs, db })).toEqual([]);
  });

  it('same boat with TWO trip types same day yields TWO distinct candidates (Open Question 5)', () => {
    const db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    seedTrailingBaseline(db, {
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      today: TODAY,
      nDays: 7,
      perAngler: 0.5,
      anglers: 12
    });
    seedTrailingBaseline(db, {
      boatId: 1,
      tripType: '1/2 Day PM',
      species: 'yellowtail',
      today: TODAY,
      nDays: 7,
      perAngler: 0.5,
      anglers: 12
    });
    seedCatch(db, {
      date: TODAY,
      boatId: 1,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      speciesCount: 20,
      anglers: 10
    });
    seedCatch(db, {
      date: TODAY,
      boatId: 1,
      tripType: '1/2 Day PM',
      species: 'yellowtail',
      speciesCount: 20,
      anglers: 10
    });
    const subs = [
      {
        id: sid,
        email: 'a@b.com',
        status: 'active' as const,
        created_at: '2026-04-01T00:00:00Z',
        confirmed_at: '2026-04-01T00:00:00Z',
        signup_ip: '127.0.0.1',
        paused_until: null,
        boats: [1],
        species: []
      }
    ];
    const out = evaluateHotDay({ today: TODAY, subscribers: subs, db });
    expect(out).toHaveLength(2);
    const triggerKeys = out.map((c) => c.triggerKey).sort();
    expect(triggerKeys).toEqual(['boat:1:1/2 Day AM', 'boat:1:1/2 Day PM']);
  });

  it('subscriber following boat A but boat B has the hot day -> zero candidates', () => {
    const db = freshDb();
    const sid = seedSubscriber(db, { email: 'a@b.com', status: 'active', boats: [1] });
    seedTrailingBaseline(db, {
      boatId: 2,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      today: TODAY,
      nDays: 7,
      perAngler: 0.5,
      anglers: 12
    });
    seedCatch(db, {
      date: TODAY,
      boatId: 2,
      tripType: '1/2 Day AM',
      species: 'yellowtail',
      speciesCount: 20,
      anglers: 10
    });
    const subs = [
      {
        id: sid,
        email: 'a@b.com',
        status: 'active' as const,
        created_at: '2026-04-01T00:00:00Z',
        confirmed_at: '2026-04-01T00:00:00Z',
        signup_ip: '127.0.0.1',
        paused_until: null,
        boats: [1],
        species: []
      }
    ];
    expect(evaluateHotDay({ today: TODAY, subscribers: subs, db })).toEqual([]);
  });
});

// W6 fix invariant: getTrailingBoatTripStats(today, 30) yields exactly 30 calendar days
// with strict-exclusive bounds — (today - 30, today). With today='2026-04-15' the included
// dates MUST be 2026-03-16 through 2026-04-14 inclusive (30 distinct dates). This is the
// honesty-floor input — n_days surfaces in the result so the evaluator can refuse.
describe('getTrailingBoatTripStats — W6 window-size invariant', () => {
  it('seeds 30 dates inside the (today-30, today) window and 0 outside; result.n_days === 30', () => {
    const today = '2026-04-15';
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    db.prepare(`INSERT INTO landings (id, source_name, display_name) VALUES (1, 'fl', 'F')`).run();
    db.prepare(`INSERT INTO boats (id, source_name, display_name, landing_id) VALUES (1, 'b', 'Boat', 1)`).run();
    // Inside window: 2026-03-16..2026-04-14 inclusive (30 distinct dates).
    for (let i = 1; i <= 30; i++) {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      const ds = d.toISOString().slice(0, 10);
      db.prepare(
        `INSERT INTO catch_reports (source_date, boat_id, landing_id, trip_type, species, species_count, angler_count, scraped_at)
         VALUES (?, 1, 1, '1/2 Day AM', 'yellowtail', 5, 10, datetime('now'))`
      ).run(ds);
    }
    // Outside window edges (one day before lower bound + today itself) — must NOT be counted.
    db.prepare(
      `INSERT INTO catch_reports (source_date, boat_id, landing_id, trip_type, species, species_count, angler_count, scraped_at)
       VALUES ('2026-03-15', 1, 1, '1/2 Day AM', 'yellowtail', 5, 10, datetime('now'))`
    ).run();
    db.prepare(
      `INSERT INTO catch_reports (source_date, boat_id, landing_id, trip_type, species, species_count, angler_count, scraped_at)
       VALUES (?, 1, 1, '1/2 Day AM', 'yellowtail', 5, 10, datetime('now'))`
    ).run(today);
    const map = getTrailingBoatTripStats(db, today, 30);
    const stat = map.get(`1:1/2 Day AM`);
    expect(stat).toBeDefined();
    expect(stat!.n_days).toBe(30);
  });
});
