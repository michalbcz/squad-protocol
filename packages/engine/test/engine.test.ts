import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, findPath, hashState, hasLineOfSight, Match, viewFor } from '../src';
import { scenario, WEAPONS } from './helpers';

const OPEN = ['..........', '..........', '..........', '..........', '..........'];

describe('movement', () => {
  it('charges AP for steps and turning', () => {
    const g = createGame(scenario(OPEN, [{ id: 'a1', side: 'a', x: 0, y: 0, facing: 2 }, { id: 'b1', side: 'b', x: 9, y: 4, facing: 0 }]), WEAPONS, 1);
    const path = findPath(g, g.units[0]!, { x: 3, y: 0 })!;
    expect(path.cost).toBe(6);
    const down = findPath(g, g.units[0]!, { x: 0, y: 2 })!;
    expect(down.cost).toBe(2 + 2 + 2); // turn 90° (2 AP) + two steps
  });

  it('rejects paths through walls and refuses corner cutting', () => {
    const map = ['.#.', '...', '...'];
    const g = createGame(scenario(map, [{ id: 'a1', side: 'a', x: 0, y: 0, facing: 2 }, { id: 'b1', side: 'b', x: 2, y: 2 }]), WEAPONS, 1);
    const { result } = applyCommand(g, { type: 'move', side: 'a', unitId: 'a1', path: [{ x: 1, y: 0 }] });
    expect(result).toEqual({ ok: false, error: 'invalidPath' });
    const diag = applyCommand(g, { type: 'move', side: 'a', unitId: 'a1', path: [{ x: 1, y: 1 }] });
    expect(diag.result).toEqual({ ok: false, error: 'invalidPath' });
  });

  it('opens doors when walking through them', () => {
    const map = ['.D.'];
    const g = createGame(scenario(map, [{ id: 'a1', side: 'a', x: 0, y: 0, facing: 2 }, { id: 'b1', side: 'b', x: 2, y: 0, facing: 6 }]), WEAPONS, 1);
    const path = findPath(g, g.units[0]!, { x: 1, y: 0 })!;
    const { state, result } = applyCommand(g, { type: 'move', side: 'a', unitId: 'a1', path: path.path });
    expect(result.ok).toBe(true);
    expect(state.map.tiles[1]!.doorOpen).toBe(true);
  });

  it('does not allow walking onto friends', () => {
    const g = createGame(scenario(OPEN, [{ id: 'a1', side: 'a', x: 0, y: 0, facing: 2 }, { id: 'a2', side: 'a', x: 1, y: 0 }, { id: 'b1', side: 'b', x: 9, y: 4 }]), WEAPONS, 1);
    const { result } = applyCommand(g, { type: 'move', side: 'a', unitId: 'a1', path: [{ x: 1, y: 0 }] });
    expect(result.ok).toBe(false);
  });
});

describe('line of sight and views', () => {
  const map = ['.....', '..#..', '.....'];
  it('walls block sight', () => {
    const g = createGame(scenario(map, [{ id: 'a1', side: 'a', x: 0, y: 1 }, { id: 'b1', side: 'b', x: 4, y: 1 }]), WEAPONS, 1);
    expect(hasLineOfSight(g.map, { x: 0, y: 1 }, { x: 4, y: 1 })).toBe(false);
    expect(hasLineOfSight(g.map, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
  });

  it('player view never includes enemies outside line of sight', () => {
    const g = createGame(scenario(map, [{ id: 'a1', side: 'a', x: 0, y: 1, facing: 2 }, { id: 'b1', side: 'b', x: 4, y: 1, facing: 6 }]), WEAPONS, 1);
    expect(viewFor(g, 'a').units.map((u) => u.id)).toEqual(['a1']);
    const open = createGame(scenario(OPEN, [{ id: 'a1', side: 'a', x: 0, y: 2, facing: 2 }, { id: 'b1', side: 'b', x: 6, y: 2, facing: 6 }]), WEAPONS, 1);
    expect(viewFor(open, 'a').units.map((u) => u.id)).toEqual(['a1', 'b1']);
  });

  it('units do not see behind them', () => {
    const g = createGame(scenario(OPEN, [{ id: 'a1', side: 'a', x: 5, y: 2, facing: 2 }, { id: 'b1', side: 'b', x: 1, y: 2, facing: 2 }]), WEAPONS, 1);
    expect(viewFor(g, 'a').units.map((u) => u.id)).toEqual(['a1']);
  });
});

describe('combat', () => {
  it('a guaranteed hit deals damage and can kill', () => {
    const g = createGame(scenario(OPEN, [{ id: 'a1', side: 'a', x: 0, y: 2, facing: 2 }, { id: 'b1', side: 'b', x: 3, y: 2, facing: 6 }]), WEAPONS, 7);
    let s = g;
    for (let i = 0; i < 3; i++) {
      const r = applyCommand(s, { type: 'fire', side: 'a', unitId: 'a1', target: { x: 3, y: 2 }, mode: 'snap' });
      s = r.state;
    }
    const target = s.units.find((u) => u.id === 'b1')!;
    expect(target.hp).toBeLessThan(50);
    expect(s.units.find((u) => u.id === 'a1')!.ap).toBe(30 - 18);
  });

  it('shots into a wall damage and eventually destroy it', () => {
    const g = createGame(scenario(['..#..'], [{ id: 'a1', side: 'a', x: 0, y: 0, facing: 2 }, { id: 'b1', side: 'b', x: 4, y: 0, facing: 6 }]), WEAPONS, 3);
    g.units[0]!.ap = 100;
    let s = g;
    for (let i = 0; i < 2; i++) s = applyCommand(s, { type: 'fire', side: 'a', unitId: 'a1', target: { x: 2, y: 0 }, mode: 'snap' }).state;
    expect(s.map.tiles[2]!.feature).toBeUndefined();
    expect(s.map.tiles[2]!.terrain).toBe('rubble');
  });

  it('cannot act out of turn', () => {
    const g = createGame(scenario(OPEN, [{ id: 'a1', side: 'a', x: 0, y: 0 }, { id: 'b1', side: 'b', x: 9, y: 4 }]), WEAPONS, 1);
    expect(applyCommand(g, { type: 'endTurn', side: 'b' }).result).toEqual({ ok: false, error: 'notYourTurn' });
  });

  it('reaction fire triggers on a mover entering view of a unit with saved AP', () => {
    const g = createGame(scenario(['..........'], [{ id: 'a1', side: 'a', x: 0, y: 0, facing: 2 }, { id: 'b1', side: 'b', x: 9, y: 0, facing: 6 }]), WEAPONS, 11);
    g.units[1]!.ap = 30; // full reserve => always reacts
    const path = findPath(g, g.units[0]!, { x: 3, y: 0 }, () => false)!;
    const { result } = applyCommand(g, { type: 'move', side: 'a', unitId: 'a1', path: path.path });
    expect(result.ok && result.events.some((e) => e.type === 'shotFired' && e.reaction)).toBe(true);
  });

  it('eliminating the last enemy ends the game', () => {
    const g = createGame(scenario(OPEN, [{ id: 'a1', side: 'a', x: 0, y: 2, facing: 2 }, { id: 'b1', side: 'b', x: 2, y: 2, facing: 6 }]), WEAPONS, 5);
    g.units[0]!.ap = 1000;
    g.units[1]!.hp = 1;
    let s = g;
    for (let i = 0; i < 20 && !s.over; i++) s = applyCommand(s, { type: 'fire', side: 'a', unitId: 'a1', target: { x: 2, y: 2 }, mode: 'snap' }).state;
    expect(s.over).toBe(true);
    expect(s.winner).toBe('a');
  });
});

describe('determinism', () => {
  it('replaying a command log reproduces the identical state', () => {
    const sc = scenario(OPEN, [{ id: 'a1', side: 'a', x: 0, y: 2, facing: 2 }, { id: 'b1', side: 'b', x: 7, y: 2, facing: 6 }]);
    const m = new Match(sc, WEAPONS, 1234);
    m.submit({ type: 'fire', side: 'a', unitId: 'a1', target: { x: 7, y: 2 }, mode: 'auto' });
    m.submit({ type: 'endTurn', side: 'a' });
    m.submit({ type: 'fire', side: 'b', unitId: 'b1', target: { x: 0, y: 2 }, mode: 'aimed' });
    const again = Match.fromReplay(JSON.parse(JSON.stringify(m.toReplay())));
    expect(hashState(again.state)).toBe(hashState(m.state));
  });

  it('rejected commands do not mutate state', () => {
    const g = createGame(scenario(OPEN, [{ id: 'a1', side: 'a', x: 0, y: 0 }, { id: 'b1', side: 'b', x: 9, y: 4 }]), WEAPONS, 1);
    const before = hashState(g);
    applyCommand(g, { type: 'move', side: 'a', unitId: 'a1', path: [{ x: 5, y: 5 }] });
    expect(hashState(g)).toBe(before);
  });
});

describe('event redaction', () => {
  it('a shot from a hidden shooter does not reveal its position or identity', () => {
    // a1 hides behind the wall column; b1 sees the wall's far side but not a1.
    const map = ['..#.......', '..#.......', '..........'];
    const sc = scenario(map, [
      { id: 'a1', side: 'a', x: 0, y: 0, facing: 2 },
      { id: 'b1', side: 'b', x: 6, y: 2, facing: 6 },
    ]);
    const m = new Match(sc, WEAPONS, 9);
    const seen: Record<string, import('../src').GameEvent[]> = {};
    m.subscribe((side, _v, events) => (seen[side] = events));
    // a1 shoots at the wall: b1 can see the wall face but not a1.
    const r = m.submit({ type: 'fire', side: 'a', unitId: 'a1', target: { x: 2, y: 0 }, mode: 'snap' });
    expect(r.ok).toBe(true);
    for (const e of seen.b ?? []) {
      expect(JSON.stringify(e)).not.toContain('"a1"');
      if (e.type === 'shotFired') expect(e.from).toEqual(e.impact);
    }
    expect(seen.b!.some((e) => e.type === 'shotFired')).toBe(true);
    expect(seen.a!.some((e) => e.type === 'shotFired' && e.unitId === 'a1')).toBe(true);
  });

  it('views hide enemy AP', () => {
    const g = createGame(scenario(OPEN, [{ id: 'a1', side: 'a', x: 0, y: 2, facing: 2 }, { id: 'b1', side: 'b', x: 6, y: 2, facing: 6 }]), WEAPONS, 1);
    g.units[1]!.ap = 30;
    expect(viewFor(g, 'a').units.find((u) => u.id === 'b1')!.ap).toBe(0);
  });
});
