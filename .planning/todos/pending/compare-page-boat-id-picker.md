---
title: /compare page needs typeahead boat picker (replace boat-ID input)
date: 2026-05-01
priority: medium
context: /gsd-explore session after Phase 7 ship — operator confirmed /compare is v2 scope (NOT v1 retirement) and the boat-ID input UX is broken
related_phases: [7.5]
---

# /compare page needs typeahead boat picker

`/compare` currently asks the user to enter boat IDs by hand. The operator
has never seen boat IDs anywhere else in the UI and finds the input unusable
("I don't know the boat ids at all").

## Fix shape

Replace the boat-ID input(s) with a typeahead/picker that uses boat **names**
as the visible label and slugs/IDs only as the internal value. Same pattern
the explorer's boat dropdown already uses:

```svelte
<select onchange={onSelectorChange}>
  {#each data.selectorOptions as opt (opt.value)}
    <option value={opt.value}>{opt.label}</option>
  {/each}
</select>
```

Where `selectorOptions = [{ value: 'new-seaforth', label: 'New Seaforth' }, …]`
is built loader-side from the boats table.

Better still: a typeahead/combobox for `/compare` so the user can type "new
seaf" and get matches, since `/compare` likely picks 2+ boats and a `<select>`
gets unwieldy.

## Notes

- `/compare` is **v2 scope** — operator confirmed (2026-05-01). Does NOT
  retire in Phase 10.
- This todo will likely be **absorbed into Phase 7.5** (Home & Discovery)
  since "discover by name, not ID" shares the discovery theme. Could also
  ride as a tiny standalone phase if 7.5 stays focused on the home page.
- Don't fix this in isolation right now — wait for Phase 7.5 plan-phase to
  decide where it lands.
