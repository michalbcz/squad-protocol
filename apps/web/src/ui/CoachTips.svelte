<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { GameController } from '../lib/controller.svelte';
  import { t } from '../lib/i18n.svelte';
  import { settings } from '../lib/settings.svelte';
  import { COACH_TIPS } from '../tutorial/tips';

  let { ctrl }: { ctrl: GameController } = $props();

  /** One toast at a time; later tips wait their turn. */
  let queue = $state<string[]>([]);
  const current = $derived(queue[0]);

  // svelte-ignore state_referenced_locally
  const off = ctrl.onSignal((s) => {
    if (!settings.coach) return;
    for (const tip of COACH_TIPS) {
      if (settings.hasSeenTip(tip.id) || queue.includes(tip.id)) continue;
      if (tip.when(s, ctrl)) queue = [...queue, tip.id];
    }
  });
  onDestroy(off);

  function dismiss() {
    if (current) settings.markTipSeen(current);
    queue = queue.slice(1);
  }

  function disable() {
    settings.coach = false;
    queue = [];
  }
</script>

{#if current && settings.coach}
  <div class="coach-tip panel" role="status" aria-live="polite">
    <strong>💡 {t('coach.title')}</strong>
    <p>{t(`coach.${current}`)}</p>
    <div class="row">
      <button class="primary" onclick={dismiss}>{t('coach.gotIt')}</button>
      <button onclick={disable}>{t('coach.off')}</button>
    </div>
  </div>
{/if}

<style>
  .coach-tip {
    position: absolute;
    inset-inline-end: max(8px, env(safe-area-inset-right));
    inset-block-end: 84px;
    width: min(340px, 80vw);
    padding: 10px 14px;
    z-index: 4;
    border-color: var(--warn);
  }
  p { margin: 4px 0 8px; line-height: 1.4; font-size: 0.9rem; }
  .row { display: flex; gap: 8px; justify-content: flex-end; }
  @media (max-height: 520px) {
    .coach-tip { inset-block-end: 64px; font-size: 0.85rem; }
  }
</style>
