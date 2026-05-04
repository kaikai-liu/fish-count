<script lang="ts">
  import { onMount } from 'svelte';
  import type { EChartsOption } from 'echarts';

  let {
    option,
    height = '320px',
    ariaLabel,
    loading = false,
    tooltipFormatter
  }: {
    option: EChartsOption;
    height?: string;
    ariaLabel: string;
    loading?: boolean;
    // Optional client-side tooltip formatter. Functions can't survive SSR JSON serialization,
    // so the loader returns plain chartOption without a formatter; the page passes this prop
    // to attach the formatter client-side (T-06-24: HTML-escaped by caller).
    tooltipFormatter?: (params: unknown[]) => string;
  } = $props();

  let chartEl: HTMLDivElement;
  let chart: any = null;
  let mounted = $state(false);

  // Phase 8 Plan 04 (THM-03 / D-30, RESEARCH §Pattern 3 + Pitfall 6).
  // Read the active palette from CSS custom properties on <html>. The hook
  // emits <html data-theme="..."> on first paint so getComputedStyle yields
  // the right palette without a flash. A MutationObserver re-applies on
  // theme toggle so the chart flips without a page reload. Wrap the
  // applyPalette call in requestAnimationFrame so the new CSS variables are
  // computed before readback (Pitfall 6).
  function readPalette() {
    if (typeof document === 'undefined') return null;
    const cs = getComputedStyle(document.documentElement);
    return {
      background: cs.getPropertyValue('--color-surface').trim() || '#ffffff',
      text: cs.getPropertyValue('--color-text').trim() || '#0f172a',
      axis: cs.getPropertyValue('--color-text-muted').trim() || '#475569',
      grid: cs.getPropertyValue('--color-border').trim() || '#e2e8f0'
    };
  }

  function applyPalette() {
    const p = readPalette();
    if (!chart || !p) return;
    chart.setOption({
      backgroundColor: p.background,
      textStyle: { color: p.text },
      xAxis: { axisLabel: { color: p.axis }, axisLine: { lineStyle: { color: p.grid } } },
      yAxis: {
        axisLabel: { color: p.axis },
        splitLine: { lineStyle: { color: p.grid } },
        nameTextStyle: { color: p.text }
      },
      legend: { textStyle: { color: p.text } },
      tooltip: { backgroundColor: p.background, textStyle: { color: p.text } }
    });
  }

  onMount(() => {
    let ro: ResizeObserver | null = null;
    let observer: MutationObserver | null = null;
    let cancelled = false;

    (async () => {
      // Dynamic import — keeps echarts out of SSR bundle (~800kB)
      const coreMod = await import('echarts/core');
      const chartsMod = await import('echarts/charts');
      const componentsMod = await import('echarts/components');
      const renderersMod = await import('echarts/renderers');
      if (cancelled) return;
      const { use, init } = coreMod;
      const { LineChart } = chartsMod;
      const {
        TooltipComponent, GridComponent, LegendComponent,
        DataZoomComponent, DataZoomInsideComponent, DataZoomSliderComponent,
        ToolboxComponent
      } = componentsMod;
      const { CanvasRenderer } = renderersMod;
      // Phase 8 Plan 03 (D-19, RTR-04): HeatmapChart, VisualMapComponent, and
      // CalendarComponent registrations dropped along with the v1 calendar
      // heatmap. Re-add if future surfaces need them.
      // Polish pass: dataZoom (slider + inside scroll/pinch) + toolbox restore
      // button — gives Plotly-style range zoom on the time-axis chart.
      use([
        LineChart,
        TooltipComponent, GridComponent, LegendComponent,
        DataZoomComponent, DataZoomInsideComponent, DataZoomSliderComponent,
        ToolboxComponent,
        CanvasRenderer
      ]);
      chart = init(chartEl);
      // Honor reduced-motion preference (UI-SPEC §Accessibility)
      const reducedMotion = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Merge optional client-side tooltipFormatter (functions don't survive SSR serialization)
      const finalOption = tooltipFormatter
        ? { ...option, tooltip: { ...(option.tooltip ?? {}), formatter: tooltipFormatter } }
        : option;
      chart.setOption({ ...finalOption, animation: !reducedMotion });
      // Apply theme palette AFTER initial setOption so it merges over the
      // option's defaults rather than getting clobbered by them.
      applyPalette();
      ro = new ResizeObserver(() => chart?.resize());
      ro.observe(chartEl);
      // Phase 8 Plan 04 (THM-03 / Pitfall 6): re-apply palette when the
      // <html> data-theme attribute changes. requestAnimationFrame defers
      // readback until after the browser computes the new CSS values.
      observer = new MutationObserver(() => requestAnimationFrame(applyPalette));
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
      });
      mounted = true;
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      observer?.disconnect();
      chart?.dispose();
      chart = null;
    };
  });

  // Re-apply option on prop change (D-19 filter changes).
  // Read reactive props unconditionally so Svelte 5 tracks them as dependencies
  // even on the first run when `chart` is still null (ECharts is initialized in
  // an async onMount IIFE). Without this, the && short-circuit skipped the
  // option read and the effect never re-fired on subsequent prop changes.
  $effect(() => {
    const opt = option;
    const tf = tooltipFormatter;
    if (!chart || !opt) return;
    const reducedMotion = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finalOption = tf
      ? { ...opt, tooltip: { ...(opt.tooltip ?? {}), formatter: tf } }
      : opt;
    chart.setOption({ ...finalOption, animation: !reducedMotion }, true /* notMerge */);
    // Re-apply theme palette after notMerge clobbers the previous option.
    applyPalette();
  });
</script>

<div
  bind:this={chartEl}
  role="img"
  aria-label={ariaLabel}
  style="width:100%;height:{height}"
  class="bg-(--color-surface-muted)"
>
  {#if !mounted || loading}
    <div class="flex h-full w-full items-center justify-center text-sm text-(--color-text-muted)">
      Loading chart…
    </div>
  {/if}
</div>
