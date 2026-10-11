import {
  canSee,
  distance,
  facingToward,
  findPath,
  fireCost,
  hitChance,
  pathCosts,
  stateFromView,
  type Command,
  type FireMode,
  type GameState,
  type PlayerView,
  type Unit,
  type Vec,
} from '@sp/engine';

/** Persistent per-side memory so the AI can hunt enemies it saw earlier. */
export interface AiMemory {
  lastSeen: Record<string, Vec>;
  /** Units that have finished acting this turn. */
  done: string[];
  turn: number;
}

export function createMemory(): AiMemory {
  return { lastSeen: {}, done: [], turn: 0 };
}


const MODES: FireMode[] = ['aimed', 'snap', 'auto'];

/** Picks the next command for `view.side`. Call repeatedly until it returns endTurn. */
export function nextCommand(view: PlayerView, memory: AiMemory): Command {
  const side = view.side;
  if (memory.turn !== view.turn) {
    memory.turn = view.turn;
    memory.done = [];
  }
  // The AI only sees its PlayerView, never the full state.
  const state = stateFromView(view);
  const mine = view.units.filter((u) => u.side === side && u.alive && !memory.done.includes(u.id));
  const enemies = view.units.filter((u) => u.side !== side && u.alive);
  for (const e of enemies) memory.lastSeen[e.id] = e.pos;
  for (const id of Object.keys(memory.lastSeen)) {
    const known = view.units.find((u) => u.id === id);
    if (known && !known.alive) delete memory.lastSeen[id];
  }

  for (const unit of mine) {
    const shot = bestShot(state, unit, enemies);
    if (shot) return { type: 'fire', side, unitId: unit.id, target: shot.target, mode: shot.mode };

    const move = advance(state, unit, memory);
    if (move) return move;
    memory.done.push(unit.id);
  }
  return { type: 'endTurn', side };
}

function bestShot(state: GameState, unit: Unit, enemies: Unit[]): { target: Vec; mode: FireMode } | null {
  let best: { target: Vec; mode: FireMode; score: number } | null = null;
  const weapon = state.weapons[unit.weaponId];
  if (!weapon) return null;
  for (const e of enemies) {
    if (distance(unit.pos, e.pos) > weapon.range) continue;
    if (!canSee(state.map, { ...unit, facing: facingToward(unit.pos, e.pos) }, e.pos)) continue;
    for (const mode of MODES) {
      const cost = fireCost(state, unit, e.pos, mode);
      if (cost == null || cost > unit.ap) continue;
      const shots = mode === 'auto' ? weapon.autoShots : 1;
      const expected = (hitChance(state, unit, e.pos, mode) / 100) * shots * ((weapon.damage[0] + weapon.damage[1]) / 2);
      // Prefer finishing wounded targets and AP-efficient shots.
      const score = (expected / cost) * (1 + (1 - e.hp / e.maxHp));
      if (!best || score > best.score) best = { target: e.pos, mode, score };
    }
  }
  return best;
}


function advance(state: GameState, unit: Unit, memory: AiMemory): Command | null {
  const weapon = state.weapons[unit.weaponId];
  const reserve = weapon?.ap.snap ?? 0;
  const budget = unit.ap - reserve;
  if (budget < 2) return null;

  const targets = Object.values(memory.lastSeen);
  const goal = targets.sort((a, b) => distance(unit.pos, a) - distance(unit.pos, b))[0] ?? centreOf(state);
  if (distance(unit.pos, goal) < 1.5) return null;

  // Head toward the goal, truncating the path to what we can afford while keeping a reaction-fire reserve.
  const enemyKnown = (p: Vec) => state.units.some((u) => u.side !== unit.side && u.alive && u.pos.x === p.x && u.pos.y === p.y);
  const route = findPath(state, unit, goal, enemyKnown) ?? findNear(state, unit, goal, enemyKnown);
  if (!route || route.path.length === 0) return null;
  const affordable = truncate(state, unit, route.path, budget);
  if (affordable.length === 0) return null;
  return { type: 'move', side: unit.side, unitId: unit.id, path: affordable };
}

function findNear(state: GameState, unit: Unit, goal: Vec, blockers: (p: Vec) => boolean) {
  for (let r = 1; r <= 2; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const p = { x: goal.x + dx, y: goal.y + dy };
        if (p.x < 0 || p.y < 0 || p.x >= state.map.width || p.y >= state.map.height) continue;
        const res = findPath(state, unit, p, blockers);
        if (res) return res;
      }
    }
  }
  return null;
}

function truncate(state: GameState, unit: Unit, path: Vec[], budget: number): Vec[] {
  const costs = pathCosts(state, unit, path) ?? [];
  const n = costs.findIndex((c) => c > budget);
  return path.slice(0, n === -1 ? costs.length : n);
}

function centreOf(state: GameState): Vec {
  return { x: Math.floor(state.map.width / 2), y: Math.floor(state.map.height / 2) };
}
