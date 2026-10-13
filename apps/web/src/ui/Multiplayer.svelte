<script lang="ts">
  import { createInputHub } from '@sp/input';
  import { MultiplayerClient, hostUrl, type ConnectionStatus, type NetError, type RoomInfo } from '@sp/net';
  import { onMount } from 'svelte';
  import { t, locale } from '../lib/i18n.svelte';
  import { NetSession } from '../lib/net-session';
  import { clearCredential, saveCredential, type SavedCredential } from '../lib/multiplayer-storage';
  import WebRtcLobby from './WebRtcLobby.svelte';

  let { invite, saved, onstart, onback }: { invite: string; saved: SavedCredential | null; onstart: (session: NetSession) => void; onback: () => void } = $props();
  let address = $state(location.origin);
  let code = $state('');
  let room = $state<RoomInfo | null>(null);
  let status = $state<ConnectionStatus>('disconnected');
  let error = $state<NetError | null>(null);
  let busy = $state(false);
  let root = $state<HTMLElement>(null!);
  let mode = $state<'choose' | 'server' | 'rtc'>('choose');
  let client = $state<MultiplayerClient | null>(null);
  let unsubscribe: (() => void) | null = null;
  let transferred = false;
  const connectedPlayers = $derived(room?.players.filter((p) => p.connected).length ?? 0);
  const creator = $derived(room?.side === room?.players[0]?.side);
  const inviteLink = $derived(room && client ? `${client.host}/?room=${room.room}` : '');

  function connect(resume?: SavedCredential) {
    unsubscribe?.();
    client?.dispose();
    error = null; busy = false; room = null;
    try {
      const host = hostUrl(address);
      if (location.protocol === 'https:' && new URL(host).protocol !== 'https:') throw new Error('Mixed content');
      if (host !== location.origin) {
        const target = new URL('/', host);
        if (new URLSearchParams(location.search).has('e2e')) target.searchParams.set('e2e', '');
        target.searchParams.set('multiplayer', 'server');
        if (code) target.searchParams.set('room', code.trim().toUpperCase());
        location.assign(target);
        return;
      }
      client = new MultiplayerClient(host, resume);
      status = client.status;
      unsubscribe = client.subscribe((message) => {
        if (message.kind === 'status') { status = message.status; if (status === 'disconnected') busy = false; }
        else if (message.kind === 'room') {
          room = message; busy = false; error = null;
          saveCredential({ version: 1, host: client!.host, room: message.room, token: message.token });
        } else if (message.kind === 'snapshot') {
          locale.addStrings(message.scenario.strings);
          transferred = true;
          onstart(new NetSession(client!));
        } else if (message.kind === 'error') {
          error = message.code; busy = false;
          if (message.code === 'roomNotFound' || message.code === 'invalidToken' || message.code === 'seatReplaced') { clearCredential(); room = null; }
        } else if (message.kind === 'closed') { clearCredential(); room = null; busy = false; error = 'roomNotFound'; }
      });
    } catch { client = null; status = 'disconnected'; error = 'invalidMessage'; }
  }
  function action(kind: 'create' | 'join' | 'start') {
    if (!client || status !== 'connected') return;
    busy = true; error = null;
    if (kind === 'create') client.create();
    else if (kind === 'join') client.join(code);
    else client.start();
  }
  function back() { clearCredential(); client?.leave(); onback(); }
  onMount(() => {
    address = saved?.host ?? location.origin;
    code = invite;
    if (invite || saved || new URLSearchParams(location.search).get('multiplayer') === 'server') { mode = 'server'; connect(saved ?? undefined); }
    const hub = createInputHub(window);
    hub.on((action) => {
      if (mode === 'rtc') return;
      if (action === 'cancel') back();
      if (action === 'confirm') {
        const focused = document.activeElement;
        if (focused instanceof HTMLButtonElement && root.contains(focused) && !focused.disabled) focused.click();
        else root.querySelector<HTMLButtonElement>('button[data-primary]:not(:disabled)')?.click();
      }
      if (action === 'cursorDown' || action === 'cursorUp') {
        const controls = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), input, a[href]')];
        const current = controls.indexOf(document.activeElement as HTMLElement);
        controls[(current + (action === 'cursorDown' ? 1 : -1) + controls.length) % controls.length]?.focus();
      }
    });
    return () => { hub.dispose(); unsubscribe?.(); if (!transferred) client?.leave(); };
  });
</script>

{#if mode === 'rtc'}
  <WebRtcLobby {onstart} onback={() => { mode = 'choose'; }} />
{:else}
<main class="multiplayer" bind:this={root}>
  <header><button onclick={back}>← {t('common.back')}</button><h1>{t('menu.multiplayer')}</h1></header>
  {#if mode === 'choose'}
    <section class="panel lobby">
      <button class="primary" data-primary onclick={() => mode = 'rtc'}>{t('rtc.browser')}</button>
      <p class="muted">{t('rtc.browserSub')}</p>
      <button onclick={() => { mode = 'server'; connect(); }}>{t('rtc.server')}</button>
      <p class="muted">{t('rtc.serverSub')}</p>
    </section>
  {:else if room}
    <section class="panel lobby">
      <h2>{t('net.room', { code: room.room })}</h2>
      <p>{t('net.side', { side: t(`side.${room.side}`) })}</p>
      <p role="status">{t('net.players', { count: connectedPlayers })}</p>
      <label>{t('net.invite')}<input aria-label={t('net.invite')} readonly value={inviteLink} onfocus={(e) => e.currentTarget.select()} /></label>
      <p class="muted">{t('net.share')}</p>
      {#if creator}
        <button class="primary" data-primary disabled={connectedPlayers !== 2 || status !== 'connected' || busy} onclick={() => action('start')}>{t('net.start')}</button>
      {:else}<p>{t('net.waitHost')}</p>{/if}
    </section>
  {:else}
    <section class="panel lobby">
      <p class="muted">{t('net.help')}</p>
      <label>{t('net.host')}<input type="url" bind:value={address} /></label>
      <button disabled={busy} onclick={() => connect()}>{t('net.connect')}</button>
      <p role="status">{t(`net.status.${status}`)}</p>
      <button class="primary" data-primary={code ? undefined : true} disabled={status !== 'connected' || busy} onclick={() => action('create')}>{t('net.create')}</button>
      <label>{t('net.code')}<input autocapitalize="characters" maxlength="8" bind:value={code} /></label>
      <button data-primary={code ? true : undefined} disabled={status !== 'connected' || busy || !/^[A-Z0-9]{8}$/i.test(code.trim())} onclick={() => action('join')}>{t('net.join')}</button>
    </section>
  {/if}
  {#if room && status !== 'connected'}<p role="status">{t(`net.status.${status}`)}</p>{/if}
  {#if status === 'disconnected' && room}<button data-primary onclick={() => client?.reconnect()}>{t('net.retry')}</button>{/if}
  {#if error}<p role="alert">{t(`error.${error}`)}</p>{/if}
</main>
{/if}

<style>
  .multiplayer { height: 100%; overflow-y: auto; padding: max(16px, env(safe-area-inset-top)) 16px 32px; max-width: 640px; margin: 0 auto; }
  header { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  h1 { font-size: 1.6rem; }
  h2, p { margin: 0; }
  .lobby { padding: 20px; display: grid; gap: 16px; }
  label { display: grid; gap: 6px; min-width: 0; }
  input { width: 100%; min-width: 0; padding: 10px; font: inherit; color: var(--text); background: var(--bg); border: 2px solid var(--line); min-height: var(--hit); }
  input:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  [role='alert'] { color: var(--bad); margin-block-start: 16px; }
</style>
