<!--
  src/lib/components/SignupForm.svelte
  Phase 4 ALT-01/03: signup form component.

  UI-SPEC §"Component Contracts" #1:
    - Honeypot field is the FIRST input in the DOM (so dumb bots fill it before email)
    - Native <form method="POST"> for no-JS fallback (UI-SPEC rendering rule 7)
    - All inputs min-h-11 for 44px touch targets
    - Anti-enumeration: server renders identical generic-success page on
      honeypot/suppression/already-pending, so this component does NOT branch on
      those states client-side.

  W2 token guard (acceptance_criteria): every --color-* token used here must
  exist in src/app.css @theme. Verified: --color-provisional, --color-provisional-bg,
  --color-destructive, --color-surface, --color-border, --color-text,
  --color-text-muted, --color-accent, --color-accent-hover.
-->
<script lang="ts">
  type BoatOption = { id: number; display_name: string };

  let {
    preselectedBoats = [],
    preselectedSpecies = [],
    boats,
    species,
    showWarmupBanner = false,
    // Form state passed from action result (SvelteKit form-actions API)
    form
  }: {
    preselectedBoats?: number[];
    preselectedSpecies?: string[];
    boats: BoatOption[];
    species: string[];
    showWarmupBanner?: boolean;
    form?: {
      ok?: boolean;
      masked?: string;
      pageError?: 'rate_limited';
      fieldErrors?: { email?: string[]; boats?: string[] };
    } | null;
  } = $props();

  const isBoatSelected = (id: number) => preselectedBoats.includes(id);
  const isSpeciesSelected = (name: string) => preselectedSpecies.includes(name);
  const emailErrors = $derived(form?.fieldErrors?.email ?? []);
  const followsErrors = $derived(form?.fieldErrors?.boats ?? []);

  function emailErrorText(code: string): string {
    if (code === 'required') return 'Email is required.';
    if (code === 'invalid') return "That doesn't look like a valid email address.";
    if (code === 'disposable_address')
      return "We can't send to disposable addresses. Use a permanent inbox so you don't lose your unsubscribe link.";
    return code;
  }
</script>

{#if showWarmupBanner}
  <div
    role="status"
    class="mb-6 rounded border border-(--color-provisional) bg-(--color-provisional-bg) p-4 text-sm text-(--color-provisional)"
  >
    Note: we're warming up our email sender — alerts during the first two weeks are
    limited to 50/day (week 1) and 200/day (week 2). If volume exceeds the cap, alerts
    queue and send the next morning. We never silently drop alerts.
  </div>
{/if}

{#if form?.pageError === 'rate_limited'}
  <div
    role="alert"
    class="mb-6 rounded border border-(--color-destructive) bg-(--color-surface) p-4 text-sm text-(--color-destructive)"
  >
    <span aria-hidden="true">!</span> We've gotten a lot of signups from your network.
    Try again in an hour, or
    <a href="mailto:contact@fishcount.example" class="underline">contact us</a>.
  </div>
{/if}

<form method="POST" action="?/default" class="flex flex-col gap-4 max-w-prose" novalidate>
  <!-- HONEYPOT: must be first in DOM order (UI-SPEC rule 2). aria-hidden + tabindex=-1 + absolute. -->
  <div class="absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
    <label for="website">Leave this field blank</label>
    <input
      type="text"
      id="website"
      name="website"
      tabindex="-1"
      autocomplete="off"
      value=""
    />
  </div>

  <div>
    <label for="email" class="block text-sm font-semibold leading-tight">
      Email address <span aria-hidden="true" class="text-(--color-text)">*</span>
    </label>
    <input
      id="email"
      name="email"
      type="email"
      inputmode="email"
      autocomplete="email"
      spellcheck="false"
      autocapitalize="off"
      required
      aria-describedby="email-help"
      aria-invalid={emailErrors.length > 0}
      class="mt-2 min-h-11 w-full rounded border border-(--color-border) px-2"
      placeholder="you@example.com"
    />
    <p id="email-help" class="mt-2 text-sm text-(--color-text-muted)">
      We'll send a verification link before activating any alerts.
    </p>
    {#if emailErrors.length > 0}
      <p role="alert" class="mt-2 text-sm text-(--color-destructive)">
        <span aria-hidden="true">!</span> {emailErrorText(emailErrors[0])}
      </p>
    {/if}
  </div>

  <div>
    <label for="boats" class="block text-sm font-semibold leading-tight">
      Boats to follow (optional)
    </label>
    <select
      id="boats"
      name="boats"
      multiple size="8"
      class="mt-2 min-h-11 w-full rounded border border-(--color-border) px-2 py-1"
    >
      {#each boats as b (b.id)}
        <option value={b.id} selected={isBoatSelected(b.id)}>{b.display_name}</option>
      {/each}
    </select>
    <p class="mt-2 text-sm text-(--color-text-muted)">
      Pick the boats you want catch alerts for. Leave blank to follow species only.
    </p>
  </div>

  <div>
    <label for="species" class="block text-sm font-semibold leading-tight">
      Species to follow (optional)
    </label>
    <select
      id="species"
      name="species"
      multiple size="8"
      class="mt-2 min-h-11 w-full rounded border border-(--color-border) px-2 py-1"
    >
      {#each species as s (s)}
        <option value={s} selected={isSpeciesSelected(s)}>{s}</option>
      {/each}
    </select>
    <p class="mt-2 text-sm text-(--color-text-muted)">
      Pick the species you want run-start alerts for.
    </p>
    {#if followsErrors.length > 0}
      <p role="alert" class="mt-2 text-sm text-(--color-destructive)">
        <span aria-hidden="true">!</span> Pick at least one boat or species to follow.
      </p>
    {/if}
  </div>

  <button
    type="submit"
    class="min-h-11 self-start rounded bg-(--color-accent) px-4 py-2 font-semibold text-white hover:bg-(--color-accent-hover)"
  >
    Subscribe to alerts
  </button>
</form>
