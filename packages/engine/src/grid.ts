import { DIRS, type Facing, type GameMap, type GameState, type Tile, type Unit, type Vec } from './types';

export const VIEW_RANGE = 14;

export function inBounds(map: GameMap, p: Vec): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;
}

export function tileAt(map: GameMap, p: Vec): Tile | undefined {
  return inBounds(map, p) ? map.tiles[p.y * map.width + p.x] : undefined;
}

export function samePos(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

export function unitAt(state: GameState, p: Vec): Unit | undefined {
  return state.units.find((u) => u.alive && samePos(u.pos, p));
}

export function blocksMovement(tile: Tile | undefined): boolean {
  if (!tile || tile.terrain === 'void' || tile.terrain === 'water') return true;
  if (tile.feature === 'wall' || tile.feature === 'crate' || tile.feature === 'window') return true;
  return tile.feature === 'door' && !tile.doorOpen;
}

export function blocksSight(tile: Tile | undefined): boolean {
  if (!tile) return true;
  if (tile.feature === 'wall' || tile.feature === 'crate') return true;
  return tile.feature === 'door' && !tile.doorOpen;
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Facing that best points from `from` toward `to`. */
export function facingToward(from: Vec, to: Vec): Facing {
  const angle = Math.atan2(to.x - from.x, -(to.y - from.y));
  const octant = Math.round(angle / (Math.PI / 4));
  return (((octant % 8) + 8) % 8) as Facing;
}

/** Number of 45° steps between two facings (0..4). */
export function facingSteps(a: Facing, b: Facing): number {
  const d = Math.abs(a - b) % 8;
  return Math.min(d, 8 - d);
}

export function neighbor(p: Vec, f: Facing): Vec {
  const d = DIRS[f]!;
  return { x: p.x + d.x, y: p.y + d.y };
}

/** Bresenham line from a to b inclusive. */
export function line(a: Vec, b: Vec): Vec[] {
  const pts: Vec[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

/** True if nothing between a and b (exclusive of both ends) blocks sight. */
export function hasLineOfSight(map: GameMap, a: Vec, b: Vec): boolean {
  const pts = line(a, b);
  for (let i = 1; i < pts.length - 1; i++) {
    if (blocksSight(tileAt(map, pts[i]!))) return false;
  }
  return true;
}

/** Units see a 180° arc in front of them (plus their own and adjacent tiles). */
export function inViewArc(unit: Unit, p: Vec): boolean {
  if (Math.max(Math.abs(p.x - unit.pos.x), Math.abs(p.y - unit.pos.y)) <= 1) return true;
  const toward = facingToward(unit.pos, p);
  return facingSteps(unit.facing, toward) <= 2;
}

export function canSee(map: GameMap, unit: Unit, p: Vec): boolean {
  return unit.alive && distance(unit.pos, p) <= VIEW_RANGE && inViewArc(unit, p) && hasLineOfSight(map, unit.pos, p);
}
