<!-- src/lib/components/NewLabelBadge.svelte — Phase 8 D-05 "NEW" badge.
     Surfaces against trip-type labels whose alias status is 'pending' — the
     operator hasn't decided what canonical bucket they belong to yet.
     Reuses ProvisionalBadge's color tokens (--color-provisional / -bg). -->
<span
  class="inline-flex items-center rounded bg-(--color-provisional-bg) px-2 py-0.5 text-xs font-semibold text-(--color-provisional)"
  title="This trip-type label is awaiting review"
  aria-label="New trip-type label, awaiting review">
  NEW
</span>
