import {
  canSee,
  facingToward,
  findPath,
  fireCost,
  hitChance,
  pathCosts,
  samePos,
  stateFromView,
  type Command,
  type CommandError,
  type FireMode,
  type GameEvent,
  type PlayerView,
  type Unit,
  type Vec,
} from '@sp/engine';
import type { Action } from '@sp/input';
import type { Board } from '../render/board';
import type { Session, SessionUpdate } from './session';

export type Mode = 'move' | FireMode;

export type Preview =
  | { kind: 'move'; to: Vec; path: Vec[]; costs: number[]; total: number }
  | { kind: 'fire'; target: Vec; chance: number; cost: number; mode: FireMode }
  | { kind: 'none'; to: Vec; reason: CommandError | 'noPath' | 'noLos' | 'outOfRange' };

/** Events the tutorial and HUD can react to. */
export type UiSignal =
  | { type: 'selected'; unitId: string }
  | { type: 'previewed'; kind: Preview['kind'] }
  | { type: 'mode'; mode: Mode }
  | { type: 'command'; command: Command; events: GameEvent[] }
  | { type: 'rejected'; error: CommandError }
  | { type: 'camera' };

export interface LogEntry {
  id: number;
  key: string;
  values: Record<string, string | number>;
}

/**
 * Turns raw input (tap, hover, semantic actions) into commands.
 * Touch: first tap previews, second tap on the same tile confirms.
 * Mouse: hover previews, click confirms. Keyboard/gamepad: move the cursor, confirm.
 */
export class GameController {
  view = $state<PlayerView>(null!);
  selectedId = $state<string | null>(null);
  mode = $state<Mode>('move');
  cursor = $state<Vec | null>(null);
  preview = $state<Preview | null>(null);
  busy = $state(false);
  handoffTo = $state<string | null>(null);
  log = $state<LogEntry[]>([]);
  inspect = $state<Unit | null>(null);
  /** Bumped when the camera moves so DOM tooltips can reposition. */
  cameraTick = $state(0);

  private logId = 0;
  /** Command in flight; local sessions deliver its events synchronously during submit. */
  private sent: Command | null = null;
  private signals = new Set<(s: UiSignal) => void>();
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private unsub: () => void;

  constructor(
    readonly session: Session,
    private board: Board,
  ) {
    this.view = session.view;
    this.autoSelect();
    this.unsub = session.subscribe((u) => this.onUpdate(u));
  }

  dispose(): void {
    this.unsub();
  }

  get selected(): Unit | undefined {
    return this.view.units.find((u) => u.id === this.selectedId);
  }

  get myTurn(): boolean {
    return this.view.activeSide === this.view.side && !this.view.over && !this.handoffTo;
  }

  get ownUnits(): Unit[] {
    return this.view.units.filter((u) => u.side === this.view.side && u.alive);
  }

  onSignal(fn: (s: UiSignal) => void): () => void {
    this.signals.add(fn);
    return () => this.signals.delete(fn);
  }

  // ---- input entry points -------------------------------------------------

  tap(tile: Vec, pointer: 'mouse' | 'touch'): void {
    if (!this.myTurn || this.busy) return;
    const own = this.ownUnits.find((u) => samePos(u.pos, tile));
    if (own && !(this.mode !== 'move' && own.id === this.selectedId)) {
      this.select(own.id);
      return;
    }
    const same = this.preview && 'to' in this.preview ? samePos(this.preview.to, tile) : this.preview?.kind === 'fire' && samePos(this.preview.target, tile);
    if (pointer === 'mouse' || same) {
      if (!same) this.previewAt(tile);
      this.confirm();
    } else {
      this.previewAt(tile);
    }
  }

  hover(tile: Vec | null): void {
    if (!this.myTurn || this.busy) return;
    this.cursor = tile;
    if (tile) this.previewAt(tile);
    else this.clearPreview();
    this.sync();
  }

  longPress(tile: Vec): void {
    this.inspect = this.view.units.find((u) => samePos(u.pos, tile) && u.alive) ?? null;
  }

  action(a: Action): void {
    if (a === 'zoomIn') return this.board.zoomBy(1.2);
    if (a === 'zoomOut') return this.board.zoomBy(1 / 1.2);
    if (this.handoffTo) {
      if (a === 'confirm') this.session.acceptHandoff();
      return;
    }
    if (!this.myTurn || this.busy) return;
    const moves: Partial<Record<Action, Vec>> = { cursorUp: { x: 0, y: -1 }, cursorDown: { x: 0, y: 1 }, cursorLeft: { x: -1, y: 0 }, cursorRight: { x: 1, y: 0 } };
    const d = moves[a];
    if (d) {
      const base = this.cursor ?? this.selected?.pos ?? { x: 0, y: 0 };
      const next = { x: clamp(base.x + d.x, 0, this.view.map.width - 1), y: clamp(base.y + d.y, 0, this.view.map.height - 1) };
      this.cursor = next;
      this.previewAt(next);
      this.board.centerOn(next);
      this.sync();
      return;
    }
    switch (a) {
      case 'confirm':
        if (this.cursor) {
          const own = this.ownUnits.find((u) => samePos(u.pos, this.cursor!));
          if (own && this.mode === 'move') this.select(own.id);
          else this.confirm();
        }
        break;
      case 'cancel':
        if (this.mode !== 'move') this.setMode('move');
        else this.clearPreview();
        this.inspect = null;
        break;
      case 'nextUnit':
      case 'prevUnit':
        this.cycle(a === 'nextUnit' ? 1 : -1);
        break;
      case 'fireSnap':
        this.setMode(this.mode === 'snap' ? 'move' : 'snap');
        break;
      case 'fireAimed':
        this.setMode(this.mode === 'aimed' ? 'move' : 'aimed');
        break;
      case 'fireAuto':
        this.setMode(this.mode === 'auto' ? 'move' : 'auto');
        break;
      case 'turnLeft':
      case 'turnRight':
        this.turn(a === 'turnLeft' ? -1 : 1);
        break;
      case 'toggleDoor':
        this.toggleNearestDoor();
        break;
      case 'endTurn':
        this.endTurn();
        break;
    }
  }

  // ---- commands -------------------------------------------------------------

  select(id: string): void {
    this.selectedId = id;
    this.setMode('move');
    const u = this.selected;
    if (u) {
      this.cursor = u.pos;
      this.board.centerOn(u.pos);
    }
    this.emit({ type: 'selected', unitId: id });
    this.sync();
  }

  setMode(m: Mode): void {
    const weapon = this.selected && this.view.weapons[this.selected.weaponId];
    if (m !== 'move' && weapon?.ap[m] == null) return;
    this.mode = m;
    if (this.cursor && this.selected && !samePos(this.cursor, this.selected.pos)) this.previewAt(this.cursor);
    else this.clearPreview();
    this.emit({ type: 'mode', mode: m });
    this.sync();
  }

  endTurn(): void {
    if (!this.myTurn || this.busy) return;
    this.send({ type: 'endTurn', side: this.view.side });
  }

  turn(dir: 1 | -1): void {
    const u = this.selected;
    if (!u) return;
    this.send({ type: 'turn', side: u.side, unitId: u.id, facing: ((u.facing + dir + 8) % 8) as Unit['facing'] });
  }

  toggleNearestDoor(): void {
    const u = this.selected;
    if (!u) return;
    const w = this.view.map.width;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const p = { x: u.pos.x + dx, y: u.pos.y + dy };
        if ((dx || dy) && this.view.map.tiles[p.y * w + p.x]?.feature === 'door') {
          this.send({ type: 'toggleDoor', side: u.side, unitId: u.id, at: p });
          return;
        }
      }
  }

  confirm(): void {
    const u = this.selected;
    const p = this.preview;
    if (!u || !p) return;
    if (p.kind === 'move') {
      const affordable = p.path.slice(0, p.costs.filter((c) => c <= u.ap).length);
      if (affordable.length === 0) return this.reject('notEnoughAp');
      this.send({ type: 'move', side: u.side, unitId: u.id, path: affordable });
    } else if (p.kind === 'fire') {
      this.send({ type: 'fire', side: u.side, unitId: u.id, target: p.target, mode: p.mode });
    } else {
      this.reject(p.reason === 'noPath' || p.reason === 'noLos' || p.reason === 'outOfRange' ? 'invalidTarget' : p.reason);
    }
  }

  private send(raw: Command): void {
    // Commands must be plain data: never let reactive proxies reach the engine.
    const cmd = $state.snapshot(raw) as Command;
    this.sent = cmd;
    const r = this.session.submit(cmd);
    this.sent = null;
    if (!r.ok) this.reject(r.error);
    // Successful results arrive through the session subscription.
  }

  private reject(error: CommandError): void {
    this.pushLog(`error.${error}`, {});
    this.emit({ type: 'rejected', error });
  }

  // ---- previews -------------------------------------------------------------

  private previewAt(tile: Vec): void {
    const u = this.selected;
    if (!u || samePos(u.pos, tile)) return this.clearPreview();
    const state = stateFromView(this.view);
    if (this.mode === 'move') {
      const known = (p: Vec) => this.view.units.some((o) => o.alive && o.side !== u.side && samePos(o.pos, p));
      const route = findPath(state, u, tile, known);
      const costs = route && pathCosts(state, u, route.path);
      this.preview = route && costs ? { kind: 'move', to: tile, path: route.path, costs, total: route.cost } : { kind: 'none', to: tile, reason: 'noPath' };
    } else {
      const weapon = this.view.weapons[u.weaponId]!;
      const facing = facingToward(u.pos, tile);
      const cost = fireCost(state, u, tile, this.mode);
      if (cost == null) this.preview = { kind: 'none', to: tile, reason: 'modeUnavailable' };
      else if (Math.hypot(tile.x - u.pos.x, tile.y - u.pos.y) > weapon.range) this.preview = { kind: 'none', to: tile, reason: 'outOfRange' };
      else if (!canSee(this.view.map, { ...u, facing }, tile)) this.preview = { kind: 'none', to: tile, reason: 'noLos' };
      else this.preview = { kind: 'fire', target: tile, chance: hitChance(state, u, tile, this.mode), cost, mode: this.mode };
    }
    this.cursor = tile;
    this.emit({ type: 'previewed', kind: this.preview.kind });
    this.sync();
  }

  private clearPreview(): void {
    this.preview = null;
    this.sync();
  }

  /** Push selection/preview to the renderer. */
  sync(): void {
    const p = this.preview;
    const u = this.selected;
    this.board.setSelection(this.selectedId, this.cursor, {
      path: p?.kind === 'move' ? p.path : undefined,
      costs: p?.kind === 'move' ? p.costs : undefined,
      affordable: u?.ap ?? 0,
      target: p?.kind === 'fire' ? p.target : undefined,
    });
  }

  // ---- session updates ------------------------------------------------------

  private onUpdate(u: SessionUpdate): void {
    const cmd = u.kind === 'events' ? this.sent : null;
    // Lock input synchronously; animations are serialized so rapid AI turns play in order.
    if (u.kind !== 'handoff') {
      this.pending++;
      this.busy = true;
    }
    this.queue = this.queue.then(async () => {
      if (u.kind === 'handoff') {
        this.handoffTo = u.to;
        this.preview = null;
        this.selectedId = null;
        this.cursor = null;
        this.inspect = null;
        // The outgoing player's log must not be shown to the incoming one.
        this.log = [];
        this.board.setSelection(null, null, {});
        return;
      }
      if (u.kind === 'viewer') {
        this.handoffTo = null;
        this.log = [];
        this.board.setView(u.view);
        this.view = u.view;
        this.summarize(u.backlog, true);
        await this.board.play(u.backlog.filter((e) => e.type === 'shotFired'), 2);
        this.autoSelect();
      } else {
        await this.board.play(u.events);
        this.view = u.view;
        this.board.setView(u.view);
        this.summarize(u.events, false);
        if (!this.selected?.alive) this.autoSelect();
        const last = u.events.at(-1);
        if (cmd) this.emit({ type: 'command', command: cmd, events: u.events });
        if (last?.type === 'turnStarted' && last.side === this.view.side) this.autoSelect();
        // Refresh the preview against the new state.
        if (this.cursor && this.myTurn) this.previewAt(this.cursor);
      }
      this.pending--;
      this.busy = this.pending > 0;
      this.sync();
    });
  }

  private autoSelect(): void {
    const first = this.ownUnits.find((u) => u.ap > 0) ?? this.ownUnits[0];
    this.selectedId = first?.id ?? null;
    this.mode = 'move';
    this.preview = null;
    if (first && this.myTurn) this.board.centerOn(first.pos);
    this.sync();
  }

  private cycle(dir: 1 | -1): void {
    const list = this.ownUnits;
    if (list.length === 0) return;
    const i = list.findIndex((u) => u.id === this.selectedId);
    this.select(list[(i + dir + list.length) % list.length]!.id);
  }

  private summarize(events: GameEvent[], backlog: boolean): void {
    const name = (id: string) => this.view.units.find((u) => u.id === id)?.nameKey ?? 'unit.unknown';
    for (const e of events) {
      if (e.type === 'unitKilled') this.pushLog('log.killed', { name: name(e.unitId) });
      else if (e.type === 'unitDamaged') this.pushLog('log.damaged', { name: name(e.unitId), amount: e.amount, hp: e.hp });
      else if (e.type === 'shotFired' && e.reaction) this.pushLog('log.reaction', { name: name(e.unitId) });
      else if (e.type === 'movementInterrupted' && e.reason === 'spotted') this.pushLog('log.spotted', { name: name(e.unitId) });
      else if (e.type === 'featureDestroyed') this.pushLog('log.destroyed', {});
      else if (e.type === 'turnStarted' && !backlog) this.pushLog('log.turnStarted', { side: this.view.sides.find((s) => s.id === e.side)?.nameKey ?? e.side, turn: e.turn });
    }
  }

  private pushLog(key: string, values: Record<string, string | number>): void {
    this.log = [...this.log.slice(-30), { id: ++this.logId, key, values }];
  }

  private emit(s: UiSignal): void {
    for (const fn of this.signals) fn(s);
  }

  cameraMoved(): void {
    this.cameraTick++;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
