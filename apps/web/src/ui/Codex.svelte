<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { TIPS } from '../tutorial/tips';

  let { onback }: { onback: () => void } = $props();
  const TOPICS = ['ap', 'move', 'facing', 'fog', 'fire', 'reaction', 'cover', 'doors', 'hotseat', 'controls'];
  let query = $state('');
  const matches = (prefix: string) => (k: string) => {
    const q = query.trim().toLocaleLowerCase();
    return !q || `${t(`${prefix}.${k}.title`)} ${t(`${prefix}.${k}.body`)}`.toLocaleLowerCase().includes(q);
  };
  const visible = $derived(TOPICS.filter(matches('codex')));
  const tips = $derived(TIPS.filter(matches('tips')));
</script>

<main class="codex">
  <header>
    <button onclick={onback}>← {t('common.back')}</button>
    <h1>{t('menu.codex')}</h1>
    <input type="search" placeholder={t('codex.search')} bind:value={query} aria-label={t('codex.search')} />
  </header>
  <div class="list">
    {#if visible.length}<h2 class="section">{t('codex.rules')}</h2>{/if}
    {#each visible as k (k)}
      <article class="panel">
        <h3>{t(`codex.${k}.title`)}</h3>
        <p>{t(`codex.${k}.body`)}</p>
      </article>
    {/each}
    {#if tips.length}<h2 class="section" id="tips">💡 {t('tips.title')}</h2>{/if}
    {#each tips as k (k)}
      <article class="panel tip">
        <h3>{t(`tips.${k}.title`)}</h3>
        <p>{t(`tips.${k}.body`)}</p>
      </article>
    {/each}
    {#if !visible.length && !tips.length}<p class="muted">{t('codex.none')}</p>{/if}
  </div>
</main>

<style>
  .codex { height: 100%; overflow-y: auto; padding: max(16px, env(safe-area-inset-top)) 16px 32px; max-width: 760px; margin: 0 auto; }
  header { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; position: sticky; top: 0; background: var(--bg); padding-block: 8px; }
  h1 { margin: 0; flex: 1; }
  input { font: inherit; min-height: var(--hit); padding-inline: 12px; border-radius: 0; border: 1px solid var(--line); background: #000; color: var(--text); width: min(260px, 100%); }
  .list { display: grid; gap: 10px; }
  article { padding: 12px 16px; }
  h3 { margin: 0 0 4px; font-size: 1.05rem; }
  .section { margin: 12px 0 0; font-size: 1.2rem; }
  .tip { border-inline-start: 3px solid var(--warn); }
  p { margin: 0; line-height: 1.5; white-space: pre-line; }
</style>
