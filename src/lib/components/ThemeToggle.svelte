<script lang="ts">
  // Phase 8 Plan 04 (THM-01 / D-26..D-30). Three-mode cycle button.
  //
  // Click cycles Auto → Light → Dark → Auto. Persists via the fc_theme cookie
  // (1-year max-age, Path=/, SameSite=Lax). The cookie is the SSR contract —
  // src/hooks.server.ts reads it on the next page load and stamps
  // <html data-theme="..."> before any CSS loads, so first paint is
  // flash-free. Cookie write happens client-side so we don't need a
  // server round-trip on toggle; we also flip document.documentElement
  // .dataset.theme immediately so the page recolors without a reload.
  //
  // Aria-label spells out the CURRENT state and what clicking will do
  // (D-27 — fixes the original "toggle that hides its current state"
  // bug surface in the spec).
  import { THEME_COOKIE, type Theme } from '$lib/shared/theme';
  import { themeToggleAria, THEME_TOGGLE_TOOLTIP } from '$lib/copy/theme';

  let { theme: initialTheme }: { theme: Theme } = $props();

  // Local state mirrors the prop for the initial render (SSR-safe — runs at
  // component instantiation, not in an effect). On toggle we update the
  // cookie + DOM client-side and bump local state so the icon and aria-label
  // update without a navigation. The next SSR roundtrip (any nav) will pick
  // up the new cookie value via the layout server load.
  // svelte-ignore state_referenced_locally
  let theme = $state<Theme>(initialTheme);

  const NEXT: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' };

  function cycle() {
    const n = NEXT[theme];
    // 31_536_000 seconds = 365 days. SameSite=Lax + Path=/ are the appropriate
    // defaults for a non-security-sensitive cosmetic cookie (T-08-04-02).
    document.cookie = `${THEME_COOKIE}=${n}; Path=/; SameSite=Lax; Max-Age=31536000`;
    document.documentElement.dataset.theme = n;
    theme = n;
  }
</script>

<button
  type="button"
  aria-label={themeToggleAria(theme)}
  title={THEME_TOGGLE_TOOLTIP}
  onclick={cycle}
  class="min-h-11 min-w-11 inline-flex items-center justify-center rounded border border-(--color-border) bg-(--color-surface) px-3 py-2 text-base text-(--color-text) hover:bg-(--color-accent-bg) hover:text-(--color-accent) hover:border-(--color-accent) transition-colors"
>
  {#if theme === 'light'}
    <span aria-hidden="true">☀</span>
  {:else if theme === 'dark'}
    <span aria-hidden="true">☾</span>
  {:else}
    <span aria-hidden="true">◐</span>
  {/if}
</button>
