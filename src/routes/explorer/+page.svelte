<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import ExplorerHeader from '$lib/components/ExplorerHeader.svelte';
  import Chart from '$lib/components/Chart.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import SpeciesBreakdownTable from '$lib/components/SpeciesBreakdownTable.svelte';
  import { serializeExplorerFilters, type ExplorerFilters } from '$lib/shared/urlState';
  import { FISH_PER_ANGLER_TOOLTIP_UNIT } from '$lib/copy/metrics';

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

  // Custom date inputs need writable state for the bind on CustomDateInputs.
  // The $effect below seeds and re-syncs them from the loader on every navigation.
  let formFromDate = $state('');
  let formToDate = $state('');
  $effect(() => {
    if (filters.range === 'custom') {
      formFromDate = filters.fromDate ?? '';
      formToDate = filters.toDate ?? '';
    } else {
      formFromDate = '';
      formToDate = '';
    }
  });

  function navigate(next: ExplorerFilters) {
    const sp = serializeExplorerFilters(next);
    // T-06-28: URL built only from typed ExplorerFilters — no open redirect
    goto(`/explorer?${sp.toString()}`, { keepFocus: true, replaceState: true, noScroll: true });
  }

  function onTickerChange(next: ExplorerFilters['ticker']) {
    // D-08: ticker switch — range stays, selection resolves cross-axis default loader-side
    goto(`/explorer?ticker=${next}&range=${formRange}`, { keepFocus: true, replaceState: true, noScroll: true });
  }

  function onRangeChange(next: ExplorerFilters['range']) {
    if (next === 'custom') return; // wait for CustomDateInputs onSubmit
    const f: ExplorerFilters =
      formTicker === 'boat'
        ? { ticker: 'boat', slug: formSelection ?? '', range: next }
        : { ticker: formTicker as 'species' | 'landing', name: formSelection ?? '', range: next };
    navigate(f);
  }

  function onCustomDates(dates: { fromDate: string; toDate: string }) {
    const f: ExplorerFilters =
      formTicker === 'boat'
        ? { ticker: 'boat', slug: formSelection ?? '', range: 'custom', fromDate: dates.fromDate, toDate: dates.toDate }
        : { ticker: formTicker as 'species' | 'landing', name: formSelection ?? '', range: 'custom', fromDate: dates.fromDate, toDate: dates.toDate };
    navigate(f);
  }

  function onSelectorChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    const f: ExplorerFilters =
      formTicker === 'boat'
        ? { ticker: 'boat', slug: val, range: formRange, ...(formRange === 'custom' && formFromDate && formToDate ? { fromDate: formFromDate, toDate: formToDate } : {}) }
        : { ticker: formTicker as 'species' | 'landing', name: val, range: formRange, ...(formRange === 'custom' && formFromDate && formToDate ? { fromDate: formFromDate, toDate: formToDate } : {}) };
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

  function tooltipFormatter(params: unknown[]): string {
    const ps = params as Array<{
      axisValue: string;
      seriesName: string;
      value: number | null;
      marker: string;
    }>;
    if (!ps.length) return '';
    const header = `<strong>${escapeHtml(ps[0]?.axisValue ?? '')}</strong>`;
    const rows = ps.map((p) => {
      const nMap = data.nByBucketBySeries as Record<string, Record<string, number>>;
      const seriesNByBucket = (nMap ?? {})[p.seriesName] ?? {};
      const n = seriesNByBucket[p.axisValue] ?? 0;
      const v = p.value == null ? '—' : p.value < 10 ? p.value.toFixed(1) : Math.round(p.value).toString();
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
  <title>Explorer · FishCount</title>
</svelte:head>

<PageHeader title="Explorer" lastScrapedLabel={data.lastScrapedLabel} />

<ExplorerHeader
  ticker={formTicker}
  range={formRange}
  bind:fromDate={formFromDate}
  bind:toDate={formToDate}
  {onTickerChange}
  {onRangeChange}
  {onCustomDates}
  autoWidenNote={data.autoWidenNote}
  clampNote={data.clampNote}
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
  {#if data.empty}
    <EmptyState heading={data.empty.heading} body={data.empty.body} />
  {:else if data.chartOption}
    <section class="mt-4">
      <Chart
        option={data.chartOption}
        height={chartHeight}
        ariaLabel={data.ariaLabel}
        {tooltipFormatter}
      />
      <p class="mt-2 text-sm text-(--color-text-muted)">{data.caption}</p>
    </section>
    {#if data.breakdownRows && data.breakdownRows.length > 0}
      <SpeciesBreakdownTable rows={data.breakdownRows} />
    {/if}
  {/if}
</div>
