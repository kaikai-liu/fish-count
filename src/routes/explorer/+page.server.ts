// src/routes/explorer/+page.server.ts — Explorer route loader (EXPL-01..EXPL-14)
// CLAUDE.md Architecture Rule: DAL is the only module that issues SQL.
//
// Sources:
//   .planning/phases/06-explorer-foundation/06-CONTEXT.md §D-01..D-25
//   .planning/phases/06-explorer-foundation/06-RESEARCH.md §"System Architecture Diagram"
//   .planning/phases/06-explorer-foundation/06-PATTERNS.md §"+page.server.ts"
//
// Threat mitigations (threat_model in 06-05-PLAN.md):
//   T-06-24: tooltipFormatter HTML-escaped by escapeHtml helper in +page.svelte
//   T-06-25: auto-widen / caption strings returned as plain strings → Svelte auto-escapes
//   T-06-26: URL max lengths capped by Plan 02 Zod schema (slug.max(80), name.max(120))
//   T-06-27: Cache-Control is read-only public data; max-age=60 on today-inclusive ranges
//   T-06-28: goto() called with typed ExplorerFilters → serializeExplorerFilters; no open redirect
//   T-06-29: custom range clamped to [earliestScrapeDate, today()] + clampNote emitted
//   T-06-30: no 'echarts' import here — Chart.svelte does the dynamic import
//   T-06-31: logger payload contains no user PII (anonymous explorer)
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db/client';
import {
  boatExplorerSeries,
  speciesAcrossBoats,
  landingAcrossSpecies,
  speciesBreakdownForBoat,
  boatsForLandingInRange,
  boatsForSpeciesInRange,
  countCatchRowsForBoatInRange,
  countCatchRowsForBoatEver,
  countCatchRowsForSpeciesEver,
  countCatchRowsForLandingEver,
  mostCaughtSpeciesForBoatInRange,
  topBoatForSpeciesInRange,
  type SpeciesBreakdownRow
} from '$lib/db/queries/explorer';
import { EMPTY_STATES } from '$lib/copy/empty-states';
import { distinctSpecies, topSpecies, distinctLandings, landingIdByDisplayName } from '$lib/db/queries/browse';
import { canonicalizeSpecies } from '$lib/db/speciesCanonical';
import { findBySlug, listBoatsByActivity, mostActiveBoatLast30Days } from '$lib/db/boats';
import { getByName, mostRecentlyActiveLanding } from '$lib/db/landings';
import { latestSuccessOrEmpty } from '$lib/db/scrapeRuns';
import { today, toPtTimeLabel, clampDate } from '$lib/shared/dates';
import {
  parseExplorerFilters,
  defaultGranularityForRange,
  type ExplorerFilters,
  type Granularity
} from '$lib/shared/urlState';
import { rangeToDates } from '$lib/shared/range';
import { isoWeekStartFromKey, monthStartFromKey } from '$lib/shared/dates';
import { moonIllumination } from '$lib/shared/moon';
import { FISH_PER_ANGLER_AXIS, FISH_PER_ANGLER_ARIA } from '$lib/copy/metrics';
import {
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  format
} from 'date-fns';

// ---------------------------------------------------------------------------
// Range label for caption (D-16 copywriting contract)
// ---------------------------------------------------------------------------
function rangeLabel(filters: ExplorerFilters, _fromDate: string, _toDate: string): string {
  const labels: Record<string, string> = {
    '1m': 'the past month',
    '3m': 'the past 3 months',
    '6m': 'the past 6 months',
    '1y': 'the past year',
    '2y': 'the past 2 years',
    '5y': 'the past 5 years',
    'all': 'all available data'
  };
  return labels[filters.range] ?? filters.range;
}

// ---------------------------------------------------------------------------
// Granularity label for caption
// ---------------------------------------------------------------------------
function granularityLabel(g: 'daily' | 'weekly' | 'monthly'): string {
  if (g === 'daily') return 'Daily';
  if (g === 'weekly') return 'Weekly';
  return 'Monthly';
}

// ---------------------------------------------------------------------------
// Gap-fill: build expected bucket keys from date-fns interval helpers.
// ---------------------------------------------------------------------------
function buildExpectedKeys(
  fromDate: string,
  toDate: string,
  granularity: 'daily' | 'weekly' | 'monthly'
): string[] {
  const fromDateObj = new Date(fromDate + 'T00:00:00Z');
  const toDateObj = new Date(toDate + 'T00:00:00Z');
  if (granularity === 'daily') {
    return eachDayOfInterval({ start: fromDateObj, end: toDateObj }).map((d) =>
      format(d, 'yyyy-MM-dd')
    );
  }
  if (granularity === 'weekly') {
    return eachWeekOfInterval({ start: fromDateObj, end: toDateObj }, { weekStartsOn: 1 }).map(
      (d) => format(d, "RRRR-'W'II")
    );
  }
  return eachMonthOfInterval({ start: fromDateObj, end: toDateObj }).map((d) =>
    format(d, 'yyyy-MM')
  );
}

// ---------------------------------------------------------------------------
// Align a per-series bucket array to expectedKeys — returns null for gaps.
// ---------------------------------------------------------------------------
function alignSeries<T extends { bucket_key: string; value: number | null }>(
  buckets: T[],
  expectedKeys: string[]
): (number | null)[] {
  const presentMap = new Map(buckets.map((b) => [b.bucket_key, b.value]));
  return expectedKeys.map((k) => presentMap.get(k) ?? null);
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------
export const load: PageServerLoad = async ({ url, setHeaders, locals }) => {
  const db = getDb();

  const lastScrape = latestSuccessOrEmpty(db);
  const lastScrapedLabel = lastScrape ? toPtTimeLabel(lastScrape.finished_at) : null;

  // -------------------------------------------------------------------------
  // Step 1: Parse URL → resolve filters (D-04 clean URL / D-08 cross-axis defaults)
  // -------------------------------------------------------------------------
  let filters: ExplorerFilters;
  let usingDefaults = false;

  if (url.searchParams.size === 0) {
    // D-04: no params → resolve defaults server-side
    const defaultBoat = mostActiveBoatLast30Days(db);
    if (!defaultBoat) {
      // No scrape data at all — return empty state
      setHeaders({ 'cache-control': 'public, max-age=60' });
      return {
        filters: { ticker: 'boat' as const, slug: '', range: '1y' as const, moon: false },
        autoWidenNote: null,
        clampNote: null,
        chartOption: null,
        moonChartOption: null,
        nByBucketBySeries: {},
        caption: '',
        ariaLabel: '',
        breakdownRows: null,
            supportingList: null,
        selectorOptions: [],
        lastScrapedLabel,
        empty: {
          heading: 'No data yet',
          body: 'No catch data has been scraped yet. Check back after the first scrape run.'
        },
        noHistoryEver: true,
        pageTitle: 'Boat',
        granularity: 'weekly' as const,
        showGranularitySelector: false,
        bucketStartIsos: [] as string[]
      };
    }
    filters = { ticker: 'boat', slug: defaultBoat.slug, range: '1y', moon: false };
    usingDefaults = true;
  } else {
    // Try to parse ticker from URL. Special case: ticker param present but slug/name absent
    // (cross-axis default from ticker switch in +page.svelte). The client sends only
    // ?ticker=X&range=Y and expects the loader to resolve the default selection.
    const rawTicker = url.searchParams.get('ticker');
    const rawSlug = url.searchParams.get('slug');
    const rawName = url.searchParams.get('name');
    const rawRange = url.searchParams.get('range') ?? '1y';
    // Polish pass: optional Landing pre-filter on the Boat ticker.
    const rawLanding = url.searchParams.get('landing') || undefined;
    // Phase 7 (MOON-01): preserve moon flag through cross-axis default resolution.
    // Loose check (not Zod) — only used as a literal pass-through when client sends
    // ?ticker=X&range=Y&moon=1 from a ticker-switch in +page.svelte. Full Zod
    // validation runs in the parseExplorerFilters branch below.
    const rawMoonStr = url.searchParams.get('moon');
    const rawMoon = rawMoonStr === '1' || rawMoonStr === 'true';
    // Phase 8 Plan 04 (GRN-01): preserve granularity through cross-axis
    // default resolution. Loose check (matching the moon flag pattern).
    const rawGranStr = url.searchParams.get('granularity');
    const rawGranularity: Granularity | undefined =
      rawGranStr === 'daily' || rawGranStr === 'weekly' || rawGranStr === 'monthly'
        ? rawGranStr
        : undefined;

    // Cross-axis default resolution (D-08): if ticker is present but identifier is absent
    if (
      rawTicker &&
      ((rawTicker === 'boat' && !rawSlug) ||
        (rawTicker !== 'boat' && !rawName))
    ) {
      // Resolve cross-axis default for this ticker
      const resolved = rangeToDates((rawRange as ExplorerFilters['range']) ?? '1y');
      const { fromDate: fd, toDate: td } = resolved;

      if (rawTicker === 'boat') {
        // Polish pass: when landing pre-filter is set, pick a default boat
        // from that landing (not the global most-active).
        let defaultBoat = mostActiveBoatLast30Days(db);
        if (rawLanding) {
          const landingId = landingIdByDisplayName(db, rawLanding);
          if (landingId != null) {
            const candidates = listBoatsByActivity(db, 90).filter((b) => b.landing_id === landingId);
            if (candidates.length > 0) defaultBoat = candidates[0];
          }
        }
        if (defaultBoat) {
          filters = { ticker: 'boat', slug: defaultBoat.slug, range: rawRange as ExplorerFilters['range'], moon: rawMoon, granularity: rawGranularity, landing: rawLanding };
        } else {
          setHeaders({ 'cache-control': 'public, max-age=60' });
          return {
            filters: { ticker: 'boat', slug: '', range: rawRange as ExplorerFilters['range'], moon: rawMoon },
            autoWidenNote: null,
            clampNote: null,
            chartOption: null,
            moonChartOption: null,
            nByBucketBySeries: {},
            caption: '',
            ariaLabel: '',
            breakdownRows: null,
            supportingList: null,
            selectorOptions: [],
            lastScrapedLabel,
            empty: { heading: 'No data yet', body: 'No catch data available.' },
            noHistoryEver: true,
            pageTitle: 'Boat',
            granularity: defaultGranularityForRange(rawRange as ExplorerFilters['range']),
            showGranularitySelector: false,
            bucketStartIsos: [] as string[]
          };
        }
      } else if (rawTicker === 'species') {
        // Find a default species — use the most active boat to pick top species
        const defaultBoat = mostActiveBoatLast30Days(db);
        const defaultSpecies = defaultBoat
          ? mostCaughtSpeciesForBoatInRange(db, { boatId: defaultBoat.id, fromDate: fd, toDate: td })
          : null;
        const allSpecies = distinctSpecies(db);
        const speciesName = defaultSpecies ?? allSpecies[0] ?? '';
        if (!speciesName) {
          setHeaders({ 'cache-control': 'public, max-age=60' });
          return {
            filters: { ticker: 'species', name: '', range: rawRange as ExplorerFilters['range'], moon: rawMoon },
            autoWidenNote: null,
            clampNote: null,
            chartOption: null,
            moonChartOption: null,
            nByBucketBySeries: {},
            caption: '',
            ariaLabel: '',
            breakdownRows: null,
            supportingList: null,
            selectorOptions: [],
            lastScrapedLabel,
            empty: { heading: 'No data yet', body: 'No species data available.' },
            noHistoryEver: true,
            pageTitle: 'Species',
            granularity: defaultGranularityForRange(rawRange as ExplorerFilters['range']),
            showGranularitySelector: false,
            bucketStartIsos: [] as string[]
          };
        }
        filters = { ticker: 'species', name: speciesName, range: rawRange as ExplorerFilters['range'], moon: rawMoon, granularity: rawGranularity };
      } else {
        // landing ticker
        const defaultLanding = mostRecentlyActiveLanding(db);
        if (defaultLanding) {
          filters = { ticker: 'landing', name: defaultLanding.display_name, range: rawRange as ExplorerFilters['range'], moon: rawMoon, granularity: rawGranularity };
        } else {
          setHeaders({ 'cache-control': 'public, max-age=60' });
          return {
            filters: { ticker: 'landing', name: '', range: rawRange as ExplorerFilters['range'], moon: rawMoon },
            autoWidenNote: null,
            clampNote: null,
            chartOption: null,
            moonChartOption: null,
            nByBucketBySeries: {},
            caption: '',
            ariaLabel: '',
            breakdownRows: null,
            supportingList: null,
            selectorOptions: [],
            lastScrapedLabel,
            empty: { heading: 'No data yet', body: 'No landing data available.' },
            noHistoryEver: true,
            pageTitle: 'Landing',
            granularity: defaultGranularityForRange(rawRange as ExplorerFilters['range']),
            showGranularitySelector: false,
            bucketStartIsos: [] as string[]
          };
        }
      }
    } else {
      // Normal parse
      const parseResult = parseExplorerFilters(url.searchParams);
      if ('error' in parseResult) {
        setHeaders({ 'cache-control': 'public, max-age=300' });
        return {
          filters: { ticker: 'boat' as const, slug: '', range: '1y' as const, moon: false },
          autoWidenNote: null,
          clampNote: null,
          chartOption: null,
          moonChartOption: null,
          nByBucketBySeries: {},
          caption: '',
          ariaLabel: '',
          breakdownRows: null,
            supportingList: null,
          selectorOptions: [],
          lastScrapedLabel,
          empty: {
            heading: 'Invalid filter',
            body: 'The URL parameters were not recognized. Try navigating to /explorer to start fresh.'
          },
          noHistoryEver: true,
          pageTitle: 'Explorer',
          granularity: 'weekly' as const,
          showGranularitySelector: false,
          bucketStartIsos: [] as string[]
        };
      }
      filters = parseResult;
      // Polish pass: when species ticker name carries a stale variant (e.g.
      // a shared URL minted before the released-rollup), normalize to canonical
      // so queries (which filter on CANONICAL_SPECIES_EXPR) actually match.
      if (filters.ticker === 'species') {
        const canonical = canonicalizeSpecies(filters.name);
        if (canonical !== filters.name) {
          filters = { ...filters, name: canonical };
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: Resolve date range (D-02). Polish pass: 'custom' range removed
  // — chart dataZoom replaces it. clampNote stays for back-compat with the
  // page contract but is always null now.
  // -------------------------------------------------------------------------
  const clampNote: string | null = null;
  const resolvedRange = rangeToDates(filters.range);
  // eslint-disable-next-line prefer-const
  let { fromDate, toDate, granularity, includesToday } = resolvedRange;

  // Phase 8 Plan 04 (GRN-01 / D-39). User can override the per-range default
  // granularity via the URL. defaultGranularityForRange supplies the default
  // when the URL is silent. Range-switch reset to default is enforced
  // page-side in /explorer/+page.svelte (Pitfall 3 + D-38).
  if (filters.granularity) {
    granularity = filters.granularity;
  } else {
    granularity = defaultGranularityForRange(filters.range);
  }

  // -------------------------------------------------------------------------
  // Step 3: Auto-widen (D-03) — only on defaults, boat ticker, 1y range
  // -------------------------------------------------------------------------
  let autoWidenNote: string | null = null;

  if (usingDefaults && filters.ticker === 'boat' && filters.range === '1y') {
    const boatRow = findBySlug(db, (filters as { ticker: 'boat'; slug: string } & typeof filters).slug);
    if (boatRow) {
      const rowCount = countCatchRowsForBoatInRange(db, {
        boatId: boatRow.id,
        fromDate,
        toDate
      });
      if (rowCount === 0) {
        // Widen to All
        const widenedRange = rangeToDates('all');
        fromDate = widenedRange.fromDate;
        toDate = widenedRange.toDate;
        granularity = widenedRange.granularity;
        includesToday = widenedRange.includesToday;
        filters = { ...filters, range: 'all' } as ExplorerFilters;
        autoWidenNote = 'No 1Y data — showing full history.';
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Build expected bucket keys (gap-fill axis)
  // -------------------------------------------------------------------------
  const expectedKeys = buildExpectedKeys(fromDate, toDate, granularity);

  // -------------------------------------------------------------------------
  // Step 5: Fetch data by ticker type
  // -------------------------------------------------------------------------

  // Prepare selector options (for the <select> dropdown)
  let selectorOptions: Array<{ value: string; label: string }> = [];

  type SeriesData = {
    label: string;
    data: (number | null)[];
    totalN: number;
    nByBucket: Record<string, number>;
  };
  const buildNByBucket = <T extends { bucket_key: string; n_trips: number }>(
    buckets: T[]
  ): Record<string, number> => {
    const map: Record<string, number> = {};
    for (const b of buckets) map[b.bucket_key] = b.n_trips;
    return map;
  };
  let seriesList: SeriesData[] = [];
  let breakdownRows: SpeciesBreakdownRow[] | null = null;
  // Polish pass: unified supporting list for cross-axis info under the chart.
  // Populated for every ticker (species caught for boat, boats at landing
  // for landing, boats catching species for species). Each row carries a
  // ready-to-navigate href so the component stays a dumb renderer.
  let supportingList: {
    kind: 'species' | 'boat';
    heading: string;
    rows: Array<{
      label: string;
      href: string;
      fish_per_angler: number | null;
      total_catch: number;
      n_trips: number;
    }>;
  } | null = null;
  let totalTrips = 0;
  let emptyResult: { heading: string; body: string } | null = null;
  let selectionLabel = '';

  // Phase 8 Plan 04 (POL-03 / D-33): track whether the ticker has any history
  // at all (independent of range). Empty-state copy varies on this signal.
  let noHistoryEver = false;

  if (filters.ticker === 'boat') {
    // Boat selector options (D-09: sorted by activity over 90 days).
    // Polish pass: optional 'landing' filter narrows the dropdown to one
    // landing's boats so anglers don't have to scan all 90.
    const boats = listBoatsByActivity(db, 90);
    let filteredBoats = boats;
    if (filters.landing) {
      const landingId = landingIdByDisplayName(db, filters.landing);
      if (landingId != null) {
        filteredBoats = boats.filter((b) => b.landing_id === landingId);
      }
    }
    selectorOptions = filteredBoats.map((b) => ({ value: b.slug, label: b.display_name }));

    const boatRow = findBySlug(db, filters.slug);
    if (!boatRow) {
      emptyResult = {
        heading: 'Boat not found',
        body: `No boat found with slug "${filters.slug}". It may have been renamed or removed. Try selecting a different boat.`
      };
      // Unknown slug — treat as "no history at all" for title-bar consistency.
      noHistoryEver = true;
    } else {
      selectionLabel = boatRow.display_name;
      const rawBuckets = boatExplorerSeries(db, {
        boatId: boatRow.id,
        fromDate,
        toDate,
        granularity
      });

      // Group by trip_type
      const byTripType = new Map<string, typeof rawBuckets>();
      for (const b of rawBuckets) {
        if (!byTripType.has(b.trip_type)) byTripType.set(b.trip_type, []);
        byTripType.get(b.trip_type)!.push(b);
      }

      for (const [tripType, buckets] of byTripType) {
        const seriesN = buckets.reduce((s, b) => s + b.n_trips, 0);
        totalTrips += seriesN;
        seriesList.push({
          label: tripType, // verbatim, CLAUDE.md domain language
          data: alignSeries(buckets, expectedKeys),
          totalN: seriesN,
          nByBucket: buildNByBucket(buckets)
        });
      }

      // Species breakdown table (boat ticker only)
      breakdownRows = speciesBreakdownForBoat(db, {
        boatId: boatRow.id,
        fromDate,
        toDate
      });
      supportingList = {
        kind: 'species',
        heading: 'Species caught',
        rows: breakdownRows.map((r) => ({
          label: r.species,
          href: `/explorer?ticker=species&name=${encodeURIComponent(r.species)}&range=${filters.range}`,
          fish_per_angler: r.fish_per_angler,
          total_catch: r.total_catch,
          n_trips: r.n_trips
        }))
      };

      if (seriesList.length === 0) {
        // Phase 8 Plan 04 (POL-03 / D-33): split copy on whether the boat has
        // any history EVER (different action: wait vs widen).
        noHistoryEver = countCatchRowsForBoatEver(db, { boatId: boatRow.id }) === 0;
        emptyResult = noHistoryEver
          ? EMPTY_STATES.boatNoHistoryAtAll(boatRow.display_name)
          : EMPTY_STATES.boatNoHistoryInRange(boatRow.display_name);
      }
    }
  } else if (filters.ticker === 'species') {
    // Polish pass: trim from 310 → top 20 most-caught species (alphabetical),
    // size-class variants rolled up to canonical name. Anglers were drowning
    // in "bluefin tuna (up to 100 pounds)" + 99 sibling weights.
    const speciesList = topSpecies(db, 20);
    selectorOptions = speciesList.map((s) => ({ value: s, label: s }));
    selectionLabel = filters.name;

    const result = speciesAcrossBoats(db, {
      species: filters.name,
      fromDate,
      toDate,
      granularity,
      topN: 6
    });

    if (result.topBoats.length === 0) {
      // Phase 8 Plan 04 (POL-03 / D-33).
      noHistoryEver = countCatchRowsForSpeciesEver(db, { species: filters.name }) === 0;
      emptyResult = EMPTY_STATES.speciesNoHistoryInRange(filters.name);
    } else {
      // Polish pass: supporting list for species view — boats catching this species
      const boatRows = boatsForSpeciesInRange(db, {
        species: filters.name,
        fromDate,
        toDate
      });
      supportingList = {
        kind: 'boat',
        heading: 'Boats catching this species',
        rows: boatRows.map((r) => ({
          label: r.boat_name,
          href: `/explorer?ticker=boat&slug=${encodeURIComponent(r.boat_slug)}&range=${filters.range}`,
          fish_per_angler: r.fish_per_angler,
          total_catch: r.total_catch,
          n_trips: r.n_trips
        }))
      };
      // Map bucket data per boat
      const byBoatId = new Map<number, typeof result.series>();
      for (const b of result.series) {
        if (!byBoatId.has(b.boat_id)) byBoatId.set(b.boat_id, []);
        byBoatId.get(b.boat_id)!.push(b);
      }

      for (const boat of result.topBoats) {
        const buckets = byBoatId.get(boat.id) ?? [];
        const seriesN = buckets.reduce((s, b) => s + b.n_trips, 0);
        totalTrips += seriesN;
        seriesList.push({
          label: boat.display_name, // verbatim
          data: alignSeries(buckets, expectedKeys),
          totalN: seriesN,
          nByBucket: buildNByBucket(buckets)
        });
      }
    }
  } else {
    // Landing ticker
    // Fetch landing options from distinct landings
    const { distinctLandings } = await import('$lib/db/queries/browse');
    const allLandings = distinctLandings(db);
    selectorOptions = allLandings.map((l) => ({ value: l.display_name, label: l.display_name }));

    const landingRow = getByName(db, filters.name);
    if (!landingRow) {
      emptyResult = {
        heading: 'Landing not found',
        body: `No landing found named "${filters.name}". Try selecting a different landing.`
      };
      noHistoryEver = true;
    } else {
      selectionLabel = landingRow.display_name;
      const result = landingAcrossSpecies(db, {
        landingId: landingRow.id,
        fromDate,
        toDate,
        granularity,
        topN: 6
      });

      if (result.topSpecies.length === 0) {
        noHistoryEver = countCatchRowsForLandingEver(db, { landingId: landingRow.id }) === 0;
        emptyResult = EMPTY_STATES.landingNoHistoryInRange(landingRow.display_name);
      } else {
        // Polish pass: supporting list for landing view — boats at this landing
        const boatRows = boatsForLandingInRange(db, {
          landingId: landingRow.id,
          fromDate,
          toDate
        });
        supportingList = {
          kind: 'boat',
          heading: 'Boats at this landing',
          rows: boatRows.map((r) => ({
            label: r.boat_name,
            href: `/explorer?ticker=boat&slug=${encodeURIComponent(r.boat_slug)}&range=${filters.range}`,
            fish_per_angler: r.fish_per_angler,
            total_catch: r.total_catch,
            n_trips: r.n_trips
          }))
        };
        // Map bucket data per species
        const bySpecies = new Map<string, typeof result.series>();
        for (const b of result.series) {
          if (!bySpecies.has(b.species)) bySpecies.set(b.species, []);
          bySpecies.get(b.species)!.push(b);
        }

        for (const species of result.topSpecies) {
          const buckets = bySpecies.get(species) ?? [];
          const seriesN = buckets.reduce((s, b) => s + b.n_trips, 0);
          totalTrips += seriesN;
          seriesList.push({
            label: species, // verbatim, CLAUDE.md domain language
            data: alignSeries(buckets, expectedKeys),
            totalN: seriesN,
            nByBucket: buildNByBucket(buckets)
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 6: Cache-Control (D-20)
  // -------------------------------------------------------------------------
  setHeaders({
    'cache-control': includesToday ? 'public, max-age=60' : 'public, max-age=300'
  });

  // -------------------------------------------------------------------------
  // Phase 8 Plan 04 (POL-04 / D-34). Page title: verbatim source label per
  // ticker (boat display_name, species name, landing display_name). Falls
  // back to ticker-type label when selection is unresolved (empty branch).
  // -------------------------------------------------------------------------
  const pageTitle =
    selectionLabel ||
    (filters.ticker === 'boat'
      ? 'Boat'
      : filters.ticker === 'species'
        ? 'Species'
        : 'Landing');

  // -------------------------------------------------------------------------
  // Step 7: Return empty state if applicable
  // -------------------------------------------------------------------------
  if (emptyResult) {
    locals.logger?.info({
      msg: 'explorer_loaded',
      ticker: filters.ticker,
      identifier: filters.ticker === 'boat' ? filters.slug : filters.name,
      range: filters.range,
      moon: filters.moon,
      granularity,
      bucketCount: 0,
      empty: true
    });
    return {
      filters,
      autoWidenNote,
      clampNote,
      chartOption: null,
      moonChartOption: null,
      nByBucketBySeries: {},
      caption: '',
      ariaLabel: '',
      breakdownRows: null,
            supportingList: null,
      selectorOptions,
      lastScrapedLabel,
      empty: emptyResult,
      noHistoryEver,
      pageTitle,
      granularity: granularity as Granularity,
      showGranularitySelector: filters.range !== '1m',
      bucketStartIsos: [] as string[]
    };
  }

  // -------------------------------------------------------------------------
  // Step 8: Build chartOption (plain JSON — no echarts import, Pitfall 2 / T-06-30)
  // -------------------------------------------------------------------------

  // Legend label: angler-readable "trips" instead of statistician shorthand "n="
  // (operator override of original D-16 spec after seeing the rendered chart).
  const legendNameFor = (s: SeriesData): string =>
    `${s.label} · ${s.totalN.toLocaleString()} ${s.totalN === 1 ? 'trip' : 'trips'}`;

  // D-15: series 7+ get legendSelected: false ("+N more" collapse)
  const legendSelected: Record<string, boolean> = {};
  seriesList.forEach((s, i) => {
    legendSelected[legendNameFor(s)] = i < 6;
  });

  // nByBucketBySeries: per-bucket trip counts keyed by legend name. Used by
  // the client-side tooltip formatter (T-06-24). Phase 8 Plan 04 (AXS-01)
  // flips the inner key from bucket_key (e.g. '2025-W14') to ISO date
  // (e.g. '2025-03-31') because ECharts time-mode surfaces Date-or-ms in
  // params.axisValue, which the page-side formatter normalizes to ISO. The
  // re-keying happens below after bucketStartIsos is built.

  // Phase 8 Plan 04 (AXS-01 / D-35). x-axis migration category → time. Each
  // bucket key gets a real PT-canonical ISO date (the bucket's start) so
  // ECharts time-mode renders the axis correctly at every range × granularity.
  // Series data becomes [iso, value] pairs (ECharts time-axis format). The
  // moon overlay below also flips to type='time' so it aligns with the catch
  // chart's axis (Pitfall 4).
  function bucketKeyToIso(key: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
    if (/^\d{4}-\d{2}$/.test(key)) return monthStartFromKey(key);
    if (/^\d{4}-W\d{2}$/.test(key)) return isoWeekStartFromKey(key);
    return fromDate; // unreachable given buildExpectedKeys, defensive only
  }
  const bucketStartIsos: string[] = expectedKeys.map((k: string) => bucketKeyToIso(k));

  // Build chart series with [iso, value] pairs for time-axis mode.
  const chartSeries = seriesList.map((s) => ({
    name: legendNameFor(s),
    type: 'line' as const,
    connectNulls: true, // Polish pass (operator pref): connect across no-data gaps for a smoother line
    data: s.data.map((v, i) => [bucketStartIsos[i], v])
  }));

  // Re-key per-bucket trip counts by ISO date for the time-axis tooltip
  // formatter (see legend comment block above).
  const nByBucketBySeries: Record<string, Record<string, number>> = {};
  for (const s of seriesList) {
    const byIso: Record<string, number> = {};
    for (const [bucketKey, count] of Object.entries(s.nByBucket)) {
      const iso = bucketKeyToIso(bucketKey);
      byIso[iso] = count;
    }
    nByBucketBySeries[legendNameFor(s)] = byIso;
  }

  const captionText = `Based on ${totalTrips.toLocaleString()} trips across ${rangeLabel(filters, fromDate, toDate)}. ${granularityLabel(granularity)} buckets, PT.`;

  const ariaLabel = `${granularityLabel(granularity)} ${FISH_PER_ANGLER_ARIA} for ${selectionLabel} — ${rangeLabel(filters, fromDate, toDate)}`;

  // -------------------------------------------------------------------------
  // Step 8: Build chartOption. Polish pass — when moon overlay is on, it now
  // renders as a SECOND grid embedded in this same chartOption (sitting right
  // below the catch plot, above the legend). Previously the moon was a
  // separate <Chart> instance below; merging into one chart fixes the visual
  // ordering (plot → moon → legend → slider) and gives us native dataZoom
  // sync via xAxisIndex: [0, 1].
  // -------------------------------------------------------------------------
  let moonData: Array<[string, number]> = [];
  if (filters.moon) {
    // Polish pass: daily moon resolution regardless of catch granularity
    // (Weekly/Monthly bucketing was distorting the 29.5-day cycle into a
    // jagged stairstep). lttb sampling keeps render perf reasonable.
    const dayMs = 86400000;
    const start = new Date(fromDate + 'T00:00:00Z').getTime();
    const end = new Date(toDate + 'T00:00:00Z').getTime();
    for (let t = start; t <= end; t += dayMs) {
      const d = new Date(t);
      const yy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const ymd = `${yy}-${mm}-${dd}`;
      moonData.push([d.toISOString(), moonIllumination(ymd)]);
    }
  }

  // Catch series names — used to whitelist what the legend shows (the moon
  // series, when present, lives outside the legend).
  const catchSeriesNames = chartSeries.map((s) => (s as { name: string }).name);

  // Build grid / xAxis / yAxis arrays. Two-grid layout when moon=on,
  // single-grid otherwise.
  // Polish pass: leave ~28px between the catch x-axis tick labels and the
  // moon row so they don't visually overlap on dense ranges.
  // Mobile-fix: bottom-stack reserves 216px so the wrapped legend (up to ~96px
  // on 375px viewports) clears the moon row at bottom=140.
  const grid = filters.moon
    ? [
        { left: 56, right: 24, top: 36, bottom: 216 }, // catch plot
        { left: 56, right: 24, bottom: 140, height: 24 } // moon row, above the wrap-prone legend
      ]
    : [{ left: 56, right: 24, top: 36, bottom: 132 }];

  const xAxis = filters.moon
    ? [
        { type: 'time' as const, gridIndex: 0 },
        {
          type: 'time' as const,
          gridIndex: 1,
          show: false,
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false }
        }
      ]
    : [{ type: 'time' as const }];

  const yAxis = filters.moon
    ? [
        { type: 'value' as const, name: FISH_PER_ANGLER_AXIS, gridIndex: 0 },
        {
          type: 'value' as const,
          gridIndex: 1,
          min: 0,
          max: 1,
          show: false,
          splitLine: { show: false }
        }
      ]
    : [{ type: 'value' as const, name: FISH_PER_ANGLER_AXIS }];

  const moonSeries = filters.moon
    ? [
        {
          name: '__moon__', // hidden from the legend via legend.data whitelist
          type: 'line' as const,
          smooth: true,
          showSymbol: false,
          sampling: 'lttb' as const,
          xAxisIndex: 1,
          yAxisIndex: 1,
          lineStyle: { color: '#94a3b8', width: 1.5 },
          areaStyle: { color: 'rgba(148, 163, 184, 0.35)' },
          data: moonData,
          silent: true,
          animation: false,
          tooltip: { show: false }
        }
      ]
    : [];

  const chartOption = {
    grid,
    toolbox: {
      right: 8,
      top: 4,
      itemSize: 14,
      feature: { restore: { title: 'Reset zoom' } }
    },
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'cross' as const }
      // formatter is NOT included here — functions don't survive SSR serialization (Pitfall 1)
      // The page attaches tooltipFormatter client-side via the optional Chart prop (T-06-24)
    },
    legend: {
      type: 'plain' as const,
      bottom: 36,
      width: '90%',
      selected: legendSelected,
      // Polish pass: explicitly whitelist catch-series names so the moon
      // series doesn't leak into the legend.
      data: catchSeriesNames
    },
    // Polish pass: zoom both grids together via xAxisIndex: [0, 1] when moon is on.
    dataZoom: [
      {
        type: 'slider' as const,
        xAxisIndex: filters.moon ? [0, 1] : 0,
        bottom: 4,
        height: 22
      },
      { type: 'inside' as const, xAxisIndex: filters.moon ? [0, 1] : 0 }
    ],
    xAxis,
    yAxis,
    series: [...chartSeries, ...moonSeries]
  };

  // moonChartOption kept for back-compat with the old return shape. Now
  // always null — the moon series is embedded in chartOption above.
  const moonChartOption: object | null = null;

  // -------------------------------------------------------------------------
  // Step 9: Logger (T-06-31: no user PII)
  // -------------------------------------------------------------------------
  locals.logger?.info({
    msg: 'explorer_loaded',
    ticker: filters.ticker,
    identifier: filters.ticker === 'boat' ? filters.slug : filters.name,
    range: filters.range,
    moon: filters.moon,
    granularity,
    bucketCount: expectedKeys.length
  });

  // Phase 8 Plan 04 (GRN-01 / D-37). showGranularitySelector hides at <3M.
  const showGranularitySelector =
    filters.range !== '1m';

  return {
    filters,
    autoWidenNote,
    clampNote,
    chartOption,
    moonChartOption,
    nByBucketBySeries,
    caption: captionText,
    ariaLabel,
    breakdownRows,
    supportingList,
    selectorOptions,
    lastScrapedLabel,
    empty: null,
    noHistoryEver,
    pageTitle,
    granularity: granularity as Granularity,
    showGranularitySelector,
    bucketStartIsos,
    // Polish pass: pass all landings to the page so the Boat tab can render
    // a Landing pre-filter dropdown above the boat picker.
    allLandings: distinctLandings(db).map((l) => l.display_name)
  };
};
