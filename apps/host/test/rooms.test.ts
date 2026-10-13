import { expect, it } from 'vitest';
import { parseScenario, type Match } from '@sp/engine';
import { SCENARIOS, WEAPONS } from '@sp/content';
import { Rooms, type Peer } from '../src/rooms';
import type { ServerBody } from '@sp/net';

function peer() {
  const messages: ServerBody[] = [];
  const socket: Peer = { send: (m) => messages.push(structuredClone(m)), close() {} };
  return { socket, messages };
}

it('redacts a hidden enemy shot origin and exposes no raw acknowledgement events', () => {
  const scenario = parseScenario({
    format: 'squad-protocol/scenario', version: 1, id: 'privacy', titleKey: 'privacy', briefingKey: 'privacy',
    map: ['..........'], sides: [{ id: 'blue', nameKey: 'blue' }, { id: 'red', nameKey: 'red' }],
    units: [
      { id: 'hidden-blue', side: 'blue', nameKey: 'blue', x: 0, y: 0, facing: 2, template: { maxAp: 50, maxHp: 100, armor: 0, accuracy: 80 }, weaponId: 'pulseRifle' },
      { id: 'red', side: 'red', nameKey: 'red', x: 5, y: 0, facing: 2, template: { maxAp: 50, maxHp: 100, armor: 0, accuracy: 80 }, weaponId: 'pulseRifle' },
    ],
  });
  const rooms = new Rooms(scenario, WEAPONS, () => 0, () => 1);
  const blue = peer(); const red = peer();
  rooms.handle(blue.socket, { version: 1, kind: 'create' });
  const room = blue.messages.find((m) => m.kind === 'room')!;
  if (room.kind !== 'room') throw new Error('No room');
  rooms.handle(red.socket, { version: 1, kind: 'join', room: room.room });
  rooms.handle(blue.socket, { version: 1, kind: 'start' });
  rooms.handle(blue.socket, { version: 1, kind: 'command', requestId: 'shot', revision: 0, command: { type: 'fire', side: 'blue', unitId: 'hidden-blue', target: { x: 5, y: 0 }, mode: 'snap' } });
  const update = red.messages.find((m) => m.kind === 'update');
  expect(update?.kind).toBe('update');
  if (update?.kind !== 'update') return;
  expect(update.view.units.map((u) => u.id)).not.toContain('hidden-blue');
  const shot = update.events.find((e) => e.type === 'shotFired');
  expect(shot).toMatchObject({ unitId: '', seenBy: ['red'] });
  expect(shot).not.toHaveProperty('originSeenBy', ['blue']);
  expect(blue.messages.find((m) => m.kind === 'result')).not.toHaveProperty('events');
});

it('bounds rooms and releases disconnected rooms after thirty minutes', () => {
  let now = 0;
  const scenario = parseScenario({ format: 'squad-protocol/scenario', version: 1, id: 'tiny', titleKey: 'tiny', briefingKey: 'tiny', map: ['..'], sides: [{ id: 'blue', nameKey: 'blue' }, { id: 'red', nameKey: 'red' }], units: [] });
  const rooms = new Rooms(scenario, WEAPONS, () => now);
  for (let i = 0; i < 100; i++) { const p = peer(); rooms.handle(p.socket, { version: 1, kind: 'create' }); rooms.disconnect(p.socket); }
  const overflow = peer(); rooms.handle(overflow.socket, { version: 1, kind: 'create' });
  expect(overflow.messages.at(-1)).toEqual({ kind: 'error', code: 'capacity' });
  now = 30 * 60_000;
  rooms.handle(overflow.socket, { version: 1, kind: 'create' });
  expect(overflow.messages.at(-1)?.kind).toBe('room');
});

it('does not retain unbounded replay commands for a hosted match', () => {
  const rooms = new Rooms(SCENARIOS.kestrel!, WEAPONS);
  const blue = peer(); const red = peer();
  rooms.handle(blue.socket, { version: 1, kind: 'create' });
  const info = blue.messages.find((m) => m.kind === 'room');
  if (info?.kind !== 'room') throw new Error('No room');
  rooms.handle(red.socket, { version: 1, kind: 'join', room: info.room });
  rooms.handle(blue.socket, { version: 1, kind: 'start' });
  const snapshot = blue.messages.find((m) => m.kind === 'snapshot');
  if (snapshot?.kind !== 'snapshot') throw new Error('No snapshot');
  const unit = snapshot.view.units.find((u) => u.side === 'blue')!;
  for (let i = 0; i < 500; i++) {
    rooms.handle(blue.socket, { version: 1, kind: 'command', requestId: String(i), revision: i, command: { type: 'turn', side: 'blue', unitId: unit.id, facing: unit.facing } });
    expect(blue.messages.at(-1)).toMatchObject({ kind: 'result', ok: true });
  }
  // Inspect retention rather than add a host API exposing authoritative state.
  const internal = (rooms as unknown as { rooms: Map<string, { match: Match }> }).rooms.get(info.room)!;
  expect(internal.match.commands.length).toBe(0);
  expect(internal.match.view('blue').turn).toBe(1);
});
