<script lang="ts">
  import { t } from '../lib/i18n.svelte';

  let { days, onclose, onbootcamp }: { days: number; onclose: () => void; onbootcamp: () => void } = $props();
  const CARDS = ['ap', 'move', 'fire', 'reaction', 'controls'];
  let i = $state(0);
</script>

<main class="refresher">
  <div class="panel card" role="dialog" aria-modal="true" aria-labelledby="ref-title">
    <p class="muted">{days > 0 ? t('refresher.welcomeBack', { days }) : t('refresher.title')}</p>
    <h1 id="ref-title">{t(`codex.${CARDS[i]}.title`)}</h1>
    <p class="body">{t(`codex.${CARDS[i]}.body`)}</p>
    <div class="dots" aria-hidden="true">
      {#each CARDS as _, n (n)}<span class:on={n === i}></span>{/each}
    </div>
    <div class="row">
      <button disabled={i === 0} onclick={() => i--}>{t('common.prev')}</button>
      {#if i < CARDS.length - 1}
        <button class="primary" onclick={() => i++}>{t('common.next')}</button>
      {:else}
        <button class="primary" onclick={onclose}>{t('refresher.done')}</button>
      {/if}
    </div>
    <div class="row">
      <button onclick={onbootcamp}>{t('refresher.replay')}</button>
      <button onclick={onclose}>{t('refresher.skip')}</button>
    </div>
  </div>
</main>

<style>
  .refresher { height: 100%; display: grid; place-items: center; padding: 16px; }
  .card { padding: 24px; width: min(520px, 94vw); display: grid; gap: 12px; }
  h1 { margin: 0; }
  .body { white-space: pre-line; line-height: 1.5; min-height: 6em; margin: 0; }
  .dots { display: flex; gap: 6px; justify-content: center; }
  .dots span { width: 8px; height: 8px; border-radius: 50%; background: var(--line); }
  .dots span.on { background: var(--accent); }
  .row { display: flex; gap: 8px; justify-content: space-between; flex-wrap: wrap; }
</style>
