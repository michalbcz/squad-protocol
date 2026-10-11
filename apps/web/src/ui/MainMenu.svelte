<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { settings } from '../lib/settings.svelte';

  type StartMode = 'bootcamp' | 'skirmish' | 'hotseat';
  let { onstart, onnavigate }: { onstart: (m: StartMode) => void; onnavigate: (s: 'codex' | 'settings' | 'refresher') => void } = $props();
</script>

<main class="menu">
  <header>
    <h1>{t('app.title')}</h1>
    <p class="muted">{t('app.tagline')}</p>
  </header>
  <nav class="panel" aria-label={t('menu.label')}>
    <button class:primary={!settings.tutorialDone} onclick={() => onstart('bootcamp')}>
      {t('menu.bootcamp')}<span class="sub">{t('menu.bootcamp.sub')}</span>
    </button>
    <button class:primary={settings.tutorialDone} onclick={() => onstart('skirmish')}>
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
</main>

<style>
  .menu {
    height: 100%;
    display: grid;
    place-content: center;
    gap: 24px;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    background: radial-gradient(ellipse at 30% 20%, #16263d 0%, var(--bg) 60%);
    overflow-y: auto;
  }
  header { text-align: center; }
  h1 { margin: 0; font-size: clamp(2rem, 6vw, 3.5rem); letter-spacing: 0.08em; text-transform: uppercase; }
  nav { display: flex; flex-direction: column; gap: 10px; padding: 16px; width: min(420px, 92vw); }
  nav > button { display: flex; flex-direction: column; align-items: flex-start; padding-block: 10px; text-align: start; }
  .sub { font-size: 0.8rem; color: var(--muted); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .row button { flex: 1; }
</style>
