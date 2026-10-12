<script lang="ts">
  import { createInputHub, DEFAULT_KEYS, keyLabel, padLabel, type Action, type Device, type InputHub } from '@sp/input';
  import { onDestroy, onMount } from 'svelte';
  import { GameController, type Mode } from '../lib/controller.svelte';
  import { locale, t } from '../lib/i18n.svelte';
  import type { LocalSession } from '../lib/session';
  import { settings } from '../lib/settings.svelte';
  import { Board } from '../render/board';
  import type { TutorialMission } from '../tutorial/steps';
  import CoachTips from './CoachTips.svelte';
  import Tutorial from './Tutorial.svelte';

  let {
    session,
    mission,
    onquit,
    onrestart,
    onnext,
  }: { session: LocalSession; mission: TutorialMission | null; onquit: () => void; onrestart: () => void; onnext: (() => void) | null } = $props();

  let host: HTMLDivElement;
  let device = $state<Device>('mouse');
  let menuOpen = $state(false);
  let hub: InputHub;

  const board = new Board({
    onTap: (tile, pointer) => ctrl.tap(tile, pointer),
    onHover: (tile) => ctrl.hover(tile),
    onLongPress: (tile) => ctrl.longPress(tile),
    onPointer: (e) => hub?.notePointer(e),
    onCamera: (user) => ctrl?.cameraMoved(user),
  });
  // svelte-ignore state_referenced_locally (the screen is re-created per session via {#key})
  const ctrl = new GameController(session, board);

  onMount(() => {
    hub = createInputHub(window);
    device = hub.device;
    hub.onDevice((d) => (device = d));
    hub.on((a) => {
      if (a === 'help') return void (menuOpen = !menuOpen);
      if (a === 'cancel' && menuOpen) return void (menuOpen = false);
      // Dialogs and tutorial "Continue" take confirm from any device (keyboard, gamepad).
      const primary = host.parentElement?.querySelector<HTMLButtonElement>('.cover [data-primary]') ?? host.parentElement?.querySelector<HTMLButtonElement>('[data-primary]');
      if (a === 'confirm' && primary) return primary.click();
      if (ctrl.view.over || ctrl.handoffTo) return;
      // Esc with nothing to cancel opens the pause menu.
      if (a === 'cancel' && ctrl.mode === 'move' && !ctrl.preview && !ctrl.inspect) return void (menuOpen = true);
      ctrl.action(a);
    });
    board.setView(ctrl.view);
    void board.mount(host).then(() => ctrl.sync());
    // Test hook for Playwright: exposes the controller and renderer, never the authoritative match.
    if (new URLSearchParams(location.search).has('e2e')) Object.assign(window, { __sp: { ctrl, board } });
  });

  onDestroy(() => {
    hub?.dispose();
    ctrl.dispose();
    board.destroy();
  });

  const glyph = (a: Action) => (device === 'gamepad' ? padLabel(a) : device === 'keyboard' || device === 'mouse' ? keyLabel(hub?.bindings ?? DEFAULT_KEYS, a) : '');
  const sel = $derived(ctrl.selected);
  const weapon = $derived(sel ? ctrl.view.weapons[sel.weaponId] : undefined);
  const sideName = (id: string) => t(ctrl.view.sides.find((s) => s.id === id)?.nameKey ?? id);

  const tip = $derived.by(() => {
    void ctrl.cameraTick;
    const p = ctrl.preview;
    if (!p || !ctrl.myTurn) return null;
    const at = p.kind === 'fire' ? p.target : p.to;
    const pos = board.ready ? board.tileToScreen(at) : { x: 0, y: 0 };
    let text: string;
    let tone: 'ok' | 'bad' | 'warn' = 'ok';
    if (p.kind === 'move') {
      const ok = p.total <= (sel?.ap ?? 0);
      text = ok ? t('preview.move', { cost: p.total, ap: (sel?.ap ?? 0) - p.total }) : t('preview.moveTooFar', { cost: p.total, ap: sel?.ap ?? 0 });
      tone = ok ? 'ok' : 'warn';
    } else if (p.kind === 'fire') {
      const ok = p.cost <= (sel?.ap ?? 0);
      text = t('preview.fire', { chance: p.chance, cost: p.cost });
      tone = ok ? 'ok' : 'bad';
    } else {
      text = t(`preview.${p.reason}`);
      tone = 'bad';
    }
    const confirmHint = device === 'touch' ? t('preview.tapAgain') : device === 'mouse' ? t('preview.click') : t('preview.press', { key: glyph('confirm') });
    return { ...pos, text, tone, confirmHint: tone === 'bad' ? '' : confirmHint };
  });

  const modes: { mode: Mode; action: Action }[] = [
    { mode: 'move', action: 'cancel' },
    { mode: 'snap', action: 'fireSnap' },
    { mode: 'aimed', action: 'fireAimed' },
    { mode: 'auto', action: 'fireAuto' },
  ];

  const won = $derived(ctrl.view.over && ctrl.view.winner === ctrl.view.side);
  $effect(() => {
    if (won && mission) settings.completeMission(mission.id);
  });
</script>

<div class="game" dir={locale.i18n.dir}>
  <div class="board" bind:this={host}></div>

  <header class="top panel">
    <button onclick={() => (menuOpen = true)} aria-label={t('hud.menu')}>☰</button>
    <div class="turn" aria-live="polite">
      {t('hud.turn', { turn: ctrl.view.turn })} · <strong style:color={ctrl.view.activeSide === 'red' ? 'var(--bad)' : 'var(--accent)'}>{sideName(ctrl.view.activeSide)}</strong>
      {#if !ctrl.myTurn && !ctrl.view.over}<span class="muted"> · {t('hud.waiting')}</span>{/if}
    </div>
    <div class="objective muted">{t(session.scenario.titleKey)}</div>
  </header>

  {#if sel}
    <section class="unit panel" data-tut="unit-panel" aria-label={t('hud.unit')}>
      <div class="name">
        <strong>{t(sel.nameKey)}</strong>
        <span class="muted">{weapon ? t(weapon.nameKey) : ''}</span>
      </div>
      <div class="bars">
        <div class="bar"><span>{t('hud.ap')}</span><meter min="0" max={sel.maxAp} value={sel.ap}></meter><span>{sel.ap}/{sel.maxAp}</span></div>
        <div class="bar"><span>{t('hud.hp')}</span><meter min="0" max={sel.maxHp} low={sel.maxHp * 0.3} high={sel.maxHp * 0.6} optimum={sel.maxHp} value={sel.hp}></meter><span>{sel.hp}/{sel.maxHp}</span></div>
      </div>
      {#if settings.coach && weapon}
        <p class="coach muted">{t('coach.reserve', { cost: weapon.ap.snap ?? 0 })}</p>
      {/if}
    </section>
  {/if}

  <nav class="actions panel" aria-label={t('hud.actions')}>
    <div class="group" data-tut="fire-modes" role="radiogroup" aria-label={t('hud.mode')}>
      {#each modes as m (m.mode)}
        {@const ap = m.mode === 'move' ? 0 : weapon?.ap[m.mode]}
        <button
          role="radio"
          aria-checked={ctrl.mode === m.mode}
          class:active={ctrl.mode === m.mode}
          disabled={!ctrl.myTurn || (m.mode !== 'move' && ap == null)}
          onclick={() => ctrl.setMode(m.mode)}
        >
          {t(`mode.${m.mode}`)}{#if m.mode !== 'move' && ap != null}<small> {ap}</small>{/if}{#if glyph(m.mode === 'move' ? 'cancel' : m.action)}<kbd>{glyph(m.mode === 'move' ? 'cancel' : m.action)}</kbd>{/if}
        </button>
      {/each}
    </div>
    <div class="group" data-tut="turn-buttons">
      <button disabled={!ctrl.myTurn} onclick={() => ctrl.turn(-1)} aria-label={t('action.turnLeft')}>⟲{#if glyph('turnLeft')}<kbd>{glyph('turnLeft')}</kbd>{/if}</button>
      <button disabled={!ctrl.myTurn} onclick={() => ctrl.turn(1)} aria-label={t('action.turnRight')}>⟳{#if glyph('turnRight')}<kbd>{glyph('turnRight')}</kbd>{/if}</button>
      <button disabled={!ctrl.myTurn} onclick={() => ctrl.toggleNearestDoor()}>{t('action.door')}{#if glyph('toggleDoor')}<kbd>{glyph('toggleDoor')}</kbd>{/if}</button>
      <button disabled={!ctrl.myTurn} onclick={() => ctrl.action('nextUnit')}>{t('action.next')}{#if glyph('nextUnit')}<kbd>{glyph('nextUnit')}</kbd>{/if}</button>
    </div>
    <button class="primary end" data-tut="end-turn" disabled={!ctrl.myTurn} onclick={() => ctrl.endTurn()}>
      {t('action.endTurn')}{#if glyph('endTurn')}<kbd>{glyph('endTurn')}</kbd>{/if}
    </button>
  </nav>

  {#if tip}
    <div class="tip {tip.tone}" style:left="{tip.x}px" style:top="{tip.y}px" role="status">
      {tip.text}{#if tip.confirmHint}<br /><small>{tip.confirmHint}</small>{/if}
    </div>
  {/if}

  <ol class="log" aria-live="polite" aria-label={t('hud.log')}>
    {#each ctrl.log.slice(-5) as entry (entry.id)}
      <li>{t(entry.key, entry.values)}</li>
    {/each}
  </ol>

  {#if ctrl.inspect}
    {@const u = ctrl.inspect}
    <div class="inspect panel" role="dialog">
      <strong>{t(u.nameKey)}</strong> · {sideName(u.side)}<br />
      {t('hud.hp')} {u.hp}/{u.maxHp} · {t(ctrl.view.weapons[u.weaponId]?.nameKey ?? '')}
      <button onclick={() => (ctrl.inspect = null)}>{t('common.close')}</button>
    </div>
  {/if}

  {#if mission}
    <Tutorial steps={mission.steps} {ctrl} {device} {board} />
  {:else}
    <CoachTips {ctrl} />
  {/if}

  {#if ctrl.handoffTo}
    <div class="cover opaque" role="dialog" aria-modal="true">
      <div class="panel card">
        <h2>{t('handoff.title', { side: sideName(ctrl.handoffTo) })}</h2>
        <p class="muted">{t('handoff.body')}</p>
        <!-- svelte-ignore a11y_autofocus -->
        <button class="primary" data-primary autofocus onclick={() => session.acceptHandoff()}>{t('handoff.ready')}</button>
      </div>
    </div>
  {/if}

  {#if ctrl.view.over}
    <div class="cover" role="dialog" aria-modal="true">
      <div class="panel card">
        {#if mission && won}
          <h2>{t('over.missionComplete')}</h2>
          <p class="muted">{onnext ? t('over.missionNext') : t('over.bootcampDone')}</p>
        {:else}
          <h2>{ctrl.view.winner === null ? t('over.draw') : won || session.humans().length > 1 ? t('over.victory', { side: sideName(ctrl.view.winner) }) : t('over.defeat')}</h2>
          {#if mission}<p class="muted">{t('over.missionRetry')}</p>{/if}
        {/if}
        <div class="row">
          {#if mission && won && onnext}
            <!-- svelte-ignore a11y_autofocus -->
            <button class="primary" data-primary autofocus onclick={onnext}>{t('over.nextMission')}</button>
            <button onclick={onrestart}>{t('over.again')}</button>
          {:else}
            <!-- svelte-ignore a11y_autofocus -->
            <button class="primary" data-primary autofocus onclick={onrestart}>{t('over.again')}</button>
          {/if}
          <button onclick={onquit}>{mission ? t('over.bootcamp') : t('over.menu')}</button>
        </div>
      </div>
    </div>
  {/if}

  {#if menuOpen}
    <div class="cover" role="dialog" aria-modal="true">
      <div class="panel card">
        <h2>{t('pause.title')}</h2>
        <h3>{t('pause.controls')}</h3>
        <ul class="controls">
          <li>{t(`controls.${device}`)}</li>
        </ul>
        <label><input type="checkbox" bind:checked={settings.coach} /> {t('settings.coach')}</label>
        <div class="row">
          <!-- svelte-ignore a11y_autofocus -->
          <button class="primary" data-primary autofocus onclick={() => (menuOpen = false)}>{t('pause.resume')}</button>
          <button onclick={onquit}>{t('over.menu')}</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .game { position: relative; height: 100%; overflow: hidden; user-select: none; }
  .board { position: absolute; inset: 0; }
  .top {
    position: absolute;
    inset-block-start: max(8px, env(safe-area-inset-top));
    inset-inline: max(8px, env(safe-area-inset-left)) max(8px, env(safe-area-inset-right));
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 8px;
  }
  .turn { flex: 1; }
  .objective { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40%; }
  .unit {
    position: absolute;
    inset-block-start: 70px;
    inset-inline-start: max(8px, env(safe-area-inset-left));
    padding: 10px 12px;
    width: min(280px, 46vw);
  }
  .name { display: flex; flex-direction: column; }
  .bars { display: grid; gap: 4px; margin-top: 6px; }
  .bar { display: grid; grid-template-columns: 2.5em 1fr auto; gap: 6px; align-items: center; font-size: 0.85rem; }
  meter { width: 100%; }
  .coach { font-size: 0.75rem; margin: 6px 0 0; }
  .actions {
    position: absolute;
    inset-block-end: max(8px, env(safe-area-inset-bottom));
    inset-inline: max(8px, env(safe-area-inset-left)) max(8px, env(safe-area-inset-right));
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px;
    align-items: center;
  }
  .group { display: flex; gap: 4px; flex-wrap: wrap; }
  .end { margin-inline-start: auto; }
  .tip {
    position: absolute;
    transform: translate(-50%, calc(-100% - 8px));
    background: var(--panel-solid);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 0.85rem;
    pointer-events: none;
    white-space: nowrap;
    text-align: center;
  }
  .tip.ok { border-color: var(--good); }
  .tip.warn { border-color: var(--warn); }
  .tip.bad { border-color: var(--bad); }
  .log {
    position: absolute;
    inset-inline-end: max(8px, env(safe-area-inset-right));
    inset-block-start: 70px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.8rem;
    max-width: min(320px, 44vw);
    text-align: end;
    pointer-events: none;
  }
  .log li { background: rgb(0 0 0 / 0.5); padding: 2px 6px; border-radius: 4px; margin-bottom: 2px; }
  .inspect { position: absolute; inset-block-end: 90px; inset-inline-start: 50%; transform: translateX(-50%); padding: 10px; }
  .cover { position: absolute; inset: 0; background: rgb(5 8 12 / 0.92); display: grid; place-items: center; z-index: 10; }
  /* Hotseat: nothing of the previous player's board may show through. */
  .cover.opaque { background: var(--bg); }
  .card { padding: 24px; max-width: min(480px, 92vw); text-align: center; display: grid; gap: 12px; }
  .row { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
  .controls { text-align: start; white-space: pre-line; padding-inline-start: 1em; }
  .group small { margin-inline-start: 4px; color: var(--muted); }
  /* Landscape phones: keep the board visible. */
  @media (max-height: 520px) {
    .top { padding: 2px 6px; font-size: 0.85rem; }
    .top button { min-height: 36px; min-width: 36px; }
    .unit { inset-block-start: 52px; width: 190px; padding: 6px 8px; font-size: 0.8rem; }
    .coach { display: none; }
    .log { inset-block-start: 52px; }
    .actions { padding: 4px; gap: 4px; }
    .actions button { padding-inline: 10px; }
  }
  @media (max-width: 640px) {
    .unit { inset-block-start: auto; inset-block-end: 150px; }
    .log { display: none; }
  }
</style>
