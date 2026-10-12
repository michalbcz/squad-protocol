<script lang="ts">
  import { SCENARIOS, WEAPONS } from '@sp/content';
  import { onMount } from 'svelte';
  import { locale, t } from '../lib/i18n.svelte';
  import { LocalSession, type Session } from '../lib/session';
  import { NetSession } from '../lib/net-session';
  import { clearCredential, savedCredential, type SavedCredential } from '../lib/multiplayer-storage';
  import { REFRESHER_AFTER_DAYS, settings } from '../lib/settings.svelte';
  import { BOOT_CAMP, type TutorialMission } from '../tutorial/steps';
  import BootCamp from './BootCamp.svelte';
  import Codex from './Codex.svelte';
  import Game from './Game.svelte';
  import MainMenu from './MainMenu.svelte';
  import Multiplayer from './Multiplayer.svelte';
  import Refresher from './Refresher.svelte';
  import Settings from './Settings.svelte';

  type Screen = 'menu' | 'game' | 'codex' | 'settings' | 'refresher' | 'bootcamp' | 'multiplayer';
  type StartMode = 'skirmish' | 'hotseat';
  let screen = $state<Screen>('menu');
  let session = $state<Session | null>(null);
  let saved = $state<SavedCredential | null>(null);
  const invite = new URLSearchParams(location.search).get('room') ?? '';
  let networkUnsubscribe: (() => void) | null = null;
  let mission = $state<TutorialMission | null>(null);
  let lastMode = $state<StartMode>('skirmish');

  const daysAway = settings.daysAway;
  const offerRefresher = daysAway !== null && daysAway >= REFRESHER_AFTER_DAYS;
  // `?seed=N` makes games reproducible (used by e2e tests and bug reports).
  const fixedSeed = Number(new URLSearchParams(location.search).get('seed') ?? NaN);
  const seed = () => (Number.isFinite(fixedSeed) ? fixedSeed : (Math.random() * 2 ** 31) | 0);

  onMount(() => {
    settings.touch();
    for (const s of Object.values(SCENARIOS)) locale.addStrings(s.strings);
    saved = savedCredential();
    if (invite || saved || new URLSearchParams(location.search).has('multiplayer')) screen = 'multiplayer';
    else if (offerRefresher) screen = 'refresher';
  });

  function start(mode: StartMode) {
    session?.dispose();
    lastMode = mode;
    mission = null;
    session = new LocalSession({
      scenario: SCENARIOS.kestrel!,
      weapons: WEAPONS,
      seed: seed(),
      controllers: mode === 'hotseat' ? { blue: 'human', red: 'human' } : { blue: 'human', red: 'ai' },
    });
    screen = 'game';
  }

  function startMission(m: TutorialMission) {
    session?.dispose();
    mission = m;
    session = new LocalSession({ scenario: SCENARIOS[m.scenarioId]!, weapons: WEAPONS, seed: seed(), script: m.script });
    screen = 'game';
  }

  const nextMission = $derived(mission ? BOOT_CAMP[BOOT_CAMP.indexOf(mission) + 1] ?? null : null);

  function quit() {
    networkUnsubscribe?.(); networkUnsubscribe = null;
    if (session instanceof NetSession) { clearCredential(); saved = null; history.replaceState(null, '', location.pathname + (new URLSearchParams(location.search).has('e2e') ? '?e2e' : '')); }
    session?.dispose();
    session = null;
    screen = mission ? 'bootcamp' : 'menu';
  }

  function startNetwork(next: NetSession) {
    session?.dispose();
    mission = null;
    session = next;
    networkUnsubscribe = next.client.subscribe((message) => {
      if (message.kind === 'closed' || (message.kind === 'error' && ['roomNotFound', 'invalidToken'].includes(message.code))) clearCredential();
    });
    screen = 'game';
  }
</script>

<svelte:head><title>{t('app.title')}</title></svelte:head>

{#key locale.i18n}
  {#if screen === 'menu'}
    <MainMenu onstart={start} onnavigate={(s) => (screen = s)} />
  {:else if screen === 'bootcamp'}
    <BootCamp onstart={startMission} onback={() => (screen = 'menu')} />
  {:else if screen === 'multiplayer'}
    <Multiplayer {invite} {saved} onstart={startNetwork} onback={() => { saved = null; screen = 'menu'; }} />
  {:else if screen === 'game' && session}
    {#key session}
      <Game
        {session}
        {mission}
        onquit={quit}
        onrestart={session instanceof NetSession ? null : () => (mission ? startMission(mission) : start(lastMode))}
        onnext={nextMission ? () => startMission(nextMission) : null}
      />
    {/key}
  {:else if screen === 'codex'}
    <Codex onback={() => (screen = 'menu')} />
  {:else if screen === 'settings'}
    <Settings onback={() => (screen = 'menu')} />
  {:else if screen === 'refresher'}
    <Refresher days={daysAway ?? 0} onclose={() => (screen = 'menu')} onbootcamp={() => (screen = 'bootcamp')} />
  {/if}
{/key}
