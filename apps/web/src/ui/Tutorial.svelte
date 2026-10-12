<script lang="ts">
  import type { Action, Device } from '@sp/input';
  import { keyLabel, DEFAULT_KEYS, padLabel } from '@sp/input';
  import { onDestroy } from 'svelte';
  import type { GameController } from '../lib/controller.svelte';
  import { locale, t } from '../lib/i18n.svelte';
  import type { Board } from '../render/board';
  import { deviceKey, type TutorialStep } from '../tutorial/steps';

  let { steps, ctrl, device, board }: { steps: TutorialStep[]; ctrl: GameController; device: Device; board: Board } = $props();

  let index = $state(0);
  let hidden = $state(false);
  const step = $derived(steps[index]);

  function advance() {
    index = Math.min(index + 1, steps.length);
    // A step may already be satisfied when it starts (e.g. the game ended during the previous step).
    queueMicrotask(() => {
      const s = steps[index];
      if (s?.until?.({ type: 'check' }, ctrl)) advance();
    });
  }

  // svelte-ignore state_referenced_locally
  const off = ctrl.onSignal((s) => {
    const cur = steps[index];
    if (cur?.until?.(s, ctrl)) advance();
  });
  onDestroy(off);

  const glyph = (a: Action) => (device === 'gamepad' ? padLabel(a) || '⟳' : keyLabel(DEFAULT_KEYS, a));
  const keys = $derived({
    confirm: glyph('confirm'),
    endTurn: glyph('endTurn'),
    snap: glyph('fireSnap'),
    aimed: glyph('fireAimed'),
    turnLeft: glyph('turnLeft'),
    turnRight: glyph('turnRight'),
    next: glyph('nextUnit'),
  });

  // Spotlight UI elements by their data-tut attribute.
  $effect(() => {
    const target = step?.highlight;
    document.querySelectorAll('[data-tut-active]').forEach((el) => el.removeAttribute('data-tut-active'));
    if (target && !hidden) document.querySelector(`[data-tut="${target}"]`)?.setAttribute('data-tut-active', '');
  });

  $effect(() => {
    board.setHint(!hidden && step?.tile ? step.tile : null);
  });
  onDestroy(() => board.setHint(null));
</script>

{#if step && !hidden}
  <aside class="tutorial panel" aria-live="polite" aria-label={t('tut.label')}>
    <div class="progress muted">{t('tut.progress', { step: index + 1, count: steps.length })}</div>
    <p>{t(deviceKey(step.textKey, device, (k) => locale.i18n.has(k)), keys)}</p>
    <div class="row">
      {#if !step.until}
        {#key index}
          <!-- svelte-ignore a11y_autofocus -->
          <button class="primary" data-primary autofocus onclick={advance}>{t('tut.continue')}</button>
        {/key}
      {:else}
        <span class="muted waiting">{t('tut.doIt')}</span>
      {/if}
      <button onclick={() => (hidden = true)}>{t('tut.hide')}</button>
    </div>
  </aside>
{:else if step}
  <button class="reopen" onclick={() => (hidden = false)} aria-label={t('tut.show')}>?</button>
{/if}

<style>
  .tutorial {
    position: absolute;
    inset-block-start: 70px;
    inset-inline: 50% auto;
    transform: translateX(-50%);
    width: min(440px, 92vw);
    padding: 12px 16px;
    z-index: 5;
    border-color: var(--accent);
    box-shadow: 0 0 24px rgb(74 163 255 / 0.25);
  }
  :global([dir='rtl']) .tutorial { transform: translateX(50%); }
  p { margin: 6px 0 10px; line-height: 1.4; }
  .progress { font-size: 0.75rem; }
  .row { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
  .waiting { flex: 1; font-size: 0.85rem; }
  .reopen { position: absolute; inset-block-start: 70px; inset-inline-start: 50%; z-index: 5; border-radius: 50%; }
  :global([data-tut-active]) {
    outline: 3px solid var(--warn) !important;
    outline-offset: 3px;
    animation: tut-pulse 1.2s ease-in-out infinite;
  }
  @keyframes -global-tut-pulse {
    50% { outline-color: transparent; }
  }
  /* Landscape phones: dock to the side so the board centre (where hints point) stays visible. */
  @media (max-height: 520px) {
    .tutorial {
      inset-block-start: 52px;
      inset-inline: auto max(8px, env(safe-area-inset-right));
      transform: none;
      width: min(340px, 38vw);
      padding: 8px 12px;
      font-size: 0.8rem;
    }
    :global([dir='rtl']) .tutorial { transform: none; }
    p { margin: 4px 0 6px; line-height: 1.3; }
    .row button { min-height: 36px; }
    .reopen { inset-block-start: 52px; inset-inline: auto max(8px, env(safe-area-inset-right)); }
  }
  @media (prefers-reduced-motion: reduce) {
    :global([data-tut-active]) { animation: none; }
  }
</style>
