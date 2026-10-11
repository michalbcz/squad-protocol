import { blocksMovement, facingSteps, facingToward, inBounds, tileAt, unitAt } from './grid';
import { DIRS, type Facing, type GameState, type Tile, type Unit, type Vec } from './types';

export const AP_STEP = 2;
export const AP_STEP_DIAGONAL = 3;
export const AP_TURN = 1;
export const AP_DOOR = 2;

function terrainExtra(tile: Tile): number {
  return tile.terrain === 'rubble' ? 2 : 0;
}

/** Closed doors are walkable for pathing purposes; stepping into one opens it for extra AP. */
function passable(tile: Tile | undefined): boolean {
  if (tile?.feature === 'door' && !tile.doorOpen) return tile.terrain !== 'void';
  return !blocksMovement(tile);
}

export function stepCost(state: GameState, from: Vec, to: Vec, facing: Facing): { cost: number; facing: Facing } | null {
  const tile = tileAt(state.map, to);
  if (!inBounds(state.map, to) || !tile || !passable(tile)) return null;
  const diagonal = from.x !== to.x && from.y !== to.y;
  if (diagonal) {
    // No corner cutting past walls.
    if (blocksMovement(tileAt(state.map, { x: to.x, y: from.y })) || blocksMovement(tileAt(state.map, { x: from.x, y: to.y }))) {
      return null;
    }
  }
  const nextFacing = facingToward(from, to);
  let cost = (diagonal ? AP_STEP_DIAGONAL : AP_STEP) + terrainExtra(tile) + facingSteps(facing, nextFacing) * AP_TURN;
  if (tile.feature === 'door' && !tile.doorOpen) cost += AP_DOOR;
  return { cost, facing: nextFacing };
}

export interface PathResult {
  path: Vec[];
  cost: number;
}

/**
 * A* over (tile, facing) so turning costs are exact. Returns path excluding the start tile.
 * Tiles occupied by any unit are impassable. Units of other sides are only avoided
 * if `knownBlockers` says so (players must not path around enemies they can't see).
 */
export function findPath(state: GameState, unit: Unit, goal: Vec, knownBlockers?: (p: Vec) => boolean): PathResult | null {
  const { width } = state.map;
  const key = (p: Vec, f: number) => (p.y * width + p.x) * 8 + f;
  const occupied = (p: Vec) => {
    const u = unitAt(state, p);
    if (!u || u.id === unit.id) return false;
    if (u.side === unit.side) return true;
    return knownBlockers ? knownBlockers(p) : true;
  };
  const h = (p: Vec) => {
    const dx = Math.abs(p.x - goal.x);
    const dy = Math.abs(p.y - goal.y);
    return Math.min(dx, dy) * AP_STEP_DIAGONAL + (Math.max(dx, dy) - Math.min(dx, dy)) * AP_STEP;
  };

  interface Node { p: Vec; f: Facing; g: number; score: number; parent: Node | null }
  const open: Node[] = [{ p: unit.pos, f: unit.facing, g: 0, score: h(unit.pos), parent: null }];
  const best = new Map<number, number>([[key(unit.pos, unit.facing), 0]]);

  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i]!.score < open[bi]!.score) bi = i;
    const cur = open.splice(bi, 1)[0]!;
    if (cur.p.x === goal.x && cur.p.y === goal.y) {
      const path: Vec[] = [];
      for (let n: Node | null = cur; n && n.parent; n = n.parent) path.unshift(n.p);
      return { path, cost: cur.g };
    }
    if (cur.g > (best.get(key(cur.p, cur.f)) ?? Infinity)) continue;
    for (const d of DIRS) {
      const np = { x: cur.p.x + d.x, y: cur.p.y + d.y };
      if (occupied(np)) continue;
      const step = stepCost(state, cur.p, np, cur.f);
      if (!step) continue;
      const g = cur.g + step.cost;
      const k = key(np, step.facing);
      if (g >= (best.get(k) ?? Infinity)) continue;
      best.set(k, g);
      open.push({ p: np, f: step.facing, g, score: g + h(np), parent: cur });
    }
  }
  return null;
}

/** Cumulative AP cost after each step of `path`, or null if a step is illegal. */
export function pathCosts(state: GameState, unit: Unit, path: Vec[]): number[] | null {
  const out: number[] = [];
  let pos = unit.pos;
  let facing = unit.facing;
  let total = 0;
  for (const p of path) {
    const s = stepCost(state, pos, p, facing);
    if (!s) return null;
    total += s.cost;
    out.push(total);
    pos = p;
    facing = s.facing;
  }
  return out;
}
