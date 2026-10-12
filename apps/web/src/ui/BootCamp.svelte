<script lang="ts">
  import { SCENARIOS } from '@sp/content';
  import { t } from '../lib/i18n.svelte';
  import { settings } from '../lib/settings.svelte';
  import { BOOT_CAMP, type TutorialMission } from '../tutorial/steps';

  let { onstart, onback }: { onstart: (m: TutorialMission) => void; onback: () => void } = $props();

  const done = (m: TutorialMission) => settings.bootCamp.includes(m.id);
  const next = $derived(BOOT_CAMP.find((m) => !done(m)) ?? BOOT_CAMP[0]!);
</script>

<main class="bootcamp">
  <header>
    <button onclick={onback}>← {t('common.back')}</button>
    <h1>{t('menu.bootcamp')}</h1>
    <span class="muted">{t('bootcamp.progress', { done: BOOT_CAMP.filter(done).length, count: BOOT_CAMP.length })}</span>
  </header>
  <ol class="missions">
    {#each BOOT_CAMP as m, i (m.id)}
      {@const scenario = SCENARIOS[m.scenarioId]!}
      <li class="panel" class:done={done(m)}>
        <div class="num" aria-hidden="true">{done(m) ? '✓' : i + 1}</div>
        <div class="text">
          <h2>{t(scenario.titleKey)}</h2>
          <p class="muted">{t(m.summaryKey)}</p>
        </div>
        <!-- svelte-ignore a11y_autofocus -->
        <button class:primary={m === next} autofocus={m === next} onclick={() => onstart(m)}>
          {done(m) ? t('bootcamp.replay') : m === next ? t('bootcamp.start') : t('bootcamp.play')}
        </button>
      </li>
    {/each}
  </ol>
  <p class="muted hint">{t('bootcamp.hint')}</p>
</main>

<style>
  .bootcamp { height: 100%; overflow-y: auto; padding: max(16px, env(safe-area-inset-top)) 16px 32px; max-width: 720px; margin: 0 auto; }
  header { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  h1 { margin: 0; flex: 1; }
  .missions { list-style: none; padding: 0; display: grid; gap: 10px; }
  li { display: flex; gap: 12px; align-items: center; padding: 12px 16px; }
  li.done { border-color: var(--good); }
  .num { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: #1c2533; font-weight: bold; flex: none; }
  li.done .num { background: #1d3a26; color: var(--good); }
  .text { flex: 1; }
  h2 { margin: 0; font-size: 1.05rem; }
  p { margin: 4px 0 0; }
  .hint { font-size: 0.85rem; }
</style>
