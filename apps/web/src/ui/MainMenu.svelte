<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { settings } from '../lib/settings.svelte';
  import { BOOT_CAMP } from '../tutorial/steps';
  import { randomTip } from '../tutorial/tips';

  type StartMode = 'skirmish' | 'hotseat';
  let { onstart, onnavigate }: { onstart: (m: StartMode) => void; onnavigate: (s: 'codex' | 'settings' | 'refresher' | 'bootcamp') => void } = $props();

  const trained = $derived(settings.bootCamp.length >= BOOT_CAMP.length);
  const tip = randomTip();
</script>

<main class="menu">
  <header>
    <h1>{t('app.title')}</h1>
    <p class="muted">{t('app.tagline')}</p>
  </header>
  <nav class="panel" aria-label={t('menu.label')}>
    <button class:primary={!trained} onclick={() => onnavigate('bootcamp')}>
      {t('menu.bootcamp')}<span class="sub">{t('menu.bootcamp.sub', { done: settings.bootCamp.length, count: BOOT_CAMP.length })}</span>
    </button>
    <button class:primary={trained} onclick={() => onstart('skirmish')}>
      {t('menu.skirmish')}<span class="sub">{t('menu.skirmish.sub')}</span>
    </button>
    <button onclick={() => onstart('hotseat')}>
      {t('menu.hotseat')}<span class="sub">{t('menu.hotseat.sub')}</span>
    </button>
    <button disabled title={t('menu.soon')}>
      {t('menu.multiplayer')}<span class="sub">{t('menu.soon')}</span>
    </button>
    <button disabled title={t('menu.soon')}>
      {t('menu.editor')}<span class="sub">{t('menu.soon')}</span>
    </button>
    <div class="row">
      <button onclick={() => onnavigate('codex')}>{t('menu.codex')}</button>
      <button onclick={() => onnavigate('refresher')}>{t('menu.refresher')}</button>
      <button onclick={() => onnavigate('settings')}>{t('menu.settings')}</button>
    </div>
  </nav>
  <aside class="tip panel" aria-label={t('tips.ofTheDay')}>
    <strong>💡 {t('tips.ofTheDay')}: {t(`tips.${tip}.title`)}</strong>
    <p>{t(`tips.${tip}.body`)}</p>
  </aside>
</main>

<style>
  .menu {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    background: radial-gradient(#006600 1px, transparent 1px) 0 0 / 12px 12px, #000;
    border: 6px double var(--warn);
    overflow-y: auto;
  }
  .menu > * { flex-shrink: 0; width: 100%; max-width: 500px; }
  /* Auto margins center short menus without pushing overflowing content above the scroll origin. */
  header { margin-block-start: auto; text-align: center; background: #000; padding: 12px; border-block: 3px solid var(--warn); }
  h1 { margin: 0; font-size: clamp(2rem, 6vw, 3.5rem); letter-spacing: 0.04em; text-transform: uppercase; }
  nav { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
  nav > button { display: flex; flex-direction: column; align-items: flex-start; padding-block: 6px; text-align: start; }
  .sub { font-size: 0.8rem; color: var(--muted); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .row button { flex: 1 1 130px; }
  .tip { margin-block-end: auto; padding: 10px 14px; font-size: 0.85rem; }
  .tip p { margin: 4px 0 0; color: var(--muted); line-height: 1.4; }
</style>
