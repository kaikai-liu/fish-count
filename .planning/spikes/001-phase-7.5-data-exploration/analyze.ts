// Phase 7.5 data-exploration spike — answers the 17 questions in the spike
// prompt against the dev sqlite database. Throwaway code: run with
//   tsx .planning/spikes/001-phase-7.5-data-exploration/analyze.ts
// Writes:
//   - report.md (human-readable answers, copied to .planning/notes/)
//   - data.json (raw numbers for downstream charts/mocks)

import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(HERE, '..', '..', '..', 'data', 'dev.sqlite3');
const TODAY = '2026-05-01';

const db = new Database(DB_PATH, { readonly: true });

// Helper: window cutoff (inclusive on both ends, last N days through TODAY exclusive)
function windowStart(days: number): string {
  const d = new Date(TODAY + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const W7 = windowStart(7);
const W30 = windowStart(30);
const W90 = windowStart(90);

const out: Record<string, unknown> = {
  meta: { today: TODAY, window_7d_from: W7, window_30d_from: W30, window_90d_from: W90 }
};

// ────────────────────────────────────────────────────────────────────────────
// A row in catch_reports is one (boat, date, trip_type, species). A "trip" in
// the operator's sense is a unique (boat, date, trip_type) — the species rows
// are sub-rows of one trip with one angler_count.
// ────────────────────────────────────────────────────────────────────────────

// Q1: Distinct trip types in past 7/30/90
function distinctTripTypes(since: string) {
  return db
    .prepare(
      `SELECT trip_type, COUNT(DISTINCT source_date || '|' || boat_id || '|' || trip_type) AS trip_count
       FROM catch_reports
       WHERE source_date > ?
       GROUP BY trip_type
       ORDER BY trip_count DESC`
    )
    .all(since) as { trip_type: string; trip_count: number }[];
}
const tt7 = distinctTripTypes(W7);
const tt30 = distinctTripTypes(W30);
const tt90 = distinctTripTypes(W90);
out.q1_q2_trip_type_volume = {
  past_7: tt7,
  past_30: tt30,
  past_90: tt90,
  distinct_count_7: tt7.length,
  distinct_count_30: tt30.length,
  distinct_count_90: tt90.length
};

// Q3: Viable trip types — flag ≥5 trips in 7d window, plus alternative thresholds
const viable7 = tt7.filter((r) => r.trip_count >= 5);
const sparse7 = tt7.filter((r) => r.trip_count < 5);
out.q3_viability_7d = {
  viable_threshold_5: viable7.map((r) => r.trip_type),
  sparse_under_5: sparse7,
  recommendation_notes: 'See report.md'
};

// Q4: surprising names — single-occurrence trip types over 90d, or odd whitespace/case
const oddNames = db
  .prepare(
    `SELECT trip_type, COUNT(DISTINCT source_date || '|' || boat_id) AS trip_count, MIN(source_date) AS first_seen, MAX(source_date) AS last_seen
     FROM catch_reports
     GROUP BY trip_type
     HAVING trip_count <= 3
     ORDER BY trip_count ASC, trip_type`
  )
  .all() as { trip_type: string; trip_count: number; first_seen: string; last_seen: string }[];
out.q4_surprising_trip_types = oddNames;

// Q5/Q6/Q7: fish-per-angler distributions per viable trip type, 7d window
// fish_per_angler = SUM(species_count) per trip / angler_count of that trip
function distributionsPerTripType(tripType: string, since: string) {
  // Get per-trip totals — one row per (boat,date,trip_type)
  const rows = db
    .prepare(
      `SELECT source_date, boat_id, trip_type,
              MAX(angler_count) AS anglers,
              SUM(species_count) AS total_fish
       FROM catch_reports
       WHERE source_date > ? AND trip_type = ?
       GROUP BY source_date, boat_id, trip_type
       HAVING anglers > 0`
    )
    .all(since, tripType) as { source_date: string; boat_id: number; anglers: number; total_fish: number }[];

  const fpa = rows.map((r) => r.total_fish / r.anglers).sort((a, b) => a - b);
  if (fpa.length === 0)
    return { n_trips: 0, median: null, p90: null, p95: null, max: null, min: null, mean: null };

  const q = (p: number) => fpa[Math.min(fpa.length - 1, Math.floor(p * fpa.length))];
  const mean = fpa.reduce((s, v) => s + v, 0) / fpa.length;
  return {
    n_trips: fpa.length,
    min: +fpa[0].toFixed(2),
    median: +q(0.5).toFixed(2),
    p90: +q(0.9).toFixed(2),
    p95: +q(0.95).toFixed(2),
    max: +fpa[fpa.length - 1].toFixed(2),
    mean: +mean.toFixed(2)
  };
}

const distros7 = Object.fromEntries(
  tt7.map((r) => [r.trip_type, { ...distributionsPerTripType(r.trip_type, W7), trip_volume_7d: r.trip_count }])
);
out.q5_q6_distributions_7d = distros7;

// Q7: outliers — for each trip type, what's the gap between p90 and max?
const outliers = Object.entries(distros7)
  .map(([tt, d]) => {
    const dd = d as ReturnType<typeof distributionsPerTripType> & { trip_volume_7d: number };
    if (dd.median === null || dd.p90 === null || dd.max === null) return null;
    const ratio = dd.p90 > 0 ? dd.max / dd.p90 : 0;
    return { trip_type: tt, n: dd.n_trips, median: dd.median, p90: dd.p90, max: dd.max, max_to_p90_ratio: +ratio.toFixed(2) };
  })
  .filter(Boolean)
  .sort((a, b) => (b!.max_to_p90_ratio - a!.max_to_p90_ratio));
out.q7_outlier_trip_types = outliers;

// Q8: distinct species in 7d
const species7 = db
  .prepare(
    `SELECT species, COUNT(*) AS row_count, SUM(species_count) AS total_caught,
            COUNT(DISTINCT source_date || '|' || boat_id) AS trip_count
     FROM catch_reports
     WHERE source_date > ?
     GROUP BY species
     ORDER BY total_caught DESC`
  )
  .all(W7) as { species: string; row_count: number; total_caught: number; trip_count: number }[];
out.q8_q9_species_7d = {
  distinct_count: species7.length,
  top_20_by_volume: species7.slice(0, 20),
  long_tail_count: species7.filter((s) => s.total_caught < 10).length,
  zero_release_only: species7.filter((s) => s.total_caught === 0).length
};

// Q10: same query for 30d, compare top species stability
const species30 = db
  .prepare(
    `SELECT species, SUM(species_count) AS total_caught
     FROM catch_reports
     WHERE source_date > ?
     GROUP BY species ORDER BY total_caught DESC LIMIT 20`
  )
  .all(W30) as { species: string; total_caught: number }[];
const top10_7 = new Set(species7.slice(0, 10).map((s) => s.species));
const top10_30 = new Set(species30.slice(0, 10).map((s) => s.species));
const overlap = [...top10_7].filter((s) => top10_30.has(s));
out.q10_top_species_stability = {
  top10_7d: [...top10_7],
  top10_30d: [...top10_30],
  overlap_count: overlap.length,
  meaningful_section: overlap.length < 9
    ? 'YES — top-10 changes week-to-month, worth showing'
    : 'PROBABLY NOT — top-10 is nearly identical week vs month'
};

// Q11: released-species treatment
const releasedSplits = species7
  .filter((s) => s.species.includes(' released'))
  .map((s) => {
    const baseName = s.species.replace(/ released$/, '');
    const base = species7.find((b) => b.species === baseName);
    return {
      released: s.species,
      released_caught: s.total_caught,
      base_species: baseName,
      base_caught: base?.total_caught ?? 0,
      released_share: base ? +(s.total_caught / (s.total_caught + base.total_caught)).toFixed(2) : null
    };
  })
  .sort((a, b) => b.released_caught - a.released_caught);
out.q11_released_species_7d = releasedSplits;

// Q12: boats with 0 anglers in 7d
const zeroAnglerTrips = db
  .prepare(
    `SELECT source_date, boat_id, trip_type, MAX(angler_count) AS anglers, SUM(species_count) AS fish
     FROM catch_reports
     WHERE source_date > ?
     GROUP BY source_date, boat_id, trip_type
     HAVING anglers = 0`
  )
  .all(W7) as { source_date: string; boat_id: number; trip_type: string; anglers: number; fish: number }[];
out.q12_zero_angler_trips_7d = {
  count: zeroAnglerTrips.length,
  examples: zeroAnglerTrips.slice(0, 5)
};

// Q13: anglers but 0 caught in 7d
const zeroCatchTrips = db
  .prepare(
    `SELECT source_date, boat_id, trip_type, MAX(angler_count) AS anglers, SUM(species_count) AS fish
     FROM catch_reports
     WHERE source_date > ?
     GROUP BY source_date, boat_id, trip_type
     HAVING anglers > 0 AND fish = 0`
  )
  .all(W7) as { source_date: string; boat_id: number; trip_type: string; anglers: number; fish: number }[];
out.q13_zero_catch_trips_7d = {
  count: zeroCatchTrips.length,
  examples: zeroCatchTrips.slice(0, 5)
};

// Q14: trip-type overlap "1/2 Day" vs "1/2 Day AM"/"PM"
const halfDayVariants = db
  .prepare(
    `SELECT trip_type, COUNT(DISTINCT source_date || '|' || boat_id) AS trip_count, MIN(source_date) as first_seen, MAX(source_date) as last_seen
     FROM catch_reports
     WHERE trip_type LIKE '%1/2%' OR trip_type LIKE '%half%' OR trip_type LIKE '%Half%'
     GROUP BY trip_type
     ORDER BY trip_count DESC`
  )
  .all() as { trip_type: string; trip_count: number; first_seen: string; last_seen: string }[];
out.q14_half_day_variants = halfDayVariants;

// Q15: data quality — null/odd species, weird dates, anglers > 1000, species_count < 0
const dataQuality = {
  null_or_empty_species: (db.prepare(`SELECT COUNT(*) c FROM catch_reports WHERE species IS NULL OR species = ''`).get() as { c: number }).c,
  whitespace_padded_species: (db.prepare(`SELECT COUNT(*) c FROM catch_reports WHERE species != TRIM(species)`).get() as { c: number }).c,
  whitespace_padded_trip_type: (db.prepare(`SELECT COUNT(*) c FROM catch_reports WHERE trip_type != TRIM(trip_type)`).get() as { c: number }).c,
  negative_species_count: (db.prepare(`SELECT COUNT(*) c FROM catch_reports WHERE species_count < 0`).get() as { c: number }).c,
  huge_anglers: (db.prepare(`SELECT COUNT(*) c FROM catch_reports WHERE angler_count > 200`).get() as { c: number }).c,
  duplicate_unique_key: (db.prepare(`SELECT COUNT(*) c FROM (SELECT source_date, boat_id, trip_type, species, COUNT(*) cc FROM catch_reports GROUP BY 1,2,3,4 HAVING cc > 1)`).get() as { c: number }).c,
  case_variant_species: (db.prepare(`SELECT COUNT(*) c FROM (SELECT LOWER(species) s, COUNT(DISTINCT species) cc FROM catch_reports GROUP BY 1 HAVING cc > 1)`).get() as { c: number }).c
};
out.q15_data_quality = dataQuality;

// Q16: window sizing — recompute Q3 with 14d, 21d to see how viability shifts
function viableAt(days: number, threshold: number) {
  const since = windowStart(days);
  const tt = distinctTripTypes(since);
  return {
    window_days: days,
    threshold_trips: threshold,
    viable_count: tt.filter((r) => r.trip_count >= threshold).length,
    viable: tt.filter((r) => r.trip_count >= threshold).map((r) => `${r.trip_type} (${r.trip_count})`)
  };
}
out.q16_window_sizing = [viableAt(7, 5), viableAt(7, 10), viableAt(14, 5), viableAt(14, 10), viableAt(30, 10)];

// Q17: sample composition — for each viable trip type 7d, top-5 boats by fish/angler with min trips
function topNBoatsForTripType(tripType: string, since: string, minTrips: number, n: number) {
  const rows = db
    .prepare(
      `WITH per_trip AS (
         SELECT source_date, boat_id, trip_type,
                MAX(angler_count) AS anglers,
                SUM(species_count) AS fish
         FROM catch_reports
         WHERE source_date > ? AND trip_type = ?
         GROUP BY source_date, boat_id, trip_type
         HAVING anglers > 0
       )
       SELECT b.display_name AS boat, COUNT(*) AS trips,
              ROUND(SUM(fish) * 1.0 / SUM(anglers), 2) AS fpa
       FROM per_trip p
       JOIN boats b ON b.id = p.boat_id
       GROUP BY p.boat_id
       HAVING trips >= ?
       ORDER BY fpa DESC
       LIMIT ?`
    )
    .all(since, tripType, minTrips, n) as { boat: string; trips: number; fpa: number }[];
  return rows;
}
const composition = Object.fromEntries(
  viable7.map((r) => [r.trip_type, topNBoatsForTripType(r.trip_type, W7, 1, 5)])
);
const totalRows = Object.values(composition).reduce((s, v) => s + (v as unknown[]).length, 0);
out.q17_page_composition = {
  sections: viable7.length,
  total_rows: totalRows,
  preview: composition,
  notes: `If "top-5 per viable trip type, past 7d, fish/angler" — page is ${viable7.length} sections × ≤5 rows = ${totalRows} rows max.`
};

// ────────────────────────────────────────────────────────────────────────────
// Write outputs
// ────────────────────────────────────────────────────────────────────────────

writeFileSync(join(HERE, 'data.json'), JSON.stringify(out, null, 2));
console.log('Wrote data.json');
console.log('Today:', TODAY);
console.log('Total rows:', db.prepare('SELECT COUNT(*) c FROM catch_reports').get());
console.log('7d window starts after:', W7);
console.log('Distinct trip types 7d/30d/90d:', tt7.length, tt30.length, tt90.length);
console.log('Viable trip types 7d (≥5):', viable7.map((r) => `${r.trip_type} (${r.trip_count})`));
