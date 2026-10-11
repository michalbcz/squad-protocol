import type { GameEvent } from './commands';
import { canSee } from './grid';
import type { GameState, SideId, Unit } from './types';

/** What one side is allowed to know. Never contains enemies outside its line of sight. */
export interface PlayerView {
  side: SideId;
  turn: number;
  activeSide: SideId;
  sides: GameState['sides'];
  map: GameState['map'];
  /** Per-tile visibility for `side`, row-major. */
  visible: boolean[];
  units: Unit[];
  weapons: GameState['weapons'];
  winner: SideId | null;
  over: boolean;
}

export function visibleTiles(state: GameState, side: SideId): boolean[] {
  const { width, height } = state.map;
  const out = new Array<boolean>(width * height).fill(false);
  const own = state.units.filter((u) => u.alive && u.side === side);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = { x, y };
      if (own.some((u) => canSee(state.map, u, p))) out[y * width + x] = true;
    }
  }
  return out;
}

export function viewFor(state: GameState, side: SideId): PlayerView {
  const visible = visibleTiles(state, side);
  const w = state.map.width;
  return structuredClone({
    side,
    turn: state.turn,
    activeSide: state.activeSide,
    sides: state.sides,
    map: state.map,
    visible,
    // Enemy AP is hidden: it would reveal who is holding reaction fire.
    units: state.units
      .filter((u) => u.side === side || (u.alive && visible[u.pos.y * w + u.pos.x]))
      .map((u) => (u.side === side ? u : { ...u, ap: 0 })),
    weapons: state.weapons,
    winner: state.winner,
    over: state.over,
  });
}

/**
 * Events as `side` may see them: unwitnessed events are dropped, and details the side
 * couldn't observe (hidden shooter, hidden start or end of a move, enemy AP) are redacted.
 */
export function eventsFor(events: GameEvent[], side: SideId, state?: GameState): GameEvent[] {
  const out: GameEvent[] = [];
  const own = (unitId: string) => state?.units.find((u) => u.id === unitId)?.side === side;
  for (const e of events) {
    if (!e.seenBy.includes(side)) continue;
    const sawOrigin = !e.originSeenBy || e.originSeenBy.includes(side);
    const base = { seenBy: [side] };
    if (e.type === 'unitMoved') {
      const mine = own(e.unitId);
      const sawEnd = mine || !state || state.units.some((u) => u.side === side && u.alive && canSee(state.map, u, e.to));
      // A unit leaving view only disappears; we never reveal where it went.
      if (!sawEnd && !mine) continue;
      out.push({ ...e, ...base, from: sawOrigin ? e.from : e.to, ap: mine ? e.ap : 0, originSeenBy: undefined });
    } else if (e.type === 'unitTurned') {
      out.push({ ...e, ...base, ap: own(e.unitId) ? e.ap : 0 });
    } else if (e.type === 'shotFired') {
      out.push(sawOrigin ? { ...e, ...base, originSeenBy: undefined } : { ...e, ...base, unitId: '', from: e.impact, to: e.impact, originSeenBy: undefined });
    } else {
      out.push({ ...e, ...base });
    }
  }
  return out;
}

/** Stable FNV-1a hash of the full state, for determinism checks and desync detection. */
export function hashState(state: GameState): string {
  const json = JSON.stringify(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Rebuilds a rules-compatible state from a view so pure helpers (pathing, hit chance) can run client-side. */
export function stateFromView(view: PlayerView): GameState {
  return {
    version: 1,
    rng: 0,
    turn: view.turn,
    activeSide: view.activeSide,
    sides: view.sides,
    map: view.map,
    units: view.units,
    weapons: view.weapons,
    victory: [],
    winner: view.winner,
    over: view.over,
  };
}
