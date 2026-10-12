import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ServerMessage } from '../../../packages/net/src/protocol';
import { createHost } from '../src/server';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });

async function setup() {
  const host = createHost({ port: 0, hostname: '127.0.0.1' });
  const port = await host.listen();
  cleanup.push(() => host.close());
  const connect = async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const packets: ServerMessage[] = [];
    socket.on('message', (data) => packets.push(JSON.parse(data.toString()) as ServerMessage));
    await new Promise<void>((resolve) => socket.once('open', resolve));
    cleanup.push(async () => { socket.terminate(); });
    return {
      socket, packets,
      send: (message: Record<string, unknown>) => socket.send(JSON.stringify({ version: 1, ...message })),
      async next<K extends ServerMessage['kind']>(kind: K): Promise<Extract<ServerMessage, { kind: K }>> {
        await expect.poll(() => packets.some((p) => p.kind === kind)).toBe(true);
        const i = packets.findIndex((p) => p.kind === kind);
        return packets.splice(i, 1)[0] as Extract<ServerMessage, { kind: K }>;
      },
    };
  };
  return { host, port, connect };
}

describe('authoritative WebSocket host', () => {
  it('plays two sides without serializing hidden state or scenario spawns', async () => {
    const { connect } = await setup();
    const blue = await connect(); blue.send({ kind: 'create' });
    const first = await blue.next('room');
    const red = await connect(); red.send({ kind: 'join', room: first.room });
    const second = await red.next('room');
    expect(second.side).toBe('red'); expect(second.token).not.toBe(first.token);
    const third = await connect(); third.send({ kind: 'join', room: first.room });
    expect((await third.next('error')).code).toBe('roomFull');
    blue.send({ kind: 'start' });
    const b = await blue.next('snapshot'); const r = await red.next('snapshot');
    expect(b.view.side).toBe('blue'); expect(r.view.side).toBe('red');
    expect(b.scenario).not.toHaveProperty('units');
    expect(b).not.toHaveProperty('seed'); expect(b).not.toHaveProperty('state');
    expect(b.view.units.every((u) => u.side === 'blue' || (b.view.visible[u.pos.y * b.view.map.width + u.pos.x] && u.ap === 0))).toBe(true);
    expect(b.view.units.some((u) => u.side === 'red')).toBe(false);
    red.send({ kind: 'command', requestId: 'forged', revision: 0, command: { type: 'endTurn', side: 'blue' } });
    expect((await red.next('result')).error).toBe('notYourTurn');
    red.send({ kind: 'command', requestId: 'wrong-turn', revision: 0, command: { type: 'endTurn', side: 'red' } });
    expect((await red.next('result')).error).toBe('notYourTurn');
    blue.send({ kind: 'command', requestId: 'one', revision: 0, command: { type: 'endTurn', side: 'blue' } });
    expect(await blue.next('result')).toMatchObject({ ok: true, requestId: 'one' });
    expect((await blue.next('update')).view.activeSide).toBe('red');
    const update = await red.next('update');
    expect(update.revision).toBe(1); expect(update).not.toHaveProperty('command');
    blue.send({ kind: 'command', requestId: 'one', revision: 0, command: { type: 'endTurn', side: 'blue' } });
    expect((await blue.next('result')).ok).toBe(true);
    expect((await blue.next('snapshot')).revision).toBe(1);
    red.send({ kind: 'command', requestId: 'stale', revision: 0, command: { type: 'endTurn', side: 'red' } });
    expect((await red.next('result')).error).toBe('stale');
    expect((await red.next('snapshot')).revision).toBe(1);
  });

  it('reserves disconnected seats, pauses commands, and resumes with a private token', async () => {
    const { connect } = await setup();
    const blue = await connect(); blue.send({ kind: 'create' }); const b = await blue.next('room');
    const red = await connect(); red.send({ kind: 'join', room: b.room }); const r = await red.next('room');
    blue.send({ kind: 'start' }); await blue.next('snapshot'); await red.next('snapshot');
    red.socket.close(); await new Promise<void>((resolve) => red.socket.once('close', resolve));
    await expect.poll(() => blue.packets.some((p) => p.kind === 'room' && p.players.some((s) => s.side === 'red' && !s.connected))).toBe(true);
    blue.send({ kind: 'command', requestId: 'paused', revision: 0, command: { type: 'endTurn', side: 'blue' } });
    expect((await blue.next('result')).error).toBe('opponentDisconnected');
    const stranger = await connect(); stranger.send({ kind: 'resume', room: b.room, token: b.token.slice(0, -1) + 'x' });
    expect((await stranger.next('error')).code).toBe('invalidToken');
    stranger.send({ kind: 'join', room: b.room }); expect((await stranger.next('error')).code).toBe('roomFull');
    const resumed = await connect(); resumed.send({ kind: 'resume', room: b.room, token: r.token });
    expect((await resumed.next('snapshot')).view.side).toBe('red');
    blue.send({ kind: 'command', requestId: 'live', revision: 0, command: { type: 'endTurn', side: 'blue' } });
    expect((await blue.next('result')).ok).toBe(true);
    resumed.send({ kind: 'leave' }); expect((await blue.next('closed')).reason).toBe('left');
  });

  it('rejects malformed/versioned messages and serves no files outside the build', async () => {
    const { connect, port } = await setup();
    const peer = await connect(); peer.socket.send('{');
    expect((await peer.next('error')).code).toBe('invalidMessage');
    peer.socket.send(JSON.stringify({ version: 99, kind: 'create' }));
    expect((await peer.next('error')).code).toBe('versionMismatch');
    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${port}/%2e%2e%2fpackage.json`)).status).toBe(403);
    expect((await fetch(`http://127.0.0.1:${port}/.env`)).status).toBe(404);
  });
});
