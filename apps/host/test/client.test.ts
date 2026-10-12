import { afterEach, expect, it } from 'vitest';
import { MultiplayerClient, WebSocketTransport, type SubmitResult } from '@sp/net';
import { createHost } from '../src/server';

const dispose: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const fn of dispose.splice(0).reverse()) await fn(); });
async function clients() {
  const host = createHost({ port: 0, hostname: '127.0.0.1' });
  const port = await host.listen(); dispose.push(() => host.close());
  const make = () => { const client = new MultiplayerClient(`http://127.0.0.1:${port}`); dispose.push(() => client.dispose()); return client; };
  const blue = make(); const red = make();
  await expect.poll(() => blue.status === 'connected' && red.status === 'connected').toBe(true);
  blue.create(); await expect.poll(() => blue.room?.room).toBeTruthy();
  red.join(blue.room!.room); await expect.poll(() => blue.room?.players.length).toBe(2);
  blue.start(); await expect.poll(() => !!blue.snapshot && !!red.snapshot).toBe(true);
  return { blue, red, make };
}

it('correlates asynchronous commands and receives only its own view', async () => {
  const { blue, red } = await clients();
  const result = await blue.submit({ type: 'endTurn', side: 'blue' });
  expect(result).toEqual({ ok: true, events: [] });
  await expect.poll(() => red.snapshot?.view.activeSide).toBe('red');
  expect(blue.snapshot?.view.side).toBe('blue');
  expect(await blue.submit({ type: 'endTurn', side: 'blue' })).toEqual({ ok: false, error: 'notYourTurn' });
});

it('resumes the same seat on a new client and closes the room for its opponent on leave', async () => {
  const { blue, red, make } = await clients();
  const credential = { room: red.room!.room, token: red.room!.token };
  red.dispose();
  await expect.poll(() => blue.room?.players.find((s) => s.side === 'red')?.connected).toBe(false);
  expect(await blue.submit({ type: 'endTurn', side: 'blue' })).toEqual({ ok: false, error: 'opponentDisconnected' });
  const resumed = make();
  await expect.poll(() => resumed.status).toBe('connected');
  resumed.resume(credential);
  await expect.poll(() => resumed.snapshot?.view.side).toBe('red');
  expect(await blue.submit({ type: 'endTurn', side: 'blue' })).toEqual({ ok: true, events: [] });
  resumed.leave();
  await expect.poll(() => blue.status).toBe('closed');
});

it('reports failed credentials instead of silently joining a different side', async () => {
  const { blue, make } = await clients();
  const stranger = make();
  await expect.poll(() => stranger.status).toBe('connected');
  stranger.resume({ room: blue.room!.room, token: 'x'.repeat(48) });
  await expect.poll(() => stranger.error).toBe('invalidToken');
  expect(stranger.snapshot).toBeNull(); expect(stranger.room).toBeNull();
});

it('strips browser persistence metadata before resuming a saved credential', async () => {
  const { blue, red } = await clients();
  const saved = { version: 1, host: blue.host, room: red.room!.room, token: red.room!.token };
  red.dispose();
  const resumed = new MultiplayerClient(blue.host, saved);
  dispose.push(() => resumed.dispose());
  await expect.poll(() => resumed.snapshot?.view.side).toBe('red');
  expect(resumed.error).toBeNull();
});

it('automatically reconnects and blocks commands until the resumed snapshot arrives', async () => {
  const { blue, red } = await clients();
  const credential = { room: red.room!.room, token: red.room!.token };
  red.dispose();
  const transports: WebSocketTransport[] = [];
  const resumed = new MultiplayerClient(blue.host, credential, (host) => {
    const transport = new WebSocketTransport(host); transports.push(transport); return transport;
  });
  dispose.push(() => resumed.dispose());
  await expect.poll(() => resumed.snapshot?.view.side).toBe('red');
  let duringAuthentication: Promise<SubmitResult> | null = null;
  resumed.subscribe((event) => {
    if (event.kind === 'status' && event.status === 'connected') duringAuthentication = resumed.submit({ type: 'endTurn', side: 'red' });
  });
  transports[0]!.close();
  await expect.poll(() => resumed.status).toBe('reconnecting');
  await expect.poll(() => transports.length, { timeout: 5000 }).toBe(2);
  await expect.poll(() => duringAuthentication).not.toBeNull();
  expect(await duringAuthentication).toEqual({ ok: false, error: 'disconnected' });
  await expect.poll(() => resumed.status).toBe('connected');
  expect(resumed.snapshot?.view.side).toBe('red');
});

it('stops recovery when the seat is resumed in another tab', async () => {
  const { blue, red } = await clients();
  const replacement = new MultiplayerClient(blue.host, { room: red.room!.room, token: red.room!.token });
  dispose.push(() => replacement.dispose());
  await expect.poll(() => replacement.snapshot?.view.side).toBe('red');
  await expect.poll(() => red.status).toBe('replaced');
  expect(red.error).toBe('seatReplaced');
  expect(await red.submit({ type: 'endTurn', side: 'red' })).toEqual({ ok: false, error: 'disconnected' });
  expect(await blue.submit({ type: 'endTurn', side: 'blue' })).toEqual({ ok: true, events: [] });
  await expect.poll(() => replacement.snapshot?.view.activeSide).toBe('red');
  expect(await replacement.submit({ type: 'endTurn', side: 'red' })).toEqual({ ok: true, events: [] });
});
