<script lang="ts">
  import { SCENARIOS, WEAPONS } from '@sp/content';
  import { onMount } from 'svelte';
  import { locale, t } from '../lib/i18n.svelte';
  import { LocalSession } from '../lib/session';
  import { REFRESHER_AFTER_DAYS, settings } from '../lib/settings.svelte';
  import { BOOTCAMP1, type TutorialStep } from '../tutorial/steps';
  import Codex from './Codex.svelte';
  import Game from './Game.svelte';
  import MainMenu from './MainMenu.svelte';
  import Refresher from './Refresher.svelte';
  import Settings from './Settings.svelte';

  type Screen = 'menu' | 'game' | 'codex' | 'settings' | 'refresher';
  let screen = $state<Screen>('menu');
  let session = $state<LocalSession | null>(null);
  let tutorial = $state<TutorialStep[] | null>(null);

  const daysAway = settings.daysAway;
  const offerRefresher = daysAway !== null && daysAway >= REFRESHER_AFTER_DAYS;

  onMount(() => {
    settings.touch();
    for (const s of Object.values(SCENARIOS)) locale.addStrings(s.strings);
    if (offerRefresher) screen = 'refresher';
  });

  type StartMode = 'bootcamp' | 'skirmish' | 'hotseat';

  function start(mode: StartMode) {
    session?.dispose();
    const seed = (Math.random() * 2 ** 31) | 0;
    if (mode === 'bootcamp') {
      session = new LocalSession({ scenario: SCENARIOS.bootcamp1!, weapons: WEAPONS, seed });
      tutorial = BOOTCAMP1;
    } else {
      session = new LocalSession({
        scenario: SCENARIOS.kestrel!,
        weapons: WEAPONS,
        seed,
        controllers: mode === 'hotseat' ? { blue: 'human', red: 'human' } : { blue: 'human', red: 'ai' },
      });
      tutorial = null;
    }
    screen = 'game';
  }

  function quit() {
    session?.dispose();
    session = null;
    screen = 'menu';
  }
</script>

<svelte:head><title>{t('app.title')}</title></svelte:head>

{#key locale.i18n}
  {#if screen === 'menu'}
    <MainMenu onstart={start} onnavigate={(s) => (screen = s)} />
  {:else if screen === 'game' && session}
    {#key session}
      <Game {session} {tutorial} onquit={quit} onrestart={() => start(tutorial ? 'bootcamp' : session!.humans().length > 1 ? 'hotseat' : 'skirmish')} />
    {/key}
  {:else if screen === 'codex'}
    <Codex onback={() => (screen = 'menu')} />
  {:else if screen === 'settings'}
    <Settings onback={() => (screen = 'menu')} />
  {:else if screen === 'refresher'}
    <Refresher days={daysAway ?? 0} onclose={() => (screen = 'menu')} onbootcamp={() => start('bootcamp')} />
  {/if}
{/key}
