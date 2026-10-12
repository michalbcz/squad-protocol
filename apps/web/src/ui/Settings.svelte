<script lang="ts">
  import { LOCALES, locale, t } from '../lib/i18n.svelte';
  import { settings } from '../lib/settings.svelte';

  let { onback }: { onback: () => void } = $props();
</script>

<main class="settings">
  <header>
    <button onclick={onback}>← {t('common.back')}</button>
    <h1>{t('menu.settings')}</h1>
  </header>
  <div class="panel form">
    <label>
      {t('settings.language')}
      <select value={locale.i18n.locale} onchange={(e) => locale.set(e.currentTarget.value)}>
        {#each LOCALES as l (l.code)}<option value={l.code}>{l.name}</option>{/each}
      </select>
    </label>
    <label class="check"><input type="checkbox" bind:checked={settings.coach} /> {t('settings.coach')}</label>
    <div class="actions">
      <button disabled={settings.bootCamp.length === 0} onclick={() => settings.resetBootCamp()}>{t('settings.resetBootCamp')}</button>
      <button onclick={() => { settings.resetTips(); settings.coach = true; }}>{t('settings.resetTips')}</button>
    </div>
  </div>
</main>

<style>
  .settings { padding: 16px; max-width: 560px; margin: 0 auto; }
  header { display: flex; gap: 12px; align-items: center; }
  h1 { margin: 0; }
  .form { display: grid; gap: 16px; padding: 16px; margin-top: 16px; }
  label { display: grid; gap: 6px; }
  .check { display: flex; align-items: center; gap: 8px; min-height: var(--hit); }
  select { font: inherit; min-height: var(--hit); background: #0b0f15; color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding-inline: 8px; }
  input[type='checkbox'] { width: 22px; height: 22px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
