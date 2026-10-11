import { createMemory, nextCommand, type AiMemory } from '@sp/ai';
import { Match, type Command, type CommandResult, type GameEvent, type PlayerView, type Scenario, type SideId, type WeaponDef } from '@sp/engine';

/**
 * What the UI talks to. Local (hotseat/AI) and, later, network sessions implement this,
 * so the game screen never touches the authoritative Match directly.
 */
export interface Session {
  /** Side whose view is currently on screen. */
  readonly viewer: SideId;
  readonly view: PlayerView;
  readonly scenario: Scenario;
  submit(cmd: Command): CommandResult;
  /** Fired with the viewer's filtered events after each accepted command. */
  subscribe(fn: (u: SessionUpdate) => void): () => void;
  /** Hotseat: confirm the next player has the device. */
  acceptHandoff(): void;
  dispose(): void;
}

export type SessionUpdate =
  | { kind: 'events'; view: PlayerView; events: GameEvent[] }
  /** Screen must be hidden until the named side takes the device. */
  | { kind: 'handoff'; to: SideId }
  /** New viewer takes over; `backlog` holds what they witnessed during others' turns. */
  | { kind: 'viewer'; view: PlayerView; backlog: GameEvent[] };

export interface LocalOptions {
  scenario: Scenario;
  weapons: Record<string, WeaponDef>;
  seed: number;
  /** Override per-side controller from the scenario (e.g. play both sides in hotseat). */
  controllers?: Record<SideId, 'human' | 'ai'>;
  aiStepMs?: number;
}

export class LocalSession implements Session {
  readonly match: Match;
  readonly scenario: Scenario;
  private controllers: Record<SideId, 'human' | 'ai'>;
  private listeners = new Set<(u: SessionUpdate) => void>();
  private backlog = new Map<SideId, GameEvent[]>();
  private memories = new Map<SideId, AiMemory>();
  private viewerSide: SideId;
  private pendingHandoff: SideId | null = null;
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private opts: LocalOptions) {
    this.scenario = opts.scenario;
    this.match = new Match(opts.scenario, opts.weapons, opts.seed);
    this.controllers = Object.fromEntries(
      opts.scenario.sides.map((s) => [s.id, opts.controllers?.[s.id] ?? s.controller]),
    );
    this.viewerSide = this.humans()[0] ?? opts.scenario.sides[0]!.id;
    this.match.subscribe((side, view, events) => this.route(side, view, events));
    queueMicrotask(() => this.afterCommand());
  }

  get viewer(): SideId {
    return this.viewerSide;
  }

  get view(): PlayerView {
    return this.match.view(this.viewerSide);
  }

  humans(): SideId[] {
    return this.scenario.sides.filter((s) => this.controllers[s.id] === 'human').map((s) => s.id);
  }

  subscribe(fn: (u: SessionUpdate) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  submit(input: Command): CommandResult {
    // Copy across the boundary exactly like a network transport would.
    const cmd = JSON.parse(JSON.stringify(input)) as Command;
    if (this.pendingHandoff) return { ok: false, error: 'notYourTurn' };
    if (this.controllers[cmd.side] !== 'human') return { ok: false, error: 'notYourTurn' };
    const r = this.match.submit(cmd);
    if (r.ok) this.afterCommand();
    return r;
  }

  acceptHandoff(): void {
    const to = this.pendingHandoff;
    if (!to) return;
    this.pendingHandoff = null;
    this.viewerSide = to;
    const backlog = this.backlog.get(to) ?? [];
    this.backlog.set(to, []);
    this.emit({ kind: 'viewer', view: this.match.view(to), backlog });
  }

  dispose(): void {
    this.disposed = true;
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.listeners.clear();
  }

  private route(side: SideId, view: PlayerView, events: GameEvent[]): void {
    if (side === this.viewerSide && !this.pendingHandoff) {
      this.emit({ kind: 'events', view, events });
    } else if (this.controllers[side] === 'human') {
      this.backlog.set(side, [...(this.backlog.get(side) ?? []), ...events]);
    }
  }

  private afterCommand(): void {
    if (this.disposed) return;
    const s = this.match.state;
    if (s.over) return;
    if (this.controllers[s.activeSide] === 'ai') {
      this.scheduleAi();
      return;
    }
    // Hotseat: a different human must take the device before seeing anything.
    if (s.activeSide !== this.viewerSide) {
      if (this.humans().length > 1) {
        this.pendingHandoff = s.activeSide;
        this.emit({ kind: 'handoff', to: s.activeSide });
      } else {
        this.pendingHandoff = s.activeSide;
        this.acceptHandoff();
      }
    }
  }

  private scheduleAi(): void {
    if (this.aiTimer) return;
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      if (this.disposed) return;
      const side = this.match.state.activeSide;
      const mem = this.memories.get(side) ?? createMemory();
      this.memories.set(side, mem);
      const cmd = nextCommand(this.match.view(side), mem);
      const r = this.match.submit(cmd);
      if (!r.ok) this.match.submit({ type: 'endTurn', side }); // never stall on an AI bug
      this.afterCommand();
    }, this.opts.aiStepMs ?? 250);
  }

  private emit(u: SessionUpdate): void {
    for (const fn of this.listeners) fn(u);
  }
}
