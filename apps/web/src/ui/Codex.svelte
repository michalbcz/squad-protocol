<script lang="ts">
  import { t } from '../lib/i18n.svelte';

  let { onback }: { onback: () => void } = $props();
  const TOPICS = ['ap', 'move', 'facing', 'fog', 'fire', 'reaction', 'cover', 'doors', 'hotseat', 'controls'];
  let query = $state('');
  const visible = $derived(
    TOPICS.filter((k) => {
      const q = query.trim().toLocaleLowerCase();
      return !q || `${t(`codex.${k}.title`)} ${t(`codex.${k}.body`)}`.toLocaleLowerCase().includes(q);
    }),
  );
</script>

<main class="codex">
  <header>
    <button onclick={onback}>← {t('common.back')}</button>
    <h1>{t('menu.codex')}</h1>
    <input type="search" placeholder={t('codex.search')} bind:value={query} aria-label={t('codex.search')} />
  </header>
  <div class="list">
    {#each visible as k (k)}
      <article class="panel">
        <h2>{t(`codex.${k}.title`)}</h2>
        <p>{t(`codex.${k}.body`)}</p>
      </article>
    {:else}
      <p class="muted">{t('codex.none')}</p>
    {/each}
  </div>
</main>

<style>
  .codex { height: 100%; overflow-y: auto; padding: max(16px, env(safe-area-inset-top)) 16px 32px; max-width: 760px; margin: 0 auto; }
  header { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; position: sticky; top: 0; background: var(--bg); padding-block: 8px; }
  h1 { margin: 0; flex: 1; }
  input { font: inherit; min-height: var(--hit); padding-inline: 12px; border-radius: 8px; border: 1px solid var(--line); background: #0b0f15; color: var(--text); width: min(260px, 100%); }
  .list { display: grid; gap: 10px; }
  article { padding: 12px 16px; }
  h2 { margin: 0 0 4px; font-size: 1.05rem; }
  p { margin: 0; line-height: 1.5; white-space: pre-line; }
</style>
