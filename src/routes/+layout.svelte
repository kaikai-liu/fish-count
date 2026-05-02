<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import type { LayoutData } from './$types';

  let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

  // Phase 8 Plan 03 (D-22, RTR-08): /picker and /trends retired; nav drops them.
  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/explorer', label: 'Explorer' },
    { href: '/compare', label: 'Compare' },
    { href: '/about', label: 'About' }
  ];
</script>

<a href="#main" class="skip-to-main">Skip to main content</a>

<nav class="border-b border-(--color-border) bg-(--color-surface) md:sticky md:top-0 md:z-10">
  <div class="mx-auto max-w-6xl px-4 py-3 md:px-8">
    <div class="flex items-center justify-between gap-4">
      <ul class="flex flex-wrap gap-x-6 gap-y-2 text-base">
        {#each navItems as item}
          <li>
            <a
              href={item.href}
              class={page.url.pathname === item.href || (item.href !== '/' && page.url.pathname.startsWith(item.href))
                ? 'text-(--color-accent) font-semibold'
                : 'text-(--color-text-muted) hover:underline'}
            >
              {item.label}
            </a>
          </li>
        {/each}
      </ul>
      <!-- Phase 8 Plan 04 (THM-01) -->
      <ThemeToggle theme={data.theme} />
    </div>
  </div>
</nav>

<main id="main" class="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-12">
  {@render children()}
</main>

<footer class="mx-auto max-w-6xl px-4 py-8 text-sm text-(--color-text-subtle) md:px-8">
  <p>FishCount — public San Diego charter-boat dock-totals aggregator. Source: <a href="https://www.sandiegofishreports.com" target="_blank" rel="noopener noreferrer external" class="text-(--color-accent) underline">sandiegofishreports.com</a>.</p>
</footer>
