<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import ExplorerHeader from '$lib/components/ExplorerHeader.svelte';
  import Chart from '$lib/components/Chart.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
  import SpeciesBreakdownTable from '$lib/components/SpeciesBreakdownTable.svelte';
  import { navigating } from '$app/state';
  import {
    serializeExplorerFilters,
    defaultGranularityForRange,
    type ExplorerFilters,
    type Granularity
  } from '$lib/shared/urlState';
  import { FISH_PER_ANGLER_TOOLTIP_UNIT } from '$lib/copy/metrics';
  import { MOON_ROW_ARIA } from '$lib/copy/moon';
  import type { EChartsOption } from 'echarts';

  let { data }: { data: PageData } = $props();

  // Form values derived from loader-resolved filters — re-evaluate on every SPA
  // navigation so the dropdown, range strip, and ticker pills reflect the
  // server's cross-axis defaults (D-04, D-08).
  const filters = $derived(data.filters as ExplorerFilters);
  const formTicker = $derived(filters.ticker);
  const formRange = $derived(filters.range);
  const formSelection = $derived(
    filters.ticker === 'boat' ? filters.slug : (filters as { name: string }).name
  );
  const formMoon = $derived(filters.moon ?? false);

  // Polish pass: removed Custom range — chart dataZoom replaces it.
  function navigate(next: ExplorerFilters) {
    const sp = serializeExplorerFilters(next);
    // T-06-28: URL built only from typed ExplorerFilters — no open redirect
    goto(`/explorer?${sp.toString()}`, { keepFocus: true, replaceState: true, noScroll: true });
  }

  function onTickerChange(next: ExplorerFilters['ticker']) {
    // D-08: ticker switch — range stays, selection resolves cross-axis default loader-side.
    // Phase 7 (MOON-01): preserve moon flag across ticker switch.
    // Phase 8 Plan 04 (GRN-01): also preserve a non-default granularity.
    const moonParam = filters.moon ? '&moon=1' : '';
    const gran = preservedGranularity();
    const granParam = gran ? `&granularity=${gran}` : '';
    goto(`/explorer?ticker=${next}&range=${formRange}${moonParam}${granParam}`, { keepFocus: true, replaceState: true, noScroll: true });
  }

  function onRangeChange(next: ExplorerFilters['range']) {
    // Phase 8 Plan 04 (GRN-02 / D-38). Range switch resets granularity to the
    // new range's default. Default-stripping happens in serialize: we leave
    // filters.granularity undefined so the URL drops the param. The user can
    // re-override via GranularitySelector after the navigation.
    const f: ExplorerFilters =
      formTicker === 'boat'
        ? {
            ticker: 'boat',
            slug: formSelection ?? '',
            range: next,
            moon: filters.moon,
            granularity: undefined
          }
        : {
            ticker: formTicker as 'species' | 'landing',
            name: formSelection ?? '',
            range: next,
            moon: filters.moon,
            granularity: undefined
          };
    navigate(f);
  }

  function onGranularityChange(next: Granularity) {
    // D-38 default-stripping: if user picks the default for the current range,
    // omit the URL param so the URL stays clean.
    const isDefault = next === defaultGranularityForRange(formRange);
    const f: ExplorerFilters =
      formTicker === 'boat'
        ? {
            ticker: 'boat',
            slug: formSelection ?? '',
            range: formRange,
            moon: filters.moon,
            granularity: isDefault ? undefined : next
          }
        : {
            ticker: formTicker as 'species' | 'landing',
            name: formSelection ?? '',
            range: formRange,
            moon: filters.moon,
            granularity: isDefault ? undefined : next
          };
    navigate(f);
  }

  // Phase 8 Plan 04 (D-39): preserve URL granularity through unrelated
  // navigations. Only export a non-undefined granularity if filters.granularity
  // is set AND differs from the current default — same default-stripping
  // policy as onGranularityChange.
  function preservedGranularity(): Granularity | undefined {
    if (!filters.granularity) return undefined;
    if (filters.granularity === defaultGranularityForRange(formRange)) return undefined;
    return filters.granularity;
  }

  function onMoonChange(next: boolean) {
    const granularity = preservedGranularity();
    const f: ExplorerFilters =
      formTicker === 'boat'
        ? { ticker: 'boat', slug: formSelection ?? '', range: formRange, moon: next, granularity }
        : { ticker: formTicker as 'species' | 'landing', name: formSelection ?? '', range: formRange, moon: next, granularity };
    navigate(f);
  }

  function onSelectorChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    const granularity = preservedGranularity();
    const f: ExplorerFilters =
      formTicker === 'boat'
        ? { ticker: 'boat', slug: val, range: formRange, moon: filters.moon, granularity }
        : { ticker: formTicker as 'species' | 'landing', name: val, range: formRange, moon: filters.moon, granularity };
    navigate(f);
  }

  // Tooltip formatter (client-side; functions can't survive SSR serialization)
  // T-06-24: HTML-escapes every dynamic value before string concatenation (XSS mitigation)
  function escapeHtml(s: string): string {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Phase 8 Plan 04 (AXS-01 / D-35). With xAxis.type='time', ECharts surfaces
  // axisValue as a Date or ms-epoch. We normalize to YYYY-MM-DD in PT for
  // both the header label and the lookup into the per-series trip-count map
  // (which is keyed by ISO date — see loader nByBucketBySeries).
  function toPtIsoDate(axisValue: unknown): string {
    const d =
      axisValue instanceof Date
        ? axisValue
        : typeof axisValue === 'number'
          ? new Date(axisValue)
          : new Date(String(axisValue));
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  }

  function toPtHumanDate(axisValue: unknown): string {
    const d =
      axisValue instanceof Date
        ? axisValue
        : typeof axisValue === 'number'
          ? new Date(axisValue)
          : new Date(String(axisValue));
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(d);
  }

  function tooltipFormatter(params: unknown[]): string {
    const ps = params as Array<{
      axisValue: unknown;
      seriesName: string;
      // value is [iso, number | null] under time-axis mode
      value: unknown;
      marker: string;
    }>;
    if (!ps.length) return '';
    const headerIso = toPtIsoDate(ps[0]?.axisValue);
    const header = `<strong>${escapeHtml(toPtHumanDate(ps[0]?.axisValue))}</strong>`;
    const rows = ps.map((p) => {
      const nMap = data.nByBucketBySeries as Record<string, Record<string, number>>;
      const seriesNByBucket = (nMap ?? {})[p.seriesName] ?? {};
      const n = seriesNByBucket[headerIso] ?? 0;
      // Under time-axis, value can be [iso, n] or [Date, n]. We only need
      // the number — index 1.
      const numericValue: number | null = Array.isArray(p.value)
        ? ((p.value[1] as number | null) ?? null)
        : (p.value as number | null);
      const v =
        numericValue == null
          ? '—'
          : numericValue < 10
            ? numericValue.toFixed(1)
            : Math.round(numericValue).toString();
      const unit = v === '—' ? '' : ` ${FISH_PER_ANGLER_TOOLTIP_UNIT}`;
      const tripWord = n === 1 ? 'trip' : 'trips';
      return `${p.marker} ${escapeHtml(p.seriesName)}: ${v}${unit} (${n.toLocaleString()} ${tripWord})`;
    }).join('<br/>');
    return `${header}<br/>${rows}`;
  }

  // Responsive chart height (D-23: 280px mobile <768px, 360px ≥768px)
  let chartHeight = $state('280px');
  $effect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    chartHeight = mq.matches ? '360px' : '280px';
    const handler = (e: MediaQueryListEvent) => {
      chartHeight = e.matches ? '360px' : '280px';
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });
</script>

<svelte:head>
  <title>{data.pageTitle ?? 'Explorer'} — FishCount</title>
</svelte:head>

<PageHeader title="Explorer" lastScrapedLabel={data.lastScrapedLabel} />

<ExplorerHeader
  ticker={formTicker}
  range={formRange}
  moon={formMoon}
  {onTickerChange}
  {onRangeChange}
  {onMoonChange}
  granularity={data.granularity ?? defaultGranularityForRange(formRange)}
  {onGranularityChange}
  autoWidenNote={data.autoWidenNote}
>
  {#snippet selector()}
    <label class="flex flex-col gap-1">
      <span class="text-sm font-semibold text-(--color-text-muted)">
        {formTicker === 'boat' ? 'Boat' : formTicker === 'species' ? 'Species' : 'Landing'}
      </span>
      <select
        class="min-h-11 w-full rounded border border-(--color-border) bg-(--color-surface) px-2 text-base focus:border-(--color-border-strong)"
        value={formSelection}
        onchange={onSelectorChange}
      >
        {#each data.selectorOptions as opt (opt.value)}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </label>
  {/snippet}
</ExplorerHeader>

<div class="px-4 md:px-8 py-6 md:py-12 max-w-6xl mx-auto">
  {#if navigating.to}
    <!-- Phase 8 Plan 04 (POL-02 / D-32). Skeleton during navigation; shape
         matches the chart so it doesn't reflow when data lands. Typeahead
         waits use a small spinner, not this skeleton (D-32). -->
    <section class="mt-4">
      <LoadingSkeleton variant="chart" height={chartHeight} ariaLabel="Loading chart…" />
    </section>
  {:else if data.empty}
    <EmptyState heading={data.empty.heading} body={data.empty.body} />
  {:else if data.chartOption}
    <section class="mt-4">
      <Chart
        option={data.chartOption}
        height={chartHeight}
        ariaLabel={data.ariaLabel}
        {tooltipFormatter}
      />
      {#if data.moonChartOption}
        <Chart
          option={data.moonChartOption as EChartsOption}
          height="36px"
          ariaLabel={MOON_ROW_ARIA}
        />
      {/if}
      <p class="mt-2 text-sm text-(--color-text-muted)">{data.caption}</p>
    </section>
    {#if data.breakdownRows && data.breakdownRows.length > 0}
      <SpeciesBreakdownTable rows={data.breakdownRows} />
    {/if}
  {/if}
</div>
