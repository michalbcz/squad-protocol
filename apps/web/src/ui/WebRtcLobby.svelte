<script lang="ts">
  import { onMount } from 'svelte';
  import { createInputHub } from '@sp/input';
  import { decodeSignal, type MultiplayerClient, type RoomInfo } from '@sp/net';
  import { BrowserPeer } from '../lib/browser-peer';
  import { NetSession } from '../lib/net-session';
  import { locale, t } from '../lib/i18n.svelte';

  let { onstart, onback }: { onstart: (session: NetSession) => void; onback: () => void } = $props();
  let role = $state<'host' | 'guest' | null>(null);
  let offer = $state(''); let answer = $state('');
  let friendOffer = $state(''); let friendAnswer = $state('');
  let busy = $state(false); let error = $state<string | null>(null);
  let accepted = $state(false);
  let room = $state<RoomInfo | null>(null);
  let relay = $state(false); let relayUrl = $state(''); let relayUser = $state(''); let relayPassword = $state('');
  let manager: BrowserPeer | null = null;
  let subscribed: MultiplayerClient | null = null;
  let unsubscribe: (() => void) | null = null;
  let transferred = false; let stopped = false;
  let root: HTMLElement;
  const connectedPlayers = $derived(room?.players.filter((p) => p.connected).length ?? 0);

  function sync() {
    if (stopped) return;
    if (manager?.failed) { error = 'rtc.failed'; busy = false; }
    const client = manager?.client;
    if (!client) return;
    room = client.status === 'closed' ? null : client.room;
    if (subscribed !== client) {
      unsubscribe?.(); subscribed = client;
      unsubscribe = client.subscribe((message) => {
        room = client.status === 'closed' ? null : client.room;
        if (message.kind === 'error') error = `error.${message.code}`;
        if (message.kind === 'closed') { error = 'rtc.failed'; busy = false; }
        if (message.kind === 'snapshot' && !transferred) {
          locale.addStrings(message.scenario.strings);
          transferred = true;
          onstart(new NetSession(client, () => manager?.dispose()));
        }
      });
    }
  }
  function config(): RTCConfiguration | undefined {
    if (!relay) return undefined;
    if (!/^turns?:[^\s]+$/.test(relayUrl.trim())) throw new Error('Invalid relay');
    return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: relayUrl.trim(), username: relayUser, credential: relayPassword }] };
  }
  function reset() {
    unsubscribe?.(); unsubscribe = null; subscribed = null;
    manager?.dispose(); manager = null;
    role = null; offer = ''; answer = ''; room = null; busy = false; error = null; accepted = false;
  }
  async function host() {
    if (busy) return;
    reset(); busy = true; role = 'host';
    try {
      manager = new BrowserPeer(config(), sync);
      const current = manager;
      const code = await current.host();
      if (stopped || manager !== current) return;
      offer = code; sync();
    } catch { if (!stopped) { error = 'rtc.failed'; manager?.dispose(); } }
    finally { if (!stopped) busy = false; }
  }
  async function join() {
    if (busy) return;
    try { decodeSignal(friendOffer, 'offer'); } catch { error = 'rtc.invalid'; return; }
    reset(); busy = true; role = 'guest';
    try {
      manager = new BrowserPeer(config(), sync);
      const current = manager;
      const code = await current.join(friendOffer);
      if (stopped || manager !== current) return;
      answer = code; sync();
    } catch { if (!stopped) { error = 'rtc.failed'; manager?.dispose(); } }
    finally { if (!stopped) busy = false; }
  }
  async function connectFriend() {
    if (busy || accepted || !manager) return;
    try { decodeSignal(friendAnswer, 'answer', room?.room); } catch { error = 'rtc.invalid'; return; }
    busy = true; error = null;
    try { await manager.accept(friendAnswer); accepted = true; }
    catch { error = 'rtc.failed'; }
    finally { busy = false; }
  }
  function back() { reset(); onback(); }
  onMount(() => {
    if (typeof RTCPeerConnection === 'undefined') error = 'rtc.unsupported';
    const hub = createInputHub(window);
    hub.on((action) => {
      if (action === 'cancel') back();
      if (action === 'confirm') {
        const focused = document.activeElement;
        if (focused instanceof HTMLButtonElement && root.contains(focused) && !focused.disabled) focused.click();
        else root.querySelector<HTMLButtonElement>('button[data-primary]:not(:disabled)')?.click();
      }
      if (action === 'cursorDown' || action === 'cursorUp') {
        const controls = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea')];
        const current = controls.indexOf(document.activeElement as HTMLElement);
        controls[(current + (action === 'cursorDown' ? 1 : -1) + controls.length) % controls.length]?.focus();
      }
    });
    return () => { stopped = true; hub.dispose(); unsubscribe?.(); if (!transferred) manager?.dispose(); };
  });
</script>

<main class="rtc" bind:this={root}>
  <header><button onclick={back}>← {t('common.back')}</button><h1>{t('rtc.title')}</h1></header>
  <p class="muted">{t('rtc.help')}</p>
  {#if room && connectedPlayers === 2}
    <section class="panel">
      <h2>{t('net.room', { code: room.room })}</h2>
      <p role="status">{t('net.players', { count: connectedPlayers })}</p>
      {#if role === 'host'}<button class="primary" data-primary disabled={busy} onclick={() => manager?.client?.start()}>{t('net.start')}</button>
      {:else}<p>{t('net.waitHost')}</p>{/if}
    </section>
  {:else}
    {#if !role}
      <section class="panel">
        <h2>{t('rtc.hostTitle')}</h2>
        <button class="primary" data-primary disabled={busy || error === 'rtc.unsupported'} onclick={host}>{t('rtc.host')}</button>
      </section>
      <section class="panel">
        <h2>{t('rtc.joinTitle')}</h2>
        <label>{t('rtc.friendOffer')}<textarea maxlength="71680" bind:value={friendOffer}></textarea></label>
        <button disabled={busy || !friendOffer.trim() || error === 'rtc.unsupported'} onclick={join}>{t('rtc.answerCreate')}</button>
      </section>
      <section class="panel relay">
        <label class="check"><input type="checkbox" bind:checked={relay} />{t('rtc.relay')}</label>
        {#if relay}
          <p class="muted">{t('rtc.relayHelp')}</p>
          <label>{t('rtc.relayUrl')}<input bind:value={relayUrl} autocomplete="off" /></label>
          <label>{t('rtc.relayUser')}<input bind:value={relayUser} autocomplete="off" /></label>
          <label>{t('rtc.relayPassword')}<input type="password" bind:value={relayPassword} autocomplete="off" /></label>
        {/if}
      </section>
    {:else if role === 'host'}
      <section class="panel">
        <p>{t('rtc.sendOffer')}</p>
        <label>{t('rtc.offer')}<textarea readonly value={offer} onfocus={(e) => e.currentTarget.select()}></textarea></label>
        <label>{t('rtc.friendAnswer')}<textarea maxlength="71680" bind:value={friendAnswer}></textarea></label>
        <button class="primary" data-primary disabled={busy || accepted || !offer || !friendAnswer.trim()} onclick={connectFriend}>{t('rtc.connect')}</button>
        {#if accepted}<p role="status">{t('rtc.connecting')}</p>{/if}
      </section>
    {:else}
      <section class="panel">
        <p>{t('rtc.sendAnswer')}</p>
        <label>{t('rtc.answer')}<textarea readonly value={answer} onfocus={(e) => e.currentTarget.select()}></textarea></label>
        <p role="status">{t('rtc.waitHost')}</p>
      </section>
    {/if}
    {#if role}<button disabled={busy} onclick={reset}>{t('rtc.reset')}</button>{/if}
  {/if}
  {#if busy}<p role="status">{t('rtc.preparing')}</p>{/if}
  {#if error}<p role="alert">{t(error)}</p>{/if}
</main>

<style>
  .rtc { height: 100%; overflow-y: auto; padding: max(16px, env(safe-area-inset-top)) 16px 32px; max-width: 680px; margin: 0 auto; }
  header { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  h1 { font-size: 1.6rem; } h2, p { margin: 0; }
  section { display: grid; gap: 16px; padding: 20px; margin-block: 16px; }
  label { display: grid; gap: 6px; min-width: 0; }
  input, textarea { width: 100%; min-width: 0; padding: 10px; font: inherit; color: var(--text); background: var(--bg); border: 2px solid var(--line); min-height: var(--hit); }
  textarea { height: 100px; resize: vertical; overflow-wrap: anywhere; font-size: 0.8rem; }
  input:focus-visible, textarea:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  .check { display: flex; align-items: center; } .check input { width: 24px; }
  [role='alert'] { color: var(--bad); margin-block-start: 16px; }
</style>
