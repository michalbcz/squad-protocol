<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { TIPS } from '../tutorial/tips';

  let { days, onclose, onbootcamp }: { days: number; onclose: () => void; onbootcamp: () => void } = $props();
  // Core rules first, then three rotating tips & tricks so repeat visits stay useful.
  const offset = Math.floor(Date.now() / 86_400_000);
  const CARDS: { prefix: 'codex' | 'tips'; id: string }[] = [
    ...['ap', 'move', 'fire', 'reaction', 'controls'].map((id) => ({ prefix: 'codex' as const, id })),
    ...[0, 1, 2].map((n) => ({ prefix: 'tips' as const, id: TIPS[(offset + n * 5) % TIPS.length]! })),
  ];
  let i = $state(0);
  const card = $derived(CARDS[i]!);
</script>

<main class="refresher">
  <div class="panel card" role="dialog" aria-modal="true" aria-labelledby="ref-title">
    <p class="muted">{days > 0 ? t('refresher.welcomeBack', { days }) : t('refresher.title')}</p>
    {#if card.prefix === 'tips'}<p class="kicker">💡 {t('tips.title')}</p>{/if}
    <h1 id="ref-title">{t(`${card.prefix}.${card.id}.title`)}</h1>
    <p class="body">{t(`${card.prefix}.${card.id}.body`)}</p>
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
  .kicker { margin: 0; color: var(--warn); font-size: 0.85rem; }
  .body { white-space: pre-line; line-height: 1.5; min-height: 6em; margin: 0; }
  .dots { display: flex; gap: 6px; justify-content: center; }
  .dots span { width: 8px; height: 8px; border-radius: 50%; background: var(--line); }
  .dots span.on { background: var(--accent); }
  .row { display: flex; gap: 8px; justify-content: space-between; flex-wrap: wrap; }
</style>
