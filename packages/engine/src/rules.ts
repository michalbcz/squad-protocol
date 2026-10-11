import type { Command, CommandError, CommandResult, GameEvent, GameEventBody } from './commands';
import { canSee, distance, facingSteps, facingToward, inBounds, line, samePos, tileAt, unitAt } from './grid';
import { AP_TURN, stepCost } from './path';
import { nextRandom, randomInt } from './rng';
import type { FireMode, GameState, SideId, Unit, Vec } from './types';

class Ctx {
  events: GameEvent[] = [];
  constructor(readonly state: GameState) {}

  /** Sides that can currently see any of `at`; the acting side always sees its own actions. */
  witnesses(at: Vec[], always: SideId[] = []): SideId[] {
    const sides = new Set(always);
    for (const u of this.state.units) {
      if (!sides.has(u.side) && at.some((p) => canSee(this.state.map, u, p))) sides.add(u.side);
    }
    return [...sides];
  }

  emit(body: GameEventBody, at: Vec[], always: SideId[] = [], origin?: Vec): void {
    const ev = { ...body, seenBy: this.witnesses(at, always) } as GameEvent;
    if (origin) ev.originSeenBy = this.witnesses([origin], always);
    this.events.push(ev);
  }

  emitAll(body: GameEventBody): void {
    this.events.push({ ...body, seenBy: this.state.sides.map((s) => s.id) } as GameEvent);
  }
}

function fail(error: CommandError): CommandResult {
  return { ok: false, error };
}

/** Applies a command to a copy of the state. Never mutates `prev`. */
export function applyCommand(prev: GameState, cmd: Command): { state: GameState; result: CommandResult } {
  const state = structuredClone(prev);
  const result = run(state, cmd);
  return { state: result.ok ? state : prev, result };
}

function run(state: GameState, cmd: Command): CommandResult {
  if (state.over) return fail('gameOver');
  if (cmd.side !== state.activeSide) return fail('notYourTurn');
  const ctx = new Ctx(state);

  if (cmd.type === 'endTurn') {
    endTurn(ctx);
    return { ok: true, events: ctx.events };
  }

  const unit = state.units.find((u) => u.id === cmd.unitId);
  if (!unit) return fail('noSuchUnit');
  if (unit.side !== cmd.side) return fail('notYourUnit');
  if (!unit.alive) return fail('unitDead');

  let err: CommandError | null = null;
  switch (cmd.type) {
    case 'move':
      err = move(ctx, unit, cmd.path);
      break;
    case 'turn': {
      const cost = facingSteps(unit.facing, cmd.facing) * AP_TURN;
      if (cost > unit.ap) return fail('notEnoughAp');
      unit.ap -= cost;
      unit.facing = cmd.facing;
      ctx.emit({ type: 'unitTurned', unitId: unit.id, facing: unit.facing, ap: unit.ap }, [unit.pos], [unit.side]);
      break;
    }
    case 'fire':
      err = fire(ctx, unit, cmd.target, cmd.mode, false);
      break;
    case 'toggleDoor':
      err = toggleDoor(ctx, unit, cmd.at);
      break;
  }
  if (err) return fail(err);
  checkVictory(ctx);
  return { ok: true, events: ctx.events };
}

function visibleEnemies(state: GameState, unit: Unit): Set<string> {
  return new Set(state.units.filter((e) => e.alive && e.side !== unit.side && canSee(state.map, unit, e.pos)).map((e) => e.id));
}

function move(ctx: Ctx, unit: Unit, path: Vec[]): CommandError | null {
  const { state } = ctx;
  if (path.length === 0) return 'invalidPath';
  // Validate the whole path against what the mover could know: terrain plus friendly units.
  let pos = unit.pos;
  let facing = unit.facing;
  let total = 0;
  for (const p of path) {
    if (Math.max(Math.abs(p.x - pos.x), Math.abs(p.y - pos.y)) !== 1) return 'invalidPath';
    const step = stepCost(state, pos, p, facing);
    if (!step) return 'invalidPath';
    const other = unitAt(state, p);
    if (other && other.side === unit.side) return 'invalidPath';
    total += step.cost;
    pos = p;
    facing = step.facing;
  }
  if (total > unit.ap) return 'notEnoughAp';

  let seen = visibleEnemies(state, unit);
  for (const p of path) {
    // A hidden enemy blocks the way: stop and reveal.
    if (unitAt(state, p)) {
      ctx.emit({ type: 'movementInterrupted', unitId: unit.id, reason: 'spotted' }, [unit.pos], [unit.side]);
      return null;
    }
    const step = stepCost(state, unit.pos, p, unit.facing)!;
    const tile = tileAt(state.map, p)!;
    if (tile.feature === 'door' && !tile.doorOpen) {
      tile.doorOpen = true;
      ctx.emit({ type: 'doorToggled', at: p, open: true }, [p], [unit.side]);
    }
    const from = unit.pos;
    unit.ap -= step.cost;
    unit.pos = p;
    unit.facing = step.facing;
    ctx.emit({ type: 'unitMoved', unitId: unit.id, from, to: p, facing: unit.facing, ap: unit.ap }, [from, p], [unit.side], from);

    reactionFire(ctx, unit);
    if (!unit.alive) {
      ctx.emit({ type: 'movementInterrupted', unitId: unit.id, reason: 'killed' }, [unit.pos], [unit.side]);
      return null;
    }
    const now = visibleEnemies(state, unit);
    if ([...now].some((id) => !seen.has(id))) {
      ctx.emit({ type: 'movementInterrupted', unitId: unit.id, reason: 'spotted' }, [unit.pos], [unit.side]);
      return null;
    }
    seen = now;
  }
  return null;
}

/** Enemy units holding enough AP for a snap shot fire at a mover that enters their view. */
function reactionFire(ctx: Ctx, mover: Unit): void {
  const { state } = ctx;
  for (const watcher of state.units) {
    if (!mover.alive) return;
    if (!watcher.alive || watcher.side === mover.side) continue;
    const weapon = state.weapons[watcher.weaponId];
    const cost = weapon?.ap.snap;
    if (!weapon || cost == null || watcher.ap < cost) continue;
    if (distance(watcher.pos, mover.pos) > weapon.range) continue;
    if (!canSee(state.map, watcher, mover.pos)) continue;
    // Reaction chance scales with how much AP the watcher saved.
    if (nextRandom(state) * watcher.maxAp > watcher.ap) continue;
    fire(ctx, watcher, mover.pos, 'snap', true);
  }
}

export function hitChance(state: GameState, unit: Unit, target: Vec, mode: FireMode): number {
  const weapon = state.weapons[unit.weaponId];
  if (!weapon) return 0;
  const d = distance(unit.pos, target);
  const base = unit.accuracy * weapon.accuracy[mode] - Math.max(0, d - 3) * 3.5;
  return Math.max(5, Math.min(95, Math.round(base)));
}

export function fireCost(state: GameState, unit: Unit, target: Vec, mode: FireMode): number | null {
  const weapon = state.weapons[unit.weaponId];
  const shotAp = weapon?.ap[mode];
  if (shotAp == null) return null;
  return shotAp + facingSteps(unit.facing, facingToward(unit.pos, target)) * AP_TURN;
}

function fire(ctx: Ctx, unit: Unit, target: Vec, mode: FireMode, reaction: boolean): CommandError | null {
  const { state } = ctx;
  const weapon = state.weapons[unit.weaponId];
  if (!weapon) return 'modeUnavailable';
  if (!inBounds(state.map, target) || samePos(target, unit.pos)) return 'invalidTarget';
  const cost = fireCost(state, unit, target, mode);
  if (cost == null) return 'modeUnavailable';
  if (cost > unit.ap) return 'notEnoughAp';
  if (!reaction && !canSee(state.map, { ...unit, facing: facingToward(unit.pos, target) }, target)) return 'invalidTarget';

  unit.ap -= cost;
  const newFacing = facingToward(unit.pos, target);
  if (newFacing !== unit.facing) {
    unit.facing = newFacing;
    ctx.emit({ type: 'unitTurned', unitId: unit.id, facing: unit.facing, ap: unit.ap }, [unit.pos], [unit.side]);
  }

  const shots = mode === 'auto' ? weapon.autoShots : 1;
  for (let i = 0; i < shots; i++) {
    const chance = hitChance(state, unit, target, mode);
    const hit = nextRandom(state) * 100 < chance;
    const aim = hit
      ? target
      : { x: target.x + randomInt(state, -2, 2), y: target.y + randomInt(state, -2, 2) };
    resolveShot(ctx, unit, aim, weapon.range, weapon.damage, mode, reaction, hit);
  }
  return null;
}

function resolveShot(
  ctx: Ctx,
  shooter: Unit,
  aim: Vec,
  range: number,
  damage: [number, number],
  mode: FireMode,
  reaction: boolean,
  intendedHit: boolean,
): void {
  const { state } = ctx;
  // Extend the ray past the aim point so misses fly on until they hit something.
  const dx = aim.x - shooter.pos.x;
  const dy = aim.y - shooter.pos.y;
  const len = Math.hypot(dx, dy) || 1;
  const far = { x: Math.round(shooter.pos.x + (dx / len) * range), y: Math.round(shooter.pos.y + (dy / len) * range) };
  const ray = line(shooter.pos, intendedHit ? aim : far);

  let impact: Vec = ray[ray.length - 1]!;
  let victim: Unit | undefined;
  let featureHit = false;
  for (let i = 1; i < ray.length; i++) {
    const p = ray[i]!;
    const tile = tileAt(state.map, p);
    if (!tile) {
      impact = ray[i - 1]!;
      break;
    }
    const u = unitAt(state, p);
    if (u) {
      victim = u;
      impact = p;
      break;
    }
    if (tile.feature === 'wall' || tile.feature === 'crate' || tile.feature === 'window' || (tile.feature === 'door' && !tile.doorOpen)) {
      impact = p;
      featureHit = true;
      break;
    }
  }

  const witnessed = [shooter.pos, impact];
  ctx.emit(
    { type: 'shotFired', unitId: shooter.id, from: shooter.pos, to: aim, impact, mode, reaction, hit: victim !== undefined },
    witnessed,
    [shooter.side],
    shooter.pos,
  );

  const amount = randomInt(state, damage[0], damage[1]);
  if (victim) {
    const dealt = Math.max(0, amount - victim.armor);
    victim.hp = Math.max(0, victim.hp - dealt);
    ctx.emit({ type: 'unitDamaged', unitId: victim.id, amount: dealt, hp: victim.hp }, witnessed, [shooter.side, victim.side]);
    if (victim.hp === 0) {
      victim.alive = false;
      ctx.emit({ type: 'unitKilled', unitId: victim.id }, witnessed, [shooter.side, victim.side]);
    }
  } else if (featureHit) {
    const tile = tileAt(state.map, impact)!;
    tile.featureHp = (tile.featureHp ?? 0) - amount;
    if (tile.featureHp <= 0) {
      delete tile.feature;
      delete tile.featureHp;
      delete tile.doorOpen;
      tile.terrain = 'rubble';
      ctx.emit({ type: 'featureDestroyed', at: impact }, witnessed, [shooter.side]);
    } else {
      ctx.emit({ type: 'featureDamaged', at: impact, hp: tile.featureHp }, witnessed, [shooter.side]);
    }
  }
}

function toggleDoor(ctx: Ctx, unit: Unit, at: Vec): CommandError | null {
  const tile = tileAt(ctx.state.map, at);
  if (!tile || tile.feature !== 'door') return 'invalidTarget';
  if (Math.max(Math.abs(at.x - unit.pos.x), Math.abs(at.y - unit.pos.y)) !== 1) return 'notAdjacent';
  if (tile.doorOpen && unitAt(ctx.state, at)) return 'invalidTarget';
  if (unit.ap < 2) return 'notEnoughAp';
  unit.ap -= 2;
  tile.doorOpen = !tile.doorOpen;
  ctx.emit({ type: 'doorToggled', at, open: tile.doorOpen }, [at], [unit.side]);
  return null;
}

function endTurn(ctx: Ctx): void {
  const { state } = ctx;
  const idx = state.sides.findIndex((s) => s.id === state.activeSide);
  const next = (idx + 1) % state.sides.length;
  if (next === 0) state.turn += 1;
  state.activeSide = state.sides[next]!.id;
  // Outgoing side keeps leftover AP for reaction fire; incoming side refreshes.
  for (const u of state.units) if (u.side === state.activeSide && u.alive) u.ap = u.maxAp;
  ctx.emitAll({ type: 'turnStarted', side: state.activeSide, turn: state.turn });
  checkVictory(ctx);
}

function checkVictory(ctx: Ctx): void {
  const { state } = ctx;
  if (state.over) return;
  const alive = state.sides.filter((s) => state.units.some((u) => u.side === s.id && u.alive));
  let winner: SideId | null | undefined;
  for (const v of state.victory) {
    if (v.type === 'eliminate' && alive.length <= 1) winner = alive[0]?.id ?? null;
    if (v.type === 'turnLimit' && state.turn > v.turns) winner = v.winner;
    if (winner !== undefined) break;
  }
  if (winner === undefined) return;
  state.winner = winner;
  state.over = true;
  ctx.emitAll({ type: 'gameOver', winner });
}
