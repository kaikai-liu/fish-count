<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PreferenceRow from '$lib/components/PreferenceRow.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // svelte-check can't propagate the {invalid:true} | {invalid:false; summary; …}
  // discriminator from the server load through to the template. We narrow once
  // here and bind the valid view to a `view` const so all downstream references
  // are typed.
  type ValidView = Extract<PageData, { invalid: false }>;
  const view = $derived(data as ValidView);

  // Build query string for action attributes (form actions need the token preserved).
  // When the link is invalid we don't render the form so the empty fallback is fine.
  const tokenQs = $derived(
    data.invalid ? '' : `?token=${encodeURIComponent(view.currentToken ?? '')}`
  );
</script>

<svelte:head><title>Manage your alerts — FishCount</title></svelte:head>

<main class="mx-auto max-w-prose px-4 py-8">
  {#if data.invalid}
    <PageHeader title="This link is no longer valid" />
    <article class="space-y-4 text-base leading-normal">
      <p>Magic links expire after 30 days. Sign up again to get a fresh link.</p>
      <p>
        <a
          href="/alerts"
          class="inline-block min-h-11 rounded bg-(--color-accent) px-4 py-2 font-semibold text-white"
          >Sign up again</a
        >
      </p>
    </article>
  {:else}
    <PageHeader title="Manage your alerts" subtitle="Subscribed as {view.summary.email}" />

    {#if form && 'ok' in form && form.ok}
      <p
        role="status"
        class="mb-4 rounded border border-(--color-accent) bg-(--color-accent-bg) p-3 text-sm text-(--color-accent)"
      >
        Preferences updated.
      </p>
    {/if}

    <section class="mt-6">
      <h2 class="text-xl font-semibold leading-tight">Followed boats</h2>
      {#if view.summary.boats.length > 0}
        {#each view.summary.boats as b (b.id)}
          <!--
            removeBoat needs the boat id (not display_name). PreferenceRow ships
            label-as-hidden-input only — this inline form mirrors it but adds the
            boatId hidden input the action expects.
          -->
          <div class="flex items-center justify-between border-b border-(--color-border) py-3">
            <a href="/boats/{b.id}" class="text-(--color-accent) underline">{b.display_name}</a>
            <form method="POST" action="?/removeBoat{tokenQs}" class="m-0">
              <input type="hidden" name="boatId" value={b.id} />
              <input type="hidden" name="label" value={b.display_name} />
              <button
                type="submit"
                class="min-h-11 text-sm text-(--color-text-muted) hover:text-(--color-destructive) underline"
                >Remove</button
              >
            </form>
          </div>
        {/each}
      {:else}
        <p class="py-3 text-sm text-(--color-text-muted)">No boats followed.</p>
      {/if}
    </section>

    <section class="mt-6">
      <h2 class="text-xl font-semibold leading-tight">Followed species</h2>
      {#if view.summary.species.length > 0}
        {#each view.summary.species as s (s)}
          <PreferenceRow kind="species" label={s} removeFormAction="?/removeSpecies{tokenQs}" />
        {/each}
      {:else}
        <p class="py-3 text-sm text-(--color-text-muted)">No species followed.</p>
      {/if}
    </section>

    <form method="POST" action="?/default{tokenQs}" class="mt-8 flex flex-col gap-4">
      <h2 class="text-xl font-semibold leading-tight">Add boats / species</h2>
      <div>
        <label for="boats-add" class="block text-sm font-semibold leading-tight">Boats</label>
        <select
          id="boats-add"
          name="boats"
          multiple
          size="8"
          class="mt-2 min-h-11 w-full rounded border border-(--color-border) px-2 py-1"
        >
          {#each view.boats as b (b.id)}
            <option value={b.id} selected={view.summary.boats.some((cur) => cur.id === b.id)}
              >{b.display_name}</option
            >
          {/each}
        </select>
      </div>
      <div>
        <label for="species-add" class="block text-sm font-semibold leading-tight">Species</label>
        <select
          id="species-add"
          name="species"
          multiple
          size="8"
          class="mt-2 min-h-11 w-full rounded border border-(--color-border) px-2 py-1"
        >
          {#each view.species as s (s)}
            <option value={s} selected={view.summary.species.includes(s)}>{s}</option>
          {/each}
        </select>
      </div>

      <fieldset class="border border-(--color-border) p-4">
        <legend class="px-2 text-sm font-semibold">Pause alerts</legend>
        <label class="block py-1 text-sm"
          ><input
            type="radio"
            name="pause"
            value="off"
            checked={!view.pausedUntil}
            class="mr-2"
          /> Off (default)</label
        >
        <label class="block py-1 text-sm"
          ><input type="radio" name="pause" value="1w" class="mr-2" /> Pause 1 week</label
        >
        <label class="block py-1 text-sm"
          ><input type="radio" name="pause" value="2w" class="mr-2" /> Pause 2 weeks</label
        >
        <label class="block py-1 text-sm"
          ><input type="radio" name="pause" value="1m" class="mr-2" /> Pause 1 month</label
        >
        <label class="block py-1 text-sm"
          ><input type="radio" name="pause" value="until-on" class="mr-2" /> Pause until I turn back on</label
        >
      </fieldset>

      <button
        type="submit"
        class="self-start min-h-11 rounded bg-(--color-accent) px-4 py-2 font-semibold text-white hover:bg-(--color-accent-hover)"
      >
        Update preferences
      </button>
    </form>

    <p class="mt-8 text-sm">
      <a href={view.unsubscribeUrl} class="text-(--color-text-muted) underline"
        >Unsubscribe from all</a
      >
    </p>
  {/if}
</main>
