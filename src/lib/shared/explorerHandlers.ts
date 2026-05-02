// src/lib/shared/explorerHandlers.ts — Phase 8 Plan 04 (GRN-02 / D-38).
//
// Pure URL-handler helpers for the /explorer page. Extracted from
// +page.svelte so the contract can be unit-tested without wiring up a full
// SvelteKit page render. Each helper takes the current filters + the user
// action and returns the desired next ExplorerFilters; the caller passes
// that to serializeExplorerFilters → goto().
//
// Pitfall 3 (08-RESEARCH): default-stripping is the discriminator that
// keeps URLs clean. If the user-chosen granularity equals the
// defaultGranularityForRange(currentRange), strip the param. Same rule
// after a range switch (D-38).
import { defaultGranularityForRange, type ExplorerFilters, type Granularity } from './urlState';

/**
 * D-38 range-switch reset. When the user picks a new range from the strip,
 * the granularity resets to that range's default (URL drops the param).
 * If they really want a non-default granularity for the new range, they
 * click the GranularitySelector after the navigation.
 */
export function nextFiltersOnRangeChange(
  current: ExplorerFilters,
  nextRange: ExplorerFilters['range']
): ExplorerFilters {
  if (current.ticker === 'boat') {
    return {
      ticker: 'boat',
      slug: current.slug,
      range: nextRange,
      moon: current.moon,
      granularity: undefined
    };
  }
  return {
    ticker: current.ticker,
    name: (current as { name: string }).name,
    range: nextRange,
    moon: current.moon,
    granularity: undefined
  };
}

/**
 * D-39 default-stripping for an explicit granularity pick. If the picked
 * granularity is the default for the CURRENT range, omit the param.
 */
export function nextFiltersOnGranularityChange(
  current: ExplorerFilters,
  pickedGranularity: Granularity
): ExplorerFilters {
  const isDefault = pickedGranularity === defaultGranularityForRange(current.range);
  const granularity = isDefault ? undefined : pickedGranularity;
  if (current.ticker === 'boat') {
    return {
      ticker: 'boat',
      slug: current.slug,
      range: current.range,
      moon: current.moon,
      fromDate: current.fromDate,
      toDate: current.toDate,
      granularity
    };
  }
  return {
    ticker: current.ticker,
    name: (current as { name: string }).name,
    range: current.range,
    moon: current.moon,
    fromDate: current.fromDate,
    toDate: current.toDate,
    granularity
  };
}
