<!-- src/routes/admin/trip-types/+page.svelte — Phase 8 ALI-03/ALI-04 admin page.
     Lists every distinct catch_reports.trip_type with first-seen, last-seen,
     trip-count, and current alias status. Per-row actions (alias / accept /
     reset) call the corresponding form action; logout button clears the cookie.
     Mobile 375px: rows stack into vertical cards below sm breakpoint so the
     operator can adjudicate from a phone (D-04). -->
<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import {
    ADMIN_PAGE_TITLE,
    ADMIN_HEADING,
    ADMIN_SUBTITLE,
    STATUS_LABELS,
    ACTION_ALIAS,
    ACTION_ACCEPT,
    ACTION_RESET,
    ACTION_LOGOUT,
    COL_SOURCE,
    COL_CANONICAL,
    COL_STATUS,
    COL_FIRST_SEEN,
    COL_LAST_SEEN,
    COL_TRIP_COUNT,
    COL_ACTIONS
  } from '$lib/copy/admin';
  import NewLabelBadge from '$lib/components/NewLabelBadge.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Local state — pre-fill the canonical_label input with the current value
  // for each row so the typeahead opens with a sensible default.
  function defaultCanonical(row: PageData['labels'][number]): string {
    return row.canonical_label ?? row.source_label;
  }

  function statusLabel(s: 'aliased' | 'accepted' | 'pending' | null): string {
    return s ? STATUS_LABELS[s] : 'Pending review';
  }
</script>

<svelte:head>
  <title>{ADMIN_PAGE_TITLE}</title>
</svelte:head>

<header class="border-b border-(--color-border) pb-4 mb-6 flex flex-wrap items-start justify-between gap-3">
  <div class="flex-1 min-w-0">
    <h1 class="text-3xl font-semibold leading-tight">{ADMIN_HEADING}</h1>
    <p class="mt-1 text-base text-(--color-text-muted)">{ADMIN_SUBTITLE}</p>
  </div>
  <form method="POST" action="?/logout">
    <button
      type="submit"
      class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-3 py-2 text-sm hover:bg-(--color-surface-muted)">
      {ACTION_LOGOUT}
    </button>
  </form>
</header>

{#if form && 'success' in form && form.success && 'message' in form && form.message}
  <p
    role="status"
    class="mb-4 rounded border border-(--color-border) bg-(--color-surface-muted) px-3 py-2 text-sm">
    {form.message}
  </p>
{:else if form && 'error' in form && form.error}
  <p
    role="alert"
    class="mb-4 rounded border border-(--color-provisional) bg-(--color-provisional-bg) px-3 py-2 text-sm text-(--color-provisional)">
    {form.error}
  </p>
{/if}

<!-- Hidden datalist for the alias-target typeahead — populated once with
     every distinct canonical label. Browsers render <datalist> as a typeahead
     attached to the matching <input list="…"> below. RESEARCH §"Don't
     Hand-Roll" says use the platform's typeahead, not a JS reimplementation. -->
<datalist id="canonical-options">
  {#each data.canonicalChoices as choice (choice)}
    <option value={choice}></option>
  {/each}
</datalist>

<div class="space-y-3">
  <!-- Header row — visible on sm+; hidden on mobile (each card is self-labeled) -->
  <div class="hidden sm:grid sm:grid-cols-[2fr_2fr_1fr_1fr_1fr_0.5fr_3fr] gap-3 border-b border-(--color-border) pb-2 text-xs font-semibold uppercase tracking-wide text-(--color-text-muted)">
    <div>{COL_SOURCE}</div>
    <div>{COL_CANONICAL}</div>
    <div>{COL_STATUS}</div>
    <div>{COL_FIRST_SEEN}</div>
    <div>{COL_LAST_SEEN}</div>
    <div class="text-right">{COL_TRIP_COUNT}</div>
    <div>{COL_ACTIONS}</div>
  </div>

  {#each data.labels as row (row.source_label)}
    <article
      class="grid grid-cols-1 sm:grid-cols-[2fr_2fr_1fr_1fr_1fr_0.5fr_3fr] gap-3 items-baseline rounded border border-(--color-border) bg-(--color-surface) p-3 sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent sm:p-0 sm:pb-3">
      <div class="font-semibold flex flex-wrap items-center gap-2">
        <span class="sm:hidden text-xs uppercase tracking-wide text-(--color-text-muted) mr-1">{COL_SOURCE}:</span>
        {row.source_label}
        {#if row.status === 'pending' || row.status === null}
          <NewLabelBadge />
        {/if}
      </div>
      <div>
        <span class="sm:hidden text-xs uppercase tracking-wide text-(--color-text-muted) mr-1">{COL_CANONICAL}:</span>
        {row.canonical_label ?? '—'}
      </div>
      <div>
        <span class="sm:hidden text-xs uppercase tracking-wide text-(--color-text-muted) mr-1">{COL_STATUS}:</span>
        {statusLabel(row.status)}
      </div>
      <div class="tabular-nums text-(--color-text-muted) text-sm">
        <span class="sm:hidden text-xs uppercase tracking-wide mr-1">{COL_FIRST_SEEN}:</span>
        {row.first_seen}
      </div>
      <div class="tabular-nums text-(--color-text-muted) text-sm">
        <span class="sm:hidden text-xs uppercase tracking-wide mr-1">{COL_LAST_SEEN}:</span>
        {row.last_seen}
      </div>
      <div class="tabular-nums text-right">
        <span class="sm:hidden text-xs uppercase tracking-wide text-(--color-text-muted) mr-1">{COL_TRIP_COUNT}:</span>
        {row.trip_count}
      </div>
      <div class="flex flex-wrap gap-2">
        <!-- Alias action — typeahead canonical input -->
        <form method="POST" action="?/alias" class="flex flex-wrap items-end gap-2 flex-1 min-w-0">
          <input type="hidden" name="source_label" value={row.source_label} />
          <label class="flex flex-col gap-1 flex-1 min-w-32">
            <span class="text-xs text-(--color-text-muted)">{ACTION_ALIAS}</span>
            <input
              type="text"
              name="canonical_label"
              list="canonical-options"
              value={defaultCanonical(row)}
              class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-2 py-1 text-sm"
              required
            />
          </label>
          <button
            type="submit"
            class="min-h-11 rounded bg-(--color-accent) px-3 py-2 text-sm font-semibold text-white hover:bg-(--color-accent-hover)">
            Save
          </button>
        </form>

        <!-- Accept action -->
        <form method="POST" action="?/accept">
          <input type="hidden" name="source_label" value={row.source_label} />
          <button
            type="submit"
            class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-3 py-2 text-sm hover:bg-(--color-surface-muted)">
            {ACTION_ACCEPT}
          </button>
        </form>

        <!-- Reset action -->
        <form method="POST" action="?/reset">
          <input type="hidden" name="source_label" value={row.source_label} />
          <button
            type="submit"
            class="min-h-11 rounded border border-(--color-border) bg-(--color-surface) px-3 py-2 text-sm hover:bg-(--color-surface-muted)">
            {ACTION_RESET}
          </button>
        </form>
      </div>
    </article>
  {/each}
</div>
