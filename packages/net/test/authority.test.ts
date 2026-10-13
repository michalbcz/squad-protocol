import { expect, it } from 'vitest';
import { parseScenario } from '@sp/engine';
import { Rooms } from '../src/authority';
import { LoopbackTransport } from '../src/loopback';
import { MultiplayerClient } from '../src/client';
import type { ServerBody } from '../src/protocol';

it('runs browser-host authority through private loopback views and rejects forged identity', async () => {
  const scenario = parseScenario({ format: 'squad-protocol/scenario', version: 1, id: 'browser', titleKey: 'browser', briefingKey: 'browser', map: ['..........'], sides: [{ id: 'blue', nameKey: 'blue' }, { id: 'red', nameKey: 'red' }], units: [
    { id: 'blue-unit', side: 'blue', nameKey: 'blue', x: 0, y: 0, facing: 6, weaponId: 'test', template: { maxAp: 30, maxHp: 40, accuracy: 60, armor: 0 } },
    { id: 'red-unit', side: 'red', nameKey: 'red', x: 9, y: 0, facing: 2, weaponId: 'test', template: { maxAp: 30, maxHp: 40, accuracy: 60, armor: 0 } },
  ] });
  const rooms = new Rooms(scenario, { test: { id: 'test', nameKey: 'test', range: 10, damage: [1, 2], ap: { snap: 5, aimed: 8, auto: null }, accuracy: { snap: 1, aimed: 1, auto: 1 }, autoShots: 1 } });
  const blue = new MultiplayerClient('http://localhost', undefined, () => new LoopbackTransport(rooms));
  const red = new MultiplayerClient('http://localhost', undefined, () => new LoopbackTransport(rooms));
  try {
    await expect.poll(() => blue.status).toBe('connected'); blue.create();
    await expect.poll(() => blue.room?.room).toBeTruthy(); red.join(blue.room!.room);
    await expect.poll(() => blue.room?.players.length).toBe(2); blue.start();
    await expect.poll(() => !!blue.snapshot && !!red.snapshot).toBe(true);
    expect(red.snapshot?.view.units.map((u) => u.id)).toEqual(['red-unit']);
    expect(red.snapshot?.scenario).not.toHaveProperty('units');
    expect(await red.submit({ type: 'endTurn', side: 'blue' })).toEqual({ ok: false, error: 'notYourTurn' });
    expect(await blue.submit({ type: 'endTurn', side: 'blue' })).toEqual({ ok: true, events: [] });
    blue.leave(); await expect.poll(() => red.status).toBe('closed');
  } finally { blue.dispose(); red.dispose(); }
});

it('allows the same authenticated peer to refresh its snapshot without replacing its seat', () => {
  const scenario = parseScenario({ format: 'squad-protocol/scenario', version: 1, id: 'resume', titleKey: 'resume', briefingKey: 'resume', map: ['..'], sides: [{ id: 'blue', nameKey: 'blue' }, { id: 'red', nameKey: 'red' }], units: [] });
  const rooms = new Rooms(scenario, {});
  const messages: ServerBody[] = [];
  const peer = { send: (m: ServerBody) => messages.push(m), close: () => { throw new Error('Must not replace same peer'); } };
  rooms.handle(peer, { version: 1, kind: 'create' });
  const first = messages[0]!;
  if (first.kind !== 'room') throw new Error('Expected room');
  rooms.handle(peer, { version: 1, kind: 'resume', room: first.room, token: first.token });
  expect(messages.at(-1)?.kind).toBe('room');
  expect(messages.some((m) => m.kind === 'error')).toBe(false);
  const credential = rooms.disconnect(peer);
  expect(credential).toEqual({ room: first.room, token: first.token });
  rooms.handle(peer, { version: 1, kind: 'resume', ...credential! });
  expect(messages.at(-1)?.kind).toBe('room');
});
