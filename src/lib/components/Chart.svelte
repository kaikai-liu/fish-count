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

  onMount(() => {
    let ro: ResizeObserver | null = null;
    let cancelled = false;

    (async () => {
      // Dynamic import — keeps echarts out of SSR bundle (~800kB)
      const coreMod = await import('echarts/core');
      const chartsMod = await import('echarts/charts');
      const componentsMod = await import('echarts/components');
      const renderersMod = await import('echarts/renderers');
      if (cancelled) return;
      const { use, init } = coreMod;
      const { LineChart, HeatmapChart } = chartsMod;
      const { TooltipComponent, GridComponent, VisualMapComponent, CalendarComponent, LegendComponent } = componentsMod;
      const { CanvasRenderer } = renderersMod;
      use([
        LineChart, HeatmapChart,
        TooltipComponent, GridComponent, VisualMapComponent, CalendarComponent, LegendComponent,
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
      ro = new ResizeObserver(() => chart?.resize());
      ro.observe(chartEl);
      mounted = true;
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      chart?.dispose();
      chart = null;
    };
  });

  // Re-apply option on prop change (D-19 filter changes)
  $effect(() => {
    if (chart && option) {
      const reducedMotion = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const finalOption = tooltipFormatter
        ? { ...option, tooltip: { ...(option.tooltip ?? {}), formatter: tooltipFormatter } }
        : option;
      chart.setOption({ ...finalOption, animation: !reducedMotion }, true /* notMerge */);
    }
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
